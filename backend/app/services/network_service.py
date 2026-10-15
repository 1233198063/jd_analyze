"""
Networking / coffee chats: a small contact tracker plus the toolkit for reaching out.

Replaced the GHC 26 guide on 2026-10-14 after the user said GHC was cancelled this year. What
carried over from it: the 30-second intro, the visa phrasing and the "follow up once, after the
event" etiquette; the GHC-specific parts (dates, expo, sponsor list) were dropped.

Contacts move through stages; each stage change appends an interaction to the contact's timeline
(the weekly outreach / chat counts come from there) and, unless the user picked one, fills in a
sensible next-follow-up date (e.g. a week after messaging, the day after a chat for the thank-you).
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application, ApplicationStatus
from app.models.job import Job, JobAnalysis, ResumeMatchScore
from app.models.network import NetworkContact
from app.core.profile import profile

STAGES = ["to_contact", "messaged", "replied", "scheduled", "chatted", "referred", "dormant"]
SOURCES = ["alumni", "coworker", "linkedin", "event", "referral", "other"]
EVENT_TYPES = ["message", "reply", "scheduled", "chat", "follow_up", "referral"]

# The interaction a stage change records, and how many days later the next step is due.
STAGE_EVENT = {"messaged": "message", "replied": "reply", "scheduled": "scheduled", "chatted": "chat", "referred": "referral"}
STAGE_FOLLOW_UP_DAYS = {"messaged": 7, "replied": 2, "chatted": 1, "referred": 14}
# A logged follow-up pushes the next one out by this much.
FOLLOW_UP_AGAIN_DAYS = 7

WEEKLY_OUTREACH_TARGET = 5  # new messages + follow-ups
WEEKLY_CHAT_TARGET = 2

# Pipeline "companies" that are staffing agencies or job boards — nobody to network with there.
AGENCY_PATTERN = re.compile(r"recruit|staffing|placement|talent|search|hired|jobright|emonics", re.I)



def _norm(name: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def serialize(contact: NetworkContact) -> dict:
    return {
        "id": str(contact.id),
        "name": contact.name,
        "company": contact.company,
        "role": contact.role,
        "source": contact.source,
        "linkedin_url": contact.linkedin_url,
        "stage": contact.stage,
        "next_follow_up": contact.next_follow_up,
        "notes": contact.notes,
        "timeline": sorted(contact.timeline or [], key=lambda e: e.get("date") or "", reverse=True),
        "created_at": contact.created_at,
    }


def add_event(contact: NetworkContact, event_type: str, on: date, note: str | None = None) -> None:
    event = {"type": event_type, "date": on.isoformat()}
    if note:
        event["note"] = note
    # Reassign rather than mutate so SQLAlchemy sees the JSONB change.
    contact.timeline = [*(contact.timeline or []), event]


def apply_stage(contact: NetworkContact, stage: str, today: date, follow_up_given: bool) -> None:
    """Move to a stage: record the interaction and, unless the caller set one, the next due date."""
    if stage == contact.stage:
        return
    contact.stage = stage
    if stage in STAGE_EVENT:
        add_event(contact, STAGE_EVENT[stage], today)
    if follow_up_given:
        return
    if stage in STAGE_FOLLOW_UP_DAYS:
        contact.next_follow_up = today + timedelta(days=STAGE_FOLLOW_UP_DAYS[stage])
    elif stage == "dormant":
        contact.next_follow_up = None


def _week_counts(contacts: list[NetworkContact], today: date) -> dict:
    week_start = today - timedelta(days=today.weekday())  # Monday
    outreach = chats = 0
    for contact in contacts:
        for event in contact.timeline or []:
            try:
                on = date.fromisoformat(event["date"])
            except (KeyError, ValueError):
                continue
            if not week_start <= on <= today:
                continue
            if event.get("type") in ("message", "follow_up"):
                outreach += 1
            elif event.get("type") == "chat":
                chats += 1
    return {
        "week_start": week_start,
        "outreach": outreach,
        "outreach_target": WEEKLY_OUTREACH_TARGET,
        "chats": chats,
        "chat_target": WEEKLY_CHAT_TARGET,
    }


async def _pipeline_gaps(db: AsyncSession, contacts: list[NetworkContact]) -> list[dict]:
    """Companies in the job pipeline (applied, saved, or scored 60+) where you don't know anyone yet."""
    rows = (
        await db.execute(
            select(
                Job.company_name, JobAnalysis.company_name, ResumeMatchScore.overall_score,
                ResumeMatchScore.is_auto_rejected, Application.status,
            )
            .outerjoin(JobAnalysis, JobAnalysis.job_id == Job.id)
            .outerjoin(ResumeMatchScore, ResumeMatchScore.job_id == Job.id)
            .outerjoin(Application, Application.job_id == Job.id)
        )
    ).all()

    known = {_norm(c.company) for c in contacts if c.company}
    companies: dict[str, dict] = {}
    for job_company, parsed_company, score, rejected, app_status in rows:
        name = (parsed_company or job_company or "").strip()
        if not name or rejected or AGENCY_PATTERN.search(name) or _norm(name) in known:
            continue
        active = app_status is not None and app_status not in (ApplicationStatus.rejected, ApplicationStatus.withdrawn)
        if not active and (score or 0) < 60:
            continue
        entry = companies.setdefault(_norm(name), {"company": name, "best_score": 0, "jobs": 0, "applied": False})
        entry["jobs"] += 1
        entry["best_score"] = max(entry["best_score"], round(score or 0))
        entry["applied"] = entry["applied"] or active

    gaps = sorted(companies.values(), key=lambda c: (not c["applied"], -c["best_score"], c["company"].lower()))
    for gap in gaps:
        # Only when the profile names a school — otherwise there are no alumni to search.
        gap["alumni_url"] = (
            f"{profile.alumni_search_url}?keywords={quote(gap['company'])}" if profile.alumni_search_url else None
        )
        gap["people_url"] = (
            "https://www.linkedin.com/search/results/people/?keywords="
            + quote(f"{gap['company']} software engineer")
        )
    return gaps


async def overview(db: AsyncSession) -> dict:
    today = date.today()
    contacts = (await db.execute(select(NetworkContact).order_by(NetworkContact.created_at.desc()))).scalars().all()
    due = sorted(
        (c for c in contacts if c.next_follow_up and c.next_follow_up <= today and c.stage != "dormant"),
        key=lambda c: c.next_follow_up,
    )
    return {
        "today": today,
        "contacts": [serialize(c) for c in contacts],
        "due_ids": [str(c.id) for c in due],
        "week": _week_counts(list(contacts), today),
        "pipeline_gaps": await _pipeline_gaps(db, list(contacts)),
        "toolkit": toolkit(),
    }


# ── Toolkit ─────────────────────────────────────────────────────────────────
# Templates with [placeholders]; profile.networking_scripts replaces any of them by key (your own
# 30-second intro, an alumni note that names your school…) or adds new ones.
DEFAULT_SCRIPTS = [
    {
        "key": "intro",
        "title": "30 秒自我介绍",
        "text": (
            "Hi, I'm [Name]. I'm a [role] at [company], where I [what you own, in one line] — most recently "
            "[one result with a number]. Before that, [previous role or project in one line]. I'm exploring "
            "[the roles you want], so I'd love to hear how your team works."
        ),
    },
    {
        "key": "alumni",
        "title": "LinkedIn 邀请：校友（300 字符以内）",
        "text": (
            "Hi [Name] — fellow [School] grad here ([degree, year]). I [what you build] at [company / city] and I'm "
            "curious how you found the move to [Company]. Would you be open to a 20-minute chat in the next couple "
            "of weeks?"
        ),
    },
    {
        "key": "cold",
        "title": "LinkedIn / 邮件：没有共同点的工程师",
        "text": (
            "Hi [Name] — I came across [your post / talk / your team's work on X] and it's close to what I work on: "
            "I [what you build]. Could I ask you two or three questions about how your team works? 20 minutes over "
            "video, whenever suits you."
        ),
    },
    {
        "key": "nudge",
        "title": "一周没回复：跟进一次",
        "text": (
            "Hi [Name], just floating this back up in case it got buried — completely understand if things are busy. "
            "Happy to work around your schedule, even a 15-minute call would be great."
        ),
    },
    {
        "key": "thanks",
        "title": "聊完后 24 小时内：感谢",
        "text": (
            "Hi [Name], thanks again for taking the time today. [Specific thing they said] was really helpful — I'm "
            "going to [action you said you'd take]. I'll keep you posted on how it goes."
        ),
    },
    {
        "key": "referral",
        "title": "请求内推（只在聊过之后）",
        "text": (
            "Hi [Name], following up on our chat — I'm applying to [role, req ID] on [team]. Based on what you shared "
            "about [their team's work], I think my work on [relevant project] lines up well. Would you be comfortable "
            "referring me? I've attached my resume and a three-line summary you can paste into the referral form. "
            "No worries at all if it's not a fit."
        ),
    },
]
VISA_SCRIPT = {
    "key": "visa",
    "title": "被问到签证时",
    "text": (
        "I'm on [OPT / STEM OPT] right now, so I'd need H-1B sponsorship down the line — it would be a change of "
        "status inside the U.S., so the $100K fee doesn't apply."
    ),
}


def _scripts() -> list[dict]:
    scripts = [*DEFAULT_SCRIPTS, *([VISA_SCRIPT] if profile.needs_sponsorship else [])]
    overrides = {s.key: s.model_dump() for s in profile.networking_scripts}
    merged = [overrides.pop(s["key"], s) for s in scripts]
    return merged + list(overrides.values())  # profile scripts with new keys go last


def _where() -> list[dict]:
    links = []
    if profile.alumni_search_url:
        links.append({"label": "校友（LinkedIn 学校页 → People，按公司筛）", "url": profile.alumni_search_url})
    if profile.career_portal:
        links.append({"label": f"{profile.career_portal.label}：学校的活动和雇主信息", "url": profile.career_portal.url})
    links += [link.model_dump() for link in profile.networking_links]
    links.append({"label": "LinkedIn：按公司和职位搜人", "url": "https://www.linkedin.com/search/results/people/"})
    return links


def _questions() -> list[tuple[str, list[str]]]:
    groups = [
        ("对方的工作", [
            "What does a typical week look like for you and your team?",
            "What's the hardest technical problem your team is working on right now?",
            "How is your team using AI or LLMs in the product, if at all?",
        ]),
        ("团队与招聘", [
            "How does your team usually hire early-career engineers?",
            "What makes a candidate stand out for engineering roles here?",
            "Is there a team you think would be a good fit for someone with my background?",
        ]),
        ("成长", [
            "What do you wish you had known in your first year here?",
            "How do engineers here get feedback and grow?",
        ]),
    ]
    if profile.needs_sponsorship:
        groups.append(("签证（聊熟之后，语气轻一点）", [
            "Have you seen early-career engineers on OPT or H-1B join your team recently?",
        ]))
    groups.append(("收尾", [
        "Is there anyone else you think I should talk to?",
        "What would be the best way to stay in touch?",
    ]))
    return groups


def toolkit() -> dict:
    return {
        "cadence": [
            f"每周目标：{WEEKLY_OUTREACH_TARGET} 条联系（新消息 + 跟进）、{WEEKLY_CHAT_TARGET} 次 coffee chat。页面顶部按本周（周一起）自动统计。",
            "先找有共同点的人：校友、前同事、和你技术栈相同的工程师。共同点越具体，回复率越高。",
            "一条消息只提一个请求。第一条消息不附简历、不直接要内推。",
            "没回复的话一周后跟进一次，再没回就放下（改成「暂停」），别连续追。",
            "聊完 24 小时内发感谢。内推只在真正聊过、对方了解你之后再开口。",
        ],
        "where": _where(),
        "agenda": [
            ("0–2 分钟", "感谢对方抽时间，用 30 秒介绍自己。"),
            ("2–15 分钟", "问对方和团队：在做什么、怎么工作、团队需要什么样的人。多听少说。"),
            ("15–22 分钟", "挑一个和他们团队相关的项目讲 1 分钟，问对方的建议。"),
            ("22–25 分钟", "问「还有谁你建议我聊一聊？」。内推只在自然的时候提。"),
            ("结束", "准时结束——约 20 分钟就 20 分钟，对方会更愿意帮你。"),
        ],
        "questions": _questions(),
        "scripts": _scripts(),
    }
