import { useLayoutEffect, useRef } from "react";
import clsx from "clsx";

function stripLeadingBulletChar(text) {
  return text.replace(/^[•\-\*▪●○]\s*/, "");
}

function Segment({ segment }) {
  if (segment.type === "removed") {
    return <del className="bg-red-50 text-red-500 decoration-red-300">{segment.value}</del>;
  }
  if (segment.type === "added") {
    return <mark className="bg-green-100 text-green-900 rounded-sm px-0.5 -mx-0.5">{segment.value}</mark>;
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
 */
export default function ResumePreview({ lines, className, id, fitToPage = false }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);

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
  }, [lines, fitToPage]);

  const fs = (pt) => (fitToPage ? `calc(${pt}pt * var(--rs, 1))` : `${pt}pt`);
  const sp = (rem) => (fitToPage ? `calc(${rem}rem * var(--rs, 1))` : `${rem}rem`);

  return (
    <div
      ref={outerRef}
      id={id}
      className={clsx(
        "resume-page bg-white text-gray-900 shadow-sm border border-gray-200 mx-auto",
        className
      )}
      style={{
        width: "210mm",
        maxWidth: "100%",
        height: fitToPage ? "297mm" : undefined,
        minHeight: fitToPage ? undefined : "297mm",
        overflow: fitToPage ? "hidden" : "visible",
        padding: "16mm 19mm",
        boxSizing: "border-box",
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

          if (line.type === "name") {
            return (
              <h1
                key={i}
                className="text-center font-bold tracking-wide"
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
                className="text-center text-gray-500"
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
                className="font-bold uppercase border-b border-gray-400"
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
              <div key={i} className="flex gap-2 pl-1">
                <span className="text-gray-500 flex-shrink-0">•</span>
                <p className="flex-1" style={{ margin: 0 }}>
                  <LineContent segments={line.segments} stripFirstBullet />
                </p>
              </div>
            );
          }

          return (
            <p key={i} style={{ margin: 0 }}>
              <LineContent segments={line.segments} />
            </p>
          );
        })}
      </div>
    </div>
  );
}
