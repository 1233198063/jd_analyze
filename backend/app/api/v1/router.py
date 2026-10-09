from fastapi import APIRouter
from app.api.v1.endpoints import jobs, applications, companies, resume, insights, practice, ghc, sources, daily

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(jobs.router)
api_router.include_router(applications.router)
api_router.include_router(companies.router)
api_router.include_router(resume.router)
api_router.include_router(insights.router)
api_router.include_router(practice.router)
api_router.include_router(ghc.router)
api_router.include_router(sources.router)
api_router.include_router(daily.router)
