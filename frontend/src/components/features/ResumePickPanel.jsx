import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import { resumeApi } from "@/api/resume";
import Icon from "@/components/common/Icon";
import ResumeEditExport from "./ResumeEditExport";
import clsx from "clsx";

const TRACK_LABELS = { frontend: "Frontend", fullstack: "Product / Full-Stack" };

function Candidate({ candidate, reason, active, isRecommendation, onUse }) {
  if (!candidate) return null;
  return (
    <div
      className={clsx(
        "rounded-lg border p-3",
        active ? "border-petrol-200 bg-petrol-50" : "border-mist bg-white"
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          name={active ? "check_circle" : "radio_button_unchecked"}
          size={15}
          className={active ? "text-petrol-500" : "text-ink/30"}
        />
        <p className={clsx("text-sm", active ? "font-semibold text-ink" : "text-ink/70")}>
          {candidate.name}
        </p>
        {candidate.track && (
          <span className="text-xs text-ink/40">{TRACK_LABELS[candidate.track] || candidate.track}</span>
        )}
        {isRecommendation && (
          <span className="text-xs text-petrol-600 bg-petrol-100 px-1.5 py-0.5 rounded-full">
            Recommended
          </span>
        )}
        {!active && onUse && (
          <button
            className="ml-auto text-xs text-petrol-600 hover:underline flex-shrink-0"
            onClick={onUse}
          >
            Use this instead
          </button>
        )}
      </div>
      <p className="text-xs text-ink/55 mt-1 ml-6">{reason}</p>
      {candidate.shared_skills?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 ml-6">
          {candidate.shared_skills.slice(0, 8).map((s) => (
            <span key={s} className="text-xs bg-white border border-mist text-ink/60 px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const COVERAGE_STYLES = {
  added: "bg-sage-100 text-sage-700 border-sage-200",
  already_covered: "bg-petrol-50 text-ink/70 border-mist",
  missing: "bg-white text-ink/40 border-dashed border-mist line-through",
};

function KeywordCoverage({ coverage }) {
  if (!coverage?.length) return null;
  const count = (status) => coverage.filter((k) => k.status === status).length;
  const before = count("already_covered");
  const after = before + count("added");
  const order = { added: 0, already_covered: 1, missing: 2 };
  const sorted = [...coverage].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));

  return (
    <div>
      <p className="text-xs text-ink/70 mb-1.5">
        <span className="font-semibold text-ink">Keyword coverage</span> {before} →{" "}
        <span className="font-semibold text-sage-700">{after}</span> of {coverage.length}
        <span className="text-ink/40"> · struck-through ones aren't on your resume, so they weren't added</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {sorted.map((k) => (
          <span
            key={k.keyword}
            title={k.note || undefined}
            className={clsx(
              "text-xs px-1.5 py-0.5 rounded border",
              COVERAGE_STYLES[k.status] || COVERAGE_STYLES.already_covered
            )}
          >
            {k.status === "added" && "+ "}
            {k.keyword}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChangeList({ changes }) {
  if (!changes?.length) return null;
  return (
    <details className="group">
      <summary className="text-xs text-ink/70 cursor-pointer select-none flex items-center gap-1 list-none">
        <Icon name="chevron_right" size={14} className="transition-transform group-open:rotate-90" />
        What changed ({changes.length})
      </summary>
      <div className="space-y-1.5 mt-1.5">
        {changes.map((c, i) => (
          <div key={i} className="text-xs bg-white border border-mist rounded px-2 py-1.5">
            <p className="font-medium text-ink">{c.section}</p>
            <p className="text-ink/80 mt-0.5">{c.change}</p>
            {c.evidence && (
              <p className="text-ink/50 mt-1">
                <span className="text-ink/40">Backed by: </span>
                <span className="italic">{c.evidence}</span>
              </p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * Picks which master resume to send for this JD and, on request, revises it to cover as many
 * of the JD's keywords as the candidate's real experience supports. The pick is rule-based
 * and free, so it renders immediately; only the revision costs an AI call.
 */
export default function ResumePickPanel({ jobId, jobTitle }) {
  const qc = useQueryClient();

  const { data: pick, isLoading } = useQuery({
    queryKey: ["resume-pick", jobId],
    queryFn: () => jobsApi.getResumePick(jobId),
  });

  // The recommendation is a suggestion, not a verdict — the JD may read differently to you.
  const [overrideId, setOverrideId] = useState(null);
  const chosenId = overrideId || pick?.recommended?.resume_id;

  // The pick only carries metadata; the editor needs the document itself.
  const { data: chosenResume } = useQuery({
    queryKey: ["resume", chosenId],
    queryFn: () => resumeApi.get(chosenId),
    enabled: Boolean(chosenId),
  });

  const { data: revision } = useQuery({
    queryKey: ["resume-revision", jobId],
    queryFn: () => jobsApi.getResumeRevision(jobId),
  });

  const generate = useMutation({
    mutationFn: () => jobsApi.generateResumeRevision(jobId, overrideId),
    onSuccess: (data) => qc.setQueryData(["resume-revision", jobId], data),
  });

  if (isLoading) return null;

  const recommended = pick?.recommended;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink/80">Which Resume to Send</h3>
          <p className="text-xs text-ink/40 mt-0.5">
            Picks between your master resumes, then revises the chosen one to cover as many of
            this job's keywords as your real experience supports — nothing invented.
          </p>
        </div>
        {recommended && (
          <button
            className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? "Revising (about a minute)..." : revision ? "Revise again" : "Revise for this job"}
          </button>
        )}
      </div>

      {!recommended && (
        <p className="text-xs text-ink/55">
          No master resume set yet — add one on the Resume page to get a recommendation.
        </p>
      )}

      {recommended && (
        <div className="space-y-2">
          <Candidate
            candidate={recommended}
            reason={pick.reason}
            isRecommendation
            active={chosenId === recommended.resume_id}
            onUse={() => setOverrideId(null)}
          />
          {pick.runner_up && (
            <Candidate
              candidate={pick.runner_up}
              reason={pick.runner_up_reason}
              active={chosenId === pick.runner_up.resume_id}
              onUse={() => setOverrideId(pick.runner_up.resume_id)}
            />
          )}
          {pick.is_close_call && (
            <p className="text-xs text-gold-700 flex items-start gap-1">
              <Icon name="info" size={13} className="flex-shrink-0 mt-0.5" />
              Close call — the JD doesn't clearly favour either version, so read it before deciding.
            </p>
          )}
        </div>
      )}

      {generate.isError && <p className="text-xs text-coral-600 mt-2">{generate.error.message}</p>}

      {revision && (
        <div className="mt-4 pt-4 border-t border-mist/60 space-y-3">
          <div
            className={clsx(
              "rounded-lg border px-3 py-2 text-xs flex items-start gap-1.5",
              revision.is_stretch
                ? "border-gold-200 bg-gold-50 text-gold-700"
                : "border-sage-200 bg-sage-50 text-sage-700"
            )}
          >
            <Icon
              name={revision.is_stretch ? "warning" : "check_circle"}
              size={14}
              className="flex-shrink-0 mt-0.5"
            />
            <span>
              <span className="font-medium">
                {revision.is_stretch ? "Stretch — not a primary target. " : "Good fit. "}
              </span>
              {revision.stretch_reason}
            </span>
          </div>

          <div className="rounded-lg border border-bubblegum-200 bg-bubblegum-100/40 p-3 space-y-3">
            <p className="text-xs text-ink/50 flex items-center gap-1">
              <Icon name="auto_awesome" size={13} className="text-bubblegum-600" />
              AI revision of {revision.resume_name} — review it in the diff below before sending
            </p>

            <KeywordCoverage coverage={revision.keyword_coverage} />

            {revision.new_numbers?.length > 0 && (
              <p className="text-xs text-coral-700 bg-coral-50 border border-coral-200 rounded px-2 py-1.5 flex items-start gap-1">
                <Icon name="warning" size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  These numbers aren't in your original resume: {revision.new_numbers.join(", ")}.
                  Check them before sending — every metric should be one you can back up.
                </span>
              </p>
            )}

            <ChangeList changes={revision.changes} />
          </div>
        </div>
      )}

      {chosenResume && (
        <ResumeEditExport
          originalText={chosenResume.raw_text}
          storageKey={`resume-pick-edit:${jobId}:${chosenResume.id}`}
          jobTitle={jobTitle}
          suggestedText={revision?.resume_id === chosenResume.id ? revision.revised_text : null}
        />
      )}
    </div>
  );
}
