"""People the user is networking with — coffee chats, referrals, follow-ups (see services/network_service.py)."""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NetworkContact(Base):
    __tablename__ = "network_contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    company: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    role: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # How you know them: alumni | coworker | linkedin | event | referral | other
    source: Mapped[str] = mapped_column(String(20), default="linkedin")
    linkedin_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Plain strings, not a Postgres ENUM, so adding a stage never needs an ALTER TYPE.
    # to_contact | messaged | replied | scheduled | chatted | referred | dormant
    stage: Mapped[str] = mapped_column(String(20), default="to_contact")
    next_follow_up: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Every interaction, [{type, date, note}] with type message | reply | scheduled | chat | follow_up | referral.
    # The weekly counts are read from here, so stage changes append to it too.
    timeline: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
