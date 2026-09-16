import type { SearchFilters } from "../lib/types";

/** The value repairers use to mean "we'll work on anything". Offered as its
 * own option because it is a useful filter in its own right, and because it
 * is a category rather than a manufacturer so it never appears in the
 * derived list (see api/src/lib/makes.ts). */
const ALL_MAKES = "All makes and models";

const COMMON_CAPABILITIES = [
  "Level 1 Maintenenance Services",
  "Engine Management System Diagnostics",
  "Transmission and Drive Train Repairs",
  "Auto Electrical",
  "MOT",
  "Tyre",
  "Repairs Requiring Engine Removal",
];

interface Props {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  /** Derived from the live repairer data by GET /api/repairer-makes. Empty
   * while loading, or if that call failed -- the select is disabled then
   * rather than rendered as an empty dropdown that looks broken. */
  makes: string[];
}

export default function Filters({ filters, onChange, makes }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filters.vehicleManufacturer ?? ""}
        disabled={makes.length === 0}
        onChange={(e) =>
          onChange({ ...filters, vehicleManufacturer: e.target.value || undefined })
        }
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60"
      >
        <option value="">Any manufacturer</option>
        <option value={ALL_MAKES}>{ALL_MAKES}</option>
        {makes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        value={filters.capability ?? ""}
        onChange={(e) => onChange({ ...filters, capability: e.target.value || undefined })}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
      >
        <option value="">Any capability</option>
        {COMMON_CAPABILITIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(filters.recoveryOnly)}
          onChange={(e) => onChange({ ...filters, recoveryOnly: e.target.checked })}
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        Recovery only
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
        Max labour rate £
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={filters.maxLabourRate ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            const parsed = value === "" ? undefined : Number(value);
            onChange({ ...filters, maxLabourRate: parsed != null && parsed >= 0 ? parsed : undefined });
          }}
          placeholder="Any"
          className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        /hr
      </label>
    </div>
  );
}
