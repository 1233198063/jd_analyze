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
- **Resume Match** — Upload your master resume. AI identifies missing keywords, evidence gaps, and generates tailored resume bullet points for each role.
- **Application Tracker** — Kanban board tracking every application through: Saved → Applied → OA → Phone Screen → Interview → Offer / Rejected. Records rejection reasons (sponsorship / level / resume / no response) to identify patterns over time.
- **Referral Helper** — For high-score roles, generates a short LinkedIn cold message targeting alumni or employees for a referral.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, TanStack Query, Zustand, React Router v6 |
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| Database | PostgreSQL 16 |
| AI | OpenAI GPT-4o |
| Task Queue | Celery + Redis (optional, for background processing) |
| Scraping | httpx + BeautifulSoup4 |
| Charts | Recharts |

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
        ├── components/         # Reusable UI components
        └── pages/              # Route-level page components
```

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
| `CORS_ORIGINS` | JSON array of allowed frontend origins |

## License

MIT
