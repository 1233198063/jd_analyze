import { useState } from "react";
import Icon from "@/components/common/Icon";

function ScriptCard({ script }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. non-secure context); the text is selectable anyway.
    }
  };
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-ink">{script.title}</p>
        <button className="text-xs text-ink/50 hover:text-petrol-600 inline-flex items-center gap-1" onClick={copy}>
          <Icon name={copied ? "check" : "content_copy"} size={14} />
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="text-sm text-ink/75 whitespace-pre-wrap leading-relaxed bg-canvas rounded-lg p-3">{script.text}</p>
    </div>
  );
}

/** How to reach out and run a coffee chat: cadence, where to find people, agenda, questions, message templates. */
export default function NetworkToolkit({ toolkit }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Coffee chat 工具箱</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <p className="text-sm font-semibold text-ink mb-2">节奏与规矩</p>
          <ul className="space-y-1.5">
            {toolkit.cadence.map((line, i) => (
              <li key={i} className="text-sm text-ink/75 flex gap-2">
                <span className="text-ink/30">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold text-ink mt-4 mb-2">去哪找人</p>
          <ul className="space-y-1">
            {toolkit.where.map((w) => (
              <li key={w.url} className="text-sm">
                <a href={w.url} target="_blank" rel="noreferrer" className="text-petrol-600 hover:underline inline-flex items-center gap-1">
                  {w.label}
                  <Icon name="open_in_new" size={13} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-4">
          <p className="text-sm font-semibold text-ink mb-2">一次 coffee chat（约 25 分钟）</p>
          <ol className="space-y-1.5">
            {toolkit.agenda.map(([when, what]) => (
              <li key={when} className="text-sm flex gap-3">
                <span className="text-xs text-petrol-600 font-medium w-20 flex-shrink-0 pt-0.5">{when}</span>
                <span className="text-ink/75">{what}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm font-semibold text-ink mt-4 mb-2">可以问的问题</p>
          <div className="space-y-2">
            {toolkit.questions.map(([group, qs]) => (
              <div key={group}>
                <p className="text-xs text-ink/50 mb-0.5">{group}</p>
                <ul className="space-y-0.5">
                  {qs.map((q) => (
                    <li key={q} className="text-sm text-ink/75">{q}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {toolkit.scripts.map((s) => (
          <ScriptCard key={s.key} script={s} />
        ))}
      </div>
    </section>
  );
}
