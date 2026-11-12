import clsx from "clsx";

// A boss's look follows how far the application got: OA bosses are small, interview bosses grow horns.
const LOOKS = {
  oa: { body: "fill-gold-300", horn: "fill-gold-400", size: 0.82 },
  phone_screen: { body: "fill-clay-300", horn: "fill-clay-400", size: 0.92 },
  interview: { body: "fill-plum-300", horn: "fill-plum-400", size: 1 },
  offer: { body: "fill-sage-300", horn: "fill-sage-400", size: 1 },
};

/** A small round monster carrying the company's initial. Purely decorative. */
export default function BossAvatar({ stage = "oa", company = "?", size = 64, className }) {
  const look = LOOKS[stage] || LOOKS.oa;
  const s = look.size;
  const initial = (company.trim()[0] || "?").toUpperCase();
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={clsx("animate-bob", className)} aria-hidden="true">
      <g transform={`translate(32 36) scale(${s}) translate(-32 -36)`}>
        {(stage === "interview" || stage === "phone_screen") && (
          <>
            <path d="M18 18 L22 8 L27 17 Z" className={look.horn} />
            <path d="M46 18 L42 8 L37 17 Z" className={look.horn} />
          </>
        )}
        {stage === "offer" && <path d="M22 14 L26 7 L32 12 L38 7 L42 14 Z" className="fill-gold-400" />}
        <path d="M10 40 Q10 14 32 14 Q54 14 54 40 Q54 56 44 56 L41 52 L37 56 L32 52 L27 56 L23 52 L20 56 Q10 56 10 40 Z" className={look.body} />
        <circle cx="24" cy="32" r="5" className="fill-white" />
        <circle cx="40" cy="32" r="5" className="fill-white" />
        <circle cx="25" cy="33" r="2.4" className="fill-ink" />
        <circle cx="41" cy="33" r="2.4" className="fill-ink" />
        <ellipse cx="18" cy="40" rx="3" ry="1.8" className="fill-bubblegum-300" />
        <ellipse cx="46" cy="40" rx="3" ry="1.8" className="fill-bubblegum-300" />
        <text x="32" y="47.5" textAnchor="middle" fontSize="9" fontWeight="700" className="fill-ink/70">
          {initial}
        </text>
      </g>
    </svg>
  );
}
