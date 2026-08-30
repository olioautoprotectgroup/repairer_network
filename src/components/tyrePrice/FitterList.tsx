import type { TyrePriceResponse } from "../../lib/tyrePriceTypes";

export default function FitterList({ fitters }: { fitters: TyrePriceResponse["fitters"] }) {
  if (fitters.status === "not-requested") return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 font-semibold text-slate-800">Nearby fitters</h3>
      {fitters.status === "unavailable" && (
        <p className="text-sm italic text-slate-400">Fitter lookup unavailable right now.</p>
      )}
      {fitters.status === "ok" && fitters.results.length === 0 && (
        <p className="text-sm text-slate-500">No tyre fitters found nearby.</p>
      )}
      {fitters.status === "ok" && fitters.results.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {fitters.results.map((f) => (
            <li key={`${f.name}-${f.lat}-${f.lon}`} className="flex items-center justify-between py-2 text-sm">
              <div>
                <div className="font-medium text-slate-800">{f.name}</div>
                <div className="text-slate-500">{f.address ?? f.amenityType}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500">{f.distanceMiles.toFixed(1)} mi</span>
                <a
                  href={f.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  Open in Google Maps ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
