import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { jobsApi } from "@/api/jobs";
import JobCard from "@/components/features/JobCard";
import { PageLoader, Spinner } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";

dayjs.extend(relativeTime);

// The task runs daily; past this the panel says the scan is overdue.
const STALE_AFTER_HOURS = 36;

function Stat({ label, value, tone = "text-ink", hint }) {
  return (
    <div title={hint}>
      <p className="text-ink/40">{label}</p>
      <p className={clsx("text-base font-semibold", tone)}>{value}</p>
    </div>
  );
}

/** What the scans actually covered, and how much of the to-apply list is confirmed still posted. */
function CoveragePanel({ status }) {
  const qc = useQueryClient();
  const recheck = useMutation({
    mutationFn: jobsApi.checkPostings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discoverStatus"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const lastSuccess = status.last_success_at ? dayjs(status.last_success_at) : null;
  const stale = !lastSuccess || dayjs().diff(lastSuccess, "hour") >= STALE_AFTER_HOURS;
  const run = status.latest_run;
  const summary = run?.status === "done" ? run.summary : null;
  const postings = status.to_apply_postings || {};

  return (
    <div className="card p-4 space-y-3 text-xs text-ink/70">
      <div className="flex items-center gap-2">
        {/* Green only when the newest run worked; a failed one after a good scan is still a warning. */}
        {stale || run?.status === "error" ? (
          <Icon name="schedule" size={16} className="text-gold-600" />
        ) : (
          <Icon name="check_circle" size={16} className="text-sage-600" />
        )}
        <p className="text-sm text-ink">
          {lastSuccess ? `Last scan ${lastSuccess.fromNow()}` : "No scan recorded yet"}
          {run?.status === "done" && <span className="text-ink/45"> · {run.trigger === "scheduled" ? "daily task" : "Run Now"}</span>}
        </p>
      </div>

      {stale && run?.status !== "running" && (
        <p className="rounded-lg bg-gold-50 border border-gold-200 px-3 py-2 text-gold-700">
          {lastSuccess
            ? `Nothing has scanned for ${lastSuccess.fromNow(true)}.`
            : "Click Run Now for the first scan."}{" "}
          Each board picks up where its last successful scan stopped (up to 14 days back), so the next run
          still finds what was posted in the gap.
        </p>
      )}

      {run?.status === "error" && (
        <p className="rounded-lg bg-coral-50 border border-coral-200 px-3 py-2 text-coral-700">
          Last run failed: {run.error}
        </p>
      )}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Boards scanned" value={`${summary.companies_checked} / ${summary.companies_total ?? status.companies_total}`} />
          <Stat label="New jobs added" value={summary.created} tone="text-sage-600" />
          <Stat label="Already seen" value={summary.skipped_duplicate} />
          <Stat
            label="Carried to next run"
            value={summary.carried_over ?? 0}
            tone={summary.carried_over ? "text-gold-700" : "text-ink"}
            hint="Matches over the 25-per-run cap. They stay in the queue and are added on the next run."
          />
        </div>
      )}

      {summary && (summary.skipped_work_auth > 0 || summary.skipped_experience > 0) && (
        <p className="text-ink/45">
          Skipped before analysis (the scorer would reject them anyway):{" "}
          {[
            summary.skipped_work_auth > 0 && `${summary.skipped_work_auth} say no sponsorship or need clearance`,
            summary.skipped_experience > 0 && `${summary.skipped_experience} ask for 5+ years`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {status.failing_companies?.length > 0 && (
        <div>
          <p className="text-ink/45 mb-1">
            Boards that couldn't be scanned last time. Nothing is lost: each one picks up from its last good
            scan on the next run.
          </p>
          <ul className="space-y-0.5">
            {/* One line per reason — when the machine is offline every board fails the same way. */}
            {Object.entries(
              status.failing_companies.reduce((groups, c) => {
                (groups[c.error || "Unknown error"] ||= []).push(c);
                return groups;
              }, {})
            ).map(([error, companies]) => (
              <li key={error}>
                <span className="font-medium text-ink/80">
                  {companies.length === status.companies_total
                    ? "All boards"
                    : companies.length > 4
                      ? `${companies.length} boards (${companies.slice(0, 3).map((c) => c.company).join(", ")}, …)`
                      : companies.map((c) => c.company).join(", ")}
                </span>
                <span className="text-ink/45"> · {error}</span>
                {Math.max(...companies.map((c) => c.consecutive_failures)) > 1 && (
                  <span className="text-ink/45">
                    {" "}
                    · {Math.max(...companies.map((c) => c.consecutive_failures))} runs in a row
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary?.analysis_failed?.length > 0 && (
        <p className="text-ink/45">
          {summary.analysis_failed.length} match{summary.analysis_failed.length > 1 ? "es" : ""} couldn't be analyzed
          — paste {summary.analysis_failed.length > 1 ? "them" : "it"} on Add JD if needed:{" "}
          {summary.analysis_failed.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="text-petrol-500 hover:underline mr-2">
              link
            </a>
          ))}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-mist">
        <span className="text-ink/45">Your to-apply list:</span>
        <span className="text-sage-700">{postings.listed ?? 0} still open</span>
        <span>{postings.removed ?? 0} closed</span>
        <span className="text-ink/45" title="Pasted without a link, or on a site without a public job API (LinkedIn, Workday)">
          {postings.unverified ?? 0} can't auto-check
        </span>
        {postings.unchecked > 0 && <span className="text-ink/45">{postings.unchecked} not checked yet</span>}
        <button
          className="ml-auto font-medium text-petrol-500 hover:text-petrol-600 hover:underline disabled:opacity-50"
          disabled={recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          {recheck.isPending ? "Checking..." : "Recheck postings"}
        </button>
      </div>
    </div>
  );
}

const AGE_FILTERS = [
  { label: "Today", hours: 24 },
  { label: "Last 3 days", hours: 72 },
  { label: "All time", hours: null },
];

export default function Discoveries() {
  const [runError, setRunError] = useState(null);
  const [maxAgeHours, setMaxAgeHours] = useState(24);
  const qc = useQueryClient();
  const prevStatus = useRef(null);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", { discovered: true, maxAgeHours }],
    queryFn: () => jobsApi.list({ discovered: true, limit: 100, max_age_hours: maxAgeHours ?? undefined }),
  });

  const { data: statusData } = useQuery({
    queryKey: ["discoverStatus"],
    queryFn: jobsApi.discoverStatus,
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2500 : false),
  });

  const running = statusData?.status === "running";

  useEffect(() => {
    if (prevStatus.current === "running" && statusData?.status && statusData.status !== "running") {
      qc.invalidateQueries({ queryKey: ["jobs"] });
    }
    prevStatus.current = statusData?.status;
  }, [statusData?.status, qc]);

  const handleRunNow = async () => {
    setRunError(null);
    try {
      await jobsApi.discoverStart();
      qc.invalidateQueries({ queryKey: ["discoverStatus"] });
    } catch (e) {
      setRunError(e?.response?.data?.detail || e.message);
    }
  };

  if (isLoading) return <PageLoader message="Loading discoveries..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Daily Discoveries</h1>
          <p className="text-sm text-ink/55 mt-0.5">
            Auto-found roles in your target area (and US-remote) from Greenhouse / Lever / Ashby / Workday boards, ranked by score.
          </p>
        </div>
        <button onClick={handleRunNow} disabled={running} className="btn-primary flex items-center gap-2">
          {running && <Spinner size="sm" />}
          {running ? "Running..." : "Run Now"}
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-petrol-50 rounded-lg w-fit">
        {AGE_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setMaxAgeHours(f.hours)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              maxAgeHours === f.hours ? "bg-white shadow text-ink" : "text-ink/70 hover:text-ink/90"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {running && (
        <div className="rounded-lg bg-petrol-50 border border-petrol-200 px-4 py-3 text-sm text-petrol-600">
          Checking company boards and scoring matches — this runs in the background and can take a few
          minutes. Feel free to navigate away; this page updates when it's done.
        </div>
      )}

      {runError && (
        <div className="rounded-lg bg-coral-50 border border-coral-200 px-4 py-3 text-sm text-coral-700">
          {runError}
        </div>
      )}

      {statusData && <CoveragePanel status={statusData} />}

      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        !running && (
          <div className="card p-12 text-center">
            <Icon name="bolt" size={40} className="mb-3 text-petrol-500" />
            <p className="font-medium text-ink/80">
              {maxAgeHours ? "Nothing this fresh yet" : "No discoveries yet"}
            </p>
            <p className="text-sm text-ink/55 mt-1 mb-4">
              {maxAgeHours
                ? "No matching roles posted in this window. Try \"All time\", or click \"Run Now\" to check again."
                : "Click \"Run Now\" to search now, or set up the daily scheduled task — see backend/DISCOVERY.md."}
            </p>
          </div>
        )
      )}
    </div>
  );
}
