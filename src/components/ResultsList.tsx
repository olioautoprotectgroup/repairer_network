import type { SearchResult } from "../lib/types";
import RepairerCard from "./RepairerCard";

interface Props {
  results: SearchResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  hasSearched: boolean;
}

export default function ResultsList({ results, selectedId, onSelect, loading, hasSearched }: Props) {
  if (loading) {
    return <div className="p-6 text-slate-400">Searching&hellip;</div>;
  }

  if (!hasSearched) {
    return (
      <div className="p-6 text-slate-400">
        Enter a postcode above to find the nearest approved repairers.
      </div>
    );
  }

  if (results.length === 0) {
    return <div className="p-6 text-slate-400">No repairers matched that search.</div>;
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-4">
      {results.map((r) => (
        <div key={r.id} id={`result-${r.id}`}>
          <RepairerCard repairer={r} selected={r.id === selectedId} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
