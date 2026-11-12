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

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.profile import profile
from app.models.application import Application
from app.models.daily import DailyTodo
from app.models.job import Job, JobAnalysis
from app.models.network import NetworkContact
from app.models.practice import PracticeLog
from app.models.skill_study import SkillStudy
from app.services import network_service

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


# Weekly quest board. Each goal counts something the user controls (sending, practicing, talking
# to people) rather than outcomes, which take weeks and aren't up to them. profile.weekly_targets
# overrides any of these.
DEFAULT_WEEKLY_TARGETS = {
    "applications": 10,  # a steady pace that is still reachable in a busy week
    "explained": 5,  # practice items explained out loud — one per weekday
    "chats": network_service.WEEKLY_CHAT_TARGET,
}


async def week_quests(db: AsyncSession, today: date | None = None) -> dict:
    """This week's (Monday-start) applications, explained-aloud practice and coffee chats vs targets."""
    today = today or date.today()
    week_start = today - timedelta(days=today.weekday())
    targets = {**DEFAULT_WEEKLY_TARGETS, **(profile.weekly_targets or {})}

    applied = sum(1 for e in await _timeline_events(db, week_start, today) if e["status"] == "applied")
    explained = (
        await db.execute(
            select(func.count()).select_from(PracticeLog).where(
                PracticeLog.practiced_on >= week_start, PracticeLog.practiced_on <= today, PracticeLog.explained_aloud
            )
        )
    ).scalar_one()
    contacts = (await db.execute(select(NetworkContact))).scalars().all()
    chats = network_service.week_counts(list(contacts), today)["chats"]

    return {
        "week_start": week_start,
        "week_end": week_start + timedelta(days=6),
        "days_left": 6 - today.weekday(),
        "quests": [
            {"key": "applications", "done": applied, "target": targets["applications"]},
            {"key": "explained", "done": explained, "target": targets["explained"]},
            {"key": "chats", "done": chats, "target": targets["chats"]},
        ],
    }


# Timeline steps that moved an application forward, in the order a season recap lists them.
ADVANCE_STATUSES = ["oa", "phone_screen", "interview", "offer"]


async def season(db: AsyncSession, month: date) -> dict:
    """One calendar month in review: what was sent, how far things got, what was learned, who was met."""
    start = month.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)

    events = await _timeline_events(db, start, end)
    labels = await _job_labels(db, {e["job_id"] for e in events})
    applied_ids = list(dict.fromkeys(e["job_id"] for e in sorted(events, key=lambda e: e["at"]) if e["status"] == "applied"))
    advanced = sorted((e for e in events if e["status"] in ADVANCE_STATUSES), key=lambda e: e["at"])

    jds_added = sum(1 for (created,) in await db.execute(select(Job.created_at)) if start <= _local(created).date() <= end)
    logs = (
        await db.execute(select(PracticeLog).where(PracticeLog.practiced_on >= start, PracticeLog.practiced_on <= end))
    ).scalars().all()
    studies = (await db.execute(select(SkillStudy))).scalars().all()

    def in_month(ts: datetime | None) -> bool:
        return ts is not None and start <= _local(ts).date() <= end

    chats = []
    for contact in (await db.execute(select(NetworkContact))).scalars():
        for event in contact.timeline or []:
            try:
                on = date.fromisoformat(event["date"])
            except (KeyError, ValueError):
                continue
            if event.get("type") == "chat" and start <= on <= end:
                chats.append({"name": contact.name, "company": contact.company, "role": contact.role, "date": on})

    return {
        "month": start.strftime("%Y-%m"),
        "start": start,
        "end": end,
        "applied": [{"job_id": str(job_id), **labels.get(job_id, {})} for job_id in applied_ids],
        "advanced": [{"job_id": str(e["job_id"]), "status": e["status"], "at": e["at"], **labels.get(e["job_id"], {})} for e in advanced],
        "rejections": sum(1 for e in events if e["status"] == "rejected"),
        "jds_added": jds_added,
        "practice": {
            "days": len({log.practiced_on for log in logs}),
            "minutes": sum(log.minutes for log in logs),
            "explained": sum(1 for log in logs if log.explained_aloud),
        },
        "skills_finished": sorted(s.skill for s in studies if in_month(s.finished_at)),
        "skills_started": sorted(s.skill for s in studies if in_month(s.started_at) and not s.finished_at),
        "chats": sorted(chats, key=lambda c: c["date"]),
    }
