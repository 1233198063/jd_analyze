"""
Canonical skill vocabulary shared by resume parsing and JD scoring.

Both a resume's raw text and a JD's `required_skills`/`tech_stack` entries get
normalized through the same alias table before being compared, so "Postgres"
(JD) matches "PostgreSQL" (resume), "Node" matches "Node.js", "GPT-4" matches
"OpenAI", etc. Without this, skill-match scoring under-counts real overlap
whenever the JD and the resume phrase the same skill differently.
"""
from __future__ import annotations
import re

# canonical name -> alternate spellings / abbreviations / synonyms.
# Canonical names match `settings.TARGET_SKILLS` spelling where they overlap.
SKILL_SYNONYMS: dict[str, list[str]] = {
    "react": ["react.js", "reactjs"],
    "typescript": ["ts"],
    "javascript": ["js", "ecmascript", "es6", "es2015"],
    "node.js": ["node", "nodejs"],
    "python": [],
    "sql": ["structured query language"],
    "postgresql": ["postgres", "psql"],
    "mysql": [],
    "mongodb": ["mongo"],
    "fastapi": [],
    "django": [],
    "flask": [],
    "next.js": ["next", "nextjs"],
    "vue": ["vue.js", "vuejs"],
    "angular": ["angularjs"],
    "graphql": [],
    "rest api": ["rest", "restful", "restful api", "restful apis", "rest apis"],
    "docker": ["containerization", "containerized"],
    "kubernetes": ["k8s"],
    "aws": ["amazon web services"],
    "gcp": ["google cloud", "google cloud platform"],
    "azure": ["microsoft azure"],
    "git": ["github", "gitlab", "version control"],
    "ci/cd": ["ci-cd", "continuous integration", "continuous deployment", "continuous delivery"],
    "tailwind": ["tailwindcss", "tailwind css"],
    "css": ["css3"],
    "html": ["html5"],
    "java": [],
    "go": ["golang"],
    "rust": [],
    "c++": ["cpp"],
    "redis": [],
    "celery": [],
    "pandas": [],
    "numpy": [],
    "pytorch": ["torch"],
    "tensorflow": ["tf"],
    "langchain": [],
    "openai": ["gpt", "chatgpt", "gpt-3", "gpt-4", "gpt-4o", "gpt-5"],
    "claude": ["anthropic"],
    "ai": ["artificial intelligence", "generative ai", "genai", "gen ai"],
    "llm": ["llms", "large language model", "large language models"],
    "machine learning": ["ml"],
    "prisma": [],
    "sqlalchemy": [],
    "alembic": [],
    "vercel": [],
    "railway": [],
    "linux": ["unix"],
    "bash": ["shell scripting", "shell script"],
    "figma": [],
    "jira": [],
}


def _boundary_pattern(alias: str) -> re.Pattern:
    # Word-boundary via non-alphanumeric lookaround (not \b) so symbol-bearing
    # aliases like "c++", "ci/cd", "next.js" still match as whole tokens.
    # The left side also excludes '.' specifically — otherwise "js" (an alias
    # for javascript) would falsely match the tail of "node.js"/"next.js",
    # since a plain \b treats the dot itself as a valid word break. The right
    # side allows '.' (a trailing sentence period, e.g. "...used AWS." must
    # still match "aws").
    escaped = re.escape(alias.lower())
    return re.compile(rf"(?<![a-z0-9.]){escaped}(?![a-z0-9])")


_ALIAS_PATTERNS: list[tuple[str, re.Pattern]] = sorted(
    (
        (canonical, _boundary_pattern(alias))
        for canonical, synonyms in SKILL_SYNONYMS.items()
        for alias in [canonical, *synonyms]
    ),
    key=lambda pair: len(pair[1].pattern),
    reverse=True,
)


def extract_skills_from_text(text: str) -> list[str]:
    """Find every canonical skill mentioned anywhere in a blob of text (e.g. a resume)."""
    if not text:
        return []
    text_lower = text.lower()
    found = {canonical for canonical, pattern in _ALIAS_PATTERNS if pattern.search(text_lower)}
    return sorted(found)


def normalize_skill_terms(terms: list[str]) -> set[str]:
    """
    Map a list of short skill tokens (a JD's `required_skills`/`tech_stack` entries,
    or `settings.TARGET_SKILLS`) to canonical names via the same alias table.
    A term matching no known alias is kept as-is (lowercased) so exact-string
    matches on unlisted skills still work.
    """
    found: set[str] = set()
    for term in terms:
        term_lower = term.lower().strip()
        if not term_lower:
            continue
        matched = {canonical for canonical, pattern in _ALIAS_PATTERNS if pattern.search(term_lower)}
        found.update(matched or {term_lower})
    return found
