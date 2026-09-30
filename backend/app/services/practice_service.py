"""
Daily practice status, streaks and readiness for the 30-day interview plan.

Also decides when a desktop reminder is due, so the scheduled script and the web UI share one
definition of "you haven't practiced yet today".
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.practice import PracticeLog, PracticeSettings
from app.services.practice_plan import ITEM_KEYS, PLAN, PLAN_DAYS, TRACKS, WEEK_THEMES

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
    """Minutes per track from the 50/35/15 split, rounded so they still sum to the budget.
    Integer math on purpose: 90 * 0.35 is 31.4999… in floats, which handed the spare minute to
    the wrong track. Ties go to the track with the larger share."""
    percent = {track: round(cfg["share"] * 100) for track, cfg in TRACKS.items()}
    targets = {track: daily_minutes * p // 100 for track, p in percent.items()}
    leftover = daily_minutes - sum(targets.values())
    by_remainder = sorted(percent, key=lambda t: (daily_minutes * percent[t] % 100, percent[t]), reverse=True)
    for track in by_remainder[:leftover]:
        targets[track] += 1
    return targets


def plan_day_number(start: date, day: date) -> int | None:
    n = (day - start).days + 1
    return n if 1 <= n <= PLAN_DAYS else None


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


def _settings_out(settings: PracticeSettings) -> dict:
    return {
        "daily_minutes": settings.daily_minutes,
        "start_date": settings.start_date,
        "end_date": settings.start_date + timedelta(days=PLAN_DAYS - 1),
        "reminder_time": settings.reminder_time,
    }


async def _all_logs(db: AsyncSession) -> list[PracticeLog]:
    result = await db.execute(select(PracticeLog).order_by(PracticeLog.practiced_on, PracticeLog.created_at))
    return list(result.scalars().all())


async def today_status(db: AsyncSession) -> dict:
    settings = await get_settings(db)
    today = date.today()
    targets = track_targets(settings.daily_minutes)
    logs = await _all_logs(db)
    todays = [log for log in logs if log.practiced_on == today]
    minutes = {track: sum(l.minutes for l in todays if l.track == track) for track in TRACKS}
    day_number = plan_day_number(settings.start_date, today)
    plan = PLAN[day_number - 1] if day_number else None
    current, longest = _streaks({log.practiced_on for log in logs}, today)

    return {
        "date": today,
        "day_number": day_number,
        "plan_days": PLAN_DAYS,
        "settings": _settings_out(settings),
        "tracks": TRACKS,
        "targets": targets,
        "minutes": minutes,
        "total_minutes": sum(minutes.values()),
        "checked_in": bool(todays),
        "plan": plan,
        "week_theme": WEEK_THEMES.get(plan["week"]) if plan else None,
        "logs": [serialize_log(l) for l in todays],
        # Plan items count as done whenever they were logged — catching up on a missed day counts.
        "done_keys": sorted({l.item_key for l in logs if l.item_key}),
        "streak": current,
        "longest_streak": longest,
    }


async def overview(db: AsyncSession) -> dict:
    settings = await get_settings(db)
    today = date.today()
    targets = track_targets(settings.daily_minutes)
    target_total = sum(targets.values())
    logs = await _all_logs(db)
    end = settings.start_date + timedelta(days=PLAN_DAYS - 1)
    in_plan = [l for l in logs if settings.start_date <= l.practiced_on <= end]

    by_day: dict[date, dict[str, int]] = defaultdict(lambda: {t: 0 for t in TRACKS})
    for log in in_plan:
        by_day[log.practiced_on][log.track] += log.minutes

    days = []
    for n in range(1, PLAN_DAYS + 1):
        d = settings.start_date + timedelta(days=n - 1)
        minutes = by_day.get(d, {t: 0 for t in TRACKS})
        total = sum(minutes.values())
        days.append({
            "date": d,
            "day_number": n,
            "minutes": minutes,
            "total_minutes": total,
            "level": _level(total, target_total),
            "is_today": d == today,
            "is_future": d > today,
        })

    track_minutes = {t: sum(l.minutes for l in in_plan if l.track == t) for t in TRACKS}
    all_minutes = sum(track_minutes.values())

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
    plan_items = {
        "react": {d["react"]["key"] for d in PLAN},
        "leetcode": {p["key"] for d in PLAN for p in d["leetcode"]["problems"]},
        "system_design": {d["system_design"]["key"] for d in PLAN},
    }
    current, longest = _streaks({l.practiced_on for l in logs}, today)
    elapsed = max(0, min((today - settings.start_date).days + 1, PLAN_DAYS))

    return {
        "settings": _settings_out(settings),
        "tracks": TRACKS,
        "targets": targets,
        "days": days,
        "days_elapsed": elapsed,
        "days_practiced": sum(1 for d in days if d["total_minutes"] > 0 and not d["is_future"]),
        "streak": current,
        "longest_streak": longest,
        "track_minutes": track_minutes,
        "track_share": {t: round(m / all_minutes, 3) if all_minutes else None for t, m in track_minutes.items()},
        "readiness": readiness,
        "explained_rate": round(sum(l.explained_aloud for l in in_plan) / len(in_plan), 3) if in_plan else None,
        "plan_progress": {t: {"done": len(done & keys), "total": len(keys)} for t, keys in plan_items.items()},
    }


def plan_with_dates(settings: PracticeSettings) -> dict:
    return {
        "tracks": TRACKS,
        "week_themes": WEEK_THEMES,
        "days": [
            {**day, "date": settings.start_date + timedelta(days=day["day"] - 1)} for day in PLAN
        ],
    }


def reminder_due(settings: PracticeSettings, now: datetime, checked_in: bool) -> bool:
    """Remind from reminder_time onward, only on plan days, only while nothing is logged today,
    and at most once per REMINDER_REPEAT."""
    if checked_in or plan_day_number(settings.start_date, now.date()) is None:
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
    problems = ", ".join(p["name"] for p in plan["leetcode"]["problems"])
    body = (
        f"React: {plan['react']['title']} · LeetCode: {problems} · "
        f"Design: {plan['system_design']['title']}"
    )
    return title, body
