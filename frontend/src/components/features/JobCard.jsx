import { Link } from "react-router-dom";
import clsx from "clsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { SponsorBadge, LevelBadge, AppStatusBadge, RecommendationBadge, RegionBadge } from "@/components/common/Badge";
import ScoreRing from "./ScoreRing";

dayjs.extend(relativeTime);

export default function JobCard({ job }) {
  const score = job.overall_score;
  const rejected = job.is_auto_rejected;

  return (
    <Link
      to={`/jobs/${job.id}`}
      className={clsx(
        "card block p-4 hover:shadow-md transition-shadow",
        rejected && "border-red-200 bg-red-50/30"
      )}
    >
      <div className="flex items-start gap-3">
        <ScoreRing score={score ?? 0} isRejected={rejected} size={72} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">
                {job.title || "Untitled Role"}
              </p>
              <p className="text-sm text-gray-600 truncate">{job.company_name || "—"}</p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
              {dayjs(job.posted_at || job.created_at).fromNow()}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2">
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
