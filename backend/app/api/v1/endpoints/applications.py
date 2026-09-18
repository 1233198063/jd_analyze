from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.application import Application, ApplicationStatus
from app.schemas.application import (
    ApplicationCreate,
    ApplicationUpdate,
    ApplicationOut,
    KanbanColumn,
    TimelineEventUpdate,
)

router = APIRouter(prefix="/applications", tags=["applications"])

KANBAN_ORDER = [
    ApplicationStatus.saved,
    ApplicationStatus.applied,
    ApplicationStatus.referral_asked,
    ApplicationStatus.oa,
    ApplicationStatus.phone_screen,
    ApplicationStatus.interview,
    ApplicationStatus.offer,
    ApplicationStatus.rejected,
    ApplicationStatus.withdrawn,
]

STATUS_LABELS = {
    ApplicationStatus.saved: "Saved",
    ApplicationStatus.applied: "Applied",
    ApplicationStatus.referral_asked: "Referral Asked",
    ApplicationStatus.oa: "OA",
    ApplicationStatus.phone_screen: "Phone Screen",
    ApplicationStatus.interview: "Interview",
    ApplicationStatus.offer: "Offer",
    ApplicationStatus.rejected: "Rejected",
    ApplicationStatus.withdrawn: "Withdrawn",
}


def _timeline_event(status: ApplicationStatus, when: datetime) -> dict:
    event = {"status": status.value, "timestamp": when.isoformat()}
    if status == ApplicationStatus.applied:
        event["note"] = "Submitted application"
    return event


def _sync_milestone_dates(app: Application) -> None:
    """Re-derive applied_at / rejected_at from the timeline, which is the record of truth."""
    for event in app.timeline or []:
        raw = event.get("timestamp")
        if not raw:
            continue
        try:
            when = datetime.fromisoformat(raw)
        except ValueError:
            continue
        if event.get("status") == ApplicationStatus.applied.value:
            app.applied_at = when
        elif event.get("status") == ApplicationStatus.rejected.value:
            app.rejected_at = when


@router.post("/", response_model=ApplicationOut)
async def create_application(payload: ApplicationCreate, db: AsyncSession = Depends(get_db)):
    # Check no duplicate
    existing = await db.execute(
        select(Application).where(Application.job_id == payload.job_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Application already exists for this job")

    when = payload.event_date or datetime.now(timezone.utc)
    app = Application(
        job_id=payload.job_id,
        status=payload.status,
        notes=payload.notes,
        apply_url=payload.apply_url,
        timeline=[_timeline_event(payload.status, when)],
    )
    # An application created straight at a milestone status still needs its date —
    # only update_application used to set these, so those rows lost the date entirely.
    if payload.status == ApplicationStatus.applied:
        app.applied_at = when
    elif payload.status == ApplicationStatus.rejected:
        app.rejected_at = when

    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.patch("/{app_id}", response_model=ApplicationOut)
async def update_application(app_id: UUID, payload: ApplicationUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if payload.status and payload.status != app.status:
        when = payload.event_date or datetime.now(timezone.utc)
        app.status = payload.status
        if payload.status == ApplicationStatus.applied:
            app.applied_at = when
        elif payload.status == ApplicationStatus.rejected:
            app.rejected_at = when
        app.timeline = [*(app.timeline or []), _timeline_event(payload.status, when)]

    # event_date drives the timeline above rather than being a column of its own.
    for field, value in payload.model_dump(exclude_none=True, exclude={"status", "event_date"}).items():
        setattr(app, field, value)

    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.get("/kanban", response_model=list[KanbanColumn])
async def get_kanban(db: AsyncSession = Depends(get_db)):
    from app.models.job import Job
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job))
        .order_by(Application.updated_at.desc())
    )
    all_apps = result.scalars().all()

    by_status: dict[ApplicationStatus, list] = {s: [] for s in KANBAN_ORDER}
    for app in all_apps:
        item = {
            "id": str(app.id),
            "job_id": str(app.job_id),
            "company": app.job.company_name if app.job else None,
            "title": app.job.title if app.job else None,
            "applied_at": app.applied_at.isoformat() if app.applied_at else None,
            "rejection_reason": app.rejection_reason.value if app.rejection_reason else None,
            "notes": app.notes,
            "apply_url": app.apply_url,
            "rejected_at": app.rejected_at.isoformat() if app.rejected_at else None,
            "timeline": app.timeline or [],
            "status_since": (app.timeline or [{}])[-1].get("timestamp"),
        }
        if app.status in by_status:
            by_status[app.status].append(item)

    return [
        KanbanColumn(status=s, label=STATUS_LABELS[s], items=by_status[s])
        for s in KANBAN_ORDER
    ]


@router.get("/{app_id}", response_model=ApplicationOut)
async def get_application(app_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.patch("/{app_id}/timeline/{event_index}", response_model=ApplicationOut)
async def update_timeline_event(
    app_id: UUID,
    event_index: int,
    payload: TimelineEventUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Correct the date or note of a already-recorded step."""
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    timeline = list(app.timeline or [])
    if not 0 <= event_index < len(timeline):
        raise HTTPException(status_code=404, detail="Timeline event not found")

    event = dict(timeline[event_index])
    if payload.timestamp:
        event["timestamp"] = payload.timestamp.isoformat()
    if payload.note is not None:
        event["note"] = payload.note
    timeline[event_index] = event

    # Keep steps in chronological order so the UI doesn't have to sort around edits.
    timeline.sort(key=lambda e: e.get("timestamp") or "")
    app.timeline = timeline
    _sync_milestone_dates(app)

    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.delete("/{app_id}", status_code=204)
async def delete_application(app_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(app)
