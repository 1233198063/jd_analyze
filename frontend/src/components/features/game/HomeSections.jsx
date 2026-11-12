import { Link } from "react-router-dom";
import clsx from "clsx";
import dayjs from "dayjs";
import Icon from "@/components/common/Icon";
import { tiltFor } from "@/components/features/Stamp";
import GrowthPlant from "./GrowthPlant";
import BossAvatar from "./BossAvatar";
import { Hearts, QuestCard, XpBar } from "./QuestParts";

/** Section heading for the home page: a little sticker icon, a title, an optional aside. */
export function SectionTitle({ icon, tone = "bg-petrol-50 text-petrol-600", children, aside }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-base font-semibold text-ink inline-flex items-center gap-2">
        <span className={clsx("flex h-7 w-7 items-center justify-center rounded-lg", tone)}>
          <Icon name={icon} size={17} />
        </span>
        {children}
      </h2>
      {aside && <span className="text-xs text-ink/45">{aside}</span>}
    </div>
  );
}

const EARNED_ICONS = {
  applications: "outgoing_mail",
  "moving forward": "trending_up",
  "showing up after a no": "eco",
  practice: "fitness_center",
  people: "local_cafe",
  skills: "menu_book",
};

const STAT_BUBBLES = [
  { key: "sent", label: "Sent", icon: "outgoing_mail", tone: "bg-petrol-50 text-petrol-600", to: "/tracker" },
  { key: "in_play", label: "In play", icon: "swords", tone: "bg-gold-50 text-gold-700", to: "/tracker" },
  { key: "interviews", label: "Interviews", icon: "forum", tone: "bg-clay-50 text-clay-700", to: "/tracker" },
  { key: "to_apply", label: "To apply", icon: "flag", tone: "bg-bubblegum-50 text-bubblegum-700", href: "#next-targets" },
];

/** The plant in its window, level and XP, and the counters that used to be the stats row. */
export function PlayerCard({ player, stats }) {
  return (
    <div className="card overflow-hidden rounded-2xl">
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr]">
        <div className="relative flex items-end justify-center bg-gradient-to-b from-petrol-50 to-bubblegum-50 pt-6 min-h-[200px]">
          <span className="absolute left-5 top-5 h-8 w-8 rounded-full bg-gold-200/80" />
          <span className="absolute right-6 top-8 h-3 w-12 rounded-full bg-white/80" />
          <span className="absolute right-10 top-6 h-4 w-7 rounded-full bg-white/80" />
          <GrowthPlant stage={player.plant_stage} size={170} />
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-ink/45">Your plant</p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-hand text-5xl leading-none text-petrol-600">Lv {player.level}</span>
                <span className="rounded-full bg-bubblegum-100 px-2.5 py-0.5 text-sm font-medium text-bubblegum-700">
                  {player.title}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink/55">{player.xp.toLocaleString()} XP — everything you do waters it.</p>
              <div className="mt-3 w-72 max-w-full">
                <XpBar player={player} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STAT_BUBBLES.map((s) => {
                const body = (
                  <>
                    <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", s.tone)}>
                      <Icon name={s.icon} size={17} />
                    </span>
                    <span>
                      <span className="block font-hand text-2xl leading-none text-ink/80 tabular-nums">
                        {stats[s.key].toLocaleString()}
                      </span>
                      <span className="block text-[11px] text-ink/50">{s.label}</span>
                    </span>
                  </>
                );
                const cls = "flex items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 hover:border-bubblegum-300";
                return s.href ? (
                  <a key={s.key} href={s.href} className={cls}>{body}</a>
                ) : (
                  <Link key={s.key} to={s.to} className={cls}>{body}</Link>
                );
              })}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {Object.entries(player.earned).map(([k, v]) => (
              <span
                key={k}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs",
                  v ? "border-mist bg-white text-ink/70" : "border-dashed border-mist text-ink/40"
                )}
              >
                <Icon name={EARNED_ICONS[k]} size={14} />
                {k} <span className="font-semibold tabular-nums">{v ? v.toLocaleString() : "—"}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuestBoard({ week }) {
  const cleared = week.quests.filter((q) => q.done >= q.target).length;
  return (
    <section>
      <SectionTitle
        icon="flag"
        tone="bg-sage-50 text-sage-700"
        aside={`${dayjs(week.week_start).format("MMM D")} – ${dayjs(week.week_end).format("MMM D")} · ${
          week.days_left === 0 ? "last day" : `${week.days_left} days left`
        }`}
      >
        This week's quests
        {cleared > 0 && <span className="text-sm font-normal text-sage-600">{cleared}/3 cleared</span>}
      </SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {week.quests.map((q) => (
          <QuestCard key={q.key} quest={q} />
        ))}
      </div>
    </section>
  );
}

const STAGE_LABELS = { oa: "Mini-boss · OA", phone_screen: "Boss · Phone screen", interview: "Boss · Interview", offer: "Treasure · Offer" };

function BossCard({ boss }) {
  const remaining = boss.prep ? 1 - boss.prep.done / Math.max(1, boss.prep.total) : 1;
  return (
    <Link
      to={`/jobs/${boss.job_id}`}
      className="flex items-center gap-4 rounded-2xl border border-mist bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-bubblegum-300"
    >
      <BossAvatar stage={boss.stage} company={boss.company} size={56} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink truncate">{boss.company}</p>
        <p className="text-xs text-ink/50 truncate">{boss.title}</p>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-ink/55">{STAGE_LABELS[boss.stage]}</span>
          <Hearts remaining={remaining} size={14} />
        </div>
        <p className="mt-0.5 text-[11px] text-ink/40">
          {boss.prep ? `${boss.prep.done}/${boss.prep.total} prepared` : boss.stage === "oa" ? "Waiting on results" : "Open it to build the prep checklist"}
        </p>
      </div>
    </Link>
  );
}

export function BossBattles({ bosses }) {
  return (
    <section>
      <SectionTitle icon="swords" tone="bg-gold-50 text-gold-700" aside={bosses.length ? `${bosses.length} in play` : undefined}>
        Boss battles
      </SectionTitle>
      {bosses.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bosses.map((b) => (
            <BossCard key={b.job_id} boss={b} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-mist p-5 text-sm text-ink/50">
          No bosses yet — an OA or interview will show up here.
        </p>
      )}
    </section>
  );
}

// Unlocked stickers cycle through the palette so the wall reads as a collection.
const STICKER_TONES = [
  "bg-bubblegum-100 text-bubblegum-600 border-bubblegum-200",
  "bg-sage-100 text-sage-700 border-sage-200",
  "bg-gold-100 text-gold-700 border-gold-200",
  "bg-plum-100 text-plum-700 border-plum-200",
  "bg-petrol-50 text-petrol-600 border-petrol-200",
  "bg-clay-100 text-clay-700 border-clay-200",
];

export function StickerWall({ achievements }) {
  const unlocked = achievements.filter((a) => a.unlocked_on).length;
  return (
    <section>
      <SectionTitle icon="military_tech" tone="bg-plum-50 text-plum-700" aside={`${unlocked} of ${achievements.length} collected`}>
        Sticker wall
      </SectionTitle>
      <div className="card rounded-2xl p-6 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-x-4 gap-y-6">
        {achievements.map((a, i) => {
          const on = Boolean(a.unlocked_on);
          return (
            <div key={a.key} className="flex flex-col items-center text-center" title={a.how}>
              <span
                style={on ? { transform: `rotate(${tiltFor(a.key) * 2}deg)` } : undefined}
                className={clsx(
                  "flex h-16 w-16 items-center justify-center rounded-full border-2",
                  on ? STICKER_TONES[i % STICKER_TONES.length] + " shadow-sm" : "border-dashed border-mist bg-canvas text-ink/20"
                )}
              >
                <Icon name={on ? a.icon : "lock"} size={28} filled={on} />
              </span>
              <p className={clsx("mt-2 text-xs font-semibold", on ? "text-ink/80" : "text-ink/40")}>{a.title}</p>
              {on ? (
                <p className="font-hand text-base leading-tight text-ink/45">{dayjs(a.unlocked_on).format("MMM D")}</p>
              ) : (
                <p className="text-[11px] leading-snug text-ink/40">{a.how}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SeasonLinks({ seasons }) {
  if (!seasons.length) return null;
  return (
    <section>
      <SectionTitle icon="auto_stories" tone="bg-bubblegum-50 text-bubblegum-700">Season recaps</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {seasons.map((m) => (
          <Link
            key={m}
            to={`/?recap=${m}`}
            className="rounded-full border border-mist bg-white px-4 py-1.5 font-hand text-xl text-petrol-600 hover:border-bubblegum-300"
          >
            {dayjs(`${m}-01`).format("MMMM YYYY")}
          </Link>
        ))}
      </div>
    </section>
  );
}
