/**
 * Pure aggregation of feedback rows into the per-repairer rollups the
 * cards display. Kept separate from the store so it is testable without
 * touching GitHub, and computed on every read rather than denormalised
 * onto the repairer record -- there is then no stored average that can
 * drift out of step with the rows behind it.
 */
import type {
  DiscountReport,
  RepairerFeedbackFile,
  RepairerFeedbackSummary,
  RepairerReview,
} from "../types";

export const EMPTY_FEEDBACK: RepairerFeedbackFile = { reviews: [], discountReports: [] };

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  // One decimal place -- enough to distinguish 4.2 from 4.3 on a card,
  // without implying precision the sample size doesn't support.
  return Math.round((total / values.length) * 10) / 10;
}

function newestFirst<T extends { submittedAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

export function summarizeRepairer(
  repairerId: string,
  reviews: RepairerReview[],
  discountReports: DiscountReport[],
): RepairerFeedbackSummary {
  const openReports = discountReports.filter((d) => d.openToNegotiation);

  return {
    repairerId,
    averageRating: mean(reviews.map((r) => r.rating)),
    reviewCount: reviews.length,
    openToNegotiationCount: openReports.length,
    notOpenToNegotiationCount: discountReports.length - openReports.length,
    // Averaged over the reports that actually negotiated. Including the
    // "wouldn't negotiate" ones as zeroes would answer a different
    // question ("expected discount") and read as a suspiciously low
    // "discount achieved" on the card.
    averageDiscountPercent: mean(
      openReports
        .map((d) => d.discountPercent)
        .filter((p): p is number => p != null),
    ),
    discountReportCount: discountReports.length,
  };
}

/**
 * Rollups keyed by repairer id. Only repairers with at least one row
 * appear -- the card treats a missing entry and an all-zero entry the same
 * way, so sending ~114 empty objects would be wasted payload.
 */
export function summarizeAll(
  feedback: RepairerFeedbackFile,
): Record<string, RepairerFeedbackSummary> {
  const ids = new Set<string>([
    ...feedback.reviews.map((r) => r.repairerId),
    ...feedback.discountReports.map((d) => d.repairerId),
  ]);

  const summaries: Record<string, RepairerFeedbackSummary> = {};
  for (const id of ids) {
    summaries[id] = summarizeRepairer(
      id,
      feedback.reviews.filter((r) => r.repairerId === id),
      feedback.discountReports.filter((d) => d.repairerId === id),
    );
  }
  return summaries;
}

/** Everything the panel renders for one repairer, newest submission first. */
export function detailFor(repairerId: string, feedback: RepairerFeedbackFile) {
  const reviews = newestFirst(feedback.reviews.filter((r) => r.repairerId === repairerId));
  const discountReports = newestFirst(
    feedback.discountReports.filter((d) => d.repairerId === repairerId),
  );
  return {
    repairerId,
    summary: summarizeRepairer(repairerId, reviews, discountReports),
    reviews,
    discountReports,
  };
}
