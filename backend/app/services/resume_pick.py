"""Which master resume to send for a given JD.

Deterministic and free, so the recommendation can be shown the moment a job page opens
rather than sitting behind a Generate button. The AI is only involved later, for the
revised version of the chosen document (see ai_parser.revise_resume).
"""
from __future__ import annotations

from app.models.resume import Resume
from app.services.skills import extract_skills_from_text, normalize_skill_terms

# What each track is *for*. Title hits are weighted hardest because a JD that says
# "Frontend Engineer" has already answered the question; the skill lists only break ties
# between two resumes that describe the same person.
TRACK_SIGNALS: dict[str, dict[str, list[str]]] = {
    "frontend": {
        "titles": [
            "frontend", "front end", "front-end", "ui engineer", "ui developer",
            "react developer", "react engineer", "web developer", "design engineer",
            "user interface", "client-side",
        ],
        "skills": [
            "react", "typescript", "javascript", "css", "html", "next.js", "redux",
            "tailwind", "websocket", "sse", "jest", "playwright", "figma", "ant design",
        ],
    },
    "fullstack": {
        "titles": [
            "full stack", "fullstack", "full-stack", "product engineer", "backend",
            "back end", "back-end", "platform engineer", "software engineer, product",
            "api engineer", "ai engineer", "applications engineer",
        ],
        "skills": [
            "fastapi", "python", "rest api", "mysql", "postgresql", "sql", "docker",
            "node.js", "express", "graphql", "llm", "ai", "swagger", "machine learning",
        ],
    },
}

TITLE_HIT_WEIGHT = 4
TRACK_SKILL_WEIGHT = 2
# Below this margin the two resumes are close enough that either is defensible.
CLOSE_CALL_MARGIN = 3


def _score_one(resume: Resume, jd_skills: set[str], title_lower: str) -> dict:
    resume_skills = normalize_skill_terms(extract_skills_from_text(resume.raw_text))
    shared = sorted(jd_skills & resume_skills)

    signals = TRACK_SIGNALS.get(resume.track or "", {"titles": [], "skills": []})
    title_hits = [t for t in signals["titles"] if t in title_lower]
    track_hits = sorted(jd_skills & normalize_skill_terms(signals["skills"]))

    score = (
        len(shared)
        + TRACK_SKILL_WEIGHT * len(track_hits)
        + TITLE_HIT_WEIGHT * len(title_hits)
    )
    return {
        "resume_id": str(resume.id),
        "name": resume.name,
        "track": resume.track,
        "score": score,
        "shared_skills": shared,
        "track_skill_hits": track_hits,
        "title_hits": title_hits,
    }


def _explain(row: dict, jd_title: str) -> str:
    if row["title_hits"]:
        return f"The JD title ('{jd_title}') reads as {row['track']} work"
    if row["track_skill_hits"]:
        top = ", ".join(row["track_skill_hits"][:4])
        return f"The JD leans on {top}, which this version leads with"
    if row["shared_skills"]:
        top = ", ".join(row["shared_skills"][:4])
        return f"Nothing in the title points either way — picked on overlap ({top})"
    return "The JD names nothing this version leads with — read it before deciding"


def pick_resume(analysis: dict, resumes: list[Resume]) -> dict | None:
    """Rank the master resumes against one parsed JD.

    Returns None when there is nothing to choose between (no masters, or only one).
    """
    if not resumes:
        return None

    jd_skills = normalize_skill_terms(
        (analysis.get("required_skills") or []) + (analysis.get("tech_stack") or [])
    )
    jd_title = analysis.get("title") or ""
    title_lower = jd_title.lower()

    # A JD that names the role outright ("Frontend Engineer", "Full Stack Engineer") has
    # already answered the question, so a title hit outranks any amount of skill overlap —
    # otherwise a React-heavy full-stack JD pulls the frontend resume out in front.
    ranked = sorted(
        (_score_one(r, jd_skills, title_lower) for r in resumes),
        key=lambda row: (bool(row["title_hits"]), row["score"]),
        reverse=True,
    )
    best = ranked[0]
    runner_up = ranked[1] if len(ranked) > 1 else None
    margin = best["score"] - runner_up["score"] if runner_up else best["score"]
    decided_by_title = bool(best["title_hits"]) and not (runner_up and runner_up["title_hits"])

    return {
        "recommended": best,
        "runner_up": runner_up,
        "margin": margin,
        "is_close_call": (
            runner_up is not None and not decided_by_title and margin <= CLOSE_CALL_MARGIN
        ),
        "reason": _explain(best, jd_title),
        "runner_up_reason": _explain(runner_up, jd_title) if runner_up else None,
        "ranked": ranked,
    }
