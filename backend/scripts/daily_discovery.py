"""
Entry point for the daily job-discovery run, meant to be invoked by a scheduler
(Windows Task Scheduler, cron, etc.) rather than the running API server — so
discovery still happens even if the app isn't open.

Usage: python scripts/daily_discovery.py   (run from the backend/ directory)
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import AsyncSessionLocal
from app.services.discovery_service import run_discovery


async def main():
    async with AsyncSessionLocal() as db:
        summary = await run_discovery(db)
        await db.commit()

    print(f"Companies checked: {summary['companies_checked']}")
    print(f"Companies failed:  {len(summary['companies_failed'])}")
    for f in summary["companies_failed"]:
        print(f"  - {f['company']}: {f['error']}")
    print(f"Postings seen:     {summary['postings_seen']}")
    print(f"Title matches:     {summary['title_matched']}")
    print(f"New jobs created:  {summary['created']}")
    print(f"Already seen:      {summary['skipped_duplicate']}")
    print(f"Skipped (cap):     {summary['skipped_cap']}")
    if summary["analysis_failed"]:
        print(f"Analysis failures: {len(summary['analysis_failed'])}")
        for f in summary["analysis_failed"]:
            print(f"  - {f['url']}: {f['error']}")


if __name__ == "__main__":
    asyncio.run(main())
