import { useState } from "react";
import type { TyrePriceRequest, TyreSeason } from "../../lib/tyrePriceTypes";

interface Props {
  onSubmit: (request: TyrePriceRequest) => void;
  loading: boolean;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const labelClass = "mb-1 block text-xs font-medium text-slate-500";

export default function TyreSpecForm({ onSubmit, loading }: Props) {
  const [vehicleReg, setVehicleReg] = useState("");
  const [width, setWidth] = useState("");
  const [profile, setProfile] = useState("");
  const [rim, setRim] = useState("");
  const [loadIndex, setLoadIndex] = useState("");
  const [speedRating, setSpeedRating] = useState("");
  const [season, setSeason] = useState<TyreSeason>("summer");
  const [runFlat, setRunFlat] = useState(false);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [claimedPrice, setClaimedPrice] = useState("");
  const [postcode, setPostcode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const widthNum = Number(width);
    const profileNum = Number(profile);
    const rimNum = Number(rim);
    if (!widthNum || !profileNum || !rimNum) return;

    onSubmit({
      vehicleReg: vehicleReg.trim() || undefined,
      spec: {
        width: widthNum,
        profile: profileNum,
        rim: rimNum,
        loadIndex: loadIndex.trim() || undefined,
        speedRating: speedRating.trim() || undefined,
        season,
        runFlat,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
      },
      claimedPriceGbp: claimedPrice.trim() ? Number(claimedPrice) : undefined,
      postcode: postcode.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <label className={labelClass}>Vehicle registration (optional)</label>
          <input
            value={vehicleReg}
            onChange={(e) => setVehicleReg(e.target.value)}
            placeholder="e.g. AB12 CDE"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Width</label>
          <input
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            placeholder="205"
            inputMode="numeric"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Profile</label>
          <input
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="55"
            inputMode="numeric"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Rim</label>
          <input
            value={rim}
            onChange={(e) => setRim(e.target.value)}
            placeholder="16"
            inputMode="numeric"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Load index</label>
          <input value={loadIndex} onChange={(e) => setLoadIndex(e.target.value)} placeholder="91" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Speed rating</label>
          <input value={speedRating} onChange={(e) => setSpeedRating(e.target.value)} placeholder="V" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Season</label>
          <select value={season} onChange={(e) => setSeason(e.target.value as TyreSeason)} className={inputClass}>
            <option value="summer">Summer</option>
            <option value="winter">Winter</option>
            <option value="all-season">All-season</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Brand (optional)</label>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Continental" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Model (optional)</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={runFlat}
              onChange={(e) => setRunFlat(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Run-flat
          </label>
        </div>

        <div>
          <label className={labelClass}>Claimed price (optional)</label>
          <input
            value={claimedPrice}
            onChange={(e) => setClaimedPrice(e.target.value)}
            placeholder="£"
            inputMode="decimal"
            className={inputClass}
          />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <label className={labelClass}>Postcode (optional, for nearby fitters)</label>
          <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className={inputClass} />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "Checking…" : "Check price"}
      </button>
    </form>
  );
}
