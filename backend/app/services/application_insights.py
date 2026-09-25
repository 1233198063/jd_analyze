"""
Outcome analysis across tracked applications: how each resume version performs, where
rejections cluster, and which missing skills show up more in rejected roles than in the rest.

Deterministic, like gap_analysis, so it recomputes for free on every page load. The only AI
step (the written summary) reads this output rather than the raw database.
"""
from __future__ import annotations
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.application import Application, ApplicationStatus
from app.models.job import Job
from app.models.resume import Resume
from app.services.gap_analysis import classify_role, is_actionable_skill
from app.services.skills import SKILL_SYNONYMS, extract_skills_from_text, normalize_skill_terms

ADVANCED = {
    ApplicationStatus.oa.value,
    ApplicationStatus.phone_screen.value,
    ApplicationStatus.interview.value,
    ApplicationStatus.offer.value,
}
# Furthest stage reached, in pipeline order — used to say where a rejection landed.
STAGE_ORDER = ["applied", "oa", "phone_screen", "interview", "offer"]
STAGE_LABELS = {
    "applied": "After applying",
    "oa": "After the OA",
    "phone_screen": "After the phone screen",
    "interview": "After interviews",
    "offer": "After an offer",
}
NOT_RECORDED = "Not recorded"
# A gap counts as tied to rejections when it's this much more common among rejected roles
# than among the rest, and appears in at least two of them.
OVER_REPRESENTED_MARGIN = 0.15
OVER_REPRESENTED_MIN = 2
MAX_SKILL_GAPS = 12


def _is_real_gap(term: str, resume_text: str) -> bool:
    """A missing skill worth counting. Unrecognized multi-word terms are requirement sentences
    ("explain tradeoffs"), not skills a resume can be checked for, and anything the resumes say
    verbatim ("automated testing") is covered even when the alias table doesn't know it."""
    if term not in SKILL_SYNONYMS and " " in term:
        return False
    return not re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", resume_text)


def _outcome(app: Application) -> dict:
    statuses = [e.get("status") for e in app.timeline or []] + [app.status.value]
    sent = app.applied_at is not None or any(s in ADVANCED or s == "rejected" for s in statuses)
    advanced = any(s in ADVANCED for s in statuses)
    rejected = app.status == ApplicationStatus.rejected
    withdrawn = app.status == ApplicationStatus.withdrawn
    furthest = max(
        (s for s in statuses if s in STAGE_ORDER), key=STAGE_ORDER.index, default="applied"
    )
    return {
        "sent": sent and not withdrawn,
        "advanced": advanced,
        "rejected": rejected,
        "waiting": sent and not withdrawn and not advanced and not rejected,
        "furthest": furthest,
    }


def _tally(rows: list[dict]) -> dict:
    sent = sum(r["sent"] for r in rows)
    advanced = sum(r["sent"] and r["advanced"] for r in rows)
    rejected = sum(r["sent"] and r["rejected"] for r in rows)
    return {
        "sent": sent,
        "advanced": advanced,
        "rejected": rejected,
        "waiting": sum(r["waiting"] for r in rows),
        "response_rate": round(advanced / sent, 3) if sent else None,
        "rejection_rate": round(rejected / sent, 3) if sent else None,
    }


def _breakdown(rows: list[dict], key: str) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[r[key]].append(r)
    out = [{"label": label, **_tally(items)} for label, items in groups.items()]
    return sorted(out, key=lambda g: (-g["sent"], g["label"]))


async def analyze_applications(db: AsyncSession) -> dict:
    masters = (
        await db.execute(select(Resume).where(Resume.is_master == True))  # noqa: E712
    ).scalars().all()
    # Pooled like gap_analysis: a skill is only "missing" when no master resume shows it.
    resume_skills = normalize_skill_terms(
        [skill for m in masters for skill in extract_skills_from_text(m.raw_text)]
    )
    resume_text = "\n".join(m.raw_text for m in masters).lower()

    apps = (
        await db.execute(
            select(Application).options(
                selectinload(Application.resume),
                selectinload(Application.job).selectinload(Job.analysis),
                selectinload(Application.job).selectinload(Job.match_score),
            )
        )
    ).scalars().all()

    rows: list[dict] = []
    for app in apps:
        outcome = _outcome(app)
        job = app.job
        analysis = job.analysis if job else None
        score = job.match_score if job else None
        required = set()
        if analysis:
            required = {
                s for s in normalize_skill_terms((analysis.required_skills or []) + (analysis.tech_stack or []))
                if is_actionable_skill(s)
            }
        tailored = {True: "Tailored", False: "Sent as-is"}.get(app.resume_tailored, "Unknown")
        days_to_rejection = None
        if outcome["rejected"] and app.applied_at and app.rejected_at:
            days_to_rejection = max(0, (app.rejected_at - app.applied_at).days)
        rows.append({
            **outcome,
            "application_id": str(app.id),
            "job_id": str(app.job_id),
            "title": (analysis.title if analysis else None) or (job.title if job else None),
            "company": (analysis.company_name if analysis else None) or (job.company_name if job else None),
            "resume": app.resume.name if app.resume else NOT_RECORDED,
            "resume_recorded": app.resume_id is not None,
            "tailored": tailored,
            "pool": (score.application_pool if score and score.application_pool else "unknown"),
            "role": classify_role(analysis.title if analysis else None),
            "score": round(score.overall_score, 1) if score else None,
            "reason": app.rejection_reason.value if app.rejection_reason else None,
            "days_to_rejection": days_to_rejection,
            "missing_skills": sorted(s for s in required - resume_skills if _is_real_gap(s, resume_text)),
        })

    sent_rows = [r for r in rows if r["sent"]]
    rejected_rows = [r for r in sent_rows if r["rejected"]]
    other_rows = [r for r in sent_rows if not r["rejected"]]

    rejected_gaps = Counter(s for r in rejected_rows for s in r["missing_skills"])
    other_gaps = Counter(s for r in other_rows for s in r["missing_skills"])
    skill_gaps = []
    for skill, count in rejected_gaps.items():
        rejected_share = count / len(rejected_rows)
        other_share = other_gaps[skill] / len(other_rows) if other_rows else 0.0
        skill_gaps.append({
            "skill": skill,
            "rejected_count": count,
            "rejected_share": round(rejected_share, 3),
            "other_count": other_gaps[skill],
            "other_share": round(other_share, 3),
            "over_represented": count >= OVER_REPRESENTED_MIN
            and rejected_share >= other_share + OVER_REPRESENTED_MARGIN,
        })
    skill_gaps.sort(key=lambda g: (-g["rejected_count"], -(g["rejected_share"] - g["other_share"]), g["skill"]))

    days = [r["days_to_rejection"] for r in rejected_rows if r["days_to_rejection"] is not None]
    stages = Counter(STAGE_LABELS[r["furthest"]] for r in rejected_rows)
    reasons = Counter(r["reason"] or "unknown" for r in rejected_rows)

    return {
        "generated_at": datetime.now(timezone.utc),
        "totals": _tally(rows),
        "rejected_count": len(rejected_rows),
        "other_count": len(other_rows),
        "median_days_to_rejection": median(days) if days else None,
        "by_resume": _breakdown(sent_rows, "resume"),
        "by_tailoring": _breakdown(sent_rows, "tailored"),
        "by_pool": _breakdown(sent_rows, "pool"),
        "by_role": _breakdown(sent_rows, "role"),
        "rejection_reasons": [{"label": k, "count": v} for k, v in reasons.most_common()],
        "rejection_stages": [{"label": k, "count": v} for k, v in stages.most_common()],
        "rejected_roles": sorted(
            rejected_rows, key=lambda r: (r["days_to_rejection"] is None, r["days_to_rejection"] or 0)
        ),
        "skill_gaps": skill_gaps[:MAX_SKILL_GAPS],
        "unrecorded_application_ids": [r["application_id"] for r in sent_rows if not r["resume_recorded"]],
        "master_resumes": [m.name for m in masters],
    }


def summary_input(analysis: dict) -> dict:
    """The slice of the analysis the AI summary reads: aggregates plus one line per rejected role,
    without ids or anything the model can't reason about."""
    role_keys = ("title", "company", "pool", "role", "score", "reason", "furthest", "days_to_rejection", "resume", "tailored")
    return {
        "totals": analysis["totals"],
        "rejected_count": analysis["rejected_count"],
        "other_count": analysis["other_count"],
        "median_days_to_rejection": analysis["median_days_to_rejection"],
        "by_resume": analysis["by_resume"],
        "by_tailoring": analysis["by_tailoring"],
        "by_pool": analysis["by_pool"],
        "by_role": analysis["by_role"],
        "rejection_reasons": analysis["rejection_reasons"],
        "rejection_stages": analysis["rejection_stages"],
        "skill_gaps": analysis["skill_gaps"],
        "rejected_roles": [
            {**{k: r[k] for k in role_keys}, "missing_skills": r["missing_skills"][:10]}
            for r in analysis["rejected_roles"]
        ],
    }
