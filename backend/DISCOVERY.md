# Daily Discovery

Polls each company in `app/services/company_boards.py` (~200: Greenhouse, Lever, Ashby,
Workday, plus Amazon's own search) via its public job-board API, keeps the postings that pass
the filters below, then runs them through the normal analyze-and-score pipeline.
Already-seen postings (by URL) are skipped, so it's safe to run repeatedly. Boards are
fetched 8 at a time; a full pass takes about a minute and a half before any AI work.

What gets through, in order:

1. **Title** has an engineering word (engineer, developer, member of technical staff, ...) and a
   target keyword — your `role_keywords`, which include generic titles like "software engineer":
   most early-career openings are just "Software Engineer (I/II), <team>", so the scorer reads
   the JD to judge fit rather than the title being required to say "frontend".
2. **Not senior** — senior / sr / staff / lead / principal / manager / director as whole words.
   "Member of Technical Staff" is a flat title at AI labs and passes, as in the scorer.
3. **Not off-track** — sales / support / solutions engineering, test, SRE, security, mobile,
   hardware, data, research and contract roles (`DEFAULT_EXCLUDED_TITLE_KEYWORDS`, or your
   `excluded_title_keywords`).
4. **Location** — US only; with `discovery_locations: "target"` (the default) also only your
   `target_locations` (the Bay Area) or remote. Set it to `"us"` to take the whole US.
5. **Ruled out by the JD text** — dropped before the AI call, since the scorer would hard-reject
   them anyway: text saying there's no sponsorship or that citizenship / clearance is required
   (`scorer.work_authorization_conflict`), and an explicit 5+ year floor (`min_years_asked`: the
   *smallest* "N years … experience" figure in the JD, so "2+ required, 5+ preferred" stays in).
   On the stored JDs it catches 28 of the 40 five-plus-year rejects and skips nothing else.

Workday sites (NVIDIA, Salesforce, Cisco, Capital One, Adobe, PayPal, ...) are searched through
the same JSON API their career page calls, narrowed to the site's location facets in your target
area. Its results aren't sorted by date, so every page is read; only new title matches get a
detail request for the full JD.

Capped at 25 new postings per run (`MAX_NEW_PER_RUN` in `discovery_service.py`) to
bound Codex usage and time (each new posting costs two Codex calls, roughly 30-40s), spread round-robin across companies so no single employer
eats the whole cap.

## Nothing gets lost between runs

Each board remembers how far its last successful scan got (`discovery_company_checks.covered_through`),
and the next scan starts there instead of at a fixed "last 3 days":

- **A missed day** (laptop off, task skipped): the next run still picks up what was posted in the gap.
- **A board that fails** (timeout, API error): its position doesn't move, so the next run retries the whole gap.
  The Discoveries page lists boards that failed and how many runs in a row.
- **Matches over the 25 cap** are "carried over": the board's position stays at the oldest one left, so
  the next run adds them.

A board's first scan looks back 7 days, and catching up never reaches further back than 14
(`FIRST_SCAN_LOOKBACK_DAYS` / `MAX_LOOKBACK_DAYS`). Every run is recorded in `discovery_runs`
(started, finished, counts, error); the Discoveries page shows the latest one and warns when
nothing has scanned for 36 hours. Each new job is saved as soon as it's analyzed, so a run that's
cut short keeps what it already paid Codex for. Only one run happens at a time — a click on
Run Now while the scheduled task is going (or the other way round) is turned away.

## Is the posting still open?

At the end of every run, each job still on your to-apply list (saved, or scored Apply/Maybe and
not yet applied) is checked against its job board — plain HTTP, no AI:

| Link | How it's checked |
|---|---|
| `job-boards.greenhouse.io/…`, `boards.greenhouse.io/…`, or a company site with `?gh_jid=` | Greenhouse job API |
| `jobs.lever.co/…` | Lever postings API |
| `jobs.ashbyhq.com/…` | the company's Ashby board |
| `<company>.wdN.myworkdayjobs.com/…/job/…` | the Workday site's job API |
| `amazon.jobs/…/jobs/<id>` | the job page itself |

A posting is marked **closed** only when the job is gone *and* its board still answers, so a wrong
link or an outage can't pass for a closed role; a check that gets no answer keeps the last status.
Anything else (LinkedIn, custom career sites, JDs pasted without a link) is "can't auto-check". Closed postings
are dimmed in job lists and left out of the Dashboard's Priority Applications. Recheck the whole list
from the Discoveries page, or one job from its page.

## Run it

- **From the UI**: Discoveries page → "Run Now".
- **From the API**: `POST /api/v1/jobs/discover`; progress and coverage at `GET /api/v1/jobs/discover/status`.
- **From the command line** (what the scheduled task calls): `run_daily_discovery.bat`,
  or directly: `.venv\Scripts\python.exe scripts\daily_discovery.py` (run from `backend/`).

## Schedule it daily (Windows Task Scheduler)

```powershell
# From the repo root. Runs daily at 08:00; also on battery, and as soon as possible after a missed run.
$action   = New-ScheduledTaskAction -Execute "$PWD\backend\run_daily_discovery.bat"
$trigger  = New-ScheduledTaskTrigger -Daily -At 08:00
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName "JDAnalyze Daily Discovery" -Action $action -Trigger $trigger -Settings $settings
```

Don't create it with plain `schtasks /create`: that makes a task that skips every run while a
laptop is unplugged and never catches up, while still reporting success.

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
