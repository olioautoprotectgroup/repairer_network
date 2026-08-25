import type { SearchResult } from "../lib/types";

interface Props {
  repairer: SearchResult;
  selected: boolean;
  onSelect: (id: string) => void;
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
      {children}
    </span>
  );
}

export default function RepairerCard({ repairer, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(repairer.id)}
      className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
        selected
          ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/40"
          : "border-slate-200 bg-white hover:border-brand-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{repairer.companyName}</h3>
          <p className="text-sm text-slate-500">{repairer.tradingAddress}</p>
        </div>
        <div className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
          {repairer.distanceMiles.toFixed(1)} mi
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {repairer.vehicleManufacturers.slice(0, 4).map((m) => (
          <Badge key={m}>{m}</Badge>
        ))}
        {repairer.providesRecovery && <Badge>Recovery available</Badge>}
        {repairer.hasDealerRelationship && <Badge>Dealer relationship</Badge>}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-600">
        {repairer.labourRate != null && (
          <div>
            Labour rate: <span className="font-medium text-slate-800">£{repairer.labourRate}/hr</span>
          </div>
        )}
        {repairer.coverageRadiusMiles != null && (
          <div>
            Coverage: <span className="font-medium text-slate-800">{repairer.coverageRadiusMiles} mi</span>
          </div>
        )}
        {repairer.phoneNumber && (
          <div>
            Phone: <span className="font-medium text-slate-800">{repairer.phoneNumber}</span>
          </div>
        )}
        {repairer.mainContactName && (
          <div>
            Contact: <span className="font-medium text-slate-800">{repairer.mainContactName}</span>
          </div>
        )}
      </div>
    </button>
  );
}
