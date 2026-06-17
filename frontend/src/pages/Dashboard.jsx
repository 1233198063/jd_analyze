import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { jobsApi } from "@/api/jobs";
import { applicationsApi } from "@/api/applications";
import JobCard from "@/components/features/JobCard";
import { PageLoader } from "@/components/common/Loading";

function StatCard({ label, value, sub, color = "blue" }) {
  const colors = {
    blue: "text-blue-600",
    green: "text-green-600",
    yellow: "text-yellow-600",
    red: "text-red-600",
  };
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
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
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your job search intelligence overview</p>
        </div>
        <Link to="/jobs/add" className="btn-primary">
          + Analyze JD
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard label="Total JDs" value={stats.total} color="blue" />
        <StatCard label="Apply" value={stats.apply} sub="80+ score" color="green" />
        <StatCard label="Maybe" value={stats.maybe} sub="60–79 score" color="yellow" />
        <StatCard label="Auto Rejected" value={stats.rejected} sub="hard filters" color="red" />
        <StatCard label="Applied" value={applied} color="blue" />
        <StatCard label="Interviews" value={interviews} color="green" />
      </div>

      {/* Top priority jobs */}
      {prioritized.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            Priority Applications
            <span className="ml-2 text-xs font-normal text-gray-400">score 60+</span>
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
            <h2 className="text-base font-semibold text-gray-800">Recent JDs</h2>
            <span className="text-xs text-gray-400">{jobs.length} total</span>
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
          <p className="text-4xl mb-3">◈</p>
          <p className="font-medium text-gray-700">No jobs analyzed yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-4">
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
