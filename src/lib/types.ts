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
}

export interface SearchResponse {
  searchPoint: { lat: number; lon: number };
  results: SearchResult[];
}
