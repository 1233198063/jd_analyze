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

const PHASE_LABEL = {
  sprint: "冲刺计划",
  coding: "原 30 天 coding 计划",
};

// The free-practice form's bar checkbox, per track.
const FREE_BAR = {
  project: "讲清楚了，没看稿",
  react: "Working within 60 min",
  leetcode: "Solved without hints",
  system_design: "Covered all five parts",
  english: "用英文完整说了一遍",
};

function TodayProgress({ today }) {
  const tracks = TRACK_ORDER.filter((t) => today.targets[t]);
  const total = tracks.reduce((sum, t) => sum + today.targets[t], 0);
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-ink/80">
          Today · {today.total_minutes}
          {total > 0 && ` / ${total}`} min
        </p>
        {!today.checked_in && today.day_number && (
          <p className="text-xs text-bubblegum-600 flex items-center gap-1">
            <Icon name="notifications_active" size={14} />
            Not practiced yet today
          </p>
        )}
      </div>
      {tracks.length > 0 && (
        <>
          <div className="flex gap-1 h-2.5">
            {tracks.map((t) => {
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
            {tracks.map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span className={clsx("w-2 h-2 rounded-full", TRACK_STYLE[t].bar)} />
                {TRACK_SHORT[t]} {today.minutes[t] || 0}/{today.targets[t]}
              </span>
            ))}
          </div>
        </>
      )}
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
        <label className="label">Plan starts on (sprint Day 1)</label>
        <input type="date" className="input w-40" value={form.start_date} onChange={set("start_date")} />
      </div>
      <div>
        <label className="label">Minutes per day, 30-day plan</label>
        <input type="number" min={15} max={600} className="input w-28" value={form.daily_minutes} onChange={set("daily_minutes")} />
      </div>
      <div>
        <label className="label">Desktop reminder at</label>
        <input type="time" className="input w-32" value={form.reminder_time} onChange={set("reminder_time")} />
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
        Sprint days (if your profile has a practice sprint) use the minutes written into each item. Minutes per day only
        applies to the 30-day coding plan (50% React / JS · 35% LeetCode · 15% System Design). The desktop reminder
        fires from this time on if nothing is logged yet, and again every 2 hours until you check in.
      </p>
    </div>
  );
}

function OtherPracticeForm({ defaults, onLog, pending }) {
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
          placeholder="What you practiced, e.g. 146. LRU Cache, 'Build a dropdown' or '项目追问练习'"
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
        defaultMinutes={defaults[track]}
        barLabel={FREE_BAR[track]}
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
  const tracks = TRACK_ORDER.filter((t) => overview.plan_progress[t] || r[t].sessions);
  const rowsFor = (t) => {
    if (t === "leetcode") {
      const d = r.leetcode.by_difficulty;
      return [
        ["Easy solved without hints", `${d.easy.met_bar} / ${d.easy.sessions}`],
        ["Medium solved without hints", `${d.medium.met_bar} / ${d.medium.sessions}`],
        ["Explained aloud", `${r.leetcode.explained} / ${r.leetcode.sessions}`],
      ];
    }
    return [
      ["Sessions", r[t].sessions],
      [`Met the bar`, `${r[t].met_bar} / ${r[t].sessions}`],
      ["Explained aloud", `${r[t].explained} / ${r[t].sessions}`],
    ];
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
      {tracks.map((t) => (
        <div key={t} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name={TRACK_STYLE[t].icon} size={16} className={TRACK_STYLE[t].text} />
            <p className="text-sm font-semibold text-ink/80">{TRACK_SHORT[t]}</p>
          </div>
          <p className="text-xs text-ink/50 mb-2">
            <span className="text-ink/40">Target: </span>
            {overview.tracks[t].goal}
          </p>
          <dl className="space-y-1 text-xs">
            {rowsFor(t).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-ink/60">{label}</dt>
                <dd className="font-medium text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {overview.plan_progress[t] && (
            <p className="text-xs text-ink/40 mt-2">
              Plan items done: {overview.plan_progress[t].done} / {overview.plan_progress[t].total}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function TimeSplit({ overview }) {
  const tracks = TRACK_ORDER.filter((t) => overview.plan_share[t] || overview.track_minutes[t]);
  return (
    <div className="space-y-2.5">
      {tracks.map((t) => (
        <div key={t} className="text-xs">
          <div className="flex justify-between mb-1">
            <span className="text-ink/70">{TRACK_SHORT[t]}</span>
            <span className="tabular-nums text-ink/55">
              {overview.track_minutes[t]} min{overview.track_share[t] != null && ` · ${pct(overview.track_share[t])}`}{" "}
              <span className="text-ink/35">(plan {pct(overview.plan_share[t])})</span>
            </span>
          </div>
          <div className="relative h-2 bg-petrol-50 rounded-full overflow-hidden">
            <div
              className={clsx("h-full rounded-full", TRACK_STYLE[t].bar)}
              style={{ width: pct(overview.track_share[t] ?? 0) }}
            />
            <div className="absolute top-0 h-full w-0.5 bg-ink/40" style={{ left: pct(overview.plan_share[t]) }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-ink/40 pt-1">The dark tick is the share planned across the whole plan.</p>
    </div>
  );
}

/** The day's place in the plan: a sprint day shows its focus and completion standard. */
function DayBanner({ day }) {
  if (day.phase === "sprint") {
    return (
      <div className="rounded-lg border border-petrol-200 bg-petrol-50 px-3 py-2 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-petrol-600">{day.group}</span>
        <span className="text-ink/80">{day.theme}</span>
        <span className="text-xs text-ink/60 inline-flex items-center gap-1">
          <Icon name="flag" size={14} className="text-petrol-500" />
          完成标准：{day.standard}
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-mist bg-white px-3 py-2 text-sm text-ink/70">
      <span className="font-semibold text-ink/80">原计划 Day {day.source_day}</span>
      <span className="ml-3">{day.theme}</span>
    </div>
  );
}

function ItemCards({ day, today, cardProps }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
      {day.items.map((item) => {
        const props = {
          meta: today.tracks[item.track],
          item,
          target: today.targets[item.track] ?? item.minutes,
          logged: today.minutes[item.track] || 0,
          ...cardProps,
        };
        return item.problems ? <LeetCodeCard key={item.key} {...props} /> : <PlanItemCard key={item.key} {...props} />;
      })}
    </div>
  );
}

function PlanList({ plan, doneKeys, todayNumber, selectedDay, onSelect }) {
  // Groups in plan order: the sprint's day pairs, then the 30-day plan's weeks.
  const groups = [];
  for (const d of plan.days) {
    const id = `${d.phase}:${d.group}`;
    let g = groups.find((x) => x.id === id);
    if (!g) groups.push((g = { id, phase: d.phase, label: d.group, theme: d.theme, standard: d.standard, days: [] }));
    g.days.push(d);
  }
  const currentGroup = groups.find((g) => g.days.some((d) => d.day === todayNumber))?.id ?? groups[0]?.id;
  const [open, setOpen] = useState([currentGroup]);
  const itemDone = (item) =>
    item.problems ? item.problems.every((p) => doneKeys.includes(p.key)) : doneKeys.includes(item.key);
  const phases = [...new Set(groups.map((g) => g.phase))];

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const phaseDays = plan.days.filter((d) => d.phase === phase);
        return (
          <div key={phase} className="space-y-2">
            <p className="text-xs font-medium text-ink/55">
              {PHASE_LABEL[phase]} · Day {phaseDays[0].day}–{phaseDays[phaseDays.length - 1].day} ·{" "}
              {dayjs(phaseDays[0].date).format("MMM D")} – {dayjs(phaseDays[phaseDays.length - 1].date).format("MMM D")}
              {phase === "coding" && " · 之前没完成的部分，接在冲刺后面"}
            </p>
            {groups
              .filter((g) => g.phase === phase)
              .map((g) => {
                const isOpen = open.includes(g.id);
                return (
                  <div key={g.id} className="card overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left flex-wrap"
                      onClick={() => setOpen((ids) => (isOpen ? ids.filter((x) => x !== g.id) : [...ids, g.id]))}
                    >
                      <Icon name={isOpen ? "expand_more" : "chevron_right"} size={16} className="text-ink/40" />
                      <span className="text-sm font-semibold text-ink/80">{g.label}</span>
                      <span className="text-xs text-ink/55">{g.theme}</span>
                      {g.standard && <span className="text-xs text-ink/40">· 完成标准：{g.standard}</span>}
                    </button>
                    {isOpen && (
                      <div className="divide-y divide-mist/60 border-t border-mist/60">
                        {g.days.map((d) => (
                          <button
                            key={d.day}
                            onClick={() => onSelect(d.day)}
                            className={clsx(
                              "w-full text-left px-4 py-2 grid grid-cols-[6rem_1fr] gap-3 text-xs hover:bg-canvas",
                              d.day === todayNumber && "bg-bubblegum-100/30",
                              d.day === selectedDay && d.day !== todayNumber && "bg-petrol-50"
                            )}
                          >
                            <span className="text-ink/55">
                              <span className="font-semibold text-ink/80">Day {d.day}</span>
                              <span className="block">{dayjs(d.date).format("ddd, MMM D")}</span>
                              {d.source_day && <span className="block text-ink/35">原 Day {d.source_day}</span>}
                            </span>
                            <span className="flex flex-wrap gap-x-4 gap-y-1">
                              {d.items.map((item) => {
                                const done = itemDone(item);
                                const title = item.problems
                                  ? `${item.title}: ${item.problems.map((p) => p.name).join(", ")}`
                                  : item.title;
                                return (
                                  <span key={item.key} className="flex items-start gap-1 text-ink/75 max-w-[22rem]">
                                    <Icon
                                      name={done ? "check_circle" : TRACK_STYLE[item.track].icon}
                                      size={13}
                                      filled={done}
                                      className={clsx("flex-shrink-0 mt-px", done ? "text-sage-600" : TRACK_STYLE[item.track].text)}
                                    />
                                    {title}
                                  </span>
                                );
                              })}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Interview practice: the two-week sprint (project deep-dives, coding, English), then whatever is
 * left of the original 30-day coding plan. Today's items with a one-click check-in, the plan at a
 * glance, and readiness per track. Every check-in asks whether you explained it out loud.
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
  const s = today.settings;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Interview Practice</h1>
          <p className="text-sm text-ink/55 mt-0.5">
            {today.plan
              ? `Day ${today.day_number} of ${today.plan_days} · ${PHASE_LABEL[today.plan.phase]}`
              : `Plan runs ${dayjs(s.start_date).format("MMM D")} – ${dayjs(s.end_date).format("MMM D")}`}
            {s.sprint_end_date && ` · sprint ends ${dayjs(s.sprint_end_date).format("MMM D")}`}
            {` · plan ends ${dayjs(s.end_date).format("MMM D")}`}
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
          settings={s}
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
        <div className="space-y-3">
          <DayBanner day={shownPlan} />
          <ItemCards day={shownPlan} today={today} cardProps={cardProps} />
        </div>
      ) : (
        <div className="card p-8 text-center text-sm text-ink/55">
          Today is outside the plan. Open the settings to start a new round.
        </div>
      )}

      {log.isError && <p className="text-xs text-coral-600">{log.error.message}</p>}

      <OtherPracticeForm defaults={today.default_minutes} onLog={(payload) => log.mutate(payload)} pending={log.isPending} />

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
                <p className="text-sm font-semibold text-ink/80">{overview.days.length} days</p>
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
