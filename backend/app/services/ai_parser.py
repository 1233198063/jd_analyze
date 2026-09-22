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


COVER_LETTER_PROMPT = """You are an expert technical career coach writing a cover letter for an \
international student (OPT/STEM OPT/H-1B) applying to one specific job. Never invent companies, \
titles, dates, metrics, or projects that are not already in the resume text below — only reword, \
reorder, and emphasize what's genuinely there.

RESUME TEXT:
{resume_text}

JOB:
Company: {company_name}
Title: {title}
Level: {level}
Job summary: {job_summary}
Key requirements: {key_requirements}

Requirements:
- 3-4 short paragraphs, under 350 words total
- Open with genuine, specific interest in this role/company (not generic flattery)
- Connect 2-3 concrete pieces of the candidate's real experience (from the resume text) to the JD's \
actual requirements
- Confident, natural tone — no clichés like "I am writing to express my interest" or "team player"
- Do not mention visa/sponsorship status unless the resume text itself already discusses it
- Close with a brief, low-pressure call to action

Return JSON only:
{{
  "greeting": "e.g. 'Dear Hiring Manager,' or 'Dear {company_name} Team,'",
  "body": "the full letter body, paragraphs separated by \\n\\n, not including greeting or sign-off",
  "sign_off": "e.g. 'Sincerely,'"
}}"""


INTERVIEW_ANSWER_PROMPT = """You are coaching a candidate on how to answer one specific interview \
question for one specific job. Speak as the candidate, in the first person ("I"), using only what's \
genuinely true in their resume below — never invent companies, titles, metrics, or projects that \
aren't already there.

RESUME TEXT:
{resume_text}

JOB:
Company: {company_name}
Title: {title}
Level: {level}
Job summary: {job_summary}
Key requirements: {key_requirements}

INTERVIEW QUESTION:
{question}

Write the answer the candidate can say out loud or paste straight into an application.

Requirements:
- Plain, everyday spoken English — short sentences, no jargon, no corporate buzzwords, no clichés \
like "team player" or "I am passionate about"
- Concise: 80-150 words total, tight and to the point, no filler
- Logically structured: answer the question directly first, then back it up with 1-2 concrete, real \
details pulled from the resume, then (only if it naturally fits) a short line tying it back to this role
- Ground every claim in the resume text — do not invent tools, numbers, or experience that isn't there
- No headers, no bullet points, no markdown — just natural spoken paragraphs

Return JSON only:
{{
  "answer": "the full answer text, paragraphs separated by \\n\\n if more than one"
}}"""


TAILOR_RESUME_PROMPT = """You are an expert technical resume writer and interview coach helping an \
international student (OPT/STEM OPT/H-1B) tailor their resume for one specific job, without ever \
misrepresenting their real experience.

CRITICAL RULES — DO NOT VIOLATE ANY OF THESE:
1. Never invent companies, titles, dates, degrees, metrics, or entire projects that are not already \
in the original resume text.
2. Never state that the candidate has used a technology/skill in the tailored resume unless the \
original resume already provides genuine, defensible evidence of it (including close synonyms, e.g. \
resume says "Postgres" and JD wants "SQL" — that's already true, use it freely).
3. You may reorder bullets, cut irrelevant ones, rephrase for JD terminology/keyword alignment, and \
surface skills that are already implied but under-emphasized. This is NOT fabrication.
4. For a JD skill the candidate doesn't have evidence for, you may propose folding it into an EXISTING \
project as an "integration_suggestion" ONLY if there is a genuine, plausible link to something they \
already built (e.g. they already built a caching layer and the JD wants Redis specifically — if the \
resume doesn't name the tool, suggest naming it ONLY if the candidate could truthfully say they used \
it; otherwise do not suggest it). If there's no honest link, put the skill in learning_gaps instead — \
never write it into tailored_text.
5. Every integration_suggestion must carry a honesty_note telling the candidate exactly what they must \
be able to genuinely explain if asked about it in an interview, so they self-check before using it.
6. tailored_text must stay the same real length/scope as the original — do not pad it with generic \
filler, and do not shorten real content just to fit keywords.

RESUME TEXT:
{resume_text}

JOB ANALYSIS (parsed from the JD):
{job_analysis_json}

TASK — produce all six of these:
1. tailored_text: the rewritten resume (plain text, same structure/sections as the original), \
reordered and reworded to foreground what's relevant to this JD and naturally use the JD's own \
terminology wherever it's already truthfully supported.
2. change_notes: a running list of the edits you made versus the original, in the order they'd be \
encountered reading top to bottom — each one a short change (what you changed, e.g. "Moved the Redis \
caching bullet to the top of the Backend Co. entry"), a reason (why, tied to this JD, e.g. "JD lists \
caching/Redis as a required skill"), and fills_gap (the exact skill/keyword name from the JD this edit \
newly surfaces, or null if it's just reordering/rephrasing without covering a new requirement).
3. keyword_coverage: for each important keyword drawn from the JD's required_skills, \
nice_to_have_skills, and tech_stack — whether it appears in the original resume, whether it appears \
in tailored_text, and covered_via (which bullet/section it now lives in, or null if not covered).
4. integration_suggestions: JD skills missing from the resume that can be honestly folded into an \
EXISTING bullet/project — each with the target_bullet (quote or closely paraphrase the existing resume \
line), suggested_addition (exact text to weave in), how_to_explain (the talking points the candidate \
should be ready to give in an interview), and honesty_note (what they must actually be able to speak \
to, or go verify/practice, before adding this).
5. trade_off_notes: for notable technology choices reflected in tailored_text (existing or newly \
surfaced) that an interviewer is likely to probe with "why X and not Y" — the trade-off explanation to \
give, the alternatives_considered (similar/competing technologies), why_not_alternatives, and \
how_to_explain as a ready-to-say answer.
6. learning_gaps: skills/technologies/experience that show up meaningfully in this JD that the \
candidate does not have and could NOT be honestly folded into existing experience (so they do NOT \
appear anywhere in tailored_text) — why_it_matters for this type of role, how_to_learn (a concrete, \
fast way to start), and priority (high/medium/low based on how central it is to this JD).

Respond with EXACTLY this format — a plain-text block, then a JSON block, no markdown fencing, no \
commentary before/after. This exact protocol matters because the response is parsed while it's still \
streaming in:

===RESUME===
<the full tailored_text here, as plain text, nothing else on these lines>
===META===
{{
  "change_notes": [
    {{"change": "...", "reason": "...", "fills_gap": "..." or null}}
  ],
  "keyword_coverage": [
    {{"keyword": "...", "in_original_resume": true/false, "in_tailored_resume": true/false, "covered_via": "..." or null}}
  ],
  "integration_suggestions": [
    {{"skill": "...", "target_bullet": "...", "suggested_addition": "...", "how_to_explain": "...", "honesty_note": "..."}}
  ],
  "trade_off_notes": [
    {{"topic": "...", "why_this_choice": "...", "alternatives_considered": ["...", "..."], "why_not_alternatives": "...", "how_to_explain": "..."}}
  ],
  "learning_gaps": [
    {{"skill": "...", "why_it_matters": "...", "how_to_learn": "...", "priority": "high"/"medium"/"low"}}
  ]
}}
===END==="""


def _call(prompt: str, max_tokens: int = 2048) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()


def _call_stream(prompt: str, max_tokens: int = 4096):
    """Yields raw text deltas from a streaming chat completion (no JSON response_format —
    streamed output can't be valid JSON until the final token, so callers that need JSON mid-stream
    use a delimited plain-text protocol instead, e.g. TAILOR_RESUME_PROMPT)."""
    stream = client.chat.completions.create(
        model=MODEL,
        max_tokens=max_tokens,
        stream=True,
        messages=[{"role": "user", "content": prompt}],
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


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


def parse_tailor_stream_output(full_text: str) -> dict:
    """Parses the ===RESUME===/===META===/===END=== protocol produced by TAILOR_RESUME_PROMPT."""
    resume_marker, meta_marker, end_marker = "===RESUME===", "===META===", "===END==="

    resume_start = full_text.find(resume_marker)
    meta_start = full_text.find(meta_marker)
    if resume_start == -1 or meta_start == -1:
        raise ValueError("Malformed tailoring response: missing protocol markers")

    end_pos = full_text.find(end_marker)
    tailored_text = full_text[resume_start + len(resume_marker):meta_start].strip("\n")
    meta_text = full_text[meta_start + len(meta_marker):end_pos if end_pos != -1 else len(full_text)]
    meta = json.loads(meta_text.strip())

    return {
        "tailored_text": tailored_text,
        "change_notes": meta.get("change_notes", []),
        "keyword_coverage": meta.get("keyword_coverage", []),
        "integration_suggestions": meta.get("integration_suggestions", []),
        "trade_off_notes": meta.get("trade_off_notes", []),
        "learning_gaps": meta.get("learning_gaps", []),
    }


def _tailor_prompt(resume_text: str, job_analysis: dict) -> str:
    return TAILOR_RESUME_PROMPT.format(
        resume_text=resume_text[:8000],
        job_analysis_json=json.dumps(job_analysis, indent=2)[:4000],
    )


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def tailor_resume(resume_text: str, job_analysis: dict) -> dict:
    full_text = "".join(_call_stream(_tailor_prompt(resume_text, job_analysis)))
    return parse_tailor_stream_output(full_text)


def tailor_resume_stream(resume_text: str, job_analysis: dict):
    """Generator yielding raw text chunks live as the model writes them.

    Consumers track the ===RESUME===/===META=== markers to show a running preview, then call
    parse_tailor_stream_output() on the full buffered text once the stream ends.
    """
    yield from _call_stream(_tailor_prompt(resume_text, job_analysis))


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


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def generate_cover_letter(
    resume_text: str,
    company_name: str,
    title: str,
    level: str,
    job_summary: str,
    key_requirements: list[str],
) -> dict:
    raw = _call(
        COVER_LETTER_PROMPT.format(
            resume_text=resume_text[:8000],
            company_name=company_name,
            title=title,
            level=level,
            job_summary=job_summary or "(no summary available)",
            key_requirements=", ".join(key_requirements[:8]) or "(none listed)",
        ),
        max_tokens=1024,
    )
    return json.loads(raw)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def generate_interview_answer(
    resume_text: str,
    company_name: str,
    title: str,
    level: str,
    job_summary: str,
    key_requirements: list[str],
    question: str,
) -> dict:
    raw = _call(
        INTERVIEW_ANSWER_PROMPT.format(
            resume_text=resume_text[:8000],
            company_name=company_name,
            title=title,
            level=level,
            job_summary=job_summary or "(no summary available)",
            key_requirements=", ".join(key_requirements[:8]) or "(none listed)",
            question=question.strip()[:1000],
        ),
        max_tokens=512,
    )
    return json.loads(raw)
