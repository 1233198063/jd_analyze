/**
 * A potted plant that grows with the player's level — stage 0 (Seed) to 5 (Forest Keeper), the
 * same steps as game_service.TITLES. Drawn in the app palette; it sways gently unless the OS
 * asks for reduced motion.
 */
function Leaf({ x, y, angle, size = 1, className = "fill-sage-400" }) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={9 * size}
      ry={4.5 * size}
      transform={`rotate(${angle} ${x} ${y})`}
      className={className}
    />
  );
}

function Flower({ x, y, r = 5 }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle
          key={a}
          cx={x + Math.cos((a * Math.PI) / 180) * r}
          cy={y + Math.sin((a * Math.PI) / 180) * r}
          r={r * 0.8}
          className="fill-bubblegum-300"
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.6} className="fill-gold-300" />
    </g>
  );
}

function Canopy({ cx, cy, r }) {
  return (
    <g>
      <circle cx={cx - r * 0.55} cy={cy + r * 0.15} r={r * 0.7} className="fill-sage-400" />
      <circle cx={cx + r * 0.55} cy={cy + r * 0.15} r={r * 0.7} className="fill-sage-400" />
      <circle cx={cx} cy={cy - r * 0.25} r={r * 0.8} className="fill-sage-300" />
    </g>
  );
}

function Plant({ stage }) {
  switch (stage) {
    case 0: // Seed
      return <ellipse cx="60" cy="72.5" rx="4.5" ry="3.2" className="fill-clay-500" />; // peeks over the rim
    case 1: // Sprout
      return (
        <g className="animate-sway">
          <path d="M60 80 Q60 70 60 62" strokeWidth="3" strokeLinecap="round" className="stroke-sage-500" fill="none" />
          <Leaf x={53} y={62} angle={-25} size={0.8} />
          <Leaf x={67} y={62} angle={25} size={0.8} className="fill-sage-300" />
        </g>
      );
    case 2: // Sapling
      return (
        <g className="animate-sway">
          <path d="M60 80 Q58 62 60 44" strokeWidth="3.5" strokeLinecap="round" className="stroke-sage-500" fill="none" />
          <Leaf x={51} y={66} angle={-25} />
          <Leaf x={69} y={60} angle={25} className="fill-sage-300" />
          <Leaf x={52} y={50} angle={-30} size={0.85} className="fill-sage-300" />
          <Leaf x={67} y={44} angle={30} size={0.85} />
        </g>
      );
    case 3: // Blossom
      return (
        <g className="animate-sway">
          <path d="M60 80 Q57 60 60 38" strokeWidth="3.5" strokeLinecap="round" className="stroke-sage-500" fill="none" />
          <Leaf x={50} y={68} angle={-25} />
          <Leaf x={70} y={62} angle={25} className="fill-sage-300" />
          <Leaf x={51} y={52} angle={-30} size={0.9} className="fill-sage-300" />
          <Leaf x={69} y={48} angle={30} size={0.9} />
          <Flower x={60} y={33} r={6} />
        </g>
      );
    case 4: // Fruit Tree
      return (
        <g className="animate-sway">
          <path d="M60 80 L60 46" strokeWidth="5" strokeLinecap="round" className="stroke-clay-500" fill="none" />
          <Canopy cx={60} cy={38} r={22} />
          <circle cx="50" cy="42" r="3.5" className="fill-coral-400" />
          <circle cx="68" cy="36" r="3.5" className="fill-gold-400" />
          <circle cx="62" cy="48" r="3.5" className="fill-coral-400" />
        </g>
      );
    default: // Forest Keeper
      return (
        <g>
          <g className="animate-sway">
            <path d="M54 80 L54 46" strokeWidth="5" strokeLinecap="round" className="stroke-clay-500" fill="none" />
            <Canopy cx={54} cy={38} r={20} />
            <Flower x={46} y={34} r={3.5} />
            <Flower x={62} y={40} r={3.5} />
          </g>
          <path d="M80 80 L80 62" strokeWidth="3.5" strokeLinecap="round" className="stroke-clay-500" fill="none" />
          <Canopy cx={80} cy={56} r={11} />
        </g>
      );
  }
}

export default function GrowthPlant({ stage = 0, size = 120, className }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={className} role="img" aria-label="Your plant">
      <ellipse cx="60" cy="112" rx="30" ry="4" className="fill-ink/10" />
      <Plant stage={stage} />
      {/* pot */}
      <path d="M38 80 H82 L77 108 Q76 111 73 111 H47 Q44 111 43 108 Z" className="fill-clay-300" />
      <rect x="35" y="76" width="50" height="9" rx="3" className="fill-clay-400" />
      <ellipse cx="60" cy="80" rx="21" ry="2.5" className="fill-ink/25" />
      <circle cx="52" cy="95" r="1.6" className="fill-bubblegum-200" />
      <circle cx="68" cy="95" r="1.6" className="fill-bubblegum-200" />
      <path d="M57 99 Q60 101.5 63 99" strokeWidth="1.4" strokeLinecap="round" className="stroke-ink/40" fill="none" />
    </svg>
  );
}
