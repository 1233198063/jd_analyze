import clsx from "clsx";
import { getRegionLabel } from "@/utils/region";
import Icon from "./Icon";

const VARIANTS = {
  green: "bg-sage-100 text-sage-700",
  red: "bg-coral-100 text-coral-700",
  yellow: "bg-gold-100 text-gold-700",
  blue: "bg-petrol-50 text-petrol-600",
  gray: "bg-ink/[0.06] text-ink/55",
  orange: "bg-clay-100 text-clay-700",
  purple: "bg-plum-100 text-plum-700",
};

export default function Badge({ children, variant = "gray", className }) {
  return (
    <span className={clsx("badge", VARIANTS[variant], className)}>
      {children}
    </span>
  );
}

export function SponsorBadge({ status }) {
  if (status === "sponsors") return <Badge variant="green">Sponsors H-1B</Badge>;
  if (status === "no_sponsor") return <Badge variant="red">No Sponsorship</Badge>;
  return <Badge variant="gray">Sponsorship Unknown</Badge>;
}

export function RecommendationBadge({ recommendation, score }) {
  if (recommendation === "auto_reject") return <Badge variant="red">Auto Reject</Badge>;
  if (recommendation === "apply") return <Badge variant="green">Apply — {score?.toFixed(0)}/100</Badge>;
  if (recommendation === "maybe") return <Badge variant="yellow">Maybe — {score?.toFixed(0)}/100</Badge>;
  return <Badge variant="gray">Skip — {score?.toFixed(0)}/100</Badge>;
}

export const POOL_LABELS = {
  primary: "Primary",
  selective: "Selective",
  deprioritized: "Low priority",
};

/** Which effort pool a role sits in — the headline call, so it leads the badge row. */
export function PoolBadge({ pool, reason }) {
  if (!pool || !POOL_LABELS[pool]) return null;
  const variant = pool === "primary" ? "green" : pool === "selective" ? "yellow" : "gray";
  const icon = pool === "primary" ? "target" : pool === "selective" ? "search" : "schedule";
  return (
    <span title={reason || undefined}>
      <Badge variant={variant}>
        <Icon name={icon} size={12} className="mr-1" />
        {POOL_LABELS[pool]}
      </Badge>
    </span>
  );
}

export function LevelBadge({ level }) {
  const colors = {
    intern: "blue",
    entry: "green",
    junior: "green",
    mid: "yellow",
    senior: "orange",
    staff: "red",
    principal: "red",
    manager: "red",
    unknown: "gray",
  };
  return <Badge variant={colors[level] || "gray"}>{level}</Badge>;
}

export function RegionBadge({ location, isRemote }) {
  const label = getRegionLabel(location, isRemote);
  if (!label) return null;
  if (label === "US") return <Badge variant="blue"><Icon name="flag" size={13} className="mr-1" />US</Badge>;
  if (label === "Remote") return <Badge variant="blue">Remote</Badge>;
  return <Badge variant="purple"><Icon name="public" size={13} className="mr-1" />{label}</Badge>;
}

export function AppStatusBadge({ status }) {
  const colors = {
    saved: "gray",
    applied: "blue",
    referral_asked: "purple",
    oa: "yellow",
    phone_screen: "yellow",
    interview: "orange",
    offer: "green",
    rejected: "red",
    withdrawn: "gray",
  };
  const labels = {
    saved: "Saved",
    applied: "Applied",
    referral_asked: "Referral Asked",
    oa: "OA",
    phone_screen: "Phone Screen",
    interview: "Interview",
    offer: "Offer",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
  };
  return <Badge variant={colors[status] || "gray"}>{labels[status] || status}</Badge>;
}
