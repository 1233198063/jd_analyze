import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class ApplicationStatus(str, enum.Enum):
    saved = "saved"
    applied = "applied"
    referral_asked = "referral_asked"
    oa = "oa"                    # Online assessment
    phone_screen = "phone_screen"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"
    withdrawn = "withdrawn"


class RejectionReason(str, enum.Enum):
    sponsorship = "sponsorship"
    level = "level"
    resume = "resume"
    # Boilerplate "we moved forward with other candidates" reply, pre-interview and
    # with no reason given. Distinct from `resume` (which asserts a cause you were
    # told or inferred) and from `no_response` (where they never replied at all).
    form_rejection = "form_rejection"
    no_response = "no_response"
    oa_failed = "oa_failed"
    interview_failed = "interview_failed"
    other = "other"
    unknown = "unknown"


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), unique=True)

    status: Mapped[ApplicationStatus] = mapped_column(Enum(ApplicationStatus), default=ApplicationStatus.saved)

    # Link to the actual application you submitted (Workday/Greenhouse status page,
    # confirmation email link, etc.) so it can be reopened later to check status.
    apply_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Referral tracking
    referral_contact_name: Mapped[str | None] = mapped_column(String(255))
    referral_contact_url: Mapped[str | None] = mapped_column(String(500))
    referral_message_sent: Mapped[bool] = mapped_column(default=False)

    # Which resume went out, and the exact text sent — the master itself keeps changing, so
    # only a snapshot can say later what this company actually saw.
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True
    )
    resume_snapshot: Mapped[str | None] = mapped_column(Text)
    # True when the snapshot differed from the master at send time; None when unknown
    # (recorded after the fact, without the text).
    resume_tailored: Mapped[bool | None] = mapped_column(nullable=True)

    # Rejection intel
    rejection_reason: Mapped[RejectionReason | None] = mapped_column(Enum(RejectionReason), nullable=True)
    rejection_notes: Mapped[str | None] = mapped_column(Text)

    # Timeline events stored as [{status, timestamp, note}]
    timeline: Mapped[list] = mapped_column(JSONB, default=list)
    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    job: Mapped["Job"] = relationship("Job", back_populates="application")
    resume: Mapped["Resume | None"] = relationship("Resume")


class ApplicationInsight(Base):
    """An AI write-up of application outcomes, kept so it isn't regenerated on every visit.
    The counts record how much data it was based on, so the page can say when it's stale."""
    __tablename__ = "application_insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sent_count: Mapped[int] = mapped_column(Integer)
    rejected_count: Mapped[int] = mapped_column(Integer)
    summary: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
