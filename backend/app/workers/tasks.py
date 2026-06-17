"""
Celery background tasks for long-running operations.
The API endpoints enqueue these and return immediately with a task_id.
"""
import asyncio
from uuid import UUID
from celery import Task

from app.workers.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.schemas.job import JobCreate
from app.models.job import JobSource


class AsyncTask(Task):
    """Helper to run async code inside a Celery task."""
    def run_async(self, coro):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


@celery_app.task(bind=True, base=AsyncTask, name="app.workers.tasks.analyze_job_task", max_retries=2)
def analyze_job_task(self, url: str | None, raw_text: str | None, source: str = "manual"):
    """Full JD analysis pipeline as a background task."""
    from app.services.job_service import create_job_and_analyze

    async def _run():
        async with AsyncSessionLocal() as db:
            payload = JobCreate(
                url=url,
                raw_text=raw_text,
                source=JobSource(source),
            )
            job = await create_job_and_analyze(db, payload)
            await db.commit()
            return str(job.id)

    try:
        return self.run_async(_run())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)
