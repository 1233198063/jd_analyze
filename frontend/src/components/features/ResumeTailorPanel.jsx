import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import Badge from "@/components/common/Badge";
import clsx from "clsx";

function Sub({ title, count, children }) {
  return (
    <div className="border-t border-gray-100 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {title}
        {count != null && <span className="text-gray-400 font-normal normal-case"> ({count})</span>}
      </h4>
      {children}
    </div>
  );
}

function PriorityBadge({ priority }) {
  const variant = priority === "high" ? "red" : priority === "medium" ? "yellow" : "gray";
  return <Badge variant={variant}>{priority}</Badge>;
}

export default function ResumeTailorPanel({ jobId }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tailoring", jobId],
    queryFn: () => jobsApi.getTailoredResume(jobId),
  });

  const generate = useMutation({
    mutationFn: () => jobsApi.tailorResume(jobId),
    onSuccess: (result) => qc.setQueryData(["tailoring", jobId], result),
  });

  const copy = () => {
    navigator.clipboard.writeText(data?.tailored_text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([data?.tailored_text || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tailored_resume.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Tailor My Resume</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Rewrites your master resume to fit this JD's keywords — never invents experience you
            don't have.
          </p>
        </div>
        <button
          className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
        >
          {generate.isPending ? "Tailoring..." : data ? "Regenerate" : "Generate"}
        </button>
      </div>

      {generate.isError && (
        <p className="text-xs text-red-600 mt-2">{generate.error.message}</p>
      )}

      {generate.isPending && (
        <p className="text-xs text-gray-400 mt-3">
          Calling AI to rewrite your resume for this role — this can take 20–30s...
        </p>
      )}

      {data && !generate.isPending && (
        <div className="mt-4 space-y-0">
          <Sub title="Tailored resume">
            <div className="flex gap-2 mb-2">
              <button className="btn-secondary text-xs px-2.5 py-1" onClick={copy}>
                {copied ? "Copied!" : "Copy"}
              </button>
              <button className="btn-secondary text-xs px-2.5 py-1" onClick={download}>
                Download .txt
              </button>
            </div>
            <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-96 overflow-y-auto">
              {data.tailored_text}
            </pre>
          </Sub>

          {data.keyword_coverage?.length > 0 && (
            <Sub title="Keyword coverage" count={data.keyword_coverage.length}>
              <div className="flex flex-wrap gap-1.5">
                {data.keyword_coverage.map((k, i) => (
                  <span
                    key={i}
                    title={k.covered_via || (k.in_tailored_resume ? "" : "Not covered")}
                    className={clsx(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      k.in_tailored_resume
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500 line-through"
                    )}
                  >
                    {k.keyword}
                  </span>
                ))}
              </div>
            </Sub>
          )}

          {data.integration_suggestions?.length > 0 && (
            <Sub title="Ways to honestly work in missing skills" count={data.integration_suggestions.length}>
              <div className="space-y-3">
                {data.integration_suggestions.map((s, i) => (
                  <div key={i} className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-blue-900">{s.skill}</p>
                    <p className="text-gray-600">
                      <span className="text-gray-400">Attach to: </span>
                      <span className="italic">"{s.target_bullet}"</span>
                    </p>
                    <p className="text-gray-800 font-mono bg-white px-2 py-1 rounded border border-blue-100">
                      {s.suggested_addition}
                    </p>
                    <p className="text-gray-600">
                      <span className="font-medium text-gray-500">How to explain it: </span>
                      {s.how_to_explain}
                    </p>
                    <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ⚠ {s.honesty_note}
                    </p>
                  </div>
                ))}
              </div>
            </Sub>
          )}

          {data.trade_off_notes?.length > 0 && (
            <Sub title="Trade-off talking points" count={data.trade_off_notes.length}>
              <div className="space-y-3">
                {data.trade_off_notes.map((t, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3 text-xs space-y-1.5">
                    <p className="font-semibold text-gray-900">{t.topic}</p>
                    <p className="text-gray-700">{t.why_this_choice}</p>
                    {t.alternatives_considered?.length > 0 && (
                      <div className="flex flex-wrap gap-1 items-center">
                        <span className="text-gray-400">vs.</span>
                        {t.alternatives_considered.map((alt) => (
                          <span key={alt} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                            {alt}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-gray-600">{t.why_not_alternatives}</p>
                    <p className="text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                      <span className="font-medium text-gray-500">Say: </span>
                      {t.how_to_explain}
                    </p>
                  </div>
                ))}
              </div>
            </Sub>
          )}

          {data.learning_gaps?.length > 0 && (
            <Sub title="Skills to actually go learn" count={data.learning_gaps.length}>
              <div className="space-y-2">
                {data.learning_gaps.map((g, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{g.skill}</p>
                      <PriorityBadge priority={g.priority} />
                    </div>
                    <p className="text-gray-600">{g.why_it_matters}</p>
                    <p className="text-gray-800">
                      <span className="font-medium text-gray-500">Start here: </span>
                      {g.how_to_learn}
                    </p>
                  </div>
                ))}
              </div>
            </Sub>
          )}
        </div>
      )}

      {!data && !generate.isPending && (
        <p className="text-xs text-gray-400 mt-3">
          Not generated yet for this job. Click Generate to get a tailored resume, missing-keyword
          coverage, honest ways to surface skills from your existing projects, interview trade-off
          talking points, and a list of what to go learn.
        </p>
      )}
    </div>
  );
}
