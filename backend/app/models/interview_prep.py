"""The "boss prep" checklist a job unlocks once its application reaches a phone screen or interview."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InterviewPrep(Base):
    __tablename__ = "interview_preps"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), unique=True, index=True
    )
    # ai_parser.generate_interview_prep's output: company_brief, why_company, star_stories,
    # system_design, coding_focus, questions_to_ask.
    content: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Keys of the items the user has ticked off ("brief", "star:0", "sd:1", ...).
    checked: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
