/**
 * Vehicle makes: what the Search page's manufacturer dropdown offers, and
 * what its filter actually matches.
 *
 * Both used to be wrong, in ways that reinforced each other. The dropdown was
 * a hardcoded list in src/components/Filters.tsx with no connection to the
 * data, and the filter was an exact equality test against
 * `vehicleManufacturers`. Over the live records that produced three faults:
 *
 *  1. Four of the eight offered makes (VAG, Ford, Vauxhall, Toyota) appear in
 *     no repairer's vehicleManufacturers at all, so selecting them returned
 *     nothing, every time -- even though repairers plainly doing that work
 *     exist. The filter reported "nobody" when it meant "I don't know".
 *  2. `vehicleManufacturers` is really a CATEGORY field: 89 of the 121 active
 *     repairers hold the single value "All makes and models" and 16 hold
 *     "Brand specific". Under exact matching, filtering by BMW excluded all 89
 *     garages that say they handle everything.
 *  3. Makes typed into Manage Repairers (JLR, Jaguar, Audi, Mini) never
 *     reached the dropdown, which is what prompted this.
 *
 * The brands of the 16 "Brand specific" repairers live in `brandSpecifics`,
 * which is free text a human typed: "VAG, Isuzu", "BMW \nMercedes \nMINI",
 * "jaguar landrover", "LAND ROVER , RANGE ROVER, JAGUAR", and one that opens
 * with a paragraph of prose. So this module is deliberately asymmetric:
 *
 *  - MATCHING is generous. It searches brandSpecifics too, so a Volvo
 *    specialist is reachable by "Volvo". A stray extra result is a far
 *    cheaper error than a repairer nobody can find.
 *  - LISTING is conservative. Only entries that actually look like a make
 *    become dropdown options, or the first thing a handler would see is
 *    "We have Dealer diagnostic tools and experience in the following brands"
 *    offered as a manufacturer.
 *
 * This lives in lib/ so the tests can reach it -- importing anything under
 * api/src/functions/ registers HTTP routes as a module side effect.
 */
import type { Repairer } from "./types";

/**
 * Values of `vehicleManufacturers` that are categories rather than
 * manufacturers. They must never appear as dropdown options: "Brand specific"
 * as a manufacturer choice is meaningless, and "All makes and models" is
 * offered separately by the UI as its own filter.
 */
const GENERIC_MAKES = ["all makes and models", "brand specific"];

/** The category meaning "this garage will work on anything". */
const ALL_MAKES = "all makes and models";

/**
 * Words that mark a fragment of free text as prose rather than a make. Only
 * needed for `brandSpecifics`, and drawn from what is actually in the field
 * today -- entries like "Main dealer alternative", "Ford Passenger car only"
 * and "Open to repairs on other vehicles including class VII commercial
 * vehicles". A make itself is a proper noun, so none of these can occur
 * inside one.
 */
const PROSE_WORDS = new Set([
  "all", "and", "are", "body", "brands", "capabilities", "car", "cars",
  "class", "commercial", "covered", "dealer", "diagnostic", "diagnostics",
  "equipment", "experience", "following", "for", "group", "have", "in", "including",
  "is", "limited", "main", "makes", "models", "no", "on", "only", "open",
  "or", "other", "out", "passenger", "repair", "repairs", "specialist",
  "specialists", "the", "to", "tools", "vehicle", "vehicles", "we", "with",
  "work",
]);

/** Longest a plausible make is allowed to be, in words and characters. */
const MAX_MAKE_WORDS = 3;
const MAX_MAKE_CHARS = 30;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isGeneric(value: string): boolean {
  return GENERIC_MAKES.includes(normalize(value));
}

/** True when the repairer declares it works on anything. */
export function isAllMakes(repairer: Repairer): boolean {
  return (repairer.vehicleManufacturers ?? []).some((m) => normalize(m) === ALL_MAKES);
}

/**
 * Splits free text into candidate makes.
 *
 * Deliberately does NOT split on whitespace: "Land Rover, Range Rover" has to
 * survive as two makes rather than becoming Land / Rover / Range / Rover.
 * The cost is that a run like "jaguar landrover", typed with no separator at
 * all, stays a single entry -- matching still finds "jaguar" inside it by
 * word boundary, which is the case that matters.
 */
function splitFreeText(text: string): string[] {
  return text
    .split(/[,;/\n\r&]+/)
    .map((part) => part.replace(/[-:.]+$/, "").trim())
    .filter(Boolean);
}

/**
 * Whether a fragment of free text is worth OFFERING as a dropdown option.
 * Matching does not use this -- it is only the display filter, so being
 * strict here costs nothing but noise avoided.
 */
function looksLikeMake(candidate: string): boolean {
  if (candidate.length > MAX_MAKE_CHARS) return false;
  const words = normalize(candidate).split(" ");
  if (words.length > MAX_MAKE_WORDS) return false;
  return !words.some((w) => PROSE_WORDS.has(w));
}

/**
 * Every make this repairer names, in the spelling the data uses. The
 * structured `vehicleManufacturers` entries are trusted as-is (a human chose
 * them one per field in Manage Repairers); `brandSpecifics` is free text and
 * gets the plausibility filter.
 *
 * `plausibleOnly: false` returns the unfiltered brandSpecifics fragments too,
 * which is what matching searches.
 */
export function extractMakes(repairer: Repairer, plausibleOnly = true): string[] {
  const structured = (repairer.vehicleManufacturers ?? []).filter((m) => m && !isGeneric(m));

  const free = repairer.brandSpecifics ? splitFreeText(repairer.brandSpecifics) : [];
  const usableFree = (plausibleOnly ? free.filter(looksLikeMake) : free).filter(
    (m) => !isGeneric(m),
  );

  const seen = new Set<string>();
  const out: string[] = [];
  for (const make of [...structured, ...usableFree]) {
    const key = normalize(make);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(make.trim());
  }
  return out;
}

/**
 * Matches `make` as a whole word inside `haystack`.
 *
 * Substring matching would make "Mini" match "administrative"; splitting the
 * haystack into words would stop "Land Rover" matching "Land Rover, Range
 * Rover". A word-boundary search over the whole entry does both, and is what
 * lets "Jaguar" find the repairer whose brandSpecifics reads "jaguar
 * landrover".
 */
function containsWord(haystack: string, make: string): boolean {
  const escaped = make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

/**
 * The search filter's predicate.
 *
 * A garage listing "All makes and models" matches every make -- that is the
 * whole meaning of the value, and treating it otherwise hid 89 of 121
 * repairers from every brand filter.
 */
export function matchesMake(repairer: Repairer, make: string): boolean {
  const wanted = normalize(make);
  if (!wanted) return true;

  if (wanted === ALL_MAKES) return isAllMakes(repairer);
  if (isAllMakes(repairer)) return true;

  return extractMakes(repairer, false).some((candidate) =>
    containsWord(normalize(candidate), wanted),
  );
}

/**
 * The dropdown's options: every plausible make across the given repairers,
 * deduped case-insensitively and sorted.
 *
 * Where the same make is spelled several ways ("PORSCHE" and "Porsche"), the
 * least-shouty spelling wins -- the data is full of all-caps entries, and a
 * dropdown reading "AUDI, BMW, Mercedes, PORSCHE" looks broken even though
 * every value in it is real.
 *
 * Callers pass the ACTIVE repairers; an archived one is out of the network,
 * so its makes should not be offered.
 */
export function listMakes(repairers: Repairer[]): string[] {
  const best = new Map<string, string>();
  for (const repairer of repairers) {
    for (const make of extractMakes(repairer)) {
      const key = normalize(make);
      const current = best.get(key);
      if (!current || lowercaseCount(make) > lowercaseCount(current)) {
        best.set(key, make);
      }
    }
  }
  return [...best.values()].sort((a, b) => a.localeCompare(b, "en-GB"));
}

function lowercaseCount(value: string): number {
  return (value.match(/[a-z]/g) ?? []).length;
}
