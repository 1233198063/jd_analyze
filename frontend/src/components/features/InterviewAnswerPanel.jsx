import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";

/**
 * Lets the candidate paste a question they might get asked in an interview for this job and get
 * back a resume-grounded, plain-English answer they can copy straight into an application or say
 * out loud. Keeps a running list so they can build up answers to several likely questions.
 */
export default function InterviewAnswerPanel({ jobId }) {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const generate = useMutation({
    mutationFn: (q) => jobsApi.getInterviewAnswer(jobId, q),
    onSuccess: (data) => {
      setAnswers((prev) => [{ question: data.question, answer: data.answer }, ...prev]);
      setQuestion("");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || generate.isPending) return;
    generate.mutate(trimmed);
  };

  const copy = (text, i) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="card p-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">Practice Interview Answers</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Paste a question you might get asked for this role — get back a plain-English answer
          grounded in your actual resume, ready to copy.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2 items-start">
        <textarea
          className="input flex-1 text-sm resize-y"
          rows={2}
          placeholder="e.g. Tell me about a time you had to debug a tricky production issue."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
          disabled={!question.trim() || generate.isPending}
        >
          {generate.isPending ? "Writing..." : "Generate Answer"}
        </button>
      </form>

      {generate.isError && <p className="text-xs text-red-600 mt-2">{generate.error.message}</p>}

      {answers.length > 0 && (
        <div className="mt-4 space-y-3">
          {answers.map((qa, i) => (
            <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-gray-500">Q: {qa.question}</p>
                <button
                  className="text-xs text-blue-600 hover:underline flex-shrink-0"
                  onClick={() => copy(qa.answer, i)}
                >
                  {copiedIndex === i ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-line">{qa.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
