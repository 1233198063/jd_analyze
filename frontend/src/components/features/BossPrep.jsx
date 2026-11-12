import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import dayjs from "dayjs";
import { jobsApi } from "@/api/jobs";
import Icon from "@/components/common/Icon";
import { Spinner } from "@/components/common/Loading";
import BossAvatar from "./game/BossAvatar";
import { ClearStamp, Hearts } from "./game/QuestParts";

// Stages that unlock it (backend: jobs.INTERVIEW_STAGES). An OA is a coding test, not a conversation.
export const BOSS_STAGES = new Set(["phone_screen", "interview"]);

function Check({ id, checked, onToggle, children }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-petrol-500 flex-shrink-0"
        checked={checked.includes(id)}
        onChange={() => onToggle(id)}
      />
      <span className={clsx("flex-1", checked.includes(id) && "text-ink/45")}>{children}</span>
    </label>
  );
}

function Part({ title, icon, children }) {
  return (
    <div className="pt-4 border-t border-mist first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45 mb-2 inline-flex items-center gap-1">
        <Icon name={icon} size={14} />
        {title}
      </p>
      <div className="space-y-3 text-sm text-ink/80">{children}</div>
    </div>
  );
}

/** Every checkable item's key, in display order — the "boss HP" is how many are left. */
function itemKeys(c) {
  return [
    "brief",
    "why",
    ...(c.star_stories || []).map((_, i) => `star:${i}`),
    ...(c.system_design || []).map((_, i) => `sd:${i}`),
    ...(c.coding_focus || []).map((_, i) => `code:${i}`),
    "ask",
  ];
}

/**
 * Boss prep: unlocked when an application reaches a phone screen or interview. Built once from
 * the JD and the resume actually sent (one Codex call), then ticked off item by item — each tick
 * takes a bite out of the boss's HP.
 */
export default function BossPrep({ jobId, company, stage }) {
  const qc = useQueryClient();
  const { data: prep, isLoading } = useQuery({
    queryKey: ["interview-prep", jobId],
    queryFn: () => jobsApi.getInterviewPrep(jobId),
  });

  // Plain state, not useMutation: StrictMode's remount detaches a mutation started from an
  // effect and leaves it pending forever (same as the cover letter's auto-draft).
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      qc.setQueryData(["interview-prep", jobId], await jobsApi.generateInterviewPrep(jobId));
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }, [jobId, qc]);

  // Unlocking is the moment: the first time the card shows for this job, build the checklist.
  const started = useRef(false);
  useEffect(() => {
    if (isLoading || prep || started.current || !BOSS_STAGES.has(stage)) return;
    started.current = true;
    generate();
  }, [isLoading, prep, stage, generate]);

  const toggle = async (key) => {
    const checked = prep.checked.includes(key) ? prep.checked.filter((k) => k !== key) : [...prep.checked, key];
    qc.setQueryData(["interview-prep", jobId], { ...prep, checked });
    try {
      await jobsApi.updateInterviewPrep(jobId, checked);
    } catch (e) {
      setError(e.message);
      qc.invalidateQueries({ queryKey: ["interview-prep", jobId] });
    }
  };

  const c = prep?.content;
  const keys = c ? itemKeys(c) : [];
  const done = keys.filter((k) => prep.checked.includes(k)).length;
  const hp = keys.length ? 1 - done / keys.length : 1;
  const ready = c && done === keys.length;

  return (
    <div className="card p-5 border-clay-200">
      <div className="flex items-center gap-4 flex-wrap">
        <BossAvatar stage={stage} company={company} size={64} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink inline-flex items-center gap-1.5">
            <Icon name="swords" size={18} className="text-clay-600" />
            Boss prep · {company}
          </p>
          <p className="text-xs text-ink/50 mt-0.5">
            Unlocked at the {stage === "phone_screen" ? "phone screen" : "interview"} — built from this JD and the
            resume you sent. Every item you tick takes a bite out of its HP.
          </p>
        </div>
        {c && (
          <div className="text-right">
            <Hearts remaining={hp} size={20} />
            <p className={clsx("mt-0.5 text-xs tabular-nums", ready ? "text-sage-700 font-semibold" : "text-ink/55")}>
              {done}/{keys.length} prepared
            </p>
          </div>
        )}
      </div>

      {ready && (
        <p className="mt-3 flex items-center gap-3 text-sm text-sage-700">
          <ClearStamp /> Ready for the boss. Go get it.
        </p>
      )}

      {(isLoading || generating) && !c && (
        <div className="mt-4 text-sm text-ink/55 flex items-center gap-2">
          <Spinner size="sm" /> Building your prep checklist from the JD and your resume — about a minute.
        </div>
      )}
      {error && <p className="mt-3 text-sm text-coral-600">{error}</p>}

      {c && (
        <div className="mt-5 space-y-4">
          <Part title="Know the company" icon="apartment">
            <Check id="brief" checked={prep.checked} onToggle={toggle}>
              <span className="font-medium">Read the brief</span>
              <ul className="mt-1 list-disc list-inside text-ink/70 space-y-0.5">
                {(c.company_brief || []).map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </Check>
            <Check id="why" checked={prep.checked} onToggle={toggle}>
              <span className="font-medium">Say "why us" out loud once</span>
              <p className="mt-1 text-ink/70">{c.why_company}</p>
            </Check>
          </Part>

          <Part title="Your STAR stories" icon="auto_stories">
            {(c.star_stories || []).map((s, i) => (
              <Check key={i} id={`star:${i}`} checked={prep.checked} onToggle={toggle}>
                <span className="font-medium">For "{s.requirement}"</span>
                <p className="mt-1 text-xs text-ink/50 italic">
                  From your resume: "{(s.resume_line || "").replace(/^[\s•\-–]+/, "")}"
                </p>
                {!s.line_verified && (
                  <p className="mt-1 text-xs text-coral-600 inline-flex items-center gap-1">
                    <Icon name="warning" size={13} /> This line isn't word for word on the resume you sent — check
                    before using it.
                  </p>
                )}
                <dl className="mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-ink/75">
                  <dt className="text-ink/45">Situation</dt><dd>{s.situation}</dd>
                  <dt className="text-ink/45">Task</dt><dd>{s.task}</dd>
                  <dt className="text-ink/45">Action</dt><dd>{s.action}</dd>
                  <dt className="text-ink/45">Result</dt><dd>{s.result}</dd>
                </dl>
                {s.fill_in && (
                  <p className="mt-1.5 rounded-md bg-gold-50 border border-gold-200 px-2 py-1 text-xs text-gold-700">
                    Recall before the interview: {s.fill_in}
                  </p>
                )}
              </Check>
            ))}
          </Part>

          {c.system_design?.length > 0 && (
            <Part title="System design they may ask" icon="account_tree">
              {c.system_design.map((d, i) => (
                <Check key={i} id={`sd:${i}`} checked={prep.checked} onToggle={toggle}>
                  <span className="font-medium">{d.question}</span>
                  <p className="mt-0.5 text-xs text-ink/50">Why it's likely: {d.why_likely}</p>
                  <ul className="mt-1 list-disc list-inside text-ink/70 space-y-0.5">
                    {(d.key_points || []).map((p, j) => <li key={j}>{p}</li>)}
                  </ul>
                </Check>
              ))}
            </Part>
          )}

          <Part title="Coding warm-up" icon="code">
            {(c.coding_focus || []).map((t, i) => (
              <Check key={i} id={`code:${i}`} checked={prep.checked} onToggle={toggle}>
                {t}
              </Check>
            ))}
          </Part>

          <Part title="Questions to ask them" icon="help">
            <Check id="ask" checked={prep.checked} onToggle={toggle}>
              <span className="font-medium">Pick two to ask</span>
              <ul className="mt-1 list-disc list-inside text-ink/70 space-y-0.5">
                {(c.questions_to_ask || []).map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Check>
          </Part>

          {c.new_numbers?.length > 0 && (
            <p className="text-xs text-coral-600 inline-flex items-center gap-1">
              <Icon name="warning" size={13} /> Numbers not on your resume: {c.new_numbers.join(", ")} — check them.
            </p>
          )}

          <div className="flex items-center justify-between pt-2 text-xs text-ink/40">
            <span>Built {dayjs(prep.created_at).format("MMM D, h:mm A")}</span>
            <button
              onClick={generate}
              disabled={generating}
              className="hover:text-ink/70 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {generating ? <Spinner size="sm" /> : <Icon name="refresh" size={14} />} Rebuild (resets ticks)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
