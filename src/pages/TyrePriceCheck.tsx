import { useState } from "react";
import FitterList from "../components/tyrePrice/FitterList";
import PriceComparisonTable from "../components/tyrePrice/PriceComparisonTable";
import TyreSpecForm from "../components/tyrePrice/TyreSpecForm";
import VarianceBanner from "../components/tyrePrice/VarianceBanner";
import { checkTyrePrice } from "../lib/api";
import type { TyrePriceRequest, TyrePriceResponse } from "../lib/tyrePriceTypes";

export default function TyrePriceCheck() {
  const [response, setResponse] = useState<TyrePriceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(request: TyrePriceRequest) {
    setLoading(true);
    setError(null);
    try {
      setResponse(await checkTyrePrice(request));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tyre price check failed");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-slate-800">Tyre Price Check</h1>
      <p className="text-sm text-slate-500">
        Sanity-check a tyre claim's cost against the market. A source that couldn't be checked always shows
        "source unavailable" -- prices are never estimated or fabricated.
      </p>

      <TyreSpecForm onSubmit={handleSubmit} loading={loading} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {response && (
        <>
          <p className="text-sm text-slate-500">
            Results for <span className="font-medium text-slate-700">{response.normalizedSize}</span>
          </p>
          <VarianceBanner
            summary={response.summary}
            variance={response.variance}
            claimTierFlag={response.claimTierFlag}
          />
          <PriceComparisonTable quotes={response.quotes} />
          <FitterList fitters={response.fitters} />
        </>
      )}
    </div>
  );
}
