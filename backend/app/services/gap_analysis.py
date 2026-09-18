"""
Aggregates resume-vs-JD skill gaps across the whole job history.

Answers two questions: which roles demand what you don't have, and what to learn
first. Gaps are derived deterministically (JD skills minus resume skills, both run
through the shared alias table) so the summary recomputes instantly and for free
whenever the resume or the job list changes.
"""
from __future__ import annotations
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.job import Job, ResumeTailoring
from app.models.resume import Resume
from app.services.skills import SKILL_SYNONYMS, extract_skills_from_text, normalize_skill_terms

# Role buckets, matched against the job title in order — first hit wins.
ROLE_GROUPS: list[tuple[str, list[str]]] = [
    ("AI / LLM / Agent", ["ai", "llm", "agent", "agentic", "generative", "genai", "machine learning", "ml", "gpt", "nlp"]),
    ("Data", ["data engineer", "data scientist", "data platform", "analytics", "etl"]),
    ("Frontend", ["frontend", "front end", "front-end", "ui engineer", "web engineer", "javascript engineer"]),
    ("Full-Stack", ["fullstack", "full stack", "full-stack"]),
    ("Backend / Platform", ["backend", "back end", "back-end", "platform", "infrastructure", "infra", "distributed", "systems engineer", "devops", "sre"]),
    ("Product Engineer", ["product engineer", "forward deployed"]),
    ("Mobile", ["ios", "android", "mobile"]),
]
UNCLASSIFIED = "Other"

# Generic requirement language that normalize_skill_terms passes through verbatim.
# These aren't things you can go learn, so they'd only be noise in a study plan.
GENERIC_REQUIREMENT_TERMS = {
    "communication", "communication skills", "collaboration", "teamwork", "leadership",
    "mentoring", "mentorship", "problem solving", "problem-solving", "ownership",
    "api", "apis", "database", "databases", "programming", "coding", "software development",
    "backend development", "frontend development", "web development", "full stack development",
    "testing", "debugging", "documentation", "agile", "scrum", "code review",
    "computer science", "bachelor", "bachelors", "master", "masters", "degree",
}

# Share of considered JDs demanding a skill, above which it's worth prioritising.
# Paired with an absolute floor so a narrow scope (e.g. 12 applied jobs) can't
# promote a skill only one JD ever mentioned to "high" on percentage alone.
HIGH_PRIORITY_FREQUENCY = 0.12
HIGH_PRIORITY_MIN_JDS = 3
MEDIUM_PRIORITY_FREQUENCY = 0.06
MEDIUM_PRIORITY_MIN_JDS = 2

_ROLE_PATTERNS = [
    (name, [re.compile(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])") for kw in keywords])
    for name, keywords in ROLE_GROUPS
]


def classify_role(title: str | None) -> str:
    """Bucket a job title into a role family."""
    text = (title or "").lower()
    if not text:
        return UNCLASSIFIED
    for name, patterns in _ROLE_PATTERNS:
        if any(p.search(text) for p in patterns):
            return name
    return UNCLASSIFIED


def _is_actionable_skill(term: str) -> bool:
    """Filter out prose requirements and soft skills, keeping learnable technologies."""
    if term in GENERIC_REQUIREMENT_TERMS:
        return False
    if term in SKILL_SYNONYMS:
        return True
    # Unknown terms pass through normalize_skill_terms verbatim; keep only the ones
    # short enough to be an actual technology name rather than a sentence.
    return len(term) <= 25 and len(term.split()) <= 3


def _priority_bucket(frequency: float, jd_count: int) -> str:
    if frequency >= HIGH_PRIORITY_FREQUENCY and jd_count >= HIGH_PRIORITY_MIN_JDS:
        return "high"
    if frequency >= MEDIUM_PRIORITY_FREQUENCY and jd_count >= MEDIUM_PRIORITY_MIN_JDS:
        return "medium"
    return "low"


async def analyze_resume_gaps(db: AsyncSession, scope: str = "all") -> dict:
    """
    Aggregate skill gaps across job history.

    scope="all"     — every analyzed JD that wasn't hard-rejected
    scope="applied" — only jobs with an application record
    """
    resume = (
        await db.execute(select(Resume).where(Resume.is_master == True).limit(1))
    ).scalar_one_or_none()
    if not resume:
        return {
            "meta": {
                "resume_name": None,
                "jobs_total": 0,
                "jobs_considered": 0,
                "scope": scope,
                "generated_at": datetime.now(timezone.utc),
            },
            "gaps": [],
            "by_role": [],
            "strengths": [],
        }

    # Recompute from raw_text rather than trusting resume.skills: that column is a
    # snapshot taken at write time, so it goes stale whenever the alias table grows.
    resume_skills = normalize_skill_terms(extract_skills_from_text(resume.raw_text))

    jobs = (
        await db.execute(
            select(Job).options(
                selectinload(Job.analysis),
                selectinload(Job.match_score),
                selectinload(Job.application),
            )
        )
    ).scalars().all()

    considered = [
        j for j in jobs
        if j.analysis and not (j.match_score and j.match_score.is_auto_rejected)
    ]
    if scope == "applied":
        considered = [j for j in considered if j.application]

    total_considered = len(considered)
    if not total_considered:
        return {
            "meta": {
                "resume_name": resume.name,
                "jobs_total": len(jobs),
                "jobs_considered": 0,
                "scope": scope,
                "generated_at": datetime.now(timezone.utc),
            },
            "gaps": [],
            "by_role": [],
            "strengths": [],
        }

    # Coaching notes harvested from any AI tailorings already generated, keyed by skill.
    tailorings = (await db.execute(select(ResumeTailoring))).scalars().all()
    coaching: dict[str, str] = {}
    for t in tailorings:
        for entry in t.learning_gaps or []:
            skill = str(entry.get("skill", "")).lower().strip()
            how = entry.get("how_to_learn")
            if skill and how and skill not in coaching:
                coaching[skill] = how

    stats: dict[str, dict] = defaultdict(
        lambda: {"required": 0, "nice": 0, "roles": Counter(), "scores": [], "examples": []}
    )
    role_job_counts: Counter = Counter()
    demanded_skills: Counter = Counter()

    for job in considered:
        analysis = job.analysis
        role = classify_role(analysis.title or job.company_name)
        role_job_counts[role] += 1
        score = job.match_score.overall_score if job.match_score else 0.0

        required = {
            s for s in normalize_skill_terms(analysis.required_skills + analysis.tech_stack)
            if _is_actionable_skill(s)
        }
        nice = {
            s for s in normalize_skill_terms(analysis.nice_to_have_skills)
            if _is_actionable_skill(s)
        } - required

        for skill in required | nice:
            demanded_skills[skill] += 1

        for skill in (required | nice) - resume_skills:
            entry = stats[skill]
            entry["required" if skill in required else "nice"] += 1
            entry["roles"][role] += 1
            entry["scores"].append(score)
            if len(entry["examples"]) < 5:
                entry["examples"].append({
                    "job_id": str(job.id),
                    "title": analysis.title or job.title,
                    "company_name": analysis.company_name or job.company_name,
                    "overall_score": score,
                })

    gaps = []
    for skill, entry in stats.items():
        jd_count = entry["required"] + entry["nice"]
        frequency = jd_count / total_considered
        required_ratio = entry["required"] / jd_count
        avg_score = sum(entry["scores"]) / len(entry["scores"])
        # Rank by how often it's demanded, weighted up when it's a hard requirement
        # and when the jobs demanding it are ones actually worth applying to.
        priority_score = frequency * 100 * (0.5 + 0.5 * required_ratio) * (0.6 + 0.4 * avg_score / 100)
        gaps.append({
            "skill": skill,
            "jd_count": jd_count,
            "required_count": entry["required"],
            "nice_to_have_count": entry["nice"],
            "frequency_pct": round(frequency * 100, 1),
            "avg_job_score": round(avg_score, 1),
            "priority": _priority_bucket(frequency, jd_count),
            "priority_score": round(priority_score, 2),
            "top_roles": [{"role": r, "count": c} for r, c in entry["roles"].most_common(3)],
            "how_to_learn": coaching.get(skill),
            "example_jobs": entry["examples"],
        })
    gaps.sort(key=lambda g: g["priority_score"], reverse=True)

    by_role = []
    for role, job_count in role_job_counts.most_common():
        role_gaps = sorted(
            (g for g in gaps if any(r["role"] == role for r in g["top_roles"])),
            key=lambda g: next(r["count"] for r in g["top_roles"] if r["role"] == role),
            reverse=True,
        )
        by_role.append({
            "role": role,
            "jd_count": job_count,
            "top_gaps": [
                {
                    "skill": g["skill"],
                    "jd_count": next(r["count"] for r in g["top_roles"] if r["role"] == role),
                    "priority": g["priority"],
                }
                for g in role_gaps[:8]
            ],
        })

    strengths = [
        {
            "skill": skill,
            "jd_count": count,
            "frequency_pct": round(count / total_considered * 100, 1),
        }
        for skill, count in demanded_skills.most_common()
        if skill in resume_skills
    ][:12]

    return {
        "meta": {
            "resume_name": resume.name,
            "jobs_total": len(jobs),
            "jobs_considered": total_considered,
            "scope": scope,
            "generated_at": datetime.now(timezone.utc),
        },
        "gaps": gaps,
        "by_role": by_role,
        "strengths": strengths,
    }
