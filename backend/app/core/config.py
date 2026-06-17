from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = "postgresql+asyncpg://jdanalyze:jdanalyze_dev@localhost:5432/jdanalyze"
    REDIS_URL: str = "redis://localhost:6379/0"

    OPENAI_API_KEY: str = ""

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

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.CORS_ORIGINS)


settings = Settings()
