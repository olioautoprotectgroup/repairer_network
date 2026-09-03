/**
 * Persistence for staff feedback, on the same GitHub-commit model as the
 * repairer list -- see api/src/lib/github.ts. Feedback lives in its own
 * blob so a handler's review never contends with the nightly repair-count
 * sync for one file's sha.
 *
 * Reads are split the same way the repairer data's are:
 *  - loadBundledFeedback() reads the deployed copy. Fast, no GitHub call,
 *    up to ~1 minute stale -- fine for card aggregates, and used on the
 *    hot path (every search).
 *  - readLiveFeedback() reads through GitHub. Used wherever a handler must
 *    see their own write, exactly as Manage Repairers' list does.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { commitFile, feedbackPath, getCurrentFile } from "../github";
import type { DiscountReport, RepairerFeedbackFile, RepairerReview } from "../types";
import { EMPTY_FEEDBACK } from "./summarize";
import {
  displayNameFromEmail,
  isDuplicateDiscountReport,
  isDuplicateReview,
  type ValidDiscountReport,
  type ValidReview,
} from "./validate";

// Compiled to dist/src/lib/feedback/store.js -- data/ lives alongside src/,
// four levels up from there (one deeper than lib/data.ts).
const DATA_FILE = path.join(__dirname, "..", "..", "..", "..", "data", "repairer-feedback.json");

export class DuplicateSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateSubmissionError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * A missing or unparseable file reads as empty rather than throwing: the
 * feature ships with an empty file, but a search must not 500 because the
 * deployed bundle predates it.
 */
export function loadBundledFeedback(): RepairerFeedbackFile {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RepairerFeedbackFile>;
    return {
      reviews: parsed.reviews ?? [],
      discountReports: parsed.discountReports ?? [],
    };
  } catch {
    return EMPTY_FEEDBACK;
  }
}

export async function readLiveFeedback(): Promise<{
  feedback: RepairerFeedbackFile;
  sha: string | null;
}> {
  const { data, sha } = await getCurrentFile<Partial<RepairerFeedbackFile>>(feedbackPath());
  return {
    feedback: {
      reviews: data?.reviews ?? [],
      discountReports: data?.discountReports ?? [],
    },
    sha,
  };
}

/**
 * Read-modify-commit with one automatic retry on conflict.
 *
 * github.ts has no retry anywhere, and deliberately so for the repairer
 * list: those writes replace a whole array built from a snapshot, so a
 * blind retry could resurrect stale rows. A feedback mutation is different
 * -- `mutate` is re-run against the *freshly re-read* file, so retrying
 * re-applies the same append to current data and converges. One retry
 * only; a second conflict means genuine contention and surfaces as the
 * existing "please retry" message via saveFailureResponse().
 */
async function withFeedbackFile<T>(
  commitMessage: (result: T) => string,
  mutate: (feedback: RepairerFeedbackFile) => { next: RepairerFeedbackFile; result: T },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { feedback, sha } = await readLiveFeedback();
    const { next, result } = mutate(feedback);
    try {
      await commitFile(feedbackPath(), next, sha, commitMessage(result));
      return result;
    } catch (err) {
      const conflict = err instanceof Error && err.message.includes("GitHub API 409");
      if (!conflict) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export async function appendReview(
  repairerId: string,
  companyName: string,
  input: ValidReview,
  authorEmail: string,
): Promise<RepairerReview> {
  const review: RepairerReview = {
    id: randomUUID(),
    repairerId,
    rating: input.rating,
    note: input.note,
    authorEmail,
    authorName: displayNameFromEmail(authorEmail),
    // ISO-8601 with an explicit Z, matching every other timestamp written
    // by this app (see tyrePrice/databricksClient.ts on why zone-less
    // timestamps are a trap).
    submittedAt: new Date().toISOString(),
    updatedAt: null,
  };

  return withFeedbackFile(
    () => `Add review for ${companyName}`,
    (feedback) => {
      if (isDuplicateReview(feedback.reviews, { repairerId, authorEmail, ...input })) {
        throw new DuplicateSubmissionError(
          "You just submitted the same review for this repairer. If that was a double-click, it has been saved once.",
        );
      }
      return {
        next: { ...feedback, reviews: [...feedback.reviews, review] },
        result: review,
      };
    },
  );
}

export async function appendDiscountReport(
  repairerId: string,
  companyName: string,
  input: ValidDiscountReport,
  authorEmail: string,
): Promise<DiscountReport> {
  const report: DiscountReport = {
    id: randomUUID(),
    repairerId,
    openToNegotiation: input.openToNegotiation,
    discountPercent: input.discountPercent,
    note: input.note,
    authorEmail,
    authorName: displayNameFromEmail(authorEmail),
    submittedAt: new Date().toISOString(),
    updatedAt: null,
  };

  return withFeedbackFile(
    () => `Report discount for ${companyName}`,
    (feedback) => {
      if (
        isDuplicateDiscountReport(feedback.discountReports, { repairerId, authorEmail, ...input })
      ) {
        throw new DuplicateSubmissionError(
          "You just submitted the same discount report for this repairer. If that was a double-click, it has been saved once.",
        );
      }
      return {
        next: { ...feedback, discountReports: [...feedback.discountReports, report] },
        result: report,
      };
    },
  );
}

/**
 * Ownership check shared by every edit and delete. `canModerate` is only
 * ever true for the repairer network owner (isAuthorizedRepairerManager),
 * and only ever grants deletion -- nobody edits words attributed to
 * someone else.
 */
function assertMayModify(
  row: { authorEmail: string },
  actorEmail: string,
  canModerate: boolean,
): void {
  if (row.authorEmail === actorEmail) return;
  if (canModerate) return;
  throw new ForbiddenError("You can only change your own submissions");
}

export async function updateOwnReview(
  reviewId: string,
  input: ValidReview,
  actorEmail: string,
): Promise<RepairerReview> {
  return withFeedbackFile(
    (updated) => `Update review for repairer ${updated.repairerId}`,
    (feedback) => {
      const index = feedback.reviews.findIndex((r) => r.id === reviewId);
      if (index === -1) throw new NotFoundError(`No review with id "${reviewId}"`);
      assertMayModify(feedback.reviews[index], actorEmail, false);

      const updated: RepairerReview = {
        ...feedback.reviews[index],
        rating: input.rating,
        note: input.note,
        updatedAt: new Date().toISOString(),
      };
      const reviews = [...feedback.reviews];
      reviews[index] = updated;
      return { next: { ...feedback, reviews }, result: updated };
    },
  );
}

export async function updateOwnDiscountReport(
  reportId: string,
  input: ValidDiscountReport,
  actorEmail: string,
): Promise<DiscountReport> {
  return withFeedbackFile(
    (updated) => `Update discount report for repairer ${updated.repairerId}`,
    (feedback) => {
      const index = feedback.discountReports.findIndex((d) => d.id === reportId);
      if (index === -1) throw new NotFoundError(`No discount report with id "${reportId}"`);
      assertMayModify(feedback.discountReports[index], actorEmail, false);

      const updated: DiscountReport = {
        ...feedback.discountReports[index],
        openToNegotiation: input.openToNegotiation,
        discountPercent: input.discountPercent,
        note: input.note,
        updatedAt: new Date().toISOString(),
      };
      const discountReports = [...feedback.discountReports];
      discountReports[index] = updated;
      return { next: { ...feedback, discountReports }, result: updated };
    },
  );
}

export async function deleteReview(
  reviewId: string,
  actorEmail: string,
  canModerate: boolean,
): Promise<{ repairerId: string }> {
  return withFeedbackFile(
    (removed) => `Delete review for repairer ${removed.repairerId}`,
    (feedback) => {
      const row = feedback.reviews.find((r) => r.id === reviewId);
      if (!row) throw new NotFoundError(`No review with id "${reviewId}"`);
      assertMayModify(row, actorEmail, canModerate);
      return {
        next: { ...feedback, reviews: feedback.reviews.filter((r) => r.id !== reviewId) },
        result: { repairerId: row.repairerId },
      };
    },
  );
}

export async function deleteDiscountReport(
  reportId: string,
  actorEmail: string,
  canModerate: boolean,
): Promise<{ repairerId: string }> {
  return withFeedbackFile(
    (removed) => `Delete discount report for repairer ${removed.repairerId}`,
    (feedback) => {
      const row = feedback.discountReports.find((d) => d.id === reportId);
      if (!row) throw new NotFoundError(`No discount report with id "${reportId}"`);
      assertMayModify(row, actorEmail, canModerate);
      return {
        next: {
          ...feedback,
          discountReports: feedback.discountReports.filter((d) => d.id !== reportId),
        },
        result: { repairerId: row.repairerId },
      };
    },
  );
}
