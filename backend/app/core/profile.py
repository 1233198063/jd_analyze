"""
The person this copy of Offer Coming belongs to.

Each user runs their own copy (own database, own Codex login), so "multi-user" just means none of
the personal parts are baked into the code: they live in `backend/profile.json` (gitignored —
copy `profile.example.json` to start). Everything here has a neutral default, so the app runs
with no profile at all; see SETUP.md for what each field does.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

PROFILE_PATH = Path(os.environ.get("PROFILE_PATH", Path(__file__).resolve().parents[2] / "profile.json"))


# The Dashboard's "Search by Source" phrases when the profile doesn't set its own.
DEFAULT_SEARCH_PHRASES = [
    "Frontend Software Engineer", "Full-Stack Software Engineer", "Product Engineer",
    "AI Application Engineer", "AI Agent Engineer", "Agentic Workflow", "AI Tooling",
    "Developer Platform", "Internal Tools", "AI Platform", "Frontend Infrastructure",
    "Generative AI", "LLM Applications",
]


class Link(BaseModel):
    label: str
    url: str


class Script(BaseModel):
    key: str
    title: str
    text: str


class Profile(BaseModel):
    name: str = ""
    # needs_sponsorship: F-1/OPT and similar — sponsorship language rejects jobs and H-1B history is scored.
    # no_sponsorship_needed: green card / EAD — sponsorship is ignored, citizenship/clearance still rejects.
    # us_citizen: neither sponsorship nor citizenship/clearance requirements reject a job.
    work_authorization: Literal["needs_sponsorship", "no_sponsorship_needed", "us_citizen"] = "needs_sponsorship"
    # A new grad wants the new-grad-only postings the default rules filter out.
    new_grad: bool = False

    # Scoring and discovery. None = the app's defaults (a frontend / full-stack / AI focus in the Bay Area).
    target_skills: Optional[list[str]] = None
    target_locations: Optional[list[str]] = None
    role_keywords: Optional[list[str]] = None
    amazon_queries: Optional[list[str]] = None
    search_phrases: Optional[list[str]] = None
    search_location: str = "Bay Area"

    # Networking
    alumni_search_url: str = ""  # e.g. https://www.linkedin.com/school/<school-slug>/people/
    career_portal: Optional[Link] = None  # your school's job portal, shown on the Dashboard
    networking_links: list[Link] = Field(default_factory=list)
    networking_scripts: list[Script] = Field(default_factory=list)  # replace a template by its key, or add one

    # Optional personal interview sprint run before the 30-day coding plan (see SETUP.md for the format).
    practice_sprint: list[dict] = Field(default_factory=list)

    @property
    def needs_sponsorship(self) -> bool:
        return self.work_authorization == "needs_sponsorship"

    @property
    def us_citizen(self) -> bool:
        return self.work_authorization == "us_citizen"

    def prompt_context(self) -> dict[str, str]:
        """How the AI prompts describe the candidate. The needs_sponsorship wording is exactly what
        the prompts said before profiles existed."""
        if self.needs_sponsorship:
            return {
                "candidate": "an international student (OPT/STEM OPT/H-1B)",
                "sender_context": "New grad / entry-level software engineer, international student (needs visa sponsorship)",
                "candidate_sentence": "The candidate is an international student on OPT looking for early-career software roles in the US.",
            }
        who = "a US citizen" if self.us_citizen else "a candidate authorized to work in the US without sponsorship"
        return {
            "candidate": who,
            "sender_context": "New grad / entry-level software engineer",
            "candidate_sentence": f"The candidate is {who}, looking for early-career software roles in the US.",
        }


def load_profile(path: Path = PROFILE_PATH) -> Profile:
    if not path.is_file():
        log.warning("No profile at %s — using defaults. Copy profile.example.json to profile.json.", path)
        return Profile()
    return Profile.model_validate(json.loads(path.read_text(encoding="utf-8")))


profile = load_profile()
