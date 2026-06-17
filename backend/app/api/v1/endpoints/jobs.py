from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from app.core.database import get_db
from app.schemas.job import JobCreate, JobDetailOut, JobListItem, JobOut, ResumeMatchScoreOut
from app.schemas.resume import ReferralMessageOut
from app.services import job_service, ai_parser
from app.models.job import Job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/", response_model=dict, status_code=status.HTTP_202_ACCEPTED)
async def submit_job(
    payload: JobCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a JD for analysis. Runs synchronously (use Celery task for heavy load).
    Returns the created job ID immediately.
    """
    if not payload.url and not payload.raw_text:
        raise HTTPException(status_code=422, detail="Provide either url or raw_text")

    try:
        job = await job_service.create_job_and_analyze(db, payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"job_id": str(job.id), "status": "analyzed"}


@router.get("/", response_model=list[JobListItem])
async def list_jobs(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    jobs = await job_service.list_jobs(db, skip=skip, limit=limit)
    result = []
    for job in jobs:
        item = JobListItem(
            id=job.id,
            url=job.url,
            title=job.title or (job.analysis.title if job.analysis else None),
            company_name=job.company_name or (job.analysis.company_name if job.analysis else None),
            source=job.source,
            created_at=job.created_at,
            overall_score=job.match_score.overall_score if job.match_score else None,
            recommendation=job.match_score.recommendation if job.match_score else None,
            is_auto_rejected=job.match_score.is_auto_rejected if job.match_score else None,
            sponsorship_status=job.analysis.sponsorship_status if job.analysis else None,
            application_status=job.application.status.value if job.application else None,
        )
        result.append(item)
    return result


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await job_service.get_job_detail(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobDetailOut(
        job=JobOut.model_validate(job),
        analysis=job.analysis,
        match_score=job.match_score,
    )


@router.post("/{job_id}/rescore", response_model=ResumeMatchScoreOut)
async def rescore_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Re-run scoring (e.g., after updating your resume)."""
    job = await job_service.get_job_detail(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.analysis:
        raise HTTPException(status_code=400, detail="Job not yet analyzed")

    from app.services.job_service import _get_master_resume, _get_company
    from app.services.scorer import compute_score

    resume = await _get_master_resume(db)
    company = await _get_company(db, job.analysis.company_name)

    breakdown = compute_score(
        analysis=job.analysis.raw_ai_response,
        jd_text_lower=job.raw_text.lower(),
        resume_matched_skills=resume.skills if resume else [],
        company_h1b_total=company.h1b_total_filings if company else 0,
        company_h1b_rate=company.h1b_approval_rate if company else None,
        company_swe_filings=company.h1b_swe_filings if company else 0,
        company_size=company.size if company else None,
    )

    score = job.match_score
    if score:
        score.overall_score = breakdown.total
        score.score_h1b = breakdown.h1b
        score.score_level = breakdown.level
        score.score_skills = breakdown.skills
        score.score_location = breakdown.location
        score.score_company = breakdown.company
        score.score_product = breakdown.product
        score.is_auto_rejected = breakdown.is_auto_rejected
        score.auto_reject_reasons = breakdown.auto_reject_reasons
        score.recommendation = breakdown.recommendation
        score.recommendation_reason = breakdown.recommendation_reason
        db.add(score)

    return score


@router.get("/{job_id}/referral", response_model=ReferralMessageOut)
async def get_referral_message(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await job_service.get_job_detail(db, job_id)
    if not job or not job.analysis:
        raise HTTPException(status_code=404, detail="Job or analysis not found")

    analysis = job.analysis
    resume = await job_service._get_master_resume(db)
    resume_skills = resume.skills if resume else []

    skill_overlap = list(
        set(s.lower() for s in analysis.required_skills + analysis.tech_stack)
        & set(s.lower() for s in resume_skills)
    )[:5]

    top_skills = ", ".join(resume_skills[:4]) if resume_skills else "React, TypeScript, Python"

    try:
        referral_data = ai_parser.generate_referral_message(
            company_name=analysis.company_name or "the company",
            title=analysis.title or "Software Engineer",
            level=analysis.level.value,
            skill_overlap=skill_overlap,
            top_skills=top_skills,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    return ReferralMessageOut(
        job_id=job_id,
        company_name=analysis.company_name,
        title=analysis.title,
        message=referral_data.get("message", ""),
        subject_line=referral_data.get("subject", ""),
        tips=referral_data.get("tips", []),
    )
