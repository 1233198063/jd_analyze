import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { jobsApi } from "@/api/jobs";
import { gameApi } from "@/api/game";
import { sourcesApi } from "@/api/sources";
import { profileApi } from "@/api/profile";
import { practiceApi } from "@/api/practice";
import JobCard from "@/components/features/JobCard";
import SeasonRecap from "@/components/features/SeasonRecap";
import {
  BossBattles,
  PlayerCard,
  QuestBoard,
  SeasonLinks,
  SectionTitle,
  StickerWall,
} from "@/components/features/game/HomeSections";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import { TRACK_STYLE } from "@/utils/practice";

// Search phrases and location come from the user's profile (backend/profile.json).
function buildSources(phrases, location) {
  const query = phrases.map((k) => `"${k}"`).join(" OR ");
  const googleSiteSearch = (site) =>
    `https://www.google.com/search?q=${encodeURIComponent(`site:${site} (${query}) ${location}`)}`;
  return {
    urlSources: [
      { label: "Greenhouse", href: googleSiteSearch("boards.greenhouse.io") },
      { label: "Lever", href: googleSiteSearch("jobs.lever.co") },
      { label: "Ashby", href: googleSiteSearch("jobs.ashbyhq.com") },
      { label: "Workday", href: googleSiteSearch("myworkdayjobs.com") },
      {
        label: "Company career page",
        href: `https://www.google.com/search?q=${encodeURIComponent(`(${query}) ${location} careers`)}&ibp=htl;jobs`,
      },
    ],
    textOnlySources: [
      {
        label: "LinkedIn",
        href: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`(${query})`)}&location=${encodeURIComponent(location)}`,
      },
      {
        label: "Indeed",
        href: `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}`,
      },
    ],
  };
}

// The school's job portal from the profile. It sits behind the school's sign-in, so the app can't
// fetch or discover anything there — the card links out and remembers when it was last opened,
// nudging once it's been a few days.
const PORTAL_KEY = "career_portal";
const PORTAL_CHECK_EVERY_DAYS = 3;

function SourcePill({ label, href, onOpen }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-mist bg-white text-ink/80 hover:border-bubblegum-400 hover:text-ink transition-colors"
    >
      {label}
      <Icon name="open_in_new" size={13} />
    </a>
  );
}

function SchoolPortal({ portal }) {
  const qc = useQueryClient();
  const { data: checks } = useQuery({ queryKey: ["source-checks"], queryFn: sourcesApi.checks });
  const record = useMutation({
    mutationFn: () => sourcesApi.recordCheck(PORTAL_KEY),
    onSuccess: (row) => qc.setQueryData(["source-checks"], (old) => ({ ...old, ...row })),
  });

  const last = checks?.[PORTAL_KEY];
  const days = last ? dayjs().startOf("day").diff(dayjs(last).startOf("day"), "day") : null;
  const due = checks && (days == null || days >= PORTAL_CHECK_EVERY_DAYS);
  const opened =
    days == null ? "Not opened from here yet" : days === 0 ? "Opened today" : `Last opened ${days} day${days === 1 ? "" : "s"} ago`;

  return (
    <div>
      <p className="text-xs text-ink/50 mb-1.5 inline-flex items-center gap-1">
        <Icon name="school" size={13} className="text-petrol-500" />
        School career portal — sign in with your school account, then paste the job text into "Analyze JD"
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SourcePill label={portal.label} href={portal.url} onOpen={() => record.mutate()} />
        {checks && (
          <span className={due ? "text-xs text-gold-700 inline-flex items-center gap-1" : "text-xs text-ink/40"}>
            {due && <Icon name="schedule" size={13} />}
            {opened}
            {due && ` · check for new postings every ${PORTAL_CHECK_EVERY_DAYS} days`}
          </span>
        )}
      </div>
    </div>
  );
}

function SourcesCard() {
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: profileApi.get, staleTime: Infinity });
  if (!profile) return null;
  const { urlSources, textOnlySources } = buildSources(profile.search_phrases, profile.search_location);
  return (
    <section>
      <SectionTitle icon="travel_explore" tone="bg-clay-50 text-clay-700">
        Find new quests
      </SectionTitle>
      <div className="card rounded-2xl p-5">
      <p className="text-xs text-ink/45 mb-3">
        Opens a search on that site for your target roles — copy any posting's URL or text back into "Analyze JD".
      </p>
      <div className="space-y-3">
        {profile.career_portal && <SchoolPortal portal={profile.career_portal} />}
        <div>
          <p className="text-xs text-ink/50 mb-1.5 inline-flex items-center gap-1">
            <Icon name="check_circle" size={13} className="text-sage-600" />
            Their listing URLs work directly with the analyzer
          </p>
          <div className="flex flex-wrap gap-1.5">
            {urlSources.map((s) => (
              <SourcePill key={s.label} label={s.label} href={s.href} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-ink/50 mb-1.5 inline-flex items-center gap-1">
            <Icon name="block" size={13} className="text-coral-600" />
            Blocks scraping — paste the job text instead of the URL
          </p>
          <div className="flex flex-wrap gap-1.5">
            {textOnlySources.map((s) => (
              <SourcePill key={s.label} label={s.label} href={s.href} />
            ))}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

/** Training quests at a glance: points per module and one open quest from each to pick up. */
function TrainingCard() {
  const { data: board } = useQuery({ queryKey: ["practice", "quests"], queryFn: practiceApi.quests });
  if (!board) return null;
  const picks = board.modules
    .map((m) => ({ module: m, quest: m.quests.find((q) => !q.cleared_on) }))
    .filter((p) => p.quest)
    .slice(0, 3);

  return (
    <section>
      <SectionTitle icon="fitness_center" tone="bg-plum-50 text-plum-700" aside={`${board.points.toLocaleString()} pts earned · ${board.cleared}/${board.total} quests`}>
        Training quests
      </SectionTitle>
      <div className="card rounded-2xl p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {board.modules.map((m) => (
            <Link key={m.key} to={`/practice?module=${m.key}`} className="group">
              <span className="flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${TRACK_STYLE[m.key].soft} ${TRACK_STYLE[m.key].text}`}>
                  <Icon name={m.icon} size={16} />
                </span>
                <span className="text-xs font-medium text-ink/75 group-hover:text-petrol-600 leading-tight">{m.title}</span>
              </span>
              <span className="mt-1.5 block h-1.5 rounded-full bg-petrol-50 overflow-hidden">
                <span className={`block h-full rounded-full ${TRACK_STYLE[m.key].bar}`} style={{ width: `${(m.earned / m.available) * 100}%` }} />
              </span>
              <span className="mt-0.5 block text-[11px] text-ink/45">
                {m.cleared}/{m.quests.length} · {m.available.toLocaleString()} pts
              </span>
            </Link>
          ))}
        </div>
        {picks.length > 0 && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {picks.map(({ module, quest }) => (
              <Link
                key={quest.key}
                to={`/practice?module=${module.key}`}
                className="flex items-center gap-3 rounded-xl border border-mist px-3 py-2 hover:border-bubblegum-300 hover:shadow-sm"
              >
                <span className={`flex flex-col items-center rounded-xl px-2 py-1 ${TRACK_STYLE[module.key].soft}`}>
                  <span className={`font-hand text-2xl leading-none ${TRACK_STYLE[module.key].text}`}>{quest.points}</span>
                  <span className="text-[9px] uppercase text-ink/45">pts</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-ink/80 truncate">{quest.title}</span>
                  <span className="block text-[11px] text-ink/45">
                    {module.title} · +{quest.bonus} said out loud
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function greeting() {
  const hour = dayjs().hour();
  return hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function JobGrid({ jobs }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

/**
 * Home: the job hunt as a small game — your plant and level, this week's quests, today's
 * training, bosses, the next targets, stickers — with the JD tools underneath.
 */
export default function Dashboard() {
  const { data: game, isLoading } = useQuery({ queryKey: ["game"], queryFn: gameApi.overview });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: profileApi.get, staleTime: Infinity });
  const { data: targets = [] } = useQuery({
    queryKey: ["jobs", "to-apply"],
    queryFn: () => jobsApi.list({ to_apply: true, limit: 6 }),
  });
  // Hard-rejected JDs stay in Discoveries and on their own pages; home shows ones still in play.
  const { data: recent = [] } = useQuery({
    queryKey: ["jobs", "recent"],
    queryFn: () => jobsApi.list({ limit: 24, analyzed: true }),
    select: (jobs) => jobs.filter((j) => !j.is_auto_rejected).slice(0, 6),
  });

  if (isLoading || !game) return <PageLoader message="Watering your plant..." />;
  const firstName = (profile?.name || "").split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="font-hand text-2xl leading-none text-bubblegum-500">{dayjs().format("dddd, MMMM D")}</p>
          <h1 className="text-2xl font-bold text-ink mt-1">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-ink/50 mt-0.5">One small quest at a time.</p>
        </div>
        <Link to="/jobs/add" className="btn-primary">
          <Icon name="add" size={18} /> Analyze JD
        </Link>
      </div>

      <SeasonRecap />

      <PlayerCard player={game.player} stats={game.stats} />

      <QuestBoard week={game.week} />

      <TrainingCard />

      <BossBattles bosses={game.bosses} />

      <section id="next-targets">
        <SectionTitle
          icon="flag"
          tone="bg-bubblegum-50 text-bubblegum-700"
          aside={game.stats.to_apply ? `top ${targets.length} of ${game.stats.to_apply} still open and not sent` : undefined}
        >
          Next targets
        </SectionTitle>
        {targets.length ? (
          <JobGrid jobs={targets} />
        ) : (
          <p className="rounded-2xl border border-dashed border-mist p-5 text-sm text-ink/50">
            Nothing waiting — every good match is sent. Discoveries or a new JD will refill this.
          </p>
        )}
      </section>

      <StickerWall achievements={game.achievements} />

      {recent.length > 0 ? (
        <section>
          <SectionTitle icon="history" aside={`${game.stats.jds_analyzed} analyzed`}>
            Recent JDs
          </SectionTitle>
          <JobGrid jobs={recent} />
        </section>
      ) : (
        <div className="card rounded-2xl p-12 text-center">
          <Icon name="note_add" size={40} className="mb-3 text-petrol-500" />
          <p className="font-medium text-ink">No jobs analyzed yet</p>
          <p className="text-sm text-ink/50 mt-1 mb-4">Paste a JD or drop a Greenhouse / Lever / Ashby link to get started</p>
          <Link to="/jobs/add" className="btn-primary">
            Analyze your first JD
          </Link>
        </div>
      )}

      <SourcesCard />

      <SeasonLinks seasons={game.seasons} />
    </div>
  );
}
