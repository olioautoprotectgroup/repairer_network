import type { TyreTier } from "../../lib/tyrePriceTypes";

const STYLES: Record<TyreTier | "unknown", string> = {
  premium: "bg-highlight/10 text-highlight",
  mid: "bg-brand-50 text-brand-700",
  budget: "bg-slate-100 text-slate-700",
  unknown: "bg-slate-50 text-slate-400",
};

const LABELS: Record<TyreTier | "unknown", string> = {
  premium: "Premium",
  mid: "Mid",
  budget: "Budget",
  unknown: "Unknown tier",
};

export default function TierBadge({ tier }: { tier: TyreTier | "unknown" }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[tier]}`}>{LABELS[tier]}</span>
  );
}
