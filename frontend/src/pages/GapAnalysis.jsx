import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insightsApi } from "@/api/insights";
import { PageLoader } from "@/components/common/Loading";
import Badge from "@/components/common/Badge";
import Icon from "@/components/common/Icon";
import clsx from "clsx";

function PriorityBadge({ priority }) {
  const variant = priority === "high" ? "red" : priority === "medium" ? "yellow" : "gray";
  return <Badge variant={variant}>{priority}</Badge>;
}

// Book spine colour carries the priority, so the shelf reads at a glance.
const SPINE = {
  high: "bg-coral-400",
  medium: "bg-gold-400",
  low: "bg-petrol-200",
};

const SHELF_STATUS = [
  { key: "want_to_read", label: "To Read", active: "bg-mist text-ink/80" },
  { key: "reading", label: "Reading", active: "bg-gold-200 text-gold-700" },
  { key: "finished", label: "Finished", active: "bg-sage-200 text-sage-700" },
];

function ShelfControls({ skill, current }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["resume-gaps"] });

  const setStatus = useMutation({
    mutationFn: (status) => insightsApi.setSkillStudy(skill, { status }),
    onSuccess: invalidate,
  });
  const clear = useMutation({
    mutationFn: () => insightsApi.clearSkillStudy(skill),
    onSuccess: invalidate,
  });

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {SHELF_STATUS.map((s) => {
        const on = current === s.key;
        return (
          <button
            key={s.key}
            disabled={setStatus.isPending || clear.isPending}
            onClick={(e) => {
              e.stopPropagation();
              on ? clear.mutate() : setStatus.mutate(s.key);
            }}
            className={clsx(
              "font-hand text-base px-2 py-0.5 rounded-md transition-colors leading-none",
              on ? s.active : "text-ink/40 hover:bg-petrol-50"
            )}
            title={on ? "Click again to clear" : `Mark as ${s.label}`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-ink/80">{title}</h3>
      {subtitle && <p className="text-xs text-ink/40 mt-0.5 mb-3">{subtitle}</p>}
      {children}
    </div>
  );
}

function GapRow({ gap }) {
  const [open, setOpen] = useState(false);
  const status = gap.study?.status;
  const finished = status === "finished";

  return (
    <div
      className={clsx(
        "flex rounded-lg border overflow-hidden transition-colors",
        finished ? "border-sage-200 bg-sage-50/30" : "border-mist"
      )}
    >
      {/* book spine */}
      <div className={clsx("w-1.5 flex-shrink-0", finished ? "bg-sage-400" : SPINE[gap.priority])} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "expand_more" : "chevron_right"} size={14} className="text-ink/25 w-3" />
            <span
              className={clsx(
                "font-medium text-sm flex-1 truncate",
                finished ? "text-sage-700" : "text-ink"
              )}
            >
              {gap.skill}
            </span>
            {!finished && <PriorityBadge priority={gap.priority} />}
            {finished && (
              <Badge variant="green">
                <Icon name="check" size={12} className="mr-0.5" />
                Finished
              </Badge>
            )}
            <span className="text-xs text-ink/55 whitespace-nowrap">
              {gap.jd_count} JDs · {gap.frequency_pct}%
            </span>
          </button>
          <ShelfControls skill={gap.skill} current={status} />
        </div>

        {/* frequency bar */}
        <div className="h-1 bg-petrol-50 mx-3 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full",
              finished
                ? "bg-sage-400"
                : gap.priority === "high"
                ? "bg-coral-400"
                : gap.priority === "medium"
                ? "bg-gold-400"
                : "bg-petrol-200"
            )}
            style={{ width: `${Math.min(gap.frequency_pct * 3, 100)}%` }}
          />
        </div>

        {finished && (
          <p className="text-xs text-sage-700 px-3 pt-2">
            Finished — add it to your resume, and it'll drop off this list next time scores are recalculated.
          </p>
        )}

      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2 text-xs">
          <div className="flex flex-wrap gap-3 text-ink/70">
            <span>
              <span className="text-ink/40">Required in </span>
              <span className="font-medium text-ink/90">{gap.required_count}</span>
              <span className="text-ink/40"> · nice-to-have in </span>
              <span className="font-medium text-ink/90">{gap.nice_to_have_count}</span>
            </span>
            <span>
              <span className="text-ink/40">Avg score of these jobs: </span>
              <span className="font-medium text-ink/90">{gap.avg_job_score}</span>
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-ink/40">Roles:</span>
            {gap.top_roles.map((r) => (
              <span key={r.role} className="bg-petrol-50 text-ink/70 px-1.5 py-0.5 rounded">
                {r.role} ({r.count})
              </span>
            ))}
          </div>

          {gap.how_to_learn && (
            <p className="text-ink/80 bg-petrol-50 border border-petrol-200 rounded px-2 py-1.5">
              <span className="font-medium text-petrol-700">Start here: </span>
              {gap.how_to_learn}
            </p>
          )}

          <div>
            <p className="text-ink/40 mb-1">JDs that wanted it:</p>
            <div className="space-y-0.5">
              {gap.example_jobs.map((j) => (
                <Link
                  key={j.job_id}
                  to={`/jobs/${j.job_id}`}
                  className="block text-petrol-500 hover:underline truncate"
                >
                  {j.title || "Untitled"} — {j.company_name || "?"} ({j.overall_score.toFixed(0)})
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default function GapAnalysis() {
  const [scope, setScope] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["resume-gaps", scope],
    queryFn: () => insightsApi.resumeGaps(scope),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <div className="card p-6 text-coral-600">{error.message}</div>;

  const { meta, gaps, by_role: byRole, strengths, reading_progress: reading } = data;
  const highCount = gaps.filter((g) => g.priority === "high").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Resume Gaps
            <span className="font-hand text-2xl text-ink/40 ml-2">Reading List</span>
          </h1>
          <p className="text-sm text-ink/55 mt-0.5">
            What your JD history keeps asking for that your resume doesn't show — read through it one by one.
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-petrol-50 rounded-lg flex-shrink-0">
          {[
            { key: "all", label: "All JDs" },
            { key: "applied", label: "Applied only" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                scope === s.key ? "bg-white shadow text-ink" : "text-ink/70 hover:text-ink/90"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {meta.jobs_considered === 0 ? (
        <div className="card p-12 text-center">
          <p className="font-medium text-ink/80">
            {meta.resume_name ? "No JDs to analyze in this scope" : "No master resume set"}
          </p>
          <p className="text-sm text-ink/55 mt-1">
            {meta.resume_name
              ? "Analyze some JDs first, or switch back to All JDs."
              : "Add a master resume on the Resume page to enable gap analysis."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "JDs analyzed", value: meta.jobs_considered, sub: `of ${meta.jobs_total} total` },
              {
                label: "Recurring gaps",
                value: gaps.filter((g) => g.jd_count >= 2).length,
                sub: `wanted by 2+ JDs · ${gaps.length} incl. one-offs`,
              },
              { label: "Finished · Reading", value: `${reading.finished} · ${reading.reading}`, sub: `To read: ${reading.want_to_read}` },
              { label: "High priority", value: highCount, sub: "learn these first" },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <p className="text-xs text-ink/55">{s.label}</p>
                <p className="text-2xl font-bold text-ink mt-0.5">{s.value}</p>
                <p className="text-xs text-ink/40">{s.sub}</p>
              </div>
            ))}
          </div>

          <Section
            title="Reading List"
            subtitle={`Sorted by how often it's requested, weighted toward hard requirements and higher-scoring jobs. Based on ${meta.jobs_considered} JDs compared against "${meta.resume_name}". Use the To Read / Reading / Finished buttons on the right to track progress.`}
          >
            <div className="space-y-1.5">
              {gaps.slice(0, 25).map((g) => (
                <GapRow key={g.skill} gap={g} />
              ))}
            </div>
            {gaps.length > 25 && (
              <p className="text-xs text-ink/40 mt-3">
                +{gaps.length - 25} more low-frequency gaps not shown.
              </p>
            )}
          </Section>

          <Section title="Gaps by role" subtitle="Which kind of role demands what you're missing.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {byRole.map((r) => (
                <div key={r.role} className="border border-mist rounded-lg p-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="font-medium text-sm text-ink">{r.role}</p>
                    <p className="text-xs text-ink/40">{r.jd_count} JDs</p>
                  </div>
                  {r.top_gaps.length > 0 ? (
                    <div className="space-y-1">
                      {r.top_gaps.map((g) => (
                        <div key={g.skill} className="flex items-center gap-2 text-xs">
                          <span
                            className={clsx(
                              "w-1.5 h-1.5 rounded-full flex-shrink-0",
                              g.priority === "high" ? "bg-coral-500" : g.priority === "medium" ? "bg-gold-500" : "bg-petrol-200"
                            )}
                          />
                          <span className="text-ink/80 flex-1 truncate">{g.skill}</span>
                          <span className="text-ink/40 flex-shrink-0">
                            {g.jd_count}/{r.jd_count}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-sage-600">No gaps in this role family.</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {strengths.length > 0 && (
            <Section
              title="Your strengths in this market"
              subtitle="Skills you already have that these JDs ask for most — lead with these on every resume."
            >
              <div className="flex flex-wrap gap-1.5">
                {strengths.map((s) => (
                  <span
                    key={s.skill}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sage-100 text-sage-700 text-xs font-medium"
                  >
                    {s.skill}
                    <span className="text-sage-600/70">{s.jd_count}</span>
                  </span>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
