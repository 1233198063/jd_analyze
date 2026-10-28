import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { jobsApi } from "@/api/jobs";
import { resumeApi } from "@/api/resume";
import Icon from "@/components/common/Icon";
import { PAGE_H_PX, PAGE_W_PX, usePageZoom } from "./ResumePreview";
import { classifyLines } from "@/utils/resumeFormat";
import { printElementAsPdf } from "@/utils/printElement";

// Must differ from the resume panels' print targets, which can be mounted on the same page.
const PDF_TARGET = "cover-letter-pdf-target";

export const coverLetterDraftKey = (jobId) => `cover-letter:${jobId}`;

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** "Company-YYYY-MM-DD-coverletter", minus characters a filename can't hold. */
function coverLetterFilename(company) {
  const safe = (company || "Company").replace(/[\\/:*?"<>|]/g, "").trim() || "Company";
  return `${safe}-${dayjs().format("YYYY-MM-DD")}-coverletter`;
}

/** Name and contact line from the top of the master resume, so the letter's header matches it. */
function resumeHeader(rawText) {
  const lines = classifyLines(rawText || "");
  const text = (type) => lines.find((l) => l.type === type)?.segments.map((s) => s.value).join("").trim() ?? "";
  return { name: text("name"), contact: text("contact") };
}

/**
 * The letter as one A4 page in the resume's typeface, zoomed down to fit the column on screen.
 * This element is also the print target, so what you see is what exports.
 */
function LetterPage({ header, text, onOverflow }) {
  const trackRef = useRef(null);
  const pageRef = useRef(null);
  const zoom = usePageZoom(trackRef, true);
  const onOverflowRef = useRef(onOverflow);
  onOverflowRef.current = onOverflow;

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (page) onOverflowRef.current(page.scrollHeight > page.clientHeight + 1);
  }, [header, text]);

  return (
    <div ref={trackRef} className="w-full">
      {/* Unpositioned on purpose: print anchors the page at the top-left of its containing block. */}
      <div className="mx-auto overflow-hidden border border-mist shadow-sm" style={{ width: PAGE_W_PX * zoom, height: PAGE_H_PX * zoom }}>
        <div
          ref={pageRef}
          id={PDF_TARGET}
          className="bg-white text-gray-900"
          style={{
            width: "210mm",
            height: "297mm",
            padding: "20mm 22mm",
            boxSizing: "border-box",
            overflow: "hidden",
            fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif",
            fontSize: "11pt",
            lineHeight: 1.5,
            transform: zoom < 1 ? `scale(${zoom})` : undefined,
            transformOrigin: "top left",
          }}
        >
          {header.name && (
            <div className="text-center border-b border-gray-400" style={{ paddingBottom: "3mm", marginBottom: "7mm" }}>
              <p className="font-bold tracking-wide" style={{ fontSize: "20pt", margin: 0 }}>
                {header.name}
              </p>
              {header.contact && (
                // Wraps between items, never inside one (a URL split across lines reads as broken).
                <p className="text-gray-500" style={{ fontSize: "9pt", margin: 0 }}>
                  {header.contact.split(/\s*\|\s*/).map((item, i) => (
                    <span key={i}>
                      {i > 0 && " | "}
                      <span className="whitespace-nowrap">{item}</span>
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
          <p style={{ margin: "0 0 5mm" }}>{dayjs().format("MMMM D, YYYY")}</p>
          <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
        </div>
      </div>
    </div>
  );
}

// The AI's own draft, kept apart from the edited text so it can be compared against or restored.
const aiDraftKey = (jobId) => `cover-letter-ai:${jobId}`;

/**
 * Drafts saved before the backend stopped the AI from signing its own sign-off end in the name
 * twice ("Sincerely,\nName\nName") — the AI's copy plus the one added here. Keep one.
 */
function dropRepeatedName(text, name) {
  if (!text || !name) return text;
  const lines = text.trimEnd().split("\n");
  const n = lines.length;
  if (n >= 2 && lines[n - 1].trim() === name && lines[n - 2].trim().endsWith(name)) {
    return lines.slice(0, -1).join("\n");
  }
  return text;
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // best-effort only — a full storage quota shouldn't block editing
  }
}

function Steps({ drafted, edited }) {
  const steps = [
    { label: "AI 根据 JD + 简历起草", done: drafted },
    { label: "你来修改", done: edited },
    { label: "导出 PDF", done: false },
  ];
  const current = !drafted ? 0 : !edited ? 1 : 2;
  return (
    <ol className="flex items-center gap-2 text-xs flex-wrap">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          {i > 0 && <span className="w-6 h-px bg-mist" />}
          <span
            className={
              i === current
                ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-petrol-500 text-white font-medium"
                : s.done
                  ? "inline-flex items-center gap-1 text-sage-700"
                  : "inline-flex items-center gap-1 text-ink/40"
            }
          >
            {s.done && i !== current ? <Icon name="check_circle" size={14} filled /> : <span>{i + 1}</span>}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Cover letter for one job, in three steps: the AI drafts it from this job's full description and
 * the master resume, you edit it, then export a PDF named "Company-YYYY-MM-DD-coverletter".
 * Both the AI draft and your edited version are kept per job in localStorage, so reopening shows
 * your edits (no second AI call) and the AI original stays available to compare or restore.
 */
export default function CoverLetterEditor({ jobId, company, title, onClose }) {
  const storageKey = coverLetterDraftKey(jobId);
  const [text, setText] = useState(() => readStored(storageKey));
  const [aiText, setAiText] = useState(() => readStored(aiDraftKey(jobId)));
  const [panel, setPanel] = useState("preview"); // preview | original
  const [pendingPrint, setPendingPrint] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: master } = useQuery({ queryKey: ["resume", "master"], queryFn: resumeApi.getMaster });
  const header = useMemo(() => resumeHeader(master?.raw_text), [master?.raw_text]);
  const nameRef = useRef(header.name);
  nameRef.current = header.name;

  // Plain state rather than useMutation: StrictMode's remount detaches a mutation observer that was
  // started from an effect, which left isPending stuck at true after the draft had arrived.
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const generate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const letter = await jobsApi.getCoverLetter(jobId);
      const signOff = [letter.sign_off, nameRef.current].filter(Boolean).join("\n");
      const draft = `${letter.greeting}\n\n${letter.body}\n\n${signOff}`;
      setAiText(draft);
      setText(draft);
    } catch (err) {
      setGenerateError(err);
    } finally {
      setGenerating(false);
    }
  }, [jobId]);

  // Step 1 happens on its own the first time this job's letter is opened. The ref keeps
  // StrictMode's double effect from asking the AI twice.
  const started = useRef(false);
  useEffect(() => {
    if (text !== null || started.current) return;
    started.current = true;
    generate();
  }, [text, generate]);

  useEffect(() => {
    if (text !== null) store(storageKey, text);
  }, [text, storageKey]);

  useEffect(() => {
    if (aiText !== null) store(aiDraftKey(jobId), aiText);
  }, [aiText, jobId]);

  // The name comes from the resume, which loads after the stored drafts are read.
  useEffect(() => {
    setText((t) => dropRepeatedName(t, header.name));
    setAiText((t) => dropRepeatedName(t, header.name));
  }, [header.name]);

  const filename = coverLetterFilename(company);
  // A draft saved before the AI original was kept separately counts as the starting point.
  const drafted = text !== null;
  const edited = drafted && aiText !== null && text !== aiText;

  // The print target is the page preview, so switch back to it before printing.
  const exportPdf = () => {
    if (panel !== "preview") {
      setPanel("preview");
      setPendingPrint(true);
      return;
    }
    printElementAsPdf(PDF_TARGET, filename);
  };
  useEffect(() => {
    if (!pendingPrint || panel !== "preview") return;
    setPendingPrint(false);
    printElementAsPdf(PDF_TARGET, filename);
  }, [pendingPrint, panel, filename]);

  const regenerate = () => {
    if (edited && !confirm("重新生成会替换当前的内容（包括你的修改），确定吗？")) return;
    generate();
  };
  const restore = () => {
    if (confirm("恢复成 AI 原稿？你的修改会被替换。")) {
      setText(aiText);
      setPanel("preview");
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the text stays selectable in the editor.
    }
  };

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[94vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3 border-b border-mist">
          <div className="space-y-2">
            <div>
              <h3 className="font-semibold text-ink">Cover Letter</h3>
              <p className="text-xs text-ink/50 mt-0.5">
                {[company, title].filter((v) => v && v !== "null").join(" · ")}
              </p>
            </div>
            <Steps drafted={drafted} edited={edited} />
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink/70" title="Close">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-3 min-w-0">
            {text === null ? (
              <div className="flex-1 min-h-[24rem] rounded-lg border border-mist bg-canvas flex items-center justify-center text-sm text-ink/55 p-6">
                {generateError && !generating ? (
                  <div className="text-center space-y-2">
                    <p className="text-coral-600">{generateError.message}</p>
                    <button className="btn-secondary" onClick={generate}>
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="text-center space-y-1">
                    <p>AI 正在根据这份 JD 全文和你的简历起草…</p>
                    <p className="text-xs text-ink/40">大约 10–30 秒。写好后你可以在这里直接修改。</p>
                  </div>
                )}
              </div>
            ) : (
              <textarea
                className="input flex-1 min-h-[28rem] font-serif text-sm leading-relaxed resize-y"
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck
              />
            )}
            <p className="text-xs text-ink/45">
              {edited ? "已修改 · 你的版本会为这个岗位自动保存。" : drafted ? "这是 AI 原稿，直接在上面改。" : ""}
              {master?.name && ` AI 读的简历：${master.name}。`} 空行就是分段；页头的名字和联系方式取自简历，日期是今天。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={!drafted} onClick={exportPdf}>
                <Icon name="picture_as_pdf" size={17} />
                Export PDF
              </button>
              <button className="btn-secondary" disabled={!drafted} onClick={copy}>
                <Icon name={copied ? "check" : "content_copy"} size={16} />
                {copied ? "Copied" : "Copy text"}
              </button>
              <button
                className="ml-auto text-sm text-ink/50 hover:text-ink/80 disabled:opacity-50"
                disabled={generating}
                onClick={regenerate}
                title="让 AI 根据 JD 和简历重新写一版"
              >
                {generating && drafted ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          </div>

          <div className="space-y-2 min-w-0">
            {aiText !== null && (
              <div className="flex gap-1 p-1 bg-petrol-50 rounded-lg w-fit text-xs">
                {[
                  ["preview", "PDF 预览"],
                  ["original", "AI 原稿"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setPanel(key)}
                    className={
                      panel === key
                        ? "px-3 py-1 rounded-md bg-white text-ink font-medium shadow-sm"
                        : "px-3 py-1 rounded-md text-ink/55 hover:text-ink"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {panel === "original" && aiText !== null ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-mist bg-canvas p-4 text-sm text-ink/80 whitespace-pre-wrap font-serif leading-relaxed max-h-[34rem] overflow-y-auto">
                  {aiText}
                </div>
                {edited && (
                  <button className="text-xs text-petrol-600 hover:underline" onClick={restore}>
                    恢复成 AI 原稿
                  </button>
                )}
              </div>
            ) : (
              <>
                <LetterPage header={header} text={text ?? ""} onOverflow={setOverflowing} />
                {overflowing && (
                  <p className="text-xs text-gold-700 flex items-center gap-1">
                    <Icon name="warning" size={14} />
                    Longer than one page — the PDF cuts off at the bottom. Trim a paragraph.
                  </p>
                )}
                <p className="text-xs text-ink/45">
                  Saves as <span className="font-medium text-ink/70">{filename}.pdf</span> — in the print dialog choose
                  "Save as PDF".
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
