import { useState } from "react";
import ResultsList from "../components/ResultsList";
import MapView from "../components/MapView";
import Filters from "../components/Filters";
import { searchRepairers } from "../lib/api";
import type { SearchFilters, SearchResult } from "../lib/types";

export default function Search() {
  const [postcodeInput, setPostcodeInput] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchPoint, setSearchPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(pc: string, f: SearchFilters) {
    if (!pc.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await searchRepairers(pc.trim(), f);
      setResults(response.results);
      setSearchPoint(response.searchPoint);
      setSelectedId(response.results[0]?.id ?? null);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function handleFiltersChange(next: SearchFilters) {
    setFilters(next);
    if (hasSearched) void runSearch(postcodeInput, next);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex min-h-0 w-full flex-col lg:w-[420px] lg:border-r lg:border-slate-200">
        <div className="border-b border-slate-200 bg-white p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(postcodeInput, filters);
            }}
            className="flex gap-2"
          >
            <input
              value={postcodeInput}
              onChange={(e) => setPostcodeInput(e.target.value)}
              placeholder="Enter a postcode, e.g. SW1A 1AA"
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <button
              type="submit"
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Search
            </button>
          </form>
          <div className="mt-3">
            <Filters filters={filters} onChange={handleFiltersChange} />
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {hasSearched && !loading && (
            <p className="mt-2 text-sm text-slate-500">{results.length} repairer(s) found</p>
          )}
        </div>
        <ResultsList
          results={results}
          selectedId={selectedId}
          onSelect={handleSelect}
          loading={loading}
          hasSearched={hasSearched}
        />
      </div>
      <div className="h-[50vh] min-h-0 flex-1 lg:h-auto">
        <MapView
          results={results}
          searchPoint={searchPoint}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
