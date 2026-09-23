import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resumeApi } from "@/api/resume";
import { jobsApi } from "@/api/jobs";
import { PageLoader } from "@/components/common/Loading";
import ResumePreview from "@/components/features/ResumePreview";
import { classifyLines, extractCandidateName, buildResumeFilename } from "@/utils/resumeFormat";
import { printElementAsPdf } from "@/utils/printElement";
import Icon from "@/components/common/Icon";
import dayjs from "dayjs";

export default function ResumePage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [rawText, setRawText] = useState("");
  const [isMaster, setIsMaster] = useState(false);
  const [editId, setEditId] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const qc = useQueryClient();

  const { data: resumes = [], isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  const create = useMutation({
    mutationFn: (p) => resumeApi.create(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      reset();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, payload }) => resumeApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resumes"] });
      reset();
    },
  });

  const del = useMutation({
    mutationFn: resumeApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resumes"] }),
  });

  const rescoreAll = useMutation({
    mutationFn: jobsApi.rescoreAll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["resume-gaps"] });
    },
  });

  const reset = () => {
    setShowForm(false);
    setName("");
    setRawText("");
    setIsMaster(false);
    setEditId(null);
  };

  const startEdit = (r) => {
    setEditId(r.id);
    setName(r.name);
    setRawText(r.raw_text);
    setIsMaster(r.is_master);
    setShowForm(true);
  };

  const downloadPdf = (r) => {
    const filename = buildResumeFilename(extractCandidateName(r.raw_text), r.name);
    printElementAsPdf(`resume-pdf-${r.id}`, filename);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { name, raw_text: rawText, is_master: isMaster };
    if (editId) {
      update.mutate({ id: editId, payload });
    } else {
      create.mutate(payload);
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Resume</h1>
          <p className="text-sm text-ink/55 mt-0.5">
            Your master resume is used for all job scoring. Keep it up to date.
          </p>
        </div>
        {!showForm && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              className="btn-secondary"
              onClick={() => rescoreAll.mutate()}
              disabled={rescoreAll.isPending || resumes.length === 0}
            >
              {rescoreAll.isPending ? "Re-scoring..." : "Re-score all jobs"}
            </button>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              + Add Resume
            </button>
          </div>
        )}
      </div>

      {rescoreAll.isError && (
        <div className="rounded-lg bg-coral-50 border border-coral-200 px-4 py-3 text-sm text-coral-700">
          {rescoreAll.error.message}
        </div>
      )}

      {rescoreAll.data && !rescoreAll.isPending && (
        <div className="rounded-lg bg-sage-50 border border-sage-200 px-4 py-3 text-sm">
          <p className="text-sage-700">
            Re-scored <span className="font-semibold">{rescoreAll.data.rescored}</span> jobs against{" "}
            "{rescoreAll.data.resume_name}" ({rescoreAll.data.resume_skill_count} skills) —{" "}
            <span className="font-semibold">{rescoreAll.data.score_changed}</span> scores changed.
          </p>
          {rescoreAll.data.recommendation_changes?.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <p className="text-xs font-medium text-sage-700">
                {rescoreAll.data.recommendation_changes.length} recommendation changes:
              </p>
              {rescoreAll.data.recommendation_changes.slice(0, 8).map((c) => (
                <Link
                  key={c.job_id}
                  to={`/jobs/${c.job_id}`}
                  className="block text-xs text-sage-700 hover:underline truncate"
                >
                  {c.from_recommendation} <Icon name="arrow_forward" size={11} />{" "}
                  <span className="font-medium">{c.to_recommendation}</span>{" "}
                  ({c.from_score} <Icon name="arrow_forward" size={11} /> {c.to_score}) · {c.title || "Untitled"} —{" "}
                  {c.company_name || "?"}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <h2 className="font-semibold text-ink">{editId ? "Edit Resume" : "Add Resume"}</h2>
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              placeholder="e.g. Master Resume v2 – Full Stack"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Resume text</label>
            <textarea
              className="input min-h-[400px] resize-y font-mono text-xs"
              placeholder="Paste your full resume text here (plain text, no PDF)..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              required
            />
            <p className="text-xs text-ink/40 mt-1">
              Plain text works best. Include all sections: summary, experience, projects, skills, education.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isMaster}
              onChange={(e) => setIsMaster(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-ink/80">Set as master resume (used for scoring)</span>
          </label>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary" disabled={create.isPending || update.isPending}>
              {editId ? "Save changes" : "Add resume"}
            </button>
            <button type="button" className="btn-secondary" onClick={reset}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {resumes.map((r) => (
          <div key={r.id} className={`card p-5 ${r.is_master ? "border-petrol-200 bg-petrol-50/30" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink truncate">{r.name}</p>
                  {r.is_master && (
                    <span className="text-xs bg-bubblegum-400 text-ink font-medium px-2 py-0.5 rounded-full">Master</span>
                  )}
                </div>
                <p className="text-xs text-ink/40 mt-0.5">
                  Updated {dayjs(r.updated_at).format("MMM D, YYYY")} ·{" "}
                  {r.raw_text.length.toLocaleString()} chars
                </p>

                {r.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.skills.slice(0, 15).map((s) => (
                      <span key={s} className="text-xs bg-petrol-50 text-ink/70 px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {r.skills.length > 15 && (
                      <span className="text-xs text-ink/40">+{r.skills.length - 15} more</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  className="btn-secondary text-xs px-3 py-1.5"
                  onClick={() => setPreviewId(previewId === r.id ? null : r.id)}
                >
                  {previewId === r.id ? "Hide preview" : "Preview / PDF"}
                </button>
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => startEdit(r)}>
                  Edit
                </button>
                <button
                  className="text-xs px-3 py-1.5 rounded-lg border border-coral-200 text-coral-600 hover:bg-coral-50"
                  onClick={() => { if (confirm("Delete this resume?")) del.mutate(r.id); }}
                >
                  Delete
                </button>
              </div>
            </div>

            {previewId === r.id && (
              <div className="mt-4 pt-4 border-t border-mist/60">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-ink/55">
                    A4 preview — auto-fit to one page
                  </p>
                  <button className="btn-primary text-xs px-2.5 py-1" onClick={() => downloadPdf(r)}>
                    Download PDF
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto bg-canvas border border-mist rounded-lg p-3">
                  <ResumePreview lines={classifyLines(r.raw_text)} id={`resume-pdf-${r.id}`} fitToPage />
                </div>
              </div>
            )}
          </div>
        ))}

        {resumes.length === 0 && !showForm && (
          <div className="card p-12 text-center">
            <Icon name="description" size={32} className="mb-2 text-petrol-500" />
            <p className="font-medium text-ink/80">No resume added yet</p>
            <p className="text-sm text-ink/55 mt-1 mb-4">
              Add your master resume to enable resume-to-JD scoring
            </p>
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              Add Resume
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
