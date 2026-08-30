import type { PriceQuote } from "../../lib/tyrePriceTypes";
import TierBadge from "./TierBadge";

function statusLabel(quote: PriceQuote): string {
  if (quote.status === "ok") return "";
  if (quote.status === "disabled") return "Not yet enabled";
  if (quote.status === "no-match") return "No matching product found";
  return "Source unavailable";
}

export default function PriceComparisonTable({ quotes }: { quotes: PriceQuote[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-2">Retailer</th>
            <th className="px-4 py-2">Product</th>
            <th className="px-4 py-2">Tier</th>
            <th className="px-4 py-2">Price</th>
            <th className="px-4 py-2">Fetched</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.retailer} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-800">{q.retailer}</td>
              <td className="px-4 py-2 text-slate-600">
                {q.status === "ok" ? q.productName : <span className="italic text-slate-400">{statusLabel(q)}</span>}
              </td>
              <td className="px-4 py-2">
                <TierBadge tier={q.tier} />
              </td>
              <td className="px-4 py-2 font-semibold text-slate-800">
                {q.status === "ok" && q.priceGbp != null ? `£${q.priceGbp.toFixed(2)}` : "—"}
              </td>
              <td className="px-4 py-2 text-xs text-slate-400">
                {q.status === "ok" ? new Date(q.fetchedAt).toLocaleString("en-GB") : "—"}
              </td>
              <td className="px-4 py-2 text-right">
                {q.status === "ok" && q.url && (
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    View ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
