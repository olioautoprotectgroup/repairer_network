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
  /** Populated by a scheduled Databricks job, never by the Manage Repairers
   * form -- null means "not yet computed / no confirmed claims match," not
   * "zero repairs." */
  recentRepairCount: number | null;
  repairCountAsOf: string | null;
}

export interface SearchResult extends Repairer {
  distanceMiles: number;
}

export interface SearchFilters {
  vehicleManufacturer?: string;
  capability?: string;
  recoveryOnly?: boolean;
  maxLabourRate?: number;
}

export interface SearchResponse {
  searchPoint: { lat: number; lon: number };
  /** Human-readable description of what the search resolved to -- a
   * matched repairer's name, or the place/postcode as typed. */
  resolvedLabel: string;
  results: SearchResult[];
}

/**
 * Staff-sourced feedback on a repairer. Stored in its own data file
 * (api/data/repairer-feedback.json) rather than on the Repairer record --
 * see api/src/lib/github.ts on why the two are separate blobs. Kept in
 * step with api/src/lib/types.ts by hand, as Repairer already is.
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
