import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { jobsApi } from "@/api/jobs";
import { sourcesApi } from "@/api/sources";
import { profileApi } from "@/api/profile";
import { applicationsApi } from "@/api/applications";
import { practiceApi } from "@/api/practice";
import JobCard from "@/components/features/JobCard";
import PracticeHeatmap from "@/components/features/practice/PracticeHeatmap";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import { TRACK_ORDER, TRACK_SHORT, TRACK_STYLE } from "@/utils/practice";

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
    <div className="card p-5">
      <p className="text-sm font-semibold text-ink mb-1">Search by Source</p>
      <p className="text-xs text-ink/40 mb-3">
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
  );
}

function PracticeCard() {
  const { data: today } = useQuery({ queryKey: ["practice", "today"], queryFn: practiceApi.today });
  const { data: overview } = useQuery({ queryKey: ["practice", "overview"], queryFn: practiceApi.overview });
  if (!today || !overview) return null;

  const tracks = TRACK_ORDER.filter((t) => today.targets[t]);
  const target = tracks.reduce((sum, t) => sum + today.targets[t], 0);
  const inPlan = today.day_number != null;
  const pending = inPlan && !today.checked_in;
  const plan = today.plan;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <p className="text-sm font-semibold text-ink">Interview Practice</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {inPlan ? `Day ${today.day_number} of ${today.plan_days} · ${plan.theme}` : "Outside the practice plan"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-sm">
            <Icon name="local_fire_department" size={17} filled className={today.streak ? "text-clay-500" : "text-ink/25"} />
            <span className="font-semibold text-ink">{today.streak}</span>
            <span className="text-ink/50">day streak</span>
          </span>
          <Link to="/practice" className={pending ? "btn-primary" : "btn-secondary"}>
            {pending ? "Start today's practice" : "Open practice"}
          </Link>
        </div>
      </div>

      {pending && plan && (
        <div className="mb-3 rounded-lg bg-bubblegum-100/60 border border-bubblegum-200 px-3 py-2 text-xs text-ink/80 flex items-start gap-2">
          <Icon name="notifications_active" size={15} className="text-bubblegum-600 mt-px flex-shrink-0" />
          <span>
            <span className="font-semibold">Nothing logged yet today.</span> Today's set:{" "}
            {plan.items.map((item) => item.title).join(" · ")}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5 items-center">
        <div className="space-y-1.5">
          <p className="text-xs text-ink/55">
            Today · <span className="font-semibold text-ink">{today.total_minutes}</span> / {target} min
          </p>
          {tracks.map((t) => (
            <div key={t} className="flex items-center gap-2 text-xs">
              <span className="w-24 text-ink/60">{TRACK_SHORT[t]}</span>
              <div className="flex-1 h-1.5 bg-petrol-50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${TRACK_STYLE[t].bar}`}
                  style={{ width: `${Math.min(100, ((today.minutes[t] || 0) / today.targets[t]) * 100)}%` }}
                />
              </div>
              <span className="w-14 text-right tabular-nums text-ink/50">
                {today.minutes[t] || 0}/{today.targets[t]}
              </span>
            </div>
          ))}
        </div>
        <div>
          <PracticeHeatmap days={overview.days} compact />
          <p className="text-xs text-ink/40 mt-1.5">
            Practiced {overview.days_practiced} of {overview.days_elapsed} {overview.days_elapsed === 1 ? "day" : "days"}
            {overview.explained_rate != null &&
              ` · explained aloud in ${Math.round(overview.explained_rate * 100)}% of sessions`}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color = "petrol" }) {
  const colors = {
    petrol: "text-petrol-500",
    green: "text-sage-700",
    yellow: "text-gold-700",
    red: "text-coral-700",
  };
  return (
    <div className="card p-5">
      <p className="text-sm text-ink/50">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-ink/40 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => jobsApi.list({ limit: 50 }),
  });

  const { data: kanban = [] } = useQuery({
    queryKey: ["kanban"],
    queryFn: applicationsApi.kanban,
  });

  const stats = {
    total: jobs.length,
    apply: jobs.filter((j) => j.recommendation === "apply").length,
    maybe: jobs.filter((j) => j.recommendation === "maybe").length,
    rejected: jobs.filter((j) => j.is_auto_rejected).length,
  };

  const applied = kanban.find((col) => col.status === "applied")?.items?.length ?? 0;
  const interviews = kanban.find((col) => col.status === "interview")?.items?.length ?? 0;

  const prioritized = jobs
    .filter((j) => !j.is_auto_rejected && j.overall_score >= 60)
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
    .slice(0, 6);

  const recent = [...jobs].slice(0, 8);

  if (isLoading) return <PageLoader message="Loading dashboard..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
          <p className="text-sm text-ink/50 mt-0.5">Your job search intelligence overview</p>
        </div>
        <Link to="/jobs/add" className="btn-primary">
          + Analyze JD
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard label="Total JDs" value={stats.total} color="petrol" />
        <StatCard label="Apply" value={stats.apply} sub="80+ score" color="green" />
        <StatCard label="Maybe" value={stats.maybe} sub="60–79 score" color="yellow" />
        <StatCard label="Auto Rejected" value={stats.rejected} sub="hard filters" color="red" />
        <StatCard label="Applied" value={applied} color="petrol" />
        <StatCard label="Interviews" value={interviews} color="green" />
      </div>

      <PracticeCard />

      <SourcesCard />

      {/* Top priority jobs */}
      {prioritized.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink mb-3">
            Priority Applications
            <span className="ml-2 text-xs font-normal text-ink/40">score 60+</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {prioritized.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink">Recent JDs</h2>
            <span className="text-xs text-ink/40">{jobs.length} total</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {recent.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {jobs.length === 0 && (
        <div className="card p-12 text-center">
          <Icon name="dashboard" size={40} className="mb-3 text-petrol-500" />
          <p className="font-medium text-ink">No jobs analyzed yet</p>
          <p className="text-sm text-ink/50 mt-1 mb-4">
            Paste a JD or drop a Greenhouse / Lever / Ashby link to get started
          </p>
          <Link to="/jobs/add" className="btn-primary">
            Analyze your first JD
          </Link>
        </div>
      )}
    </div>
  );
}
