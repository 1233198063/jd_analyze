from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import json
import os

# Corporate/antivirus TLS inspection on this machine breaks certifi's bundled
# CA store (httpx calls fail with CERTIFICATE_VERIFY_FAILED even though
# curl, which uses the Windows cert store, works fine). certs/combined_cacert.pem
# is certifi's bundle plus the local trusted root CAs pulled from Windows.
_combined_ca_bundle = os.path.join(os.path.dirname(__file__), "..", "..", "certs", "combined_cacert.pem")
if os.path.isfile(_combined_ca_bundle):
    _combined_ca_bundle = os.path.abspath(_combined_ca_bundle)
    os.environ.setdefault("SSL_CERT_FILE", _combined_ca_bundle)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", _combined_ca_bundle)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://jdanalyze:jdanalyze_dev@localhost:5432/jdanalyze"
    REDIS_URL: str = "redis://localhost:6379/0"

    # AI runs through the local Codex CLI, signed in with a ChatGPT account (`codex login`).
    CODEX_PATH: str = ""  # empty = auto-detect (PATH, then the Codex desktop app's bundled CLI)
    CODEX_MODEL: str = "gpt-6-sol"
    CODEX_REASONING_EFFORT: str = "low"
    CODEX_TIMEOUT_SECONDS: int = 240

    SECRET_KEY: str = "dev-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080

    CORS_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'

    H1B_DATA_DIR: str = "./data/h1b"

    # Scoring weights (must sum to 100)
    SCORE_WEIGHT_H1B: int = 30
    SCORE_WEIGHT_LEVEL: int = 20
    SCORE_WEIGHT_SKILLS: int = 20
    SCORE_WEIGHT_LOCATION: int = 10
    SCORE_WEIGHT_COMPANY: int = 10
    SCORE_WEIGHT_PRODUCT: int = 10

    # Preferred locations for Bay Area filter
    BAY_AREA_KEYWORDS: List[str] = [
        "san francisco", "sf", "san jose", "mountain view", "palo alto",
        "sunnyvale", "santa clara", "menlo park", "redwood city", "foster city",
        "south san francisco", "fremont", "oakland", "berkeley", "emeryville",
        "cupertino", "milpitas", "campbell", "los altos", "los gatos",
        "bay area", "silicon valley",
    ]

    # Target skills for scoring
    TARGET_SKILLS: List[str] = [
        "react", "typescript", "javascript", "node.js", "nodejs",
        "python", "sql", "postgresql", "fastapi", "next.js",
        "ai", "llm", "machine learning", "tailwind", "rest api",
        "graphql", "docker", "git", "aws", "gcp",
    ]

    # Hard-reject patterns
    NO_SPONSOR_PATTERNS: List[str] = [
        "not eligible for immigration sponsorship",
        "not able to sponsor",
        "unable to sponsor",
        "will not sponsor",
        "cannot sponsor",
        "no sponsorship",
        "must be authorized to work",
        "must be a us citizen",
        "must be a u.s. citizen",
        "security clearance required",
        "active clearance",
    ]

    # Levels that are too senior
    SENIOR_LEVEL_KEYWORDS: List[str] = [
        "senior", "staff", "lead", "principal", "manager",
        "director", "vp ", "vice president", "head of",
    ]

    # Signals that a role is gated to a graduating-student cohort rather than open
    # to anyone at the entry level — doesn't fit candidates who already graduated.
    # Split into two tiers because JD *body* text often mentions "new grad" only to
    # redirect actual new grads elsewhere ("if you're a new grad, don't apply here") —
    # that phrasing is reliable in a *title* but not in body text, where only an
    # unambiguous eligibility-window statement should trigger a reject.
    NEW_GRAD_ONLY_TITLE_PATTERNS: List[str] = [
        "new grad", "new college graduate", "recent graduate", "recent college graduate",
        "university graduate", "campus hire", "campus recruiting",
        "rotational program", "early career program", "early talent program",
        "university program", "college hire",
    ]
    NEW_GRAD_ONLY_BODY_PATTERNS: List[str] = [
        "must graduate", "graduating between", "graduating in 20", "class of 20",
        "expected graduation", "must be graduating",
    ]


    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)


settings = Settings()
