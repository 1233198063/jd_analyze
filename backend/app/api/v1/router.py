from fastapi import APIRouter
from app.api.v1.endpoints import jobs, applications, companies, resume, insights

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(jobs.router)
api_router.include_router(applications.router)
api_router.include_router(companies.router)
api_router.include_router(resume.router)
api_router.include_router(insights.router)
