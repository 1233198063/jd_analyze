# JD Analyze 安装指南

这个工具每个人在自己电脑上跑一份：

- **数据只在你自己的电脑上**：简历、岗位、投递记录都存在你本机的数据库里，别人看不到。
- **AI 用你自己的账号**：所有 AI 功能通过你电脑上的 Codex CLI 运行，用的是你自己的 ChatGPT 账号（或 API key）。
- **个人信息只写在一个文件里**：`backend/profile.json`（名字、学校、签证情况、求职方向）。这个文件不会被提交到 git。

装好大约需要 20–30 分钟。

---

## 0. 先装好这些

| 工具 | 版本 | 用来 |
|---|---|---|
| Git | 任意 | 下载代码 |
| Python | 3.11 | 后端 |
| Node.js | 18 及以上（推荐 22） | 前端，也用来装 Codex |
| PostgreSQL | 16 | 数据库 |
| Codex CLI | 最新 | AI 功能 |

装 Codex CLI 并登录（用你自己的账号）：

```bash
npm install -g @openai/codex
codex login
```

`codex login` 会打开浏览器，用你的 ChatGPT 账号登录。登录一次就行。

用 API key 登录（不用 ChatGPT 账号）：

```bash
# macOS / Linux
printenv OPENAI_API_KEY | codex login --with-api-key
# Windows PowerShell
$env:OPENAI_API_KEY | codex login --with-api-key
```

### 几个人共用一个 AI 账号时

**你的数据仍然是隔离的。** 简历、岗位、投递记录都存在你自己电脑的数据库里，AI 账号接触不到。每次 AI 调用只发送这一次需要的内容（比如你的简历和一个 JD），而且 app 调用 Codex 时带了 `--ephemeral`，不会在电脑上留下会话记录。

但要注意几件事：

- **额度是共用的**：一个人一次分析一大批 JD，其他人可能会被限速。
- **ChatGPT 网页不隔离**：如果你们也用这个账号登录 chatgpt.com，网页上的聊天记录和 Memory 大家都能看到，别在网页里贴简历或个人信息。
- **数据设置对所有人生效**：不希望内容被用来训练模型的话，在 ChatGPT 的 Settings → Data Controls 里关掉 "Improve the model for everyone"。
- **OpenAI 的条款不允许多人共用一个账号的登录凭据**，账号可能因此被封，那样所有人都会一起用不了。

更稳妥的做法是每人用自己的 API key：可以在 OpenAI Platform 的同一个组织下给每人建一个 Project 和 key，费用统一支付，用量分开统计，还能给每个 key 设预算上限。通过 API 发送的数据默认不会被用来训练模型。

---

## 1. 下载代码

```bash
git clone https://github.com/1233198063/jd_analyze.git
cd jd_analyze
```

如果仓库是私有的，先请仓库主人在 GitHub 上把你加为 collaborator。

## 2. 建数据库

```bash
psql -U postgres -c "CREATE USER jdanalyze WITH PASSWORD 'jdanalyze_dev';"
psql -U postgres -c "CREATE DATABASE jdanalyze OWNER jdanalyze;"
```

表不用手动建，第一次启动后端时会自动建好。

## 3. 配置

```bash
cd backend
cp .env.example .env
cp profile.example.json profile.json
```

（Windows 的命令行用 `copy` 代替 `cp`。）

- `.env` 一般不用改。如果 AI 调用报错说模型不可用，把 `CODEX_MODEL` 改成你的账号能用的模型。如果你建数据库时用了别的用户名或密码，也要改 `DATABASE_URL`。
- `profile.json` 要改成你自己的，每个字段的说明见下面的[字段说明](#profilejson-字段说明)。

## 4. 启动后端

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

看到 `Application startup complete` 就说明好了。这个终端别关。

## 5. 启动前端（新开一个终端）

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5173 。

## 6. 第一次使用

1. **Resume 页**：点 **+ Add Resume**，粘贴你的简历全文，勾选 **Set as a master resume**，保存。之后所有打分、改简历、写 cover letter 都基于它。
2. **Add JD**：贴岗位链接（Greenhouse / Lever / Ashby 的链接可以直接抓取）或 JD 全文，点 **Analyze JD**。AI 会解析岗位，并根据你的简历和 profile 打分。
3. 其他页面（Tracker、Practice、Networking、Daily Log）打开就能用。

以后每次使用，重复第 4、5 步启动前后端就行，不用重新安装。

---

## profile.json 字段说明

改完 `profile.json` 要**重启后端**才会生效。改了打分相关的字段（`work_authorization`、`new_grad`、`target_skills`、`target_locations`）后，到 Resume 页点 **Re-score all jobs**，让已有的岗位按新设置重新打分。

| 字段 | 说明 |
|---|---|
| `name` | 你的名字 |
| `work_authorization` | 你的工作身份，决定哪些岗位会被自动排除：<br>• `"needs_sponsorship"`：需要签证担保（F-1 / OPT 等）。写明不担保的岗位会被排除，公司办 H-1B 的情况计入打分。<br>• `"no_sponsorship_needed"`：不需要担保（绿卡 / EAD 等）。不再看担保；要求美国公民或安全许可（clearance）的岗位仍会被排除。<br>• `"us_citizen"`：美国公民。上面两类都不排除。 |
| `new_grad` | 是应届生就填 `true`，否则只招 new grad 的岗位会被自动排除 |
| `target_skills` | 你会的技能（小写），用来算技能匹配分。例：`["python", "react", "sql"]` |
| `target_locations` | 想去的城市（小写），用来算地点分。例：`["seattle", "new york"]` |
| `search_phrases` | Dashboard 上"Search by Source"按钮用的搜索词，例：`["Backend Engineer", "Data Engineer"]` |
| `search_location` | 上面这些搜索用的地点，例：`"Seattle"` |
| `role_keywords` | 自动找岗位（Discoveries）时，岗位标题里要包含的词（小写） |
| `amazon_queries` | 在 Amazon 招聘网站上搜索用的关键词 |
| `alumni_search_url` | 你学校在 LinkedIn 上的校友页，例：`"https://www.linkedin.com/school/<学校的 slug>/people/"`。填了之后，Networking 页每家公司旁会出现"找校友"链接。不填就留 `""` |
| `career_portal` | 学校的求职网站（可选），会显示在 Dashboard 上，并提醒你定期去看。例：`{"label": "UW Handshake", "url": "https://..."}`；不需要就留 `null` |
| `networking_links` | Networking 页"去哪找人"里额外的链接，例：`[{"label": "Seattle AI meetups", "url": "https://..."}]` |
| `networking_scripts` | 换掉 Networking 页的话术模板。用 `key` 指定换哪一个：`intro`（30 秒自我介绍）、`alumni`、`cold`、`nudge`、`thanks`、`referral`、`visa`。例：`[{"key": "intro", "title": "30 秒自我介绍", "text": "Hi, I'm ..."}]`。用新的 `key` 就是新增一条 |
| `practice_sprint` | 可选：在 30 天 coding 计划前面加一段你自己的冲刺计划，格式见下面。不需要就留 `[]` |

### practice_sprint 格式（可选）

每一天是一个对象，`items` 是当天要做的几件事：

```json
"practice_sprint": [
  {
    "group": "第 1–2 天",
    "theme": "项目介绍与数字口径",
    "standard": "能脱稿讲 2 分钟，所有数字都有解释",
    "items": [
      {
        "key": "s01-project",
        "track": "project",
        "title": "项目 A：2 分钟介绍",
        "brief": "写出 2 分钟版本：做了什么、你负责什么、最强的 3 个结果。",
        "say": "每个数字讲清怎么测的、基线是多少。",
        "minutes": 45,
        "bar": "能脱稿讲 2 分钟，所有数字都有解释"
      },
      {
        "key": "s01-leetcode",
        "track": "leetcode",
        "title": "Hashing",
        "say": "先讲暴力解，再优化。",
        "minutes": 45,
        "problems": [
          { "key": "s01-lc-two-sum", "number": 1, "name": "Two Sum", "difficulty": "easy",
            "url": "https://leetcode.com/problems/two-sum/" }
        ]
      }
    ]
  }
]
```

- `track` 只能是 `project`（项目深挖）、`react`、`leetcode`、`system_design`、`english`（英文表达）之一。
- 每个 `key` 都必须唯一，打卡记录靠它对应到具体的事项，填好之后不要再改。
- `bar`（可选）是打卡时勾选的"完成标准"；不写就用这个类型的默认标准。
- 格式写错的话，后端启动时会直接报错，并指出是第几天的问题。

---

## 可选：每日自动找岗位、练习提醒

- **自动找岗位**：在 `backend` 目录、激活虚拟环境后运行 `python scripts/daily_discovery.py`，会去一批公司的招聘页找符合 `role_keywords` 的新岗位。想每天自动跑，可以用 Windows 任务计划程序或 macOS 的 cron 定时执行。
- **练习提醒（仅 Windows）**：见 README 的 "Practice Reminder" 一节。

## 更新到最新版本

```bash
git pull
cd backend && pip install -r requirements.txt   # 依赖有变化时
cd ../frontend && npm install                     # 依赖有变化时
```

然后重启前后端。你的数据（数据库）、`profile.json` 和 `.env` 都不会受影响。

## 常见问题

- **AI 功能报错**：在终端运行 `codex exec "say hi"` 看 Codex 能不能用。如果提示没登录，重新 `codex login`；如果提示模型不可用，改 `.env` 里的 `CODEX_MODEL`。
- **页面一直在加载，但后端没报错**：见 README 的 "Troubleshooting" 一节。
- **改了 profile.json 没效果**：要重启后端，打分相关的改动还要再点一次 **Re-score all jobs**。
