import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # More than one resume can be a master: the same real experience, weighted for a
    # different kind of role. `track` is what picks between them for a given JD.
    is_master: Mapped[bool] = mapped_column(Boolean, default=False)
    track: Mapped[str | None] = mapped_column(String(20))  # frontend | fullstack | None
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)

    # Parsed sections: {summary, experience: [...], education: [...], projects: [...]}
    parsed_sections: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Extracted skill tags
    skills: Mapped[list] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
