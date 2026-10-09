from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.ghc import GhcProgress
from app.services import ghc_guide

router = APIRouter(prefix="/ghc", tags=["ghc"])


class GhcProgressUpdate(BaseModel):
    # Omitted fields are left as they are; an empty string clears.
    status: Optional[str] = Field(default=None, max_length=20)
    note: Optional[str] = Field(default=None, max_length=4000)


@router.get("")
async def get_guide(db: AsyncSession = Depends(get_db)):
    """The GHC 26 guide: event facts, tiered sponsors with your matching jobs, the playbook, and progress."""
    return await ghc_guide.guide(db)


@router.put("/progress/{key}")
async def update_progress(key: str, payload: GhcProgressUpdate, db: AsyncSession = Depends(get_db)):
    if key in ghc_guide.COMPANY_KEYS:
        allowed = ghc_guide.COMPANY_STATUSES
    elif key in ghc_guide.TASK_KEYS:
        allowed = ("done",)
    else:
        raise HTTPException(status_code=404, detail=f"Unknown guide item: {key}")
    if payload.status and payload.status not in allowed:
        raise HTTPException(status_code=422, detail=f"Status must be one of {', '.join(allowed)}")

    row = await db.get(GhcProgress, key) or GhcProgress(key=key)
    fields = payload.model_dump(exclude_unset=True)
    if "status" in fields:
        row.status = payload.status or None
    if "note" in fields:
        row.note = (payload.note or "").strip() or None
    db.add(row)
    await db.flush()
    return {"key": key, "status": row.status, "note": row.note}
