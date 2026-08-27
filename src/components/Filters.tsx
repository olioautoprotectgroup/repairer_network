import type { SearchFilters } from "../lib/types";

const COMMON_MAKES = [
  "All makes and models",
  "BMW",
  "Mercedes",
  "VAG",
  "Ford",
  "Vauxhall",
  "Toyota",
  "Land Rover",
];

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
}

export default function Filters({ filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={filters.vehicleManufacturer ?? ""}
        onChange={(e) =>
          onChange({ ...filters, vehicleManufacturer: e.target.value || undefined })
        }
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
      >
        <option value="">Any manufacturer</option>
        {COMMON_MAKES.map((m) => (
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
