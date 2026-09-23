# JD Analyze — Job Intelligence Dashboard

An AI-powered job search tool built for international students on OPT/STEM OPT navigating H-1B sponsorship uncertainty. Paste a job description or drop a link, and the system automatically parses the role, scores your fit across 6 dimensions, flags sponsorship risk, and cross-references DOL H-1B filing history.

## Features

- **JD Parsing** — Paste raw text or input a Greenhouse / Lever / Ashby / Workday / company career page URL. AI extracts title, level, years of experience, location, tech stack, skills, salary, and degree requirements.
- **H-1B Risk Detection** — Automatically detects sponsorship language in JDs. Cross-references DOL OFLC LCA disclosure data and USCIS H-1B Employer Data to verify company filing history for SWE roles. Also tracks E-Verify status for STEM OPT (Form I-983) compatibility.
- **Composite Scoring (100 pts)** — Each JD is scored across 6 weighted dimensions:

  | Dimension | Weight |
  |-----------|--------|
  | H-1B / OPT / STEM OPT friendliness | 30 |
  | Level match (entry-level, 0–2 yrs) | 20 |
  | Skill match (React / TS / Python / SQL / AI) | 20 |
  | Location (Bay Area preferred) | 10 |
  | Company size & stability | 10 |
  | Product direction fit | 10 |

- **Hard Reject Filters** — Auto-rejects roles with "not eligible for immigration sponsorship", 4+ years required, senior/staff/lead/principal titles, or security clearance requirements.
- **Resume Match & Gap Analysis** — Upload your master resume. AI identifies missing keywords and evidence gaps per job, then the Resume Gaps page aggregates gaps across your whole job history (or just the roles you applied to) so you know what to learn first — with a lightweight reading-list tracker (want to read / reading / finished + notes) per skill.
- **AI Resume Tailoring** — Rewrites your master resume for one specific JD without inventing experience: side-by-side diff, clean, and editable views; keyword coverage tracking; honest suggestions for folding a missing skill into an existing project (with an honesty note on what you must be able to speak to); interview trade-off talking points for notable tech choices; and a separate learning-gap list for anything that can't be honestly claimed. Exports to a one-page A4 PDF (auto-shrinks to fit).
- **AI Cover Letter Drafts** — Generates a resume-grounded cover letter draft per job, ready to copy.
- **Practice Interview Answers** — Paste a question you might get asked for a specific role and get back a concise, plain-English answer grounded in your actual resume, ready to copy.
- **Job Discovery** — Polls seeded companies' Greenhouse / Lever / Ashby job boards for postings matching your target roles, scores and dedupes them automatically. Can run on a daily schedule (see `backend/DISCOVERY.md`).
- **Application Tracker** — Every application grouped by stage (Saved → Applied → Referral → OA → Phone Screen → Interview → Offer / Rejected / Withdrawn) in one vertical list under a pipeline-count strip, with a one-click button to advance each role to its next stage. Each application keeps a dated timeline (dates are editable on the job page, for steps logged after the fact), and a monthly stamp summary shows how many roles hit each stage. Rejections record a reason (form rejection / ghosted / sponsorship / level / resume / OA / interview / other) to surface patterns over time.
- **Tracker Search** — Search every tracked application by title, company, stage, rejection reason, or your notes. Multiple words narrow the results (e.g. `product rejected`), matches are highlighted, and the query is kept in the URL so opening a job and going back keeps your search.
- **Referral Helper** — For high-score roles, generates a short LinkedIn cold message targeting alumni or employees for a referral.
- **Dashboard & Company Profiles** — Quick overview of your top-scoring recent matches, plus a per-company profile showing H-1B filing history imported from DOL data.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, TanStack Query, React Router v6 |
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL 16 |
| AI | OpenAI GPT-4o |
| Task Queue | Celery + Redis (optional, for background processing) |
| Scraping | httpx + BeautifulSoup4 |
| Charts | Recharts |
| Icons | Google Material Symbols (web font) |
| Resume diff | jsdiff (`diff`) |

## Project Structure

```
jd_analyze/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # REST route handlers
│   │   ├── core/               # Config, database, dependencies
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Business logic (AI parser, scorer, scraper, H-1B importer)
│   │   └── workers/            # Celery background tasks
│   └── alembic/                # Database migrations
└── frontend/
    └── src/
        ├── api/                # Typed API client functions
        ├── components/         # Reusable UI components (common/Icon.jsx is the single icon source)
        ├── pages/              # Route-level page components
        └── utils/              # Resume formatting/diffing, PDF export, helpers
```

## UI & Design System

The UI uses a custom "Petrol × Bubblegum" palette, defined as Tailwind tokens in `frontend/tailwind.config.js`:

| Token | Hex | Used for |
|-------|-----|----------|
| `canvas` | `#F2F6F6` | Page background |
| `ink` | `#173A3E` | Text (muted text uses opacity, e.g. `text-ink/55`) and the sidebar |
| `petrol` | `#185257` (500) | Primary buttons, links, brand accents |
| `bubblegum` | `#F5A0B7` (400) | Accent: primary-button hover, small corner tags, and marking AI-generated content |
| `mist` | `#D7ECEB` | Borders and soft surfaces |

Status colors are muted custom scales rather than Tailwind defaults: `sage` (good / apply), `coral` (rejected / bad), `gold` (caution / maybe), `clay` (elevated), `plum` (remote / referral).

Conventions:
- No emoji in the UI. Use `<Icon name="..." />` (Google Material Symbols).
- The forward action is always the most prominent button. Negative actions such as "Mark rejected" stay quiet until hovered.
- The resume preview (`ResumePreview.jsx`) stays neutral black-on-white because it is what gets exported to PDF.

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- PostgreSQL 16
- OpenAI API key

### 1. Clone and configure

```bash
git clone https://github.com/your-username/jd-analyze.git
cd jd-analyze

cp backend/.env.example backend/.env
# Edit backend/.env and fill in your OPENAI_API_KEY and DATABASE_URL
```

### 2. Set up the database

```bash
# Create the database and user (adjust credentials to match your .env)
psql -U postgres -c "CREATE USER jdanalyze WITH PASSWORD 'jdanalyze_dev';"
psql -U postgres -c "CREATE DATABASE jdanalyze OWNER jdanalyze;"
```

### 3. Install backend dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Start the backend

```bash
uvicorn app.main:app --reload --port 8000
```

Tables are created automatically on first run. API docs available at `http://localhost:8000/docs`.

### 5. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Optional: Docker (Postgres + Redis only)

```bash
docker compose up postgres redis -d
```

## H-1B Data Setup

The system can cross-reference DOL public data to verify whether a company has historically sponsored H-1B visas for SWE roles.

1. Download the LCA Disclosure data from the [DOL OFLC Performance Data page](https://www.dol.gov/agencies/eta/foreign-labor/performance) (FY2026 Q2 covers Oct 2025 – Mar 2026)
2. Navigate to any **Company Profile** page in the app
3. Click **Import DOL Data** and upload the CSV with the fiscal year

The system normalizes company names, computes approval rates, and identifies SWE-specific filings (SOC code 15-1xxx).

## Scoring Thresholds

| Score | Action |
|-------|--------|
| 80–100 | Customize resume + find referral |
| 60–79 | Quick apply |
| < 60 | Skip unless strong personal interest |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL async connection string |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o) |
| `REDIS_URL` | Redis URL (only needed if running Celery worker) |
| `SECRET_KEY` | JWT signing secret |
| `ALGORITHM` | JWT signing algorithm (default `HS256`) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT access token lifetime, in minutes |
| `CORS_ORIGINS` | JSON array of allowed frontend origins |
| `H1B_DATA_DIR` | Directory for downloaded DOL/USCIS H-1B CSV files |

## Troubleshooting (local dev on Windows)

- **A page loads forever, but the API answers fine with `curl`.** On Windows, uvicorn cuts off responses larger than about 128 KB (at exactly 130,560 bytes) when the request asks to close the connection. Vite's proxy does that by default, so `frontend/vite.config.js` gives the proxy a keep-alive agent to avoid it. Don't remove that agent. To check whether this is the cause, compare `curl -H "Connection: close" <backend url>` with a plain `curl`, and look for `http proxy error … ECONNRESET` in the Vite output.
- **Backend edits don't seem to take effect.** `uvicorn --reload` can log `Reloading...` without ever starting a new worker, so the old code keeps serving requests. If the log never shows `Application startup complete` again, stop uvicorn and start it again manually.

## License

MIT
