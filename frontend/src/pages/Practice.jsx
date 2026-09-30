import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import clsx from "clsx";
import { practiceApi } from "@/api/practice";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import PracticeHeatmap from "@/components/features/practice/PracticeHeatmap";
import { CheckInForm, LeetCodeCard, PlanItemCard } from "@/components/features/practice/PracticeItems";
import { DIFFICULTY_STYLE, TRACK_ORDER, TRACK_SHORT, TRACK_STYLE } from "@/utils/practice";

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function TodayProgress({ today }) {
  const total = Object.values(today.targets).reduce((a, b) => a + b, 0);
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-ink/80">
          Today · {today.total_minutes} / {total} min
        </p>
        {!today.checked_in && (
          <p className="text-xs text-bubblegum-600 flex items-center gap-1">
            <Icon name="notifications_active" size={14} />
            Not practiced yet today
          </p>
        )}
      </div>
      <div className="flex gap-1 h-2.5">
        {TRACK_ORDER.map((t) => {
          const target = today.targets[t];
          const fill = Math.min(1, (today.minutes[t] || 0) / target);
          return (
            <div key={t} className="bg-petrol-50 rounded-full overflow-hidden" style={{ flexGrow: target }}>
              <div className={clsx("h-full rounded-full", TRACK_STYLE[t].bar)} style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-ink/55 flex-wrap">
        {TRACK_ORDER.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className={clsx("w-2 h-2 rounded-full", TRACK_STYLE[t].bar)} />
            {TRACK_SHORT[t]} {today.minutes[t] || 0}/{today.targets[t]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onSave, pending, onClose }) {
  const [form, setForm] = useState({
    daily_minutes: settings.daily_minutes,
    reminder_time: settings.reminder_time,
    start_date: settings.start_date,
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <div className="card p-4 flex flex-wrap items-end gap-4">
      <div>
        <label className="label">Minutes per day</label>
        <input type="number" min={15} max={600} className="input w-28" value={form.daily_minutes} onChange={set("daily_minutes")} />
      </div>
      <div>
        <label className="label">Desktop reminder at</label>
        <input type="time" className="input w-32" value={form.reminder_time} onChange={set("reminder_time")} />
      </div>
      <div>
        <label className="label">Plan starts on</label>
        <input type="date" className="input w-40" value={form.start_date} onChange={set("start_date")} />
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary"
          disabled={pending}
          onClick={() => onSave({ ...form, daily_minutes: Number(form.daily_minutes) })}
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
      <p className="text-xs text-ink/45 w-full">
        The split stays 50% React / JS · 35% LeetCode · 15% System Design. The desktop reminder fires
        from this time on if nothing is logged yet, and again every 2 hours until you check in.
      </p>
    </div>
  );
}

function OtherPracticeForm({ targets, onLog, pending }) {
  const [track, setTrack] = useState("leetcode");
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  return (
    <div className="card p-4 space-y-2.5">
      <p className="text-sm font-semibold text-ink/80">Log other practice</p>
      <div className="flex flex-wrap gap-2">
        <select className="input w-40 py-1 text-xs" value={track} onChange={(e) => setTrack(e.target.value)}>
          {TRACK_ORDER.map((t) => (
            <option key={t} value={t}>{TRACK_SHORT[t]}</option>
          ))}
        </select>
        <input
          className="input flex-1 min-w-[12rem] py-1 text-xs"
          placeholder="What you practiced, e.g. 146. LRU Cache or 'Build a dropdown'"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {track === "leetcode" && (
          <select className="input w-28 py-1 text-xs" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        )}
      </div>
      <CheckInForm
        key={track}
        defaultMinutes={targets[track]}
        barLabel={{ react: "Working within 60 min", leetcode: "Solved without hints", system_design: "Covered all five parts" }[track]}
        pending={pending}
        disabled={!title.trim()}
        submitLabel="Log it"
        onSubmit={(values) => {
          onLog({ track, title: title.trim(), difficulty: track === "leetcode" ? difficulty : null, ...values });
          setTitle("");
        }}
      />
    </div>
  );
}

function Readiness({ overview }) {
  const r = overview.readiness;
  const rows = {
    react: [
      ["Builds logged", r.react.sessions],
      ["Working within 60 min", `${r.react.met_bar} / ${r.react.sessions}`],
      ["Explained aloud", `${r.react.explained} / ${r.react.sessions}`],
    ],
    leetcode: [
      ["Easy solved without hints", `${r.leetcode.by_difficulty.easy.met_bar} / ${r.leetcode.by_difficulty.easy.sessions}`],
      ["Medium solved without hints", `${r.leetcode.by_difficulty.medium.met_bar} / ${r.leetcode.by_difficulty.medium.sessions}`],
      ["Explained aloud", `${r.leetcode.explained} / ${r.leetcode.sessions}`],
    ],
    system_design: [
      ["Designs practiced", r.system_design.sessions],
      ["Covered all five parts", `${r.system_design.met_bar} / ${r.system_design.sessions}`],
      ["Explained aloud", `${r.system_design.explained} / ${r.system_design.sessions}`],
    ],
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {TRACK_ORDER.map((t) => (
        <div key={t} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name={TRACK_STYLE[t].icon} size={16} className={TRACK_STYLE[t].text} />
            <p className="text-sm font-semibold text-ink/80">{overview.tracks[t].label}</p>
          </div>
          <p className="text-xs text-ink/50 mb-2">
            <span className="text-ink/40">Target: </span>
            {overview.tracks[t].goal}
          </p>
          <dl className="space-y-1 text-xs">
            {rows[t].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-ink/60">{label}</dt>
                <dd className="font-medium text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink/40 mt-2">
            Plan items done: {overview.plan_progress[t].done} / {overview.plan_progress[t].total}
          </p>
        </div>
      ))}
    </div>
  );
}

function TimeSplit({ overview }) {
  return (
    <div className="space-y-2.5">
      {TRACK_ORDER.map((t) => (
        <div key={t} className="text-xs">
          <div className="flex justify-between mb-1">
            <span className="text-ink/70">{TRACK_SHORT[t]}</span>
            <span className="tabular-nums text-ink/55">
              {overview.track_minutes[t]} min{overview.track_share[t] != null && ` · ${pct(overview.track_share[t])}`}{" "}
              <span className="text-ink/35">(plan {pct(overview.tracks[t].share)})</span>
            </span>
          </div>
          <div className="relative h-2 bg-petrol-50 rounded-full overflow-hidden">
            <div
              className={clsx("h-full rounded-full", TRACK_STYLE[t].bar)}
              style={{ width: pct(overview.track_share[t] ?? 0) }}
            />
            <div className="absolute top-0 h-full w-0.5 bg-ink/40" style={{ left: pct(overview.tracks[t].share) }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-ink/40 pt-1">The dark tick is the planned share.</p>
    </div>
  );
}

function PlanList({ plan, doneKeys, todayNumber, selectedDay, onSelect }) {
  const currentWeek = plan.days.find((d) => d.day === todayNumber)?.week ?? 1;
  const [openWeeks, setOpenWeeks] = useState([currentWeek]);
  const weeks = [...new Set(plan.days.map((d) => d.week))];
  const isDone = (d) => ({
    react: doneKeys.includes(d.react.key),
    leetcode: d.leetcode.problems.every((p) => doneKeys.includes(p.key)),
    system_design: doneKeys.includes(d.system_design.key),
  });

  return (
    <div className="space-y-2">
      {weeks.map((w) => {
        const open = openWeeks.includes(w);
        return (
          <div key={w} className="card overflow-hidden">
            <button
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
              onClick={() => setOpenWeeks((ws) => (open ? ws.filter((x) => x !== w) : [...ws, w]))}
            >
              <Icon name={open ? "expand_more" : "chevron_right"} size={16} className="text-ink/40" />
              <span className="text-sm font-semibold text-ink/80">
                {w <= 4 ? `Week ${w}` : "Days 29–30"}
              </span>
              <span className="text-xs text-ink/45">{plan.week_themes[w]}</span>
            </button>
            {open && (
              <div className="divide-y divide-mist/60 border-t border-mist/60">
                {plan.days.filter((d) => d.week === w).map((d) => {
                  const done = isDone(d);
                  return (
                    <button
                      key={d.day}
                      onClick={() => onSelect(d.day)}
                      className={clsx(
                        "w-full text-left px-4 py-2 grid grid-cols-[5.5rem_1fr_1fr_1fr] gap-3 text-xs hover:bg-canvas",
                        d.day === todayNumber && "bg-bubblegum-100/30",
                        d.day === selectedDay && d.day !== todayNumber && "bg-petrol-50"
                      )}
                    >
                      <span className="text-ink/55">
                        <span className="font-semibold text-ink/80">Day {d.day}</span>
                        <span className="block">{dayjs(d.date).format("ddd, MMM D")}</span>
                      </span>
                      {TRACK_ORDER.map((t) => {
                        const title =
                          t === "leetcode" ? d.leetcode.problems.map((p) => p.name).join(", ") : d[t].title;
                        return (
                          <span key={t} className="flex items-start gap-1 text-ink/75">
                            <Icon
                              name={done[t] ? "check_circle" : TRACK_STYLE[t].icon}
                              size={13}
                              filled={done[t]}
                              className={clsx("flex-shrink-0 mt-px", done[t] ? "text-sage-600" : "text-ink/30")}
                            />
                            {title}
                          </span>
                        );
                      })}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 30-day interview-practice plan: today's three items with a one-click check-in, the month at a
 * glance, and readiness against each track's bar. The month's real goal — explaining while
 * coding — is asked on every check-in.
 */
export default function Practice() {
  const qc = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: today, isLoading } = useQuery({ queryKey: ["practice", "today"], queryFn: practiceApi.today });
  const { data: overview } = useQuery({ queryKey: ["practice", "overview"], queryFn: practiceApi.overview });
  const { data: plan } = useQuery({ queryKey: ["practice", "plan"], queryFn: practiceApi.plan });

  const refresh = () => qc.invalidateQueries({ queryKey: ["practice"] });
  const log = useMutation({ mutationFn: practiceApi.log, onSuccess: refresh });
  const undo = useMutation({ mutationFn: practiceApi.deleteLog, onSuccess: refresh });
  const saveSettings = useMutation({
    mutationFn: practiceApi.updateSettings,
    onSuccess: () => {
      refresh();
      setSettingsOpen(false);
    },
  });

  if (isLoading || !today) return <PageLoader message="Loading your practice plan..." />;

  const dayNumber = selectedDay ?? today.day_number;
  const shownPlan = plan && dayNumber ? plan.days.find((d) => d.day === dayNumber) : today.plan;
  const viewingOtherDay = selectedDay && selectedDay !== today.day_number;
  const selectDay = (n) => {
    setSelectedDay(n === today.day_number ? null : n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cardProps = {
    doneKeys: today.done_keys,
    todayLogs: today.logs,
    onLog: (payload) => log.mutate(payload),
    onUndo: (id) => undo.mutate(id),
    pending: log.isPending,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Interview Practice</h1>
          <p className="text-sm text-ink/55 mt-0.5">
            {today.day_number
              ? `Day ${today.day_number} of ${today.plan_days} · ${today.week_theme}`
              : `Plan runs ${dayjs(today.settings.start_date).format("MMM D")} – ${dayjs(today.settings.end_date).format("MMM D")}`}
            {today.day_number && ` · goal by ${dayjs(today.settings.end_date).format("MMM D")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-white border border-mist">
            <Icon name="local_fire_department" size={17} filled className={today.streak ? "text-clay-500" : "text-ink/25"} />
            <span className="font-semibold text-ink">{today.streak}</span>
            <span className="text-ink/55">day streak</span>
            {today.longest_streak > today.streak && (
              <span className="text-ink/35 text-xs">· best {today.longest_streak}</span>
            )}
          </span>
          <button className="btn-secondary px-3" onClick={() => setSettingsOpen((v) => !v)} title="Plan settings">
            <Icon name="tune" size={17} />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <SettingsPanel
          settings={today.settings}
          pending={saveSettings.isPending}
          onSave={(values) => saveSettings.mutate(values)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <TodayProgress today={today} />

      {viewingOtherDay && shownPlan && (
        <div className="flex items-center gap-2 text-xs text-petrol-600 bg-petrol-50 border border-petrol-200 rounded-lg px-3 py-2">
          <Icon name="event" size={14} />
          Viewing Day {shownPlan.day} ({dayjs(shownPlan.date).format("MMM D")}) — anything you log now counts toward today.
          <button className="ml-auto font-medium hover:underline" onClick={() => setSelectedDay(null)}>
            Back to today
          </button>
        </div>
      )}

      {shownPlan ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
          <PlanItemCard
            track="react"
            meta={today.tracks.react}
            item={shownPlan.react}
            target={today.targets.react}
            logged={today.minutes.react}
            {...cardProps}
          />
          <LeetCodeCard
            meta={today.tracks.leetcode}
            item={shownPlan.leetcode}
            target={today.targets.leetcode}
            logged={today.minutes.leetcode}
            {...cardProps}
          />
          <PlanItemCard
            track="system_design"
            meta={today.tracks.system_design}
            item={shownPlan.system_design}
            target={today.targets.system_design}
            logged={today.minutes.system_design}
            {...cardProps}
          />
        </div>
      ) : (
        <div className="card p-8 text-center text-sm text-ink/55">
          Today is outside the 30-day plan. Open the settings to start a new round.
        </div>
      )}

      {log.isError && <p className="text-xs text-coral-600">{log.error.message}</p>}

      <OtherPracticeForm targets={today.targets} onLog={(payload) => log.mutate(payload)} pending={log.isPending} />

      {today.logs.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink/80 mb-2">Logged today</p>
          <div className="divide-y divide-mist/60">
            {today.logs.map((l) => (
              <div key={l.id} className="py-1.5 flex items-center gap-2 text-xs">
                <Icon name={TRACK_STYLE[l.track].icon} size={14} className={TRACK_STYLE[l.track].text} />
                <span className="text-ink/85">{l.title}</span>
                {l.difficulty && (
                  <span className={clsx("px-1.5 py-0.5 rounded capitalize", DIFFICULTY_STYLE[l.difficulty])}>
                    {l.difficulty}
                  </span>
                )}
                <span className="text-ink/45">{l.minutes} min</span>
                {l.explained_aloud && (
                  <span className="inline-flex items-center gap-0.5 text-sage-700">
                    <Icon name="record_voice_over" size={12} />
                    explained
                  </span>
                )}
                {l.notes && <span className="text-ink/45 truncate">· {l.notes}</span>}
                <button className="ml-auto text-ink/35 hover:text-coral-600" onClick={() => undo.mutate(l.id)}>
                  Undo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
            <div className="card p-4">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-sm font-semibold text-ink/80">30 days</p>
                <p className="text-xs text-ink/50">
                  Practiced {overview.days_practiced} of {overview.days_elapsed} {overview.days_elapsed === 1 ? "day" : "days"} so far
                  {overview.explained_rate != null && ` · explained aloud in ${pct(overview.explained_rate)} of sessions`}
                </p>
              </div>
              <PracticeHeatmap days={overview.days} onSelect={selectDay} selectedDay={selectedDay} />
            </div>
            <div className="card p-4">
              <p className="text-sm font-semibold text-ink/80 mb-3">Where the time went</p>
              <TimeSplit overview={overview} />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-ink/80 mb-2">Readiness</h2>
            <Readiness overview={overview} />
          </div>
        </>
      )}

      {plan && (
        <div>
          <h2 className="text-sm font-semibold text-ink/80 mb-2">The plan</h2>
          <PlanList
            plan={plan}
            doneKeys={today.done_keys}
            todayNumber={today.day_number}
            selectedDay={selectedDay}
            onSelect={selectDay}
          />
        </div>
      )}
    </div>
  );
}
