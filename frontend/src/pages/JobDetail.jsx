import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import { applicationsApi } from "@/api/applications";
import { PageLoader } from "@/components/common/Loading";
import ScoreRing, { ScoreBar } from "@/components/features/ScoreRing";
import ResumeTailorPanel from "@/components/features/ResumeTailorPanel";
import ApplicationTimeline from "@/components/features/ApplicationTimeline";
import Badge, { SponsorBadge, LevelBadge, RecommendationBadge, RegionBadge } from "@/components/common/Badge";
import clsx from "clsx";

function Section({ title, children }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function SkillTag({ skill, matched }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        matched ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
      )}
    >
      {skill}
    </span>
  );
}

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [referralOpen, setReferralOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => jobsApi.get(jobId),
  });

  const { data: referral, isLoading: referralLoading } = useQuery({
    queryKey: ["referral", jobId],
    queryFn: () => jobsApi.getReferral(jobId),
    enabled: referralOpen,
  });

  const trackApp = useMutation({
    mutationFn: (status) =>
      data?.job?.application_id
        ? applicationsApi.update(data.job.application_id, { status })
        : applicationsApi.create({ job_id: jobId, status }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["application", result?.id] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
  });

  const rescore = useMutation({
    mutationFn: () => jobsApi.rescore(jobId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job", jobId] }),
  });

  const [applyUrlDraft, setApplyUrlDraft] = useState(null);

  const saveApplyUrl = useMutation({
    mutationFn: (apply_url) =>
      data?.job?.application_id
        ? applicationsApi.update(data.job.application_id, { apply_url })
        : applicationsApi.create({ job_id: jobId, status: "saved", apply_url }),
    onSuccess: () => {
      setApplyUrlDraft(null);
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });

  if (isLoading) return <PageLoader />;
  if (error) return <div className="card p-6 text-red-600">{error.message}</div>;

  const { job, analysis, match_score: ms } = data;
  const rejected = ms?.is_auto_rejected;

  const copy = () => {
    navigator.clipboard.writeText(referral?.message || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            {analysis?.title || job.title || "Untitled Role"}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-gray-600">{analysis?.company_name || job.company_name || "—"}</p>
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
              >
                View Original Posting ↗
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {ms && (
              <RecommendationBadge recommendation={ms.recommendation} score={ms.overall_score} />
            )}
            {analysis?.level && <LevelBadge level={analysis.level} />}
            {analysis?.sponsorship_status && <SponsorBadge status={analysis.sponsorship_status} />}
            {analysis?.is_remote && <Badge variant="blue">Remote</Badge>}
            {!analysis?.is_remote && <RegionBadge location={analysis?.location} isRemote={false} />}
            {analysis?.is_hybrid && <Badge variant="blue">Hybrid</Badge>}
            {analysis?.is_contract && <Badge variant="orange">Contract</Badge>}
          </div>
        </div>

        {ms && (
          <div className="flex-shrink-0">
            <ScoreRing score={ms.overall_score} isRejected={rejected} size={88} />
          </div>
        )}
      </div>

      {/* Auto-reject alert */}
      {rejected && ms?.auto_reject_reasons && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-medium text-red-800 mb-1">Hard Rejected</p>
          <ul className="text-sm text-red-700 space-y-0.5 list-disc list-inside">
            {ms.auto_reject_reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Score breakdown */}
      {ms && !rejected && (
        <Section title="Score Breakdown (100 pts total)">
          <div className="space-y-3">
            <ScoreBar label="H-1B / Visa Friendliness" value={ms.score_h1b} max={30} color="green" />
            <ScoreBar label="Level Match" value={ms.score_level} max={20} color="blue" />
            <ScoreBar label="Skill Match" value={ms.score_skills} max={20} color="purple" />
            <ScoreBar label="Location (Bay Area)" value={ms.score_location} max={10} color="yellow" />
            <ScoreBar label="Company Stability" value={ms.score_company} max={10} color="orange" />
            <ScoreBar label="Product Fit" value={ms.score_product} max={10} color="pink" />
          </div>
          {ms.recommendation_reason && (
            <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
              {ms.recommendation_reason}
            </p>
          )}
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* JD Details */}
        {analysis && (
          <Section title="Job Details">
            <dl className="space-y-2 text-sm">
              {analysis.location && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-24 flex-shrink-0">Location</dt>
                  <dd className="text-gray-900">{analysis.location}</dd>
                </div>
              )}
              {(analysis.years_min != null || analysis.years_max != null) && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-24 flex-shrink-0">Experience</dt>
                  <dd className="text-gray-900">
                    {analysis.years_min ?? 0}–{analysis.years_max ?? "∞"} years
                  </dd>
                </div>
              )}
              {(analysis.salary_min || analysis.salary_max) && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-24 flex-shrink-0">Salary</dt>
                  <dd className="text-gray-900">
                    ${(analysis.salary_min ?? 0).toLocaleString()} –{" "}
                    ${(analysis.salary_max ?? 0).toLocaleString()}
                  </dd>
                </div>
              )}
              {analysis.degree_required && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 w-24 flex-shrink-0">Degree</dt>
                  <dd className="text-gray-900">
                    {analysis.degree_level || "Required"}
                    {analysis.degree_preferred && !analysis.degree_required ? " (preferred)" : ""}
                  </dd>
                </div>
              )}
            </dl>

            {analysis.sponsorship_raw_text && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 italic border border-gray-200">
                "{analysis.sponsorship_raw_text}"
              </div>
            )}
          </Section>
        )}

        {/* Skills */}
        {analysis && (
          <Section title="Skills & Tech Stack">
            <div className="space-y-3">
              {analysis.required_skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Required</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.required_skills.map((s) => (
                      <SkillTag
                        key={s}
                        skill={s}
                        matched={ms?.strengths?.some((st) => st.toLowerCase().includes(s.toLowerCase()))}
                      />
                    ))}
                  </div>
                </div>
              )}
              {analysis.nice_to_have_skills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Nice to have</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.nice_to_have_skills.map((s) => (
                      <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {analysis.tech_stack.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Tech stack</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.tech_stack.map((s) => (
                      <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-50 text-gray-600">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Resume gaps */}
        {ms && !rejected && (
          <Section title="Resume Gaps">
            {ms.missing_keywords.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-red-600 mb-1.5">Missing keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {ms.missing_keywords.map((k) => (
                    <span key={k} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-50 text-red-600">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {ms.missing_evidence.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">Evidence gaps</p>
                {ms.missing_evidence.map((e, i) => (
                  <div key={i} className="text-xs">
                    <p className="font-medium text-gray-700">{e.requirement}</p>
                    <p className="text-gray-500">{e.gap}</p>
                  </div>
                ))}
              </div>
            )}
            {ms.missing_keywords.length === 0 && ms.missing_evidence.length === 0 && (
              <p className="text-sm text-green-600">Strong resume match — no major gaps found.</p>
            )}
          </Section>
        )}

        {/* Recommended bullets */}
        {ms?.recommended_bullets?.length > 0 && (
          <Section title="Recommended Resume Bullets">
            <div className="space-y-2">
              {ms.recommended_bullets.map((b, i) => (
                <div key={i} className="text-xs">
                  <p className="text-gray-400 mb-0.5">for: {b.for_skill}</p>
                  <p className="text-gray-800 font-mono bg-gray-50 px-2 py-1.5 rounded border border-gray-200">
                    {b.bullet}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Tailor resume */}
      {!rejected && analysis && <ResumeTailorPanel jobId={jobId} />}

      {/* Red flags */}
      {analysis && (
        <Section title="Red Flags">
          {analysis.red_flags?.length > 0 ? (
            <div className="space-y-2">
              {analysis.red_flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={clsx(
                      "flex-shrink-0 w-2 h-2 rounded-full mt-1.5",
                      flag.severity === "high" ? "bg-red-500" : flag.severity === "medium" ? "bg-yellow-500" : "bg-gray-400"
                    )}
                  />
                  <div>
                    <span className="text-gray-700">{flag.flag}</span>
                    <span className="ml-2 text-xs text-gray-400">({flag.category})</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No red flags detected in this JD.</p>
          )}
        </Section>
      )}

      {/* AI summary */}
      {analysis?.summary && (
        <Section title="Role Summary">
          <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary}</p>
        </Section>
      )}

      {/* Action bar */}
      <div className="card p-4 flex flex-wrap gap-3">
        {!rejected && (
          <>
            <button
              className="btn-primary"
              onClick={() => trackApp.mutate("applied")}
              disabled={trackApp.isPending || job.application_status === "applied"}
            >
              {job.application_status === "applied" ? "Applied" : "Mark Applied"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => trackApp.mutate("saved")}
              disabled={trackApp.isPending || job.application_status === "saved"}
            >
              {job.application_status === "saved" ? "Saved" : "Save"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setReferralOpen(true)}
            >
              Generate Referral Message
            </button>
          </>
        )}
        <button
          className="btn-secondary ml-auto"
          onClick={() => rescore.mutate()}
          disabled={rescore.isPending}
        >
          {rescore.isPending ? "Rescoring..." : "Re-score"}
        </button>
      </div>

      {/* Application timeline */}
      {job.application_id && <ApplicationTimeline applicationId={job.application_id} />}

      {/* Application link */}
      <div className="card p-4">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          投递链接 Application Link
        </label>
        <div className="flex gap-2 mt-2">
          <input
            type="url"
            className="input flex-1"
            placeholder="https://... (投递后台/确认邮件链接)"
            value={applyUrlDraft ?? job.apply_url ?? ""}
            onChange={(e) => setApplyUrlDraft(e.target.value)}
          />
          <button
            className="btn-secondary"
            disabled={saveApplyUrl.isPending || applyUrlDraft === null || applyUrlDraft === (job.apply_url ?? "")}
            onClick={() => saveApplyUrl.mutate(applyUrlDraft)}
          >
            {saveApplyUrl.isPending ? "Saving..." : "Save"}
          </button>
          {job.apply_url && (
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary whitespace-nowrap"
            >
              打开 ↗
            </a>
          )}
        </div>
      </div>

      {/* Referral message modal */}
      {referralOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">LinkedIn Referral Message</h3>
              <button
                onClick={() => setReferralOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {referralLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">Generating...</div>
            ) : referral ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Subject / Connection Note</p>
                  <p className="text-sm font-medium text-gray-800">{referral.subject_line}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Message</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap font-mono border border-gray-200">
                    {referral.message}
                  </div>
                </div>
                {referral.tips?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Tips</p>
                    <ul className="text-xs text-gray-600 space-y-0.5 list-disc list-inside">
                      {referral.tips.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  </div>
                )}
                <button
                  className="btn-primary w-full justify-center"
                  onClick={copy}
                >
                  {copied ? "Copied!" : "Copy Message"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
