"""Progress on the GHC 26 guide (see services/ghc_guide.py): per-company outreach and checklist tasks."""
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GhcProgress(Base):
    """
    One row per guide item the user has touched. `key` is "company:<slug>" or "task:<slug>",
    matching the keys in ghc_guide. Plain strings rather than a Postgres ENUM, so adding a status
    never needs an ALTER TYPE.
    """
    __tablename__ = "ghc_progress"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    # company: applied | reached_out | met | interview | passed (absent = not started); task: done
    status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
