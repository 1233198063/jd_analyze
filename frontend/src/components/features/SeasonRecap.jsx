import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { dailyApi } from "@/api/daily";
import Icon from "@/components/common/Icon";
import Stamp from "./Stamp";

const seenKey = (month) => `season-recap-seen:${month}`;

function readSeen(month) {
  try {
    return localStorage.getItem(seenKey(month)) === "1";
  } catch {
    return false;
  }
}

/**
 * Which month to recap today: the month's last day, or the first three days of the next one
 * (in case the last day passed without opening the app). `?recap=YYYY-MM` shows any month.
 */
function recapMonth(override) {
  if (override && /^\d{4}-\d{2}$/.test(override)) return override;
  const today = dayjs();
  if (today.date() === today.daysInMonth()) return today.format("YYYY-MM");
  if (today.date() <= 3) return today.subtract(1, "month").format("YYYY-MM");
  return null;
}

function Section({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-dashed border-mist bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45 mb-2 inline-flex items-center gap-1">
        <Icon name={icon} size={14} />
        {title}
      </p>
      {children}
    </div>
  );
}

function Quiet({ children }) {
  return <p className="text-sm text-ink/45">{children}</p>;
}

/**
 * The end-of-month recap: a journal page that turns up once a month and goes away when closed.
 * Like the milestone stamps, it marks a moment instead of sitting on the Dashboard every day.
 */
export default function SeasonRecap() {
  const [params] = useSearchParams();
  const override = params.get("recap");
  const month = recapMonth(override);
  const [seen, setSeen] = useState(() => (month && !override ? readSeen(month) : false));

  const { data } = useQuery({
    queryKey: ["daily", "season", month],
    queryFn: () => dailyApi.season(month),
    enabled: Boolean(month) && !seen,
  });
  if (!month || seen || !data) return null;

  const close = () => {
    try {
      localStorage.setItem(seenKey(month), "1");
    } catch {
      // best-effort; closing still hides it for this visit
    }
    setSeen(true);
  };

  const name = dayjs(`${month}-01`).format("MMMM");
  const shown = data.applied.slice(0, 14);

  return (
    <div className="card relative overflow-hidden p-6 bg-petrol-50/40">
      {/* A strip of washi tape across the corner — the page's only ornament. */}
      <span className="absolute -top-1 left-10 h-5 w-24 rotate-[-4deg] bg-bubblegum-200/70" />

      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink/45">Season recap</p>
          <p className="font-hand text-5xl leading-none text-petrol-600 mt-1">{name}</p>
          <p className="text-xs text-ink/45 mt-1">
            {dayjs(data.start).format("MMM D")} – {dayjs(data.end).format("MMM D, YYYY")}
          </p>
        </div>
        <button onClick={close} className="text-sm text-ink/45 hover:text-ink inline-flex items-center gap-1">
          Close <Icon name="close" size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Sent out" icon="outgoing_mail">
          <p className="mb-2">
            <span className="font-hand text-4xl text-petrol-600 mr-1">{data.applied.length}</span>
            <span className="text-sm text-ink/60">applications · {data.jds_added} JDs read</span>
          </p>
          {shown.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {shown.map((a) => (
                <Link
                  key={a.job_id}
                  to={`/jobs/${a.job_id}`}
                  title={a.title}
                  className="px-2 py-0.5 rounded-full bg-white border border-mist text-xs text-ink/70 hover:border-petrol-300"
                >
                  {a.company}
                </Link>
              ))}
              {data.applied.length > shown.length && (
                <span className="px-2 py-0.5 text-xs text-ink/45">+{data.applied.length - shown.length} more</span>
              )}
            </div>
          ) : (
            <Quiet>Nothing sent this month.</Quiet>
          )}
        </Section>

        <Section title="Moved forward" icon="trending_up">
          {data.advanced.length > 0 ? (
            <ul className="space-y-2">
              {data.advanced.map((a, i) => (
                <li key={`${a.job_id}-${a.status}-${i}`} className="flex items-center gap-2.5 text-sm">
                  <Stamp status={a.status} size="sm" seed={`${a.job_id}${a.status}`} />
                  <span className="text-ink/80">{a.company}</span>
                  <span className="font-hand text-lg text-ink/45 ml-auto">{dayjs(a.at).format("MMM D")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>No new rounds this month. The applications are still out there.</Quiet>
          )}
          {data.rejections > 0 && (
            <p className="mt-3 text-xs text-ink/45 inline-flex items-center gap-1">
              <Icon name="eco" size={14} className="text-coral-400" />
              {data.rejections} × Not This Time — each one tells you which round to work on.
            </p>
          )}
        </Section>

        <Section title="Learned" icon="menu_book">
          {data.skills_finished.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {data.skills_finished.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-sage-50 border border-sage-200 text-xs text-sage-700">
                  {s}
                </span>
              ))}
            </div>
          )}
          {data.practice.days > 0 ? (
            <p className="text-sm text-ink/70">
              Practiced on <span className="font-hand text-2xl text-plum-600">{data.practice.days}</span> days ·{" "}
              {Math.round(data.practice.minutes / 60)} h · explained {data.practice.explained} out loud
            </p>
          ) : (
            data.skills_finished.length === 0 && <Quiet>No practice or finished skills logged this month.</Quiet>
          )}
          {data.skills_started.length > 0 && (
            <p className="text-xs text-ink/45 mt-2">Still reading: {data.skills_started.join(", ")}</p>
          )}
        </Section>

        <Section title="People you met" icon="local_cafe">
          {data.chats.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {data.chats.map((c, i) => (
                <li key={`${c.name}-${i}`} className="flex items-baseline gap-2">
                  <span className="text-ink/80">{c.name}</span>
                  <span className="text-xs text-ink/45">{[c.role, c.company].filter(Boolean).join(" · ")}</span>
                  <span className="font-hand text-lg text-ink/45 ml-auto">{dayjs(c.date).format("MMM D")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet>No coffee chats logged this month.</Quiet>
          )}
        </Section>
      </div>
    </div>
  );
}
