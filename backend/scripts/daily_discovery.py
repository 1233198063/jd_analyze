"""
Entry point for the daily job-discovery run, meant to be invoked by a scheduler
(Windows Task Scheduler, cron, etc.) rather than the running API server — so
discovery still happens even if the app isn't open.

Usage: python scripts/daily_discovery.py   (run from the backend/ directory)
"""
import asyncio
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import AsyncSessionLocal, engine, init_db
from app.services.discovery_service import run_discovery, start_run


async def main():
    print(f"=== {datetime.now():%Y-%m-%d %H:%M} ===")
    await init_db()  # this can run before the API has ever started on new code
    try:
        async with AsyncSessionLocal() as db:
            run = await start_run(db, "scheduled")
            if run is None:
                print("Another discovery run is still going — skipped.")
                return
            summary = await run_discovery(db, run)
    finally:
        await engine.dispose()

    print(f"Companies checked: {summary['companies_checked']} of {summary['companies_total']}")
    print(f"Companies failed:  {len(summary['companies_failed'])}")
    for f in summary["companies_failed"]:
        print(f"  - {f['company']}: {f['error']}")
    print(f"Postings seen:     {summary['postings_seen']}")
    print(f"Title matches:     {summary['title_matched']}")
    print(f"New jobs created:  {summary['created']}")
    print(f"Already seen:      {summary['skipped_duplicate']}")
    print(f"Carried over:      {summary['carried_over']}  (over the per-run cap; picked up next run)")
    if summary["analysis_failed"]:
        print(f"Analysis failures: {len(summary['analysis_failed'])}")
        for f in summary["analysis_failed"]:
            print(f"  - {f['url']}: {f['error']}")
    print(f"To-apply postings: {summary['postings_verified']}")


if __name__ == "__main__":
    asyncio.run(main())
