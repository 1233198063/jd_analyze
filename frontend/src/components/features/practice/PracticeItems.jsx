import { useState } from "react";
import clsx from "clsx";
import Icon from "@/components/common/Icon";

const EXPLAIN_LABEL = "Explained it out loud";

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

export function SayItOutLoud({ text }) {
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
