import clsx from "clsx";
import dayjs from "dayjs";
import { LEVEL_STYLE, TRACK_ORDER, TRACK_SHORT } from "@/utils/practice";

function tooltip(day) {
  const date = dayjs(day.date).format("ddd, MMM D");
  if (day.is_future) return `Day ${day.day_number} · ${date}`;
  if (!day.total_minutes) return `Day ${day.day_number} · ${date} · no practice`;
  const parts = TRACK_ORDER.filter((t) => day.minutes[t]).map((t) => `${TRACK_SHORT[t]} ${day.minutes[t]}m`);
  return `Day ${day.day_number} · ${date} · ${day.total_minutes} min (${parts.join(", ")})`;
}

/** The 30 plan days as a grid of cells coloured by how much of the day's target was done. */
export default function PracticeHeatmap({ days, compact = false, onSelect, selectedDay }) {
  return (
    <div>
      <div className={clsx("grid gap-1.5", compact ? "grid-cols-[repeat(15,minmax(0,1fr))]" : "grid-cols-10")}>
        {days.map((day) => {
          const cell = (
            <div
              className={clsx(
                "rounded-md flex items-center justify-center font-medium tabular-nums",
                compact ? "h-5 text-[10px]" : "h-9 text-xs",
                day.is_future ? "border border-dashed border-mist bg-white text-ink/25" : LEVEL_STYLE[day.level],
                !day.is_future && (day.level >= 2 ? "text-white" : "text-ink/45"),
                day.is_today && "ring-2 ring-bubblegum-400 ring-offset-1",
                selectedDay === day.day_number && !day.is_today && "ring-2 ring-petrol-400 ring-offset-1"
              )}
            >
              {day.day_number}
            </div>
          );
          return onSelect ? (
            <button key={day.day_number} title={tooltip(day)} onClick={() => onSelect(day.day_number)}>
              {cell}
            </button>
          ) : (
            <div key={day.day_number} title={tooltip(day)}>
              {cell}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="flex items-center gap-3 mt-2 text-xs text-ink/45">
          <span>Less</span>
          {LEVEL_STYLE.map((cls, i) => (
            <span key={i} className={clsx("w-3.5 h-3.5 rounded", cls)} />
          ))}
          <span>Full target</span>
          <span className="ml-3 inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded ring-2 ring-bubblegum-400" />
            Today
          </span>
        </div>
      )}
    </div>
  );
}
