# Daily Discovery

Polls each company in `app/services/company_boards.py` via its public Greenhouse /
Lever / Ashby job-board API, keeps postings whose title matches your target roles
(`discovery_service.TITLE_KEYWORDS`) and isn't senior/staff/lead/principal/manager,
then runs them through the normal analyze-and-score pipeline. Already-seen postings
(by URL) are skipped, so it's safe to run repeatedly.

Capped at 25 new postings per run (`MAX_NEW_PER_RUN` in `discovery_service.py`) to
bound Codex usage and time (each new posting costs two Codex calls, roughly 30-40s), spread round-robin across companies so no single employer
eats the whole cap.

## Run it

- **From the UI**: Discoveries page → "Run Now".
- **From the API**: `POST /api/v1/jobs/discover`.
- **From the command line** (what the scheduled task calls): `run_daily_discovery.bat`,
  or directly: `.venv\Scripts\python.exe scripts\daily_discovery.py` (run from `backend/`).

## Schedule it daily (Windows Task Scheduler)

```
schtasks /create /tn "JDAnalyze Daily Discovery" /tr "C:\Users\19257\Desktop\jd_analyze\backend\run_daily_discovery.bat" /sc daily /st 08:00 /f
```

Runs independently of whether the dev servers are open — only needs the local
Postgres service (already running as a Windows service) and internet access.
Logs go to `backend/logs/daily_discovery.log`.

Remove it with:
```
schtasks /delete /tn "JDAnalyze Daily Discovery" /f
```

## Add more companies

Edit `app/services/company_boards.py` — add `{"name", "ats", "slug", "h1b_known"}`.
Verify the slug first: `curl https://boards-api.greenhouse.io/v1/boards/{slug}/jobs`
(or the Lever/Ashby equivalents) — a wrong slug just gets skipped with a logged
error, but a live one gets you real matches.
