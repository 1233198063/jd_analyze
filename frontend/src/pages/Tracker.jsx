import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { applicationsApi } from "@/api/applications";
import { resumeApi } from "@/api/resume";
import { PageLoader } from "@/components/common/Loading";
import Stamp, { STAMPS, stampLabel } from "@/components/features/Stamp";
import TrackerAnalysis from "@/components/features/TrackerAnalysis";
import Icon from "@/components/common/Icon";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import clsx from "clsx";

dayjs.extend(relativeTime);

// Low-saturation blocks carry stage identity on the list, so the rows themselves
// can stay plain text. Stamps live on the JobDetail timeline, not on this surface.
const STAGE_TINT = {
  saved: { bar: "bg-petrol-200", tint: "bg-canvas", dot: "bg-petrol-300" },
  applied: { bar: "bg-petrol-300", tint: "bg-petrol-50/50", dot: "bg-petrol-400" },
  referral_asked: { bar: "bg-plum-300", tint: "bg-plum-50/50", dot: "bg-plum-400" },
  oa: { bar: "bg-gold-300", tint: "bg-gold-50/50", dot: "bg-gold-400" },
  phone_screen: { bar: "bg-gold-300", tint: "bg-gold-50/50", dot: "bg-gold-400" },
  interview: { bar: "bg-clay-300", tint: "bg-clay-50/50", dot: "bg-clay-400" },
  offer: { bar: "bg-sage-300", tint: "bg-sage-50/50", dot: "bg-sage-400" },
  rejected: { bar: "bg-coral-200", tint: "bg-coral-50/40", dot: "bg-coral-300" },
  withdrawn: { bar: "bg-mist", tint: "bg-canvas", dot: "bg-petrol-200" },
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

const reasonLabel = (value) =>
  REJECTION_REASONS.find((r) => r.value === value)?.label || "Reason not recorded";

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
    <div className="flex items-center gap-1 flex-wrap text-xs text-ink/40">
      {timeline.map((e, i) => (
        <span key={`${e.status}-${e.timestamp}-${i}`} className="flex items-center gap-1">
          {i > 0 && <Icon name="arrow_forward" size={12} className="text-ink/25" />}
          <span>
            <span className="text-ink/55">{SHORT_LABEL[e.status] || e.status}</span>{" "}
            {e.timestamp ? dayjs(e.timestamp).format("MMM D") : "—"}
          </span>
        </span>
      ))}
    </div>
  );
}

const STAMP_TOOLTIP_LIMIT = 10;

/** This month's collected stamps, one labeled tile per stage in pipeline order. */
function StampCollection({ kanban }) {
  const startOfMonth = dayjs().startOf("month");
  const stamps = kanban
    .flatMap((col) => col.items)
    .flatMap((item) =>
      (item.timeline || []).map((e) => ({ ...e, company: item.company, title: item.title }))
    )
    .filter((e) => e.timestamp && dayjs(e.timestamp).isAfter(startOfMonth))
    .sort((a, b) => dayjs(b.timestamp) - dayjs(a.timestamp));

  if (stamps.length === 0) return null;

  const groups = Object.keys(STAMPS)
    .map((status) => ({ status, items: stamps.filter((e) => e.status === status) }))
    .filter((g) => g.items.length > 0);

  const tooltipFor = ({ status, items }) => {
    const lines = items
      .slice(0, STAMP_TOOLTIP_LIMIT)
      .map((e) => `${dayjs(e.timestamp).format("MMM D")} · ${e.title || "Untitled"} — ${e.company || "?"}`);
    if (items.length > STAMP_TOOLTIP_LIMIT) lines.push(`+${items.length - STAMP_TOOLTIP_LIMIT} more`);
    return `${stampLabel(status)} (${items.length})\n${lines.join("\n")}`;
  };

  return (
    <div className="card px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-medium text-ink/55">Stamps this month</p>
        <span className="text-xs text-ink/40">{stamps.length} total · hover a stage to see the roles</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const tooltip = tooltipFor(g);
          return (
            <div
              key={g.status}
              title={tooltip}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-lg bg-canvas border border-mist/60 cursor-default"
            >
              <Stamp status={g.status} size="sm" seed={g.status} title={tooltip} />
              <span className="text-xs text-ink/70">{stampLabel(g.status)}</span>
              <span className="text-xs font-semibold text-ink tabular-nums">{g.items.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, terms }) {
  if (!text || terms.length === 0) return text;
  const parts = text.split(new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi"));
  // split() with a capturing group puts the matched pieces at the odd indices
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-bubblegum-200 text-ink rounded-sm px-0.5 -mx-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function searchableText(item, stageLabel) {
  const reason = REJECTION_REASONS.find((r) => r.value === item.rejection_reason)?.label;
  const timelineNotes = (item.timeline || []).map((e) => e.note);
  return [item.title, item.company, item.notes, stageLabel, reason, ...timelineNotes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function SearchBox({ value, onChange }) {
  return (
    <div className="relative w-full sm:w-80">
      <Icon
        name="search"
        size={18}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none"
      />
      <input
        type="text"
        className="input pl-9 pr-8"
        placeholder="Search title, company, stage, notes…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        aria-label="Search applications"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors"
          aria-label="Clear search"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

function AppRow({ item, colStatus, terms = [], resumes = [] }) {
  const qc = useQueryClient();

  const update = useMutation({
    mutationFn: ({ id, payload }) => applicationsApi.update(id, payload),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["kanban"] });
      qc.invalidateQueries({ queryKey: ["application", result?.id] });
      qc.invalidateQueries({ queryKey: ["application-analysis"] });
    },
  });

  const next = NEXT_STATUS[colStatus];
  const stageDays = item.status_since != null ? daysSince(item.status_since) : null;

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-t border-mist/60 first:border-t-0 hover:bg-canvas/60 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            to={`/jobs/${item.job_id}`}
            className="font-medium text-sm text-ink hover:text-petrol-500 hover:underline truncate"
          >
            <Highlight text={item.title || "Untitled"} terms={terms} />
          </Link>
          <span className="text-xs text-ink/55">
            <Highlight text={item.company} terms={terms} />
          </span>
          {item.apply_url && (
            <a
              href={item.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-xs text-petrol-500 hover:underline"
            >
              Application Link
              <Icon name="open_in_new" size={12} />
            </a>
          )}
        </div>

        <div className="mt-1">
          <TimelineTrail timeline={item.timeline} />
        </div>

        {colStatus !== "saved" && resumes.length > 0 && (
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <Icon name="description" size={13} className="text-ink/30" />
            <select
              className={clsx(
                "bg-transparent border-0 p-0 text-xs cursor-pointer outline-none hover:text-ink",
                item.resume_id ? "text-ink/60" : "text-ink/35"
              )}
              value={item.resume_id || ""}
              onChange={(e) =>
                e.target.value && update.mutate({ id: item.id, payload: { resume_id: e.target.value } })
              }
              aria-label="Resume sent"
            >
              {!item.resume_id && <option value="">Which resume did you send?</option>}
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {item.resume_tailored && (
              <span className="px-1.5 py-0.5 rounded bg-petrol-50 text-petrol-600">tailored</span>
            )}
          </div>
        )}

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
            <p className="text-xs text-ink/70 whitespace-nowrap">
              Applied {dayjs(item.applied_at).format("MMM D")}
            </p>
          )}
          {stageDays != null && (
            <p className="text-xs text-ink/40 whitespace-nowrap">
              {stageDays === 0 ? "today" : `${stageDays}d in stage`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {colStatus !== "rejected" && colStatus !== "withdrawn" && (
            <button
              className="text-xs px-2 py-1 rounded text-ink/40 hover:text-coral-600 hover:bg-coral-50 whitespace-nowrap transition-colors disabled:opacity-50"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: item.id, payload: { status: "rejected" } })}
            >
              Mark rejected
            </button>
          )}
          {next && (
            <button
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-petrol-500 text-white hover:bg-bubblegum-500 whitespace-nowrap transition-colors disabled:opacity-50"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: item.id, payload: { status: next } })}
            >
              {SHORT_LABEL[next]}
              <Icon name="arrow_forward" size={13} />
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

  const { data: resumes = [] } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  // Search and tab live in the URL, so opening a job and hitting Back returns to the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const view = searchParams.get("view") === "analysis" ? "analysis" : "list";
  const setParam = (key, value) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  const setQuery = (q) => setParam("q", q);

  if (isLoading) return <PageLoader />;

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  const totalApps = kanban.reduce((sum, col) => sum + col.items.length, 0);
  const rejected = kanban.find((c) => c.status === "rejected")?.items || [];
  const sponsorshipRejections = rejected.filter((i) => i.rejection_reason === "sponsorship").length;
  const activeStages = kanban
    .map((col) => ({
      ...col,
      items: searching
        ? col.items.filter((item) => {
            const haystack = searchableText(item, col.label);
            return terms.every((t) => haystack.includes(t));
          })
        : col.items,
    }))
    .filter((col) => col.items.length > 0);
  const matchCount = activeStages.reduce((sum, col) => sum + col.items.length, 0);

  const header = (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Application Tracker</h1>
          <p className="text-sm text-ink/55 mt-0.5">
            {totalApps} applications tracked
            {sponsorshipRejections > 0 && (
              <span className="ml-2 text-coral-500">
                · {sponsorshipRejections} sponsorship rejection{sponsorshipRejections > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        {totalApps > 0 && view === "list" && <SearchBox value={query} onChange={setQuery} />}
      </div>

      {totalApps > 0 && (
        <div className="flex gap-1 p-1 bg-petrol-50 rounded-lg w-fit">
          {[
            ["list", "Applications", "view_agenda"],
            ["analysis", "Analysis", "insights"],
          ].map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setParam("view", key === "analysis" ? "analysis" : "")}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                view === key ? "bg-white shadow text-ink" : "text-ink/55 hover:text-ink/90"
              )}
            >
              <Icon name={icon} size={14} />
              {label}
            </button>
          ))}
        </div>
      )}
    </>
  );

  if (view === "analysis" && totalApps > 0) {
    return (
      <div className="space-y-5">
        {header}
        <TrackerAnalysis resumes={resumes} reasonLabel={reasonLabel} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      {/* Pipeline overview — keeps every stage visible without a horizontal scroll */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {kanban.map((col) => (
            <div key={col.status} className="flex items-center gap-2">
              <span
                className={clsx(
                  "w-2 h-2 rounded-full",
                  col.items.length ? tint(col.status).dot : "bg-mist"
                )}
              />
              <span className={clsx("text-xs", col.items.length ? "text-ink/80" : "text-ink/40")}>
                {col.label}
              </span>
              <span
                className={clsx(
                  "text-xs font-semibold px-1.5 rounded",
                  col.items.length ? "bg-petrol-50 text-ink/80" : "text-ink/25"
                )}
              >
                {col.items.length}
              </span>
            </div>
          ))}
        </div>
      </div>

      {searching && (
        <p className="text-sm text-ink/55 px-1">
          {matchCount} of {totalApps} applications match{" "}
          <span className="font-medium text-ink">“{query.trim()}”</span>
        </p>
      )}

      {!searching && <StampCollection kanban={kanban} />}

      {/* Stages stacked vertically */}
      {activeStages.map((col) => (
        <div key={col.status}>
          <div className="flex items-center gap-2 mb-2">
            <span className={clsx("w-1 h-4 rounded-full", tint(col.status).bar)} />
            <h2 className="text-sm font-semibold text-ink/80">{col.label}</h2>
            <span className="text-xs text-ink/40">{col.items.length}</span>
          </div>
          <div className="card overflow-hidden flex">
            {/* the colour block that tells sections apart without shouting */}
            <div className={clsx("w-1 flex-shrink-0", tint(col.status).bar)} />
            <div className={clsx("flex-1 min-w-0", tint(col.status).tint)}>
              {col.items.map((item) => (
                <AppRow key={item.id} item={item} colStatus={col.status} terms={terms} resumes={resumes} />
              ))}
            </div>
          </div>
        </div>
      ))}

      {searching && matchCount === 0 && (
        <div className="card p-10 text-center">
          <Icon name="search_off" size={32} className="mb-2 text-ink/25" />
          <p className="font-medium text-ink/80">No applications match “{query.trim()}”</p>
          <p className="text-sm text-ink/55 mt-1 mb-4">
            Try a company name, part of a job title, or a stage like “applied”.
          </p>
          <button className="btn-secondary" onClick={() => setQuery("")}>
            Clear search
          </button>
        </div>
      )}

      {totalApps === 0 && (
        <div className="card p-12 text-center">
          <p className="font-medium text-ink/80">No applications tracked yet</p>
          <p className="text-sm text-ink/55 mt-1">
            Save or mark a job as applied from its detail page to start tracking.
          </p>
        </div>
      )}
    </div>
  );
}
