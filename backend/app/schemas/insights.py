from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.models.skill_study import StudyStatus


class SkillStudyUpsert(BaseModel):
    status: StudyStatus
    note: Optional[str] = None


class SkillStudyOut(BaseModel):
    skill: str
    status: StudyStatus
    note: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    updated_at: datetime

    model_config = {"from_attributes": True}


class GapMeta(BaseModel):
    resume_name: Optional[str]
    jobs_total: int
    jobs_considered: int
    scope: str
    generated_at: datetime


class RoleCount(BaseModel):
    role: str
    count: int


class ExampleJob(BaseModel):
    job_id: str
    title: Optional[str]
    company_name: Optional[str]
    overall_score: float


class SkillGap(BaseModel):
    skill: str
    jd_count: int
    required_count: int
    nice_to_have_count: int
    frequency_pct: float
    avg_job_score: float
    priority: str  # high | medium | low
    priority_score: float
    top_roles: list[RoleCount]
    how_to_learn: Optional[str]
    example_jobs: list[ExampleJob]
    study: Optional[SkillStudyOut] = None


class RoleGapSummary(BaseModel):
    role: str
    jd_count: int
    top_gaps: list[dict]


class SkillStrength(BaseModel):
    skill: str
    jd_count: int
    frequency_pct: float


class ReadingProgress(BaseModel):
    want_to_read: int
    reading: int
    finished: int


class ResumeGapReport(BaseModel):
    meta: GapMeta
    gaps: list[SkillGap]
    by_role: list[RoleGapSummary]
    strengths: list[SkillStrength]
    reading_progress: ReadingProgress
