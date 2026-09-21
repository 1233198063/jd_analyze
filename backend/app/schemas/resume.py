from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class ResumeCreate(BaseModel):
    name: str
    is_master: bool = False
    raw_text: str


class ResumeUpdate(BaseModel):
    name: Optional[str] = None
    is_master: Optional[bool] = None
    raw_text: Optional[str] = None


class ResumeOut(BaseModel):
    id: UUID
    name: str
    is_master: bool
    raw_text: str
    parsed_sections: dict
    skills: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReferralMessageOut(BaseModel):
    job_id: UUID
    company_name: Optional[str]
    title: Optional[str]
    message: str
    subject_line: str
    tips: list[str]


class CoverLetterOut(BaseModel):
    job_id: UUID
    company_name: Optional[str]
    title: Optional[str]
    greeting: str
    body: str
    sign_off: str
