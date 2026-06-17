from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.models.job import JobSource, SponsorshipStatus, JobLevel, Recommendation


class JobCreate(BaseModel):
    url: Optional[str] = None
    raw_text: Optional[str] = None
    source: JobSource = JobSource.manual

    @field_validator("raw_text", "url", mode="before")
    @classmethod
    def at_least_one(cls, v):
        return v


class JobOut(BaseModel):
    id: UUID
    url: Optional[str]
    title: Optional[str]
    company_name: Optional[str]
    source: JobSource
    created_at: datetime

    model_config = {"from_attributes": True}


class SponsorshipInfo(BaseModel):
    status: SponsorshipStatus
    raw_text: Optional[str]
    signals: list[str]


class RedFlag(BaseModel):
    flag: str
    severity: str   # high | medium | low
    category: str


class JobAnalysisOut(BaseModel):
    id: UUID
    job_id: UUID
    title: Optional[str]
    company_name: Optional[str]
    level: JobLevel
    years_min: Optional[int]
    years_max: Optional[int]
    location: Optional[str]
    is_remote: bool
    is_hybrid: bool
    sponsorship_status: SponsorshipStatus
    sponsorship_raw_text: Optional[str]
    sponsorship_signals: list[str]
    tech_stack: list[str]
    required_skills: list[str]
    nice_to_have_skills: list[str]
    degree_required: bool
    degree_preferred: bool
    degree_level: Optional[str]
    salary_min: Optional[int]
    salary_max: Optional[int]
    red_flags: list[dict]
    is_contract: bool
    h1b_risk_score: int
    summary: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class MissingEvidence(BaseModel):
    requirement: str
    gap: str


class RecommendedBullet(BaseModel):
    for_skill: str
    bullet: str


class ResumeMatchScoreOut(BaseModel):
    id: UUID
    job_id: UUID
    overall_score: float
    score_h1b: float
    score_level: float
    score_skills: float
    score_location: float
    score_company: float
    score_product: float
    is_auto_rejected: bool
    auto_reject_reasons: list[str]
    missing_keywords: list[str]
    missing_evidence: list[dict]
    recommended_bullets: list[dict]
    strengths: list[str]
    concerns: list[str]
    recommendation: Recommendation
    recommendation_reason: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class JobDetailOut(BaseModel):
    job: JobOut
    analysis: Optional[JobAnalysisOut]
    match_score: Optional[ResumeMatchScoreOut]

    model_config = {"from_attributes": True}


class JobListItem(BaseModel):
    id: UUID
    url: Optional[str]
    title: Optional[str]
    company_name: Optional[str]
    source: JobSource
    created_at: datetime
    overall_score: Optional[float] = None
    recommendation: Optional[Recommendation] = None
    is_auto_rejected: Optional[bool] = None
    sponsorship_status: Optional[SponsorshipStatus] = None
    application_status: Optional[str] = None

    model_config = {"from_attributes": True}
