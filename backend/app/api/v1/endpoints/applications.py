from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone

from app.core.database import get_db
from app.models.application import Application, ApplicationStatus
from app.models.resume import Resume
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


# Notes a step gets automatically, so a corrected step can drop or gain them with its stage.
DEFAULT_NOTES = {ApplicationStatus.applied.value: "Submitted application"}
MILESTONE_DATES = {
    ApplicationStatus.applied.value: "applied_at",
    ApplicationStatus.rejected.value: "rejected_at",
}


def _timeline_event(status: ApplicationStatus, when: datetime) -> dict:
    event = {"status": status.value, "timestamp": when.isoformat()}
    if status.value in DEFAULT_NOTES:
        event["note"] = DEFAULT_NOTES[status.value]
    return event


def _sync_from_timeline(app: Application, dropped: frozenset[str] = frozenset()) -> None:
    """Re-derive the current status and applied_at / rejected_at from the timeline, which is
    the record of truth. `dropped` holds stages an edit just took out, so their date is
    cleared instead of pointing at a step that no longer exists."""
    timeline = app.timeline or []
    if timeline:
        app.status = ApplicationStatus(timeline[-1]["status"])
    found = {}
    for event in timeline:
        attr = MILESTONE_DATES.get(event.get("status"))
        raw = event.get("timestamp")
        if not attr or not raw:
            continue
        try:
            found[attr] = datetime.fromisoformat(raw)
        except ValueError:
            continue
    for status, attr in MILESTONE_DATES.items():
        if attr in found:
            setattr(app, attr, found[attr])
        elif status in dropped:
            setattr(app, attr, None)


async def _get_app(db: AsyncSession, app_id: UUID) -> Application:
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


def _normalized(text: str) -> str:
    return " ".join(text.split())


async def _record_resume(
    db: AsyncSession, app: Application, resume_id: UUID | None, snapshot: str | None
) -> None:
    """Attach the resume sent. Whether it was tailored is decided now, against the master as
    it stands at send time — masters keep being edited, so a later comparison means nothing."""
    if resume_id is None:
        return
    resume = await db.get(Resume, resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    app.resume_id = resume.id
    if snapshot and snapshot.strip():
        app.resume_snapshot = snapshot
        app.resume_tailored = _normalized(snapshot) != _normalized(resume.raw_text)
    else:
        # Recorded after the fact: which resume is known, the exact text sent isn't.
        app.resume_snapshot = None
        app.resume_tailored = None


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
    await _record_resume(db, app, payload.resume_id, payload.resume_snapshot)

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

    # event_date drives the timeline above rather than being a column of its own, and the
    # resume fields need the tailored check, so neither is copied across verbatim.
    excluded = {"status", "event_date", "resume_id", "resume_snapshot"}
    for field, value in payload.model_dump(exclude_none=True, exclude=excluded).items():
        setattr(app, field, value)
    await _record_resume(db, app, payload.resume_id, payload.resume_snapshot)

    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.get("/kanban", response_model=list[KanbanColumn])
async def get_kanban(db: AsyncSession = Depends(get_db)):
    from app.models.job import Job
    result = await db.execute(
        select(Application)
        .options(selectinload(Application.job), selectinload(Application.resume))
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
            "resume_id": str(app.resume_id) if app.resume_id else None,
            "resume_name": app.resume.name if app.resume else None,
            "resume_tailored": app.resume_tailored,
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
    """Correct the stage, date or note of an already-recorded step."""
    app = await _get_app(db, app_id)

    timeline = list(app.timeline or [])
    if not 0 <= event_index < len(timeline):
        raise HTTPException(status_code=404, detail="Timeline event not found")

    event = dict(timeline[event_index])
    dropped: frozenset[str] = frozenset()
    old_status = event.get("status")
    if payload.status and payload.status.value != old_status:
        dropped = frozenset({old_status})
        event["status"] = payload.status.value
        # Swap an automatic note along with the stage; a note you wrote yourself stays.
        if old_status in DEFAULT_NOTES and event.get("note") == DEFAULT_NOTES[old_status]:
            event.pop("note")
        if payload.status.value in DEFAULT_NOTES and not event.get("note"):
            event["note"] = DEFAULT_NOTES[payload.status.value]
    if payload.timestamp:
        event["timestamp"] = payload.timestamp.isoformat()
    if payload.note is not None:
        event["note"] = payload.note
    timeline[event_index] = event

    # Keep steps in chronological order so the UI doesn't have to sort around edits.
    timeline.sort(key=lambda e: e.get("timestamp") or "")
    app.timeline = timeline
    _sync_from_timeline(app, dropped)

    db.add(app)
    await db.flush()
    await db.refresh(app)
    return app


@router.delete("/{app_id}/timeline/{event_index}", response_model=ApplicationOut)
async def delete_timeline_event(app_id: UUID, event_index: int, db: AsyncSession = Depends(get_db)):
    """Remove a step logged by mistake; the application falls back to the step before it."""
    app = await _get_app(db, app_id)

    timeline = list(app.timeline or [])
    if not 0 <= event_index < len(timeline):
        raise HTTPException(status_code=404, detail="Timeline event not found")
    if len(timeline) == 1:
        raise HTTPException(
            status_code=409,
            detail="This is the only step. Delete the application instead.",
        )

    removed = timeline.pop(event_index)
    app.timeline = timeline
    _sync_from_timeline(app, frozenset({removed.get("status")}))

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
