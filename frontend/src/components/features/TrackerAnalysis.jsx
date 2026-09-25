import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import clsx from "clsx";
import { insightsApi } from "@/api/insights";
import { applicationsApi } from "@/api/applications";
import { PageLoader } from "@/components/common/Loading";
import Icon from "@/components/common/Icon";
import { POOL_LABELS } from "@/components/common/Badge";

// Below this many rejections, any pattern is as likely chance as signal.
const SMALL_SAMPLE = 10;

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Stat({ label, value, sub, tone = "text-ink" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink/50">{label}</p>
      <p className={clsx("text-2xl font-bold mt-0.5", tone)}>{value}</p>
      {sub && <p className="text-xs text-ink/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-ink/80">{title}</h3>
      {hint && <p className="text-xs text-ink/40 mt-0.5 mb-3">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </div>
  );
}

function OutcomeTable({ rows, labelHeader, labelFor = (r) => r.label, compact = false }) {
  if (!rows?.length) return <p className="text-xs text-ink/40">Nothing sent yet.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-ink/50 border-b border-mist">
          <th className="py-1.5 pr-2 font-medium">{labelHeader}</th>
          <th className="py-1.5 px-2 font-medium text-right">Sent</th>
          {!compact && <th className="py-1.5 px-2 font-medium text-right">Heard back</th>}
          <th className="py-1.5 px-2 font-medium text-right">Rejected</th>
          <th className="py-1.5 pl-2 font-medium text-right">Rejection rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-mist/50 last:border-b-0">
            <td className="py-1.5 pr-2 text-ink/80">{labelFor(r)}</td>
            <td className="py-1.5 px-2 text-right tabular-nums">{r.sent}</td>
            {!compact && <td className="py-1.5 px-2 text-right tabular-nums text-sage-700">{r.advanced}</td>}
            <td className="py-1.5 px-2 text-right tabular-nums text-coral-700">{r.rejected}</td>
            <td className="py-1.5 pl-2 text-right tabular-nums text-ink/60">{pct(r.rejection_rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BulkResumeSetter({ count, resumes, onApply, pending }) {
  const [resumeId, setResumeId] = useState("");
  return (
    <div className="mt-3 rounded-lg bg-gold-50 border border-gold-200 px-3 py-2 text-xs text-gold-700 flex flex-wrap items-center gap-2">
      <Icon name="info" size={14} />
      <span>{count} sent applications don't record which resume went out.</span>
      <span className="text-ink/50">Mark them all as:</span>
      <select
        className="input text-xs py-1 w-56"
        value={resumeId}
        onChange={(e) => setResumeId(e.target.value)}
      >
        <option value="">Choose a resume…</option>
        {resumes.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <button
        className="btn-primary text-xs px-2.5 py-1"
        disabled={!resumeId || pending}
        onClick={() => onApply(resumeId)}
      >
        {pending ? "Saving..." : "Apply"}
      </button>
      <span className="text-ink/40">You can still change any one of them in the list.</span>
    </div>
  );
}

function SkillGaps({ gaps, rejectedCount, otherCount }) {
  if (!gaps?.length) {
    return <p className="text-xs text-ink/50">The rejected roles didn't ask for any technology your resumes lack.</p>;
  }
  return (
    <div className="space-y-1.5">
      {gaps.map((g) => (
        <div key={g.skill} className="flex items-center gap-3 text-xs">
          <span className="w-36 flex-shrink-0 font-medium text-ink truncate" title={g.skill}>{g.skill}</span>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 bg-petrol-50 rounded-full overflow-hidden">
              <div className="h-full bg-coral-400 rounded-full" style={{ width: pct(g.rejected_share) }} />
            </div>
          </div>
          <span className="w-28 text-right tabular-nums text-coral-700">
            {g.rejected_count} of {rejectedCount} rejected
          </span>
          <span className="w-28 text-right tabular-nums text-ink/45">
            {g.other_count} of {otherCount} others
          </span>
          <span className="w-48 flex-shrink-0">
            {g.over_represented && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap text-coral-700 bg-coral-50 border border-coral-200 rounded px-1.5 py-0.5">
                <Icon name="trending_up" size={12} />
                More common in rejections
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function RejectedRoles({ roles, reasonLabel }) {
  if (!roles?.length) return null;
  return (
    <div className="divide-y divide-mist/60">
      {roles.map((r) => (
        <div key={r.application_id} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <Link to={`/jobs/${r.job_id}`} className="text-sm font-medium text-ink hover:text-petrol-500 hover:underline">
              {r.title || "Untitled role"}
            </Link>
            <span className="text-xs text-ink/55">{r.company}</span>
          </div>
          <p className="text-xs text-ink/50 mt-0.5">
            {POOL_LABELS[r.pool] || "Unknown pool"}
            {" · "}
            {reasonLabel(r.reason)}
            {r.days_to_rejection != null && ` · rejected after ${r.days_to_rejection} day${r.days_to_rejection === 1 ? "" : "s"}`}
            {" · "}
            {r.resume_recorded ? r.resume : "resume not recorded"}
          </p>
          {r.missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              <span className="text-xs text-ink/40 mr-0.5">Asked for, not on your resumes:</span>
              {r.missing_skills.map((s) => (
                <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-coral-50 text-coral-700 border border-coral-200">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AiSummary({ summary, analysis, generate }) {
  const stale =
    summary &&
    (summary.sent_count !== analysis.totals.sent || summary.rejected_count !== analysis.rejected_count);
  const s = summary?.summary;

  return (
    <div className="card p-5 border-bubblegum-200 bg-bubblegum-100/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink/80 flex items-center gap-1.5">
            <Icon name="auto_awesome" size={15} className="text-bubblegum-600" />
            AI summary
          </h3>
          <p className="text-xs text-ink/45 mt-0.5">
            {summary
              ? `Based on ${summary.sent_count} sent applications and ${summary.rejected_count} rejections · ${dayjs(summary.created_at).format("MMM D, h:mm A")}`
              : "Reads the numbers below and writes up the patterns and what to do next."}
          </p>
        </div>
        <button
          className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
          onClick={() => generate.mutate()}
          disabled={generate.isPending || analysis.rejected_count === 0}
        >
          {generate.isPending ? "Analyzing (about a minute)..." : summary ? "Refresh summary" : "Summarize with AI"}
        </button>
      </div>

      {generate.isError && <p className="text-xs text-coral-600 mt-2">{generate.error.message}</p>}
      {stale && !generate.isPending && (
        <p className="text-xs text-gold-700 mt-2 flex items-center gap-1">
          <Icon name="update" size={13} />
          Your applications have changed since this was written — refresh for an up-to-date read.
        </p>
      )}

      {s && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="font-medium text-ink">{s.headline}</p>

          {s.patterns?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink/55 uppercase tracking-wide mb-1.5">Patterns</h4>
              <ul className="space-y-1.5">
                {s.patterns.map((p, i) => (
                  <li key={i} className="text-sm text-ink/85">
                    {p.finding}
                    <span className="block text-xs text-ink/50 mt-0.5">{p.evidence}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.skills_to_build?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink/55 uppercase tracking-wide mb-1.5">Skills to build</h4>
              <div className="space-y-1.5">
                {s.skills_to_build.map((k, i) => (
                  <div key={i} className="text-xs bg-white border border-mist rounded px-2.5 py-2">
                    <p className="font-medium text-ink text-sm">{k.skill}</p>
                    <p className="text-ink/70 mt-0.5">{k.why}</p>
                    <p className="text-ink/80 mt-1">
                      <span className="text-ink/45">Start: </span>
                      {k.first_step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {s.resume_actions?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-ink/55 uppercase tracking-wide mb-1.5">Resume</h4>
                <ul className="list-disc list-outside ml-4 space-y-1 text-ink/85">
                  {s.resume_actions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {s.targeting_actions?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-ink/55 uppercase tracking-wide mb-1.5">Which roles to target</h4>
                <ul className="list-disc list-outside ml-4 space-y-1 text-ink/85">
                  {s.targeting_actions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>

          {s.caveat && <p className="text-xs text-ink/50 italic">{s.caveat}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * How applications are turning out: per resume version, where rejections cluster, and which
 * missing skills show up more in rejected roles than in the rest. Numbers are computed
 * server-side for free; only the written summary costs an AI call.
 */
export default function TrackerAnalysis({ resumes, reasonLabel }) {
  const qc = useQueryClient();
  const { data: analysis, isLoading } = useQuery({
    queryKey: ["application-analysis"],
    queryFn: insightsApi.applicationAnalysis,
  });
  const { data: summary } = useQuery({
    queryKey: ["application-summary"],
    queryFn: insightsApi.applicationSummary,
  });

  const generate = useMutation({
    mutationFn: insightsApi.generateApplicationSummary,
    onSuccess: (data) => qc.setQueryData(["application-summary"], data),
  });

  const bulkSet = useMutation({
    mutationFn: async (resumeId) => {
      for (const id of analysis.unrecorded_application_ids) {
        await applicationsApi.update(id, { resume_id: resumeId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["application-analysis"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
  });

  if (isLoading || !analysis) return <PageLoader message="Crunching your applications..." />;

  const { totals } = analysis;
  if (totals.sent === 0) {
    return (
      <div className="card p-10 text-center text-sm text-ink/55">
        Nothing sent yet — analysis starts once you mark applications as applied.
      </div>
    );
  }

  const stageLine = analysis.rejection_stages.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ");
  const reasonLine = analysis.rejection_reasons.map((r) => `${r.count} ${reasonLabel(r.label).toLowerCase()}`).join(", ");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sent" value={totals.sent} />
        <Stat
          label="Heard back"
          value={totals.advanced}
          sub={`${pct(totals.response_rate)} reached an OA, screen or interview`}
          tone="text-sage-700"
        />
        <Stat
          label="Rejected"
          value={totals.rejected}
          sub={
            analysis.median_days_to_rejection != null
              ? `${pct(totals.rejection_rate)} · typically after ${analysis.median_days_to_rejection} days`
              : pct(totals.rejection_rate)
          }
          tone="text-coral-700"
        />
        <Stat label="Still waiting" value={totals.waiting} tone="text-petrol-500" />
      </div>

      {analysis.rejected_count > 0 && analysis.rejected_count < SMALL_SAMPLE && (
        <p className="text-xs text-gold-700 bg-gold-50 border border-gold-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <Icon name="info" size={14} className="flex-shrink-0 mt-px" />
          Only {analysis.rejected_count} rejection{analysis.rejected_count === 1 ? "" : "s"} so far — treat the
          patterns below as things to watch, not conclusions. They sharpen as more outcomes come in.
        </p>
      )}

      <AiSummary summary={summary} analysis={analysis} generate={generate} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="By resume version" hint="Which resume each application went out with.">
          <OutcomeTable rows={analysis.by_resume} labelHeader="Resume" />
          {analysis.unrecorded_application_ids.length > 0 && resumes?.length > 0 && (
            <BulkResumeSetter
              count={analysis.unrecorded_application_ids.length}
              resumes={resumes}
              onApply={(id) => bulkSet.mutate(id)}
              pending={bulkSet.isPending}
            />
          )}
        </Section>

        <Section
          title="Tailored vs. sent as-is"
          hint="Tailored = the text sent differed from the master resume. Recorded from now on when you mark a job applied."
        >
          <OutcomeTable rows={analysis.by_tailoring} labelHeader="Version" />
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Rejections by pool">
          <OutcomeTable
            rows={analysis.by_pool}
            labelHeader="Pool"
            labelFor={(r) => POOL_LABELS[r.label] || "Unknown"}
            compact
          />
        </Section>
        <Section title="Rejections by role type">
          <OutcomeTable rows={analysis.by_role} labelHeader="Role" compact />
        </Section>
      </div>

      <Section
        title="Skills the rejected roles wanted that your resumes don't show"
        hint={`Compared with your ${analysis.other_count} other applications — a gap flagged as more common in rejections is the one worth closing first. Technologies only; requirement sentences are left out.`}
      >
        <SkillGaps
          gaps={analysis.skill_gaps}
          rejectedCount={analysis.rejected_count}
          otherCount={analysis.other_count}
        />
        <Link to="/gaps" className="inline-flex items-center gap-1 text-xs text-petrol-500 hover:underline mt-3">
          All gaps across every JD
          <Icon name="arrow_forward" size={13} />
        </Link>
      </Section>

      {analysis.rejected_count > 0 && (
        <Section
          title={`Rejected roles (${analysis.rejected_count})`}
          hint={[stageLine, reasonLine].filter(Boolean).join(" · ")}
        >
          <RejectedRoles roles={analysis.rejected_roles} reasonLabel={reasonLabel} />
        </Section>
      )}
    </div>
  );
}
