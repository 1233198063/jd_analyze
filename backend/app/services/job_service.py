"""
Orchestrates: scrape → AI parse → company lookup → score → persist.
"""
from __future__ import annotations
import re
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.job import Job, JobAnalysis, ResumeMatchScore, JobSource, SponsorshipStatus, JobLevel, Recommendation
from app.models.company import Company
from app.models.resume import Resume
from app.schemas.job import JobCreate
from app.services import ai_parser, scorer
from app.services.jd_scraper import fetch_jd_from_url


async def _get_master_resume(db: AsyncSession) -> Resume | None:
    result = await db.execute(select(Resume).where(Resume.is_master == True).limit(1))
    return result.scalar_one_or_none()


async def _get_company(db: AsyncSession, name: str | None) -> Company | None:
    if not name:
        return None
    normalized = re.sub(r"[^\w\s]", "", name.lower()).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    result = await db.execute(select(Company).where(Company.name_normalized == normalized))
    return result.scalar_one_or_none()


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

    # Step 3: company lookup
    company = await _get_company(db, ai_data.get("company_name"))

    # Step 4: master resume skills for scoring
    resume = await _get_master_resume(db)
    resume_skills = resume.skills if resume else []

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


async def list_jobs(db: AsyncSession, skip: int = 0, limit: int = 50) -> list[Job]:
    result = await db.execute(
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
    return list(result.scalars().all())
