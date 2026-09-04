export interface Repairer {
  id: string;
  companyName: string;
  tradingAddress: string;
  postcode: string | null;
  lat: number | null;
  lon: number | null;
  geocoded: boolean;
  phoneNumber: string | null;
  emailAddress: string | null;
  mainContactName: string | null;
  openToRepeatWork: boolean | null;
  coverageRadiusMiles: number | null;
  vehicleManufacturers: string[];
  brandSpecifics: string | null;
  capabilities: string[];
  diagnosticsEquipment: string[];
  drivetrainTypes: string[];
  labourRate: number | null;
  providesRecovery: boolean | null;
  recoveryChargeRate: number | null;
  workshopRampVolume: string | null;
  hasDealerRelationship: boolean | null;
  dealerNames: string | null;
  apgComments: string | null;
  /** Populated by a scheduled Databricks job (see repairer_network Databricks
   * integration plan), never by the Manage Repairers form -- null means "not
   * yet computed / no confirmed claims match," not "zero repairs." */
  recentRepairCount: number | null;
  repairCountAsOf: string | null;
  /** Archive stamp -- set only by the archive endpoint, never by the Manage
   * Repairers form, the same admin-only convention recentRepairCount uses
   * for the sync. An archived repairer is hidden from Search but
   * deliberately KEPT in this file: the nightly Databricks mirror is a copy
   * of it and the intake-merge job anti-joins new sign-ups against that
   * mirror by company name, so a hard-deleted repairer would be re-added as
   * brand new on the next intake run -- and its freed slug could be handed
   * to a different business, inheriting its reviews. Null or absent means
   * active; always test with `!= null`, since the key is absent on records
   * that predate this field. */
  archivedAt: string | null;
  archivedBy: string | null;
}

export interface SearchResult extends Repairer {
  distanceMiles: number;
}

/**
 * Staff-sourced feedback on a repairer. Stored in its own data file
 * (api/data/repairer-feedback.json) rather than on the Repairer record --
 * see api/src/lib/github.ts on why the two are separate blobs.
 *
 * Append-only: a handler may leave several reviews for the same repairer
 * over time, which is the point (a repairer improving or declining is
 * visible). Aggregates are computed on read, never stored, so there is no
 * denormalised average to drift out of step with the rows.
 */
export interface RepairerReview {
  id: string;
  repairerId: string;
  /** Whole number 1-5. */
  rating: number;
  note: string | null;
  /** Always taken from the signed x-ms-client-principal header, never from
   * the request body -- otherwise any handler could forge a colleague's
   * review. */
  authorEmail: string;
  authorName: string;
  submittedAt: string;
  updatedAt: string | null;
}

/**
 * A report of whether a repairer negotiated, and by how much.
 * `discountPercent` is a percentage off the quoted total (not off
 * labourRate), and is only meaningful when openToNegotiation is true.
 */
export interface DiscountReport {
  id: string;
  repairerId: string;
  openToNegotiation: boolean;
  /** 1-100, off the quoted total. Null whenever openToNegotiation is false. */
  discountPercent: number | null;
  note: string | null;
  authorEmail: string;
  authorName: string;
  submittedAt: string;
  updatedAt: string | null;
}

export interface RepairerFeedbackFile {
  reviews: RepairerReview[];
  discountReports: DiscountReport[];
}

/**
 * Derived per-repairer rollup for the card. Every count is a real zero;
 * every average is null when there is nothing to average -- null means "no
 * data yet", never "zero", the same convention recentRepairCount uses.
 */
export interface RepairerFeedbackSummary {
  repairerId: string;
  averageRating: number | null;
  reviewCount: number;
  openToNegotiationCount: number;
  notOpenToNegotiationCount: number;
  averageDiscountPercent: number | null;
  discountReportCount: number;
}

/** Everything the feedback panel needs for one repairer, newest first. */
export interface RepairerFeedbackDetail {
  repairerId: string;
  summary: RepairerFeedbackSummary;
  reviews: RepairerReview[];
  discountReports: DiscountReport[];
}
