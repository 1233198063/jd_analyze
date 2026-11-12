"""
Sync an applications log kept as a Markdown table (e.g. by an assistant applying on your behalf)
into Offer Coming's tracker.

Expected columns, in order: 发现日 | 公司 | 岗位 | 地点 | 链接 | 简历版本 | 渠道 | 投递日期 | 状态 | 下次跟进
The 状态 column is free text; it's read as: 待投… -> Saved, 已投/可能已拒/待确认/岗位关闭… -> Applied,
拒（MM-DD 邮件） -> Rejected on that date, "OA 已交/已做完" or a take-home offer -> OA, and
未投/不投 rows (application limits, wrong country) are skipped.

Safe to re-run: rows are matched to existing jobs by posting id or link, then company + title, so
a second run only adds new rows and moves stages forward (never backward). Jobs the app doesn't
know yet are created as light records — company, title, link, and the JD text when the link is a
Greenhouse / Lever / Ashby / Workday posting — with no AI analysis or score.

Usage (from backend/):
  .venv\\Scripts\\python.exe scripts\\import_applications_md.py <path-to-applications.md>          # preview
  .venv\\Scripts\\python.exe scripts\\import_applications_md.py <path-to-applications.md> --apply  # write
"""
import argparse
import asyncio
import collections
import html
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal, engine, init_db
from app.models.application import Application, ApplicationStatus, RejectionReason
from app.models.job import Job, JobSource
from app.services.posting_check import locate

STAGE_ORDER = ["saved", "applied", "referral_asked", "oa", "phone_screen", "interview", "offer", "rejected", "withdrawn"]
SOURCES = {"greenhouse": JobSource.greenhouse, "lever": JobSource.lever, "ashby": JobSource.ashby, "workday": JobSource.workday}
YEAR = 2026  # the log writes dates inside the 状态 text as MM-DD


def _cells(line: str) -> list[str]:
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    return cells + [""] * (10 - len(cells))


def parse_rows(text: str) -> list[dict]:
    """Rows of the table whose header starts with 发现日 — the log also holds summary and referral
    tables further down, which must not be read as applications."""
    rows, in_table = [], False
    for line in text.splitlines():
        if line.startswith("| 发现日"):
            in_table = True
            continue
        if not line.startswith("|"):
            in_table = False if line.strip() else in_table
            continue
        if not in_table or line.startswith("|---"):
            continue
        found, company, title, location, link, resume, channel, applied_on, status, _ = _cells(line)[:10]
        rows.append({
            "found": found, "company": company, "title": title, "location": location,
            "link": link if link.startswith("http") else None, "resume": resume, "channel": channel,
            "applied_on": applied_on, "status_text": status,
        })
    return rows


def clean_title(title: str) -> str:
    """Drop the log's parenthetical notes: "Software Engineer I（On-Demand）" -> "Software Engineer I"."""
    return re.sub(r"\s*[（(][^）)]*[）)]", "", title).strip() or title


def _day(text: str | None) -> date | None:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", text or "")
    return date(*map(int, m.groups())) if m else None


def _mmdd(text: str, pattern: str = r"(\d{1,2})-(\d{2})") -> date | None:
    m = re.search(pattern, text)
    try:
        return date(YEAR, int(m.group(1)), int(m.group(2))) if m else None
    except ValueError:
        return None


def read_status(text: str) -> tuple[str | None, date | None]:
    """(stage, date of that stage if the text gives one); stage None = never applied."""
    if re.match(r"^(未投|不投|未投成)", text):
        return None, None
    if text.startswith("待投"):
        return "saved", None
    if text.startswith("拒"):
        return "rejected", _mmdd(text, r"(\d{1,2})-(\d{2})\s*邮件")
    if text.startswith("简历拒") and "take-home" in text:
        return "oa", _mmdd(text)  # resume turned down, but a take-home was offered — still in play
    if "OA" in text and ("已交" in text or "已做完" in text):
        return "oa", _mmdd(text)
    return "applied", None


def norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def at_noon(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 12).astimezone()  # local time, like the app's own events


# --- JD text for new jobs (free public APIs, no AI) -------------------------------------------

async def fetch_jd(client: httpx.AsyncClient, url: str, company: str, ashby_boards: dict) -> str:
    where = locate(url, company)
    if not where:
        return ""
    ats, slug, posting_id = where
    try:
        if ats == "greenhouse":
            r = await client.get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{posting_id}")
            if r.status_code != 200:
                return ""
            body = BeautifulSoup(html.unescape(r.json().get("content") or ""), "lxml").get_text("\n", strip=True)
            return f"{r.json().get('title', '')}\n{body}".strip()
        if ats == "lever":
            r = await client.get(f"https://api.lever.co/v0/postings/{slug}/{posting_id}")
            if r.status_code != 200:
                return ""
            j = r.json()
            lists = "\n".join(
                f"{x.get('text', '')}\n" + BeautifulSoup(x.get("content") or "", "lxml").get_text("\n", strip=True)
                for x in j.get("lists") or []
            )
            return "\n".join(filter(None, [j.get("text"), j.get("descriptionPlain"), lists, j.get("additionalPlain")]))
        if ats == "ashby":
            if slug not in ashby_boards:
                r = await client.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}")
                ashby_boards[slug] = {(j.get("id") or "").lower(): j for j in r.json().get("jobs", [])} if r.status_code == 200 else {}
            j = ashby_boards[slug].get(posting_id.lower())
            return f"{j.get('title', '')}\n{j.get('descriptionPlain') or ''}".strip() if j else ""
        if ats == "workday":
            host, tenant, site = slug.split("/")
            r = await client.get(f"https://{host}/wday/cxs/{tenant}/{site}{posting_id}")
            if r.status_code != 200:
                return ""
            info = r.json().get("jobPostingInfo", {})
            return f"{info.get('title', '')}\n" + BeautifulSoup(info.get("jobDescription") or "", "lxml").get_text("\n", strip=True)
    except (httpx.HTTPError, ValueError):
        return ""
    return ""


# --- matching -----------------------------------------------------------------------------------

def index_jobs(jobs: list[Job]):
    by_posting, by_url, by_name = {}, {}, collections.defaultdict(list)
    for j in jobs:
        company = j.company_name or (j.analysis.company_name if j.analysis else None)
        title = j.title or (j.analysis.title if j.analysis else None)
        if j.url:
            by_url[j.url.split("?")[0].rstrip("/").lower()] = j
            where = locate(j.url, company)
            if where:
                by_posting[(where[0], where[2].lower())] = j
        by_name[(norm(company), norm(title))].append(j)
    return by_posting, by_url, by_name


def find_job(row: dict, by_posting, by_url, by_name) -> Job | None:
    if row["link"]:
        where = locate(row["link"], row["company"])
        if where:
            # A posting id is authoritative: two Twitch "Software Engineer I" postings share a
            # title but not an id, so never fall back to the name for a link we can read.
            return by_posting.get((where[0], where[2].lower()))
        key = row["link"].split("?")[0].rstrip("/").lower()
        if key in by_url:
            return by_url[key]
    hits = by_name.get((norm(row["company"]), norm(clean_title(row["title"]))), [])
    if len(hits) > 1:
        # "Software Development Engineer（ID 10592066）": the log names the posting id in the title.
        posting_id = re.search(r"ID\s*(\d{5,})", row["title"])
        by_id = [j for j in hits if posting_id and j.url and posting_id.group(1) in j.url]
        # Otherwise a link-less row is the link-less job an earlier import created for it.
        imported = [
            j for j in hits
            if not j.url and j.application and (j.application.notes or "").startswith("Imported from applications.md")
        ]
        hits = by_id or (imported if not row["link"] else []) or hits
    return hits[0] if len(hits) == 1 else None


def build_timeline(row: dict, stage: str, stage_day: date | None) -> list[dict]:
    """Applied event on the logged date, then the later stage on its date when the text gives one."""
    applied_day = _day(row["applied_on"]) or _day(row["found"]) or stage_day
    if stage == "saved":
        return [{"status": "saved", "timestamp": at_noon(_day(row["found"]) or date.today()).isoformat(), "note": "Imported"}]
    if applied_day is None:
        return []
    events = [{"status": "applied", "timestamp": at_noon(applied_day).isoformat(), "note": "Submitted application"}]
    if stage != "applied":
        when = at_noon(stage_day) if stage_day else at_noon(applied_day) + timedelta(minutes=1)
        events.append({"status": stage, "timestamp": when.isoformat(), "note": row["status_text"][:300] if stage_day else "Date not in the log"})
    return events


def note_for(row: dict) -> str:
    bits = [f"Imported from applications.md · {row['status_text']}"]
    if row["resume"] and row["resume"] not in ("—", "-"):
        bits.append(f"Resume: {row['resume']}")
    if row["location"] and row["location"] not in ("—", "-"):
        bits.append(f"Location: {row['location']}")
    return "\n".join(bits)[:2000]


async def main(path: Path, apply: bool) -> None:
    await init_db()
    rows = parse_rows(path.read_text(encoding="utf-8"))
    counts = collections.Counter()
    changes = []

    async with AsyncSessionLocal() as db:
        jobs = (await db.execute(select(Job).options(selectinload(Job.application), selectinload(Job.analysis)))).scalars().all()
        by_posting, by_url, by_name = index_jobs(list(jobs))

        todo = []  # (row, stage, stage_day, job or None)
        claimed = set()  # one existing job per log row
        for row in rows:
            stage, stage_day = read_status(row["status_text"])
            if stage is None:
                counts["skipped: never applied (未投/不投)"] += 1
                continue
            job = find_job(row, by_posting, by_url, by_name)
            if job is not None and job.id in claimed:
                counts["skipped: a second row for the same job"] += 1
                continue
            if job is not None:
                claimed.add(job.id)
            todo.append((row, stage, stage_day, job))

        new_rows = [t for t in todo if t[3] is None]
        jd_text = {}
        if new_rows:
            ashby_boards: dict = {}
            sem = asyncio.Semaphore(8)
            async with httpx.AsyncClient(timeout=20, headers={"User-Agent": "OfferComing/1.0"}, follow_redirects=True) as client:
                async def one(row):
                    async with sem:
                        return row["link"], await fetch_jd(client, row["link"], row["company"], ashby_boards) if row["link"] else ""
                for link, text in await asyncio.gather(*(one(r) for r, *_ in new_rows)):
                    if link:
                        jd_text[link] = text
            counts["new jobs with the JD fetched"] = sum(1 for t in jd_text.values() if t)

        created_keys = set()
        for row, stage, stage_day, job in todo:
            timeline = build_timeline(row, stage, stage_day)
            if job is None:
                key = (norm(row["company"]), norm(clean_title(row["title"])), row["link"])
                if key in created_keys:
                    counts["skipped: duplicate row in the log"] += 1
                    continue
                created_keys.add(key)
                where = locate(row["link"], row["company"]) if row["link"] else None
                job = Job(
                    url=row["link"], raw_text=jd_text.get(row["link"], ""), company_name=row["company"][:255],
                    title=clean_title(row["title"])[:255], discovered=False,
                    source=SOURCES.get(where[0], JobSource.other) if where else (JobSource.manual if "自己投" in row["resume"] else JobSource.other),
                    created_at=at_noon(_day(row["found"]) or _day(row["applied_on"]) or date.today()),
                )
                db.add(job)
                await db.flush()
                existing = None
                counts[f"new job + {stage}"] += 1
            else:
                existing = job.application

            if existing is None:
                if not timeline:
                    counts["skipped: no date at all"] += 1
                    continue
                app = Application(job_id=job.id, status=ApplicationStatus(timeline[-1]["status"]), timeline=timeline, notes=note_for(row))
                if stage == "rejected":
                    app.rejection_reason = RejectionReason.form_rejection
                    app.rejection_notes = row["status_text"][:2000]
                _sync(app)
                db.add(app)
                if job in jobs:
                    counts[f"existing job + new {stage} application"] += 1
                continue

            current = existing.status.value
            if current == stage or STAGE_ORDER.index(stage) <= STAGE_ORDER.index(current):
                counts["unchanged (app already as far or further)"] += 1
                continue
            event = timeline[-1] if timeline else {"status": stage, "timestamp": datetime.now().astimezone().isoformat()}
            existing.timeline = [*(existing.timeline or []), event]
            if stage == "rejected" and not existing.rejection_reason:
                existing.rejection_reason = RejectionReason.form_rejection
                existing.rejection_notes = row["status_text"][:2000]
            _sync(existing)
            db.add(existing)
            counts[f"moved {current} -> {stage}"] += 1
            changes.append(f"{row['company']} · {clean_title(row['title'])}: {current} -> {stage}")

        if apply:
            await db.commit()
        else:
            await db.rollback()
    await engine.dispose()

    print(("APPLIED" if apply else "PREVIEW (nothing written; add --apply to write)") + f" — {len(rows)} rows in {path.name}")
    for k, v in counts.most_common():
        print(f"  {v:4}  {k}")
    for c in changes:
        print("   ", c)


def _sync(app: Application) -> None:
    """Same derivation the API uses: status from the last step, applied_at / rejected_at from the steps."""
    if app.timeline:
        app.status = ApplicationStatus(app.timeline[-1]["status"])
    for event in app.timeline or []:
        if event.get("status") == "applied":
            app.applied_at = datetime.fromisoformat(event["timestamp"])
        if event.get("status") == "rejected":
            app.rejected_at = datetime.fromisoformat(event["timestamp"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", type=Path)
    parser.add_argument("--apply", action="store_true", help="write to the database (default: preview only)")
    args = parser.parse_args()
    asyncio.run(main(args.path, args.apply))
