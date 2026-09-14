"""
Deterministic scoring engine.
Applies user's job-search strategy rules on top of AI-extracted data.

Scoring weights (total = 100):
  H-1B / OPT / STEM OPT friendliness  30
  Level match (entry-level)            20
  Skill match                          20
  Location (Bay Area preferred)        10
  Company size / stability             10
  Product direction fit                10
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field

from app.core.config import settings
from app.services.skills import normalize_skill_terms
from app.models.job import SponsorshipStatus, JobLevel, Recommendation
from app.models.company import CompanySize


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

    @property
    def total(self) -> float:
        return self.h1b + self.level + self.skills + self.location + self.company + self.product

    @property
    def recommendation(self) -> Recommendation:
        if self.is_auto_rejected:
            return Recommendation.auto_reject
        if self.total >= 80:
            return Recommendation.apply
        if self.total >= 60:
            return Recommendation.maybe
        return Recommendation.skip

    @property
    def recommendation_reason(self) -> str:
        if self.is_auto_rejected:
            return "Hard reject: " + "; ".join(self.auto_reject_reasons)
        if self.total >= 80:
            return f"Strong match ({self.total:.0f}/100). Customize resume and seek referral."
        if self.total >= 60:
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


def detect_region(location: str | None) -> tuple[str, bool] | None:
    """Returns (label, allowed) if the location matches a known non-US region, else None."""
    if not location:
        return None
    loc_lower = location.lower()
    for label, keywords, allowed in LOCATION_REGIONS:
        if any(re.search(rf"\b{re.escape(kw)}\b", loc_lower) for kw in keywords):
            return label, allowed
    return None


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
    region = detect_region(analysis.get("location"))
    if region and not region[1]:
        reasons.append(f"Non-US location: {region[0]} ('{analysis.get('location')}')")

    # 1. Explicit no-sponsorship language
    for pattern in settings.NO_SPONSOR_PATTERNS:
        if pattern in jd_text_lower:
            reasons.append(f"No sponsorship: '{pattern}' found in JD")
            break

    sponsorship_status = analysis.get("sponsorship", {}).get("status", "unknown")
    if sponsorship_status == "no_sponsor" and not reasons:
        reasons.append("AI detected no-sponsorship language")

    # 2. Too senior
    title_lower = (analysis.get("title") or "").lower()
    for kw in settings.SENIOR_LEVEL_KEYWORDS:
        if kw in title_lower:
            reasons.append(f"Role is too senior: '{kw}' in title")
            break

    level = analysis.get("level", "unknown")
    if level in ("senior", "staff", "principal", "manager") and not any("senior" in r for r in reasons):
        reasons.append(f"Role level is '{level}', too senior for entry-level search")

    # 3. Years experience too high
    years_min = analysis.get("years_experience", {}).get("min") or 0
    if years_min >= 4:
        reasons.append(f"Requires {years_min}+ years of experience")

    # 4. Gated to a graduating-student cohort, not open to candidates who already
    # graduated. Title phrasing is trusted directly; body text only counts when it's
    # an unambiguous eligibility-window statement (body text often just says "new
    # grad" to redirect actual new grads to a *different* posting, not to gate this one).
    for pattern in settings.NEW_GRAD_ONLY_TITLE_PATTERNS:
        if pattern in title_lower:
            reasons.append(f"New-grad-cohort only: '{pattern}' in title")
            break
    if not any("New-grad-cohort" in r for r in reasons):
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
) -> float:
    """
    H-1B / OPT / STEM OPT friendliness score (max 30).

    Logic:
    - JD sponsorship_status = sponsors → strong base
    - DOL filing history adds confidence
    - E-Verify registered → STEM OPT compatible
    """
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

    # Approval rate bonus (max 5)
    if company_h1b_rate is not None:
        if company_h1b_rate >= 0.95:
            score += 5
        elif company_h1b_rate >= 0.80:
            score += 3
        elif company_h1b_rate >= 0.60:
            score += 1

    return min(score, 30.0)


def _score_level(analysis: dict) -> float:
    """Level match score (max 20). Ideal = entry-level, 0-2 years."""
    level = analysis.get("level", "unknown")
    years_min = analysis.get("years_experience", {}).get("min") or 0
    years_max = analysis.get("years_experience", {}).get("max") or 99

    # Perfect match: intern, entry, or clearly entry-level junior
    if level in ("intern", "entry"):
        return 20.0
    if level == "junior" and years_max <= 3:
        return 17.0
    if level == "unknown" and years_max <= 2:
        return 18.0
    if level == "unknown" and years_max <= 3:
        return 14.0
    if level == "junior":
        return 12.0
    if level == "mid" and years_min <= 2:
        return 8.0
    if level == "mid":
        return 4.0
    return 0.0


def _score_skills(
    required_skills: list[str],
    tech_stack: list[str],
    resume_matched_skills: list[str],
) -> float:
    """Skills match score (max 20) based on target skills and resume overlap."""
    all_jd_skills = normalize_skill_terms(required_skills + tech_stack)
    target = normalize_skill_terms(settings.TARGET_SKILLS)
    resume = normalize_skill_terms(resume_matched_skills)

    # Points for JD requiring our target skills
    target_in_jd = target & all_jd_skills
    if not target_in_jd:
        # JD uses totally different stack
        return 5.0

    # How much of the target stack in JD do we cover?
    covered = resume & target_in_jd
    coverage_ratio = len(covered) / max(len(target_in_jd), 1)

    # Scale to 20
    score = coverage_ratio * 20
    # Bonus: JD is aligned with our target stack
    if len(target_in_jd) >= 4:
        score = min(score + 2, 20)
    return round(score, 1)


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


def _score_company(size: CompanySize | None, h1b_total: int = 0) -> float:
    """Company size / stability score (max 10)."""
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
    product_fit_note: str | None = None,
) -> ScoreBreakdown:
    """
    Main scoring function. Call after AI parsing + optional company lookup.
    """
    result = ScoreBreakdown()

    # --- Hard reject check ---
    is_rejected, reject_reasons = _check_auto_reject(analysis, jd_text_lower)
    if is_rejected:
        result.is_auto_rejected = True
        result.auto_reject_reasons = reject_reasons
        return result

    # --- H-1B score ---
    result.h1b = _score_h1b(
        analysis,
        company_h1b_total=company_h1b_total,
        company_h1b_rate=company_h1b_rate,
        company_swe_filings=company_swe_filings,
    )

    # --- Level score ---
    result.level = _score_level(analysis)

    # --- Skills score ---
    result.skills = _score_skills(
        required_skills=analysis.get("required_skills", []),
        tech_stack=analysis.get("tech_stack", []),
        resume_matched_skills=resume_matched_skills or [],
    )

    # --- Location score ---
    result.location = _score_location(
        location=analysis.get("location"),
        is_remote=analysis.get("is_remote", False),
        is_hybrid=analysis.get("is_hybrid", False),
    )

    # --- Company score ---
    result.company = _score_company(company_size, company_h1b_total)

    # --- Product fit (max 10) ---
    # Heuristic: if AI gave us a product_fit_notes and it sounds positive, add points
    if product_fit_note and any(w in product_fit_note.lower() for w in ["strong", "good", "well", "match", "align"]):
        result.product = 8.0
    else:
        result.product = 5.0  # neutral default

    return result
