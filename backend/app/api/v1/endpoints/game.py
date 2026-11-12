from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import game_service

router = APIRouter(prefix="/game", tags=["game"])


@router.get("")
async def game_overview(db: AsyncSession = Depends(get_db)):
    """Level and XP, this week's quests, bosses (OA / interview stages), achievements, past seasons."""
    return await game_service.overview(db)
