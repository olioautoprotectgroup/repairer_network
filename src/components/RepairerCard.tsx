import { useState } from "react";
import type { RepairerFeedbackSummary, SearchResult } from "../lib/types";
import RepairerFeedbackPanel from "./RepairerFeedbackPanel";
import { StarRatingDisplay } from "./StarRating";

interface Props {
  repairer: SearchResult;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Undefined when nobody has left feedback for this repairer yet, which
   * the summaries endpoint reports by omission rather than by sending a
   * zeroed row for all ~114 repairers. */
  feedback: RepairerFeedbackSummary | undefined;
  currentUserEmail: string;
  canModerate: boolean;
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
      {children}
    </span>
  );
}

function googleMapsUrl(companyName: string, tradingAddress: string): string {
  const query = encodeURIComponent(`${companyName}, ${tradingAddress}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function formatAsOfDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function RepairerCard({
  repairer,
  selected,
  onSelect,
  feedback,
  currentUserEmail,
  canModerate,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  // Seeded from the bundled summaries, then replaced by whatever the panel
  // last read live -- so a handler's own review shows on the card
  // immediately instead of after the next redeploy.
  const [liveSummary, setLiveSummary] = useState<RepairerFeedbackSummary | null>(null);
  const summary = liveSummary ?? feedback;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(repairer.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(repairer.id);
      }}
      className={`w-full cursor-pointer rounded-2xl border p-4 text-left shadow-sm transition ${
        selected
          ? "border-highlight bg-highlight/5 ring-2 ring-highlight/30"
          : "border-slate-200 bg-white hover:border-brand-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{repairer.companyName}</h3>
          <p className="text-sm text-slate-500">{repairer.tradingAddress}</p>
        </div>
        <div className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white">
          {repairer.distanceMiles.toFixed(1)} mi
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {repairer.vehicleManufacturers.slice(0, 4).map((m) => (
          <Badge key={m}>{m}</Badge>
        ))}
        {repairer.providesRecovery && <Badge>Recovery available</Badge>}
        {repairer.hasDealerRelationship && <Badge>Dealer relationship</Badge>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <button
          type="button"
          aria-expanded={panelOpen}
          onClick={(e) => {
            // The card root is itself a button; without this, opening the
            // panel would also re-select the card.
            e.stopPropagation();
            setPanelOpen((open) => !open);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 -ml-1.5 hover:bg-brand-50"
        >
          {summary?.averageRating != null ? (
            <>
              <StarRatingDisplay rating={summary.averageRating} />
              <span className="font-medium text-slate-800">
                {summary.averageRating.toFixed(1)}
              </span>
              <span className="text-slate-500">
                ({summary.reviewCount} review{summary.reviewCount === 1 ? "" : "s"})
              </span>
            </>
          ) : (
            <span className="font-medium text-brand-600">Rate this repairer</span>
          )}
          <span className="text-slate-400">{panelOpen ? "▾" : "▸"}</span>
        </button>

        {summary != null && summary.discountReportCount > 0 && (
          <span className="text-slate-600">
            {summary.openToNegotiationCount > 0 ? (
              <span className="font-medium text-emerald-600">Open to discount</span>
            ) : (
              <span className="font-medium text-amber-700">Wouldn't negotiate</span>
            )}
            {summary.averageDiscountPercent != null && (
              <span className="font-medium text-slate-800">
                {" "}
                &middot; avg {summary.averageDiscountPercent}% off
              </span>
            )}
            <span className="text-slate-500">
              {" "}
              ({summary.discountReportCount} report{summary.discountReportCount === 1 ? "" : "s"})
            </span>
          </span>
        )}
      </div>

      {panelOpen && (
        <RepairerFeedbackPanel
          repairerId={repairer.id}
          currentUserEmail={currentUserEmail}
          canModerate={canModerate}
          onSummaryChange={setLiveSummary}
        />
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
        {repairer.labourRate != null && (
          <div>
            Labour rate: <span className="font-medium text-slate-800">£{repairer.labourRate}/hr</span>
          </div>
        )}
        {repairer.coverageRadiusMiles != null && (
          <div>
            Coverage: <span className="font-medium text-slate-800">{repairer.coverageRadiusMiles} mi</span>
          </div>
        )}
        {repairer.phoneNumber && (
          <div>
            Phone: <span className="font-medium text-slate-800">{repairer.phoneNumber}</span>
          </div>
        )}
        {repairer.mainContactName && (
          <div>
            Contact: <span className="font-medium text-slate-800">{repairer.mainContactName}</span>
          </div>
        )}
        {repairer.recentRepairCount != null && (
          <div className="col-span-2">
            Annual Repair Volume:{" "}
            <span className="font-medium text-slate-800">{repairer.recentRepairCount}</span>
            {repairer.repairCountAsOf && (
              <span className="text-slate-400"> (as of {formatAsOfDate(repairer.repairCountAsOf)})</span>
            )}
          </div>
        )}
      </div>

      {repairer.lat != null && repairer.lon != null && (
        <a
          href={googleMapsUrl(repairer.companyName, repairer.tradingAddress)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
        >
          Open in Google Maps ↗
        </a>
      )}
    </div>
  );
}
