import { describe, expect, it } from "vitest";
import type { DiscountReport, RepairerReview } from "../types";
import { detailFor, summarizeAll, summarizeRepairer } from "./summarize";

function review(overrides: Partial<RepairerReview> = {}): RepairerReview {
  return {
    id: "r1",
    repairerId: "acme-autos",
    rating: 4,
    note: null,
    authorEmail: "handler.one@autoprotectgroup.co.uk",
    authorName: "Handler One",
    submittedAt: "2026-09-01T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

function discountReport(overrides: Partial<DiscountReport> = {}): DiscountReport {
  return {
    id: "d1",
    repairerId: "acme-autos",
    openToNegotiation: true,
    discountPercent: 10,
    note: null,
    authorEmail: "handler.one@autoprotectgroup.co.uk",
    authorName: "Handler One",
    submittedAt: "2026-09-01T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

describe("summarizeRepairer", () => {
  it("averages ratings to one decimal place", () => {
    const summary = summarizeRepairer(
      "acme-autos",
      [review({ rating: 4 }), review({ rating: 5 }), review({ rating: 4 })],
      [],
    );
    expect(summary.averageRating).toBe(4.3);
    expect(summary.reviewCount).toBe(3);
  });

  // null means "nothing submitted yet", never "rated zero" -- the same
  // convention recentRepairCount documents in types.ts.
  it("reports a null average, not zero, when there are no reviews", () => {
    const summary = summarizeRepairer("acme-autos", [], []);
    expect(summary.averageRating).toBeNull();
    expect(summary.reviewCount).toBe(0);
    expect(summary.averageDiscountPercent).toBeNull();
    expect(summary.discountReportCount).toBe(0);
  });

  it("counts open and not-open discount reports separately", () => {
    const summary = summarizeRepairer(
      "acme-autos",
      [],
      [
        discountReport({ openToNegotiation: true, discountPercent: 10 }),
        discountReport({ openToNegotiation: true, discountPercent: 20 }),
        discountReport({ openToNegotiation: false, discountPercent: null }),
      ],
    );
    expect(summary.openToNegotiationCount).toBe(2);
    expect(summary.notOpenToNegotiationCount).toBe(1);
    expect(summary.discountReportCount).toBe(3);
  });

  // Counting "wouldn't negotiate" as a 0% discount would answer a
  // different question and read as a suspiciously low discount achieved.
  it("averages the discount only over reports that negotiated", () => {
    const summary = summarizeRepairer(
      "acme-autos",
      [],
      [
        discountReport({ openToNegotiation: true, discountPercent: 10 }),
        discountReport({ openToNegotiation: true, discountPercent: 20 }),
        discountReport({ openToNegotiation: false, discountPercent: null }),
      ],
    );
    expect(summary.averageDiscountPercent).toBe(15);
  });

  it("reports a null discount average when every report says not open", () => {
    const summary = summarizeRepairer(
      "acme-autos",
      [],
      [discountReport({ openToNegotiation: false, discountPercent: null })],
    );
    expect(summary.averageDiscountPercent).toBeNull();
    expect(summary.notOpenToNegotiationCount).toBe(1);
  });

  it("ignores a null percentage on an open report rather than averaging it as zero", () => {
    const summary = summarizeRepairer(
      "acme-autos",
      [],
      [
        discountReport({ openToNegotiation: true, discountPercent: 20 }),
        discountReport({ openToNegotiation: true, discountPercent: null }),
      ],
    );
    expect(summary.averageDiscountPercent).toBe(20);
    expect(summary.openToNegotiationCount).toBe(2);
  });
});

describe("summarizeAll", () => {
  it("groups rows by repairer", () => {
    const summaries = summarizeAll({
      reviews: [
        review({ repairerId: "acme-autos", rating: 5 }),
        review({ repairerId: "beta-garage", rating: 3 }),
      ],
      discountReports: [discountReport({ repairerId: "beta-garage", discountPercent: 8 })],
    });

    expect(summaries["acme-autos"].averageRating).toBe(5);
    expect(summaries["acme-autos"].discountReportCount).toBe(0);
    expect(summaries["beta-garage"].averageRating).toBe(3);
    expect(summaries["beta-garage"].averageDiscountPercent).toBe(8);
  });

  // The card renders a missing entry and an all-zero entry identically, so
  // sending one per repairer in the network would be wasted payload.
  it("omits repairers with no feedback at all", () => {
    const summaries = summarizeAll({
      reviews: [review({ repairerId: "acme-autos" })],
      discountReports: [],
    });
    expect(Object.keys(summaries)).toEqual(["acme-autos"]);
    expect(summaries["never-reviewed"]).toBeUndefined();
  });

  it("includes a repairer that has only a discount report", () => {
    const summaries = summarizeAll({
      reviews: [],
      discountReports: [discountReport({ repairerId: "beta-garage" })],
    });
    expect(summaries["beta-garage"].reviewCount).toBe(0);
    expect(summaries["beta-garage"].averageRating).toBeNull();
    expect(summaries["beta-garage"].discountReportCount).toBe(1);
  });

  it("returns an empty map for an empty file", () => {
    expect(summarizeAll({ reviews: [], discountReports: [] })).toEqual({});
  });
});

describe("detailFor", () => {
  it("returns only the named repairer's rows, newest first", () => {
    const detail = detailFor("acme-autos", {
      reviews: [
        review({ id: "old", submittedAt: "2026-08-01T10:00:00.000Z" }),
        review({ id: "new", submittedAt: "2026-09-01T10:00:00.000Z" }),
        review({ id: "other", repairerId: "beta-garage" }),
      ],
      discountReports: [
        discountReport({ id: "d-old", submittedAt: "2026-08-01T10:00:00.000Z" }),
        discountReport({ id: "d-new", submittedAt: "2026-09-01T10:00:00.000Z" }),
      ],
    });

    expect(detail.reviews.map((r) => r.id)).toEqual(["new", "old"]);
    expect(detail.discountReports.map((d) => d.id)).toEqual(["d-new", "d-old"]);
    expect(detail.summary.reviewCount).toBe(2);
  });

  it("returns empty lists and a zeroed summary for a repairer with no feedback", () => {
    const detail = detailFor("never-reviewed", { reviews: [], discountReports: [] });
    expect(detail.reviews).toEqual([]);
    expect(detail.discountReports).toEqual([]);
    expect(detail.summary.averageRating).toBeNull();
    expect(detail.summary.reviewCount).toBe(0);
  });
});
