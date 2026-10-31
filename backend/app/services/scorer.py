"""
Deterministic scoring engine.
Applies user's job-search strategy rules on top of AI-extracted data.

Scoring weights (total = 100):
  H-1B / OPT / STEM OPT friendliness  30
  Level match (entry-level)            20
  Skill match                          20   share of the JD's technical asks the resume covers
  Location (Bay Area preferred)        10
  Company (size / known sponsor)       10
  Role direction fit                   10   frontend / full-stack / AI-app vs infra, systems, ML

Bands: Apply >= 75, Maybe >= 60. Without the DOL H-1B import the filing-history and approval-rate
points (15 of the 30) are unknowable, so the best reachable total is ~91, not 100 — 75 is "strong
on every axis" on that scale.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field

from app.core.config import settings
from app.core.profile import profile
from app.services.company_boards import SEED_COMPANIES
from app.services.skills import SKILL_SYNONYMS, normalize_skill_terms
from app.models.job import SponsorshipStatus, JobLevel, Recommendation, ApplicationPool
from app.models.company import CompanySize

APPLY_THRESHOLD = 75
MAYBE_THRESHOLD = 60

# Titles that name no direction: "Software Engineer (I/II), <team>" says nothing about the work.
GENERIC_TITLE_KEYWORDS = [
    "software engineer", "software developer", "software development engineer",
    "member of technical staff", "web engineer", "web developer", "ui engineer",
    "ai engineer", "forward deployed engineer",
]
# The work this candidate is aiming for (frontend / full-stack / AI applications).
# profile.role_keywords replaces DEFAULT_DIRECTION_KEYWORDS + GENERIC_TITLE_KEYWORDS.
DEFAULT_DIRECTION_KEYWORDS = [
    "frontend", "front-end", "front end",
    "full-stack", "full stack", "fullstack",
    "product engineer",
    "ai application", "applied ai",
    "ai agent", "agentic",
    "ai tooling",
    "developer platform", "dev platform",
    "internal tools", "internal tooling",
    "ai platform",
    "generative ai",
    "llm",
]
DIRECTION_KEYWORDS = [k for k in (profile.role_keywords or DEFAULT_DIRECTION_KEYWORDS) if k not in GENERIC_TITLE_KEYWORDS]
# Work off that direction. Any word that's part of a direction keyword is dropped, so someone
# targeting "backend" never has it counted against them.
OFF_TRACK_KEYWORDS = [
    w for w in [
        "infrastructure", "infra", "storage", "compute", "networking", "network", "kernel",
        "distributed systems", "systems", "backend", "back-end", "back end", "data", "ml",
        "machine learning", "training", "inference", "security", "privacy", "mobile", "ios",
        "android", "embedded", "firmware", "hardware", "performance", "reliability", "sre",
        "devops", "simulation", "accelerator", "gpu", "cuda", "compiler", "database",
    ]
    if not any(w in d for d in DIRECTION_KEYWORDS)
]
ENGINEERING_TITLE_WORDS = ["engineer", "engineering", "developer", "swe", "sde", "programmer", "member of technical staff"]

# Requirement words the parser lists as "skills" that aren't technologies, so a resume can't
# "cover" them and they shouldn't count as gaps.
NON_SKILL_TERMS = {
    "communication", "communication skills", "collaboration", "teamwork", "leadership", "mentoring",
    "mentorship", "problem solving", "problem-solving", "ownership", "api", "apis", "database",
    "databases", "programming", "coding", "testing", "debugging", "documentation", "agile", "scrum",
    "caching", "storage", "scalability", "reliability", "performance", "security", "design",
    "architecture", "data", "algorithms", "frontend", "backend", "fullstack", "cloud", "web", "mobile",
    "ui", "ux", "english",
}

# Tools a JD usually lists as alternatives ("at least one major cloud provider", "React or similar"):
# knowing one of a kind meets the requirement.
EQUIVALENT_SKILLS = [
    {"aws", "gcp", "azure"},
    {"claude", "cursor", "copilot", "codex"},
    {"kafka", "kinesis", "pub/sub", "sqs", "rabbitmq"},
    {"react", "vue", "angular", "svelte"},
    {"postgresql", "mysql"},
]

# Well-known H-1B filers beyond the boards marked h1b_known in company_boards. Matched as the
# leading words of a company name, so "Amazon Web Services" and "Stripe, LLC." both count.
WELL_KNOWN_SPONSORS = [
    "amazon", "aws", "google", "alphabet", "meta", "facebook", "microsoft", "apple", "nvidia", "intel",
    "cisco", "salesforce", "adobe", "oracle", "ibm", "uber", "linkedin", "netflix", "twitch", "intuit",
    "paypal", "ebay", "qualcomm", "vmware", "broadcom", "servicenow", "workday", "snowflake", "databricks",
    "tesla", "bytedance", "tiktok", "walmart", "capital one", "visa", "mastercard",
]
_SPONSOR_NAMES = [
    name.split() for name in {c["name"].lower() for c in SEED_COMPANIES if c.get("h1b_known")} | set(WELL_KNOWN_SPONSORS)
]
_COMPANY_SUFFIXES = {"inc", "llc", "corp", "corporation", "co", "ltd", "technologies", "the"}


def _has_word(text: str, phrase: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", text) is not None


def is_known_sponsor(company_name: str | None) -> bool:
    """Whether the company is a recognized H-1B sponsor (a stand-in until DOL data is imported)."""
    words = [w for w in re.findall(r"[a-z0-9&]+", (company_name or "").lower()) if w not in _COMPANY_SUFFIXES]
    return any(words[: len(key)] == key for key in _SPONSOR_NAMES)


@dataclass
class ScoreBreakdown:
    h1b: float = 0.0         # max 30
    level: float = 0.0       # max 20
    skills: float = 0.0      # max 20
    location: float = 0.0    # max 10
    company: float = 0.0     # max 10
    product: float = 0.0     # max 10

    is_auto_rejected: bool = False
    auto_reject_reasons: list[str] = field(default_factory=list)

    pool: ApplicationPool = ApplicationPool.selective
    pool_reason: str = ""

    @property
    def total(self) -> float:
        return self.h1b + self.level + self.skills + self.location + self.company + self.product

    @property
    def recommendation(self) -> Recommendation:
        if self.is_auto_rejected:
            return Recommendation.auto_reject
        if self.total >= APPLY_THRESHOLD:
            return Recommendation.apply
        if self.total >= MAYBE_THRESHOLD:
            return Recommendation.maybe
        return Recommendation.skip

    @property
    def recommendation_reason(self) -> str:
        if self.is_auto_rejected:
            return "Hard reject: " + "; ".join(self.auto_reject_reasons)
        if self.total >= APPLY_THRESHOLD:
            return f"Strong match ({self.total:.0f}/100). Customize resume and seek referral."
        if self.total >= MAYBE_THRESHOLD:
            return f"Decent match ({self.total:.0f}/100). Quick apply with minimal tailoring."
        return f"Weak match ({self.total:.0f}/100). Skip unless you have a strong reason to apply."


# (label, keywords, allowed) — allowed=False hard-rejects the role (irrelevant to
# US H-1B/OPT sponsorship). Deliberately excludes ambiguous single words that
# collide with US places or names (e.g. "Georgia", "Jordan").
LOCATION_REGIONS: list[tuple[str, list[str], bool]] = [
    ("China", ["china", "shanghai", "beijing", "shenzhen", "greater china"], True),
    ("UK", ["united kingdom", "london", "uk"], False),
    ("Canada", ["canada", "toronto", "vancouver", "montreal"], False),
    ("India", ["india", "bengaluru", "bangalore", "hyderabad", "mumbai", "delhi", "pune", "chennai"], False),
    ("Germany", ["germany", "berlin", "munich"], False),
    ("Ireland", ["ireland", "dublin"], False),
    ("Singapore", ["singapore"], False),
    ("Australia", ["australia", "sydney", "melbourne"], False),
    ("Japan", ["japan", "tokyo"], False),
    ("Poland", ["poland", "warsaw", "krakow"], False),
    ("Netherlands", ["netherlands", "amsterdam"], False),
    ("France", ["france", "paris"], False),
    ("Spain", ["spain", "madrid", "barcelona"], False),
    ("Italy", ["italy", "milan"], False),
    ("Switzerland", ["switzerland", "zurich"], False),
    ("Sweden", ["sweden", "stockholm"], False),
    ("Portugal", ["portugal", "lisbon"], False),
    ("Brazil", ["brazil", "sao paulo"], False),
    ("Mexico", ["mexico"], False),
    ("Colombia", ["colombia", "bogota"], False),
    ("Argentina", ["argentina", "buenos aires"], False),
    ("Chile", ["chile", "santiago"], False),
    ("Romania", ["romania", "bucharest"], False),
    ("Ukraine", ["ukraine", "kyiv"], False),
    ("Israel", ["israel", "tel aviv"], False),
    ("Philippines", ["philippines", "manila"], False),
    ("South Korea", ["south korea", "seoul"], False),
    ("Vietnam", ["vietnam", "hanoi"], False),
    ("Indonesia", ["indonesia", "jakarta"], False),
    ("Malaysia", ["malaysia", "kuala lumpur"], False),
    ("Hong Kong", ["hong kong"], False),
    ("Taiwan", ["taiwan", "taipei"], False),
    ("New Zealand", ["new zealand", "auckland"], False),
    ("Egypt", ["egypt", "cairo"], False),
    ("South Africa", ["south africa"], False),
    ("APAC", ["apjc", "apac"], False),
    ("EMEA", ["emea"], False),
    ("LATAM", ["latam"], False),
]


def work_authorization_conflict(jd_text_lower: str) -> str | None:
    """The hard-reject reason if the JD text rules this candidate out, else None. Sponsorship
    language only matters if you need sponsorship; citizenship / clearance requirements matter
    unless you're a US citizen. The first matching pattern is the reason given, sponsorship first.
    A plain text check, so discovery runs it before spending an AI call on the posting."""
    patterns = [
        *((p, "No sponsorship") for p in (settings.NO_SPONSOR_PATTERNS if profile.needs_sponsorship else [])),
        *((p, "Citizenship / clearance required") for p in ([] if profile.us_citizen else settings.CITIZENSHIP_PATTERNS)),
    ]
    for pattern, label in patterns:
        if pattern in jd_text_lower:
            return f"{label}: '{pattern}' found in JD"
    return None


# Multi-location postings list their offices as "San Francisco, CA; New York, NY; London, UK".
_LOCATION_SEPARATORS = re.compile(r"\s*(?:;|\||\n|\s/\s|\bor\b)\s*", re.IGNORECASE)


def location_parts(location: str | None) -> list[str]:
    return [part for part in _LOCATION_SEPARATORS.split(location or "") if part.strip()]


# ", CA" / ", NY" ... — a US office named in a comma-joined list the separators above can't split.
_US_MARKER = re.compile(
    r",\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY])\b"
    r"|\b(USA|U\.S\.A?\.?|United States)\b"
)


def blocked_region(location: str | None) -> tuple[str, bool] | None:
    """The disallowed region when EVERY listed office is in one, else None. A role offered in
    San Francisco and London is open to a US candidate, so the London office alone can't reject it."""
    if location and _US_MARKER.search(location):
        return None
    regions = [detect_region(part) for part in location_parts(location)]
    if not regions or any(r is None or r[1] for r in regions):
        return None
    return regions[0]


def detect_region(location: str | None) -> tuple[str, bool] | None:
    """Returns (label, allowed) if the location matches a known non-US region, else None."""
    if not location:
        return None
    loc_lower = location.lower()
    for label, keywords, allowed in LOCATION_REGIONS:
        if any(re.search(rf"\b{re.escape(kw)}\b", loc_lower) for kw in keywords):
            return label, allowed
    return None


# Titles that mark a role as open to early-career candidates. Checked only after the
# senior keywords, so "Associate Director" still reads as senior.
EARLY_CAREER_TITLE_PATTERNS = [
    "junior", "jr.", "jr ", "associate", "early career", "early-career",
    "entry level", "entry-level", "apprentice", "trainee",
]

# "Software Engineer I" / "Engineer 1" — anchored to the end so it can't fire on the
# stray "i" inside a title like "AI Engineer".
ENTRY_RANK_SUFFIX = re.compile(r"\b(i|1)\s*$")

# A 2-4y role only earns the selective pool if the work itself looks like a genuine
# fit — out of the 20 skill-match points, this is the bar for "highly aligned".
SELECTIVE_SKILL_FLOOR = 12.0

# Explicit floor at or above which a role is out of reach regardless of anything else.
HARD_REJECT_YEARS = 5


def _experience_signals(analysis: dict) -> tuple[int | None, bool | None, bool | None]:
    """(minimum years, internships accepted, years floor is hard) for a parsed JD.

    `min_years_experience` / `internship_experience_accepted` / `years_requirement_is_hard`
    are extracted independently of the title, but analyses parsed before those fields
    existed only carry the nested years_experience block — fall back to it so old jobs
    still classify instead of all landing in one bucket.
    """
    min_years = analysis.get("min_years_experience")
    if min_years is None:
        min_years = (analysis.get("years_experience") or {}).get("min")
    try:
        min_years = int(min_years) if min_years is not None else None
    except (TypeError, ValueError):
        min_years = None

    return (
        min_years,
        analysis.get("internship_experience_accepted"),
        analysis.get("years_requirement_is_hard"),
    )


def _senior_signal(analysis: dict) -> str | None:
    """Why this role reads as senior, or None. Title and level are both checked, since
    the parsed level can disagree with a title like 'Staff Engineer'."""
    title_lower = (analysis.get("title") or "").lower()
    for kw in settings.SENIOR_LEVEL_KEYWORDS:
        if kw not in title_lower:
            continue
        # "Member of Technical Staff" / "Member of Product Staff" is a flat-title
        # convention at AI labs, not a Staff-level rank.
        if kw == "staff" and "member of" in title_lower:
            continue
        return f"'{kw}' in title"

    level = analysis.get("level", "unknown")
    if level in ("senior", "staff", "principal", "manager"):
        return f"level parsed as '{level}'"
    return None


def classify_pool(analysis: dict, skills_score: float) -> tuple[ApplicationPool, str]:
    """Sort a role into an effort pool, reading experience requirements over the title.

    primary       — Junior / Associate / Early Career, <=2 years, or <=3 years when
                    internship experience explicitly counts.
    selective      — 2-4 years with no hard floor (or years never stated) and work that
                    lines up with real project experience.
    deprioritized  — Senior / Staff / Lead, or a hard 2-4 year floor.
    """
    min_years, internship_ok, years_hard = _experience_signals(analysis)
    level = analysis.get("level", "unknown")
    title_lower = (analysis.get("title") or "").lower()

    senior = _senior_signal(analysis)
    if senior:
        return ApplicationPool.deprioritized, f"Senior-track role ({senior})"
    if min_years is not None and min_years >= HARD_REJECT_YEARS:
        return ApplicationPool.deprioritized, f"Asks for {min_years}+ years"

    # --- primary ---
    if level in ("intern", "entry"):
        return ApplicationPool.primary, f"Entry-level role (level '{level}')"
    if min_years is not None and min_years <= 2:
        return ApplicationPool.primary, f"Minimum {min_years} years of experience"
    if min_years is not None and min_years <= 3 and internship_ok:
        return ApplicationPool.primary, f"{min_years} years, and internship experience counts"
    if level == "junior":
        return ApplicationPool.primary, "Junior-level role"
    if any(p in title_lower for p in EARLY_CAREER_TITLE_PATTERNS) or ENTRY_RANK_SUFFIX.search(title_lower):
        return ApplicationPool.primary, "Title is aimed at early-career candidates"
    if internship_ok and (min_years is None or min_years <= 3):
        return ApplicationPool.primary, "Internship experience explicitly counts"

    # --- selective ---
    if min_years is None:
        return (
            ApplicationPool.selective,
            "No years requirement stated — worth reading before ruling out",
        )
    if years_hard:
        return ApplicationPool.deprioritized, f"Hard floor of {min_years} years"
    if skills_score >= SELECTIVE_SKILL_FLOOR:
        return (
            ApplicationPool.selective,
            f"Asks for {min_years} years but sets no hard floor, and the work fits your projects",
        )
    return (
        ApplicationPool.deprioritized,
        f"Asks for {min_years} years and the work is only a loose fit",
    )


def _check_auto_reject(
    analysis: dict,
    jd_text_lower: str,
) -> tuple[bool, list[str]]:
    """
    Hard-reject rules that score 0 automatically.
    Returns (is_rejected, reasons).
    """
    reasons = []

    # 0. Non-US location (irrelevant to H-1B/OPT sponsorship). Checked regardless of
    # is_remote — a role can be "remote" but still restricted to a specific country
    # (e.g. "Remote Spain"), which is exactly the case this needs to catch.
    if region := blocked_region(analysis.get("location")):
        reasons.append(f"Non-US location: {region[0]} ('{analysis.get('location')}')")

    # 1. Work authorization.
    if conflict := work_authorization_conflict(jd_text_lower):
        reasons.append(conflict)

    sponsorship_status = analysis.get("sponsorship", {}).get("status", "unknown")
    if profile.needs_sponsorship and sponsorship_status == "no_sponsor" and not reasons:
        reasons.append("AI detected no-sponsorship language")

    # 2. Years experience out of reach. Only an explicit 5+ floor rejects outright;
    # senior-sounding titles and 2-4 year asks are sorted into the deprioritized pool
    # by classify_pool instead, since a title alone is a poor guide to who gets hired.
    min_years, _, _ = _experience_signals(analysis)
    if min_years is not None and min_years >= HARD_REJECT_YEARS:
        reasons.append(f"Requires {min_years}+ years of experience")

    title_lower = (analysis.get("title") or "").lower()

    # 3. Gated to a graduating-student cohort, not open to candidates who already
    # graduated. Title phrasing is trusted directly; body text only counts when it's
    # an unambiguous eligibility-window statement (body text often just says "new
    # grad" to redirect actual new grads to a *different* posting, not to gate this one).
    # A new grad is exactly who those postings want, so the rule is off for them.
    for pattern in [] if profile.new_grad else settings.NEW_GRAD_ONLY_TITLE_PATTERNS:
        if pattern in title_lower:
            reasons.append(f"New-grad-cohort only: '{pattern}' in title")
            break
    if not profile.new_grad and not any("New-grad-cohort" in r for r in reasons):
        for pattern in settings.NEW_GRAD_ONLY_BODY_PATTERNS:
            if pattern in jd_text_lower:
                reasons.append(f"New-grad-cohort only: '{pattern}' found")
                break

    return bool(reasons), reasons


def _score_h1b(
    analysis: dict,
    company_h1b_total: int = 0,
    company_h1b_rate: float | None = None,
    company_swe_filings: int = 0,
    known_sponsor: bool = False,
) -> float:
    """
    H-1B / OPT / STEM OPT friendliness score (max 30).

    Logic:
    - JD sponsorship_status = sponsors → strong base
    - DOL filing history adds confidence
    - E-Verify registered → STEM OPT compatible

    Someone who doesn't need sponsorship gets the full score: it's simply not a risk for them.
    """
    if not profile.needs_sponsorship:
        return float(settings.SCORE_WEIGHT_H1B)
    score = 0.0

    sponsor_status = analysis.get("sponsorship", {}).get("status", "unknown")
    h1b_risk = analysis.get("h1b_risk_score", 5)

    # Base from JD language (max 15)
    if sponsor_status == "sponsors":
        score += 15
    elif sponsor_status == "unknown":
        # Use risk score: 0=safe → 15pts, 10=risky → 0pts
        score += max(0, 15 - h1b_risk * 1.5)
    else:  # no_sponsor — should have been auto-rejected, but just in case
        score += 0

    # Historical H-1B filings (max 10)
    if company_h1b_total >= 50 and company_swe_filings >= 10:
        score += 10
    elif company_h1b_total >= 20:
        score += 7
    elif company_h1b_total >= 5:
        score += 4
    elif company_h1b_total > 0:
        score += 2
    elif known_sponsor:
        # No DOL filings loaded for this company: a recognized sponsor stands in for the
        # "20+ filings" tier rather than scoring like a company that never filed.
        score += 7

    # Approval rate bonus (max 5)
    if company_h1b_rate is not None:
        if company_h1b_rate >= 0.95:
            score += 5
        elif company_h1b_rate >= 0.80:
            score += 3
        elif company_h1b_rate >= 0.60:
            score += 1

    return min(score, 30.0)


def _score_level(analysis: dict, pool: ApplicationPool) -> float:
    """Level match score (max 20), graded within the role's effort pool.

    The pool already encodes the decision (apply / look closer / leave alone), so this
    just spreads roles inside it — a deprioritized role scores low enough that it drops
    out of the apply and maybe bands on its own, without being hidden outright.
    """
    level = analysis.get("level", "unknown")
    min_years, internship_ok, _ = _experience_signals(analysis)

    if pool == ApplicationPool.primary:
        if level in ("intern", "entry"):
            return 20.0
        if min_years is not None and min_years <= 2:
            return 18.0
        if internship_ok:
            return 17.0
        return 16.0

    if pool == ApplicationPool.selective:
        return 10.0 if min_years is None else 8.0

    return 0.0 if _senior_signal(analysis) else 3.0


def tech_terms(terms: list[str]) -> set[str]:
    """The technologies in a parsed skill list: known vocabulary, plus unknown one-word names
    (cuda, kotlin, webpack...). Prose ("consumer products") and soft skills are left out — a
    resume can't "have" them, so counting them would only add fake gaps."""
    return {
        t for t in normalize_skill_terms(terms)
        if t in SKILL_SYNONYMS or (" " not in t and t not in NON_SKILL_TERMS and len(t) <= 20)
    }


def _score_skills(
    required_skills: list[str],
    tech_stack: list[str],
    nice_to_have: list[str],
    resume_matched_skills: list[str],
    resume_text: str = "",
) -> float:
    """Skills match (max 20): the share of the JD's technical asks the resume covers.

    Every technology the JD names counts — not just the ones on the target list, which made a
    JD asking for C++/CUDA/MLIR score 20/20 because the only target skills it named were AI and
    Python. Required skills weigh twice the nice-to-haves. One pseudo-skill at 50% is mixed in,
    so a JD naming a single skill can't swing the score to 0 or 20, and a JD naming none scores
    a neutral 10.
    """
    required = tech_terms(required_skills + tech_stack)
    # The parsed tech_stack lists every technology in the JD, nice-to-haves included; one that
    # the nice-to-have text names ("Familiarity with Rust, Go, or Java") is a nice-to-have.
    nice_text = " ".join(nice_to_have).lower()
    nice = (tech_terms(nice_to_have) - required) | {t for t in required if _has_word(nice_text, t)}
    required -= nice
    resume = normalize_skill_terms(resume_matched_skills)
    resume_lower = resume_text.lower()

    def has_skill(term: str) -> bool:
        # Unknown names (vite, sqs...) aren't in the skill vocabulary, so look for them in the text.
        return term in resume or _has_word(resume_lower, term)

    def asks(terms: set[str]) -> list[bool]:
        """One entry per requirement, True if covered. Interchangeable tools ("AWS, GCP or
        Azure") are one requirement, met by knowing any tool of that kind."""
        out, grouped = [], set()
        for group in EQUIVALENT_SKILLS:
            if terms & group:
                out.append(any(has_skill(t) for t in group))
                grouped |= terms & group
        return out + [has_skill(t) for t in terms - grouped]

    req, opt = asks(required), asks(nice)
    hits = 2 * sum(req) + sum(opt)
    asked = 2 * len(req) + len(opt)
    return round(20 * (hits + 1) / (asked + 2), 1)


def _score_direction(title: str | None, skill_terms: set[str]) -> float:
    """Role direction fit (max 10): is this the kind of work the candidate is aiming for?
    Read from the title first; a generic title ("Software Engineer I") falls back to how much
    of the JD's stack is the target stack."""
    t = (title or "").lower()
    on = any(_has_word(t, k) for k in DIRECTION_KEYWORDS)
    off = any(_has_word(t, k) for k in OFF_TRACK_KEYWORDS)
    if on and not any(_has_word(t, w) for w in ENGINEERING_TITLE_WORDS):
        return 5.0  # "Enforcement Analyst, Agentic Alignment" — the keyword, not the job
    if on and not off:
        return 10.0
    if on and off:
        return 7.0  # "Full Stack / Backend", "Frontend Infrastructure"
    if off:
        return 2.0
    if not skill_terms:
        return 5.0
    share = len(skill_terms & normalize_skill_terms(settings.TARGET_SKILLS)) / len(skill_terms)
    return round(3 + 7 * share, 1)


def _score_location(location: str | None, is_remote: bool, is_hybrid: bool) -> float:
    """Location score (max 10)."""
    if is_remote:
        return 10.0
    if is_hybrid:
        return 8.0

    if not location:
        return 5.0

    loc_lower = location.lower()
    for kw in settings.BAY_AREA_KEYWORDS:
        if kw in loc_lower:
            return 10.0

    # Other major US tech hubs
    for hub in ["new york", "nyc", "seattle", "austin", "boston", "chicago", "atlanta", "denver"]:
        if hub in loc_lower:
            return 5.0

    return 2.0


def _score_company(size: CompanySize | None, h1b_total: int = 0, known_sponsor: bool = False) -> float:
    """Company size / stability score (max 10). With no company record (the companies table is
    only filled by the DOL import), a recognized H-1B sponsor scores like an enterprise."""
    if size is None and known_sponsor:
        return 9.0
    if size == CompanySize.enterprise:
        return 9.0
    if size == CompanySize.large:
        return 8.0
    if size == CompanySize.medium:
        return 6.0
    if size == CompanySize.small:
        return 5.0
    if size == CompanySize.startup:
        # Startup with filing history is OK, without is risky
        return 5.0 if h1b_total > 0 else 3.0
    return 5.0  # unknown


def compute_score(
    analysis: dict,
    jd_text_lower: str,
    resume_matched_skills: list[str] | None = None,
    company_h1b_total: int = 0,
    company_h1b_rate: float | None = None,
    company_swe_filings: int = 0,
    company_size: CompanySize | None = None,
    resume_text: str = "",
    company_name: str | None = None,
) -> ScoreBreakdown:
    """
    Main scoring function. Call after AI parsing + optional company lookup.
    resume_text lets the skill match find technologies outside the skill vocabulary.
    """
    result = ScoreBreakdown()
    known_sponsor = is_known_sponsor(company_name or analysis.get("company_name"))

    # --- Hard reject check ---
    is_rejected, reject_reasons = _check_auto_reject(analysis, jd_text_lower)
    if is_rejected:
        result.is_auto_rejected = True
        result.auto_reject_reasons = reject_reasons
        result.pool = ApplicationPool.deprioritized
        result.pool_reason = reject_reasons[0]
        return result

    # --- H-1B score ---
    result.h1b = _score_h1b(
        analysis,
        company_h1b_total=company_h1b_total,
        company_h1b_rate=company_h1b_rate,
        company_swe_filings=company_swe_filings,
        known_sponsor=known_sponsor,
    )

    # --- Skills score (first: the pool's "does the work actually fit" test reads it) ---
    required = analysis.get("required_skills") or []
    stack = analysis.get("tech_stack") or []
    nice = analysis.get("nice_to_have_skills") or []
    result.skills = _score_skills(
        required_skills=required,
        tech_stack=stack,
        nice_to_have=nice,
        resume_matched_skills=resume_matched_skills or [],
        resume_text=resume_text,
    )

    # --- Effort pool + level score ---
    result.pool, result.pool_reason = classify_pool(analysis, result.skills)
    result.level = _score_level(analysis, result.pool)

    # --- Location score ---
    result.location = _score_location(
        location=analysis.get("location"),
        is_remote=analysis.get("is_remote", False),
        is_hybrid=analysis.get("is_hybrid", False),
    )

    # --- Company score ---
    result.company = _score_company(company_size, company_h1b_total, known_sponsor)

    # --- Role direction fit (max 10; stored in the "product" column) ---
    result.product = _score_direction(analysis.get("title"), tech_terms(required + stack + nice))

    return result
