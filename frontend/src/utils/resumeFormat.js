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

// Concrete technologies bolded in bullets even when the Skills section doesn't list them — it
// rarely names every protocol or tool a bullet mentions (OAuth, GA4, OCR...).
const TECH_TERMS = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Rust", "Kotlin", "Swift",
  "SQL", "NoSQL", "GraphQL", "REST", "gRPC", "HTML", "CSS", "Sass", "Tailwind", "Tailwind CSS",
  "React", "React Native", "Next.js", "Node.js", "Express.js", "Vue", "Angular", "Svelte",
  "Redux", "Redux Toolkit", "TanStack Query", "React Query", "Vite", "Webpack", "Storybook",
  "Ant Design", "Material UI", "D3.js",
  "FastAPI", "Django", "Flask", "Spring Boot",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "Celery",
  "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "CI/CD", "GitHub Actions",
  "Jest", "Vitest", "Playwright", "Cypress", "MSW",
  "OAuth", "JWT", "SSO", "SSE", "WebSocket", "GA4", "GTM", "Google Analytics", "OpenTelemetry",
  "LLM", "RAG", "OpenAI", "LangChain", "PyTorch", "TensorFlow", "OCR",
  "computer vision", "machine learning", "human-in-the-loop",
];

// "Languages:" at the start of a Skills line, after an optional bullet.
const SKILL_LABEL = /^(\s*(?:[•\-\*▪●○]\s*)?)[^:]{1,30}:/;

function lineText(line) {
  return line.segments.map((s) => s.value).join("");
}

function isBullet(trimmed) {
  return /^[•\-\*▪●○]/.test(trimmed);
}

function isSectionName(trimmed) {
  return SECTION_KEYWORDS.has(trimmed.toLowerCase().replace(/:$/, ""));
}

function isHeader(trimmed) {
  if (isSectionName(trimmed)) return true;
  return trimmed.length <= 40 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
}

// "Company — Title | Location | Dates": pipe-separated, with a year or "Present" in the last part.
function isEntryHeading(trimmed) {
  const parts = trimmed.split("|");
  return parts.length >= 2 && /\b(19|20)\d{2}\b|\bpresent\b/i.test(parts[parts.length - 1]);
}

function isContactLike(trimmed) {
  const hasContactInfo =
    /@/.test(trimmed) || /linkedin\.com|github\.com/i.test(trimmed) || /\+?\d[\d\-\s()]{7,}\d/.test(trimmed);
  if (!hasContactInfo) return false;
  // A long line still counts when it's a list of short separated items (phone | email | links);
  // a long run of prose is a summary that happens to mention an email or a year range.
  const parts = trimmed.split(/\s[|•·]\s/);
  return trimmed.length < 140 || (parts.length >= 3 && parts.every((p) => p.length <= 70));
}

function classifyContent(trimmed, seenContent) {
  // Section headers and bullets are recognized by pattern regardless of position — some resumes
  // are pasted without a name/contact line at the top, so "first line" alone isn't reliable.
  if (isBullet(trimmed)) return "bullet";
  if (isHeader(trimmed)) return "header";
  if (seenContent === 1) return "name";
  if (seenContent === 2 && isContactLike(trimmed)) return "contact";
  if (isEntryHeading(trimmed)) return "entry";
  return "plain";
}

/**
 * An all-caps line between a job's heading and its bullets (e.g. "FRONTEND ENGINEERING") groups
 * that job's bullets; left as a "header" it would render like a whole new section. Marked as a
 * "subheading" instead, which the preview leaves off the page.
 */
function markSubheadings(lines) {
  let inEntry = false;
  lines.forEach((line, i) => {
    if (line.type === "entry") {
      inEntry = true;
    } else if (line.type === "header") {
      const text = lineText(line).trim();
      const next = lines.slice(i + 1).find((l) => l.type !== "blank");
      if (inEntry && !isSectionName(text) && next?.type === "bullet") line.type = "subheading";
      else inEntry = false;
    }
  });
  return lines;
}

/** The items of a Skills line ("React, Next.js, HTML/CSS"), with "A/B" pairs also split apart. */
function skillTerms(text) {
  return text.split(/[,;()]/).flatMap((item) => {
    const term = item.trim().replace(/^and\s+/i, "").replace(/\.$/, "");
    if (term.length < 2 || term.length > 40) return [];
    const parts = term.split("/").map((p) => p.trim());
    // "HTML/CSS" also matches "HTML" alone; "CI/CD" stays whole so a stray "CD" isn't bolded.
    return parts.length > 1 && parts.every((p) => p.length >= 3) ? [term, ...parts] : [term];
  });
}

/**
 * Regex source for one term. A term with a capital matches case-sensitively ("React", not "react
 * to"); an all-lowercase one matches any case. Spaces and hyphens are interchangeable
 * ("computer-vision"), and a plural either way matches ("AI evals" ~ "AI eval", "LLM" ~ "LLMs").
 */
function termPattern(term) {
  let body = term.includes(" ") && term.endsWith("s") ? term.slice(0, -1) : term;
  const anyCase = body === body.toLowerCase();
  body = body.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (anyCase) body = body.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
  return `${body.replace(/[\s-]+/g, "[\\s-]")}s?`;
}

function keywordRanges(text, regex) {
  const ranges = [];
  for (const m of text.matchAll(regex)) {
    const prev = ranges[ranges.length - 1];
    // "Jest/Vitest" reads as one bold run rather than two with a regular-weight slash between.
    if (prev && text.slice(prev[1], m.index) === "/") prev[1] = m.index + m[0].length;
    else ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/**
 * Bolds the technologies in each bullet — whatever the resume's own Skills section lists, plus
 * TECH_TERMS — so a skimming reader picks out the stack without reading every line. Lines in the
 * Skills section only get their "Category:" label bolded, since every item there is a keyword.
 * Stored on the line as `bold: [[start, end], ...]` character ranges into its text.
 */
function markKeywords(lines) {
  const skillLines = [];
  let inSkills = false;
  for (const line of lines) {
    if (line.type === "header") inSkills = /skills/i.test(lineText(line));
    else if (inSkills && line.type !== "blank") skillLines.push(line);
  }

  const terms = [...TECH_TERMS];
  for (const line of skillLines) {
    const text = lineText(line);
    const label = text.match(SKILL_LABEL);
    if (label) line.bold = [[label[1].length, label[0].length]];
    terms.push(...skillTerms(text.slice(label ? label[0].length : 0)));
  }

  // Longest first, so "Redux Toolkit" wins over "Redux" where both match.
  const patterns = [...new Set(terms)].sort((a, b) => b.length - a.length).map(termPattern);
  // Not preceded by "." either, so a Skills item like "JS" can't match the tail of "Next.js".
  const regex = new RegExp(`(?<![A-Za-z0-9.])(?:${patterns.join("|")})(?![A-Za-z0-9])`, "g");
  for (const line of lines) {
    if (line.type === "bullet" && !skillLines.includes(line)) line.bold = keywordRanges(lineText(line), regex);
  }
  return lines;
}

function markLines(lines) {
  return markKeywords(markSubheadings(lines));
}

/** Splits plain resume text into lines classified for Overleaf-style rendering (no diff). */
export function classifyLines(text) {
  const rawLines = (text || "").split("\n");
  let seenContent = 0;
  return markLines(
    rawLines.map((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return { type: "blank", segments: [{ type: "equal", value: raw }] };
      seenContent += 1;
      return { type: classifyContent(trimmed, seenContent), segments: [{ type: "equal", value: raw }] };
    })
  );
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
  return markLines(
    lines.map((segments) => {
      const trimmed = segments
        .map((s) => s.value)
        .join("")
        .trim();
      if (!trimmed) return { type: "blank", segments };
      seenContent += 1;
      return { type: classifyContent(trimmed, seenContent), segments };
    })
  );
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
