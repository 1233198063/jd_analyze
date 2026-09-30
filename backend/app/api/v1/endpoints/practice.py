from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.practice import PracticeLog
from app.schemas.practice import PracticeLogCreate, PracticeSettingsUpdate
from app.services import practice_service
from app.services.practice_plan import ITEM_KEYS

router = APIRouter(prefix="/practice", tags=["practice"])


@router.get("/today")
async def practice_today(db: AsyncSession = Depends(get_db)):
    """Today's plan items, minutes logged per track vs target, and the current streak."""
    return await practice_service.today_status(db)


@router.get("/overview")
async def practice_overview(db: AsyncSession = Depends(get_db)):
    """The 30-day grid, per-track time split, readiness against each track's bar, and plan progress."""
    return await practice_service.overview(db)


@router.get("/plan")
async def practice_plan(db: AsyncSession = Depends(get_db)):
    settings = await practice_service.get_settings(db)
    return practice_service.plan_with_dates(settings)


@router.post("/logs")
async def create_log(payload: PracticeLogCreate, db: AsyncSession = Depends(get_db)):
    if payload.item_key and payload.item_key not in ITEM_KEYS:
        raise HTTPException(status_code=422, detail=f"Unknown plan item: {payload.item_key}")
    log = PracticeLog(
        practiced_on=payload.practiced_on or date.today(),
        track=payload.track,
        minutes=payload.minutes,
        title=payload.title.strip(),
        item_key=payload.item_key,
        difficulty=payload.difficulty,
        met_bar=payload.met_bar,
        explained_aloud=payload.explained_aloud,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return practice_service.serialize_log(log)


@router.delete("/logs/{log_id}", status_code=204)
async def delete_log(log_id: UUID, db: AsyncSession = Depends(get_db)):
    log = await db.get(PracticeLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    await db.delete(log)


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    settings = await practice_service.get_settings(db)
    return {
        "daily_minutes": settings.daily_minutes,
        "start_date": settings.start_date,
        "reminder_time": settings.reminder_time,
        "targets": practice_service.track_targets(settings.daily_minutes),
    }


@router.patch("/settings")
async def update_settings(payload: PracticeSettingsUpdate, db: AsyncSession = Depends(get_db)):
    settings = await practice_service.get_settings(db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(settings, field, value)
    db.add(settings)
    await db.flush()
    return {
        "daily_minutes": settings.daily_minutes,
        "start_date": settings.start_date,
        "reminder_time": settings.reminder_time,
        "targets": practice_service.track_targets(settings.daily_minutes),
    }
