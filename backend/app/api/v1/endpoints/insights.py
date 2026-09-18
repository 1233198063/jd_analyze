from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.insights import ResumeGapReport
from app.services import gap_analysis

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/resume-gaps", response_model=ResumeGapReport)
async def resume_gaps(
    scope: str = Query("all", pattern="^(all|applied)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregate skill gaps across job history: which roles demand what the master
    resume lacks, and what to learn first.

    scope=all     — every analyzed JD that wasn't hard-rejected
    scope=applied — only jobs you actually applied to / tracked
    """
    return await gap_analysis.analyze_resume_gaps(db, scope=scope)
