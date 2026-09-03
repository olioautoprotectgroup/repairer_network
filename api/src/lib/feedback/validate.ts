/**
 * Validation for staff feedback submissions. Server-side is the real gate
 * -- the forms use HTML-native constraints only (the same split as the
 * Manage Repairers form, where `required` in the markup is backed by an
 * explicit 400 in api/src/functions/repairers.ts).
 *
 * Every function returns an error *message* rather than throwing, so the
 * handler can put it straight into the `{ error }` body that
 * src/lib/api.ts's handle<T>() already knows how to surface.
 */
import type { DiscountReport, RepairerReview } from "../types";

export const MAX_NOTE_LENGTH = 1000;

/** How long an identical resubmission is treated as a double-submit. */
export const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export interface ReviewInput {
  rating: unknown;
  note?: unknown;
}

export interface DiscountReportInput {
  openToNegotiation: unknown;
  discountPercent?: unknown;
  note?: unknown;
}

export interface ValidReview {
  rating: number;
  note: string | null;
}

export interface ValidDiscountReport {
  openToNegotiation: boolean;
  discountPercent: number | null;
  note: string | null;
}

/**
 * Trims a note to its stored form. Whitespace-only becomes null rather
 * than "", so "no note" is one value in the data rather than two.
 */
function normalizeNote(note: unknown): { note: string | null } | { error: string } {
  if (note == null) return { note: null };
  if (typeof note !== "string") return { error: "note must be text" };
  const trimmed = note.trim();
  if (trimmed.length === 0) return { note: null };
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { error: `note must be ${MAX_NOTE_LENGTH} characters or fewer` };
  }
  return { note: trimmed };
}

export function validateReview(input: ReviewInput): ValidReview | { error: string } {
  // Deliberately strict about the type: JSON "4" would pass a `>= 1 && <= 5`
  // check after coercion and then store a string in a numeric field.
  if (typeof input.rating !== "number" || !Number.isInteger(input.rating)) {
    return { error: "rating must be a whole number from 1 to 5" };
  }
  if (input.rating < 1 || input.rating > 5) {
    return { error: "rating must be a whole number from 1 to 5" };
  }

  const note = normalizeNote(input.note);
  if ("error" in note) return note;

  return { rating: input.rating, note: note.note };
}

export function validateDiscountReport(
  input: DiscountReportInput,
): ValidDiscountReport | { error: string } {
  if (typeof input.openToNegotiation !== "boolean") {
    return { error: "openToNegotiation must be true or false" };
  }

  const note = normalizeNote(input.note);
  if ("error" in note) return note;

  if (!input.openToNegotiation) {
    // A percentage against "wouldn't negotiate" is contradictory, and
    // silently dropping it would misrepresent what the handler submitted.
    if (input.discountPercent != null) {
      return {
        error: "discountPercent must be omitted when the repairer was not open to negotiation",
      };
    }
    return { openToNegotiation: false, discountPercent: null, note: note.note };
  }

  if (typeof input.discountPercent !== "number" || Number.isNaN(input.discountPercent)) {
    return { error: "discountPercent is required when the repairer was open to negotiation" };
  }
  if (input.discountPercent <= 0 || input.discountPercent > 100) {
    return { error: "discountPercent must be greater than 0 and no more than 100" };
  }

  return {
    openToNegotiation: true,
    // One decimal place: handlers report round-ish figures, and storing
    // 12.499999 from a float would render badly and average worse.
    discountPercent: Math.round(input.discountPercent * 10) / 10,
    note: note.note,
  };
}

/**
 * Catches the double-click and the browser-retried POST: an identical
 * submission by the same author for the same repairer inside
 * DUPLICATE_WINDOW_MS is a resend, not a second opinion.
 *
 * Append-only storage is deliberate (see types.ts), so genuine repeat
 * feedback later is allowed -- this only collapses the accidental burst.
 */
export function isDuplicateReview(
  existing: RepairerReview[],
  candidate: { repairerId: string; authorEmail: string; rating: number; note: string | null },
  now: number = Date.now(),
): boolean {
  return existing.some(
    (r) =>
      r.repairerId === candidate.repairerId &&
      r.authorEmail === candidate.authorEmail &&
      r.rating === candidate.rating &&
      r.note === candidate.note &&
      now - Date.parse(r.submittedAt) < DUPLICATE_WINDOW_MS,
  );
}

export function isDuplicateDiscountReport(
  existing: DiscountReport[],
  candidate: {
    repairerId: string;
    authorEmail: string;
    openToNegotiation: boolean;
    discountPercent: number | null;
    note: string | null;
  },
  now: number = Date.now(),
): boolean {
  return existing.some(
    (d) =>
      d.repairerId === candidate.repairerId &&
      d.authorEmail === candidate.authorEmail &&
      d.openToNegotiation === candidate.openToNegotiation &&
      d.discountPercent === candidate.discountPercent &&
      d.note === candidate.note &&
      now - Date.parse(d.submittedAt) < DUPLICATE_WINDOW_MS,
  );
}

/**
 * Turns the signed-in principal's UPN into something readable next to a
 * review. "jane.smith@autoprotectgroup.co.uk" -> "Jane Smith". Falls back
 * to the address as given if it doesn't fit that shape, rather than
 * rendering an empty author.
 */
export function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0];
  if (!localPart) return email;
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(" ") : email;
}
