import { Link } from "react-router-dom";
import clsx from "clsx";
import Icon from "@/components/common/Icon";

// Weekly quests: what each one counts and where you go to do it. Targets come from the backend.
export const QUESTS = {
  applications: {
    label: "Send applications",
    icon: "outgoing_mail",
    to: "/tracker",
    xp: "+10 XP each",
    dot: "bg-petrol-500",
    sticker: "bg-petrol-50 text-petrol-600",
  },
  explained: {
    label: "Clear quests out loud",
    icon: "record_voice_over",
    to: "/practice",
    xp: "each quest's points + its bonus",
    dot: "bg-plum-400",
    sticker: "bg-plum-50 text-plum-600",
  },
  chats: {
    label: "Have coffee chats",
    icon: "local_cafe",
    to: "/network",
    xp: "+30 XP each",
    dot: "bg-clay-400",
    sticker: "bg-clay-50 text-clay-600",
  },
};

/** Progress as collectible dots (up to 12), so each action fills one in; a bar beyond that. */
export function Pips({ done, target, dot, small = false }) {
  if (target > 12) {
    return (
      <div className="h-2 flex-1 rounded-full bg-petrol-50 overflow-hidden">
        <div className={clsx("h-full rounded-full", dot)} style={{ width: `${Math.min(100, (done / target) * 100)}%` }} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: target }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "rounded-full transition-colors",
            small ? "h-2 w-2" : "h-3 w-3",
            i < done ? dot : "bg-petrol-50 ring-1 ring-inset ring-mist"
          )}
        />
      ))}
    </div>
  );
}

/** The rubber stamp a finished quest gets. */
export function ClearStamp({ className }) {
  return (
    <span
      className={clsx(
        "animate-stamp inline-flex items-center gap-1 rounded-md border-2 border-dashed border-sage-400 bg-sage-50/90",
        "px-2 py-0.5 text-xs font-bold tracking-widest text-sage-600",
        className
      )}
    >
      <Icon name="check" size={13} weight={700} /> CLEAR
    </span>
  );
}

export function QuestCard({ quest }) {
  const meta = QUESTS[quest.key];
  const cleared = quest.done >= quest.target;
  return (
    <Link
      to={meta.to}
      className={clsx(
        "relative block rounded-2xl border bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
        cleared ? "border-sage-200" : "border-mist hover:border-bubblegum-300"
      )}
    >
      {cleared && <ClearStamp className="absolute right-3 top-3" />}
      <div className="flex items-center gap-3">
        <span className={clsx("flex h-11 w-11 items-center justify-center rounded-xl", meta.sticker)}>
          <Icon name={meta.icon} size={22} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{meta.label}</p>
          <p className="text-xs text-ink/45">{meta.xp}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <Pips done={quest.done} target={quest.target} dot={meta.dot} />
        </div>
        <span className="font-hand text-2xl leading-none text-ink/70 tabular-nums">
          {quest.done}/{quest.target}
        </span>
      </div>
      {quest.done > quest.target && (
        <p className="mt-2 text-xs text-sage-600">+{quest.done - quest.target} bonus this week</p>
      )}
    </Link>
  );
}

/** Hearts for a boss's HP: five, emptying as the prep checklist gets ticked off. */
export function Hearts({ remaining, size = 16 }) {
  const full = Math.max(0, Math.min(5, Math.ceil(remaining * 5)));
  return (
    <span className="inline-flex gap-0.5" aria-label={`${full} of 5 hearts left`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Icon key={i} name="favorite" size={size} filled={i < full} className={i < full ? "text-coral-400" : "text-ink/15"} />
      ))}
    </span>
  );
}

/** Level progress: how far into the current level, with XP left to the next. */
export function XpBar({ player, thin = false }) {
  const span = player.next_level_xp - player.level_start_xp;
  const into = player.xp - player.level_start_xp;
  return (
    <div>
      <div className={clsx("rounded-full bg-petrol-50 overflow-hidden ring-1 ring-inset ring-mist", thin ? "h-2" : "h-3")}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-petrol-400 to-bubblegum-300"
          style={{ width: `${Math.max(4, (into / span) * 100)}%` }}
        />
      </div>
      <p className={clsx("mt-1 text-ink/50", thin ? "text-[11px]" : "text-xs")}>
        {player.next_level_xp - player.xp} XP to Lv {player.level + 1}
      </p>
    </div>
  );
}
