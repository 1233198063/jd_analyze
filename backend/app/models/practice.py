"""Daily interview-practice check-ins against a 30-day plan (see services/practice_plan.py)."""
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PracticeSettings(Base):
    """Single row (id=1): the daily budget, when the 30-day plan started, and when to remind."""
    __tablename__ = "practice_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    daily_minutes: Mapped[int] = mapped_column(Integer, default=90)
    start_date: Mapped[date] = mapped_column(Date)
    reminder_time: Mapped[str] = mapped_column(String(5), default="20:00")  # HH:MM, local time
    # When the last desktop reminder went out, so the hourly job reminds at most every few hours.
    last_reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PracticeLog(Base):
    """One practice session: a plan item (item_key set) or free practice (title only)."""
    __tablename__ = "practice_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    practiced_on: Mapped[date] = mapped_column(Date, index=True)
    track: Mapped[str] = mapped_column(String(20))  # react | leetcode | system_design
    minutes: Mapped[int] = mapped_column(Integer)
    item_key: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    difficulty: Mapped[str | None] = mapped_column(String(10), nullable=True)  # LeetCode: easy | medium | hard
    # The track's own bar: React = working build within 60 min; LeetCode = solved without hints;
    # System Design = covered components, data flow, requests, performance and error handling.
    met_bar: Mapped[bool] = mapped_column(Boolean, default=False)
    # The actual goal of the month: talking through the approach while writing it.
    explained_aloud: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
