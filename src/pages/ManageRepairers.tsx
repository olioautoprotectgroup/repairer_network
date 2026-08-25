import { useEffect, useState } from "react";
import { createRepairer, listRepairers, updateRepairer } from "../lib/api";
import type { Repairer } from "../lib/types";
import RepairerForm, { type RepairerFormValues } from "../components/RepairerForm";

export default function ManageRepairers() {
  const [repairers, setRepairers] = useState<Repairer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Repairer | "new" | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setRepairers(await listRepairers());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repairers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleSubmit(values: RepairerFormValues) {
    if (editing === "new") {
      await createRepairer(values);
    } else if (editing) {
      await updateRepairer(editing.id, values);
    }
    setEditing(null);
    await refresh();
  }

  const needsAttention = repairers.filter((r) => !r.geocoded);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Manage Repairers</h1>
        <button
          onClick={() => setEditing("new")}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Add repairer
        </button>
      </div>

      {needsAttention.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {needsAttention.length} repairer(s) have a missing or unrecognised postcode and won't
          appear in search until fixed: {needsAttention.map((r) => r.companyName).join(", ")}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {editing && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-800">
            {editing === "new" ? "Add a new repairer" : `Edit ${editing.companyName}`}
          </h2>
          <RepairerForm
            initial={editing === "new" ? undefined : editing}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Loading&hellip;</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Postcode</th>
                <th className="px-4 py-2">Labour rate</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {repairers.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.companyName}</td>
                  <td className="px-4 py-2">{r.postcode ?? "—"}</td>
                  <td className="px-4 py-2">{r.labourRate != null ? `£${r.labourRate}/hr` : "—"}</td>
                  <td className="px-4 py-2">
                    {r.geocoded ? (
                      <span className="text-emerald-600">Searchable</span>
                    ) : (
                      <span className="text-amber-600">Needs postcode fix</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setEditing(r)}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
