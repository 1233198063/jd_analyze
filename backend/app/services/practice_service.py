"""
Daily practice status, streaks and readiness for the practice plan (see practice_plan.py: the
two-week interview sprint, then the unfinished part of the original 30-day coding plan).

Also decides when a desktop reminder is due, so the scheduled script and the web UI share one
definition of "you haven't practiced yet today".
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.practice import PracticeLog, PracticeSettings
from app.services.practice_plan import ITEM_KEYS, OLD_PLAN_SHARES, TRACKS, compose_plan, item_keys

DEFAULT_DAILY_MINUTES = 90
DEFAULT_REMINDER_TIME = "20:00"
# After the first reminder of the day, remind again at most this often until you check in.
REMINDER_REPEAT = timedelta(hours=2)


async def get_settings(db: AsyncSession) -> PracticeSettings:
    settings = await db.get(PracticeSettings, 1)
    if settings is None:
        settings = PracticeSettings(
            id=1,
            daily_minutes=DEFAULT_DAILY_MINUTES,
            start_date=date.today(),
            reminder_time=DEFAULT_REMINDER_TIME,
        )
        db.add(settings)
        await db.flush()
    return settings


def track_targets(daily_minutes: int) -> dict[str, int]:
    """Minutes per track on the original 30-day plan's days (the sprint's blocks are fixed at
    45/45/20): the 50/35/15 split, rounded so they still sum to the budget. Integer math on
    purpose: 90 * 0.35 is 31.4999… in floats, which handed the spare minute to the wrong track.
    Ties go to the track with the larger share."""
    percent = {track: round(share * 100) for track, share in OLD_PLAN_SHARES.items()}
    targets = {track: daily_minutes * p // 100 for track, p in percent.items()}
    leftover = daily_minutes - sum(targets.values())
    by_remainder = sorted(percent, key=lambda t: (daily_minutes * percent[t] % 100, percent[t]), reverse=True)
    for track in by_remainder[:leftover]:
        targets[track] += 1
    return targets


async def current_plan(db: AsyncSession, settings: PracticeSettings) -> list[dict]:
    """The dated plan. Original-plan days count as finished only from logs before the start date,
    so the schedule doesn't shift when an old item gets practiced early."""
    rows = await db.execute(
        select(PracticeLog.item_key).where(
            PracticeLog.item_key.is_not(None), PracticeLog.practiced_on < settings.start_date
        )
    )
    plan = compose_plan(track_targets(settings.daily_minutes), {key for (key,) in rows})
    for day in plan:
        day["date"] = settings.start_date + timedelta(days=day["day"] - 1)
    return plan


def plan_day_number(start: date, day: date, plan_days: int) -> int | None:
    n = (day - start).days + 1
    return n if 1 <= n <= plan_days else None


def day_targets(plan_day: dict) -> dict[str, int]:
    """Minutes per track that day, in TRACKS order (only the tracks the day actually has)."""
    totals: dict[str, int] = defaultdict(int)
    for item in plan_day["items"]:
        totals[item["track"]] += item["minutes"]
    return {t: totals[t] for t in TRACKS if t in totals}


def _level(total: int, target: int) -> int:
    """Heatmap intensity: 0 nothing, 1 under half, 2 at least half, 3 full target."""
    if total <= 0:
        return 0
    if total >= target:
        return 3
    return 2 if total * 2 >= target else 1


def _streaks(practiced: set[date], today: date) -> tuple[int, int]:
    # Today still counts as "in progress", so an unpracticed today doesn't break the streak yet.
    current = 0
    cursor = today if today in practiced else today - timedelta(days=1)
    while cursor in practiced:
        current += 1
        cursor -= timedelta(days=1)

    longest = run = 0
    previous = None
    for d in sorted(practiced):
        run = run + 1 if previous and d - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = d
    return current, longest


def serialize_log(log: PracticeLog) -> dict:
    return {
        "id": str(log.id),
        "practiced_on": log.practiced_on,
        "track": log.track,
        "minutes": log.minutes,
        "item_key": log.item_key,
        "title": log.title,
        "difficulty": log.difficulty,
        "met_bar": log.met_bar,
        "explained_aloud": log.explained_aloud,
        "notes": log.notes,
        "created_at": log.created_at,
    }


def _settings_out(settings: PracticeSettings, plan: list[dict]) -> dict:
    sprint = [d for d in plan if d["phase"] == "sprint"]
    return {
        "daily_minutes": settings.daily_minutes,
        "start_date": settings.start_date,
        "end_date": plan[-1]["date"],
        "sprint_end_date": sprint[-1]["date"] if sprint else None,
        "reminder_time": settings.reminder_time,
    }


async def _all_logs(db: AsyncSession) -> list[PracticeLog]:
    result = await db.execute(select(PracticeLog).order_by(PracticeLog.practiced_on, PracticeLog.created_at))
    return list(result.scalars().all())


async def today_status(db: AsyncSession) -> dict:
    settings = await get_settings(db)
    plan = await current_plan(db, settings)
    today = date.today()
    logs = await _all_logs(db)
    todays = [log for log in logs if log.practiced_on == today]
    minutes = {track: sum(l.minutes for l in todays if l.track == track) for track in TRACKS}
    day_number = plan_day_number(settings.start_date, today, len(plan))
    plan_day = plan[day_number - 1] if day_number else None
    current, longest = _streaks({log.practiced_on for log in logs}, today)
    targets = day_targets(plan_day) if plan_day else {}

    return {
        "date": today,
        "day_number": day_number,
        "plan_days": len(plan),
        "settings": _settings_out(settings, plan),
        "tracks": TRACKS,
        "targets": targets,
        # What the free-practice form pre-fills per track, today's plan minutes where there are any.
        "default_minutes": {t: targets.get(t, cfg["default_minutes"]) for t, cfg in TRACKS.items()},
        "minutes": minutes,
        "total_minutes": sum(minutes.values()),
        "checked_in": bool(todays),
        "plan": plan_day,
        "logs": [serialize_log(l) for l in todays],
        # Plan items count as done whenever they were logged — catching up on a missed day counts.
        "done_keys": sorted({l.item_key for l in logs if l.item_key}),
        "streak": current,
        "longest_streak": longest,
    }


async def overview(db: AsyncSession) -> dict:
    settings = await get_settings(db)
    plan = await current_plan(db, settings)
    today = date.today()
    logs = await _all_logs(db)
    in_plan = [l for l in logs if settings.start_date <= l.practiced_on <= plan[-1]["date"]]

    by_day: dict[date, dict[str, int]] = defaultdict(lambda: {t: 0 for t in TRACKS})
    for log in in_plan:
        by_day[log.practiced_on][log.track] += log.minutes

    days = []
    for plan_day in plan:
        d = plan_day["date"]
        minutes = by_day.get(d, {t: 0 for t in TRACKS})
        total = sum(minutes.values())
        days.append({
            "date": d,
            "day_number": plan_day["day"],
            "phase": plan_day["phase"],
            "minutes": minutes,
            "total_minutes": total,
            "level": _level(total, sum(day_targets(plan_day).values())),
            "is_today": d == today,
            "is_future": d > today,
        })

    track_minutes = {t: sum(l.minutes for l in in_plan if l.track == t) for t in TRACKS}
    all_minutes = sum(track_minutes.values())
    planned = {t: sum(day_targets(d).get(t, 0) for d in plan) for t in TRACKS}
    all_planned = sum(planned.values())

    def counts(rows: list[PracticeLog]) -> dict:
        return {
            "sessions": len(rows),
            "met_bar": sum(r.met_bar for r in rows),
            "explained": sum(r.explained_aloud for r in rows),
        }

    readiness = {t: counts([l for l in in_plan if l.track == t]) for t in TRACKS}
    lc = [l for l in in_plan if l.track == "leetcode"]
    readiness["leetcode"]["by_difficulty"] = {
        diff: counts([l for l in lc if l.difficulty == diff]) for diff in ("easy", "medium", "hard")
    }

    done = {l.item_key for l in logs if l.item_key} & ITEM_KEYS
    plan_items: dict[str, set[str]] = defaultdict(set)
    for plan_day in plan:
        for item in plan_day["items"]:
            plan_items[item["track"]].update(item_keys(item))
    current, longest = _streaks({l.practiced_on for l in logs}, today)
    elapsed = max(0, min((today - settings.start_date).days + 1, len(plan)))

    return {
        "settings": _settings_out(settings, plan),
        "tracks": TRACKS,
        "days": days,
        "days_elapsed": elapsed,
        "days_practiced": sum(1 for d in days if d["total_minutes"] > 0 and not d["is_future"]),
        "streak": current,
        "longest_streak": longest,
        "track_minutes": track_minutes,
        "track_share": {t: round(m / all_minutes, 3) if all_minutes else None for t, m in track_minutes.items()},
        "plan_share": {t: round(m / all_planned, 3) if all_planned else 0 for t, m in planned.items()},
        "readiness": readiness,
        "explained_rate": round(sum(l.explained_aloud for l in in_plan) / len(in_plan), 3) if in_plan else None,
        "plan_progress": {
            t: {"done": len(done & plan_items[t]), "total": len(plan_items[t])} for t in TRACKS if plan_items[t]
        },
    }


async def plan_with_dates(db: AsyncSession) -> dict:
    settings = await get_settings(db)
    return {"tracks": TRACKS, "days": await current_plan(db, settings)}


def reminder_due(settings: PracticeSettings, now: datetime, status: dict) -> bool:
    """Remind from reminder_time onward, only on plan days, only while nothing is logged today,
    and at most once per REMINDER_REPEAT."""
    if status["checked_in"] or status["day_number"] is None:
        return False
    hour, minute = (int(part) for part in settings.reminder_time.split(":"))
    if now.time() < time(hour, minute):
        return False
    last = settings.last_reminded_at
    return last is None or now - last >= REMINDER_REPEAT


def reminder_message(status: dict) -> tuple[str, str]:
    plan = status["plan"]
    title = f"Day {status['day_number']} of {status['plan_days']} · {sum(status['targets'].values())} min of practice waiting"
    if not plan:
        return title, "Open JD Analyze to log today's practice."
    return title, " · ".join(item["title"] for item in plan["items"])
