import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Float, Boolean, ForeignKey, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class H1BCaseStatus(str, enum.Enum):
    certified = "certified"
    certified_withdrawn = "certified_withdrawn"
    denied = "denied"
    withdrawn = "withdrawn"


class CompanySize(str, enum.Enum):
    startup = "startup"        # <50
    small = "small"            # 50-200
    medium = "medium"          # 200-1000
    large = "large"            # 1000-10000
    enterprise = "enterprise"  # 10000+
    unknown = "unknown"


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name_normalized: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain: Mapped[str | None] = mapped_column(String(255))
    size: Mapped[CompanySize] = mapped_column(Enum(CompanySize), default=CompanySize.unknown)
    industry: Mapped[str | None] = mapped_column(String(255))

    # H-1B aggregate stats
    h1b_total_filings: Mapped[int] = mapped_column(Integer, default=0)
    h1b_approved: Mapped[int] = mapped_column(Integer, default=0)
    h1b_denied: Mapped[int] = mapped_column(Integer, default=0)
    h1b_approval_rate: Mapped[float | None] = mapped_column(Float)
    h1b_latest_year: Mapped[int | None] = mapped_column(Integer)
    h1b_swe_filings: Mapped[int] = mapped_column(Integer, default=0)  # SWE-specific

    # STEM OPT
    e_verify_registered: Mapped[bool | None] = mapped_column(Boolean)

    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    h1b_records: Mapped[list["H1BRecord"]] = relationship("H1BRecord", back_populates="company", cascade="all, delete-orphan")


class H1BRecord(Base):
    """Individual LCA/H-1B case record imported from DOL disclosure data."""
    __tablename__ = "h1b_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))

    # From DOL LCA / OFLC disclosure data
    case_number: Mapped[str | None] = mapped_column(String(50), index=True)
    case_status: Mapped[H1BCaseStatus] = mapped_column(Enum(H1BCaseStatus))
    visa_class: Mapped[str] = mapped_column(String(20))  # H-1B, H-1B1, E-3
    fiscal_year: Mapped[int] = mapped_column(Integer, index=True)

    job_title: Mapped[str | None] = mapped_column(String(255))
    soc_code: Mapped[str | None] = mapped_column(String(20))
    soc_title: Mapped[str | None] = mapped_column(String(255))

    wage_rate: Mapped[float | None] = mapped_column(Float)
    wage_unit: Mapped[str | None] = mapped_column(String(20))  # Year, Hour
    prevailing_wage: Mapped[float | None] = mapped_column(Float)

    worksite_city: Mapped[str | None] = mapped_column(String(100))
    worksite_state: Mapped[str | None] = mapped_column(String(10))

    # Source metadata
    data_source: Mapped[str] = mapped_column(String(50))  # "DOL_LCA", "USCIS_H1B"

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship("Company", back_populates="h1b_records")
