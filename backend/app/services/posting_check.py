"""
Is a posting still up? Asks the job board's public API — free, no AI call.

Only boards whose API can say "this job doesn't exist" are checked: Greenhouse (including
company sites that embed it via ?gh_jid=), Lever, Ashby, Workday and Amazon. Anything else —
LinkedIn, custom career sites, pasted text with no link — is "unverified" rather than guessed at. A posting only
counts as removed when the job is gone but its board still answers, so a wrong slug or an
outage can't pass for a closed role.
"""
import re
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import httpx
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application, ApplicationStatus
from app.models.job import Job, Recommendation, ResumeMatchScore
from app.services.company_boards import SEED_COMPANIES

LISTED, REMOVED, UNVERIFIED = "listed", "removed", "unverified"

TIMEOUT = httpx.Timeout(15.0)
HEADERS = {"User-Agent": "OfferComing/1.0"}

_GREENHOUSE_PATH = re.compile(r"^/([^/]+)/jobs/(\d+)")
_UUID_PATH = re.compile(r"^/([^/]+)/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.IGNORECASE)
_AMAZON_PATH = re.compile(r"/jobs/(\d+)")
_WORKDAY_PATH = re.compile(r"^(?:/[a-z]{2}-[A-Z]{2})?/([^/]+)(/job/.+)$")
_GREENHOUSE_SLUGS = {c["name"].lower(): c["slug"] for c in SEED_COMPANIES if c["ats"] == "greenhouse"}
_GREENHOUSE_SLUG_SET = set(_GREENHOUSE_SLUGS.values())


def locate(url: str | None, company_name: str | None) -> tuple[str, str | None, str] | None:
    """(board type, board slug, posting id) for a link that can be checked, else None."""
    if not url:
        return None
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    query = parse_qs(parsed.query)

    if host.endswith("greenhouse.io"):
        if m := _GREENHOUSE_PATH.match(parsed.path):
            return "greenhouse", m.group(1), m.group(2)
        if query.get("for") and query.get("token"):  # boards.greenhouse.io/embed/job_app?for=x&token=1
            return "greenhouse", query["for"][0], query["token"][0]
    if host == "jobs.lever.co" and (m := _UUID_PATH.match(parsed.path)):
        return "lever", m.group(1), m.group(2)
    if host == "jobs.ashbyhq.com" and (m := _UUID_PATH.match(parsed.path)):
        return "ashby", m.group(1), m.group(2)
    if host.endswith("amazon.jobs") and (m := _AMAZON_PATH.search(parsed.path)):
        return "amazon", None, m.group(1)
    # nvidia.wd5.myworkdayjobs.com/[en-US/]NVIDIAExternalCareerSite/job/<...>
    if host.endswith("myworkdayjobs.com") and (m := _WORKDAY_PATH.match(parsed.path)):
        return "workday", f"{host}/{host.split('.')[0]}/{m.group(1)}", m.group(2)

    # Company career sites that embed a Greenhouse board: stripe.com/jobs/search?gh_jid=123.
    # The board is the company's, or the site's (Stripe's board also lists Bridge and Privy roles).
    gh_jid = (query.get("gh_jid") or [""])[0]
    site = host.split(".")[-2] if host.count(".") >= 1 else ""
    slug = _GREENHOUSE_SLUGS.get((company_name or "").strip().lower()) or (
        site if site in _GREENHOUSE_SLUG_SET else None
    )
    if gh_jid.isdigit() and slug:
        return "greenhouse", slug, gh_jid
    return None


async def _board_answers(client: httpx.AsyncClient, url: str) -> str:
    """REMOVED if the board itself still answers — the job is gone, not the board."""
    resp = await client.get(url)
    if resp.status_code == 200:
        return REMOVED
    raise LookupError(f"job board not found ({resp.status_code}) — the link may be wrong")


async def _check(client: httpx.AsyncClient, ats: str, slug: str | None, posting_id: str, ashby_boards: dict) -> str:
    if ats == "greenhouse":
        resp = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{posting_id}")
        if resp.status_code == 404:
            return await _board_answers(client, f"https://boards-api.greenhouse.io/v1/boards/{slug}")
    elif ats == "lever":
        resp = await client.get(f"https://api.lever.co/v0/postings/{slug}/{posting_id}")
        if resp.status_code == 404:
            return await _board_answers(client, f"https://api.lever.co/v0/postings/{slug}?limit=1")
    elif ats == "ashby":
        # No single-posting endpoint: read the board once per run and look the id up in it.
        if slug not in ashby_boards:
            board = await client.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
            board.raise_for_status()
            ashby_boards[slug] = {(j.get("id") or "").lower() for j in board.json().get("jobs", [])}
        return LISTED if posting_id.lower() in ashby_boards[slug] else REMOVED
    elif ats == "workday":  # slug is host/tenant/site, posting_id the /job/... path
        host, tenant, site = slug.split("/")
        base = f"https://{host}/wday/cxs/{tenant}/{site}"
        resp = await client.get(f"{base}{posting_id}")
        if resp.status_code == 404:
            board = await client.post(f"{base}/jobs", json={"appliedFacets": {}, "limit": 1, "offset": 0, "searchText": ""})
            if board.status_code == 200:
                return REMOVED
            raise LookupError(f"Workday site not found ({board.status_code}) — the link may be wrong")
    else:  # amazon: the job page itself 404s once the role is taken down
        resp = await client.get(f"https://www.amazon.jobs/en/jobs/{posting_id}")
        if resp.status_code == 404:
            return REMOVED
    resp.raise_for_status()
    return LISTED


async def check_job(client: httpx.AsyncClient, job: Job, ashby_boards: dict) -> str:
    """Update one job's posting fields. Returns its status, or "failed" when the check got no answer."""
    now = datetime.now(timezone.utc)
    where = locate(job.url, job.company_name)
    if where is None:
        host = urlparse(job.url).hostname if job.url else None
        job.posting_status = UNVERIFIED
        job.posting_checked_at = now
        job.posting_check_note = f"{host} can't be checked automatically" if host else "No posting link saved"
        return UNVERIFIED
    try:
        status = await _check(client, *where, ashby_boards)
    except Exception as e:
        # Keep the last real answer: one timeout shouldn't flip an open posting to closed.
        job.posting_check_note = f"Last check failed: {str(e) or type(e).__name__}"
        return "failed"
    job.posting_status = status
    job.posting_checked_at = now
    job.posting_check_note = None
    return status


async def verify_postings(jobs: list[Job]) -> dict:
    counts = {LISTED: 0, REMOVED: 0, UNVERIFIED: 0, "failed": 0}
    ashby_boards: dict[str, set[str]] = {}
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS, follow_redirects=True) as client:
        for job in jobs:
            counts[await check_job(client, job, ashby_boards)] += 1
    return counts


async def pipeline_jobs(db: AsyncSession) -> list[Job]:
    """Jobs still on the to-apply list: saved ones, plus unapplied ones scored apply or maybe."""
    result = await db.execute(
        select(Job)
        .join(ResumeMatchScore, ResumeMatchScore.job_id == Job.id)
        .outerjoin(Application, Application.job_id == Job.id)
        .where(ResumeMatchScore.is_auto_rejected.is_(False))
        .where(or_(
            Application.status == ApplicationStatus.saved,
            and_(
                Application.id.is_(None),
                ResumeMatchScore.recommendation.in_([Recommendation.apply, Recommendation.maybe]),
            ),
        ))
    )
    return list(result.scalars().all())
