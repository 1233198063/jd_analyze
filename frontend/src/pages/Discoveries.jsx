import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import JobCard from "@/components/features/JobCard";
import { PageLoader, Spinner } from "@/components/common/Loading";

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

  const summary = statusData?.status !== "running" ? statusData?.summary : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Discoveries</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Auto-found roles from Greenhouse / Lever / Ashby matching your target titles, ranked by score.
          </p>
        </div>
        <button onClick={handleRunNow} disabled={running} className="btn-primary flex items-center gap-2">
          {running && <Spinner size="sm" />}
          {running ? "Running..." : "Run Now"}
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {AGE_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setMaxAgeHours(f.hours)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              maxAgeHours === f.hours ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {running && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          Checking company boards and scoring matches — this runs in the background and can take a few
          minutes. Feel free to navigate away; this page updates when it's done.
        </div>
      )}

      {runError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {runError}
        </div>
      )}

      {statusData?.status === "error" && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Last run failed: {statusData.summary?.error}
        </div>
      )}

      {summary && !summary.error && (
        <div className="card p-4 text-xs text-gray-600 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-gray-400">Companies checked</p>
            <p className="text-base font-semibold text-gray-900">{summary.companies_checked}</p>
          </div>
          <div>
            <p className="text-gray-400">Title matches</p>
            <p className="text-base font-semibold text-gray-900">{summary.title_matched}</p>
          </div>
          <div>
            <p className="text-gray-400">New jobs added</p>
            <p className="text-base font-semibold text-green-600">{summary.created}</p>
          </div>
          <div>
            <p className="text-gray-400">Already seen</p>
            <p className="text-base font-semibold text-gray-900">{summary.skipped_duplicate}</p>
          </div>
        </div>
      )}

      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        !running && (
          <div className="card p-12 text-center">
            <p className="text-4xl mb-3">⚡</p>
            <p className="font-medium text-gray-700">
              {maxAgeHours ? "Nothing this fresh yet" : "No discoveries yet"}
            </p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
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
