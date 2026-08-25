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
}

export interface SearchResult extends Repairer {
  distanceMiles: number;
}
