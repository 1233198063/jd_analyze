from datetime import date, timedelta
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.network import NetworkContact
from app.services import network_service as svc

router = APIRouter(prefix="/network", tags=["network"])

Stage = Literal["to_contact", "messaged", "replied", "scheduled", "chatted", "referred", "dormant"]
Source = Literal["alumni", "coworker", "linkedin", "event", "referral", "other"]
EventType = Literal["message", "reply", "scheduled", "chat", "follow_up", "referral"]


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company: Optional[str] = Field(default=None, max_length=160)
    role: Optional[str] = Field(default=None, max_length=160)
    source: Source = "linkedin"
    linkedin_url: Optional[str] = Field(default=None, max_length=500)
    stage: Stage = "to_contact"
    next_follow_up: Optional[date] = None
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    # Omitted fields stay as they are.
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    company: Optional[str] = Field(default=None, max_length=160)
    role: Optional[str] = Field(default=None, max_length=160)
    source: Optional[Source] = None
    linkedin_url: Optional[str] = Field(default=None, max_length=500)
    stage: Optional[Stage] = None
    next_follow_up: Optional[date] = None
    notes: Optional[str] = None


class EventCreate(BaseModel):
    type: EventType
    note: Optional[str] = Field(default=None, max_length=500)
    on: Optional[date] = None


def _clean(value: Optional[str]) -> Optional[str]:
    return (value or "").strip() or None


@router.get("")
async def network_overview(db: AsyncSession = Depends(get_db)):
    """Contacts, follow-ups due, this week's counts, pipeline companies with no contact yet, and the toolkit."""
    return await svc.overview(db)


@router.post("/contacts")
async def create_contact(payload: ContactCreate, db: AsyncSession = Depends(get_db)):
    contact = NetworkContact(
        name=payload.name.strip(),
        company=_clean(payload.company),
        role=_clean(payload.role),
        source=payload.source,
        linkedin_url=_clean(payload.linkedin_url),
        stage="to_contact",
        next_follow_up=payload.next_follow_up,
        notes=_clean(payload.notes),
        timeline=[],
    )
    # Adding someone you've already messaged records that message too.
    svc.apply_stage(contact, payload.stage, date.today(), follow_up_given=payload.next_follow_up is not None)
    db.add(contact)
    await db.flush()
    await db.refresh(contact)
    return svc.serialize(contact)


@router.patch("/contacts/{contact_id}")
async def update_contact(contact_id: UUID, payload: ContactUpdate, db: AsyncSession = Depends(get_db)):
    contact = await db.get(NetworkContact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    fields = payload.model_dump(exclude_unset=True)
    for key in ("name", "company", "role", "linkedin_url", "notes"):
        if key in fields:
            setattr(contact, key, _clean(fields[key]) if key != "name" else fields[key].strip())
    if "source" in fields:
        contact.source = fields["source"]
    if "next_follow_up" in fields:
        contact.next_follow_up = fields["next_follow_up"]
    if "stage" in fields:
        svc.apply_stage(contact, fields["stage"], date.today(), follow_up_given="next_follow_up" in fields)
    db.add(contact)
    await db.flush()
    await db.refresh(contact)
    return svc.serialize(contact)


@router.post("/contacts/{contact_id}/events")
async def log_event(contact_id: UUID, payload: EventCreate, db: AsyncSession = Depends(get_db)):
    """Record an interaction without changing stage — mostly "I followed up", which also pushes the next one out."""
    contact = await db.get(NetworkContact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    on = payload.on or date.today()
    svc.add_event(contact, payload.type, on, _clean(payload.note))
    if payload.type == "follow_up":
        contact.next_follow_up = on + timedelta(days=svc.FOLLOW_UP_AGAIN_DAYS)
    db.add(contact)
    await db.flush()
    await db.refresh(contact)
    return svc.serialize(contact)


@router.delete("/contacts/{contact_id}", status_code=204)
async def delete_contact(contact_id: UUID, db: AsyncSession = Depends(get_db)):
    contact = await db.get(NetworkContact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    await db.delete(contact)
