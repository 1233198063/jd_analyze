import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { applicationsApi } from "@/api/applications";
import { PageLoader } from "@/components/common/Loading";
import dayjs from "dayjs";

const STATUS_COLORS = {
  saved: "border-gray-300 bg-gray-50",
  applied: "border-blue-300 bg-blue-50",
  referral_asked: "border-purple-300 bg-purple-50",
  oa: "border-yellow-300 bg-yellow-50",
  phone_screen: "border-yellow-300 bg-yellow-50",
  interview: "border-orange-300 bg-orange-50",
  offer: "border-green-300 bg-green-50",
  rejected: "border-red-300 bg-red-50",
  withdrawn: "border-gray-200 bg-gray-50",
};

const NEXT_STATUS = {
  saved: "applied",
  applied: "phone_screen",
  referral_asked: "applied",
  oa: "phone_screen",
  phone_screen: "interview",
  interview: "offer",
};

const REJECTION_REASONS = [
  { value: "sponsorship", label: "Sponsorship" },
  { value: "level", label: "Level" },
  { value: "resume", label: "Resume / Keywords" },
  { value: "no_response", label: "No Response" },
  { value: "oa_failed", label: "OA Failed" },
  { value: "interview_failed", label: "Interview Failed" },
  { value: "other", label: "Other" },
];

function AppCard({ item, colStatus }) {
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: ({ id, payload }) => applicationsApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kanban"] }),
  });

  const next = NEXT_STATUS[colStatus];

  return (
    <div className={`rounded-lg border p-3 text-sm space-y-1.5 ${STATUS_COLORS[colStatus] || "border-gray-200 bg-white"}`}>
      <Link to={`/jobs/${item.job_id}`} className="font-medium text-gray-900 hover:underline block truncate">
        {item.title || "Untitled"}
      </Link>
      <p className="text-gray-600 text-xs truncate">{item.company}</p>

      {item.applied_at && (
        <p className="text-xs text-gray-400">Applied {dayjs(item.applied_at).format("MMM D")}</p>
      )}

      {item.apply_url && (
        <a
          href={item.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:underline inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          投递链接 ↗
        </a>
      )}

      {colStatus === "rejected" && (
        <select
          className="input text-xs mt-1"
          defaultValue={item.rejection_reason || ""}
          onChange={(e) =>
            update.mutate({ id: item.id, payload: { rejection_reason: e.target.value } })
          }
        >
          <option value="">Why rejected?</option>
          {REJECTION_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {next && (
          <button
            className="text-xs px-2 py-0.5 rounded bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
            onClick={() => update.mutate({ id: item.id, payload: { status: next } })}
          >
            → {next.replace("_", " ")}
          </button>
        )}
        {colStatus !== "rejected" && colStatus !== "withdrawn" && (
          <button
            className="text-xs px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"
            onClick={() => update.mutate({ id: item.id, payload: { status: "rejected" } })}
          >
            Reject
          </button>
        )}
      </div>
    </div>
  );
}

export default function Tracker() {
  const { data: kanban = [], isLoading } = useQuery({
    queryKey: ["kanban"],
    queryFn: applicationsApi.kanban,
  });

  if (isLoading) return <PageLoader />;

  const totalApps = kanban.reduce((sum, col) => sum + col.items.length, 0);
  const rejected = kanban.find((c) => c.status === "rejected")?.items || [];
  const sponsorshipRejections = rejected.filter((i) => i.rejection_reason === "sponsorship").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Application Tracker</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {totalApps} applications tracked
          {sponsorshipRejections > 0 && (
            <span className="ml-2 text-red-500">
              · {sponsorshipRejections} sponsorship rejection{sponsorshipRejections > 1 ? "s" : ""}
            </span>
          )}
        </p>
      </div>

      {/* Rejection insight */}
      {rejected.length >= 3 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm font-medium text-amber-800 mb-1">Rejection Pattern Analysis</p>
          <div className="flex gap-4 text-xs text-amber-700">
            {REJECTION_REASONS.map((r) => {
              const count = rejected.filter((i) => i.rejection_reason === r.value).length;
              return count > 0 ? (
                <span key={r.value}>{r.label}: <strong>{count}</strong></span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {kanban.map((col) => (
          <div key={col.status} className="flex-shrink-0 w-52">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {col.label}
              </p>
              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                {col.items.length}
              </span>
            </div>
            <div className="kanban-col space-y-2">
              {col.items.map((item) => (
                <AppCard key={item.id} item={item} colStatus={col.status} />
              ))}
              {col.items.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-xs text-gray-400">
                  empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
