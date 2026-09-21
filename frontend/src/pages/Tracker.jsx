import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { applicationsApi } from "@/api/applications";
import { PageLoader } from "@/components/common/Loading";
import Stamp, { stampLabel } from "@/components/features/Stamp";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import clsx from "clsx";

dayjs.extend(relativeTime);

// Low-saturation blocks carry stage identity on the list, so the rows themselves
// can stay plain text. Stamps live on the JobDetail timeline, not on this surface.
const STAGE_TINT = {
  saved: { bar: "bg-slate-300", tint: "bg-slate-50", dot: "bg-slate-400" },
  applied: { bar: "bg-blue-300", tint: "bg-blue-50/50", dot: "bg-blue-400" },
  referral_asked: { bar: "bg-purple-300", tint: "bg-purple-50/50", dot: "bg-purple-400" },
  oa: { bar: "bg-amber-300", tint: "bg-amber-50/50", dot: "bg-amber-400" },
  phone_screen: { bar: "bg-amber-300", tint: "bg-amber-50/50", dot: "bg-amber-400" },
  interview: { bar: "bg-orange-300", tint: "bg-orange-50/50", dot: "bg-orange-400" },
  offer: { bar: "bg-emerald-300", tint: "bg-emerald-50/50", dot: "bg-emerald-400" },
  rejected: { bar: "bg-rose-200", tint: "bg-rose-50/40", dot: "bg-rose-300" },
  withdrawn: { bar: "bg-gray-200", tint: "bg-gray-50", dot: "bg-gray-300" },
};

const tint = (status) => STAGE_TINT[status] || STAGE_TINT.saved;

const NEXT_STATUS = {
  saved: "applied",
  applied: "phone_screen",
  referral_asked: "applied",
  oa: "phone_screen",
  phone_screen: "interview",
  interview: "offer",
};

const REJECTION_REASONS = [
  { value: "form_rejection", label: "Form Rejection (no reason given)" },
  { value: "no_response", label: "No Response (ghosted)" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "level", label: "Level" },
  { value: "resume", label: "Resume / Keywords" },
  { value: "oa_failed", label: "OA Failed" },
  { value: "interview_failed", label: "Interview Failed" },
  { value: "other", label: "Other" },
];

const SHORT_LABEL = {
  saved: "Saved",
  applied: "Applied",
  referral_asked: "Referral",
  oa: "OA",
  phone_screen: "Phone",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function daysSince(date) {
  return dayjs().startOf("day").diff(dayjs(date).startOf("day"), "day");
}

/** Plain trail: "Saved Sep 12 → Applied Sep 12 → Phone Sep 17". */
function TimelineTrail({ timeline = [] }) {
  if (timeline.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap text-xs text-gray-400">
      {timeline.map((e, i) => (
        <span key={`${e.status}-${e.timestamp}-${i}`} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300">→</span>}
          <span>
            <span className="text-gray-500">{SHORT_LABEL[e.status] || e.status}</span>{" "}
            {e.timestamp ? dayjs(e.timestamp).format("MMM D") : "—"}
          </span>
        </span>
      ))}
    </div>
  );
}

/** This month's collected stamps, kept to one quiet line above the list. */
function StampCollection({ kanban }) {
  const startOfMonth = dayjs().startOf("month");
  const stamps = kanban
    .flatMap((col) => col.items)
    .flatMap((item) =>
      (item.timeline || []).map((e) => ({ ...e, company: item.company, title: item.title }))
    )
    .filter((e) => e.timestamp && dayjs(e.timestamp).isAfter(startOfMonth))
    .sort((a, b) => dayjs(a.timestamp) - dayjs(b.timestamp));

  if (stamps.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap px-1">
      <span className="text-xs text-gray-400 whitespace-nowrap">
        Stamps this month · {stamps.length}
      </span>
      <div className="flex flex-wrap gap-1 opacity-75">
        {stamps.map((e, i) => (
          <Stamp
            key={`${e.timestamp}-${i}`}
            status={e.status}
            size="sm"
            seed={`${e.timestamp}-${i}`}
            title={`${stampLabel(e.status)} · ${e.title || ""} ${e.company || ""} · ${dayjs(e.timestamp).format("MMM D")}`}
          />
        ))}
      </div>
    </div>
  );
}

function AppRow({ item, colStatus }) {
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: ({ id, payload }) => applicationsApi.update(id, payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["kanban"] });
      qc.invalidateQueries({ queryKey: ["application", result?.id] });
    },
  });

  const next = NEXT_STATUS[colStatus];
  const stageDays = item.status_since != null ? daysSince(item.status_since) : null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-t border-gray-100 first:border-t-0 hover:bg-gray-50/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            to={`/jobs/${item.job_id}`}
            className="font-medium text-sm text-gray-900 hover:text-blue-600 hover:underline truncate"
          >
            {item.title || "Untitled"}
          </Link>
          <span className="text-xs text-gray-500">{item.company}</span>
          {item.apply_url && (
            <a
              href={item.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline"
            >
              Application Link ↗
            </a>
          )}
        </div>

        <div className="mt-1">
          <TimelineTrail timeline={item.timeline} />
        </div>

        {colStatus === "rejected" && (
          <select
            className="input text-xs py-1 mt-2 w-48"
            defaultValue={item.rejection_reason || ""}
            onChange={(e) => update.mutate({ id: item.id, payload: { rejection_reason: e.target.value } })}
          >
            <option value="">Why rejected?</option>
            {REJECTION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          {item.applied_at && (
            <p className="text-xs text-gray-600 whitespace-nowrap">
              Applied {dayjs(item.applied_at).format("MMM D")}
            </p>
          )}
          {stageDays != null && (
            <p className="text-xs text-gray-400 whitespace-nowrap">
              {stageDays === 0 ? "today" : `${stageDays}d in stage`}
            </p>
          )}
        </div>

        <div className="flex gap-1.5">
          {next && (
            <button
              className="text-xs px-2 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 whitespace-nowrap transition-colors"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: item.id, payload: { status: next } })}
            >
              → {SHORT_LABEL[next]}
            </button>
          )}
          {colStatus !== "rejected" && colStatus !== "withdrawn" && (
            <button
              className="text-xs px-2 py-1 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: item.id, payload: { status: "rejected" } })}
            >
              Reject
            </button>
          )}
        </div>
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
  const activeStages = kanban.filter((col) => col.items.length > 0);

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

      {/* Pipeline overview — keeps every stage visible without a horizontal scroll */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {kanban.map((col) => (
            <div key={col.status} className="flex items-center gap-2">
              <span
                className={clsx(
                  "w-2 h-2 rounded-full",
                  col.items.length ? tint(col.status).dot : "bg-gray-200"
                )}
              />
              <span className={clsx("text-xs", col.items.length ? "text-gray-700" : "text-gray-400")}>
                {col.label}
              </span>
              <span
                className={clsx(
                  "text-xs font-semibold px-1.5 rounded",
                  col.items.length ? "bg-gray-100 text-gray-700" : "text-gray-300"
                )}
              >
                {col.items.length}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rejection insight */}
      {rejected.length >= 3 && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm font-medium text-amber-800 mb-1">Rejection Pattern Analysis</p>
          <div className="flex flex-wrap gap-4 text-xs text-amber-700">
            {REJECTION_REASONS.map((r) => {
              const count = rejected.filter((i) => i.rejection_reason === r.value).length;
              return count > 0 ? (
                <span key={r.value}>{r.label}: <strong>{count}</strong></span>
              ) : null;
            })}
          </div>
        </div>
      )}

      <StampCollection kanban={kanban} />

      {/* Stages stacked vertically */}
      {activeStages.map((col) => (
        <div key={col.status}>
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx("w-1 h-4 rounded-full", tint(col.status).bar)} />
            <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
            <span className="text-xs text-gray-400">{col.items.length}</span>
          </div>
          <div className="card overflow-hidden flex">
            {/* the colour block that tells sections apart without shouting */}
            <div className={clsx("w-1 flex-shrink-0", tint(col.status).bar)} />
            <div className={clsx("flex-1 min-w-0", tint(col.status).tint)}>
              {col.items.map((item) => (
                <AppRow key={item.id} item={item} colStatus={col.status} />
              ))}
            </div>
          </div>
        </div>
      ))}

      {totalApps === 0 && (
        <div className="card p-12 text-center">
          <p className="font-medium text-gray-700">No applications tracked yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Save or mark a job as applied from its detail page to start tracking.
          </p>
        </div>
      )}
    </div>
  );
}
