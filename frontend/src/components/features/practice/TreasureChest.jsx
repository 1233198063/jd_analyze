/** A chapter's treasure chest: shut until every quest in the chapter is cleared, then open and sparkling. */
export default function TreasureChest({ open = false, size = 64 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={open ? "" : "animate-bob"}>
      <ellipse cx="32" cy="58" rx="20" ry="3" className="fill-ink/10" />
      {/* box */}
      <rect x="12" y="30" width="40" height="24" rx="4" className="fill-clay-400" />
      <rect x="12" y="30" width="40" height="5" className="fill-clay-500" />
      <rect x="29" y="30" width="6" height="24" className="fill-gold-300" />
      {open ? (
        <>
          {/* lid tipped back, treasure showing */}
          <path d="M12 30 L16 14 Q32 8 48 14 L52 30 Z" className="fill-clay-300" />
          <circle cx="24" cy="29" r="4" className="fill-gold-300" />
          <circle cx="32" cy="27" r="4.5" className="fill-gold-400" />
          <circle cx="40" cy="29" r="4" className="fill-gold-300" />
          <path d="M32 4 L33.5 8.5 L38 10 L33.5 11.5 L32 16 L30.5 11.5 L26 10 L30.5 8.5 Z" className="fill-bubblegum-300" />
          <path d="M50 8 L51 11 L54 12 L51 13 L50 16 L49 13 L46 12 L49 11 Z" className="fill-gold-300" />
        </>
      ) : (
        <>
          <path d="M12 30 Q12 18 32 18 Q52 18 52 30 Z" className="fill-clay-400" />
          <path d="M29 18.3 h6 V30 h-6 Z" className="fill-gold-300" />
          <rect x="28" y="27" width="8" height="8" rx="2" className="fill-gold-400" />
          <circle cx="32" cy="31" r="1.4" className="fill-clay-500" />
        </>
      )}
    </svg>
  );
}
