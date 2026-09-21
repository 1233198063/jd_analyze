import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import { resumeApi } from "@/api/resume";
import Badge from "@/components/common/Badge";
import ResumePreview from "./ResumePreview";
import {
  classifyLines,
  diffResumeSplit,
  extractStreamedResumeText,
  parseTailorStreamOutput,
  extractCandidateName,
  buildResumeFilename,
} from "@/utils/resumeFormat";
import { printElementAsPdf } from "@/utils/printElement";
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

const VIEW_MODES = [
  { key: "diff", label: "Diff" },
  { key: "clean", label: "Clean" },
  { key: "edit", label: "Edit" },
];

export default function ResumeTailorPanel({ jobId, jobTitle }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState("diff");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [streamError, setStreamError] = useState(null);
  const abortRef = useRef(null);

  const { data: masterResume } = useQuery({
    queryKey: ["resume", "master"],
    queryFn: resumeApi.getMaster,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tailoring", jobId],
    queryFn: () => jobsApi.getTailoredResume(jobId),
  });

  const [editedText, setEditedText] = useState(() => {
    try {
      return localStorage.getItem(`tailoring-edit:${jobId}`) || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (editedText === null && data?.tailored_text) setEditedText(data.tailored_text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.tailored_text]);

  useEffect(() => {
    if (editedText === null) return;
    try {
      localStorage.setItem(`tailoring-edit:${jobId}`, editedText);
    } catch {
      // best-effort only — a full storage quota shouldn't break editing
    }
  }, [editedText, jobId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startGenerate = async () => {
    setStreamError(null);
    setStreamBuffer("");
    setIsStreaming(true);
    setViewMode("diff");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const full = await jobsApi.tailorResumeStream(
        jobId,
        (_delta, fullSoFar) => setStreamBuffer(fullSoFar),
        controller.signal
      );
      const parsed = parseTailorStreamOutput(full);
      qc.setQueryData(["tailoring", jobId], parsed);
      setEditedText(parsed.tailored_text);
    } catch (e) {
      if (e.name !== "AbortError") setStreamError(e.message);
    } finally {
      setIsStreaming(false);
    }
  };

  const oldText = masterResume?.raw_text || "";
  const liveNewText = isStreaming ? extractStreamedResumeText(streamBuffer) : data?.tailored_text || "";

  const { oldLines: diffOldLines, newLines: diffNewLines } = useMemo(
    () => diffResumeSplit(oldText, liveNewText),
    [oldText, liveNewText]
  );
  const cleanLines = useMemo(() => classifyLines(data?.tailored_text || ""), [data?.tailored_text]);
  const editLines = useMemo(() => classifyLines(editedText || ""), [editedText]);

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

  const downloadPdf = () => {
    const text = viewMode === "edit" ? editedText : data?.tailored_text;
    const filename = buildResumeFilename(extractCandidateName(text || ""), jobTitle);
    printElementAsPdf("resume-pdf-target", filename);
  };

  if (isLoading) return null;

  const hasResult = Boolean(data) || isStreaming;

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
          onClick={startGenerate}
          disabled={isStreaming}
        >
          {isStreaming ? "Generating..." : data ? "Regenerate" : "Generate"}
        </button>
      </div>

      {streamError && <p className="text-xs text-red-600 mt-2">{streamError}</p>}

      {isStreaming && (
        <p className="text-xs text-gray-400 mt-3">
          Streaming live from the AI — the preview below fills in as it writes...
        </p>
      )}

      {hasResult && (
        <div className="mt-4 space-y-0">
          <div className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {VIEW_MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setViewMode(m.key)}
                    disabled={isStreaming && m.key !== "diff"}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      viewMode === m.key
                        ? "bg-white shadow text-gray-900"
                        : "text-gray-500 hover:text-gray-800",
                      isStreaming && m.key !== "diff" && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap">
                {!isStreaming && data && (
                  <>
                    <button className="btn-secondary text-xs px-2.5 py-1" onClick={copy}>
                      {copied ? "Copied!" : "Copy text"}
                    </button>
                    <button className="btn-secondary text-xs px-2.5 py-1" onClick={download}>
                      Download .txt
                    </button>
                    {viewMode !== "diff" && (
                      <button className="btn-primary text-xs px-2.5 py-1" onClick={downloadPdf}>
                        Download PDF
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {viewMode === "diff" && (
              <>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300" />
                    added (right, tailored)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200" />
                    cut (left, original)
                  </span>
                  {!masterResume?.raw_text && (
                    <span className="text-amber-600">No master resume to diff against.</span>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Original</p>
                    <div className="max-h-[32rem] overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <ResumePreview lines={diffOldLines} className="shadow-none" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Tailored{isStreaming && " (writing live...)"}
                    </p>
                    <div className="max-h-[32rem] overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <ResumePreview lines={diffNewLines} className="shadow-none" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {viewMode === "clean" && !isStreaming && data && (
              <div className="max-h-[32rem] overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3">
                <ResumePreview lines={cleanLines} id="resume-pdf-target" />
              </div>
            )}

            {viewMode === "edit" && !isStreaming && data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-500">Edit</p>
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => setEditedText(data.tailored_text || "")}
                    >
                      Reset to AI version
                    </button>
                  </div>
                  <textarea
                    className="input w-full font-mono text-xs h-[32rem] resize-none"
                    value={editedText ?? ""}
                    onChange={(e) => setEditedText(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Live preview</p>
                  <div className="max-h-[32rem] overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <ResumePreview lines={editLines} id="resume-pdf-target" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {data?.change_notes?.length > 0 && (
            <Sub title="What changed and why" count={data.change_notes.length}>
              <div className="space-y-2">
                {data.change_notes.map((c, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3 text-xs space-y-1">
                    <p className="text-gray-900">{c.change}</p>
                    <p className="text-gray-500">
                      <span className="font-medium text-gray-400">Why: </span>
                      {c.reason}
                    </p>
                    {c.fills_gap && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                        ✓ Fills gap: {c.fills_gap}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Sub>
          )}

          {data?.keyword_coverage?.length > 0 && (
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

          {data?.integration_suggestions?.length > 0 && (
            <Sub
              title="Ways to honestly work in missing skills"
              count={data.integration_suggestions.length}
            >
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

          {data?.trade_off_notes?.length > 0 && (
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

          {data?.learning_gaps?.length > 0 && (
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

      {!hasResult && (
        <p className="text-xs text-gray-400 mt-3">
          Not generated yet for this job. Click Generate to get a tailored resume, missing-keyword
          coverage, honest ways to surface skills from your existing projects, interview trade-off
          talking points, and a list of what to go learn.
        </p>
      )}
    </div>
  );
}
