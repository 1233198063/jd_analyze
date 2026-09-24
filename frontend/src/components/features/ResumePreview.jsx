import { useLayoutEffect, useRef, useState } from "react";
import clsx from "clsx";

// CSS fixes 1mm at 96/25.4 px, so an A4 page always lays out at the same pixel size.
const PX_PER_MM = 96 / 25.4;
const PAGE_W_PX = 210 * PX_PER_MM;
const PAGE_H_PX = 297 * PX_PER_MM;

/** Largest zoom (≤ 1) at which a full A4 page fits the width of `trackRef`. */
function usePageZoom(trackRef, enabled) {
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!enabled || !track) return;
    const update = () => setZoom(Math.min(1, track.clientWidth / PAGE_W_PX));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [trackRef, enabled]);
  return zoom;
}

function stripLeadingBulletChar(text) {
  return text.replace(/^[•\-\*▪●○]\s*/, "");
}

function Segment({ segment }) {
  if (segment.type === "removed") {
    return <del className="bg-coral-50 text-coral-600 decoration-coral-300">{segment.value}</del>;
  }
  if (segment.type === "added") {
    return <mark className="bg-sage-100 text-sage-700 rounded-sm px-0.5 -mx-0.5">{segment.value}</mark>;
  }
  return <>{segment.value}</>;
}

function LineContent({ segments, stripFirstBullet }) {
  if (stripFirstBullet && segments.length > 0) {
    const stripped = { ...segments[0], value: stripLeadingBulletChar(segments[0].value) };
    segments = [stripped, ...segments.slice(1)];
  }
  return (
    <>
      {segments.map((seg, i) => (
        <Segment key={i} segment={seg} />
      ))}
    </>
  );
}

/** A line is "changed" when the diff left any added/removed segment on it. Plain
 *  classifyLines output is all-equal, so non-diff previews never light up. */
function isChanged(line) {
  return line.segments?.some((s) => s.type !== "equal");
}

// Neutral marker: the inline sage/coral tints already say added vs removed, so the
// line-level band only has to say "something on this line moved".
const CHANGED_ROW = "bg-petrol-50 border-l-2 border-petrol-300 -ml-2 pl-1.5 rounded-r-sm";

const MIN_SHRINK_SCALE = 0.55;
const SHRINK_STEP = 0.01;

/**
 * Renders classified resume lines (from resumeFormat.classifyLines / diffResumeSplit) in a single-
 * column, serif, section-ruled layout — the closest a plain-text resume gets to a classic Overleaf
 * template without a full LaTeX pipeline. Segments typed "added"/"removed" (from diffResumeSplit)
 * render with highlight/strikethrough; plain classifyLines output has no such segments.
 *
 * When `fitToPage` is set, the page is pinned to exactly one A4 sheet (matching the `size: A4;
 * margin: 0` print rule in printElementAsPdf) and font/spacing are shrunk via a --rs CSS variable
 * until the content's natural height fits the page budget — a "shrink to fit one page" pass, since
 * resume length varies a lot and we can't know the right font size ahead of time.
 *
 * The page always lays out at true A4 width and is only zoomed down visually to fit narrow
 * columns. Squeezing its width instead made text wrap more than in the PDF, so the fit (and the
 * "shrunk to N%" warning) disagreed with what actually exported.
 */
export default function ResumePreview({ lines, className, id, fitToPage = false, onFit }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const trackRef = useRef(null);
  const zoom = usePageZoom(trackRef, fitToPage);
  // Read inside the effect but deliberately kept out of its deps: an inline callback
  // would otherwise change identity every render and re-run the measuring loop forever.
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  useLayoutEffect(() => {
    if (!fitToPage) return;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    inner.style.setProperty("--rs", "1");
    const outerStyle = getComputedStyle(outer);
    const verticalPadding =
      parseFloat(outerStyle.paddingTop) + parseFloat(outerStyle.paddingBottom);
    const budget = outer.clientHeight - verticalPadding;
    let scale = 1;
    let guard = 0;
    while (inner.scrollHeight > budget && scale > MIN_SHRINK_SCALE && guard < 45) {
      scale = Math.max(MIN_SHRINK_SCALE, scale - SHRINK_STEP);
      inner.style.setProperty("--rs", scale.toFixed(2));
      guard += 1;
    }

    // Past the shrink floor the page clips instead of scaling, so say so — silently
    // truncating the bottom of someone's resume is the worst possible failure here.
    onFitRef.current?.({
      scale,
      overflowing: inner.scrollHeight > budget,
      overflowPx: Math.max(0, inner.scrollHeight - budget),
    });
  }, [lines, fitToPage]);

  const fs = (pt) => (fitToPage ? `calc(${pt}pt * var(--rs, 1))` : `${pt}pt`);
  const sp = (rem) => (fitToPage ? `calc(${rem}rem * var(--rs, 1))` : `${rem}rem`);

  const page = (
    <div
      ref={outerRef}
      id={id}
      className={clsx(
        "resume-page bg-white text-gray-900 shadow-sm border border-gray-200",
        !fitToPage && "mx-auto",
        className
      )}
      style={{
        width: "210mm",
        maxWidth: fitToPage ? undefined : "100%",
        height: fitToPage ? "297mm" : undefined,
        minHeight: fitToPage ? undefined : "297mm",
        overflow: fitToPage ? "hidden" : "visible",
        padding: "16mm 19mm",
        boxSizing: "border-box",
        transform: fitToPage && zoom < 1 ? `scale(${zoom})` : undefined,
        transformOrigin: "top left",
      }}
    >
      <div
        ref={innerRef}
        style={{
          fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif",
          fontSize: fs(10.5),
          lineHeight: 1.42,
        }}
      >
        {lines.map((line, i) => {
          if (line.type === "blank") return <div key={i} style={{ height: sp(0.625) }} />;

          const changed = isChanged(line);

          if (line.type === "name") {
            return (
              <h1
                key={i}
                className={clsx("text-center font-bold tracking-wide", changed && CHANGED_ROW)}
                style={{ fontSize: fs(20), margin: 0 }}
              >
                <LineContent segments={line.segments} />
              </h1>
            );
          }

          if (line.type === "contact") {
            return (
              <p
                key={i}
                className={clsx("text-center text-gray-500", changed && CHANGED_ROW)}
                style={{ fontSize: fs(9), margin: 0, marginBottom: sp(0.5) }}
              >
                <LineContent segments={line.segments} />
              </p>
            );
          }

          if (line.type === "header") {
            return (
              <h2
                key={i}
                className={clsx("font-bold uppercase border-b border-gray-400", changed && CHANGED_ROW)}
                style={{
                  fontSize: fs(10.5),
                  letterSpacing: "0.04em",
                  margin: 0,
                  marginTop: sp(0.75),
                  marginBottom: sp(0.25),
                  paddingBottom: sp(0.125),
                }}
              >
                <LineContent segments={line.segments} />
              </h2>
            );
          }

          if (line.type === "bullet") {
            return (
              <div key={i} className={clsx("flex gap-2 pl-1", changed && CHANGED_ROW)}>
                <span className="text-gray-500 flex-shrink-0">•</span>
                <p className="flex-1" style={{ margin: 0 }}>
                  <LineContent segments={line.segments} stripFirstBullet />
                </p>
              </div>
            );
          }

          return (
            <p key={i} className={clsx(changed && CHANGED_ROW)} style={{ margin: 0 }}>
              <LineContent segments={line.segments} />
            </p>
          );
        })}
      </div>
    </div>
  );

  if (!fitToPage) return page;

  // The sizer takes the zoomed page's footprint and clips the untransformed layout box. It
  // must stay unpositioned: print places the page `position: absolute` at the document's
  // top-left, and a positioned ancestor would become its anchor instead.
  return (
    <div ref={trackRef} className="w-full">
      <div className="mx-auto overflow-hidden" style={{ width: PAGE_W_PX * zoom, height: PAGE_H_PX * zoom }}>
        {page}
      </div>
    </div>
  );
}
