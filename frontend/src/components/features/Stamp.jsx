import clsx from "clsx";
import Icon from "@/components/common/Icon";

/**
 * Journal-style rubber stamps for application milestones.
 * Rejection deliberately gets a soft "eco" leaf mark rather than a cross —
 * the tracker is read most often on bad days.
 */
export const STAMPS = {
  saved: { icon: "bookmark", label: "Saved", bg: "bg-petrol-50", border: "border-petrol-200", text: "text-ink/55" },
  applied: { icon: "outgoing_mail", label: "Applied", bg: "bg-petrol-50", border: "border-petrol-200", text: "text-petrol-500" },
  referral_asked: { icon: "handshake", label: "Referral", bg: "bg-plum-50", border: "border-plum-300", text: "text-plum-600" },
  oa: { icon: "edit_note", label: "OA", bg: "bg-gold-50", border: "border-gold-300", text: "text-gold-600" },
  phone_screen: { icon: "call", label: "Phone Screen", bg: "bg-gold-50", border: "border-gold-300", text: "text-gold-600" },
  interview: { icon: "forum", label: "Interview", bg: "bg-clay-50", border: "border-clay-300", text: "text-clay-600" },
  offer: { icon: "celebration", label: "Offer", bg: "bg-sage-50", border: "border-sage-300", text: "text-sage-600" },
  rejected: { icon: "eco", label: "Not This Time", bg: "bg-coral-50", border: "border-coral-200", text: "text-coral-500" },
  withdrawn: { icon: "air", label: "Withdrawn", bg: "bg-canvas", border: "border-mist", text: "text-ink/40" },
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
      <Icon name={stamp.icon} size={size === "sm" ? 15 : 18} className={stamp.text} />
    </span>
  );
}

export function stampLabel(status) {
  return (STAMPS[status] || STAMPS.saved).label;
}

export function stampTextClass(status) {
  return (STAMPS[status] || STAMPS.saved).text;
}
