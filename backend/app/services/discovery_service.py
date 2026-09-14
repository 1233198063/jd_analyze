"""
Daily discovery pipeline: poll each seeded company's public ATS job-board API,
keep postings whose title matches the user's target roles, and run them through
the normal scrape-free create_job_and_analyze pipeline (score + rank + extract).
"""
import html
import itertools
from datetime import datetime, timedelta, timezone
import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.job import Job, JobSource
from app.schemas.job import JobCreate
from app.services import job_service
from app.services.company_boards import SEED_COMPANIES
from app.services.scorer import detect_region

TIMEOUT = httpx.Timeout(15.0)
MAX_NEW_PER_RUN = 25  # cap AI-parsing calls per run to keep cost/time bounded
MAX_POSTING_AGE_DAYS = 3  # only ingest postings the ATS says were published this recently

# Mirrors the keyword set used for the "Search by Source" links on the dashboard.
TITLE_KEYWORDS = [
    "frontend", "front-end", "front end",
    "full-stack", "full stack", "fullstack",
    "product engineer",
    "ai application", "applied ai",
    "ai agent", "agentic",
    "ai tooling",
    "developer platform", "dev platform",
    "internal tools", "internal tooling",
    "ai platform",
    "generative ai",
    "llm",
]


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _is_recent(posted_at: datetime | None) -> bool:
    if not posted_at:
        return False
    return (datetime.now(timezone.utc) - posted_at) <= timedelta(days=MAX_POSTING_AGE_DAYS)


def _is_new_grad_only(title: str, raw_text: str) -> bool:
    t = (title or "").lower()
    text = (raw_text or "").lower()
    if any(p in t for p in settings.NEW_GRAD_ONLY_TITLE_PATTERNS):
        return True
    return any(p in text for p in settings.NEW_GRAD_ONLY_BODY_PATTERNS)


def title_matches(title: str) -> bool:
    t = (title or "").lower()
    if any(kw in t for kw in settings.SENIOR_LEVEL_KEYWORDS):
        return False
    return any(kw in t for kw in TITLE_KEYWORDS)


async def _fetch_greenhouse(client: httpx.AsyncClient, slug: str) -> list[dict]:
    resp = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", params={"content": "true"})
    resp.raise_for_status()
    postings = []
    for j in resp.json().get("jobs", []):
        content = BeautifulSoup(html.unescape(j.get("content") or ""), "lxml").get_text(separator="\n", strip=True)
        postings.append({
            "title": j.get("title") or "",
            "url": j.get("absolute_url"),
            "location": (j.get("location") or {}).get("name"),
            "raw_text": f"{j.get('title')}\n{content}",
            "posted_at": _parse_iso(j.get("first_published")),
        })
    return postings


async def _fetch_lever(client: httpx.AsyncClient, slug: str) -> list[dict]:
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


async def _fetch_ashby(client: httpx.AsyncClient, slug: str) -> list[dict]:
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
AMAZON_QUERIES = [
    "frontend engineer", "front end engineer", "full stack engineer", "product engineer",
    "applied ai engineer", "ai agent engineer", "generative ai engineer", "ai platform engineer",
]


def _parse_amazon_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(" ".join(value.split()), "%B %d, %Y").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


async def _fetch_amazon(client: httpx.AsyncClient, _slug: str) -> list[dict]:
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


FETCHERS = {"greenhouse": _fetch_greenhouse, "lever": _fetch_lever, "ashby": _fetch_ashby, "amazon": _fetch_amazon}
SOURCE_MAP = {
    "greenhouse": JobSource.greenhouse, "lever": JobSource.lever, "ashby": JobSource.ashby, "amazon": JobSource.other,
}


async def _existing_urls(db: AsyncSession, urls: list[str]) -> set[str]:
    if not urls:
        return set()
    result = await db.execute(select(Job.url).where(Job.url.in_(urls)))
    return {row[0] for row in result}


async def run_discovery(db: AsyncSession) -> dict:
    summary = {
        "companies_checked": 0,
        "companies_failed": [],
        "postings_seen": 0,
        "title_matched": 0,
        "created": 0,
        "skipped_duplicate": 0,
        "skipped_cap": 0,
        "analysis_failed": [],
    }

    # Phase 1: fetch + title-filter every company's board. Collected per-company so no
    # single large employer can crowd out the rest before we apply the run-wide cap.
    per_company_matches: list[tuple[dict, list[dict]]] = []
    async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": "JDAnalyze/1.0"}) as client:
        for company in SEED_COMPANIES:
            fetcher = FETCHERS[company["ats"]]
            try:
                postings = await fetcher(client, company["slug"])
            except Exception as e:
                summary["companies_failed"].append({"company": company["name"], "error": str(e)})
                continue

            summary["companies_checked"] += 1
            summary["postings_seen"] += len(postings)

            matched = [
                p for p in postings
                if p["url"] and title_matches(p["title"])
                and (detect_region(p.get("location")) or (None, True))[1]
                and _is_recent(p.get("posted_at"))
                and not p.get("is_university_job")
                and not _is_new_grad_only(p["title"], p["raw_text"])
            ]
            summary["title_matched"] += len(matched)
            if matched:
                per_company_matches.append((company, matched))

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

    for company, posting in interleaved:
        if posting["url"] in existing:
            summary["skipped_duplicate"] += 1
            continue
        if summary["created"] >= MAX_NEW_PER_RUN:
            summary["skipped_cap"] += 1
            continue

        try:
            await job_service.create_job_and_analyze(
                db,
                JobCreate(url=posting["url"], raw_text=posting["raw_text"], source=SOURCE_MAP[company["ats"]]),
                discovered=True,
                posted_at=posting.get("posted_at"),
            )
            summary["created"] += 1
        except Exception as e:
            summary["analysis_failed"].append({"url": posting["url"], "error": str(e)})

    return summary
