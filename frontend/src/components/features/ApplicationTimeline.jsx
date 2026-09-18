import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { applicationsApi } from "@/api/applications";
import { AppStatusBadge } from "@/components/common/Badge";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const STAGE_DOT = {
  saved: "bg-gray-400",
  applied: "bg-blue-500",
  referral_asked: "bg-purple-500",
  oa: "bg-yellow-500",
  phone_screen: "bg-yellow-500",
  interview: "bg-orange-500",
  offer: "bg-green-500",
  rejected: "bg-red-500",
  withdrawn: "bg-gray-300",
};

function daysBetween(from, to) {
  return dayjs(to).startOf("day").diff(dayjs(from).startOf("day"), "day");
}

function EventRow({ event, index, applicationId, previousEvent, isLast }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(dayjs(event.timestamp).format("YYYY-MM-DD"));

  const save = useMutation({
    mutationFn: (timestamp) =>
      applicationsApi.updateTimelineEvent(applicationId, index, { timestamp }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["application", applicationId] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
    },
  });

  const gap = previousEvent ? daysBetween(previousEvent.timestamp, event.timestamp) : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <span className={`w-2.5 h-2.5 rounded-full ${STAGE_DOT[event.status] || "bg-gray-400"}`} />
        {!isLast && <span className="w-px flex-1 bg-gray-200 my-1" />}
      </div>

      <div className={`flex-1 min-w-0 ${isLast ? "" : "pb-4"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <AppStatusBadge status={event.status} />
          {gap != null && gap > 0 && (
            <span className="text-xs text-gray-400">+{gap}d</span>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="date"
              className="input text-xs py-1 w-36"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={save.isPending}
              onClick={() => save.mutate(dayjs(draft).toISOString())}
            >
              {save.isPending ? "..." : "Save"}
            </button>
            <button
              className="text-xs px-2 py-1 rounded border border-gray-300"
              onClick={() => {
                setDraft(dayjs(event.timestamp).format("YYYY-MM-DD"));
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="text-xs text-gray-600 hover:text-blue-600 hover:underline mt-0.5 block"
            onClick={() => setEditing(true)}
            title="Click to correct this date"
          >
            {dayjs(event.timestamp).format("MMM D, YYYY")}
            <span className="text-gray-400"> · {dayjs(event.timestamp).fromNow()}</span>
          </button>
        )}

        {event.note && <p className="text-xs text-gray-400 mt-0.5">{event.note}</p>}
      </div>
    </div>
  );
}

export default function ApplicationTimeline({ applicationId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => applicationsApi.get(applicationId),
    enabled: !!applicationId,
  });

  if (!applicationId) return null;
  if (isLoading) return null;

  const timeline = data?.timeline || [];
  const appliedAt = data?.applied_at;
  const totalDays = appliedAt ? daysBetween(appliedAt, new Date()) : null;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Application Timeline</h3>
        {appliedAt && (
          <p className="text-xs text-gray-400">
            Applied {dayjs(appliedAt).format("MMM D, YYYY")}
            {totalDays > 0 && ` · ${totalDays} days ago`}
          </p>
        )}
      </div>

      {timeline.length === 0 ? (
        <p className="text-sm text-gray-400">No steps recorded yet.</p>
      ) : (
        <>
          <div>
            {timeline.map((event, i) => (
              <EventRow
                key={`${event.status}-${event.timestamp}-${i}`}
                event={event}
                index={i}
                applicationId={applicationId}
                previousEvent={i > 0 ? timeline[i - 1] : null}
                isLast={i === timeline.length - 1}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
            Click any date to correct it — useful when you log a step days after it happened.
          </p>
        </>
      )}
    </div>
  );
}
