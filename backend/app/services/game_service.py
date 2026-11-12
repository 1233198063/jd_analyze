"""
The job hunt as a game: XP, a level with a plant that grows, achievements, and the "bosses"
(applications at an OA or interview) — all derived from records the app already keeps.

XP rewards things the player controls — sending, practicing, talking to people — and even a
rejection earns a little: showing up is the part that's yours.
"""
from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.application import Application
from app.models.interview_prep import InterviewPrep
from app.models.job import JobAnalysis
from app.models.network import NetworkContact
from app.models.practice import PracticeLog
from app.models.skill_study import SkillStudy
from app.services import daily_service, posting_check, practice_quests

XP = {
    "applied": 10,
    "oa": 40,
    "phone_screen": 60,
    "interview": 100,
    "offer": 500,
    "rejected": 5,  # you showed up
    # Practice pays per quest instead: practice_quests prices each one (10-40) plus an out-loud bonus.
    "chat": 30,
    "outreach": 5,
    "skill": 40,
}

# Level titles follow a plant's life; the Quests page draws the matching growth stage.
TITLES = [(1, "Seed"), (3, "Sprout"), (6, "Sapling"), (10, "Blossom"), (15, "Fruit Tree"), (20, "Forest Keeper")]

BOSS_STAGES = ("oa", "phone_screen", "interview", "offer")


def xp_to_reach(level: int) -> int:
    """Total XP needed to reach `level`: each level costs 50 more than the one before."""
    return 100 * (level - 1) + 25 * (level - 1) * level


def level_for(xp: int) -> int:
    level = 1
    while xp_to_reach(level + 1) <= xp:
        level += 1
    return level


def _title(level: int) -> tuple[str, int]:
    stage, title = 0, TITLES[0][1]
    for i, (min_level, name) in enumerate(TITLES):
        if level >= min_level:
            stage, title = i, name
    return title, stage


def _crossed(days: list[date], n: int) -> date | None:
    """The day the n-th event happened (days sorted), or None if there aren't n yet."""
    return days[n - 1] if len(days) >= n else None


def _best_week(days: list[date], n: int) -> date | None:
    """The day some Monday-week first reached n events."""
    per_week: Counter = Counter()
    for d in days:
        week = d - timedelta(days=d.weekday())
        per_week[week] += 1
        if per_week[week] == n:
            return d
    return None


def _prep_items(content: dict) -> int:
    return 3 + len(content.get("star_stories") or []) + len(content.get("system_design") or []) + len(content.get("coding_focus") or [])


async def overview(db: AsyncSession) -> dict:
    apps = (await db.execute(select(Application).options(selectinload(Application.job)))).scalars().all()
    stage_days: dict[str, list[date]] = {s: [] for s in ("applied", "oa", "phone_screen", "interview", "offer", "rejected")}
    for app in apps:
        for event in app.timeline or []:
            when = daily_service._event_time(event)
            if when and event.get("status") in stage_days:
                stage_days[event["status"]].append(when.date())
    for days in stage_days.values():
        days.sort()

    logs = (await db.execute(select(PracticeLog))).scalars().all()
    explained_days = sorted(log.practiced_on for log in logs if log.explained_aloud)
    training = practice_quests.earned(logs)
    quest_clear_days = sorted(s["cleared_on"] for s in training["quests"].values())

    chat_days, outreach_days = [], []
    for contact in (await db.execute(select(NetworkContact))).scalars():
        for event in contact.timeline or []:
            try:
                on = date.fromisoformat(event["date"])
            except (KeyError, ValueError):
                continue
            if event.get("type") == "chat":
                chat_days.append(on)
            elif event.get("type") in ("message", "follow_up"):
                outreach_days.append(on)
    chat_days.sort()

    skills_done = sorted(
        daily_service._local(s.finished_at).date()
        for s in (await db.execute(select(SkillStudy))).scalars() if s.finished_at
    )

    earned = {
        "applications": XP["applied"] * len(stage_days["applied"]),
        "moving forward": sum(XP[s] * len(stage_days[s]) for s in ("oa", "phone_screen", "interview", "offer")),
        "showing up after a no": XP["rejected"] * len(stage_days["rejected"]),
        "practice": training["total"],
        "people": XP["chat"] * len(chat_days) + XP["outreach"] * len(outreach_days),
        "skills": XP["skill"] * len(skills_done),
    }
    xp = sum(earned.values())
    level = level_for(xp)
    title, stage = _title(level)

    achievements = [
        ("first_step", "First Step", "Send your first application", "outgoing_mail", _crossed(stage_days["applied"], 1)),
        ("ten_doors", "Ten Doors Knocked", "Send 10 applications", "door_front", _crossed(stage_days["applied"], 10)),
        ("century", "Century", "Send 100 applications", "military_tech", _crossed(stage_days["applied"], 100)),
        ("marathon", "Marathoner", "Send 300 applications", "directions_run", _crossed(stage_days["applied"], 300)),
        ("quest_week", "Quest Week", "Send 10 applications in one week", "event_available", _best_week(stage_days["applied"], 10)),
        ("first_trial", "First Trial", "Reach your first OA", "edit_note", _crossed(stage_days["oa"], 1)),
        ("voice", "Voice on the Line", "Get your first phone screen", "call", _crossed(stage_days["phone_screen"], 1)),
        ("face_the_boss", "Face the Boss", "Get your first interview", "swords", _crossed(stage_days["interview"], 1)),
        ("treasure", "The Treasure", "Get an offer", "celebration", _crossed(stage_days["offer"], 1)),
        ("still_here", "Still Here", "Hear 'not this time' 10 times and keep going", "eco", _crossed(stage_days["rejected"], 10)),
        ("coffee", "Coffee Friend", "Have your first coffee chat", "local_cafe", _crossed(chat_days, 1)),
        ("rubber_duck", "Rubber Duck", "Explain 10 practice problems out loud", "record_voice_over", _crossed(explained_days, 10)),
        ("quest_hunter", "Quest Hunter", "Clear 10 training quests", "swords", _crossed(quest_clear_days, 10)),
        ("bookworm", "Bookworm", "Finish a skill on your reading list", "menu_book", _crossed(skills_done, 1)),
    ]

    preps = {p.job_id: p for p in (await db.execute(select(InterviewPrep))).scalars()}
    bosses = []
    for app in apps:
        if app.status.value not in BOSS_STAGES or app.job is None:
            continue
        prep = preps.get(app.job_id)
        bosses.append({
            "job_id": str(app.job_id),
            "company": app.job.company_name or "Unknown company",
            "title": app.job.title,
            "stage": app.status.value,
            "since": (app.timeline or [{}])[-1].get("timestamp"),
            "prep": {"done": len(prep.checked or []), "total": _prep_items(prep.content or {})} if prep else None,
        })
    order = {s: i for i, s in enumerate(("offer", "interview", "phone_screen", "oa"))}
    bosses.sort(key=lambda b: (order[b["stage"]], b["company"]))

    months = sorted({d.strftime("%Y-%m") for d in stage_days["applied"]}, reverse=True)

    # The home page's counters, over everything (the JD list it also shows is capped).
    to_apply = [j for j in await posting_check.pipeline_jobs(db) if j.posting_status != "removed"]
    stats = {
        "sent": sum(1 for app in apps if any(e.get("status") == "applied" for e in app.timeline or [])),
        "in_play": sum(1 for app in apps if app.status.value in BOSS_STAGES),
        "interviews": sum(1 for app in apps if app.status.value in ("phone_screen", "interview")),
        "to_apply": len(to_apply),
        "jds_analyzed": await db.scalar(select(func.count()).select_from(JobAnalysis)),
    }

    return {
        "stats": stats,
        "player": {
            "xp": xp,
            "level": level,
            "title": title,
            "plant_stage": stage,
            "level_start_xp": xp_to_reach(level),
            "next_level_xp": xp_to_reach(level + 1),
            "earned": earned,
            "xp_table": XP,
        },
        "week": await daily_service.week_quests(db),
        "bosses": bosses,
        "achievements": [
            {"key": k, "title": t, "how": how, "icon": icon, "unlocked_on": d} for k, t, how, icon, d in achievements
        ],
        "seasons": months,
        "today": date.today(),
    }
