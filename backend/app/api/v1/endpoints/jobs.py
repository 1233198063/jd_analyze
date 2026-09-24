import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.core.database import get_db, AsyncSessionLocal
from app.schemas.job import JobCreate, JobDetailOut, JobListItem, JobOut, ResumeMatchScoreOut, ResumeTailoringOut
from app.schemas.resume import (
    ReferralMessageOut,
    CoverLetterOut,
    InterviewAnswerRequest,
    InterviewAnswerOut,
    ResumePickOut,
    ResumeCandidateOut,
    ResumeRevisionOut,
)
from app.services import job_service, ai_parser, resume_pick
from app.services.skills import normalize_skill_terms
from app.models.job import Job, ResumeTailoring, ResumeRevision

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
    discovered: bool | None = None,
    max_age_hours: float | None = None,
    db: AsyncSession = Depends(get_db),
):
    posted_after = (
        datetime.now(timezone.utc) - timedelta(hours=max_age_hours) if max_age_hours is not None else None
    )
    jobs = await job_service.list_jobs(
        db, skip=skip, limit=limit, discovered=discovered, posted_after=posted_after
    )
    result = []
    for job in jobs:
        item = JobListItem(
            id=job.id,
            url=job.url,
            title=job.title or (job.analysis.title if job.analysis else None),
            company_name=job.company_name or (job.analysis.company_name if job.analysis else None),
            source=job.source,
            discovered=job.discovered,
            posted_at=job.posted_at,
            location=job.analysis.location if job.analysis else None,
            is_remote=job.analysis.is_remote if job.analysis else None,
            created_at=job.created_at,
            overall_score=job.match_score.overall_score if job.match_score else None,
            recommendation=job.match_score.recommendation if job.match_score else None,
            is_auto_rejected=job.match_score.is_auto_rejected if job.match_score else None,
            application_pool=job.match_score.application_pool if job.match_score else None,
            sponsorship_status=job.analysis.sponsorship_status if job.analysis else None,
            application_status=job.application.status.value if job.application else None,
        )
        result.append(item)
    if discovered:
        now = datetime.now(timezone.utc)

        def rank_key(j: JobListItem) -> float:
            recency_bonus = 0.0
            if j.posted_at:
                days_old = (now - j.posted_at).total_seconds() / 86400
                recency_bonus = max(0.0, 5.0 - days_old)  # up to +5 pts, fades out over ~5 days
            return (j.overall_score or 0) + recency_bonus

        result.sort(key=rank_key, reverse=True)
    return result


_discovery_state: dict = {"status": "idle", "summary": None}


async def _run_discovery_task():
    from app.core.database import AsyncSessionLocal
    from app.services.discovery_service import run_discovery

    _discovery_state["status"] = "running"
    try:
        async with AsyncSessionLocal() as db:
            summary = await run_discovery(db)
            await db.commit()
        _discovery_state["status"] = "done"
        _discovery_state["summary"] = summary
    except Exception as e:
        _discovery_state["status"] = "error"
        _discovery_state["summary"] = {"error": str(e)}


@router.post("/discover", response_model=dict)
async def discover_jobs(background_tasks: BackgroundTasks):
    """
    Poll seeded companies' Greenhouse/Lever/Ashby boards for postings matching
    the target-role keywords, score and store any new ones. Safe to re-run —
    already-seen postings (by URL) are skipped. Runs in the background (a full
    pass can take minutes) — poll GET /jobs/discover/status for progress.
    """
    if _discovery_state["status"] == "running":
        return {"status": "running"}
    background_tasks.add_task(_run_discovery_task)
    return {"status": "started"}


@router.get("/discover/status", response_model=dict)
async def discover_status():
    return _discovery_state


@router.post("/rescore-all", response_model=dict)
async def rescore_all(db: AsyncSession = Depends(get_db)):
    """
    Re-run rule-based scoring for every analyzed job against the current master
    resume. No AI calls — safe and cheap to re-run after editing your resume or
    changing scoring rules.
    """
    return await job_service.rescore_all_jobs(db)


@router.get("/{job_id}", response_model=JobDetailOut)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await job_service.get_job_detail(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job_out = JobOut.model_validate(job)
    job_out.application_id = job.application.id if job.application else None
    job_out.application_status = job.application.status.value if job.application else None
    job_out.apply_url = job.application.apply_url if job.application else None
    return JobDetailOut(
        job=job_out,
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

    from app.services.job_service import (
        _apply_breakdown,
        _get_company,
        get_master_resumes,
        resume_skills_for_scoring,
    )
    from app.services.scorer import compute_score

    masters = await get_master_resumes(db)
    company = await _get_company(db, job.analysis.company_name)

    breakdown = compute_score(
        analysis=job.analysis.raw_ai_response,
        jd_text_lower=job.raw_text.lower(),
        resume_matched_skills=resume_skills_for_scoring(masters),
        company_h1b_total=company.h1b_total_filings if company else 0,
        company_h1b_rate=company.h1b_approval_rate if company else None,
        company_swe_filings=company.h1b_swe_filings if company else 0,
        company_size=company.size if company else None,
    )

    score = job.match_score
    if score:
        _apply_breakdown(score, breakdown)
        db.add(score)

    return score


@router.post("/{job_id}/tailor-resume", response_model=ResumeTailoringOut)
async def tailor_resume(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Generate a fresh JD-tailored resume rewrite + coaching notes for this job."""
    try:
        return await job_service.generate_resume_tailoring(db, job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")


@router.get("/{job_id}/tailor-resume", response_model=ResumeTailoringOut | None)
async def get_tailored_resume(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Return the most recently generated tailoring for this job, if any."""
    return await job_service.get_latest_tailoring(db, job_id)


@router.post("/{job_id}/tailor-resume/stream")
async def tailor_resume_stream(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Stream the tailored resume live as the AI writes it, using a delimited plain-text protocol
    (===RESUME=== ... ===META=== ... ===END===) so the client can render a running preview before
    the JSON coaching-notes block is even complete. Persists the finished result once the stream ends,
    same as the non-streaming POST /tailor-resume.
    """
    job = await job_service.get_job_detail(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.analysis:
        raise HTTPException(status_code=400, detail="Job not yet analyzed")

    resume = await job_service.resume_for_job(db, job)
    if not resume:
        raise HTTPException(status_code=400, detail="No master resume set — add one on the Resume page first")

    resume_id = resume.id
    resume_text = resume.raw_text
    job_analysis = job.analysis.raw_ai_response

    async def event_stream():
        chunks: list[str] = []
        try:
            pieces = await asyncio.to_thread(list, ai_parser.tailor_resume_stream(resume_text, job_analysis))
            for piece in pieces:
                chunks.append(piece)
                yield piece
        except Exception as e:
            yield f"\n===STREAM_ERROR===\n{e}"
            return

        full_text = "".join(chunks)
        try:
            parsed = ai_parser.parse_tailor_stream_output(full_text)
        except Exception:
            return  # client already has the raw streamed text; nothing to persist

        async with AsyncSessionLocal() as save_db:
            tailoring = ResumeTailoring(
                job_id=job_id,
                resume_id=resume_id,
                tailored_text=parsed["tailored_text"],
                keyword_coverage=parsed["keyword_coverage"],
                integration_suggestions=parsed["integration_suggestions"],
                trade_off_notes=parsed["trade_off_notes"],
                learning_gaps=parsed["learning_gaps"],
                change_notes=parsed["change_notes"],
            )
            save_db.add(tailoring)
            await save_db.commit()

    return StreamingResponse(event_stream(), media_type="text/plain")


def _candidate(row: dict | None) -> ResumeCandidateOut | None:
    return ResumeCandidateOut(**row) if row else None


@router.get("/{job_id}/resume-pick", response_model=ResumePickOut)
async def get_resume_pick(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Which master resume to send for this job. Rule-based, so it costs nothing to show."""
    job = await job_service.get_job_detail(db, job_id)
    if not job or not job.analysis:
        raise HTTPException(status_code=404, detail="Job or analysis not found")

    masters = await job_service.get_master_resumes(db)
    pick = resume_pick.pick_resume(job.analysis.raw_ai_response, masters)
    if not pick:
        return ResumePickOut(job_id=job_id, recommended=None, runner_up=None, reason=None, runner_up_reason=None)

    return ResumePickOut(
        job_id=job_id,
        recommended=_candidate(pick["recommended"]),
        runner_up=_candidate(pick["runner_up"]),
        reason=pick["reason"],
        runner_up_reason=pick["runner_up_reason"],
        is_close_call=pick["is_close_call"],
    )


@router.get("/{job_id}/resume-revision", response_model=ResumeRevisionOut | None)
async def get_resume_revision(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """The most recently generated revision for this job, if any."""
    result = await db.execute(
        select(ResumeRevision)
        .options(selectinload(ResumeRevision.resume))
        .where(ResumeRevision.job_id == job_id)
        .order_by(ResumeRevision.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    out = ResumeRevisionOut.model_validate(row)
    out.resume_name = row.resume.name if row.resume else None
    return out


@router.post("/{job_id}/resume-revision", response_model=ResumeRevisionOut)
async def generate_resume_revision(
    job_id: UUID, resume_id: UUID | None = None, db: AsyncSession = Depends(get_db)
):
    """Revise the recommended resume for this job, covering as many JD keywords as the
    candidate's real experience supports. Pass `resume_id` to revise a specific resume instead.
    """
    job = await job_service.get_job_detail(db, job_id)
    if not job or not job.analysis:
        raise HTTPException(status_code=404, detail="Job or analysis not found")

    masters = await job_service.get_master_resumes(db)
    if not masters:
        raise HTTPException(status_code=400, detail="No master resume set — add one on the Resume page first")

    pick = resume_pick.pick_resume(job.analysis.raw_ai_response, masters)
    chosen = next((r for r in masters if str(r.id) == str(resume_id)), None) if resume_id else None
    if not chosen:
        chosen = next((r for r in masters if str(r.id) == pick["recommended"]["resume_id"]), masters[0])

    try:
        data = await asyncio.to_thread(
            ai_parser.revise_resume,
            resume_text=chosen.raw_text,
            resume_name=chosen.name,
            job_analysis=job.analysis.raw_ai_response,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    row = ResumeRevision(
        job_id=job_id,
        resume_id=chosen.id,
        revised_text=data["revised_text"],
        changes=data.get("changes", []),
        keyword_coverage=data.get("keyword_coverage", []),
        new_numbers=data["new_numbers"],
        is_stretch=bool(data.get("is_stretch", False)),
        stretch_reason=data.get("stretch_reason"),
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)

    out = ResumeRevisionOut.model_validate(row)
    out.resume_name = chosen.name
    return out


@router.get("/{job_id}/referral", response_model=ReferralMessageOut)
async def get_referral_message(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await job_service.get_job_detail(db, job_id)
    if not job or not job.analysis:
        raise HTTPException(status_code=404, detail="Job or analysis not found")

    analysis = job.analysis
    resume_skills = job_service.resume_skills_for_scoring(await job_service.get_master_resumes(db))

    skill_overlap = list(
        normalize_skill_terms(analysis.required_skills + analysis.tech_stack)
        & normalize_skill_terms(resume_skills)
    )[:5]

    top_skills = ", ".join(resume_skills[:4]) if resume_skills else "React, TypeScript, Python"

    try:
        referral_data = await asyncio.to_thread(
            ai_parser.generate_referral_message,
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


@router.get("/{job_id}/cover-letter", response_model=CoverLetterOut)
async def get_cover_letter(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Generate a fresh, resume-grounded cover letter draft for this job."""
    job = await job_service.get_job_detail(db, job_id)
    if not job or not job.analysis:
        raise HTTPException(status_code=404, detail="Job or analysis not found")

    analysis = job.analysis
    resume = await job_service.resume_for_job(db, job)
    if not resume:
        raise HTTPException(status_code=400, detail="No master resume set — add one on the Resume page first")

    key_requirements = (analysis.required_skills or []) + (analysis.tech_stack or [])

    try:
        letter_data = await asyncio.to_thread(
            ai_parser.generate_cover_letter,
            resume_text=resume.raw_text,
            company_name=analysis.company_name or "the company",
            title=analysis.title or "Software Engineer",
            level=analysis.level.value,
            job_summary=analysis.summary or "",
            key_requirements=key_requirements,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    return CoverLetterOut(
        job_id=job_id,
        company_name=analysis.company_name,
        title=analysis.title,
        greeting=letter_data.get("greeting", ""),
        body=letter_data.get("body", ""),
        sign_off=letter_data.get("sign_off", "Sincerely,"),
    )


@router.post("/{job_id}/interview-answer", response_model=InterviewAnswerOut)
async def get_interview_answer(
    job_id: UUID, payload: InterviewAnswerRequest, db: AsyncSession = Depends(get_db)
):
    """Generate a resume-grounded, plain-English answer to a specific interview question for this job."""
    if not payload.question.strip():
        raise HTTPException(status_code=422, detail="Question is required")

    job = await job_service.get_job_detail(db, job_id)
    if not job or not job.analysis:
        raise HTTPException(status_code=404, detail="Job or analysis not found")

    analysis = job.analysis
    resume = await job_service.resume_for_job(db, job)
    if not resume:
        raise HTTPException(status_code=400, detail="No master resume set — add one on the Resume page first")

    key_requirements = (analysis.required_skills or []) + (analysis.tech_stack or [])

    try:
        result = await asyncio.to_thread(
            ai_parser.generate_interview_answer,
            resume_text=resume.raw_text,
            company_name=analysis.company_name or "the company",
            title=analysis.title or "Software Engineer",
            level=analysis.level.value,
            job_summary=analysis.summary or "",
            key_requirements=key_requirements,
            question=payload.question,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {e}")

    return InterviewAnswerOut(job_id=job_id, question=payload.question, answer=result.get("answer", ""))
