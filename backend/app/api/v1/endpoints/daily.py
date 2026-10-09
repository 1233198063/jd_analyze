from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.daily import DailyTodo
from app.services import daily_service

router = APIRouter(prefix="/daily", tags=["daily"])


class TodoCreate(BaseModel):
    day: date
    text: str = Field(min_length=1, max_length=300)


class TodoUpdate(BaseModel):
    text: Optional[str] = Field(default=None, min_length=1, max_length=300)
    done: Optional[bool] = None
    # Set to move an item to another day (e.g. carrying yesterday's leftovers onto today).
    day: Optional[date] = None


@router.get("/history")
async def daily_history(days: int = Query(14, ge=1, le=90), db: AsyncSession = Depends(get_db)):
    return await daily_service.history(db, days)


@router.get("/{day}")
async def daily_view(day: date, db: AsyncSession = Depends(get_db)):
    """One day's to-dos plus the applications, JDs and practice the app recorded that day."""
    return await daily_service.day_view(db, day)


@router.post("/todos")
async def create_todo(payload: TodoCreate, db: AsyncSession = Depends(get_db)):
    todo = DailyTodo(day=payload.day, text=payload.text.strip())
    db.add(todo)
    await db.flush()
    await db.refresh(todo)
    return daily_service.serialize_todo(todo)


@router.patch("/todos/{todo_id}")
async def update_todo(todo_id: UUID, payload: TodoUpdate, db: AsyncSession = Depends(get_db)):
    todo = await db.get(DailyTodo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="To-do not found")
    if payload.text is not None:
        todo.text = payload.text.strip()
    if payload.day is not None:
        todo.day = payload.day
    if payload.done is not None and payload.done != todo.done:
        todo.done = payload.done
        todo.done_at = datetime.now(timezone.utc) if payload.done else None
    db.add(todo)
    await db.flush()
    await db.refresh(todo)
    return daily_service.serialize_todo(todo)


@router.delete("/todos/{todo_id}", status_code=204)
async def delete_todo(todo_id: UUID, db: AsyncSession = Depends(get_db)):
    todo = await db.get(DailyTodo, todo_id)
    if not todo:
        raise HTTPException(status_code=404, detail="To-do not found")
    await db.delete(todo)
