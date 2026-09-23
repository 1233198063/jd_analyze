import clsx from "clsx";

function scoreColor(score, isRejected) {
  if (isRejected) return { stroke: "#A8402B", text: "text-coral-700" };
  if (score >= 80) return { stroke: "#2F6B4E", text: "text-sage-700" };
  if (score >= 60) return { stroke: "#9C7318", text: "text-gold-700" };
  return { stroke: "#3E8285", text: "text-ink/60" };
}

// Geometry lives in a fixed 100x100 viewBox so the ring scales to any `size` without its stroke
// spilling past the SVG edge (a fixed pixel radius clipped the ring into a square at small sizes).
const VIEWBOX = 100;
const STROKE = 7;
const R = (VIEWBOX - STROKE) / 2 - 1;

export default function ScoreRing({ score, isRejected, size = 96 }) {
  const circ = 2 * Math.PI * R;
  const offset = isRejected ? circ : circ - (score / 100) * circ;
  const { stroke, text } = scoreColor(score, isRejected);
  const display = isRejected ? "X" : Math.round(score);
  const c = VIEWBOX / 2;

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="-rotate-90">
        <circle cx={c} cy={c} r={R} fill="none" stroke="#D7ECEB" strokeWidth={STROKE} />
        <circle
          cx={c}
          cy={c}
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <span
        className={clsx("absolute font-bold", text)}
        style={{ fontSize: Math.round(size * 0.28) }}
      >
        {display}
      </span>
    </div>
  );
}

export function ScoreBar({ label, value, max, color = "blue" }) {
  const pct = Math.round((value / max) * 100);
  const colors = {
    blue: "bg-petrol-500",
    green: "bg-sage-600",
    yellow: "bg-gold-600",
    orange: "bg-clay-600",
    purple: "bg-plum-600",
    pink: "bg-bubblegum-500",
  };
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-ink/70">{label}</span>
        <span className="font-medium text-ink/90">
          {value.toFixed(1)}/{max}
        </span>
      </div>
      <div className="h-2 bg-petrol-50 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", colors[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
