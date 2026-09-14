"""
AI-powered JD parser using OpenAI GPT-4o.
Extracts structured data and applies scoring rules defined by user's job search strategy.
"""
import json
import re
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY)

MODEL = "gpt-4o"

PARSE_JD_PROMPT = """You are an expert job description analyzer specialized in software engineering roles.
Extract structured data precisely and conservatively — if information is not clearly stated, use null.
Always respond with valid JSON only, no markdown, no explanation.

Parse this software engineering job description and return a single JSON object.

Job Description:
{jd_text}

Return exactly this JSON structure (no other text):
{{
  "title": "exact job title as written",
  "company_name": "company name or null",
  "level": one of ["intern", "entry", "junior", "mid", "senior", "staff", "principal", "manager", "unknown"],
  "years_experience": {{"min": number_or_null, "max": number_or_null}},
  "location": "city/state or 'Remote' or null",
  "is_remote": true/false,
  "is_hybrid": true/false,
  "is_contract": true/false,
  "sponsorship": {{
    "status": one of ["sponsors", "no_sponsor", "unknown"],
    "raw_text": "exact text mentioning sponsorship/visa/authorization or null",
    "signals": ["list of exact phrases that determined the status"]
  }},
  "tech_stack": ["all technologies, frameworks, tools, platforms mentioned"],
  "required_skills": ["must-have skills — look for 'required', 'must have', 'you will need'"],
  "nice_to_have_skills": ["preferred/bonus skills — look for 'nice to have', 'preferred', 'plus'"],
  "degree": {{
    "required": true/false,
    "preferred": true/false,
    "level": one of ["BS", "MS", "PhD", "any", null]
  }},
  "salary": {{
    "min": number_or_null,
    "max": number_or_null,
    "currency": "USD",
    "period": "annual"
  }},
  "red_flags": [
    {{
      "flag": "a specific sentence explaining the concern, e.g. 'Requires 5+ years but titled Entry-Level' — never the literal word description",
      "severity": one of ["high", "medium", "low"],
      "category": one of ["sponsorship", "level_mismatch", "vague_req", "culture", "contract", "other"]
    }}
  ],
  "h1b_risk_score": integer 0-10 where 0=very likely sponsors, 10=almost certainly no sponsor,
  "summary": "2-3 sentences describing the role focus and ideal candidate"
}}

For h1b_risk_score:
- 0-2: Explicitly says they sponsor, or company is known big tech
- 3-4: No mention of sponsorship restrictions
- 5-6: Vague language like 'must be authorized'
- 7-8: Says 'will not sponsor' or 'no sponsorship'
- 9-10: 'Not eligible for immigration sponsorship' or security clearance required

For level classification:
- entry: 0-2 years, SWE I, SWE New Grad, Associate, Junior
- junior: 1-3 years, SWE II
- mid: 3-5 years, SWE III
- senior/staff/principal: clearly says those words or 5+ years"""

SCORE_RESUME_PROMPT = """You are an expert technical recruiter and resume coach.
Analyze resume-to-JD fit precisely. Respond with valid JSON only.

Compare this resume against the job analysis and return a detailed fit assessment.

RESUME TEXT:
{resume_text}

JOB ANALYSIS:
{job_analysis_json}

Return exactly this JSON (no other text):
{{
  "skill_overlap": ["skills found in both resume and JD"],
  "missing_keywords": ["keywords in JD required skills NOT found in resume"],
  "missing_evidence": [
    {{
      "requirement": "what JD asks for",
      "gap": "what's missing or weak in the resume"
    }}
  ],
  "recommended_bullets": [
    {{
      "for_skill": "skill or requirement this addresses",
      "bullet": "• [Action verb] [specific tech/method] to [result with metric if possible]"
    }}
  ],
  "strengths": ["specific things that match well"],
  "concerns": ["specific mismatches or gaps"],
  "product_fit_notes": "brief note on whether candidate's domain experience fits the company's product direction",
  "raw_skill_score": integer 0-20
}}"""

REFERRAL_PROMPT = """Write a short, professional LinkedIn cold message asking for a referral.

Company: {company_name}
Role: {title}
Level: {level}
Key Skills Match: {skill_overlap}
Sender context: New grad / entry-level software engineer, international student (needs visa sponsorship), strong in {top_skills}.

Requirements:
- Under 100 words
- Warm but not desperate
- Mention 1-2 specific skills that match the role
- Ask if they'd be willing to refer or share insights, not demand it
- No emojis

Return JSON only:
{{
  "subject": "short LinkedIn connection request or InMail subject (under 50 chars)",
  "message": "the full message text",
  "tips": ["tip 1 for this specific company/role", "tip 2"]
}}"""


def _call(prompt: str, max_tokens: int = 2048) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def parse_job_description(jd_text: str) -> dict:
    raw = _call(PARSE_JD_PROMPT.format(jd_text=jd_text[:12000]))
    return json.loads(raw)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def score_resume_vs_job(resume_text: str, job_analysis: dict) -> dict:
    raw = _call(
        SCORE_RESUME_PROMPT.format(
            resume_text=resume_text[:8000],
            job_analysis_json=json.dumps(job_analysis, indent=2)[:4000],
        )
    )
    return json.loads(raw)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def generate_referral_message(
    company_name: str,
    title: str,
    level: str,
    skill_overlap: list[str],
    top_skills: str,
) -> dict:
    raw = _call(
        REFERRAL_PROMPT.format(
            company_name=company_name,
            title=title,
            level=level,
            skill_overlap=", ".join(skill_overlap[:5]),
            top_skills=top_skills,
        ),
        max_tokens=512,
    )
    return json.loads(raw)
