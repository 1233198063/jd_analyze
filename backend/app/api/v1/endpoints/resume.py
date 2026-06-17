from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.core.database import get_db
from app.models.resume import Resume
from app.schemas.resume import ResumeCreate, ResumeUpdate, ResumeOut
from app.services.ai_parser import parse_job_description

router = APIRouter(prefix="/resume", tags=["resume"])


def _extract_skills(raw_text: str) -> list[str]:
    """Quick keyword extraction for skills from resume text."""
    import re
    skill_patterns = [
        r"\b(React|TypeScript|JavaScript|Node\.?js|Python|SQL|PostgreSQL|MySQL|MongoDB|"
        r"FastAPI|Django|Flask|Next\.?js|Vue|Angular|GraphQL|REST|Docker|Kubernetes|"
        r"AWS|GCP|Azure|Git|GitHub|CI/CD|TailwindCSS|CSS|HTML|Java|Go|Rust|C\+\+|"
        r"Redis|Celery|Pandas|NumPy|PyTorch|TensorFlow|LangChain|OpenAI|Claude|"
        r"Prisma|SQLAlchemy|Alembic|Vercel|Railway|Linux|Bash|Figma|Jira)\b"
    ]
    found = set()
    for pattern in skill_patterns:
        matches = re.findall(pattern, raw_text, re.IGNORECASE)
        found.update(m.strip() for m in matches)
    return sorted(found, key=str.lower)


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
    return resume


@router.get("/", response_model=list[ResumeOut])
async def list_resumes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).order_by(Resume.created_at.desc()))
    return result.scalars().all()


@router.get("/master", response_model=ResumeOut | None)
async def get_master_resume(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.is_master == True).limit(1))
    return result.scalar_one_or_none()


@router.get("/{resume_id}", response_model=ResumeOut)
async def get_resume(resume_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume


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
    return resume


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(resume_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(resume)
