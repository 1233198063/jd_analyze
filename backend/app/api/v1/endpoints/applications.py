from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.application import Application, ApplicationStatus
from app.schemas.application import ApplicationCreate, ApplicationUpdate, ApplicationOut, KanbanColumn

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


@router.post("/", response_model=ApplicationOut)
async def create_application(payload: ApplicationCreate, db: AsyncSession = Depends(get_db)):
    # Check no duplicate
    existing = await db.execute(
        select(Application).where(Application.job_id == payload.job_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Application already exists for this job")

    app = Application(
        job_id=payload.job_id,
        status=payload.status,
        notes=payload.notes,
        timeline=[{"status": payload.status.value, "timestamp": datetime.now(timezone.utc).isoformat()}],
    )
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
        app.status = payload.status
        timeline = list(app.timeline or [])
        event = {"status": payload.status.value, "timestamp": datetime.now(timezone.utc).isoformat()}
        if payload.status == ApplicationStatus.applied:
            app.applied_at = datetime.now(timezone.utc)
            event["note"] = "Submitted application"
        if payload.status == ApplicationStatus.rejected:
            app.rejected_at = datetime.now(timezone.utc)
        timeline.append(event)
        app.timeline = timeline

    for field, value in payload.model_dump(exclude_none=True, exclude={"status"}).items():
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
        }
        if app.status in by_status:
            by_status[app.status].append(item)

    return [
        KanbanColumn(status=s, label=STATUS_LABELS[s], items=by_status[s])
        for s in KANBAN_ORDER
    ]


@router.delete("/{app_id}", status_code=204)
async def delete_application(app_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(app)
