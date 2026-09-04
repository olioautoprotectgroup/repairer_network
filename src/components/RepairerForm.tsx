import { useState, type FormEvent } from "react";
import type { Repairer } from "../lib/types";

export type RepairerFormValues = Omit<
  Repairer,
  "id" | "lat" | "lon" | "geocoded" | "recentRepairCount" | "repairCountAsOf"
  | "archivedAt" | "archivedBy"
>;

const BLANK: RepairerFormValues = {
  companyName: "",
  tradingAddress: "",
  postcode: "",
  phoneNumber: "",
  emailAddress: "",
  mainContactName: "",
  openToRepeatWork: null,
  coverageRadiusMiles: null,
  vehicleManufacturers: [],
  brandSpecifics: "",
  capabilities: [],
  diagnosticsEquipment: [],
  drivetrainTypes: [],
  labourRate: null,
  providesRecovery: null,
  recoveryChargeRate: null,
  workshopRampVolume: "",
  hasDealerRelationship: null,
  dealerNames: "",
  apgComments: "",
};

interface Props {
  initial?: Repairer;
  onSubmit: (values: RepairerFormValues) => Promise<void>;
  onCancel: () => void;
}

/** Comma-separated free-text fields backed by a string[] on the record. */
type ListKey = "vehicleManufacturers" | "capabilities";

function listToText(list: string[]): string {
  return list.join(", ");
}

function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function RepairerForm({ initial, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<RepairerFormValues>(initial ?? BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The comma-separated inputs keep their own raw text rather than being
  // rendered back from the parsed array. Deriving the displayed value from
  // textToList(...) made them unusable: a trailing space or comma is
  // trimmed/dropped on parse, so the round-trip erased the character the
  // moment it was typed -- you could never type a space in "Land Rover", nor
  // the comma that separates two entries at all. `values` still holds the
  // parsed array, so submit is unaffected.
  const [listText, setListText] = useState<Record<ListKey, string>>(() => ({
    vehicleManufacturers: listToText((initial ?? BLANK).vehicleManufacturers),
    capabilities: listToText((initial ?? BLANK).capabilities),
  }));

  function set<K extends keyof RepairerFormValues>(key: K, value: RepairerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setList(key: ListKey, text: string) {
    setListText((t) => ({ ...t, [key]: text }));
    setValues((v) => ({ ...v, [key]: textToList(text) }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        Company name *
        <input
          required
          value={values.companyName}
          onChange={(e) => set("companyName", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Postcode *
        <input
          required
          value={values.postcode ?? ""}
          onChange={(e) => set("postcode", e.target.value)}
          placeholder="e.g. SW1A 1AA"
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-sm">
        Trading address
        <input
          value={values.tradingAddress}
          onChange={(e) => set("tradingAddress", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Phone number
        <input
          value={values.phoneNumber ?? ""}
          onChange={(e) => set("phoneNumber", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email address
        <input
          value={values.emailAddress ?? ""}
          onChange={(e) => set("emailAddress", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Main contact name
        <input
          value={values.mainContactName ?? ""}
          onChange={(e) => set("mainContactName", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Coverage radius (miles)
        <input
          type="number"
          value={values.coverageRadiusMiles ?? ""}
          onChange={(e) => set("coverageRadiusMiles", e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-sm">
        Vehicle manufacturers (comma-separated)
        <input
          value={listText.vehicleManufacturers}
          onChange={(e) => setList("vehicleManufacturers", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="col-span-full flex flex-col gap-1 text-sm">
        Capabilities (comma-separated)
        <input
          value={listText.capabilities}
          onChange={(e) => setList("capabilities", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Labour rate (£/hr)
        <input
          type="number"
          value={values.labourRate ?? ""}
          onChange={(e) => set("labourRate", e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
      </label>
      <label className="flex items-center gap-2 self-end text-sm">
        <input
          type="checkbox"
          checked={Boolean(values.providesRecovery)}
          onChange={(e) => set("providesRecovery", e.target.checked)}
          className="rounded border-slate-300 text-brand-600"
        />
        Provides recovery
      </label>
      <label className="col-span-full flex flex-col gap-1 text-sm">
        APG comments
        <textarea
          value={values.apgComments ?? ""}
          onChange={(e) => set("apgComments", e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2"
          rows={2}
        />
      </label>

      {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

      <div className="col-span-full flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save repairer"}
        </button>
      </div>
    </form>
  );
}
