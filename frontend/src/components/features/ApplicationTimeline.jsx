import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { applicationsApi } from "@/api/applications";
import { AppStatusBadge, APP_STATUS_LABELS } from "@/components/common/Badge";
import Icon from "@/components/common/Icon";
import Stamp, { stampLabel, stampTextClass } from "@/components/features/Stamp";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

function daysBetween(from, to) {
  return dayjs(to).startOf("day").diff(dayjs(from).startOf("day"), "day");
}

const blankDraft = (event) => ({
  status: event.status,
  date: dayjs(event.timestamp).format("YYYY-MM-DD"),
  note: event.note || "",
});

/** Only the fields that changed, so an untouched date keeps its time of day (and its order). */
function changes(event, draft) {
  const original = blankDraft(event);
  const payload = {};
  if (draft.status !== original.status) payload.status = draft.status;
  if (draft.date !== original.date) {
    payload.timestamp = dayjs(`${draft.date}T${dayjs(event.timestamp).format("HH:mm:ss")}`).toISOString();
  }
  if (draft.note.trim() !== original.note) payload.note = draft.note.trim();
  return payload;
}

function EventRow({ event, index, applicationId, jobId, previousEvent, isLast, canDelete }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => blankDraft(event));

  // The current stage, applied date and daily log are all derived from these steps.
  const refresh = () => {
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["application", applicationId] });
    qc.invalidateQueries({ queryKey: ["job", jobId] });
    qc.invalidateQueries({ queryKey: ["kanban"] });
    qc.invalidateQueries({ queryKey: ["application-analysis"] });
    qc.invalidateQueries({ queryKey: ["daily"] });
  };

  const save = useMutation({
    mutationFn: (payload) => applicationsApi.updateTimelineEvent(applicationId, index, payload),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => applicationsApi.deleteTimelineEvent(applicationId, index),
    onSuccess: refresh,
  });

  const startEditing = () => {
    setDraft(blankDraft(event));
    save.reset();
    remove.reset();
    setEditing(true);
  };
  const submit = () => {
    const payload = changes(event, draft);
    if (Object.keys(payload).length === 0) setEditing(false);
    else save.mutate(payload);
  };
  const busy = save.isPending || remove.isPending;
  const error = save.error || remove.error;

  const gap = previousEvent ? daysBetween(previousEvent.timestamp, event.timestamp) : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <Stamp status={event.status} seed={event.timestamp} />
        {!isLast && <span className="flex-1 border-l border-dashed border-petrol-200 my-1" />}
      </div>

      <div className={`flex-1 min-w-0 ${isLast ? "" : "pb-4"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <AppStatusBadge status={event.status} />
          <span className={`font-hand text-base ${stampTextClass(event.status)}`}>
            {stampLabel(event.status)}
          </span>
          {gap != null && gap > 0 && (
            <span className="text-xs text-ink/40">+{gap}d</span>
          )}
          {!editing && (
            <button
              className="ml-auto inline-flex items-center gap-1 text-xs text-ink/35 hover:text-petrol-500 transition-colors"
              onClick={startEditing}
              title="Fix the stage, date or note of this step"
            >
              <Icon name="edit" size={14} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-2 p-3 rounded-lg bg-canvas border border-mist/60 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="input text-xs py-1 w-40"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                aria-label="Stage"
              >
                {Object.entries(APP_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <input
                type="date"
                className="input text-xs py-1 w-36"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                aria-label="Date"
              />
            </div>
            <input
              type="text"
              className="input text-xs py-1"
              placeholder="Note (optional), e.g. HackerRank, 90 min"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              aria-label="Note"
            />
            <div className="flex items-center gap-2">
              <button
                className="text-xs px-2.5 py-1 rounded bg-petrol-500 text-white hover:bg-bubblegum-500 transition-colors disabled:opacity-50"
                disabled={busy || !draft.date}
                onClick={submit}
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
              <button
                className="text-xs px-2.5 py-1 rounded border border-petrol-200 hover:bg-white transition-colors"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              {canDelete && (
                <button
                  className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-ink/40 hover:text-coral-600 hover:bg-coral-50 transition-colors disabled:opacity-50"
                  disabled={busy}
                  onClick={() => confirm(`Delete the ${APP_STATUS_LABELS[event.status] || event.status} step?`) && remove.mutate()}
                >
                  <Icon name="delete" size={14} />
                  {remove.isPending ? "Deleting…" : "Delete step"}
                </button>
              )}
            </div>
            {error && (
              <p className="text-xs text-coral-600">
                {error.response?.data?.detail || "Couldn't save the change. Try again."}
              </p>
            )}
          </div>
        ) : (
          <button
            className="mt-0.5 block text-left hover:opacity-70 transition-opacity"
            onClick={startEditing}
            title="Click to correct this step"
          >
            <span className="font-hand text-lg text-ink/80 leading-none">
              {dayjs(event.timestamp).format("MMM D, YYYY")}
            </span>
            <span className="text-xs text-ink/40"> · {dayjs(event.timestamp).fromNow()}</span>
          </button>
        )}

        {!editing && event.note && <p className="text-xs text-ink/40 mt-0.5">{event.note}</p>}
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
        <h3 className="text-sm font-semibold text-ink/80">
          Application Timeline
          <span className="font-hand text-lg text-ink/40 ml-2">Journal</span>
        </h3>
        {appliedAt && (
          <p className="text-xs text-ink/40">
            Applied {dayjs(appliedAt).format("MMM D, YYYY")}
            {totalDays > 0 && ` · ${totalDays} days ago`}
          </p>
        )}
      </div>

      {timeline.length === 0 ? (
        <p className="text-sm text-ink/40">No steps recorded yet.</p>
      ) : (
        <>
          <div>
            {timeline.map((event, i) => (
              <EventRow
                key={`${event.status}-${event.timestamp}-${i}`}
                event={event}
                index={i}
                applicationId={applicationId}
                jobId={data.job_id}
                previousEvent={i > 0 ? timeline[i - 1] : null}
                isLast={i === timeline.length - 1}
                canDelete={timeline.length > 1}
              />
            ))}
          </div>
          <p className="text-xs text-ink/40 mt-3 pt-3 border-t border-mist/60">
            Picked the wrong stage, or logged a step late? Edit any step to fix its stage, date or
            note, or delete it. The current stage always follows the latest step.
          </p>
        </>
      )}
    </div>
  );
}
