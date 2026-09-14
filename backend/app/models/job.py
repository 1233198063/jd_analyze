import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Float, Boolean, ForeignKey, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class JobSource(str, enum.Enum):
    manual = "manual"
    greenhouse = "greenhouse"
    lever = "lever"
    ashby = "ashby"
    workday = "workday"
    other = "other"


class SponsorshipStatus(str, enum.Enum):
    sponsors = "sponsors"
    no_sponsor = "no_sponsor"
    unknown = "unknown"


class JobLevel(str, enum.Enum):
    intern = "intern"
    entry = "entry"       # 0-2 years, SWE I, associate
    junior = "junior"     # 2-4 years
    mid = "mid"           # 3-5 years
    senior = "senior"
    staff = "staff"
    principal = "principal"
    manager = "manager"
    unknown = "unknown"


class Recommendation(str, enum.Enum):
    apply = "apply"
    maybe = "maybe"
    skip = "skip"
    auto_reject = "auto_reject"


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[JobSource] = mapped_column(Enum(JobSource), default=JobSource.manual)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    discovered: Mapped[bool] = mapped_column(Boolean, default=False)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    analysis: Mapped["JobAnalysis | None"] = relationship("JobAnalysis", back_populates="job", uselist=False)
    match_score: Mapped["ResumeMatchScore | None"] = relationship("ResumeMatchScore", back_populates="job", uselist=False)
    application: Mapped["Application | None"] = relationship("Application", back_populates="job", uselist=False)


class JobAnalysis(Base):
    __tablename__ = "job_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)

    title: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    level: Mapped[JobLevel] = mapped_column(Enum(JobLevel), default=JobLevel.unknown)
    years_min: Mapped[int | None] = mapped_column(Integer)
    years_max: Mapped[int | None] = mapped_column(Integer)

    location: Mapped[str | None] = mapped_column(String(255))
    is_remote: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hybrid: Mapped[bool] = mapped_column(Boolean, default=False)

    # Sponsorship
    sponsorship_status: Mapped[SponsorshipStatus] = mapped_column(Enum(SponsorshipStatus), default=SponsorshipStatus.unknown)
    sponsorship_raw_text: Mapped[str | None] = mapped_column(Text)
    sponsorship_signals: Mapped[list] = mapped_column(JSONB, default=list)

    # Skills & tech
    tech_stack: Mapped[list] = mapped_column(JSONB, default=list)
    required_skills: Mapped[list] = mapped_column(JSONB, default=list)
    nice_to_have_skills: Mapped[list] = mapped_column(JSONB, default=list)

    # Education
    degree_required: Mapped[bool] = mapped_column(Boolean, default=False)
    degree_preferred: Mapped[bool] = mapped_column(Boolean, default=False)
    degree_level: Mapped[str | None] = mapped_column(String(20))  # BS, MS, PhD

    # Salary
    salary_min: Mapped[int | None] = mapped_column(Integer)
    salary_max: Mapped[int | None] = mapped_column(Integer)

    # Flags
    red_flags: Mapped[list] = mapped_column(JSONB, default=list)
    is_contract: Mapped[bool] = mapped_column(Boolean, default=False)

    # Auto-computed scores per dimension
    h1b_risk_score: Mapped[int] = mapped_column(Integer, default=5)  # 0=safe, 10=risky
    summary: Mapped[str | None] = mapped_column(Text)

    raw_ai_response: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["Job"] = relationship("Job", back_populates="analysis")


class ResumeMatchScore(Base):
    __tablename__ = "resume_match_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)
    resume_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True)

    # Composite score (0–100) with breakdown
    overall_score: Mapped[float] = mapped_column(Float, default=0)
    score_h1b: Mapped[float] = mapped_column(Float, default=0)       # /30
    score_level: Mapped[float] = mapped_column(Float, default=0)     # /20
    score_skills: Mapped[float] = mapped_column(Float, default=0)    # /20
    score_location: Mapped[float] = mapped_column(Float, default=0)  # /10
    score_company: Mapped[float] = mapped_column(Float, default=0)   # /10
    score_product: Mapped[float] = mapped_column(Float, default=0)   # /10

    # Auto-reject flags
    is_auto_rejected: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_reject_reasons: Mapped[list] = mapped_column(JSONB, default=list)

    # Resume gap analysis
    missing_keywords: Mapped[list] = mapped_column(JSONB, default=list)
    missing_evidence: Mapped[list] = mapped_column(JSONB, default=list)
    recommended_bullets: Mapped[list] = mapped_column(JSONB, default=list)
    strengths: Mapped[list] = mapped_column(JSONB, default=list)
    concerns: Mapped[list] = mapped_column(JSONB, default=list)

    recommendation: Mapped[Recommendation] = mapped_column(Enum(Recommendation), default=Recommendation.maybe)
    recommendation_reason: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["Job"] = relationship("Job", back_populates="match_score")
    resume: Mapped["Resume | None"] = relationship("Resume")
