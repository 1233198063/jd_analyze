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

/**
 * Renders classified resume lines (from resumeFormat.classifyLines / diffResumeSplit) in a single-
 * column, serif, section-ruled layout — the closest a plain-text resume gets to a classic Overleaf
 * template without a full LaTeX pipeline. Segments typed "added"/"removed" (from diffResumeSplit)
 * render with highlight/strikethrough; plain classifyLines output has no such segments.
 */
export default function ResumePreview({ lines, className, id }) {
  return (
    <div
      id={id}
      className={clsx(
        "resume-page bg-white text-gray-900 shadow-sm border border-gray-200 mx-auto",
        className
      )}
      style={{
        fontFamily: "Georgia, Cambria, 'Times New Roman', Times, serif",
        width: "8.5in",
        maxWidth: "100%",
        minHeight: "11in",
        padding: "0.65in 0.75in",
        fontSize: "10.5pt",
        lineHeight: 1.42,
      }}
    >
      {lines.map((line, i) => {
        if (line.type === "blank") return <div key={i} className="h-2.5" />;

        if (line.type === "name") {
          return (
            <h1 key={i} className="text-center font-bold tracking-wide" style={{ fontSize: "20pt" }}>
              <LineContent segments={line.segments} />
            </h1>
          );
        }

        if (line.type === "contact") {
          return (
            <p key={i} className="text-center text-gray-500 mb-2" style={{ fontSize: "9pt" }}>
              <LineContent segments={line.segments} />
            </p>
          );
        }

        if (line.type === "header") {
          return (
            <h2
              key={i}
              className="font-bold uppercase border-b border-gray-400 mt-3 mb-1 pb-0.5"
              style={{ fontSize: "10.5pt", letterSpacing: "0.04em" }}
            >
              <LineContent segments={line.segments} />
            </h2>
          );
        }

        if (line.type === "bullet") {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-gray-500 flex-shrink-0">•</span>
              <p className="flex-1">
                <LineContent segments={line.segments} stripFirstBullet />
              </p>
            </div>
          );
        }

        return (
          <p key={i}>
            <LineContent segments={line.segments} />
          </p>
        );
      })}
    </div>
  );
}
