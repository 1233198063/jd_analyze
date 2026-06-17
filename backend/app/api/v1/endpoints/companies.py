from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from uuid import UUID

from app.core.database import get_db
from app.models.company import Company, H1BRecord
from app.schemas.company import CompanyOut, CompanyDetailOut, H1BRecordOut, H1BImportResult
from app.services.h1b_importer import import_dol_lca_csv

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/search", response_model=list[CompanyOut])
async def search_companies(q: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company)
        .where(Company.name_normalized.ilike(f"%{q.lower()}%"))
        .limit(20)
    )
    return result.scalars().all()


@router.get("/{company_id}", response_model=CompanyDetailOut)
async def get_company(company_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Recent records
    recent_result = await db.execute(
        select(H1BRecord)
        .where(H1BRecord.company_id == company_id)
        .order_by(desc(H1BRecord.fiscal_year))
        .limit(50)
    )
    recent_records = recent_result.scalars().all()

    # SWE-specific records
    swe_result = await db.execute(
        select(H1BRecord)
        .where(
            H1BRecord.company_id == company_id,
            H1BRecord.soc_code.like("15-1%"),
        )
        .order_by(desc(H1BRecord.fiscal_year))
        .limit(20)
    )
    swe_records = swe_result.scalars().all()

    # Yearly summary
    from sqlalchemy import func
    yearly_result = await db.execute(
        select(
            H1BRecord.fiscal_year,
            func.count(H1BRecord.id).label("total"),
        )
        .where(H1BRecord.company_id == company_id)
        .group_by(H1BRecord.fiscal_year)
        .order_by(desc(H1BRecord.fiscal_year))
        .limit(10)
    )
    yearly_summary = [{"year": r.fiscal_year, "total": r.total} for r in yearly_result]

    return CompanyDetailOut(
        company=company,
        recent_records=recent_records,
        swe_records=swe_records,
        yearly_summary=yearly_summary,
    )


@router.post("/import/dol", response_model=H1BImportResult)
async def import_dol_data(
    file: UploadFile = File(...),
    fiscal_year: int = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Import DOL LCA disclosure CSV.
    Download from: https://www.dol.gov/agencies/eta/foreign-labor/performance
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Only CSV files accepted")

    content = await file.read()
    if len(content) > 200 * 1024 * 1024:  # 200MB limit
        raise HTTPException(status_code=413, detail="File too large (max 200MB)")

    result = await import_dol_lca_csv(db, content, fiscal_year)
    return result
