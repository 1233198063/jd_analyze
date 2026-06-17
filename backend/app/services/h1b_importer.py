"""
Imports DOL LCA disclosure data and USCIS H-1B employer data into the database.

DOL OFLC LCA Disclosure:
  https://www.dol.gov/agencies/eta/foreign-labor/performance
  FY2026 Q2 (2025-10-01 to 2026-03-31) available as Excel/CSV

USCIS H-1B Employer Data Hub:
  https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub

Usage:
  POST /api/v1/companies/import/dol  (upload CSV file)
  POST /api/v1/companies/import/uscis (upload CSV file)
"""
import re
import csv
import io
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.company import Company, H1BRecord, H1BCaseStatus, CompanySize

# DOL LCA column name mappings (column names vary slightly by year)
DOL_COLUMN_MAP = {
    "employer": ["employer_name", "EMPLOYER_NAME"],
    "case_number": ["case_number", "CASE_NUMBER"],
    "case_status": ["case_status", "CASE_STATUS"],
    "visa_class": ["visa_class", "VISA_CLASS"],
    "job_title": ["job_title", "JOB_TITLE"],
    "soc_code": ["soc_code", "SOC_CODE"],
    "soc_title": ["soc_title", "SOC_TITLE"],
    "wage_rate": ["wage_rate_of_pay_from", "WAGE_RATE_OF_PAY_FROM"],
    "wage_unit": ["wage_unit_of_pay", "WAGE_UNIT_OF_PAY"],
    "prevailing_wage": ["prevailing_wage", "PREVAILING_WAGE"],
    "worksite_city": ["worksite_city", "WORKSITE_CITY"],
    "worksite_state": ["worksite_state", "WORKSITE_STATE"],
}

# SWE-related SOC codes
SWE_SOC_PREFIXES = ("15-113", "15-114", "15-115", "15-116", "15-119", "15-120", "15-121", "15-122")

# Status normalization
STATUS_MAP = {
    "certified": H1BCaseStatus.certified,
    "certified - withdrawn": H1BCaseStatus.certified_withdrawn,
    "withdrawn": H1BCaseStatus.withdrawn,
    "denied": H1BCaseStatus.denied,
}


def _normalize_company_name(name: str) -> str:
    """Lowercase, strip punctuation/suffixes for fuzzy matching."""
    name = name.lower().strip()
    for suffix in [", inc.", " inc.", ", llc", " llc", ", corp.", " corp.", ", ltd.", " ltd.", " inc", " llc", " corp"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    name = re.sub(r"[^\w\s]", "", name)
    return re.sub(r"\s+", " ", name).strip()


def _find_column(headers: list[str], candidates: list[str]) -> str | None:
    lower_headers = [h.lower() for h in headers]
    for c in candidates:
        if c.lower() in lower_headers:
            return headers[lower_headers.index(c.lower())]
    return None


def _parse_wage(val: str) -> float | None:
    if not val:
        return None
    val = re.sub(r"[,$]", "", val.strip())
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _map_status(raw: str) -> H1BCaseStatus:
    key = raw.lower().strip()
    return STATUS_MAP.get(key, H1BCaseStatus.withdrawn)


def _is_swe_role(soc_code: str | None, job_title: str | None) -> bool:
    if soc_code:
        for prefix in SWE_SOC_PREFIXES:
            if soc_code.startswith(prefix):
                return True
    if job_title:
        title_lower = job_title.lower()
        swe_keywords = ["software engineer", "software developer", "frontend", "backend",
                        "full stack", "fullstack", "swe", "web developer", "platform engineer"]
        return any(kw in title_lower for kw in swe_keywords)
    return False


async def import_dol_lca_csv(
    db: AsyncSession,
    csv_content: bytes,
    fiscal_year: int,
) -> dict:
    """Parse DOL LCA disclosure CSV and upsert into DB."""
    text = csv_content.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    # Map columns
    col = {k: _find_column(headers, v) for k, v in DOL_COLUMN_MAP.items()}

    companies_cache: dict[str, Company] = {}
    created = updated = imported = 0
    errors: list[str] = []

    for i, row in enumerate(reader):
        try:
            employer_raw = row.get(col["employer"] or "", "").strip()
            if not employer_raw:
                continue

            normalized = _normalize_company_name(employer_raw)

            # Get or create company
            if normalized not in companies_cache:
                result = await db.execute(
                    select(Company).where(Company.name_normalized == normalized)
                )
                company = result.scalar_one_or_none()
                if not company:
                    company = Company(
                        name=employer_raw,
                        name_normalized=normalized,
                    )
                    db.add(company)
                    await db.flush()
                    created += 1
                else:
                    updated += 1
                companies_cache[normalized] = company
            else:
                company = companies_cache[normalized]

            soc_code = row.get(col["soc_code"] or "", "").strip() if col["soc_code"] else None
            job_title = row.get(col["job_title"] or "", "").strip() if col["job_title"] else None
            status_raw = row.get(col["case_status"] or "", "").strip() if col["case_status"] else "Unknown"

            record = H1BRecord(
                company_id=company.id,
                case_number=row.get(col["case_number"] or "", "").strip() if col["case_number"] else None,
                case_status=_map_status(status_raw),
                visa_class=row.get(col["visa_class"] or "", "H-1B").strip() if col["visa_class"] else "H-1B",
                fiscal_year=fiscal_year,
                job_title=job_title,
                soc_code=soc_code,
                soc_title=row.get(col["soc_title"] or "", "").strip() if col["soc_title"] else None,
                wage_rate=_parse_wage(row.get(col["wage_rate"] or "", "") if col["wage_rate"] else ""),
                wage_unit=row.get(col["wage_unit"] or "", "").strip() if col["wage_unit"] else None,
                prevailing_wage=_parse_wage(row.get(col["prevailing_wage"] or "", "") if col["prevailing_wage"] else ""),
                worksite_city=row.get(col["worksite_city"] or "", "").strip() if col["worksite_city"] else None,
                worksite_state=row.get(col["worksite_state"] or "", "").strip() if col["worksite_state"] else None,
                data_source="DOL_LCA",
            )
            db.add(record)
            imported += 1

            if i % 500 == 0:
                await db.flush()

        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")
            if len(errors) > 20:
                break

    await db.flush()

    # Recompute aggregates for all touched companies
    for company in companies_cache.values():
        await _recompute_company_stats(db, company)

    return {
        "companies_created": created,
        "companies_updated": updated,
        "records_imported": imported,
        "errors": errors,
    }


async def _recompute_company_stats(db: AsyncSession, company: Company) -> None:
    """Recompute aggregate H-1B stats for a company from its records."""
    result = await db.execute(
        select(
            func.count(H1BRecord.id).label("total"),
            func.sum(
                (H1BRecord.case_status == H1BCaseStatus.certified).cast(int)
            ).label("approved"),
            func.sum(
                (H1BRecord.case_status == H1BCaseStatus.denied).cast(int)
            ).label("denied"),
            func.max(H1BRecord.fiscal_year).label("latest_year"),
        ).where(H1BRecord.company_id == company.id)
    )
    row = result.one()

    swe_result = await db.execute(
        select(func.count(H1BRecord.id)).where(
            H1BRecord.company_id == company.id,
            H1BRecord.soc_code.like("15-1%"),
        )
    )
    swe_count = swe_result.scalar() or 0

    total = row.total or 0
    approved = row.approved or 0
    denied = row.denied or 0

    company.h1b_total_filings = total
    company.h1b_approved = approved
    company.h1b_denied = denied
    company.h1b_approval_rate = approved / total if total > 0 else None
    company.h1b_latest_year = row.latest_year
    company.h1b_swe_filings = swe_count
    db.add(company)
