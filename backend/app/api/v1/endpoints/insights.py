import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.application import ApplicationInsight
from app.models.skill_study import SkillStudy, StudyStatus
from app.schemas.insights import ApplicationInsightOut, ResumeGapReport, SkillStudyOut, SkillStudyUpsert
from app.services import ai_parser, application_insights, gap_analysis

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/applications")
async def application_analysis(db: AsyncSession = Depends(get_db)):
    """Outcomes by resume version, pool and role, plus the skill gaps behind rejected roles.
    Deterministic, so it's free to load on every visit."""
    return await application_insights.analyze_applications(db)


@router.get("/applications/summary", response_model=ApplicationInsightOut | None)
async def latest_application_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ApplicationInsight).order_by(ApplicationInsight.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


@router.post("/applications/summary", response_model=ApplicationInsightOut)
async def generate_application_summary(db: AsyncSession = Depends(get_db)):
    """An AI write-up of the patterns in the analysis above and what to do about them."""
    analysis = await application_insights.analyze_applications(db)
    if analysis["rejected_count"] == 0:
        raise HTTPException(status_code=400, detail="No rejections tracked yet — nothing to analyze.")
    try:
        summary = await asyncio.to_thread(
            ai_parser.summarize_application_outcomes, application_insights.summary_input(analysis)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    row = ApplicationInsight(
        sent_count=analysis["totals"]["sent"],
        rejected_count=analysis["rejected_count"],
        summary=summary,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/resume-gaps", response_model=ResumeGapReport)
async def resume_gaps(
    scope: str = Query("all", pattern="^(all|applied)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregate skill gaps across job history: which roles demand what the master
    resume lacks, and what to learn first.

    scope=all     — every analyzed JD that wasn't hard-rejected
    scope=applied — only jobs you actually applied to / tracked
    """
    return await gap_analysis.analyze_resume_gaps(db, scope=scope)


@router.get("/skill-studies", response_model=list[SkillStudyOut])
async def list_skill_studies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SkillStudy).order_by(SkillStudy.updated_at.desc()))
    return result.scalars().all()


@router.put("/skill-studies/{skill}", response_model=SkillStudyOut)
async def set_skill_study(
    skill: str,
    payload: SkillStudyUpsert,
    db: AsyncSession = Depends(get_db),
):
    """Mark a skill as want-to-read / reading / finished on the study list."""
    key = skill.lower().strip()
    if not key:
        raise HTTPException(status_code=422, detail="Skill is required")

    result = await db.execute(select(SkillStudy).where(SkillStudy.skill == key))
    study = result.scalar_one_or_none()
    if not study:
        study = SkillStudy(skill=key)
        db.add(study)

    now = datetime.now(timezone.utc)
    # Stamp each milestone the first time it's reached, so the dates reflect when
    # you actually started/finished rather than the last time you touched the row.
    if payload.status == StudyStatus.reading and not study.started_at:
        study.started_at = now
    if payload.status == StudyStatus.finished:
        study.started_at = study.started_at or now
        study.finished_at = study.finished_at or now
    elif study.finished_at:
        study.finished_at = None

    study.status = payload.status
    if payload.note is not None:
        study.note = payload.note

    await db.flush()
    await db.refresh(study)
    return study


@router.delete("/skill-studies/{skill}", status_code=204)
async def clear_skill_study(skill: str, db: AsyncSession = Depends(get_db)):
    """Remove a skill from the study list entirely (back to untracked)."""
    result = await db.execute(select(SkillStudy).where(SkillStudy.skill == skill.lower().strip()))
    study = result.scalar_one_or_none()
    if study:
        await db.delete(study)
