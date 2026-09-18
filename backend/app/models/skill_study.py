import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StudyStatus(str, enum.Enum):
    want_to_read = "want_to_read"   # 想读
    reading = "reading"             # 在读
    finished = "finished"           # 已读


class SkillStudy(Base):
    """Reading-list state for one skill gap.

    Keyed by the canonical skill name produced by services.skills, which is what
    gap analysis reports — so a row survives the gap list being recomputed.
    """
    __tablename__ = "skill_studies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    skill: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    status: Mapped[StudyStatus] = mapped_column(Enum(StudyStatus), default=StudyStatus.want_to_read)

    # Free-form reading notes: what you covered, where you left off.
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
