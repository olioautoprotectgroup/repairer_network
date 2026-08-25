/**
 * Converts the raw "Repairer_Form.xlsx" export into the app's canonical,
 * PII-stripped dataset at api/data/repairers.json.
 *
 * Usage:
 *   npm run build-data -- /path/to/Repairer_Form.xlsx
 *
 * The source spreadsheet is NEVER read from a committed path and is never
 * written into this repo -- it contains bank account details, sort codes,
 * VAT numbers and invoice contacts that must not enter git history. Point
 * this script at a local copy of the file instead.
 *
 * Geocoding uses the free postcodes.io bulk lookup API. If it can't be
 * reached (e.g. restricted network), records are still written with
 * geocoded: false so the rest of the pipeline (postcode
 * extraction/repair, PII stripping) can be verified offline -- re-run this
 * script from a machine with normal internet access to populate
 * coordinates.
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface RawRow {
  [key: string]: unknown;
}

interface OutputRepairer {
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

const UK_POSTCODE_RE = /([Gg][Ii][Rr]\s?0[Aa]{2}|[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2})/;

function cleanPostcode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "#N/A") return null;
  const match = trimmed.match(UK_POSTCODE_RE);
  if (!match) return null;
  return normalizePostcode(match[1]);
}

function normalizePostcode(pc: string): string {
  const compact = pc.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 5) return compact;
  const outward = compact.slice(0, compact.length - 3);
  const inward = compact.slice(compact.length - 3);
  return `${outward} ${inward}`;
}

function splitList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toBool(raw: unknown): boolean | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function toNullableString(raw: unknown): string | null {
  if (typeof raw === "number") return String(raw);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/**
 * Phone Number is stored as a number in the source spreadsheet, so xlsx
 * parses it with the leading 0 already dropped (e.g. 01234567890 ->
 * 1234567890) -- every UK number in the sheet loses it this way. Restore it
 * when the raw value came through as a number and looks like a 10-digit UK
 * national number missing exactly that digit. A value already stored as
 * text (raw is a string) is left as-is, since it never lost the digit.
 */
function toPhoneNumber(raw: unknown): string | null {
  if (typeof raw === "number") {
    const digits = String(raw);
    if (/^\d{10}$/.test(digits)) return `0${digits}`;
    return digits;
  }
  return toNullableString(raw);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeUniqueId(base: string, seen: Map<string, number>): string {
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

async function geocodeBatch(postcodes: string[]): Promise<Map<string, { lat: number; lon: number }>> {
  const result = new Map<string, { lat: number; lon: number }>();
  const unique = Array.from(new Set(postcodes));
  if (unique.length === 0) return result;

  // postcodes.io accepts up to 100 postcodes per bulk lookup request.
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const res = await fetch("https://api.postcodes.io/postcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes: chunk }),
      });
      if (!res.ok) {
        console.warn(`postcodes.io returned ${res.status}; skipping geocoding for this batch`);
        continue;
      }
      const json = (await res.json()) as {
        result: Array<{ query: string; result: { latitude: number; longitude: number } | null }>;
      };
      for (const entry of json.result) {
        if (entry.result) {
          result.set(entry.query, { lat: entry.result.latitude, lon: entry.result.longitude });
        }
      }
    } catch (err) {
      console.warn(
        "Could not reach postcodes.io for geocoding (network restricted?). " +
          "Records will be written with geocoded: false -- re-run this script " +
          "from a machine with normal internet access to populate coordinates.",
        err instanceof Error ? err.message : err,
      );
      return result;
    }
  }
  return result;
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("Usage: npm run build-data -- /path/to/Repairer_Form.xlsx");
    process.exit(1);
  }
  const resolvedPath = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(resolvedPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: null });

  const seenIds = new Map<string, number>();
  const unresolved: string[] = [];
  const postcodesToGeocode: string[] = [];

  const pending: Array<Omit<OutputRepairer, "lat" | "lon" | "geocoded">> = [];

  for (const row of rows) {
    const companyName = toNullableString(row["Company Name"]);
    if (!companyName) continue; // skip blank/incomplete rows

    let postcode = cleanPostcode(row["Column1"]);
    if (!postcode) {
      postcode = cleanPostcode(row["Trading Address"]);
    }
    if (!postcode) {
      unresolved.push(companyName);
    } else {
      postcodesToGeocode.push(postcode);
    }

    const id = makeUniqueId(slugify(companyName), seenIds);

    pending.push({
      id,
      companyName,
      tradingAddress: toNullableString(row["Trading Address"]) ?? "",
      postcode,
      phoneNumber: toPhoneNumber(row["Phone Number"]),
      emailAddress: toNullableString(row["Email Address"]),
      mainContactName: toNullableString(row["Main Contact Name "]),
      openToRepeatWork: toBool(row["Open to repeat work?"]),
      coverageRadiusMiles: toNumber(row["Area coverage (in approximate mileage radius)"]),
      vehicleManufacturers: splitList(row["Which vehicle manufacurers do you work on?"]),
      brandSpecifics: toNullableString(row["Please Specify Which Brand"]),
      capabilities: splitList(
        row["Do you have facilities for the following repairs/diagnostic processes? "],
      ),
      diagnosticsEquipment: splitList(row["If Applicable, which Diagnostics Equipment Do You Use?"]),
      drivetrainTypes: splitList(row["Which type of vehicle Drivetrain's do you repair?"]),
      labourRate: toNumber(row["What is your labour rate?"]),
      providesRecovery: toBool(row["Do you provide Recovery?"]),
      recoveryChargeRate: toNumber(row["What is your charge rate?"]),
      workshopRampVolume: toNullableString(row["What is your workshop ramp volume?"]),
      hasDealerRelationship: toBool(row["Do you have an existing relationship with a Dealership?"]),
      dealerNames: toNullableString(row["Please specify which dealer(s)"]),
      apgComments: toNullableString(row["APG Comments"]),
    });
  }

  console.log(`Parsed ${pending.length} repairer records.`);
  console.log(
    `${postcodesToGeocode.length} have a usable postcode; ${unresolved.length} need manual postcode entry:`,
  );
  for (const name of unresolved) console.log(`  - ${name}`);

  const geocoded = await geocodeBatch(postcodesToGeocode);
  console.log(`Geocoded ${geocoded.size} / ${postcodesToGeocode.length} postcodes.`);

  const output: OutputRepairer[] = pending.map((r) => {
    const coords = r.postcode ? geocoded.get(r.postcode) : undefined;
    return {
      ...r,
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      geocoded: Boolean(coords),
    };
  });

  const outPath = path.resolve(__dirname, "../api/data/repairers.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${output.length} records to ${outPath}`);

  const stillUngeocoded = output.filter((r) => !r.geocoded).length;
  if (stillUngeocoded > 0) {
    console.log(
      `\n${stillUngeocoded} record(s) are not geocoded yet (missing/unrecognised postcode, or ` +
        `geocoding API unreachable from this environment). They will not appear in distance search ` +
        `results until fixed via the Manage Repairers screen or by re-running this script.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
