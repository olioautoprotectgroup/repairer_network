import { describe, expect, it } from "vitest";
import type { DiscountReport, RepairerReview } from "../types";
import {
  DUPLICATE_WINDOW_MS,
  MAX_NOTE_LENGTH,
  displayNameFromEmail,
  isDuplicateDiscountReport,
  isDuplicateReview,
  validateDiscountReport,
  validateReview,
} from "./validate";

function review(overrides: Partial<RepairerReview> = {}): RepairerReview {
  return {
    id: "r1",
    repairerId: "acme-autos",
    rating: 4,
    note: "Good work",
    authorEmail: "handler.one@autoprotectgroup.co.uk",
    authorName: "Handler One",
    submittedAt: new Date("2026-09-03T10:00:00.000Z").toISOString(),
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
    submittedAt: new Date("2026-09-03T10:00:00.000Z").toISOString(),
    updatedAt: null,
    ...overrides,
  };
}

describe("validateReview", () => {
  it("accepts a whole-number rating with a note", () => {
    expect(validateReview({ rating: 4, note: "Quick turnaround" })).toEqual({
      rating: 4,
      note: "Quick turnaround",
    });
  });

  it("accepts both ends of the scale", () => {
    expect(validateReview({ rating: 1 })).toEqual({ rating: 1, note: null });
    expect(validateReview({ rating: 5 })).toEqual({ rating: 5, note: null });
  });

  it("rejects ratings outside 1-5", () => {
    expect(validateReview({ rating: 0 })).toHaveProperty("error");
    expect(validateReview({ rating: 6 })).toHaveProperty("error");
    expect(validateReview({ rating: -1 })).toHaveProperty("error");
  });

  it("rejects a fractional rating", () => {
    expect(validateReview({ rating: 2.5 })).toHaveProperty("error");
  });

  // A coerced "4" would pass a range check and then store a string in a
  // field every average divides by.
  it("rejects a numeric string rather than coercing it", () => {
    expect(validateReview({ rating: "4" })).toHaveProperty("error");
  });

  it("rejects a missing rating", () => {
    expect(validateReview({ rating: undefined })).toHaveProperty("error");
    expect(validateReview({ rating: null })).toHaveProperty("error");
  });

  it("trims a note and treats whitespace-only as no note", () => {
    expect(validateReview({ rating: 3, note: "  spaced  " })).toEqual({
      rating: 3,
      note: "spaced",
    });
    expect(validateReview({ rating: 3, note: "   " })).toEqual({ rating: 3, note: null });
  });

  it("accepts a note at the length limit and rejects one over it", () => {
    expect(validateReview({ rating: 3, note: "x".repeat(MAX_NOTE_LENGTH) })).not.toHaveProperty(
      "error",
    );
    expect(validateReview({ rating: 3, note: "x".repeat(MAX_NOTE_LENGTH + 1) })).toHaveProperty(
      "error",
    );
  });

  it("rejects a non-string note", () => {
    expect(validateReview({ rating: 3, note: 42 })).toHaveProperty("error");
  });
});

describe("validateDiscountReport", () => {
  it("accepts open-to-negotiation with a percentage", () => {
    expect(validateDiscountReport({ openToNegotiation: true, discountPercent: 12.5 })).toEqual({
      openToNegotiation: true,
      discountPercent: 12.5,
      note: null,
    });
  });

  it("accepts not-open with no percentage", () => {
    expect(validateDiscountReport({ openToNegotiation: false, note: "Held firm" })).toEqual({
      openToNegotiation: false,
      discountPercent: null,
      note: "Held firm",
    });
  });

  it("requires a percentage when open to negotiation", () => {
    expect(validateDiscountReport({ openToNegotiation: true })).toHaveProperty("error");
    expect(validateDiscountReport({ openToNegotiation: true, discountPercent: null })).toHaveProperty(
      "error",
    );
  });

  // Contradictory input: silently dropping the number would misreport what
  // the handler actually submitted.
  it("rejects a percentage alongside not-open", () => {
    expect(
      validateDiscountReport({ openToNegotiation: false, discountPercent: 10 }),
    ).toHaveProperty("error");
  });

  it("rejects percentages outside 0-100 exclusive of zero", () => {
    expect(validateDiscountReport({ openToNegotiation: true, discountPercent: 0 })).toHaveProperty(
      "error",
    );
    expect(
      validateDiscountReport({ openToNegotiation: true, discountPercent: 101 }),
    ).toHaveProperty("error");
    expect(
      validateDiscountReport({ openToNegotiation: true, discountPercent: -5 }),
    ).toHaveProperty("error");
  });

  it("accepts exactly 100", () => {
    expect(
      validateDiscountReport({ openToNegotiation: true, discountPercent: 100 }),
    ).not.toHaveProperty("error");
  });

  it("rounds a float to one decimal place", () => {
    expect(
      validateDiscountReport({ openToNegotiation: true, discountPercent: 12.4999999 }),
    ).toEqual({ openToNegotiation: true, discountPercent: 12.5, note: null });
  });

  it("rejects a non-boolean openToNegotiation rather than coercing it", () => {
    expect(validateDiscountReport({ openToNegotiation: "true" })).toHaveProperty("error");
    expect(validateDiscountReport({ openToNegotiation: undefined })).toHaveProperty("error");
  });

  it("rejects NaN, which is neither a valid percentage nor caught by a range check alone", () => {
    expect(
      validateDiscountReport({ openToNegotiation: true, discountPercent: Number.NaN }),
    ).toHaveProperty("error");
  });
});

describe("isDuplicateReview", () => {
  const now = Date.parse("2026-09-03T10:01:00.000Z");
  const candidate = {
    repairerId: "acme-autos",
    authorEmail: "handler.one@autoprotectgroup.co.uk",
    rating: 4,
    note: "Good work",
  };

  it("flags an identical submission inside the window", () => {
    expect(isDuplicateReview([review()], candidate, now)).toBe(true);
  });

  it("allows the same review again once the window has passed", () => {
    const later = Date.parse("2026-09-03T10:00:00.000Z") + DUPLICATE_WINDOW_MS + 1;
    expect(isDuplicateReview([review()], candidate, later)).toBe(false);
  });

  it("does not flag a different rating, note, author or repairer", () => {
    expect(isDuplicateReview([review({ rating: 5 })], candidate, now)).toBe(false);
    expect(isDuplicateReview([review({ note: "Different" })], candidate, now)).toBe(false);
    expect(
      isDuplicateReview(
        [review({ authorEmail: "handler.two@autoprotectgroup.co.uk" })],
        candidate,
        now,
      ),
    ).toBe(false);
    expect(isDuplicateReview([review({ repairerId: "other-garage" })], candidate, now)).toBe(false);
  });

  it("matches on a null note, so two blank-note resubmissions collapse", () => {
    expect(
      isDuplicateReview([review({ note: null })], { ...candidate, note: null }, now),
    ).toBe(true);
  });

  it("is false against an empty store", () => {
    expect(isDuplicateReview([], candidate, now)).toBe(false);
  });
});

describe("isDuplicateDiscountReport", () => {
  const now = Date.parse("2026-09-03T10:01:00.000Z");
  const candidate = {
    repairerId: "acme-autos",
    authorEmail: "handler.one@autoprotectgroup.co.uk",
    openToNegotiation: true,
    discountPercent: 10,
    note: null,
  };

  it("flags an identical submission inside the window", () => {
    expect(isDuplicateDiscountReport([discountReport()], candidate, now)).toBe(true);
  });

  it("does not flag a different percentage or negotiation flag", () => {
    expect(isDuplicateDiscountReport([discountReport({ discountPercent: 15 })], candidate, now)).toBe(
      false,
    );
    expect(
      isDuplicateDiscountReport(
        [discountReport({ openToNegotiation: false, discountPercent: null })],
        candidate,
        now,
      ),
    ).toBe(false);
  });

  it("allows the same report again once the window has passed", () => {
    const later = Date.parse("2026-09-03T10:00:00.000Z") + DUPLICATE_WINDOW_MS + 1;
    expect(isDuplicateDiscountReport([discountReport()], candidate, later)).toBe(false);
  });
});

describe("displayNameFromEmail", () => {
  it("title-cases a firstname.lastname UPN", () => {
    expect(displayNameFromEmail("jane.smith@autoprotectgroup.co.uk")).toBe("Jane Smith");
  });

  it("handles underscores and hyphens as separators", () => {
    expect(displayNameFromEmail("jane_smith@autoprotectgroup.co.uk")).toBe("Jane Smith");
    expect(displayNameFromEmail("jane-smith@autoprotectgroup.co.uk")).toBe("Jane Smith");
  });

  it("handles a single-word local part", () => {
    expect(displayNameFromEmail("jsmith@autoprotectgroup.co.uk")).toBe("Jsmith");
  });

  // Never render an empty author next to a review.
  it("falls back to the address when there is no usable local part", () => {
    expect(displayNameFromEmail("@autoprotectgroup.co.uk")).toBe("@autoprotectgroup.co.uk");
    expect(displayNameFromEmail("...@autoprotectgroup.co.uk")).toBe("...@autoprotectgroup.co.uk");
  });
});
