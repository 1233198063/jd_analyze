import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import clsx from "clsx";
import ResumePreview from "./ResumePreview";
import Icon from "@/components/common/Icon";
import {
  classifyLines,
  diffResumeSplit,
  extractCandidateName,
  buildResumeFilename,
} from "@/utils/resumeFormat";
import { printElementAsPdf } from "@/utils/printElement";

const VIEW_MODES = [
  { key: "diff", label: "Diff" },
  { key: "clean", label: "Clean" },
  { key: "edit", label: "Edit" },
];

// Must differ from the tailor panel's target: both can be mounted at once, and a
// duplicate id would make the print stylesheet pick the wrong element.
const PDF_TARGET = "resume-pick-pdf-target";

function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export const resumeDraftKey = (jobId, resumeId) => `resume-pick-edit:${jobId}:${resumeId}`;

/** The version of this resume last left in the editor for this job — i.e. what gets sent. */
export function readResumeDraft(jobId, resumeId) {
  return readStored(resumeDraftKey(jobId, resumeId), null);
}

/**
 * Edit the master resume that was picked for this job, side by side with the original,
 * and export the result as a one-page A4 PDF. Starts from the AI revision when there is
 * one, so the diff shows every proposed change.
 */
export default function ResumeEditExport({ originalText, storageKey, jobTitle, suggestedText }) {
  const seedText = suggestedText || originalText;

  const [viewMode, setViewMode] = useState("diff");
  const [editedText, setEditedText] = useState(() => readStored(storageKey, seedText));
  const [fit, setFit] = useState(null);
  const [pendingPrint, setPendingPrint] = useState(false);

  // What this session last seeded in. Anything else in the box is the user's own work and
  // must survive a revision arriving or being regenerated.
  const seededRef = useRef(null);

  useEffect(() => {
    const stored = readStored(storageKey, null);
    const isUntouched =
      stored === null || stored === originalText || stored === seedText || stored === seededRef.current;
    seededRef.current = seedText;
    setEditedText(isUntouched ? seedText : stored);
  }, [storageKey, originalText, seedText]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, editedText);
    } catch {
      // best-effort only — a full storage quota shouldn't block editing
    }
  }, [editedText, storageKey]);

  const { oldLines, newLines } = useMemo(
    () => diffResumeSplit(originalText, editedText),
    [originalText, editedText]
  );
  const cleanLines = useMemo(() => classifyLines(editedText), [editedText]);

  // Locked scrolling for the two diff panes. Mapped proportionally rather than 1:1
  // because edits make the panes different heights, and a fixed offset would drift
  // further apart the further down you read.
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const syncing = useRef(false);

  const syncScroll = useCallback((fromRef, toRef) => {
    if (syncing.current) return;
    const from = fromRef.current;
    const to = toRef.current;
    if (!from || !to) return;

    syncing.current = true;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    to.scrollTop = fromMax > 0 ? (from.scrollTop / fromMax) * toMax : 0;
    // Released on the next frame: assigning scrollTop fires the other pane's own
    // scroll handler, which would otherwise bounce straight back.
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  // The print target only exists in the clean/edit views, so flip there first and let
  // the effect fire once the preview has actually been committed to the DOM.
  const downloadPdf = () => {
    if (viewMode === "diff") {
      setViewMode("clean");
      setPendingPrint(true);
      return;
    }
    printElementAsPdf(PDF_TARGET, buildResumeFilename(extractCandidateName(editedText), jobTitle));
  };

  useEffect(() => {
    if (!pendingPrint || viewMode === "diff") return;
    setPendingPrint(false);
    printElementAsPdf(PDF_TARGET, buildResumeFilename(extractCandidateName(editedText), jobTitle));
  }, [pendingPrint, viewMode, editedText, jobTitle]);

  const edited = editedText !== originalText;

  return (
    <div className="mt-4 pt-4 border-t border-mist/60">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex gap-1 p-1 bg-petrol-50 rounded-lg">
          {VIEW_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setViewMode(m.key)}
              className={clsx(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                viewMode === m.key ? "bg-white shadow text-ink" : "text-ink/55 hover:text-ink/90"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {suggestedText && editedText !== suggestedText && (
            <button
              className="text-xs text-petrol-600 hover:underline"
              onClick={() => setEditedText(suggestedText)}
            >
              Reset to AI version
            </button>
          )}
          {edited && (
            <button
              className="text-xs text-ink/50 hover:text-ink hover:underline"
              onClick={() => setEditedText(originalText)}
            >
              Reset to original
            </button>
          )}
          <button className="btn-primary text-xs px-2.5 py-1" onClick={downloadPdf}>
            Download PDF
          </button>
        </div>
      </div>

      {fit?.overflowing && (
        <p className="text-xs text-coral-700 bg-coral-50 border border-coral-200 rounded px-2 py-1.5 mb-2 flex items-start gap-1">
          <Icon name="warning" size={13} className="flex-shrink-0 mt-0.5" />
          Too long for one page even at the smallest size — the bottom will be cut off.
          Trim a bullet before exporting.
        </p>
      )}
      {fit && !fit.overflowing && fit.scale < 0.85 && (
        <p className="text-xs text-gold-700 mb-2 flex items-start gap-1">
          <Icon name="info" size={13} className="flex-shrink-0 mt-0.5" />
          Fits one page, but only by shrinking the text to {Math.round(fit.scale * 100)}%. Cutting a
          line or two would read better.
        </p>
      )}

      {viewMode === "diff" && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink/55 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-sage-100 border border-sage-200" />
              added
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-coral-50 border border-coral-200" />
              removed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-petrol-50 border-l-2 border-petrol-300" />
              changed line
            </span>
            <span className="text-ink/40">Both sides scroll together.</span>
            {!edited && <span className="text-ink/40">No changes yet.</span>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-ink/55 mb-1">Original</p>
              <div
                ref={leftRef}
                onScroll={() => syncScroll(leftRef, rightRef)}
                className="max-h-[32rem] overflow-y-auto bg-canvas border border-mist rounded-lg p-3"
              >
                <ResumePreview lines={oldLines} className="shadow-none" />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-ink/55 mb-1">Your version</p>
              <div
                ref={rightRef}
                onScroll={() => syncScroll(rightRef, leftRef)}
                className="max-h-[32rem] overflow-y-auto bg-canvas border border-mist rounded-lg p-3"
              >
                <ResumePreview lines={newLines} className="shadow-none" />
              </div>
            </div>
          </div>
        </>
      )}

      {viewMode === "clean" && (
        <div className="max-h-[32rem] overflow-y-auto bg-canvas border border-mist rounded-lg p-3">
          <ResumePreview lines={cleanLines} id={PDF_TARGET} fitToPage onFit={setFit} />
        </div>
      )}

      {viewMode === "edit" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-medium text-ink/55 mb-1">Edit</p>
            <textarea
              className="input w-full font-mono text-xs h-[32rem] resize-none"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-ink/55 mb-1">Live preview (one A4 page)</p>
            <div className="max-h-[32rem] overflow-y-auto bg-canvas border border-mist rounded-lg p-3">
              <ResumePreview lines={cleanLines} id={PDF_TARGET} fitToPage onFit={setFit} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
