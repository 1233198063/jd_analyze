from fastapi import APIRouter

from app.core.profile import DEFAULT_SEARCH_PHRASES, profile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("")
async def get_profile():
    """The personal settings the frontend needs (from backend/profile.json)."""
    return {
        "name": profile.name,
        "work_authorization": profile.work_authorization,
        "needs_sponsorship": profile.needs_sponsorship,
        "search_phrases": profile.search_phrases or DEFAULT_SEARCH_PHRASES,
        "search_location": profile.search_location,
        "career_portal": profile.career_portal.model_dump() if profile.career_portal else None,
        "has_alumni_search": bool(profile.alumni_search_url),
    }
