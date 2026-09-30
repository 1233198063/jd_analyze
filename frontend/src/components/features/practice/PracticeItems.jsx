import { useState } from "react";
import clsx from "clsx";
import Icon from "@/components/common/Icon";
import { DIFFICULTY_STYLE, TRACK_STYLE } from "@/utils/practice";

const EXPLAIN_LABEL = "Explained it out loud while coding";

function Check({ checked, onChange, children }) {
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs text-ink/75">
      <input type="checkbox" className="rounded" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Minutes, the track's bar, explained-aloud and a note — the whole check-in in one row. */
export function CheckInForm({ defaultMinutes, barLabel, onSubmit, pending, disabled = false, submitLabel = "Check in" }) {
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [metBar, setMetBar] = useState(false);
  const [explained, setExplained] = useState(false);
  const [notes, setNotes] = useState("");

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ minutes: Number(minutes), met_bar: metBar, explained_aloud: explained, notes: notes || null });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-ink/75">
          <input
            type="number"
            min={1}
            max={600}
            className="input w-16 py-1 text-xs"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          min
        </label>
        <Check checked={metBar} onChange={setMetBar}>{barLabel}</Check>
        <Check checked={explained} onChange={setExplained}>{EXPLAIN_LABEL}</Check>
      </div>
      <div className="flex gap-2">
        <input
          className="input py-1 text-xs flex-1"
          placeholder="Notes (optional): what tripped you up, what to redo"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button className="btn-primary text-xs px-3 py-1" disabled={pending || disabled || !(Number(minutes) > 0)}>
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function SayItOutLoud({ text }) {
  return (
    <div className="rounded-md bg-canvas border border-mist px-2.5 py-2 text-xs text-ink/70 flex items-start gap-1.5">
      <Icon name="record_voice_over" size={14} className="text-ink/40 flex-shrink-0 mt-px" />
      <span>
        <span className="font-medium text-ink/80">Say it out loud: </span>
        {text}
      </span>
    </div>
  );
}

function DoneLine({ log, onUndo, onRedo, barLabel }) {
  return (
    <div className="rounded-md bg-sage-50 border border-sage-200 px-2.5 py-1.5 text-xs text-sage-700 flex items-center gap-2 flex-wrap">
      <Icon name="check_circle" size={15} filled />
      {log ? (
        <span>
          Done · {log.minutes} min
          {log.met_bar && ` · ${barLabel.toLowerCase()}`}
          {log.explained_aloud ? " · explained aloud" : " · not explained aloud"}
        </span>
      ) : (
        <span>Done on an earlier day</span>
      )}
      <span className="ml-auto flex gap-3">
        {log && (
          <button className="text-ink/40 hover:text-coral-600" onClick={() => onUndo(log.id)}>
            Undo
          </button>
        )}
        <button className="text-ink/50 hover:text-ink" onClick={onRedo}>
          Log again
        </button>
      </span>
    </div>
  );
}

function TrackHeader({ track, meta, target, logged }) {
  const style = TRACK_STYLE[track];
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={clsx("w-7 h-7 rounded-md flex items-center justify-center", style.soft, style.text)}>
        <Icon name={style.icon} size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink/80">{meta.label}</p>
        <p className="text-[11px] text-ink/45">
          {logged} / {target} min today
        </p>
      </div>
    </div>
  );
}

/** One plan item for a single-item track (React / JS or System Design). */
export function PlanItemCard({ track, meta, item, target, logged, doneKeys, todayLogs, onLog, onUndo, pending }) {
  const [redo, setRedo] = useState(false);
  const log = todayLogs.find((l) => l.item_key === item.key);
  const done = doneKeys.includes(item.key) && !redo;

  return (
    <div className="card p-4 flex flex-col gap-2.5">
      <TrackHeader track={track} meta={meta} target={target} logged={logged} />
      <div>
        <p className="text-sm font-semibold text-ink">{item.title}</p>
        <p className="text-xs text-ink/65 mt-0.5">{item.brief}</p>
      </div>
      <SayItOutLoud text={item.say} />
      <div className="mt-auto pt-1">
        {done ? (
          <DoneLine log={log} barLabel={meta.bar} onUndo={onUndo} onRedo={() => setRedo(true)} />
        ) : (
          <CheckInForm
            defaultMinutes={target}
            barLabel={meta.bar}
            pending={pending}
            onSubmit={(values) => {
              onLog({ track, item_key: item.key, title: item.title, ...values });
              setRedo(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** The LeetCode set: each problem checks in on its own, so Easy vs Medium readiness can be tracked. */
export function LeetCodeCard({ meta, item, target, logged, doneKeys, todayLogs, onLog, onUndo, pending }) {
  const [redoKeys, setRedoKeys] = useState([]);
  const perProblem = Math.max(1, Math.round(target / item.problems.length));

  return (
    <div className="card p-4 flex flex-col gap-2.5">
      <TrackHeader track="leetcode" meta={meta} target={target} logged={logged} />
      <p className="text-sm font-semibold text-ink">{item.title}</p>
      <SayItOutLoud text={item.say} />
      <div className="space-y-3 mt-auto pt-1">
        {item.problems.map((p) => {
          const log = todayLogs.find((l) => l.item_key === p.key);
          const done = doneKeys.includes(p.key) && !redoKeys.includes(p.key);
          return (
            <div key={p.key} className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-ink hover:text-petrol-500 hover:underline"
                >
                  {p.number}. {p.name}
                  <Icon name="open_in_new" size={13} className="text-ink/40" />
                </a>
                <span className={clsx("text-[11px] px-1.5 py-0.5 rounded capitalize", DIFFICULTY_STYLE[p.difficulty])}>
                  {p.difficulty}
                </span>
              </div>
              {done ? (
                <DoneLine
                  log={log}
                  barLabel={meta.bar}
                  onUndo={onUndo}
                  onRedo={() => setRedoKeys((keys) => [...keys, p.key])}
                />
              ) : (
                <CheckInForm
                  defaultMinutes={perProblem}
                  barLabel={meta.bar}
                  pending={pending}
                  onSubmit={(values) => {
                    onLog({
                      track: "leetcode",
                      item_key: p.key,
                      title: `${p.number}. ${p.name}`,
                      difficulty: p.difficulty,
                      ...values,
                    });
                    setRedoKeys((keys) => keys.filter((k) => k !== p.key));
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
