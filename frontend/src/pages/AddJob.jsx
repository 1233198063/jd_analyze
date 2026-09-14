import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import { AnalyzingLoader } from "@/components/common/Loading";

export default function AddJob() {
  const [mode, setMode] = useState("text"); // "text" | "url"
  const [url, setUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: (payload) => jobsApi.submit(payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      navigate(`/jobs/${data.job_id}`);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === "url") {
      if (!url.trim()) return;
      submit.mutate({ url: url.trim(), raw_text: null });
    } else {
      if (!rawText.trim()) return;
      submit.mutate({ url: null, raw_text: rawText.trim() });
    }
  };

  if (submit.isPending) return <AnalyzingLoader />;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analyze Job Description</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI extracts skills, level, sponsorship signals, and scores this role against your resume.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-5">
        {["text", "url"].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {m === "text" ? "Paste JD" : "URL"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        {mode === "url" ? (
          <div>
            <label className="label">Job posting URL</label>
            <input
              className="input"
              type="url"
              placeholder="https://boards.greenhouse.io/company/jobs/123"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Supports Greenhouse, Lever, Ashby, Workday, and generic company pages.
              LinkedIn and Indeed block scraping — paste the job text for those instead.
            </p>
          </div>
        ) : (
          <div>
            <label className="label">Paste job description</label>
            <textarea
              className="input min-h-[320px] resize-y font-mono text-xs"
              placeholder="Paste the full job description here..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Include everything: requirements, qualifications, sponsorship language.
            </p>
          </div>
        )}

        {submit.isError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {submit.error?.message}
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full justify-center"
          disabled={submit.isPending || (mode === "url" ? !url.trim() : !rawText.trim())}
        >
          Analyze JD
        </button>
      </form>

      <div className="mt-4 card p-4 bg-blue-50 border-blue-200">
        <p className="text-xs font-medium text-blue-800 mb-1">What happens next</p>
        <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
          <li>Claude AI parses title, level, skills, tech stack, salary</li>
          <li>Sponsorship language detected and H-1B risk scored</li>
          <li>Hard-reject filters applied (no sponsor, 4+ years, senior roles)</li>
          <li>Resume match scored across 6 dimensions (100 pts total)</li>
          <li>DOL filing history checked against company database</li>
        </ul>
      </div>
    </div>
  );
}
