from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.core.database import get_db
from app.models.resume import Resume
from app.schemas.resume import ResumeCreate, ResumeUpdate, ResumeOut
from app.services.ai_parser import parse_job_description
from app.services.skills import extract_skills_from_text as _extract_skills

router = APIRouter(prefix="/resume", tags=["resume"])


def _to_out(resume: Resume) -> ResumeOut:
    """Serialize with skills re-derived from raw_text.

    The stored column is only a snapshot from save time, so it drifts whenever the
    skill alias table grows — deriving here keeps the displayed tags honest.
    """
    out = ResumeOut.model_validate(resume)
    out.skills = _extract_skills(resume.raw_text)
    return out


@router.post("/", response_model=ResumeOut)
async def create_resume(payload: ResumeCreate, db: AsyncSession = Depends(get_db)):
    # If marking as master, unset existing master
    if payload.is_master:
        result = await db.execute(select(Resume).where(Resume.is_master == True))
        for existing in result.scalars().all():
            existing.is_master = False
            db.add(existing)

    skills = _extract_skills(payload.raw_text)

    resume = Resume(
        name=payload.name,
        is_master=payload.is_master,
        raw_text=payload.raw_text,
        skills=skills,
        parsed_sections={},
    )
    db.add(resume)
    await db.flush()
    await db.refresh(resume)
    return _to_out(resume)


@router.get("/", response_model=list[ResumeOut])
async def list_resumes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).order_by(Resume.created_at.desc()))
    return [_to_out(r) for r in result.scalars().all()]


@router.get("/master", response_model=ResumeOut | None)
async def get_master_resume(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.is_master == True).limit(1))
    resume = result.scalar_one_or_none()
    return _to_out(resume) if resume else None


@router.get("/{resume_id}", response_model=ResumeOut)
async def get_resume(resume_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return _to_out(resume)


@router.patch("/{resume_id}", response_model=ResumeOut)
async def update_resume(resume_id: UUID, payload: ResumeUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if payload.is_master:
        existing = await db.execute(select(Resume).where(Resume.is_master == True))
        for r in existing.scalars().all():
            if r.id != resume_id:
                r.is_master = False
                db.add(r)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(resume, field, value)

    if payload.raw_text:
        resume.skills = _extract_skills(payload.raw_text)

    db.add(resume)
    await db.flush()
    await db.refresh(resume)
    return _to_out(resume)


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(resume_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(resume)
