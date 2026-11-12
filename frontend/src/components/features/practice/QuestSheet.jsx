import { useEffect, useState } from "react";
import clsx from "clsx";
import dayjs from "dayjs";
import Icon from "@/components/common/Icon";
import { ClearStamp } from "@/components/features/game/QuestParts";
import { TRACK_STYLE } from "@/utils/practice";
import { CheckInForm, SayItOutLoud } from "./PracticeItems";

const STARS = { easy: 1, medium: 2, hard: 3 };
const CONFETTI = ["bg-bubblegum-300", "bg-gold-300", "bg-sage-300", "bg-plum-300", "bg-petrol-300", "bg-clay-300"];

/** Coins rising and confetti bursting over the sheet for a moment after a clear. */
function Celebration({ points }) {
  const pieces = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 90 + (i % 3) * 30;
    return {
      cls: CONFETTI[i % CONFETTI.length],
      style: {
        "--dx": `${Math.cos(angle) * dist}px`,
        "--dy": `${Math.sin(angle) * dist - 30}px`,
        "--rot": `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
        animationDelay: `${(i % 4) * 30}ms`,
      },
    };
  });
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
      {pieces.map((p, i) => (
        <span key={i} style={p.style} className={clsx("animate-confetti absolute h-2.5 w-1.5 rounded-sm", p.cls)} />
      ))}
      <span className="animate-coin-rise inline-flex items-center gap-1 rounded-full bg-gold-100 px-4 py-2 shadow-lg">
        <Icon name="monetization_on" size={26} filled className="text-gold-500" />
        <span className="font-hand text-4xl leading-none text-gold-700">+{points}</span>
      </span>
    </div>
  );
}

/**
 * The mission briefing a node opens: difficulty, reward, what to do and what to say, and the
 * one-row check-in that clears it.
 */
export default function QuestSheet({ quest, moduleTitle, onClose, onClear, onUndo, pending }) {
  const style = TRACK_STYLE[quest.track];
  const cleared = Boolean(quest.cleared_on);
  const [celebrate, setCelebrate] = useState(null);
  const [redo, setRedo] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (form) => {
    // What this log adds, by the same rule as the backend: a quest pays once, plus its bonus the
    // first time it's said out loud.
    const paid = cleared
      ? form.explained_aloud && !quest.explained ? quest.bonus : 0
      : quest.points + (form.explained_aloud ? quest.bonus : 0);
    onClear(
      { track: quest.track, title: quest.title.slice(0, 200), item_key: quest.key, difficulty: quest.difficulty || null, ...form },
      () => {
        setCelebrate(paid);
        setRedo(false);
        setTimeout(() => setCelebrate(null), 1400);
      }
    );
  };

  const label = quest.number ? `#${quest.number} ${quest.title}` : quest.title;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {celebrate != null && <Celebration points={celebrate} />}

        <div className={clsx("flex items-center gap-3 px-6 py-4", style.soft)}>
          <span className={clsx("flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm", style.text)}>
            <Icon name={style.icon} size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-ink/50">{moduleTitle}</p>
            <p className="font-hand text-2xl leading-tight text-ink/80 truncate">{quest.chapter}</p>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink" aria-label="Close">
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              {quest.url ? (
                <a href={quest.url} target="_blank" rel="noopener noreferrer" className="text-lg font-bold text-ink hover:text-petrol-600 hover:underline">
                  {label} <Icon name="open_in_new" size={15} />
                </a>
              ) : (
                <p className="text-lg font-bold text-ink">{label}</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-xs text-ink/55">
                {quest.difficulty && (
                  <span className="inline-flex" title={quest.difficulty}>
                    {[1, 2, 3].map((n) => (
                      <Icon key={n} name="star" size={16} filled={n <= STARS[quest.difficulty]} className={n <= STARS[quest.difficulty] ? "text-gold-400" : "text-ink/15"} />
                    ))}
                  </span>
                )}
                {quest.topic && <span>{quest.topic}</span>}
                {quest.minutes && <span>~{quest.minutes} min</span>}
              </div>
            </div>
            {cleared && <ClearStamp className="mt-1" />}
          </div>

          {/* rewards */}
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-2xl bg-gold-50 px-3 py-2">
              <Icon name="monetization_on" size={20} filled className="text-gold-500" />
              <span className="font-hand text-2xl leading-none text-gold-700">{quest.points}</span>
              <span className="text-xs text-ink/50">coins</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-2xl bg-plum-50 px-3 py-2">
              <Icon name="star" size={20} filled className="text-plum-400" />
              <span className="font-hand text-2xl leading-none text-plum-700">+{quest.bonus}</span>
              <span className="text-xs text-ink/50">say it out loud</span>
            </span>
          </div>

          {quest.brief && <p className="text-sm text-ink/75">{quest.brief}</p>}
          {quest.say && <SayItOutLoud text={quest.say} />}
          {quest.bar && (
            <p className="text-xs text-ink/50 inline-flex items-center gap-1">
              <Icon name="flag" size={14} /> Cleared when: {quest.bar}
            </p>
          )}

          {cleared && !redo ? (
            <div className="rounded-2xl bg-sage-50 border border-sage-200 px-4 py-3 text-sm text-sage-700 flex items-center justify-between gap-3">
              <span>
                Earned <b>{quest.earned}</b> coins · <span className="font-hand text-lg">{dayjs(quest.cleared_on).format("MMM D")}</span>
              </span>
              <span className="flex items-center gap-3 text-xs">
                {!quest.explained && (
                  <button className="text-plum-600 hover:underline" onClick={() => setRedo(true)}>
                    Redo out loud for +{quest.bonus}
                  </button>
                )}
                <button className="text-ink/40 hover:text-coral-600" disabled={pending} onClick={() => onUndo(quest.log_ids)}>
                  Undo
                </button>
              </span>
            </div>
          ) : (
            <div className="rounded-2xl border border-mist p-4">
              <CheckInForm
                defaultMinutes={quest.minutes || 30}
                barLabel={quest.bar ? "Hit the bar" : "Did what I aimed for"}
                onSubmit={submit}
                pending={pending}
                submitLabel={cleared ? `Log out loud · +${quest.bonus}` : `Clear! +${quest.points}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
