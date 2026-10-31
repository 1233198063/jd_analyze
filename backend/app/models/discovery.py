"""What daily discovery actually covered: one row per run, one row per company board."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DiscoveryRun(Base):
    __tablename__ = "discovery_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trigger: Mapped[str] = mapped_column(String(20))  # scheduled | manual
    status: Mapped[str] = mapped_column(String(20), default="running")  # running | done | error
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The counts run_discovery returns (companies_checked, created, carried_over, ...).
    summary: Mapped[dict] = mapped_column(JSONB, default=dict)
    error: Mapped[str | None] = mapped_column(Text)


class DiscoveryCompanyCheck(Base):
    """Scan state of one company board, keyed by its name in company_boards.SEED_COMPANIES."""
    __tablename__ = "discovery_company_checks"

    company: Mapped[str] = mapped_column(String(255), primary_key=True)
    last_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Every matching posting published before this has been handled (added, already in the DB,
    # or failed analysis). The next scan starts here, so a missed day or a failed fetch is
    # picked up later instead of aging out of a fixed "last N days" window.
    covered_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
