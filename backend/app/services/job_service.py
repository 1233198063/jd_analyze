"""
Orchestrates: scrape → AI parse → company lookup → score → persist.
"""
from __future__ import annotations
import re
from datetime import datetime
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.job import Job, JobAnalysis, ResumeMatchScore, ResumeTailoring, JobSource, SponsorshipStatus, JobLevel, Recommendation
from app.models.company import Company
from app.models.resume import Resume
from app.schemas.job import JobCreate
from app.services import ai_parser, scorer
from app.services.jd_scraper import fetch_jd_from_url
from app.services.skills import extract_skills_from_text


async def _get_master_resume(db: AsyncSession) -> Resume | None:
    result = await db.execute(select(Resume).where(Resume.is_master == True).limit(1))
    return result.scalar_one_or_none()


def resume_skills_for_scoring(resume: Resume | None) -> list[str]:
    """Canonical skills for a resume, always re-derived from its text.

    The stored `resumes.skills` column is a snapshot taken when the resume was
    saved, so it silently goes stale whenever the alias table in services.skills
    grows — and a stale list under-counts resume/JD overlap in every score.
    """
    return extract_skills_from_text(resume.raw_text) if resume else []


def _normalize_company_name(name: str) -> str:
    normalized = re.sub(r"[^\w\s]", "", name.lower()).strip()
    return re.sub(r"\s+", " ", normalized)


async def _get_company(db: AsyncSession, name: str | None) -> Company | None:
    if not name:
        return None
    result = await db.execute(
        select(Company).where(Company.name_normalized == _normalize_company_name(name))
    )
    return result.scalar_one_or_none()


def _apply_breakdown(score: ResumeMatchScore, breakdown) -> None:
    """Copy a freshly computed rule-based breakdown onto a match score row."""
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


def _map_level(raw: str) -> JobLevel:
    mapping = {
        "intern": JobLevel.intern,
        "entry": JobLevel.entry,
        "junior": JobLevel.junior,
        "mid": JobLevel.mid,
        "senior": JobLevel.senior,
        "staff": JobLevel.staff,
        "principal": JobLevel.principal,
        "manager": JobLevel.manager,
    }
    return mapping.get(raw.lower(), JobLevel.unknown)


def _map_sponsorship(raw: str) -> SponsorshipStatus:
    if raw == "sponsors":
        return SponsorshipStatus.sponsors
    if raw == "no_sponsor":
        return SponsorshipStatus.no_sponsor
    return SponsorshipStatus.unknown


async def create_job_and_analyze(
    db: AsyncSession,
    payload: JobCreate,
    discovered: bool = False,
    posted_at: datetime | None = None,
) -> Job:
    """
    Full pipeline:
    1. Scrape URL if provided
    2. AI parse JD
    3. Lookup company H-1B data
    4. Compute composite score
    5. Persist everything
    """
    # Step 1: get raw text
    raw_text = payload.raw_text or ""
    source = payload.source
    if payload.url and not raw_text:
        raw_text, source = await fetch_jd_from_url(payload.url)

    if not raw_text:
        raise ValueError("No job description text provided and URL scraping failed.")

    # Step 2: AI parse
    ai_data = ai_parser.parse_job_description(raw_text)

    if not ai_data.get("title") and not ai_data.get("company_name") \
            and not ai_data.get("tech_stack") and not ai_data.get("required_skills"):
        raise ValueError(
            "Could not extract any job details from this page — it may be behind a login wall "
            "or rendered client-side. Paste the job description text directly instead."
        )

    # Step 3: company lookup
    company = await _get_company(db, ai_data.get("company_name"))

    # Step 4: master resume skills for scoring
    resume = await _get_master_resume(db)
    resume_skills = resume_skills_for_scoring(resume)

    # Step 5: compute score
    breakdown = scorer.compute_score(
        analysis=ai_data,
        jd_text_lower=raw_text.lower(),
        resume_matched_skills=resume_skills,
        company_h1b_total=company.h1b_total_filings if company else 0,
        company_h1b_rate=company.h1b_approval_rate if company else None,
        company_swe_filings=company.h1b_swe_filings if company else 0,
        company_size=company.size if company else None,
    )

    # Step 6: AI resume scoring (only if not auto-rejected and resume exists)
    ai_score_data: dict = {}
    if not breakdown.is_auto_rejected and resume:
        ai_score_data = ai_parser.score_resume_vs_job(resume.raw_text, ai_data)

    # Step 7: persist
    job = Job(
        url=payload.url,
        raw_text=raw_text,
        source=source,
        company_name=ai_data.get("company_name"),
        title=ai_data.get("title"),
        discovered=discovered,
        posted_at=posted_at,
    )
    db.add(job)
    await db.flush()

    years = ai_data.get("years_experience", {}) or {}
    salary = ai_data.get("salary", {}) or {}
    sponsorship = ai_data.get("sponsorship", {}) or {}
    degree = ai_data.get("degree", {}) or {}

    analysis = JobAnalysis(
        job_id=job.id,
        title=ai_data.get("title"),
        company_name=ai_data.get("company_name"),
        level=_map_level(ai_data.get("level", "unknown")),
        years_min=years.get("min"),
        years_max=years.get("max"),
        location=ai_data.get("location"),
        is_remote=ai_data.get("is_remote", False),
        is_hybrid=ai_data.get("is_hybrid", False),
        is_contract=ai_data.get("is_contract", False),
        sponsorship_status=_map_sponsorship(sponsorship.get("status", "unknown")),
        sponsorship_raw_text=sponsorship.get("raw_text"),
        sponsorship_signals=sponsorship.get("signals", []),
        tech_stack=ai_data.get("tech_stack", []),
        required_skills=ai_data.get("required_skills", []),
        nice_to_have_skills=ai_data.get("nice_to_have_skills", []),
        degree_required=degree.get("required", False),
        degree_preferred=degree.get("preferred", False),
        degree_level=degree.get("level"),
        salary_min=salary.get("min"),
        salary_max=salary.get("max"),
        red_flags=ai_data.get("red_flags", []),
        h1b_risk_score=ai_data.get("h1b_risk_score", 5),
        summary=ai_data.get("summary"),
        raw_ai_response=ai_data,
    )
    db.add(analysis)

    match_score = ResumeMatchScore(
        job_id=job.id,
        resume_id=resume.id if resume else None,
        overall_score=breakdown.total,
        score_h1b=breakdown.h1b,
        score_level=breakdown.level,
        score_skills=breakdown.skills,
        score_location=breakdown.location,
        score_company=breakdown.company,
        score_product=breakdown.product,
        is_auto_rejected=breakdown.is_auto_rejected,
        auto_reject_reasons=breakdown.auto_reject_reasons,
        missing_keywords=ai_score_data.get("missing_keywords", []),
        missing_evidence=ai_score_data.get("missing_evidence", []),
        recommended_bullets=ai_score_data.get("recommended_bullets", []),
        strengths=ai_score_data.get("strengths", []),
        concerns=ai_score_data.get("concerns", []),
        recommendation=breakdown.recommendation,
        recommendation_reason=breakdown.recommendation_reason,
    )
    db.add(match_score)
    await db.flush()
    await db.refresh(job)

    return job


async def get_job_detail(db: AsyncSession, job_id: UUID) -> Job | None:
    result = await db.execute(
        select(Job)
        .options(
            selectinload(Job.analysis),
            selectinload(Job.match_score),
            selectinload(Job.application),
        )
        .where(Job.id == job_id)
    )
    return result.scalar_one_or_none()


async def list_jobs(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    discovered: bool | None = None,
    posted_after: datetime | None = None,
) -> list[Job]:
    query = (
        select(Job)
        .options(
            selectinload(Job.analysis),
            selectinload(Job.match_score),
            selectinload(Job.application),
        )
        .order_by(Job.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if discovered is not None:
        query = query.where(Job.discovered == discovered)
    if posted_after is not None:
        query = query.where(Job.posted_at >= posted_after)
    result = await db.execute(query)
    return list(result.scalars().all())


async def rescore_all_jobs(db: AsyncSession) -> dict:
    """Recompute the rule-based score for every analyzed job.

    Only the deterministic breakdown is redone — the AI gap analysis already stored
    on each match score is left alone, so this needs no API calls. Use it after
    editing the master resume or changing scoring rules.
    """
    resume = await _get_master_resume(db)
    resume_skills = resume_skills_for_scoring(resume)

    companies = (await db.execute(select(Company))).scalars().all()
    by_name = {c.name_normalized: c for c in companies}

    jobs = (
        await db.execute(
            select(Job).options(selectinload(Job.analysis), selectinload(Job.match_score))
        )
    ).scalars().all()

    rescored = 0
    changed = 0
    skipped = 0
    recommendation_changes: list[dict] = []

    for job in jobs:
        analysis = job.analysis
        if not analysis:
            skipped += 1
            continue

        company = by_name.get(_normalize_company_name(analysis.company_name or "")) if analysis.company_name else None
        breakdown = scorer.compute_score(
            analysis=analysis.raw_ai_response,
            jd_text_lower=job.raw_text.lower(),
            resume_matched_skills=resume_skills,
            company_h1b_total=company.h1b_total_filings if company else 0,
            company_h1b_rate=company.h1b_approval_rate if company else None,
            company_swe_filings=company.h1b_swe_filings if company else 0,
            company_size=company.size if company else None,
        )

        score = job.match_score
        if not score:
            score = ResumeMatchScore(job_id=job.id, resume_id=resume.id if resume else None)
            db.add(score)

        previous_total = score.overall_score
        previous_recommendation = score.recommendation
        _apply_breakdown(score, breakdown)
        if resume:
            score.resume_id = resume.id
        db.add(score)

        rescored += 1
        if abs(previous_total - breakdown.total) > 0.05:
            changed += 1
        if previous_recommendation != breakdown.recommendation:
            recommendation_changes.append({
                "job_id": str(job.id),
                "title": analysis.title or job.title,
                "company_name": analysis.company_name or job.company_name,
                "from_recommendation": previous_recommendation.value if previous_recommendation else None,
                "to_recommendation": breakdown.recommendation.value,
                "from_score": round(previous_total, 1),
                "to_score": round(breakdown.total, 1),
            })

    await db.flush()
    return {
        "rescored": rescored,
        "score_changed": changed,
        "skipped_no_analysis": skipped,
        "recommendation_changes": recommendation_changes,
        "resume_name": resume.name if resume else None,
        "resume_skill_count": len(resume_skills),
    }


async def generate_resume_tailoring(db: AsyncSession, job_id: UUID) -> ResumeTailoring:
    """AI-tailor the master resume to this JD: rewritten text + coaching notes.

    Never invents experience — the prompt restricts rewriting to what's already true on
    the resume, and routes anything the candidate can't honestly claim into learning_gaps.
    """
    job = await get_job_detail(db, job_id)
    if not job:
        raise ValueError("Job not found")
    if not job.analysis:
        raise ValueError("Job not yet analyzed")

    resume = await _get_master_resume(db)
    if not resume:
        raise ValueError("No master resume set — add one on the Resume page first")

    ai_data = ai_parser.tailor_resume(resume.raw_text, job.analysis.raw_ai_response)

    tailoring = ResumeTailoring(
        job_id=job.id,
        resume_id=resume.id,
        tailored_text=ai_data.get("tailored_text", ""),
        keyword_coverage=ai_data.get("keyword_coverage", []),
        integration_suggestions=ai_data.get("integration_suggestions", []),
        trade_off_notes=ai_data.get("trade_off_notes", []),
        learning_gaps=ai_data.get("learning_gaps", []),
        change_notes=ai_data.get("change_notes", []),
    )
    db.add(tailoring)
    await db.flush()
    await db.refresh(tailoring)
    return tailoring


async def get_latest_tailoring(db: AsyncSession, job_id: UUID) -> ResumeTailoring | None:
    result = await db.execute(
        select(ResumeTailoring)
        .where(ResumeTailoring.job_id == job_id)
        .order_by(ResumeTailoring.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
