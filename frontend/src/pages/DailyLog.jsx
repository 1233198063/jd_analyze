import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import clsx from "clsx";
import { dailyApi } from "@/api/daily";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const fmtDay = (d) => `${dayjs(d).month() + 1}月${dayjs(d).date()}日 ${WEEKDAYS[dayjs(d).day()]}`;
const todayStr = () => dayjs().format("YYYY-MM-DD");

const PROGRESS_LABEL = {
  referral_asked: { label: "求内推", icon: "handshake" },
  oa: { label: "OA", icon: "code" },
  phone_screen: { label: "电话面", icon: "call" },
  interview: { label: "面试", icon: "groups" },
  offer: { label: "Offer", icon: "celebration" },
  rejected: { label: "Not This Time", icon: "eco" },
  withdrawn: { label: "撤回", icon: "undo" },
};

function StatTile({ label, value, sub }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-ink/50">{label}</p>
      <p className="text-2xl font-bold text-petrol-500 mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink/40">{sub}</p>}
    </div>
  );
}

function TodoItem({ todo, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(todo.text);
  const save = () => {
    setEditing(false);
    const next = text.trim();
    if (next && next !== todo.text) onUpdate({ text: next });
    else setText(todo.text);
  };
  return (
    <li className="group flex items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        className="mt-1 accent-petrol-500 flex-shrink-0"
        checked={todo.done}
        onChange={() => onUpdate({ done: !todo.done })}
      />
      {editing ? (
        <input
          autoFocus
          className="input py-0.5 text-sm flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setText(todo.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className={clsx("flex-1 text-sm cursor-text", todo.done ? "text-ink/40 line-through" : "text-ink/85")}
          onClick={() => setEditing(true)}
          title="点击编辑"
        >
          {todo.text}
        </span>
      )}
      {todo.done && todo.done_at && (
        <span className="text-xs text-ink/35 tabular-nums mt-0.5">{dayjs(todo.done_at).format("HH:mm")}</span>
      )}
      <button
        className="text-ink/25 hover:text-coral-600 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onDelete}
        title="删除"
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  );
}

function TodoPanel({ data, onAdd, onUpdate, onDelete }) {
  const [text, setText] = useState("");
  const todos = [...data.todos].sort((a, b) => a.done - b.done);
  const done = data.todos.filter((t) => t.done).length;
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm font-semibold text-ink">待办清单</p>
        {data.todos.length > 0 && (
          <p className="text-xs text-ink/50">
            完成 <span className="font-semibold text-ink">{done}</span> / {data.todos.length}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className="input py-1.5 text-sm"
          placeholder={data.is_today ? "今天要做什么？回车添加" : "补记这一天做的事，回车添加"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn-primary py-1.5 whitespace-nowrap flex-shrink-0" onClick={submit} disabled={!text.trim()}>
          添加
        </button>
      </div>

      {todos.length > 0 ? (
        <ul className="mt-3 divide-y divide-mist/60">
          {todos.map((t) => (
            <TodoItem key={t.id} todo={t} onUpdate={(p) => onUpdate(t.id, p)} onDelete={() => onDelete(t.id)} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink/40 mt-4">{data.is_today ? "还没有待办。" : "这一天没有记录待办。"}</p>
      )}

      {data.carryover.length > 0 && (
        <div className="mt-4 pt-3 border-t border-mist">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-ink/50">之前没做完的（{data.carryover.length}）</p>
            <button
              className="text-xs text-petrol-600 hover:underline"
              onClick={() => data.carryover.forEach((t) => onUpdate(t.id, { day: data.day }))}
            >
              全部移到今天
            </button>
          </div>
          <ul className="space-y-1">
            {data.carryover.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-ink/35 tabular-nums w-10">{dayjs(t.day).format("M/D")}</span>
                <span className="flex-1 text-ink/65">{t.text}</span>
                <button className="text-xs text-petrol-600 hover:underline" onClick={() => onUpdate(t.id, { day: data.day })}>
                  移到今天
                </button>
                <button className="text-ink/25 hover:text-coral-600" onClick={() => onDelete(t.id)} title="删除">
                  <Icon name="close" size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function JobLine({ entry, right }) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span className="text-xs text-ink/35 tabular-nums w-10 flex-shrink-0">{dayjs(entry.at).format("HH:mm")}</span>
      <Link to={`/jobs/${entry.job_id}`} className="text-ink/85 hover:text-petrol-600 hover:underline truncate">
        <span className="font-medium">{entry.company}</span>
        <span className="text-ink/55"> — {entry.title}</span>
      </Link>
      {right}
    </li>
  );
}

function ActivityPanel({ data }) {
  const { applied, progress, jds_added, practice } = data.activity;
  const [showAllJds, setShowAllJds] = useState(false);
  const jds = showAllJds ? jds_added : jds_added.slice(0, 5);
  const empty = !applied.length && !progress.length && !jds_added.length && !practice.sessions;

  return (
    <div className="card p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-ink">App 自动记录</p>
        <p className="text-xs text-ink/40 mt-0.5">从投递记录、分析过的 JD 和刷题打卡里自动汇总，不用手动填。</p>
      </div>

      {empty && (
        <p className="text-sm text-ink/40">
          {data.is_today ? "今天还没有记录。在岗位页点 Mark Applied、分析 JD 或在 Practice 打卡后，这里会自动出现。" : "这一天 app 里没有记录。"}
        </p>
      )}

      {applied.length > 0 && (
        <section>
          <p className="text-xs font-medium text-ink/50 mb-1.5 flex items-center gap-1">
            <Icon name="send" size={14} className="text-petrol-500" />
            投递了 {applied.length} 个
          </p>
          <ul className="space-y-1">
            {applied.map((e, i) => (
              <JobLine key={`${e.job_id}-${i}`} entry={e} />
            ))}
          </ul>
        </section>
      )}

      {progress.length > 0 && (
        <section>
          <p className="text-xs font-medium text-ink/50 mb-1.5 flex items-center gap-1">
            <Icon name="trending_up" size={14} className="text-petrol-500" />
            流程进展
          </p>
          <ul className="space-y-1">
            {progress.map((e, i) => {
              const s = PROGRESS_LABEL[e.status] ?? { label: e.status, icon: "flag" };
              return (
                <JobLine
                  key={`${e.job_id}-${i}`}
                  entry={e}
                  right={
                    <span className="ml-auto text-xs text-ink/50 inline-flex items-center gap-0.5 whitespace-nowrap">
                      <Icon name={s.icon} size={13} />
                      {s.label}
                    </span>
                  }
                />
              );
            })}
          </ul>
        </section>
      )}

      {jds_added.length > 0 && (
        <section>
          <p className="text-xs font-medium text-ink/50 mb-1.5 flex items-center gap-1">
            <Icon name="note_add" size={14} className="text-petrol-500" />
            分析了 {jds_added.length} 个 JD
          </p>
          <ul className="space-y-1">
            {jds.map((e) => (
              <JobLine key={e.job_id} entry={e} />
            ))}
          </ul>
          {jds_added.length > 5 && (
            <button className="text-xs text-ink/45 hover:text-ink/70 mt-1" onClick={() => setShowAllJds((v) => !v)}>
              {showAllJds ? "收起" : `还有 ${jds_added.length - 5} 个`}
            </button>
          )}
        </section>
      )}

      {practice.sessions > 0 && (
        <section>
          <p className="text-xs font-medium text-ink/50 mb-1.5 flex items-center gap-1">
            <Icon name="fitness_center" size={14} className="text-petrol-500" />
            刷题 {practice.minutes} 分钟 · {practice.sessions} 次 · 讲出思路 {practice.explained} 次
          </p>
          <ul className="space-y-0.5">
            {practice.items.map((p, i) => (
              <li key={i} className="text-sm text-ink/70 flex justify-between gap-2">
                <span className="truncate">{p.title}</span>
                <span className="text-xs text-ink/35 tabular-nums">{p.minutes} min</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HistoryStrip({ history, selected, onSelect }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-ink mb-3">最近 14 天</p>
      <div className="grid grid-cols-7 lg:grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5">
        {history.map((d) => {
          const quiet = !d.applied && !d.jds_added && !d.practice_minutes && !d.todos_total;
          return (
            <button
              key={d.day}
              onClick={() => onSelect(d.day)}
              className={clsx(
                "rounded-lg border px-1.5 py-2 text-left transition-colors",
                d.day === selected ? "border-petrol-400 bg-petrol-50" : "border-mist hover:bg-petrol-50/60",
                quiet && d.day !== selected && "opacity-60"
              )}
            >
              <p className="text-[11px] text-ink/45">{WEEKDAYS[dayjs(d.day).day()]}</p>
              <p className="text-sm font-semibold text-ink tabular-nums">{dayjs(d.day).format("M/D")}</p>
              <div className="mt-1 space-y-0.5 text-[11px] text-ink/55 tabular-nums">
                <p>投递 {d.applied || "—"}</p>
                <p>待办 {d.todos_total ? `${d.todos_done}/${d.todos_total}` : "—"}</p>
                <p>刷题 {d.practice_minutes ? `${d.practice_minutes}m` : "—"}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyLog() {
  const qc = useQueryClient();
  const [day, setDay] = useState(todayStr());
  // Keep showing the previous day while the next one loads, so stepping through days doesn't flash.
  const { data, isLoading } = useQuery({
    queryKey: ["daily", "day", day],
    queryFn: () => dailyApi.day(day),
    placeholderData: keepPreviousData,
  });
  const { data: history = [] } = useQuery({ queryKey: ["daily", "history"], queryFn: () => dailyApi.history(14) });

  const refresh = () => qc.invalidateQueries({ queryKey: ["daily"] });
  const add = useMutation({ mutationFn: (text) => dailyApi.addTodo({ day, text }), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, payload }) => dailyApi.updateTodo(id, payload), onSuccess: refresh });
  const remove = useMutation({ mutationFn: dailyApi.deleteTodo, onSuccess: refresh });

  const isToday = day === todayStr();
  const shift = (n) => setDay(dayjs(day).add(n, "day").format("YYYY-MM-DD"));

  if (isLoading || !data) return <PageLoader message="Loading your day..." />;

  const a = data.activity;
  const done = data.todos.filter((t) => t.done).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">每日记录</h1>
          <p className="text-sm text-ink/55 mt-0.5">自己写的待办，加上 app 自动记下的投递、JD 和刷题。</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-secondary px-2 py-1.5" onClick={() => shift(-1)} title="前一天">
            <Icon name="chevron_left" size={18} />
          </button>
          <span className="text-sm font-semibold text-ink px-2 min-w-[8.5rem] text-center">
            {fmtDay(day)}
            {isToday && <span className="ml-1.5 text-xs font-normal text-petrol-600">今天</span>}
          </span>
          <button className="btn-secondary px-2 py-1.5" onClick={() => shift(1)} disabled={isToday} title="后一天">
            <Icon name="chevron_right" size={18} />
          </button>
          {!isToday && (
            <button className="btn-secondary py-1.5 text-xs" onClick={() => setDay(todayStr())}>
              回到今天
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="投递" value={a.applied.length} sub={a.progress.length ? `另有 ${a.progress.length} 个流程进展` : null} />
        <StatTile label="分析 JD" value={a.jds_added.length} />
        <StatTile label="刷题" value={`${a.practice.minutes}`} sub="分钟" />
        <StatTile label="待办完成" value={data.todos.length ? `${done}/${data.todos.length}` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <TodoPanel
          data={data}
          onAdd={(text) => add.mutate(text)}
          onUpdate={(id, payload) => update.mutate({ id, payload })}
          onDelete={(id) => remove.mutate(id)}
        />
        <ActivityPanel data={data} />
      </div>

      {history.length > 0 && <HistoryStrip history={history} selected={day} onSelect={setDay} />}
    </div>
  );
}
