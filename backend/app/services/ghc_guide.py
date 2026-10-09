"""
GHC 26 (Grace Hopper Celebration, Oct 27-30 2026, Anaheim) prep guide: which sponsors are worth the
user's time, when to reach out, and how to turn booth visits into interviews.

The content is static and researched on 2026-10-07:
- Sponsor list = ghc.anitab.org/partners as of 2026-10-06 (Enterprise and Premium tiers are logo
  images; Participating partners come from the page's own exhibitors feed). It can still grow —
  recheck the week before the event.
- `uscis` = initial + continuing approvals in the USCIS H-1B Employer Data Hub FY2023 export, the
  newest downloadable file. It is a partial-year file (cap-season approvals for big tech are mostly
  missing), so it only answers "does this employer file H-1Bs at all", never "how many".
- The local `companies`/`h1b_records` tables are empty (no DOL import yet), so nothing here can be
  derived from them.

Fit is judged against the user's own rules (memory/scorer): early-career SWE (front-end, full-stack,
AI applications), Bay Area preferred, needs H-1B, and citizenship/clearance/ITAR roles are out.
"""
from __future__ import annotations

import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.application import Application
from app.models.ghc import GhcProgress
from app.models.job import Job, JobAnalysis, ResumeMatchScore

EVENT = {
    "name": "Grace Hopper Celebration 2026 (GHC 26)",
    "start": date(2026, 10, 27),
    "end": date(2026, 10, 30),
    "venue": "Anaheim Convention Center, Anaheim, CA",
    "virtual_fair": date(2026, 10, 26),
    # The user's plan (2026-10-07): a Two-Day Pass for the two core Expo days. Day 1 is mostly the
    # opening (One-Day Passes aren't even sold for Tuesday) and Friday is the shortened closing day.
    "attend_start": date(2026, 10, 28),
    "attend_end": date(2026, 10, 29),
    "attend_label": "周三–周四 · Two-Day Pass",
    "researched_on": date(2026, 10, 7),
    "partners_as_of": date(2026, 10, 6),
    "facts": [
        "Talent Expo 是招聘主场（公司 booth），Tech Expo 是产品/技术展示；官网称 Talent Expo 上的雇主在招 AI、新兴技术等岗位。",
        "Virtual Career Fair 在会前一天 10/26（周一）线上举行；所有线下注册都包含 AnitaB.org 主办的全部 Virtual Career Fair。",
        "票价（括号内为 AnitaB.org Premium 会员价，会员费另算）：全程 General $1,099（$699）；Two-Day Pass $699（$449），只能选连续两天——周二–周三、周三–周四或周四–周五；One-Day Pass $399（$249），只有周三、周四、周五；Virtual GHC 26 $499（$299）。天数票都包含 Virtual Career Fair。Academic 票需要学生认证，已毕业不适用。",
        "你的安排是周三–周四（10/28–29）：周二基本只有开幕（单日票都不卖周二），周五是缩短的闭幕日、面试名额多半已约满。这个判断基于去年的日程和票种设置——GHC 26 的 Agenda 一公布就核对 Talent Expo 是哪几天。",
        "GHC 26 的 Expo 开放时间截至 10/7 还没在官网公布（Agenda 页仍是去年的）。去年 Expo 按随机分配的两个 Access Group 分时段入场，分组在 Attendee Portal 里看——只去两天的话，拿到分组后算一下周三、周四你能进场的总时长。",
        "去年有与赞助商的 1:1 meeting：名额有限、先到先得，各公司自己放出时段，临近会议才公布——今年留意 Portal / App 通知，一放出就约。",
    ],
}

# fit: focus (重点) | worth (值得聊) | long_shot (低优先) | skip (跳过)
# sponsor: strong | some | unclear | no
# jobs: regex matched against the company name on analyzed jobs in the local DB
COMPANIES = [
    # ---- focus: strong H-1B sponsor + early-career front-end/full-stack/AI roles + Bay Area or SoCal
    {
        "key": "google", "name": "Google", "tier": "Enterprise", "fit": "focus", "sponsor": "strong", "uscis": 2460,
        "locations": "Mountain View · Sunnyvale · San Francisco",
        "roles": "Software Engineer II/III (L3/L4) — Front End, Full Stack, AI applications",
        "why": "你已经投了 2 个 Google 岗位（GDC AI Applications and Agents、Front End Pomelli），在 booth 报出这两个职位名，请对方帮忙找对应 recruiter。",
        "jobs": r"^google",
    },
    {
        "key": "amazon", "name": "Amazon / AWS", "tier": "Enterprise", "fit": "focus", "sponsor": "strong", "uscis": 6078,
        "locations": "Irvine（离会场约 15 英里）· Seattle · Sunnyvale · San Francisco",
        "roles": "Front-End Engineer I/II (FEE)，SDE I/II",
        "why": "Amazon 有独立的 Front-End Engineer 职位族，正对口。库里已有 4 个前端岗位（60–66 分），其中 AWS Front End Engineer 你已 Saved；Irvine 的 Front-End Engineer II 就在会场附近。Amazon 和 AWS 是两个独立的 Enterprise 赞助，可能是两个 booth。",
        "jobs": r"^(amazon|aws)",
    },
    {
        "key": "meta", "name": "Meta", "tier": "Premium", "fit": "focus", "sponsor": "strong", "uscis": 1537,
        "locations": "Menlo Park · Sunnyvale · Burlingame",
        "roles": "Software Engineer (E3/E4) — Product, Front End",
        "why": "产品工程文化、React 的发源地，和你在 Blackwave 做的 schema-driven React UI 层和 AI 助手最贴近。",
        "jobs": r"^meta( platforms)?$",
    },
    {
        "key": "apple", "name": "Apple", "tier": "Enterprise", "fit": "focus", "sponsor": "strong", "uscis": 1825,
        "locations": "Cupertino · Sunnyvale",
        "roles": "Software Engineer (ICT2/ICT3) — Web Front End, Full Stack, internal tools",
        "why": "大量 web / 内部工具团队都在湾区；问 booth 有没有 web 前端或 AI 产品方向的 early-career 岗位。",
        "jobs": r"^apple",
    },
    {
        "key": "microsoft", "name": "Microsoft", "tier": "Premium", "fit": "focus", "sponsor": "strong", "uscis": 2066,
        "locations": "Redmond · Mountain View · San Francisco",
        "roles": "Software Engineer (59–61)",
        "why": "你已投 Software Engineer - User Experience（68 分，Redmond），在 booth 上报 job ID，请对方 flag 你的申请。",
        "jobs": r"^microsoft",
    },
    {
        "key": "linkedin", "name": "LinkedIn", "tier": "Enterprise", "fit": "focus", "sponsor": "strong", "uscis": 254,
        "locations": "Sunnyvale · Mountain View · San Francisco",
        "roles": "Software Engineer — Web, Full Stack, AI products",
        "why": "总部和工程主力都在湾区，web 前端团队大，近两年 AI 功能多。",
        "jobs": r"^linkedin",
    },
    {
        "key": "uber", "name": "Uber", "tier": "Enterprise", "fit": "focus", "sponsor": "strong", "uscis": 207,
        "locations": "San Francisco · Sunnyvale",
        "roles": "Software Engineer II — Frontend, Full Stack",
        "why": "湾区总部，内部工具和商家/运营后台类 web 产品多，和你做 CRM / dashboard 的经历相近。",
        "jobs": r"^uber",
    },
    {
        "key": "paypal", "name": "PayPal", "tier": "Premium", "fit": "focus", "sponsor": "strong", "uscis": 343,
        "locations": "San Jose（总部）",
        "roles": "Software Engineer 2 — Full Stack (JavaScript / Node / React)",
        "why": "总部就在你住的 San Jose，JavaScript/Node 技术栈浓；不用搬家是很实在的优势，pitch 里可以提。",
        "jobs": r"^paypal",
    },
    {
        "key": "nvidia", "name": "NVIDIA", "tier": "Enterprise", "fit": "focus", "sponsor": "strong", "uscis": 394,
        "locations": "Santa Clara",
        "roles": "Software Engineer — AI applications, developer tools, web UI",
        "why": "AI 应用 / 工具链方向和你的 AI-native 工作流、LLM 产品经历相关。纯前端岗位比软件公司少，看 JD 是否以 web 为主。",
        "jobs": r"^nvidia",
    },
    {
        "key": "cloudflare", "name": "Cloudflare", "tier": "Premium", "fit": "focus", "sponsor": "some", "uscis": 30,
        "locations": "San Francisco · Austin · New York",
        "roles": "Software Engineer — Frontend (Dashboard), Full Stack, AI (Workers AI / Agents)",
        "why": "Dashboard 是大型 React 应用，近来在做 AI agents。规模比大厂小，booth 对话更容易被记住。库里的两个 Cloudflare 岗位在印度，已被自动排除。",
        "jobs": r"^cloudflare",
    },
    # ---- worth: good on one axis, weaker on another (location, stack, sponsorship clarity)
    {
        "key": "snap", "name": "Snap", "tier": "Participating", "fit": "worth", "sponsor": "some", "uscis": 84,
        "locations": "Santa Monica / LA · Palo Alto · San Francisco · Seattle",
        "roles": "Software Engineer — Web, Full Stack",
        "why": "赞助类型是 Premium Package；南加州和湾区都有办公室，web 前端岗位可以直接问。",
        "jobs": r"^snap",
    },
    {
        "key": "capital-one", "name": "Capital One", "tier": "Enterprise", "fit": "worth", "sponsor": "strong", "uscis": 303,
        "locations": "McLean · New York · Richmond · San Francisco",
        "roles": "Associate Software Engineer / Software Engineer — Full Stack (React, Node/Java)",
        "why": "Full-stack 招聘量大、重视 early-career。New grad 项目 (TDP) 你已过毕业时间窗口，直接问 Associate Software Engineer。湾区岗位少。",
        "jobs": r"^capital one",
    },
    {
        "key": "bloomberg", "name": "Bloomberg", "tier": "Enterprise", "fit": "worth", "sponsor": "strong", "uscis": 296,
        "locations": "New York（主力）· San Francisco",
        "roles": "Software Engineer — Terminal web/JavaScript applications",
        "why": "Terminal 上大量 JavaScript/TypeScript 应用，招 0–2 年经验；主要在纽约。",
        "jobs": r"^bloomberg",
    },
    {
        "key": "disney", "name": "Disney", "tier": "Premium", "fit": "worth", "sponsor": "some", "uscis": 49,
        "locations": "Glendale / Burbank · Seattle · San Francisco",
        "roles": "Software Engineer — Disney Entertainment & ESPN Technology, Disney Experiences (web/app)",
        "why": "南加州主场，web/流媒体前端岗位不少；H-1B 有在办但量不大，岗位逐个确认。",
        "jobs": r"disney",
    },
    {
        "key": "esri", "name": "Esri", "tier": "Participating", "fit": "worth", "sponsor": "some", "uscis": 51,
        "locations": "Redlands, CA",
        "roles": "Software Engineer / Product Engineer — JavaScript (ArcGIS web)",
        "why": "JavaScript / web 地图前端岗位多，南加州。注意它报的是 Tech Expo kiosk，不一定在招聘——先问。",
        "jobs": r"^esri",
    },
    {
        "key": "netapp", "name": "NetApp", "tier": "Participating", "fit": "worth", "sponsor": "some", "uscis": 54,
        "locations": "San Jose（总部）",
        "roles": "Software Engineer — Cloud console / UI, Full Stack",
        "why": "总部在 San Jose；多数岗位偏存储/系统，挑 UI 或全栈的。赞助类型是 General Sponsorship，可能没有招聘 booth。",
        "jobs": r"^netapp",
    },
    {
        "key": "cvs-health", "name": "CVS Health", "tier": "Premium", "fit": "worth", "sponsor": "strong", "uscis": 370,
        "locations": "多地 · 部分 remote",
        "roles": "Software Engineer — Full Stack",
        "why": "H-1B 量大、有 remote 岗位；医疗 IT 产品方向和你的经历关联一般。",
        "jobs": r"^(cvs|aetna)",
    },
    {
        "key": "san-francisco-compute", "name": "San Francisco Compute", "tier": "Participating", "fit": "worth", "sponsor": "unclear", "uscis": None,
        "locations": "San Francisco",
        "roles": "Software Engineer — Full Stack",
        "why": "旧金山的 GPU 算力市场创业公司，团队小、上手面广；USCIS 文件里没有记录，先问清能否担保 H-1B / 是否 E-Verify。",
        "jobs": r"^(san francisco compute|sf compute)",
    },
    {
        "key": "mnfst", "name": "mnfst.ai", "tier": "Enterprise", "fit": "worth", "sponsor": "unclear", "uscis": None,
        "locations": "未知",
        "roles": "未知 — 去问",
        "why": "AI agent 方向的公司，公开信息很少，但买了 Enterprise 级赞助，说明招人/曝光投入不小。路过时问在招什么、是否担保。",
        "jobs": r"^(mnfst|manifest)",
    },
    # ---- long_shot: sponsors at least sometimes, but location/stack/level fit is weak
    {
        "key": "bank-of-america", "name": "Bank of America", "tier": "Enterprise", "fit": "long_shot", "sponsor": "strong", "uscis": 327,
        "locations": "Charlotte · New York · Dallas",
        "roles": "Software Engineer — Java / React full stack",
        "why": "招人量大，但岗位多在东岸、偏 Java。",
        "jobs": r"^bank of america",
    },
    {
        "key": "morgan-stanley", "name": "Morgan Stanley", "tier": "Enterprise", "fit": "long_shot", "sponsor": "strong", "uscis": 311,
        "locations": "New York · Alpharetta · Baltimore",
        "roles": "Software Engineer — full stack",
        "why": "同上：赞助级别高，但地点和技术栈都偏离你的目标。",
        "jobs": r"^morgan stanley",
    },
    {
        "key": "quant", "name": "Two Sigma · Jane Street · D. E. Shaw · Citadel · PEAK6 · Apollo", "tier": "Premium / Participating", "fit": "long_shot", "sponsor": "some", "uscis": None,
        "locations": "New York · Chicago",
        "roles": "Software Engineer",
        "why": "量化/基金 SWE 门槛高、偏 NYC/Chicago，GHC 上主要招 new grad 和实习。有余力再去，Two Sigma 有内部 web 工具类岗位可以问。",
        "jobs": r"^(two sigma|jane street|d\.? ?e\.? shaw|citadel|peak6|apollo)",
    },
    {
        "key": "east-coast-finance", "name": "Vanguard · Prudential · Chubb · Manulife / John Hancock · DTCC", "tier": "Premium", "fit": "long_shot", "sponsor": "some", "uscis": None,
        "locations": "东岸为主",
        "roles": "Software Engineer",
        "why": "金融/保险 IT。H-1B 在办但新申请量很小（USCIS 文件里 initial approvals 几乎为 0），岗位多在东岸。",
        "jobs": r"^(vanguard|prudential|chubb|manulife|john hancock|dtcc|depository trust)",
    },
    {
        "key": "usaa-navy-federal", "name": "USAA · Navy Federal Credit Union", "tier": "Premium", "fit": "long_shot", "sponsor": "unclear", "uscis": None,
        "locations": "San Antonio · Plano · Vienna, VA",
        "roles": "Software Engineer",
        "why": "有 H-1B 记录，但不少岗位写明不担保；面向军人家庭的金融机构。逐个看 JD。",
        "jobs": r"^(usaa|navy federal)",
    },
    {
        "key": "other-corporate", "name": "Target · McDonald's · Abbott · EY · Credera · InterSystems · Audible · Veeam · Hudl · Nintendo of America · Tandem Diabetes", "tier": "Participating", "fit": "long_shot", "sponsor": "some", "uscis": None,
        "locations": "各地（多不在湾区）",
        "roles": "Software Engineer",
        "why": "赞助量小或地点不对口。Audible 是 Amazon 子公司（Newark, NJ），一直有 H-1B 记录；其余逐个确认。",
        "jobs": r"^(target|mcdonald|abbott|ernst|ey$|credera|intersystems|audible|veeam|hudl|nintendo|tandem)",
    },
    # ---- skip: hard-rejected by the user's own rules, or not an employer for this search
    {
        "key": "stoke-space", "name": "Stoke Space", "tier": "Participating", "fit": "skip", "sponsor": "no", "uscis": None,
        "locations": "Kent, WA",
        "roles": "—",
        "why": "航天公司，受 ITAR 出口管制，岗位通常要求 US person（公民或绿卡）。",
        "jobs": r"^stoke",
    },
    {
        "key": "gov-labs", "name": "MIT Lincoln Lab · JHU Applied Physics Lab · PNNL · Dev Technology Group", "tier": "Participating", "fit": "skip", "sponsor": "no", "uscis": None,
        "locations": "—",
        "roles": "—",
        "why": "国防/政府实验室和联邦承包商，多数岗位要求 US citizenship 或 clearance（以 JD 为准）。",
        "jobs": r"^(mit lincoln|johns hopkins|pacific northwest|dev technology)",
    },
    {
        "key": "academic", "name": "大学与研究生项目（约 20 个）、Dice、WiCyS", "tier": "Participating", "fit": "skip", "sponsor": "no", "uscis": None,
        "locations": "—",
        "roles": "—",
        "why": "CMU、Cornell、UChicago、UW 等是招研究生的 booth；Dice 是招聘网站，WiCyS 是非营利组织。都不是这次求职的雇主。",
        "jobs": r"^$",
    },
]

COMPANY_STATUSES = ("applied", "reached_out", "met", "interview", "passed")

# (phase title, date range, tasks). Task keys are stable — they're the progress table's keys.
PLAYBOOK = [
    {
        "phase": "本周：把入口都打开",
        "when": "10/7 – 10/12",
        "start": date(2026, 10, 7), "end": date(2026, 10, 12),
        "tasks": [
            ("register", "买 Two-Day Pass（周三–周四）：$699，会员价 $449（会员费另算，比较一下哪个划算）。下单前在注册页 / App 确认 Talent Expo 在哪几天；如果 Expo 主要在周二–周三，改买那一组。"),
            ("travel", "订行程：周二 10/27 晚上飞到 Anaheim（SJC → SNA 约 1 小时），住周二、周三两晚，周四晚上回；向公司请周三、周四两天假。"),
            ("portal", "登录 Attendee Portal / App：看自己的 Expo Access Group，补全 profile 和简历（有这个字段的话设为对招聘方可见），打开通知，1:1 meeting 一放出就约。"),
            ("apply-reqs", "重点名单里每家先在官网投 1–2 个具体岗位（SDE I / SWE II / Front-End Engineer），把 job ID 记在下面公司的备注里——这是 booth 对话最有用的抓手。"),
            ("company-pages", "逐个搜「<公司> Grace Hopper 2026」：很多公司有自己的 GHC 报名 / 简历提交页（比如 Navy Federal 就开了 2026 Grace Hopper Celebration 活动页），提交后会进入它们会前约面的候选池。"),
        ],
    },
    {
        "phase": "会前两周：找到具体的人",
        "when": "10/13 – 10/25",
        "start": date(2026, 10, 13), "end": date(2026, 10, 25),
        "tasks": [
            ("linkedin", "LinkedIn 搜「GHC26」「Grace Hopper」+ 公司名，找发帖说会去 GHC 的 recruiter 和工程师。每家联系 1–2 人，用下面的 LinkedIn 模板，带上 job ID，并说明你周三、周四在现场——让对方把见面和面试排进这两天。"),
            ("referrals", "找 Northeastern 校友和前同事在重点公司的人要内推，顺便问他们公司的 GHC booth 有没有 experienced / early-career 通道（不只是 new grad）。"),
            ("pitch", "把 30 秒 pitch 练到能自然说出来；准备 2 分钟的项目深挖（用 chat 查询 CRM 数据：typed query spec + LLM 写 SQL 的防注入；或可恢复的 SSE 流），和 Practice 页的 LeetCode / React 计划同步练——GHC 现场面试常是 45 分钟 coding + behavioral。"),
            ("sessions", "在 Session Catalog 里标出重点公司工程师讲的 session，散场后去提问——这是接触 hiring manager 而不只是 recruiter 的机会。也可以用 Braindate 约 1:1 交流。"),
            ("materials", "打印 30–40 份简历；手机里存好 PDF，再做一个指向 LinkedIn / 作品集的二维码。"),
        ],
    },
    {
        "phase": "10/26 周一：Virtual Career Fair",
        "when": "10/26",
        "start": date(2026, 10, 26), "end": date(2026, 10, 26),
        "tasks": [
            ("vcf", "线上招聘会先把重点公司过一遍：争取约到会场见面的时间，或拿到 recruiter 的邮箱。等于在线下开门前多了一轮。"),
        ],
    },
    {
        "phase": "会场：周二晚到，周三、周四两天",
        "when": "10/27 – 10/29",
        "start": date(2026, 10, 27), "end": date(2026, 10, 29),
        "tasks": [
            ("arrive", "周二晚上到 Anaheim；如果能提前领证件（badge）就当晚领好，周三早上直接去 Expo 门口，而不是排领证件的队。"),
            ("early", "周三 Expo 开门前 20 分钟到，先去重点名单里最想去的 3 家——现场面试名额最先被约满。"),
            ("booth-flow", "每个 booth：pitch → 报 job ID → 问「Are you scheduling interviews here or after the event?」→ 要名片 / 邮箱 / LinkedIn → 走开后 1 分钟内在这一页更新状态和备注。"),
            ("events", "问 booth 有没有当晚的公司 reception / 招待会，很多是邀请制，在 booth 上被邀请才能进。只有周三晚上这一晚，挑最想去的一家。"),
            ("friday", "如果 recruiter 想把面试约在周五（你已离开），直接问能不能改到周四，或会后改成线上面试——不要因为这个放弃机会。"),
            ("thursday-close", "周四下午：回访周三聊过、说「明天再来」的 booth；离开前确认每家公司的下一步和联系人都记在备注里。"),
        ],
    },
    {
        "phase": "会后：两周内收尾",
        "when": "10/30 – 11/13",
        "start": date(2026, 10, 30), "end": date(2026, 11, 13),
        "tasks": [
            ("followup", "GHC 周五 10/30 结束后 24–48 小时内（10/31–11/1）发跟进邮件——别在会议期间发，recruiter 收件箱是爆的：感谢 + 聊到的具体内容 + 简历 + job ID。"),
            ("followup-2", "一周没回复再跟进一次；拿到的面试到 Add JD 录入岗位，在 Tracker 里跟踪时间线。"),
        ],
    },
]

ADVANCE_CONTACT = {
    "verdict": "需要，而且现在就开始",
    "reasons": [
        "面试名额在会前就开始排：公司会先从会前网申、自家 GHC 报名页和简历库里约人，现场 walk-up 最常听到的是「回去网申」。",
        "你不是 new grad：booth 大多由 university recruiting 驻场。early-career / experienced 岗位要提前找到对应的 recruiter，否则容易被放进 new grad 流程，然后卡在毕业时间上。",
        "签证会前问清最省时间：sponsorship 用邮件或 LinkedIn 就能问到，现场的几分钟留给技术和项目。",
        "但别在会中刷屏：会议期间 recruiter 收件箱爆满，跟进放到会后 24–48 小时。",
    ],
}

TACTICS = [
    ("先网申，再报 job ID", "booth 上最有效的一句话是「I applied to req #… last week」——recruiter 能当场在系统里找到你、加备注，而不是让你回去申请。"),
    ("每家找两个人", "一个 recruiter（推流程）+ 一个工程师或 manager（session 讲者、团队成员，能帮你说话）。"),
    ("周三早上先去最想去的", "你只有两天，周三是你的第一天也是名额最多的时候：现场面试先到先得，开门后一两个小时最值钱；排队长的大厂和名额少的中型公司穿插着去。"),
    ("把面试排进你的两天", "会前联系时就说「I'll be onsite Wed–Thu」；现场被约到周五的，请对方改到周四或线上。"),
    ("定位成 early-career，而不是 new grad", "「8 个月全职 + 一年 SWE / 数据科学实习 + 一篇会议论文」比毕业年份更有说服力，也绕开 new grad 项目的毕业时间限制。"),
    ("签证问得自然", "先把对话聊热再问，问法见下方脚本；把「不需要付 $100K」「我在美国境内转身份」讲清楚，消除 recruiter 的顾虑。"),
    ("主动约下一步", "每个对话结尾问「What's the best next step — could we set up a time this week?」，而不是等对方说。"),
    ("当场记录", "每次 booth 对话后立刻在本页更新状态和备注（名字、聊了什么、答应了什么），跟进邮件靠这些细节写得具体。"),
    ("多一轮机会", "10/26 的 Virtual Career Fair、公司 session 和晚间 reception 都是 booth 之外的入口，名额竞争更小。"),
]

SCRIPTS = [
    {
        "key": "pitch",
        "title": "30 秒 pitch",
        "text": (
            "Hi, I'm Yuexin. I'm a software engineer at Blackwave, an early-stage startup in San Jose, where I own the "
            "React/TypeScript frontend and full-stack AI features of a multi-tenant CRM — most recently making CRM data "
            "queryable by chat, which cut data-engineer requests from hours to under five minutes. Before that, I spent a "
            "year at SiriusMindShare turning my master's research into a React and FastAPI platform now used by 18 "
            "retailers. I'm looking for early-career front-end or full-stack roles on AI-powered products, and I applied "
            "to [req ID] last week. What is your team building right now?"
        ),
    },
    {
        "key": "visa",
        "title": "问签证（对话聊热之后）",
        "text": (
            "I'm on STEM OPT right now, so I'd need H-1B sponsorship down the line — it would be a change of status "
            "inside the U.S., so the new $100K fee doesn't apply. Is sponsorship supported for this role?"
        ),
    },
    {
        "key": "linkedin",
        "title": "会前 LinkedIn 邀请（300 字符以内）",
        "text": (
            "Hi [Name] — saw you'll be at GHC 26 with [Company]. I'm an early-career front-end/full-stack engineer "
            "(React, AI products) and applied to [req ID]. I'll be onsite Wed–Thu and would love to stop "
            "by your booth or grab 10 minutes if you have a slot. Thanks!"
        ),
    },
    {
        "key": "followup",
        "title": "会后跟进邮件",
        "text": (
            "Subject: Great meeting you at GHC — Yuexin Li, [role / req ID]\n\n"
            "Hi [Name],\n\n"
            "Thank you for talking with me at the [Company] booth on [day] — I enjoyed hearing about [specific thing "
            "they mentioned]. As we discussed, I'm interested in [role, req ID], which I applied to on [date].\n\n"
            "Quick recap: I own the React/TypeScript frontend and full-stack AI features of a multi-tenant CRM at "
            "Blackwave, including "
            "[one result relevant to their team]. My resume is attached.\n\n"
            "Is there a next step I should take on my side? Happy to make time for a call this week.\n\n"
            "Best,\nYuexin Li\n[phone] · [LinkedIn]"
        ),
    },
]

VISA_NOTES = [
    "在美国境内从 F-1（OPT/STEM OPT）转 H-1B 属于 change of status，不需要交 2025 年 9 月新加的 $100,000 费用（USCIS 2025/10/20 的说明）。",
    "抽签从 FY2027 起按工资等级加权：Level IV 进 4 次、III 进 3 次、II 进 2 次、I 进 1 次。同一个岗位，给的工资等级越高中签率越高——湾区大厂通常给得更高，这也是重点名单偏向它们的原因之一。",
    "如果明年 3 月还要抽签，新雇主得在那之前完成入职和注册；STEM OPT 期间换工作，新雇主必须在 E-Verify 里，并和你一起提交新的 I-983。",
]

SOURCES = [
    ("GHC 26 官网（日期、场馆）", "https://ghc.anitab.org/"),
    ("GHC 26 Partners（赞助商名单，2026-10-06 更新）", "https://ghc.anitab.org/partners"),
    ("GHC 26 Features（Talent & Tech Expo）", "https://ghc.anitab.org/show-features"),
    ("Virtual GHC（10/26 Virtual Career Fair）", "https://ghc.anitab.org/virtual-grace-hopper-celebration"),
    ("GHC 26 Pricing", "https://ghc.anitab.org/pricing"),
    ("Talent & Tech Expo（GHC 25 的 Access Group 与 1:1 meeting 规则）", "https://ghc.anitab.org/talent-tech-expo"),
    ("USCIS H-1B Employer Data Hub（FY2023 导出文件）", "https://www.uscis.gov/archive/h-1b-employer-data-hub-files"),
    ("Davis Wright Tremaine：工资加权抽签与 $100K 费用", "https://www.dwt.com/blogs/employment-labor-and-benefits/2026/02/understanding-h-1b-lottery-updates"),
    ("BakerHostetler：$100K 费用对 F-1 学生的豁免", "https://www.bakerlaw.com/insights/uscis-clarifies-when-100000-h-1b-fee-is-required-exempting-most-f-1-students/"),
    ("Two Sigma：How to get an interview at GHC", "https://www.twosigma.com/articles/how-to-get-an-interview-at-the-grace-hopper-celebration"),
]

TASK_KEYS = {f"task:{key}" for phase in PLAYBOOK for key, _ in phase["tasks"]}
COMPANY_KEYS = {f"company:{c['key']}" for c in COMPANIES}


async def _jobs_by_company(db: AsyncSession) -> dict[str, list[dict]]:
    """Analyzed jobs in the local DB whose company matches a guide entry, best score first."""
    rows = (
        await db.execute(
            select(Job, JobAnalysis, ResumeMatchScore, Application)
            .outerjoin(JobAnalysis, JobAnalysis.job_id == Job.id)
            .outerjoin(ResumeMatchScore, ResumeMatchScore.job_id == Job.id)
            .outerjoin(Application, Application.job_id == Job.id)
        )
    ).all()
    patterns = [(c["key"], re.compile(c["jobs"], re.I)) for c in COMPANIES]
    found: dict[str, list[dict]] = {}
    for job, analysis, score, application in rows:
        company = ((analysis.company_name if analysis else None) or job.company_name or "").strip()
        key = next((k for k, rx in patterns if company and rx.search(company)), None)
        if not key:
            continue
        found.setdefault(key, []).append({
            "id": str(job.id),
            "company": company,
            "title": (analysis.title if analysis else None) or job.title,
            "location": analysis.location if analysis else None,
            "score": round(score.overall_score) if score else None,
            "recommendation": score.recommendation.value if score and score.recommendation else None,
            "auto_rejected": bool(score and score.is_auto_rejected),
            "application_status": application.status.value if application else None,
        })
    for jobs in found.values():
        jobs.sort(key=lambda j: (j["auto_rejected"], -(j["score"] or 0)))
    return found


async def guide(db: AsyncSession) -> dict:
    progress = {p.key: p for p in (await db.execute(select(GhcProgress))).scalars()}
    jobs = await _jobs_by_company(db)

    def state(key: str) -> dict:
        p = progress.get(key)
        return {"status": p.status if p else None, "note": p.note if p else None}

    today = date.today()
    return {
        "event": {
            **EVENT,
            "days_until": (EVENT["start"] - today).days,
            "days_until_attend": (EVENT["attend_start"] - today).days,
        },
        "advance_contact": ADVANCE_CONTACT,
        "tactics": [{"title": t, "body": b} for t, b in TACTICS],
        "playbook": [
            {
                "phase": p["phase"],
                "when": p["when"],
                "current": p["start"] <= today <= p["end"],
                "tasks": [{"key": f"task:{k}", "text": text, **state(f"task:{k}")} for k, text in p["tasks"]],
            }
            for p in PLAYBOOK
        ],
        "companies": [
            {**{k: v for k, v in c.items() if k != "jobs"}, **state(f"company:{c['key']}"), "jobs": jobs.get(c["key"], [])}
            for c in COMPANIES
        ],
        "scripts": SCRIPTS,
        "visa_notes": VISA_NOTES,
        "sources": [{"label": label, "url": url} for label, url in SOURCES],
    }
