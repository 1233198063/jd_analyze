import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import dayjs from "dayjs";
import { practiceApi } from "@/api/practice";
import { gameApi } from "@/api/game";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import GrowthPlant from "@/components/features/game/GrowthPlant";
import { CheckInForm } from "@/components/features/practice/PracticeItems";
import QuestSheet from "@/components/features/practice/QuestSheet";
import TreasureChest from "@/components/features/practice/TreasureChest";
import { TRACK_STYLE } from "@/utils/practice";

// The path snakes left and right like a board-game trail.
const SWAY = [0, 56, 88, 56, 0, -56, -88, -56];

function readModule() {
  try {
    return localStorage.getItem("practice-module");
  } catch {
    return null;
  }
}

function HudPill({ icon, iconClass, value, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-mist bg-white px-3 py-1.5 shadow-sm" title={label}>
      <Icon name={icon} size={20} filled className={iconClass} />
      <span className="font-hand text-2xl leading-none text-ink/80 tabular-nums">{value}</span>
      <span className="hidden sm:inline text-[11px] text-ink/45">{label}</span>
    </span>
  );
}

/** A world (module) button with a progress ring around its icon. */
function WorldCard({ module, active, onClick }) {
  const style = TRACK_STYLE[module.key];
  const pct = module.quests.length ? module.cleared / module.quests.length : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex flex-col items-center rounded-3xl border-2 px-3 py-3 transition-all",
        active ? clsx("bg-white shadow-lg -translate-y-1", style.border) : "border-transparent bg-white/60 hover:bg-white"
      )}
    >
      <span className="relative flex h-14 w-14 items-center justify-center">
        <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
          <circle cx="26" cy="26" r={r} strokeWidth="4" className="stroke-petrol-50" fill="none" />
          <circle
            cx="26" cy="26" r={r} strokeWidth="4" fill="none" strokeLinecap="round"
            className={style.stroke}
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          />
        </svg>
        <span className={clsx("flex h-10 w-10 items-center justify-center rounded-full", style.soft, style.text)}>
          <Icon name={module.icon} size={22} />
        </span>
      </span>
      <span className="mt-1.5 text-xs font-semibold text-ink text-center leading-tight">{module.title}</span>
      <span className="text-[11px] text-ink/45">{module.cleared}/{module.quests.length}</span>
    </button>
  );
}

function QuestNode({ quest, offset, suggested, plantStage, onOpen }) {
  const style = TRACK_STYLE[quest.track];
  const cleared = Boolean(quest.cleared_on);
  const icon = quest.track === "leetcode" ? "data_object" : style.icon;
  return (
    <div className="relative flex flex-col items-center" style={{ transform: `translateX(${offset}px)` }}>
      {suggested && (
        <>
          <span className="animate-bob absolute -top-9 rounded-xl border-2 border-bubblegum-300 bg-white px-3 py-0.5 text-xs font-bold tracking-wider text-bubblegum-600 shadow-sm">
            START
          </span>
          <span className={clsx("absolute top-0 hidden sm:flex items-end gap-1", offset > 0 ? "right-full mr-4" : "left-full ml-4")}>
            <GrowthPlant stage={plantStage} size={64} />
            <span className="-ml-3 mb-12 whitespace-nowrap rounded-2xl rounded-bl-none bg-white px-2.5 py-1 text-[11px] text-ink/70 shadow-sm border border-mist">
              Try this one!
            </span>
          </span>
        </>
      )}
      <button
        onClick={onOpen}
        title={quest.title}
        className={clsx(
          "relative flex items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 active:translate-y-1",
          suggested ? "h-[76px] w-[76px]" : "h-[66px] w-[66px]",
          cleared
            ? clsx(style.bar, style.edge, "text-white")
            : clsx("bg-white border-4 shadow-[0_6px_0_0_#cfdcdc] active:shadow-[0_2px_0_0_#cfdcdc]", style.node, style.text)
        )}
      >
        {suggested && <span className="pointer-events-none absolute -inset-1 rounded-full animate-ring-pulse" />}
        <Icon name={cleared ? "check" : icon} size={cleared ? 32 : 28} weight={cleared ? 700 : 500} />
        {quest.explained && (
          <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold-300 shadow">
            <Icon name="star" size={15} filled className="text-white" />
          </span>
        )}
      </button>
      <span className="mt-2.5 max-w-[150px] text-center text-xs font-medium text-ink/75 leading-tight line-clamp-2">
        {quest.number ? `#${quest.number} ` : ""}
        {quest.title}
      </span>
      <span className={clsx("mt-0.5 inline-flex items-center gap-0.5 text-[11px]", cleared ? "text-sage-600" : "text-gold-700")}>
        <Icon name="monetization_on" size={13} filled className={cleared ? "text-sage-500" : "text-gold-400"} />
        {cleared ? `+${quest.earned}` : quest.points}
      </span>
    </div>
  );
}

function ChapterBanner({ index, chapter, style }) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 rounded-3xl border-2 px-5 py-3", style.soft, style.border)}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-widest text-ink/45">Chapter {index + 1}</p>
        <p className="font-hand text-2xl leading-tight text-ink/80 truncate">{chapter.name}</p>
      </div>
      <span className="text-right text-xs text-ink/55 whitespace-nowrap">
        <span className="font-hand text-xl text-ink/75">{chapter.cleared}/{chapter.total}</span>
        <br />
        chest +{chapter.chest.bonus}
      </span>
    </div>
  );
}

function ChestNode({ chapter, offset }) {
  const open = Boolean(chapter.chest.opened_on);
  return (
    <div className="flex flex-col items-center" style={{ transform: `translateX(${offset}px)` }}>
      <TreasureChest open={open} size={72} />
      <span className={clsx("text-[11px] font-medium", open ? "text-gold-700" : "text-ink/45")}>
        {open ? `+${chapter.chest.bonus} · opened ${dayjs(chapter.chest.opened_on).format("MMM D")}` : `Clear all ${chapter.total} for +${chapter.chest.bonus}`}
      </span>
    </div>
  );
}

const FREE_TRACKS = [
  ["leetcode", "LeetCode"],
  ["react", "React / JS"],
  ["system_design", "System design"],
  ["project", "Project story"],
  ["english", "English"],
];

function SideQuest({ free, onClear, pending }) {
  const [title, setTitle] = useState("");
  const [track, setTrack] = useState("leetcode");
  return (
    <div className="rounded-3xl border-2 border-dashed border-mist bg-white p-4">
      <p className="text-sm font-semibold text-ink inline-flex items-center gap-1.5">
        <Icon name="explore" size={18} className="text-clay-600" /> Side quest
      </p>
      <p className="text-[11px] text-ink/45 mb-2">
        Practiced something not on the map? +{free.points[0]} coins (+{free.points[1]} out loud) · {free.sessions} logged
      </p>
      <input className="input mb-2 py-1 text-xs" placeholder="What did you practice?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <select className="input mb-2 py-1 text-xs" value={track} onChange={(e) => setTrack(e.target.value)}>
        {FREE_TRACKS.map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
      <CheckInForm
        defaultMinutes={30}
        barLabel="Did what I aimed for"
        pending={pending}
        disabled={!title.trim()}
        submitLabel={`Log +${free.points[0]}`}
        onSubmit={(form) => onClear({ track, title: title.trim().slice(0, 200), ...form }, () => setTitle(""))}
      />
    </div>
  );
}

/**
 * Training grounds: practice as a board-game trail. Each module is a world, each chapter a stretch
 * of path ending in a treasure chest, each quest a node worth coins (more if said out loud). Nothing
 * is locked and nothing is due — the START marker just suggests the next open one.
 */
export default function Practice() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: board, isLoading } = useQuery({ queryKey: ["practice", "quests"], queryFn: practiceApi.quests });
  const { data: game } = useQuery({ queryKey: ["game"], queryFn: gameApi.overview });
  const [openKey, setOpenKey] = useState(null);
  const [toast, setToast] = useState(null);
  const chestsSeen = useRef(null);

  const moduleKey = params.get("module") || readModule() || "leetcode";
  useEffect(() => {
    try {
      localStorage.setItem("practice-module", moduleKey);
    } catch {
      // best-effort
    }
  }, [moduleKey]);

  // A chest that opens after a clear gets its own little moment.
  useEffect(() => {
    if (!board) return;
    const opened = new Set(board.modules.flatMap((m) => m.chapters.filter((c) => c.chest.opened_on).map((c) => `${m.key}:${c.name}`)));
    if (chestsSeen.current) {
      const fresh = [...opened].filter((k) => !chestsSeen.current.has(k));
      if (fresh.length) {
        setToast(`Chest opened: ${fresh[0].split(":").slice(1).join(":")} · +50 coins`);
        setTimeout(() => setToast(null), 3500);
      }
    }
    chestsSeen.current = opened;
  }, [board]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["practice"] });
    qc.invalidateQueries({ queryKey: ["game"] });
    qc.invalidateQueries({ queryKey: ["daily"] });
  };
  const log = useMutation({
    mutationFn: ({ payload }) => practiceApi.log(payload),
    onSuccess: (_, v) => {
      v.done?.();
      refresh();
    },
  });
  const undo = useMutation({
    mutationFn: (ids) => Promise.all(ids.map((id) => practiceApi.deleteLog(id))),
    onSuccess: () => {
      setOpenKey(null);
      refresh();
    },
  });
  const clear = (payload, done) => log.mutate({ payload, done });

  if (isLoading || !board) return <PageLoader message="Unrolling the map..." />;

  const mod = board.modules.find((m) => m.key === moduleKey) || board.modules[0];
  const style = TRACK_STYLE[mod.key];
  const suggestedKey = mod.quests.find((q) => !q.cleared_on)?.key;
  const openQuest = openKey && board.modules.flatMap((m) => m.quests).find((q) => q.key === openKey);
  const openModule = openQuest && board.modules.find((m) => m.key === openQuest.track);
  const plantStage = game?.player.plant_stage ?? 0;

  let step = 0;
  return (
    <div className="space-y-6">
      {/* HUD */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Training grounds</h1>
          <p className="text-sm text-ink/55 mt-0.5">Tap any quest on the map. Coins for every clear, stars for saying it out loud.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <HudPill icon="monetization_on" iconClass="text-gold-400" value={board.points.toLocaleString()} label="coins" />
          <HudPill icon="star" iconClass="text-plum-400" value={board.stars} label="stars" />
          <HudPill icon="redeem" iconClass="text-clay-500" value={`${board.chests.opened}/${board.chests.total}`} label="chests" />
          <HudPill icon="flag" iconClass="text-sage-500" value={`${board.cleared}/${board.total}`} label="quests" />
        </div>
      </div>

      {/* worlds */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {board.modules.map((m) => (
          <WorldCard key={m.key} module={m} active={m.key === mod.key} onClick={() => setParams({ module: m.key })} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* the trail */}
        <div className="overflow-x-clip rounded-[2rem] bg-gradient-to-b from-white/70 to-petrol-50/50 border border-mist px-4 py-6 space-y-6">
          <p className="text-center text-sm text-ink/55 max-w-md mx-auto">{mod.goal}</p>
          {mod.chapters.map((chapter, ci) => (
            <section key={chapter.name} className="space-y-8">
              <ChapterBanner index={ci} chapter={chapter} style={style} />
              <div className="flex flex-col items-center gap-9 pt-6">
                {mod.quests
                  .filter((q) => q.chapter === chapter.name)
                  .map((q) => (
                    <QuestNode
                      key={q.key}
                      quest={q}
                      offset={SWAY[step++ % SWAY.length]}
                      suggested={q.key === suggestedKey}
                      plantStage={plantStage}
                      onOpen={() => setOpenKey(q.key)}
                    />
                  ))}
                <ChestNode chapter={chapter} offset={SWAY[step++ % SWAY.length]} />
              </div>
            </section>
          ))}
        </div>

        {/* side column */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-3xl border border-mist bg-white p-4">
            <p className="text-sm font-semibold text-ink inline-flex items-center gap-1.5 mb-2">
              <Icon name="menu_book" size={18} className="text-petrol-500" /> Quest log
            </p>
            {board.recent.length ? (
              <ul className="space-y-1.5 text-xs">
                {board.recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Icon name={TRACK_STYLE[r.track]?.icon || "check"} size={15} className="text-ink/35" />
                    <span className="truncate text-ink/70">{r.title}</span>
                    {r.explained_aloud && <Icon name="star" size={13} filled className="text-plum-400" />}
                    <span className="ml-auto text-gold-700 tabular-nums">+{r.points}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink/45">Nothing cleared yet. The START marker is a fine first stop.</p>
            )}
          </div>
          <SideQuest free={board.free} onClear={clear} pending={log.isPending} />
          <div className="rounded-3xl bg-white/60 border border-mist p-4 text-[11px] text-ink/55 space-y-1">
            <p className="font-semibold text-ink/70 text-xs mb-1">Coin guide</p>
            <p>LeetCode easy / medium / hard · 10 / 20 / 35</p>
            <p>React build · system design · 30</p>
            <p>Project deep-dive · 40 · English · 25</p>
            <p>Said out loud · a star and bonus coins</p>
            <p>Clear a chapter · its chest, +50</p>
            <p className="text-ink/40 pt-1">Coins also water your plant on the home page.</p>
          </div>
        </div>
      </div>

      {openQuest && (
        <QuestSheet
          quest={openQuest}
          moduleTitle={openModule?.title}
          onClose={() => setOpenKey(null)}
          onClear={clear}
          onUndo={(ids) => undo.mutate(ids)}
          pending={log.isPending || undo.isPending}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="animate-pop-in flex items-center gap-3 rounded-2xl border border-gold-200 bg-white px-5 py-3 shadow-xl">
            <TreasureChest open size={40} />
            <span className="text-sm font-semibold text-gold-700">{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
