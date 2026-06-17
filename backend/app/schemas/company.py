from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.models.company import CompanySize, H1BCaseStatus


class CompanyOut(BaseModel):
    id: UUID
    name: str
    domain: Optional[str]
    size: CompanySize
    industry: Optional[str]
    h1b_total_filings: int
    h1b_approved: int
    h1b_denied: int
    h1b_approval_rate: Optional[float]
    h1b_latest_year: Optional[int]
    h1b_swe_filings: int
    e_verify_registered: Optional[bool]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class H1BRecordOut(BaseModel):
    id: UUID
    case_number: Optional[str]
    case_status: H1BCaseStatus
    visa_class: str
    fiscal_year: int
    job_title: Optional[str]
    soc_code: Optional[str]
    wage_rate: Optional[float]
    wage_unit: Optional[str]
    worksite_city: Optional[str]
    worksite_state: Optional[str]
    data_source: str

    model_config = {"from_attributes": True}


class CompanyDetailOut(BaseModel):
    company: CompanyOut
    recent_records: list[H1BRecordOut]
    swe_records: list[H1BRecordOut]
    yearly_summary: list[dict]

    model_config = {"from_attributes": True}


class H1BImportResult(BaseModel):
    companies_created: int
    companies_updated: int
    records_imported: int
    errors: list[str]
