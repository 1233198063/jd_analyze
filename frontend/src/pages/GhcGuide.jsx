import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import clsx from "clsx";
import { ghcApi } from "@/api/ghc";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import GhcCompanies from "@/components/features/ghc/GhcCompanies";

function Header({ event }) {
  // Counts down to the user's own first day, not the event's opening.
  const days = event.days_until_attend;
  const attendDays = dayjs(event.attend_end).diff(event.attend_start, "day");
  const countdown = days > 0 ? `还有 ${days} 天` : days >= -attendDays ? "就是现在" : "已结束";
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-ink">GHC 26 攻略</h1>
        <p className="text-sm text-ink/55 mt-0.5">
          Grace Hopper Celebration · {dayjs(event.start).format("M/D")} – {dayjs(event.end).format("M/D")} · {event.venue}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white border border-mist">
          <Icon name="event" size={17} className="text-petrol-500" />
          <span className="text-ink/70">
            你去 {dayjs(event.attend_start).format("M/D")}–{dayjs(event.attend_end).format("D")}（{event.attend_label}）
          </span>
          <span className="font-semibold text-ink">· {countdown}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white border border-mist text-ink/70">
          <Icon name="videocam" size={17} className="text-petrol-500" />
          Virtual Career Fair {dayjs(event.virtual_fair).format("M/D")}（周一）
        </span>
      </div>
    </div>
  );
}

function AnswerCards({ advance, tactics }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <p className="text-xs font-medium text-ink/45 uppercase tracking-wide">需要提前联系吗？</p>
        <p className="text-lg font-semibold text-petrol-600 mt-1">{advance.verdict}</p>
        <ul className="mt-3 space-y-2">
          {advance.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink/75">
              <Icon name="arrow_right" size={18} className="text-petrol-400 flex-shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium text-ink/45 uppercase tracking-wide">怎么拿到更多合适的面试</p>
        <ol className="mt-2 space-y-2">
          {tactics.map((t, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <span className="w-5 h-5 rounded-full bg-petrol-50 text-petrol-600 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-ink">{t.title}</span>
                <span className="text-ink/65"> — {t.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Playbook({ playbook, onToggle }) {
  const tasks = playbook.flatMap((p) => p.tasks);
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-ink">时间线清单</h2>
        <p className="text-sm text-ink/55">
          已完成 <span className="font-semibold text-ink">{done}</span> / {tasks.length}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {playbook.map((phase) => (
          <div
            key={phase.phase}
            className={clsx("card p-4", phase.current && "border-petrol-300 ring-1 ring-petrol-200")}
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <p className="font-semibold text-ink text-sm">{phase.phase}</p>
              <span className={clsx("text-xs whitespace-nowrap", phase.current ? "text-petrol-600 font-medium" : "text-ink/40")}>
                {phase.current ? "现在 · " : ""}
                {phase.when}
              </span>
            </div>
            <ul className="space-y-2">
              {phase.tasks.map((t) => {
                const checked = t.status === "done";
                return (
                  <li key={t.key}>
                    <label className="flex gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 accent-petrol-500 flex-shrink-0"
                        checked={checked}
                        onChange={() => onToggle(t.key, checked ? "" : "done")}
                      />
                      <span className={clsx(checked ? "text-ink/40 line-through" : "text-ink/75")}>{t.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScriptCard({ script }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. non-secure context); the text is selectable anyway.
    }
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-ink">{script.title}</p>
        <button className="text-xs text-ink/50 hover:text-petrol-600 inline-flex items-center gap-1" onClick={copy}>
          <Icon name={copied ? "check" : "content_copy"} size={14} />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="text-sm text-ink/75 whitespace-pre-wrap leading-relaxed bg-canvas rounded-lg p-3">{script.text}</p>
    </div>
  );
}

function EventFacts({ event }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink mb-2">会议须知</p>
      <ul className="space-y-1.5">
        {event.facts.map((f, i) => (
          <li key={i} className="text-sm text-ink/70 flex gap-2">
            <span className="text-ink/30">·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisaAndSources({ notes, sources, event }) {
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm font-semibold text-ink mb-2">签证：和 recruiter 聊之前要知道的</p>
        <ul className="space-y-1.5">
          {notes.map((n, i) => (
            <li key={i} className="text-sm text-ink/70 flex gap-2">
              <span className="text-ink/30">·</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-4">
        <p className="text-sm font-semibold text-ink mb-2">来源</p>
        <ul className="space-y-1">
          {sources.map((s) => (
            <li key={s.url} className="text-xs">
              <a href={s.url} target="_blank" rel="noreferrer" className="text-petrol-600 hover:underline inline-flex items-center gap-1">
                {s.label}
                <Icon name="open_in_new" size={12} />
              </a>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink/40 mt-2">
          调研于 {dayjs(event.researched_on).format("YYYY-MM-DD")}。赞助商名单会增加，会前一周再看一次 Partners 页和 GHC App 里的 Expo 名单。
        </p>
      </div>
    </div>
  );
}

export default function GhcGuide() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["ghc"], queryFn: ghcApi.guide });

  // Patch the cached guide in place rather than refetching it, so a status change elsewhere
  // never resets a note that's still being typed.
  const save = useMutation({
    mutationFn: ({ key, payload }) => ghcApi.updateProgress(key, payload),
    onSuccess: (row) =>
      qc.setQueryData(["ghc"], (old) => {
        if (!old) return old;
        const patch = (item, key) => (key === row.key ? { ...item, status: row.status, note: row.note } : item);
        return {
          ...old,
          companies: old.companies.map((c) => patch(c, `company:${c.key}`)),
          playbook: old.playbook.map((p) => ({ ...p, tasks: p.tasks.map((t) => patch(t, t.key)) })),
        };
      }),
  });
  const update = (key, payload) => save.mutate({ key, payload });

  if (isLoading || !data) return <PageLoader message="Loading the GHC guide..." />;

  return (
    <div className="space-y-6">
      <Header event={data.event} />
      <AnswerCards advance={data.advance_contact} tactics={data.tactics} />
      <Playbook playbook={data.playbook} onToggle={(key, status) => update(key, { status })} />
      <GhcCompanies companies={data.companies} onSave={update} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">话术</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.scripts.map((s) => (
            <ScriptCard key={s.key} script={s} />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EventFacts event={data.event} />
        <VisaAndSources notes={data.visa_notes} sources={data.sources} event={data.event} />
      </div>
    </div>
  );
}
