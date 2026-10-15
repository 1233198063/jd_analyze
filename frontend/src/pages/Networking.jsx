import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import clsx from "clsx";
import { networkApi } from "@/api/network";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import NetworkToolkit from "@/components/features/network/NetworkToolkit";

const STAGES = [
  { value: "to_contact", label: "待联系", hint: "找到人了，还没发消息" },
  { value: "messaged", label: "已发消息", hint: "一周没回就跟进一次" },
  { value: "replied", label: "已回复", hint: "约时间" },
  { value: "scheduled", label: "已约好", hint: "把下一步日期设成 chat 那天，提前看问题清单" },
  { value: "chatted", label: "聊过了", hint: "24 小时内发感谢" },
  { value: "referred", label: "拿到内推", hint: "两周后问一下进展" },
  { value: "dormant", label: "暂停", hint: "" },
];
const STAGE = Object.fromEntries(STAGES.map((s) => [s.value, s]));

const SOURCES = { alumni: "校友", coworker: "前同事", linkedin: "LinkedIn", event: "活动", referral: "别人介绍", other: "其他" };
const EVENT_LABEL = {
  message: "发了消息",
  reply: "对方回复",
  scheduled: "约好时间",
  chat: "Coffee chat",
  follow_up: "跟进",
  referral: "内推",
};

const FILTERS = [
  { key: "active", label: "进行中", match: (c) => ["to_contact", "messaged", "replied", "scheduled"].includes(c.stage) },
  { key: "met", label: "聊过 / 内推", match: (c) => ["chatted", "referred"].includes(c.stage) },
  { key: "dormant", label: "暂停", match: (c) => c.stage === "dormant" },
  { key: "all", label: "全部", match: () => true },
];

function dueLabel(date, today) {
  if (!date) return null;
  const days = dayjs(date).diff(dayjs(today), "day");
  if (days < 0) return { text: `逾期 ${-days} 天`, due: true };
  if (days === 0) return { text: "今天", due: true };
  if (days === 1) return { text: "明天", due: false };
  return { text: dayjs(date).format("M/D"), due: false };
}

function WeekStat({ label, value, target }) {
  const met = value >= target;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white border border-mist">
      <span className="text-ink/55">{label}</span>
      <span className={clsx("font-semibold tabular-nums", met ? "text-sage-700" : "text-ink")}>
        {value}/{target}
      </span>
    </span>
  );
}

function AddContactForm({ prefill, onAdd, onClose, pending }) {
  const [form, setForm] = useState({
    name: "",
    company: prefill?.company ?? "",
    role: "",
    source: prefill?.source ?? "alumni",
    linkedin_url: "",
    stage: "to_contact",
    notes: "",
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    if (form.name.trim()) onAdd(form);
  };
  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">添加联系人</p>
        <button type="button" className="text-ink/40 hover:text-ink/70" onClick={onClose} title="关闭">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input autoFocus className="input py-1.5 text-sm" placeholder="名字 *" value={form.name} onChange={set("name")} />
        <input className="input py-1.5 text-sm" placeholder="公司" value={form.company} onChange={set("company")} />
        <input className="input py-1.5 text-sm" placeholder="职位，如 Senior SWE, Frontend" value={form.role} onChange={set("role")} />
        <input
          className="input py-1.5 text-sm md:col-span-2"
          placeholder="LinkedIn 链接（可选）"
          value={form.linkedin_url}
          onChange={set("linkedin_url")}
        />
        <div className="flex gap-2">
          <select className="input py-1.5 text-sm" value={form.source} onChange={set("source")} title="怎么认识的">
            {Object.entries(SOURCES).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select className="input py-1.5 text-sm" value={form.stage} onChange={set("stage")} title="现在到哪一步">
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          className="input py-1.5 text-sm flex-1"
          placeholder="备注：共同点、想问什么、对方提到的事"
          value={form.notes}
          onChange={set("notes")}
        />
        <button className="btn-primary py-1.5 whitespace-nowrap" disabled={pending || !form.name.trim()}>
          {pending ? "保存中..." : "添加"}
        </button>
      </div>
    </form>
  );
}

function ContactCard({ contact, today, onUpdate, onEvent, onDelete }) {
  const [notes, setNotes] = useState(contact.notes ?? "");
  const stage = STAGE[contact.stage];
  const due = dueLabel(contact.next_follow_up, today);
  const dormant = contact.stage === "dormant";

  return (
    <div className={clsx("card p-4", dormant && "opacity-65")}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink">{contact.name}</p>
            {contact.linkedin_url && (
              <a href={contact.linkedin_url} target="_blank" rel="noreferrer" className="text-ink/40 hover:text-petrol-600" title="LinkedIn">
                <Icon name="open_in_new" size={14} />
              </a>
            )}
            <span className="badge bg-ink/[0.06] text-ink/55">{SOURCES[contact.source] ?? contact.source}</span>
          </div>
          <p className="text-sm text-ink/60">
            {[contact.role, contact.company].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <select
          className="input w-28 py-1 text-xs"
          value={contact.stage}
          onChange={(e) => onUpdate({ stage: e.target.value })}
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {!dormant && (
        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
          <span className="text-ink/45">下一步</span>
          <input
            type="date"
            className="input w-36 py-0.5 text-xs"
            value={contact.next_follow_up ?? ""}
            onChange={(e) => onUpdate({ next_follow_up: e.target.value || null })}
          />
          {due && (
            <span className={clsx("font-medium", due.due ? "text-gold-700" : "text-ink/45")}>{due.text}</span>
          )}
          {stage.hint && <span className="text-ink/45">· {stage.hint}</span>}
          {["messaged", "replied", "chatted", "referred"].includes(contact.stage) && (
            <button className="ml-auto text-petrol-600 hover:underline" onClick={() => onEvent({ type: "follow_up" })}>
              记一次跟进
            </button>
          )}
        </div>
      )}

      <input
        className="input mt-2.5 py-1 text-xs"
        placeholder="备注：共同点、聊了什么、答应了什么、job ID"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (contact.notes ?? "") && onUpdate({ notes })}
      />

      <div className="flex items-end justify-between gap-2 mt-2">
        <ul className="text-xs text-ink/45 space-y-0.5">
          {contact.timeline.slice(0, 3).map((e, i) => (
            <li key={i}>
              <span className="tabular-nums">{dayjs(e.date).format("M/D")}</span> {EVENT_LABEL[e.type] ?? e.type}
              {e.note && ` · ${e.note}`}
            </li>
          ))}
        </ul>
        <button
          className="text-xs text-ink/30 hover:text-coral-600"
          onClick={() => confirm(`删除 ${contact.name}？`) && onDelete()}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function PipelineGaps({ gaps, onAdd }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? gaps : gaps.slice(0, 12);
  if (!gaps.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-ink">还没认识人的目标公司</h2>
        <p className="text-xs text-ink/50 mt-0.5">
          来自你的岗位库：投过、收藏过或 60 分以上的公司，已排除招聘中介。先找有共同点的人（校友、前同事）——最好开口，也最容易拿到内推。
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {shown.map((g) => (
          <div key={g.company} className="card px-3 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink truncate">{g.company}</p>
              <p className="text-xs text-ink/45">
                {g.applied ? "已投递 · " : ""}
                {g.best_score} 分{g.jobs > 1 && ` · ${g.jobs} 个岗位`}
              </p>
            </div>
            {g.alumni_url && (
              <a href={g.alumni_url} target="_blank" rel="noreferrer" className="text-xs text-petrol-600 hover:underline whitespace-nowrap">
                找校友
              </a>
            )}
            <a href={g.people_url} target="_blank" rel="noreferrer" className="text-xs text-petrol-600 hover:underline whitespace-nowrap">
              找工程师
            </a>
            <button className="text-xs text-ink/50 hover:text-ink whitespace-nowrap" onClick={() => onAdd(g.company)}>
              + 联系人
            </button>
          </div>
        ))}
      </div>
      {gaps.length > 12 && (
        <button className="text-xs text-ink/50 hover:text-ink/80" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "收起" : `显示全部 ${gaps.length} 家`}
        </button>
      )}
    </section>
  );
}

/**
 * Networking / coffee chats: who you're talking to and what's next with each of them, this week's
 * outreach against a small target, pipeline companies where you don't know anyone yet, and the
 * templates and question bank for reaching out.
 */
export default function Networking() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("active");
  const [adding, setAdding] = useState(null); // null = closed, otherwise the form's prefill

  const { data, isLoading } = useQuery({ queryKey: ["network"], queryFn: networkApi.overview });
  const refresh = () => qc.invalidateQueries({ queryKey: ["network"] });
  const add = useMutation({
    mutationFn: networkApi.addContact,
    onSuccess: () => {
      refresh();
      setAdding(null);
    },
  });
  const update = useMutation({ mutationFn: ({ id, payload }) => networkApi.updateContact(id, payload), onSuccess: refresh });
  const logEvent = useMutation({ mutationFn: ({ id, payload }) => networkApi.logEvent(id, payload), onSuccess: refresh });
  const remove = useMutation({ mutationFn: networkApi.deleteContact, onSuccess: refresh });

  if (isLoading || !data) return <PageLoader message="Loading your network..." />;

  const { contacts, week, today } = data;
  const dueIds = new Set(data.due_ids);
  const due = data.due_ids.map((id) => contacts.find((c) => c.id === id)).filter(Boolean);
  const active = FILTERS.find((f) => f.key === filter);
  const shown = contacts.filter(active.match);
  const openAdd = (company) => {
    setAdding({ company: company ?? "", source: "alumni" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cardHandlers = (c) => ({
    onUpdate: (payload) => update.mutate({ id: c.id, payload }),
    onEvent: (payload) => logEvent.mutate({ id: c.id, payload }),
    onDelete: () => remove.mutate(c.id),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Networking</h1>
          <p className="text-sm text-ink/55 mt-0.5">Coffee chat、内推和跟进：认识谁、聊到哪一步、下一步什么时候做。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WeekStat label="本周联系" value={week.outreach} target={week.outreach_target} />
          <WeekStat label="本周 coffee chat" value={week.chats} target={week.chat_target} />
          {!adding && (
            <button className="btn-primary" onClick={() => openAdd()}>
              <Icon name="person_add" size={17} />
              添加联系人
            </button>
          )}
        </div>
      </div>

      {adding && (
        <AddContactForm
          key={adding.company}
          prefill={adding}
          pending={add.isPending}
          onAdd={(form) => add.mutate(form)}
          onClose={() => setAdding(null)}
        />
      )}

      {due.length > 0 && (
        <section className="card p-4 border-gold-200 bg-gold-50/40">
          <p className="text-sm font-semibold text-ink mb-2 flex items-center gap-1.5">
            <Icon name="schedule" size={16} className="text-gold-700" />
            今天该跟进（{due.length}）
          </p>
          <ul className="divide-y divide-mist/60">
            {due.map((c) => {
              const d = dueLabel(c.next_follow_up, today);
              return (
                <li key={c.id} className="py-1.5 flex items-center gap-3 text-sm flex-wrap">
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="text-ink/50">{c.company}</span>
                  <span className="text-xs text-ink/50">
                    {STAGE[c.stage].label} · {STAGE[c.stage].hint}
                  </span>
                  <span className="text-xs text-gold-700 ml-auto">{d?.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-ink">联系人</h2>
          <div className="flex gap-1 bg-white border border-mist rounded-lg p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={clsx(
                  "px-3 py-1 rounded-md text-sm transition-colors",
                  filter === f.key ? "bg-petrol-500 text-white font-medium" : "text-ink/60 hover:bg-petrol-50"
                )}
              >
                {f.label}
                <span className={clsx("ml-1.5 text-xs", filter === f.key ? "text-white/70" : "text-ink/35")}>
                  {contacts.filter(f.match).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {shown.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {shown
              .slice()
              .sort((a, b) => Number(dueIds.has(b.id)) - Number(dueIds.has(a.id)))
              .map((c) => (
                <ContactCard key={c.id} contact={c} today={today} {...cardHandlers(c)} />
              ))}
          </div>
        ) : (
          <div className="card p-6 text-sm text-ink/55">
            {contacts.length === 0
              ? "还没有联系人。从下面「还没认识人的目标公司」开始：在 LinkedIn 上找到合适的人后点「+ 联系人」加进来。"
              : "这一栏暂时没有人。"}
          </div>
        )}
      </section>

      <PipelineGaps gaps={data.pipeline_gaps} onAdd={openAdd} />

      <NetworkToolkit toolkit={data.toolkit} />
    </div>
  );
}
