/**
 * Covers the read-modify-commit path without touching GitHub. The whole
 * github module is mocked, the same way cache.test.ts mocks
 * databricksClient -- so this verifies what the store *sends* (which rows,
 * built on which sha) and its ownership/duplicate rules, not that the
 * GitHub Contents API accepts it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github", () => ({
  getCurrentFile: vi.fn(),
  commitFile: vi.fn(),
  feedbackPath: () => "api/data/repairer-feedback.json",
}));

import { commitFile, getCurrentFile } from "../github";
import type { DiscountReport, RepairerFeedbackFile, RepairerReview } from "../types";
import {
  ForbiddenError,
  NotFoundError,
  DuplicateSubmissionError,
  appendDiscountReport,
  appendReview,
  deleteDiscountReport,
  deleteReview,
  readLiveFeedback,
  updateOwnDiscountReport,
  updateOwnReview,
} from "./store";

const getCurrentFileMock = vi.mocked(getCurrentFile);
const commitFileMock = vi.mocked(commitFile);

const AUTHOR = "handler.one@autoprotectgroup.co.uk";
const OTHER = "handler.two@autoprotectgroup.co.uk";

function review(overrides: Partial<RepairerReview> = {}): RepairerReview {
  return {
    id: "existing-review",
    repairerId: "acme-autos",
    rating: 3,
    note: "Fine",
    authorEmail: AUTHOR,
    authorName: "Handler One",
    // Well outside the duplicate window so these fixtures don't trip it.
    submittedAt: "2026-01-01T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

function discountReport(overrides: Partial<DiscountReport> = {}): DiscountReport {
  return {
    id: "existing-report",
    repairerId: "acme-autos",
    openToNegotiation: true,
    discountPercent: 10,
    note: null,
    authorEmail: AUTHOR,
    authorName: "Handler One",
    submittedAt: "2026-01-01T10:00:00.000Z",
    updatedAt: null,
    ...overrides,
  };
}

/** Whatever the store committed, decoded back into a feedback file. */
function committedFile(): RepairerFeedbackFile {
  return commitFileMock.mock.calls[0][1] as RepairerFeedbackFile;
}

function givenStored(feedback: Partial<RepairerFeedbackFile>, sha: string | null = "sha-1") {
  getCurrentFileMock.mockResolvedValue({
    data: { reviews: feedback.reviews ?? [], discountReports: feedback.discountReports ?? [] },
    sha,
  });
}

beforeEach(() => {
  getCurrentFileMock.mockReset();
  commitFileMock.mockReset();
  commitFileMock.mockResolvedValue(undefined);
});

describe("readLiveFeedback", () => {
  it("normalises a missing file to empty arrays rather than throwing", async () => {
    getCurrentFileMock.mockResolvedValue({ data: null, sha: null });
    await expect(readLiveFeedback()).resolves.toEqual({
      feedback: { reviews: [], discountReports: [] },
      sha: null,
    });
  });

  it("tolerates a file missing one of the two arrays", async () => {
    getCurrentFileMock.mockResolvedValue({ data: { reviews: [review()] }, sha: "sha-1" });
    const { feedback } = await readLiveFeedback();
    expect(feedback.reviews).toHaveLength(1);
    expect(feedback.discountReports).toEqual([]);
  });
});

describe("appendReview", () => {
  it("appends without disturbing existing rows, and commits on the sha it read", async () => {
    givenStored({ reviews: [review()] });

    const created = await appendReview(
      "acme-autos",
      "Acme Autos",
      { rating: 5, note: "Excellent" },
      AUTHOR,
    );

    const file = committedFile();
    expect(file.reviews).toHaveLength(2);
    expect(file.reviews[0].id).toBe("existing-review");
    expect(file.reviews[1]).toEqual(created);
    expect(commitFileMock.mock.calls[0][2]).toBe("sha-1");
    expect(commitFileMock.mock.calls[0][3]).toBe("Add review for Acme Autos");
  });

  // The author must come from the caller's verified identity, never from
  // anything the client could set.
  it("attributes the review to the supplied principal and derives a display name", async () => {
    givenStored({});
    const created = await appendReview("acme-autos", "Acme Autos", { rating: 4, note: null }, AUTHOR);
    expect(created.authorEmail).toBe(AUTHOR);
    expect(created.authorName).toBe("Handler One");
  });

  it("stamps an ISO-8601 UTC timestamp and a fresh id", async () => {
    givenStored({});
    const created = await appendReview("acme-autos", "Acme Autos", { rating: 4, note: null }, AUTHOR);
    expect(created.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.updatedAt).toBeNull();
  });

  it("creates the file when it does not exist yet, committing with no sha", async () => {
    givenStored({}, null);
    await appendReview("acme-autos", "Acme Autos", { rating: 4, note: null }, AUTHOR);
    expect(commitFileMock.mock.calls[0][2]).toBeNull();
  });

  it("rejects an identical resubmission inside the duplicate window", async () => {
    givenStored({
      reviews: [review({ rating: 5, note: "Excellent", submittedAt: new Date().toISOString() })],
    });

    await expect(
      appendReview("acme-autos", "Acme Autos", { rating: 5, note: "Excellent" }, AUTHOR),
    ).rejects.toThrow(DuplicateSubmissionError);
    expect(commitFileMock).not.toHaveBeenCalled();
  });

  // Append-only is the point: the same handler may rate a repairer again
  // later, once the accidental-double-submit window has passed.
  it("allows a second review from the same author outside the window", async () => {
    givenStored({ reviews: [review({ rating: 5, note: "Excellent" })] });
    await expect(
      appendReview("acme-autos", "Acme Autos", { rating: 5, note: "Excellent" }, AUTHOR),
    ).resolves.toBeDefined();
    expect(committedFile().reviews).toHaveLength(2);
  });
});

describe("appendDiscountReport", () => {
  it("appends and commits with a discount-specific message", async () => {
    givenStored({ discountReports: [discountReport()] });

    const created = await appendDiscountReport(
      "acme-autos",
      "Acme Autos",
      { openToNegotiation: true, discountPercent: 15, note: null },
      AUTHOR,
    );

    expect(committedFile().discountReports).toHaveLength(2);
    expect(created.discountPercent).toBe(15);
    expect(commitFileMock.mock.calls[0][3]).toBe("Report discount for Acme Autos");
  });

  it("stores a not-open report with a null percentage", async () => {
    givenStored({});
    const created = await appendDiscountReport(
      "acme-autos",
      "Acme Autos",
      { openToNegotiation: false, discountPercent: null, note: "Held firm" },
      AUTHOR,
    );
    expect(created.openToNegotiation).toBe(false);
    expect(created.discountPercent).toBeNull();
  });

  it("rejects an identical resubmission inside the window", async () => {
    givenStored({
      discountReports: [discountReport({ submittedAt: new Date().toISOString() })],
    });
    await expect(
      appendDiscountReport(
        "acme-autos",
        "Acme Autos",
        { openToNegotiation: true, discountPercent: 10, note: null },
        AUTHOR,
      ),
    ).rejects.toThrow(DuplicateSubmissionError);
  });
});

describe("ownership on edit", () => {
  it("lets an author update their own review", async () => {
    givenStored({ reviews: [review()] });
    const updated = await updateOwnReview("existing-review", { rating: 5, note: "Better" }, AUTHOR);
    expect(updated.rating).toBe(5);
    expect(updated.note).toBe("Better");
    expect(updated.updatedAt).not.toBeNull();
    expect(committedFile().reviews).toHaveLength(1);
  });

  it("preserves the original author and submission time on update", async () => {
    givenStored({ reviews: [review()] });
    const updated = await updateOwnReview("existing-review", { rating: 5, note: null }, AUTHOR);
    expect(updated.authorEmail).toBe(AUTHOR);
    expect(updated.submittedAt).toBe("2026-01-01T10:00:00.000Z");
  });

  it("refuses to let one handler edit another's review", async () => {
    givenStored({ reviews: [review()] });
    await expect(
      updateOwnReview("existing-review", { rating: 1, note: "Sabotage" }, OTHER),
    ).rejects.toThrow(ForbiddenError);
    expect(commitFileMock).not.toHaveBeenCalled();
  });

  it("refuses to let one handler edit another's discount report", async () => {
    givenStored({ discountReports: [discountReport()] });
    await expect(
      updateOwnDiscountReport(
        "existing-report",
        { openToNegotiation: true, discountPercent: 90, note: null },
        OTHER,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("404s on an unknown id", async () => {
    givenStored({ reviews: [review()] });
    await expect(
      updateOwnReview("no-such-review", { rating: 4, note: null }, AUTHOR),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("ownership on delete", () => {
  it("lets an author delete their own review", async () => {
    givenStored({ reviews: [review()] });
    await deleteReview("existing-review", AUTHOR, false);
    expect(committedFile().reviews).toEqual([]);
  });

  it("refuses deletion of another handler's review without moderator rights", async () => {
    givenStored({ reviews: [review()] });
    await expect(deleteReview("existing-review", OTHER, false)).rejects.toThrow(ForbiddenError);
    expect(commitFileMock).not.toHaveBeenCalled();
  });

  // The repairer network owner needs a route to remove something
  // inaccurate about a named business.
  it("lets a moderator delete anyone's review", async () => {
    givenStored({ reviews: [review()] });
    await expect(deleteReview("existing-review", OTHER, true)).resolves.toEqual({
      repairerId: "acme-autos",
    });
    expect(committedFile().reviews).toEqual([]);
  });

  it("lets a moderator delete anyone's discount report", async () => {
    givenStored({ discountReports: [discountReport()] });
    await deleteDiscountReport("existing-report", OTHER, true);
    expect(committedFile().discountReports).toEqual([]);
  });

  it("leaves other rows untouched", async () => {
    givenStored({
      reviews: [review(), review({ id: "keep-me", authorEmail: OTHER })],
    });
    await deleteReview("existing-review", AUTHOR, false);
    expect(committedFile().reviews.map((r) => r.id)).toEqual(["keep-me"]);
  });
});

describe("conflict handling", () => {
  const conflict = new Error("GitHub API 409 (using fine-grained PAT, length 93): conflict");

  // An append is idempotent to retry because the mutation is re-applied to
  // a freshly re-read file -- unlike the repairer list's whole-array
  // overwrite, which is why github.ts has no retry of its own.
  it("retries once on a 409 and re-reads before re-appending", async () => {
    givenStored({ reviews: [review()] });
    commitFileMock.mockRejectedValueOnce(conflict).mockResolvedValueOnce(undefined);

    await expect(
      appendReview("acme-autos", "Acme Autos", { rating: 5, note: "Excellent" }, AUTHOR),
    ).resolves.toBeDefined();

    expect(getCurrentFileMock).toHaveBeenCalledTimes(2);
    expect(commitFileMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second conflict so the caller can surface 'please retry'", async () => {
    givenStored({});
    commitFileMock.mockRejectedValue(conflict);

    await expect(
      appendReview("acme-autos", "Acme Autos", { rating: 5, note: null }, AUTHOR),
    ).rejects.toThrow(/GitHub API 409/);
    expect(commitFileMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-conflict failure", async () => {
    givenStored({});
    commitFileMock.mockRejectedValue(new Error("GitHub API 401: bad credentials"));

    await expect(
      appendReview("acme-autos", "Acme Autos", { rating: 5, note: null }, AUTHOR),
    ).rejects.toThrow(/401/);
    expect(commitFileMock).toHaveBeenCalledTimes(1);
  });
});
