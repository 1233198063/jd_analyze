"""
Daily Log: the user's own to-dos for a day, next to what the app already knows happened that day —
applications submitted and moved (from `applications.timeline`, the record of truth for step
dates), JDs analyzed, and interview practice logged.

Days are local calendar days on this machine (the backend runs on the user's laptop, the same
convention practice check-ins use via date.today()), so a 10pm Pacific application counts for that
evening rather than for the next UTC day.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.daily import DailyTodo
from app.models.job import Job, JobAnalysis
from app.models.practice import PracticeLog

# Timeline steps worth showing as progress; "saved" is just bookmarking and "applied" has its own list.
PROGRESS_STATUSES = {"referral_asked", "oa", "phone_screen", "interview", "offer", "rejected", "withdrawn"}
CARRYOVER_DAYS = 14


def _local(ts: datetime) -> datetime:
    # Naive values (a backdated event_date sent without an offset) are already local.
    return ts.astimezone() if ts.tzinfo else ts


def _event_time(event: dict) -> datetime | None:
    try:
        return _local(datetime.fromisoformat(event["timestamp"]))
    except (KeyError, TypeError, ValueError):
        return None


def serialize_todo(todo: DailyTodo) -> dict:
    return {
        "id": str(todo.id),
        "day": todo.day,
        "text": todo.text,
        "done": todo.done,
        "done_at": todo.done_at,
        "created_at": todo.created_at,
    }


async def _job_labels(db: AsyncSession, job_ids: set) -> dict:
    """job_id -> {company, title}, preferring the AI-parsed names over the scraped ones."""
    if not job_ids:
        return {}
    rows = await db.execute(
        select(Job.id, Job.company_name, Job.title, JobAnalysis.company_name, JobAnalysis.title)
        .outerjoin(JobAnalysis, JobAnalysis.job_id == Job.id)
        .where(Job.id.in_(job_ids))
    )
    return {
        job_id: {"company": a_company or company or "Unknown company", "title": a_title or title or "Untitled role"}
        for job_id, company, title, a_company, a_title in rows
    }


async def _timeline_events(db: AsyncSession, start: date, end: date) -> list[dict]:
    """Every application timeline step whose local date falls in [start, end]."""
    events = []
    for app in (await db.execute(select(Application))).scalars():
        for event in app.timeline or []:
            when = _event_time(event)
            if when and start <= when.date() <= end:
                events.append({"job_id": app.job_id, "status": event.get("status"), "at": when})
    return events


async def day_view(db: AsyncSession, day: date) -> dict:
    todos = (
        await db.execute(select(DailyTodo).where(DailyTodo.day == day).order_by(DailyTodo.created_at))
    ).scalars().all()

    # Unfinished items from the last two weeks, offered for moving onto today only — looking back
    # at an old day should show that day as it was.
    carryover = []
    if day == date.today():
        carryover = (
            await db.execute(
                select(DailyTodo)
                .where(DailyTodo.done == False, DailyTodo.day < day, DailyTodo.day >= day - timedelta(days=CARRYOVER_DAYS))  # noqa: E712
                .order_by(DailyTodo.day, DailyTodo.created_at)
            )
        ).scalars().all()

    events = await _timeline_events(db, day, day)
    jobs_added = (
        await db.execute(select(Job.id, Job.created_at).order_by(Job.created_at))
    ).all()
    jobs_added = [(job_id, _local(created)) for job_id, created in jobs_added if _local(created).date() == day]
    practice = (await db.execute(select(PracticeLog).where(PracticeLog.practiced_on == day))).scalars().all()

    labels = await _job_labels(db, {e["job_id"] for e in events} | {job_id for job_id, _ in jobs_added})

    def job_entry(job_id, at: datetime, **extra) -> dict:
        return {"job_id": str(job_id), **labels.get(job_id, {}), "at": at, **extra}

    applied = [job_entry(e["job_id"], e["at"]) for e in events if e["status"] == "applied"]
    progress = [job_entry(e["job_id"], e["at"], status=e["status"]) for e in events if e["status"] in PROGRESS_STATUSES]

    return {
        "day": day,
        "is_today": day == date.today(),
        "todos": [serialize_todo(t) for t in todos],
        "carryover": [serialize_todo(t) for t in carryover],
        "activity": {
            "applied": sorted(applied, key=lambda e: e["at"]),
            "progress": sorted(progress, key=lambda e: e["at"]),
            "jds_added": [job_entry(job_id, at) for job_id, at in jobs_added],
            "practice": {
                "minutes": sum(p.minutes for p in practice),
                "sessions": len(practice),
                "explained": sum(1 for p in practice if p.explained_aloud),
                "items": [{"title": p.title, "track": p.track, "minutes": p.minutes} for p in practice],
            },
        },
    }


async def history(db: AsyncSession, days: int) -> list[dict]:
    """Per-day counts for the last `days` days, oldest first, for the strip at the bottom of the page."""
    end = date.today()
    start = end - timedelta(days=days - 1)
    summary = {
        start + timedelta(days=i): {"todos_done": 0, "todos_total": 0, "applied": 0, "jds_added": 0, "practice_minutes": 0}
        for i in range(days)
    }

    for todo in (await db.execute(select(DailyTodo).where(DailyTodo.day >= start, DailyTodo.day <= end))).scalars():
        summary[todo.day]["todos_total"] += 1
        summary[todo.day]["todos_done"] += int(todo.done)
    for event in await _timeline_events(db, start, end):
        if event["status"] == "applied":
            summary[event["at"].date()]["applied"] += 1
    for (created,) in await db.execute(select(Job.created_at)):
        local_day = _local(created).date()
        if local_day in summary:
            summary[local_day]["jds_added"] += 1
    for log in (
        await db.execute(select(PracticeLog).where(PracticeLog.practiced_on >= start, PracticeLog.practiced_on <= end))
    ).scalars():
        summary[log.practiced_on]["practice_minutes"] += log.minutes

    return [{"day": d, **counts} for d, counts in summary.items()]
