"""When the user last opened a job source that the app can't fetch on its own (login-only portals)."""
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourceCheck(Base):
    __tablename__ = "source_checks"

    # A key from endpoints/sources.py WATCHED_SOURCES, e.g. "northeastern_symplicity".
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
