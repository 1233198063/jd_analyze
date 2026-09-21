import { diffWordsWithSpace } from "diff";

const SECTION_KEYWORDS = new Set([
  "education",
  "experience",
  "work experience",
  "professional experience",
  "projects",
  "skills",
  "technical skills",
  "summary",
  "publications",
  "awards",
  "certifications",
  "activities",
  "leadership",
  "volunteer",
  "research",
  "objective",
]);

function isBullet(trimmed) {
  return /^[•\-\*▪●○]/.test(trimmed);
}

function isHeader(trimmed) {
  const lower = trimmed.toLowerCase().replace(/:$/, "");
  if (SECTION_KEYWORDS.has(lower)) return true;
  return trimmed.length <= 40 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
}

function isContactLike(trimmed) {
  return (
    trimmed.length < 140 &&
    (/@/.test(trimmed) || /linkedin\.com|github\.com/i.test(trimmed) || /\+?\d[\d\-\s()]{7,}\d/.test(trimmed))
  );
}

function classifyContent(trimmed, seenContent) {
  // Section headers and bullets are recognized by pattern regardless of position — some resumes
  // are pasted without a name/contact line at the top, so "first line" alone isn't reliable.
  if (isBullet(trimmed)) return "bullet";
  if (isHeader(trimmed)) return "header";
  if (seenContent === 1) return "name";
  if (seenContent === 2 && isContactLike(trimmed)) return "contact";
  return "plain";
}

/** Splits plain resume text into lines classified for Overleaf-style rendering (no diff). */
export function classifyLines(text) {
  const rawLines = (text || "").split("\n");
  let seenContent = 0;
  return rawLines.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return { type: "blank", segments: [{ type: "equal", value: raw }] };
    seenContent += 1;
    return { type: classifyContent(trimmed, seenContent), segments: [{ type: "equal", value: raw }] };
  });
}

function linesFromTokens(tokens, side) {
  // side "old": keep equal + removed (skip added); side "new": keep equal + added (skip removed).
  const lines = [[]];
  for (const token of tokens) {
    const rawType = token.added ? "added" : token.removed ? "removed" : "equal";
    if (side === "old" && rawType === "added") continue;
    if (side === "new" && rawType === "removed") continue;
    const segType = rawType === "equal" ? "equal" : side === "old" ? "removed" : "added";

    const parts = token.value.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1].push({ type: segType, value: part });
    });
  }

  let seenContent = 0;
  return lines.map((segments) => {
    const trimmed = segments
      .map((s) => s.value)
      .join("")
      .trim();
    if (!trimmed) return { type: "blank", segments };
    seenContent += 1;
    return { type: classifyContent(trimmed, seenContent), segments };
  });
}

/**
 * Word-level diff between old and new resume text, returned as two independently classified line
 * sets (old and new) for a side-by-side view — the old panel highlights what got cut, the new panel
 * highlights what got added, each rendered in its own full Overleaf-style layout.
 */
export function diffResumeSplit(oldText, newText) {
  const tokens = diffWordsWithSpace(oldText || "", newText || "");
  return {
    oldLines: linesFromTokens(tokens, "old"),
    newLines: linesFromTokens(tokens, "new"),
  };
}

/** Pulls out the resume text streamed so far between ===RESUME=== and ===META=== (or end of buffer). */
export function extractStreamedResumeText(buffer) {
  const startMarker = "===RESUME===";
  const metaMarker = "===META===";
  const start = buffer.indexOf(startMarker);
  if (start === -1) return "";
  const metaIdx = buffer.indexOf(metaMarker);
  const end = metaIdx === -1 ? buffer.length : metaIdx;
  return buffer.slice(start + startMarker.length, end).replace(/^\n+/, "").replace(/\n+$/, "");
}

/** Parses the full ===RESUME===/===META===/===END=== buffer once a stream has finished. */
export function parseTailorStreamOutput(fullText) {
  const resumeMarker = "===RESUME===";
  const metaMarker = "===META===";
  const endMarker = "===END===";

  const resumeStart = fullText.indexOf(resumeMarker);
  const metaStart = fullText.indexOf(metaMarker);
  if (resumeStart === -1 || metaStart === -1) {
    throw new Error("Malformed tailoring response — missing protocol markers");
  }

  const endPos = fullText.indexOf(endMarker);
  const tailoredText = fullText.slice(resumeStart + resumeMarker.length, metaStart).trim();
  const metaText = fullText
    .slice(metaStart + metaMarker.length, endPos === -1 ? fullText.length : endPos)
    .trim();
  const meta = JSON.parse(metaText);

  return {
    tailored_text: tailoredText,
    change_notes: meta.change_notes || [],
    keyword_coverage: meta.keyword_coverage || [],
    integration_suggestions: meta.integration_suggestions || [],
    trade_off_notes: meta.trade_off_notes || [],
    learning_gaps: meta.learning_gaps || [],
  };
}

/** Best-effort candidate name from the first non-blank line of a resume. */
export function extractCandidateName(text) {
  const firstLine = (text || "").split("\n").find((l) => l.trim());
  return firstLine ? firstLine.trim() : "Resume";
}

/** Builds a filesystem-safe "Name_Title_Date" string for the PDF download filename. */
export function buildResumeFilename(name, jobTitle) {
  const date = new Date().toISOString().slice(0, 10);
  const parts = [name, jobTitle, date].filter(Boolean);
  return parts
    .join("_")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
}
