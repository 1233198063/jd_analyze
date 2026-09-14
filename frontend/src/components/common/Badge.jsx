import clsx from "clsx";
import { getRegionLabel } from "@/utils/region";

const VARIANTS = {
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  yellow: "bg-yellow-100 text-yellow-700",
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-gray-100 text-gray-600",
  orange: "bg-orange-100 text-orange-700",
  purple: "bg-purple-100 text-purple-700",
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
  if (label === "US") return <Badge variant="blue">🇺🇸 US</Badge>;
  if (label === "Remote") return <Badge variant="blue">Remote</Badge>;
  return <Badge variant="purple">🌐 {label}</Badge>;
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
