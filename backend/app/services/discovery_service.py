"""
Daily discovery pipeline: poll each seeded company's public ATS job-board API,
keep postings whose title matches the user's target roles, and run them through
the normal scrape-free create_job_and_analyze pipeline (score + rank + extract).

Each run is recorded (discovery_runs) along with every board's scan state
(discovery_company_checks), so a missed day, a failed board or postings over the
per-run cap are picked up by the next run instead of silently aging out.
"""
import asyncio
import html
import itertools
import json
import re
from datetime import datetime, timedelta, timezone
import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.profile import profile
from app.models.discovery import DiscoveryCompanyCheck, DiscoveryRun
from app.models.job import Job, JobSource
from app.schemas.job import JobCreate
from app.services import job_service, posting_check
from app.services.company_boards import SEED_COMPANIES
from app.services.scorer import (
    DEFAULT_DIRECTION_KEYWORDS, ENGINEERING_TITLE_WORDS, GENERIC_TITLE_KEYWORDS, HARD_REJECT_YEARS,
    blocked_region, detect_region, location_parts, work_authorization_conflict,
)

TIMEOUT = httpx.Timeout(15.0)
MAX_NEW_PER_RUN = 25  # cap AI-parsing calls per run to keep cost/time bounded
FIRST_SCAN_LOOKBACK_DAYS = 7  # a board scanned for the first time looks back this far
MAX_LOOKBACK_DAYS = 14  # catching up after a long gap never reaches further back than this
# Each scan re-reads a little before where the last one stopped. Amazon dates are whole days,
# and re-reading costs nothing: postings already in the DB are skipped by URL.
SCAN_OVERLAP = timedelta(days=2)
STALE_RUN = timedelta(hours=2)  # a run still "running" after this was cut off, not still going
FETCH_CONCURRENCY = 8  # boards fetched at once; ~190 boards one at a time took minutes

# Default role focus (frontend / full-stack / AI) plus generic titles — most early-career openings
# are just "Software Engineer (I/II), <team>", so the scorer reads the JD to judge fit instead of the
# title being required to say "frontend". profile.role_keywords replaces it.
DEFAULT_TITLE_KEYWORDS = [*DEFAULT_DIRECTION_KEYWORDS, *GENERIC_TITLE_KEYWORDS]
TITLE_KEYWORDS = profile.role_keywords or DEFAULT_TITLE_KEYWORDS

# Engineering work off the target track even when the title says "software" — sales and support
# engineering, test, ops, mobile, hardware, data and research roles. profile.excluded_title_keywords
# replaces it.
DEFAULT_EXCLUDED_TITLE_KEYWORDS = [
    "sales engineer", "solutions engineer", "solutions architect", "support engineer",
    "customer engineer", "customer success", "technical account", "field engineer",
    "developer advocate", "developer relations", "curriculum", "value engineer",
    "operations engineer", "business systems", "data engineer", "analytics engineer",
    "test", "qa", "quality", "reliability", "sre", "devops",
    "security", "detection", "network engineer",
    "ios", "android", "mobile",
    "hardware", "firmware", "embedded", "mechanical", "electrical", "silicon", "asic", "fpga",
    "analog", "rf", "gpu", "kernel", "compiler",
    "research", "modeling", "cuda", "driver", "system software",
    "contract", "student worker",  # contract roles rarely sponsor; student roles need enrollment
]
EXCLUDED_TITLE_KEYWORDS = profile.excluded_title_keywords or DEFAULT_EXCLUDED_TITLE_KEYWORDS


def _word_pattern(words: list[str]) -> re.Pattern:
    """Whole-word match, so "rf" can't hit "performance" or "lead" hit "leadership"."""
    return re.compile(r"\b(" + "|".join(re.escape(w.strip()) for w in words if w.strip()) + r")\b")


_SENIOR = _word_pattern([*settings.SENIOR_LEVEL_KEYWORDS, "sr", "mgr"])
_EXCLUDED = _word_pattern(EXCLUDED_TITLE_KEYWORDS)
_TARGET = _word_pattern(TITLE_KEYWORDS)
# Keywords like "agentic" or "ai platform" also appear in marketing and ops titles.
_ENGINEERING = _word_pattern(ENGINEERING_TITLE_WORDS)
_TARGET_AREA = _word_pattern(settings.BAY_AREA_KEYWORDS) if settings.BAY_AREA_KEYWORDS else None


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _scan_start(check: DiscoveryCompanyCheck | None, now: datetime) -> datetime:
    """Oldest publish time this scan of a board should still pick up."""
    floor = now - timedelta(days=MAX_LOOKBACK_DAYS)
    if check is None or check.covered_through is None:
        return max(floor, now - timedelta(days=FIRST_SCAN_LOOKBACK_DAYS))
    return max(floor, check.covered_through - SCAN_OVERLAP)


# "5+ years of experience", "3-5 years of professional software experience", "at least 8 years
# experience" — a years figure followed closely by "experience". Numbers elsewhere ("founded 10
# years ago") don't count.
_YEARS_OF_EXPERIENCE = re.compile(
    r"(?<![\d.])(\d{1,2}(?:\.\d+)?)\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*\+?\s*)?years?\b[^.\n]{0,40}?\bexperience",
    re.IGNORECASE,
)


def min_years_asked(raw_text: str) -> float | None:
    """The smallest experience requirement the JD states, or None if it states none. Taking the
    smallest means "2+ years required, 5+ preferred" reads as 2; "1.5+ years" reads as 1.5."""
    years = [float(n) for n in _YEARS_OF_EXPERIENCE.findall(raw_text or "") if 0 < float(n) < 30]
    return min(years) if years else None


def _is_new_grad_only(title: str, raw_text: str) -> bool:
    if profile.new_grad:  # those postings are exactly what a new grad wants
        return False
    t = (title or "").lower()
    text = (raw_text or "").lower()
    if any(p in t for p in settings.NEW_GRAD_ONLY_TITLE_PATTERNS):
        return True
    return any(p in text for p in settings.NEW_GRAD_ONLY_BODY_PATTERNS)


def title_matches(title: str) -> bool:
    t = (title or "").lower()
    # "Member of Technical Staff" is the flat title at AI labs, not a Staff rank (same as the scorer).
    senior = [m for m in _SENIOR.findall(t) if not (m == "staff" and "member of" in t)]
    if senior or _EXCLUDED.search(t):
        return False
    return bool(_TARGET.search(t)) and bool(_ENGINEERING.search(t))


def location_matches(location: str | None) -> bool:
    """At least one listed office in the US; with discovery_locations "target", one in your target
    area or a remote role (not a remote role tied to another country, like "Remote - Canada")."""
    if blocked_region(location):
        return False
    if profile.discovery_locations == "us" or not location or _TARGET_AREA is None:
        return True
    for part in location_parts(location):
        if _TARGET_AREA.search(part.lower()):
            return True
        region = detect_region(part)
        if "remote" in part.lower() and not (region and not region[1]):
            return True
    return False


def _greenhouse_postings(body: bytes) -> list[dict]:
    postings = []
    for j in json.loads(body).get("jobs", []):
        content = BeautifulSoup(html.unescape(j.get("content") or ""), "lxml").get_text(separator="\n", strip=True)
        postings.append({
            "title": j.get("title") or "",
            "url": j.get("absolute_url"),
            "location": (j.get("location") or {}).get("name"),
            "raw_text": f"{j.get('title')}\n{content}",
            "posted_at": _parse_iso(j.get("first_published")),
        })
    return postings


async def _fetch_greenhouse(client: httpx.AsyncClient, slug: str, since: datetime | None = None) -> list[dict]:
    resp = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", params={"content": "true"})
    resp.raise_for_status()
    # Big boards return thousands of HTML descriptions; turning them into text takes seconds of
    # CPU, which on the event loop would stop the API from answering while discovery runs.
    return await asyncio.to_thread(_greenhouse_postings, resp.content)


async def _fetch_lever(client: httpx.AsyncClient, slug: str, since: datetime | None = None) -> list[dict]:
    resp = await client.get(f"https://api.lever.co/v0/postings/{slug}", params={"mode": "json"})
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        return []
    postings = []
    for j in data:
        body = "\n".join(filter(None, [j.get("openingPlain"), j.get("descriptionPlain"), j.get("additionalPlain")]))
        created_ms = j.get("createdAt")
        postings.append({
            "title": j.get("text") or "",
            "url": j.get("hostedUrl"),
            "location": (j.get("categories") or {}).get("location"),
            "raw_text": f"{j.get('text')}\n{body}",
            "posted_at": datetime.fromtimestamp(created_ms / 1000, tz=timezone.utc) if created_ms else None,
        })
    return postings


async def _fetch_ashby(client: httpx.AsyncClient, slug: str, since: datetime | None = None) -> list[dict]:
    resp = await client.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
    resp.raise_for_status()
    postings = []
    for j in resp.json().get("jobs", []):
        postings.append({
            "title": j.get("title") or "",
            "url": j.get("jobUrl"),
            "location": j.get("location"),
            "raw_text": f"{j.get('title')}\n{j.get('descriptionPlain') or ''}",
            "posted_at": _parse_iso(j.get("publishedAt")),
        })
    return postings


# Amazon has its own custom job-search API (the same one amazon.jobs itself calls) —
# not a per-slug board like the three ATS above, so it runs its own keyword queries.
DEFAULT_AMAZON_QUERIES = [
    "software development engineer",  # Amazon's own title for most SWE roles (SDE I / II)
    "frontend engineer", "front end engineer", "full stack engineer", "product engineer",
    "applied ai engineer", "ai agent engineer", "generative ai engineer", "ai platform engineer",
]
AMAZON_QUERIES = profile.amazon_queries or DEFAULT_AMAZON_QUERIES


def _parse_amazon_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(" ".join(value.split()), "%B %d, %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


async def _fetch_amazon(client: httpx.AsyncClient, _slug: str, since: datetime | None = None) -> list[dict]:
    postings = []
    seen_ids = set()
    for q in AMAZON_QUERIES:
        resp = await client.get(
            "https://www.amazon.jobs/en/search.json",
            params={"base_query": q, "country": "USA", "offset": 0, "result_limit": 50},
        )
        resp.raise_for_status()
        for j in resp.json().get("jobs", []):
            jid = j.get("id_icims") or j.get("id")
            if not jid or jid in seen_ids:
                continue
            seen_ids.add(jid)
            job_path = j.get("job_path")
            body = "\n".join(
                filter(None, [j.get("description"), j.get("basic_qualifications"), j.get("preferred_qualifications")])
            )
            postings.append({
                "title": j.get("title") or "",
                "url": f"https://www.amazon.jobs{job_path}" if job_path else None,
                "location": j.get("normalized_location") or j.get("location"),
                "raw_text": f"{j.get('title')}\n{body}",
                "posted_at": _parse_amazon_date(j.get("posted_date")),
                "is_university_job": bool(j.get("university_job")),
            })
    return postings


# Workday career sites (NVIDIA, Salesforce, Cisco, ...) are backed by a public JSON API, the same
# one the site's own search page calls. Its slug is "host/tenant/site", e.g.
# "nvidia.wd5.myworkdayjobs.com/nvidia/NVIDIAExternalCareerSite". Results aren't sorted by date,
# so every page is read; only the few new title matches then get a detail request for the JD.
WORKDAY_QUERIES = ["software engineer", "software developer", "frontend", "full stack"]
WORKDAY_PAGE = 20  # the API's maximum page size
WORKDAY_MAX_PAGES = 80  # per query; NVIDIA's Bay Area software search is ~50 pages
_WORKDAY_POSTED = re.compile(r"posted (today|yesterday|(\d+)\+? days? ago)", re.IGNORECASE)


def _workday_days_ago(posted_on: str | None) -> int | None:
    m = _WORKDAY_POSTED.search(posted_on or "")
    if not m:
        return None
    word = m.group(1).lower()
    return 0 if word == "today" else 1 if word == "yesterday" else int(m.group(2))


def _workday_location_ids(facets: list[dict]) -> list[str]:
    """Ids of the site's location facet values in your target area (or remote), at any depth."""
    ids = []
    for facet in facets:
        if facet.get("facetParameter") == "locations":
            ids += [v["id"] for v in facet.get("values", []) if v.get("descriptor") and location_matches(v["descriptor"])]
        ids += _workday_location_ids([v for v in facet.get("values", []) if v.get("values")])
    return ids


async def _fetch_workday(client: httpx.AsyncClient, slug: str, since: datetime | None = None) -> list[dict]:
    host, tenant, site = slug.split("/")
    base = f"https://{host}/wday/cxs/{tenant}/{site}"
    first = await client.post(f"{base}/jobs", json={"appliedFacets": {}, "limit": 1, "offset": 0, "searchText": ""})
    first.raise_for_status()
    facets = {}
    if profile.discovery_locations == "target" and _TARGET_AREA is not None:
        location_ids = _workday_location_ids(first.json().get("facets", []))
        if not location_ids:
            return []  # no office in the target area
        facets = {"locations": location_ids}

    max_days = MAX_LOOKBACK_DAYS if since is None else (datetime.now(timezone.utc) - since).days + 1
    sem = asyncio.Semaphore(4)

    async def page(query: str, offset: int) -> dict:
        async with sem:
            body = {"appliedFacets": facets, "limit": WORKDAY_PAGE, "offset": offset, "searchText": query}
            resp = await client.post(f"{base}/jobs", json=body)
            resp.raise_for_status()
            return resp.json()

    listings: dict[str, dict] = {}
    for query in WORKDAY_QUERIES:
        head = await page(query, 0)
        total = min(head.get("total") or 0, WORKDAY_PAGE * WORKDAY_MAX_PAGES)
        rest = await asyncio.gather(*(page(query, off) for off in range(WORKDAY_PAGE, total, WORKDAY_PAGE)))
        for data in [head, *rest]:
            for jp in data.get("jobPostings", []):
                if jp.get("externalPath"):
                    listings.setdefault(jp["externalPath"], jp)

    wanted = [
        jp for jp in listings.values()
        if title_matches(jp.get("title") or "")
        and (days := _workday_days_ago(jp.get("postedOn"))) is not None and days <= max_days
    ]

    async def detail(jp: dict) -> dict | None:
        async with sem:
            resp = await client.get(f"{base}{jp['externalPath']}")
        if resp.status_code != 200:
            return None
        info = resp.json().get("jobPostingInfo", {})
        description = BeautifulSoup(info.get("jobDescription") or "", "lxml").get_text(separator="\n", strip=True)
        now = datetime.now(timezone.utc)
        posted_at = now - timedelta(days=_workday_days_ago(jp.get("postedOn")) or 0)
        start = _parse_iso(info.get("startDate"))  # the posting's start date, e.g. "2026-10-29"
        if start:
            start = start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start
            posted_at = start if start <= now else posted_at
        return {
            "title": info.get("title") or jp.get("title") or "",
            "url": info.get("externalUrl") or f"https://{host}/{site}{jp['externalPath']}",
            "location": info.get("location") or jp.get("locationsText"),
            "raw_text": f"{info.get('title') or jp.get('title')}\n{description}",
            "posted_at": posted_at,
        }

    return [p for p in await asyncio.gather(*(detail(jp) for jp in wanted)) if p]


FETCHERS = {
    "greenhouse": _fetch_greenhouse, "lever": _fetch_lever, "ashby": _fetch_ashby,
    "amazon": _fetch_amazon, "workday": _fetch_workday,
}
SOURCE_MAP = {
    "greenhouse": JobSource.greenhouse, "lever": JobSource.lever, "ashby": JobSource.ashby,
    "amazon": JobSource.other, "workday": JobSource.workday,
}


async def _existing_urls(db: AsyncSession, urls: list[str]) -> set[str]:
    if not urls:
        return set()
    result = await db.execute(select(Job.url).where(Job.url.in_(urls)))
    return {row[0] for row in result}


def _error_text(e: Exception) -> str:
    """A reason a person can act on, rather than "[Errno 11001] getaddrinfo failed"."""
    text = str(e)
    if isinstance(e, httpx.ConnectError) and "getaddrinfo" in text:
        return "No internet connection (couldn't look up the site)"
    if isinstance(e, httpx.TimeoutException):
        return "Timed out"
    if isinstance(e, httpx.HTTPStatusError):
        return f"The site answered HTTP {e.response.status_code}"
    return text or type(e).__name__  # timeouts stringify to "", which logged as a blank reason


async def start_run(db: AsyncSession, trigger: str) -> DiscoveryRun | None:
    """Record a new run, or return None if another one (the API's or the scheduled task's) is going."""
    now = datetime.now(timezone.utc)
    await db.execute(
        update(DiscoveryRun)
        .where(DiscoveryRun.status == "running", DiscoveryRun.started_at < now - STALE_RUN)
        .values(status="error", error="Interrupted — the process stopped before the run finished")
    )
    if await db.scalar(select(DiscoveryRun.id).where(DiscoveryRun.status == "running").limit(1)):
        await db.commit()
        return None
    run = DiscoveryRun(trigger=trigger, status="running", started_at=now, summary={})
    db.add(run)
    await db.commit()
    return run


async def run_discovery(db: AsyncSession, run: DiscoveryRun) -> dict:
    """Scan every board, add new matches, re-check the to-apply list, and record it all on `run`."""
    run_id = run.id
    try:
        summary = await _discover(db)
    except Exception as e:
        await db.rollback()
        run = await db.get(DiscoveryRun, run_id)
        run.status, run.error, run.finished_at = "error", _error_text(e), datetime.now(timezone.utc)
        await db.commit()
        raise
    # Re-read: a rollback inside _discover (one job failing) expires every loaded object.
    run = await db.get(DiscoveryRun, run_id)
    run.status, run.summary, run.finished_at = "done", summary, datetime.now(timezone.utc)
    if summary["companies_total"] and not summary["companies_checked"]:
        # Not one board answered — the machine was offline, not 195 boards broken at once.
        # Recorded as a failure so the page doesn't call it the last good scan.
        reason = summary["companies_failed"][0]["error"] if summary["companies_failed"] else "unknown"
        run.status, run.error = "error", f"Couldn't reach any job board: {reason}"
    await db.commit()
    return summary


async def _discover(db: AsyncSession) -> dict:
    summary = {
        "companies_total": len(SEED_COMPANIES),
        "companies_checked": 0,
        "companies_failed": [],
        "postings_seen": 0,
        "title_matched": 0,
        "created": 0,
        "skipped_duplicate": 0,
        "skipped_work_auth": 0,
        "skipped_experience": 0,
        "carried_over": 0,
        "analysis_failed": [],
        "postings_verified": {},
    }
    now = datetime.now(timezone.utc)
    checks = {c.company: c for c in (await db.execute(select(DiscoveryCompanyCheck))).scalars()}

    # Phase 1: fetch + title-filter every company's board. Collected per-company so no
    # single large employer can crowd out the rest before we apply the run-wide cap.
    per_company_matches: list[tuple[dict, list[dict]]] = []
    sem = asyncio.Semaphore(FETCH_CONCURRENCY)

    async def fetch(company: dict, since: datetime) -> tuple[list[dict] | None, Exception | None]:
        async with sem:
            try:
                return await FETCHERS[company["ats"]](client, company["slug"], since=since), None
            except Exception as e:
                return None, e

    async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": "OfferComing/1.0"}) as client:
        starts = {c["name"]: _scan_start(checks.get(c["name"]), now) for c in SEED_COMPANIES}
        results = await asyncio.gather(*(fetch(c, starts[c["name"]]) for c in SEED_COMPANIES))

    for company, (postings, error) in zip(SEED_COMPANIES, results):
        since = starts[company["name"]]
        check = checks.get(company["name"])
        if check is None:
            check = checks[company["name"]] = DiscoveryCompanyCheck(company=company["name"], consecutive_failures=0)
            db.add(check)
        check.last_attempted_at = now

        if error is not None:
            # covered_through stays put, so the next run re-covers this board's whole gap.
            summary["companies_failed"].append({"company": company["name"], "error": _error_text(error)})
            check.last_error = _error_text(error)
            check.consecutive_failures = (check.consecutive_failures or 0) + 1
            continue

        summary["companies_checked"] += 1
        summary["postings_seen"] += len(postings)
        check.last_success_at = now
        check.last_error = None
        check.consecutive_failures = 0
        check.covered_through = now  # moved back below for any posting carried over

        matched = [
            p for p in postings
            if p["url"] and title_matches(p["title"])
            and location_matches(p.get("location"))
            and p.get("posted_at") and p["posted_at"] >= since
            and not p.get("is_university_job")
            and not _is_new_grad_only(p["title"], p["raw_text"])
        ]
        summary["title_matched"] += len(matched)
        # Ruled out by the JD text alone — skip them before the AI call. The scorer hard-rejects
        # both anyway: sponsorship / clearance language, and an explicit 5+ year floor.
        eligible = []
        for p in matched:
            if work_authorization_conflict(p["raw_text"].lower()):
                summary["skipped_work_auth"] += 1
            elif (years := min_years_asked(p["raw_text"])) is not None and years >= HARD_REJECT_YEARS:
                summary["skipped_experience"] += 1
            else:
                eligible.append(p)
        matched = eligible
        if matched:
            per_company_matches.append((company, matched))
    await db.commit()

    # Phase 2: round-robin across companies so the per-run cap is spread evenly
    # instead of being consumed entirely by whichever company was checked first.
    interleaved = [
        (company, posting)
        for row in itertools.zip_longest(*[matches for _, matches in per_company_matches])
        for (company, _), posting in zip(per_company_matches, row)
        if posting is not None
    ]

    all_urls = [posting["url"] for _, posting in interleaved]
    existing = await _existing_urls(db, all_urls)

    carried_back: dict[str, datetime] = {}  # company -> earliest posting left for the next run
    for company, posting in interleaved:
        if posting["url"] in existing:
            summary["skipped_duplicate"] += 1
            continue
        if summary["created"] >= MAX_NEW_PER_RUN:
            summary["carried_over"] += 1
            name = company["name"]
            carried_back[name] = min(carried_back.get(name, posting["posted_at"]), posting["posted_at"])
            continue

        try:
            await job_service.create_job_and_analyze(
                db,
                JobCreate(url=posting["url"], raw_text=posting["raw_text"], source=SOURCE_MAP[company["ats"]]),
                discovered=True,
                posted_at=posting.get("posted_at"),
            )
            await db.commit()  # each job costs two Codex calls — keep it even if the run is cut short
            summary["created"] += 1
        except Exception as e:
            await db.rollback()
            summary["analysis_failed"].append({"url": posting["url"], "error": _error_text(e)})

    if carried_back:
        rows = await db.execute(
            select(DiscoveryCompanyCheck).where(DiscoveryCompanyCheck.company.in_(list(carried_back)))
        )
        for check in rows.scalars():
            check.covered_through = carried_back[check.company]
        await db.commit()

    # Phase 3: is everything still on the to-apply list still posted? Free HTTP checks, no AI.
    try:
        summary["postings_verified"] = await posting_check.verify_postings(await posting_check.pipeline_jobs(db))
        await db.commit()
    except Exception as e:
        await db.rollback()
        summary["postings_verified"] = {"error": _error_text(e)}

    return summary


async def coverage(db: AsyncSession) -> dict:
    """What the Discoveries page shows: the latest run, the last good one, boards that keep
    failing, and how much of the to-apply list is confirmed still open."""
    latest = await db.scalar(select(DiscoveryRun).order_by(DiscoveryRun.started_at.desc()).limit(1))
    last_done = await db.scalar(
        select(DiscoveryRun).where(DiscoveryRun.status == "done").order_by(DiscoveryRun.started_at.desc()).limit(1)
    )
    checks = (await db.execute(select(DiscoveryCompanyCheck))).scalars().all()
    seeded = {c["name"] for c in SEED_COMPANIES}

    postings = {"listed": 0, "removed": 0, "unverified": 0, "unchecked": 0}
    for job in await posting_check.pipeline_jobs(db):
        postings[job.posting_status or "unchecked"] += 1

    def run_out(run: DiscoveryRun | None) -> dict | None:
        if run is None:
            return None
        status, error = run.status, run.error
        if status == "running" and run.started_at < datetime.now(timezone.utc) - STALE_RUN:
            status, error = "error", "Interrupted — the process stopped before the run finished"
        return {
            "trigger": run.trigger, "status": status, "started_at": run.started_at,
            "finished_at": run.finished_at, "summary": run.summary, "error": error,
        }

    failing = [
        {
            "company": c.company, "error": c.last_error,
            "consecutive_failures": c.consecutive_failures, "last_success_at": c.last_success_at,
        }
        for c in checks if c.company in seeded and c.consecutive_failures
    ]
    latest_out = run_out(latest)
    return {
        "status": latest_out["status"] if latest_out else "idle",
        "latest_run": latest_out,
        "last_success_at": last_done.finished_at if last_done else None,
        "companies_total": len(SEED_COMPANIES),
        "failing_companies": sorted(failing, key=lambda c: -c["consecutive_failures"]),
        "to_apply_postings": postings,
    }
