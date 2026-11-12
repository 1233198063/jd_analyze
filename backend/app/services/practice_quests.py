"""
Practice as a quest board: every item of the practice plan becomes a quest with a points value,
grouped into modules (one per track) and chapters. There's no schedule — pick any quest, clear it
by logging it, collect the points. Explaining it out loud earns a bonus, since that's the skill the
practice is for.

The content is the plan's own (practice_plan.SPRINT and practice_plan.OLD_PLAN); this module only
reorganizes it and prices it. A quest is cleared by any PracticeLog whose item_key is one of its keys.
"""
from __future__ import annotations

from app.services.practice_plan import OLD_PLAN, SPRINT, TRACKS, WEEK_THEMES

# (base points, bonus for explaining it out loud)
POINTS = {
    "project": (40, 15),
    "english": (25, 10),
    "react": (30, 10),
    "system_design": (30, 10),
    "leetcode": {"easy": (10, 5), "medium": (20, 10), "hard": (35, 15)},
    "free": (10, 5),  # anything logged outside the catalog
}

MODULES = [
    {"key": "project", "title": "Project deep-dives", "icon": "work_history"},
    {"key": "react", "title": "React / JS builds", "icon": "code"},
    {"key": "leetcode", "title": "LeetCode", "icon": "data_object"},
    {"key": "system_design", "title": "Frontend system design", "icon": "account_tree"},
    {"key": "english", "title": "Speaking in English", "icon": "translate"},
]

# Clearing every quest in a chapter opens its treasure chest for a one-time bonus.
CHEST_BONUS = 50

SPRINT_CHAPTER = "Interview sprint"
# The 30-day plan's weeks were a learning progression; they stay as chapters, without the dates.
CHAPTERS = {week: theme.split(" — ")[0] for week, theme in WEEK_THEMES.items()}


def price(track: str, difficulty: str | None = None) -> tuple[int, int]:
    if track == "leetcode":
        return POINTS["leetcode"].get(difficulty or "medium", POINTS["leetcode"]["medium"])
    return POINTS.get(track, POINTS["free"])


def _quest(key: str, track: str, chapter: str, title: str, **extra) -> dict:
    base, bonus = price(track, extra.get("difficulty"))
    return {
        "key": key,
        "keys": [key],
        "module": track,
        "chapter": chapter,
        "title": title,
        "points": base,
        "bonus": bonus,
        "bar": extra.pop("bar", None) or TRACKS.get(track, {}).get("bar"),
        **extra,
    }


def _build() -> list[dict]:
    quests: list[dict] = []
    by_problem: dict[str, dict] = {}  # LeetCode slug -> quest, so a problem in both plans is one quest

    def add_problem(problem: dict, chapter: str, topic: str, say: str | None) -> None:
        slug = problem["url"].rstrip("/").rsplit("/", 1)[-1]
        if slug in by_problem:
            by_problem[slug]["keys"].append(problem["key"])  # logged under either key still counts
            return
        q = _quest(
            problem["key"], "leetcode", chapter, problem["name"], topic=topic, say=say,
            difficulty=problem["difficulty"], number=problem.get("number"), url=problem["url"],
            minutes=25 if problem["difficulty"] == "easy" else 40,
        )
        by_problem[slug] = q
        quests.append(q)

    for day in SPRINT:
        for item in day["items"]:
            track = item["track"]
            if item.get("problems"):
                for problem in item["problems"]:
                    add_problem(problem, SPRINT_CHAPTER, item["title"], item.get("say"))
                continue
            quests.append(_quest(
                item["key"], track, SPRINT_CHAPTER if track in ("react", "leetcode", "system_design") else day.get("theme") or SPRINT_CHAPTER,
                item["title"], brief=item.get("brief"), say=item.get("say"), bar=item.get("bar"),
                minutes=item.get("minutes"),
            ))

    for day in OLD_PLAN:
        chapter = CHAPTERS[day["week"]]
        r, lc, sd = day["react"], day["leetcode"], day["system_design"]
        quests.append(_quest(r["key"], "react", chapter, r["title"], brief=r["brief"], say=r["say"], minutes=60))
        for problem in lc["problems"]:
            add_problem(problem, chapter, lc["title"], lc["say"])
        quests.append(_quest(sd["key"], "system_design", chapter, sd["title"], brief=sd["brief"], say=sd["say"], minutes=20))
    return quests


QUESTS: list[dict] = _build()
QUEST_BY_KEY: dict[str, dict] = {k: q for q in QUESTS for k in q["keys"]}
CHAPTER_KEYS: dict[tuple[str, str], list[str]] = {}
for _q in QUESTS:
    CHAPTER_KEYS.setdefault((_q["module"], _q["chapter"]), []).append(_q["key"])


def log_points(log) -> int:
    """Points one log is worth on its own: its quest's price, or the free-practice price."""
    quest = QUEST_BY_KEY.get(log.item_key or "")
    base, bonus = (quest["points"], quest["bonus"]) if quest else price("free")
    return base + (bonus if log.explained_aloud else 0)


def earned(logs) -> dict:
    """Points actually earned: each quest pays once (with its bonus if any clear was said out loud);
    free practice pays per session. Returns totals plus per-quest state."""
    state: dict[str, dict] = {}
    free_points = 0
    free_logs = []
    paid: dict = {}  # log id -> points that log actually added
    for log in sorted(logs, key=lambda l: (l.practiced_on, l.created_at)):
        quest = QUEST_BY_KEY.get(log.item_key or "")
        if not quest:
            paid[log.id] = log_points(log)
            free_points += paid[log.id]
            free_logs.append(log)
            continue
        s = state.get(quest["key"])
        if s is None:
            s = state[quest["key"]] = {"cleared_on": log.practiced_on, "explained": False, "logs": []}
            paid[log.id] = quest["points"]
        else:
            paid[log.id] = 0  # a repeat is practice, not new points…
        if log.explained_aloud and not s["explained"]:
            paid[log.id] += quest["bonus"]  # …except the first time it's said out loud
            s["explained"] = True
        s["logs"].append(log)

    # A chapter's chest opens the day its last quest is cleared.
    chests = {}
    for (module, chapter), keys in CHAPTER_KEYS.items():
        if all(k in state for k in keys):
            chests[(module, chapter)] = max(state[k]["cleared_on"] for k in keys)
    total = sum(paid.values()) + CHEST_BONUS * len(chests)
    return {"total": total, "free": free_points, "free_logs": free_logs, "quests": state, "paid": paid, "chests": chests}
