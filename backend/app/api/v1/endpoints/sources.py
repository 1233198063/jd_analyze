from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.source_check import SourceCheck

router = APIRouter(prefix="/sources", tags=["sources"])

# Job sources behind a login the app can't pass (school SSO), so nothing can be discovered from
# them automatically — the Dashboard links out and records when each was last opened instead.
WATCHED_SOURCES = {"northeastern_symplicity"}


@router.get("/checks")
async def list_checks(db: AsyncSession = Depends(get_db)):
    """Last time each watched source was opened, keyed by source."""
    rows = (await db.execute(select(SourceCheck))).scalars().all()
    return {r.key: r.last_checked_at for r in rows}


@router.post("/checks/{key}")
async def record_check(key: str, db: AsyncSession = Depends(get_db)):
    if key not in WATCHED_SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown source: {key}")
    row = await db.get(SourceCheck, key) or SourceCheck(key=key)
    row.last_checked_at = datetime.now(timezone.utc)
    db.add(row)
    await db.flush()
    return {key: row.last_checked_at}
