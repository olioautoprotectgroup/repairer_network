export interface RegToSizeResult {
  size: string | null;
  loadIndex: string | null;
  speedRating: string | null;
  source: "not-implemented";
}

/**
 * DVLA VES (the only vehicle-lookup source this org currently has) returns
 * make/model but not tyre size -- there is no real reg->size provider wired
 * up yet. This stub keeps the interface stable so a real provider can be
 * slotted in later with zero refactor at any call site: always resolves to
 * "not-implemented", never guesses.
 */
export async function lookupSizeFromReg(_vehicleReg: string): Promise<RegToSizeResult> {
  return { size: null, loadIndex: null, speedRating: null, source: "not-implemented" };
}
