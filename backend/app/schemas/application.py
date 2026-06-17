from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.models.application import ApplicationStatus, RejectionReason


class ApplicationCreate(BaseModel):
    job_id: UUID
    status: ApplicationStatus = ApplicationStatus.saved
    notes: Optional[str] = None


class ApplicationUpdate(BaseModel):
    status: Optional[ApplicationStatus] = None
    referral_contact_name: Optional[str] = None
    referral_contact_url: Optional[str] = None
    referral_message_sent: Optional[bool] = None
    rejection_reason: Optional[RejectionReason] = None
    rejection_notes: Optional[str] = None
    notes: Optional[str] = None


class TimelineEvent(BaseModel):
    status: ApplicationStatus
    timestamp: datetime
    note: Optional[str]


class ApplicationOut(BaseModel):
    id: UUID
    job_id: UUID
    status: ApplicationStatus
    applied_at: Optional[datetime]
    rejected_at: Optional[datetime]
    referral_contact_name: Optional[str]
    referral_contact_url: Optional[str]
    referral_message_sent: bool
    rejection_reason: Optional[RejectionReason]
    rejection_notes: Optional[str]
    timeline: list[dict]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class KanbanColumn(BaseModel):
    status: ApplicationStatus
    label: str
    items: list[dict]
