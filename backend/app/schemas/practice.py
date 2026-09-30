from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

Track = Literal["react", "leetcode", "system_design"]


class PracticeLogCreate(BaseModel):
    track: Track
    minutes: int = Field(ge=1, le=600)
    title: str = Field(min_length=1, max_length=200)
    item_key: Optional[str] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    met_bar: bool = False
    explained_aloud: bool = False
    notes: Optional[str] = None
    # Defaults to today; set it to log a session you forgot to record.
    practiced_on: Optional[date] = None


class PracticeSettingsUpdate(BaseModel):
    daily_minutes: Optional[int] = Field(default=None, ge=15, le=600)
    start_date: Optional[date] = None
    reminder_time: Optional[str] = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
