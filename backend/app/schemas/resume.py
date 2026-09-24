from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime


class ResumeCreate(BaseModel):
    name: str
    is_master: bool = False
    track: Optional[str] = None
    raw_text: str


class ResumeUpdate(BaseModel):
    name: Optional[str] = None
    is_master: Optional[bool] = None
    track: Optional[str] = None
    raw_text: Optional[str] = None


class ResumeOut(BaseModel):
    id: UUID
    name: str
    is_master: bool
    track: Optional[str] = None
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


class ResumeCandidateOut(BaseModel):
    resume_id: UUID
    name: str
    track: Optional[str]
    score: int
    shared_skills: list[str]
    track_skill_hits: list[str]
    title_hits: list[str]


class ResumePickOut(BaseModel):
    """Deterministic pick — no AI call, so it can render as soon as the page opens."""
    job_id: UUID
    recommended: Optional[ResumeCandidateOut]
    runner_up: Optional[ResumeCandidateOut]
    reason: Optional[str]
    runner_up_reason: Optional[str]
    is_close_call: bool = False


class ResumeRevisionOut(BaseModel):
    id: UUID
    job_id: UUID
    resume_id: Optional[UUID]
    resume_name: Optional[str] = None
    revised_text: str
    changes: list[dict]
    keyword_coverage: list[dict]
    new_numbers: list[str]
    is_stretch: bool
    stretch_reason: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class InterviewAnswerRequest(BaseModel):
    question: str


class InterviewAnswerOut(BaseModel):
    job_id: UUID
    question: str
    answer: str
