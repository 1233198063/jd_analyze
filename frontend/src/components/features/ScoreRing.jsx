import clsx from "clsx";

function scoreColor(score, isRejected) {
  if (isRejected) return { stroke: "#ef4444", text: "text-red-600" };
  if (score >= 80) return { stroke: "#22c55e", text: "text-green-600" };
  if (score >= 60) return { stroke: "#f59e0b", text: "text-yellow-600" };
  return { stroke: "#9ca3af", text: "text-gray-500" };
}

export default function ScoreRing({ score, isRejected, size = 96 }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const offset = isRejected ? circ : circ - (score / 100) * circ;
  const { stroke, text } = scoreColor(score, isRejected);
  const display = isRejected ? "X" : Math.round(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <span className={clsx("absolute text-xl font-bold", text)}>{display}</span>
    </div>
  );
}

export function ScoreBar({ label, value, max, color = "blue" }) {
  const pct = Math.round((value / max) * 100);
  const colors = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    orange: "bg-orange-500",
    purple: "bg-purple-500",
    pink: "bg-pink-500",
  };
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">
          {value.toFixed(1)}/{max}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", colors[color])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
