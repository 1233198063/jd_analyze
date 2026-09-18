import clsx from "clsx";

/**
 * Journal-style rubber stamps for application milestones.
 * Rejection deliberately gets a soft autumn-leaf mark rather than a cross —
 * the tracker is read most often on bad days.
 */
export const STAMPS = {
  saved: { emoji: "🔖", label: "收藏", bg: "bg-gray-100", border: "border-gray-300", text: "text-gray-500" },
  applied: { emoji: "📮", label: "投递", bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-600" },
  referral_asked: { emoji: "💌", label: "内推", bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-600" },
  oa: { emoji: "✏️", label: "笔试", bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-600" },
  phone_screen: { emoji: "☎️", label: "电话", bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-600" },
  interview: { emoji: "💬", label: "面试", bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-600" },
  offer: { emoji: "🌸", label: "Offer", bg: "bg-green-50", border: "border-green-300", text: "text-green-600" },
  rejected: { emoji: "🍂", label: "缘分未到", bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-500" },
  withdrawn: { emoji: "🕊️", label: "已撤回", bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-400" },
};

const SIZES = {
  sm: "w-7 h-7 text-sm",
  md: "w-9 h-9 text-lg",
};

/** Stable per-item tilt so stamps look hand-placed but never jitter on re-render. */
export function tiltFor(seed = "") {
  const hash = String(seed).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return (hash % 7) - 3; // -3deg .. +3deg
}

export default function Stamp({ status, size = "md", seed, title }) {
  const stamp = STAMPS[status] || STAMPS.saved;
  return (
    <span
      title={title || stamp.label}
      style={{ transform: `rotate(${tiltFor(seed ?? status)}deg)` }}
      className={clsx(
        "inline-flex items-center justify-center rounded-lg border border-dashed flex-shrink-0 select-none",
        stamp.bg,
        stamp.border,
        SIZES[size]
      )}
    >
      {stamp.emoji}
    </span>
  );
}

export function stampLabel(status) {
  return (STAMPS[status] || STAMPS.saved).label;
}

export function stampTextClass(status) {
  return (STAMPS[status] || STAMPS.saved).text;
}
