import { Link } from "react-router-dom";
import clsx from "clsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { SponsorBadge, LevelBadge, AppStatusBadge, RecommendationBadge, RegionBadge, PoolBadge } from "@/components/common/Badge";
import ScoreRing from "./ScoreRing";

dayjs.extend(relativeTime);

export default function JobCard({ job }) {
  const score = job.overall_score;
  const rejected = job.is_auto_rejected;

  return (
    <Link
      to={`/jobs/${job.id}`}
      className={clsx(
        "card block p-4 hover:shadow-md hover:border-bubblegum-300 transition-all",
        rejected && "border-coral-200 bg-coral-50/40"
      )}
    >
      <div className="flex items-start gap-3">
        <ScoreRing score={score ?? 0} isRejected={rejected} size={72} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-ink truncate">
                {job.title || "Untitled Role"}
              </p>
              <p className="text-sm text-ink/60 truncate">{job.company_name || "—"}</p>
            </div>
            <span className="text-xs text-ink/40 whitespace-nowrap flex-shrink-0">
              {dayjs(job.posted_at || job.created_at).fromNow()}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {!rejected && <PoolBadge pool={job.application_pool} />}
            {job.recommendation && (
              <RecommendationBadge recommendation={job.recommendation} score={score} />
            )}
            {job.sponsorship_status && <SponsorBadge status={job.sponsorship_status} />}
            <RegionBadge location={job.location} isRemote={job.is_remote} />
            {job.application_status && <AppStatusBadge status={job.application_status} />}
          </div>
        </div>
      </div>
    </Link>
  );
}
