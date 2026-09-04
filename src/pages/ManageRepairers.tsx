import { useEffect, useState } from "react";
import { archiveRepairer, createRepairer, listRepairers, updateRepairer } from "../lib/api";
import type { Repairer } from "../lib/types";
import RepairerForm, { type RepairerFormValues } from "../components/RepairerForm";

/** Kept in step with isArchived() in api/src/lib/archive.ts. Tests `!= null`
 * rather than a boolean because the key is absent entirely on records that
 * predate the field. */
function isArchived(r: Repairer): boolean {
  return r.archivedAt != null;
}

function formatArchivedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ManageRepairers() {
  const [repairers, setRepairers] = useState<Repairer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Repairer | "new" | null>(null);
  /** Id of the row showing its "Archive? Yes / Cancel" confirmation. */
  const [confirmingArchive, setConfirmingArchive] = useState<string | null>(null);
  /** Id of the row with a request in flight, so its buttons can be disabled. */
  const [archiving, setArchiving] = useState<string | null>(null);

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
    // Apply the saved record directly instead of re-fetching the list: the
    // API's own file copy won't reflect this write until the GitHub commit's
    // redeploy finishes (~1 minute), so an immediate refresh() would show
    // stale data and make the save look like it silently failed.
    if (editing === "new") {
      const created = await createRepairer(values);
      setRepairers((prev) => [...prev, created]);
    } else if (editing) {
      const updated = await updateRepairer(editing.id, values);
      setRepairers((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
    setEditing(null);
  }

  /**
   * Unlike handleSubmit, this catches its own errors: that one deliberately
   * lets them propagate so RepairerForm renders the message beside the form,
   * but a row button has no form to render into, so a failure here would be
   * silent without the page-level error line.
   */
  async function handleArchive(repairer: Repairer, archived: boolean) {
    setArchiving(repairer.id);
    setError(null);
    try {
      const updated = await archiveRepairer(repairer.id, archived);
      // Same reason as handleSubmit: apply the returned record rather than
      // re-fetching, which would read the pre-redeploy copy.
      setRepairers((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setConfirmingArchive(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive repairer");
    } finally {
      setArchiving(null);
    }
  }

  const active = repairers.filter((r) => !isArchived(r));
  const archived = repairers.filter(isArchived);
  // Archived repairers are out of the network, so a bad postcode on one is no
  // longer anything to fix -- archiving a broken record should clear it from
  // this warning.
  const needsAttention = active.filter((r) => !r.geocoded);

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
        <>
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
                {active.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{r.companyName}</td>
                    <td className="px-4 py-2">{r.postcode ?? "—"}</td>
                    <td className="px-4 py-2">
                      {r.labourRate != null ? `£${r.labourRate}/hr` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {r.geocoded ? (
                        <span className="text-emerald-600">Searchable</span>
                      ) : (
                        <span className="text-amber-600">Needs postcode fix</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {confirmingArchive === r.id ? (
                        // Two-step inline confirm rather than a browser
                        // confirm() or a modal: there is no dialog
                        // infrastructure in this app, and archiving changes
                        // what the whole team can find, so it shouldn't fire
                        // on a single stray click.
                        <div className="flex items-center justify-end gap-3">
                          <span className="text-slate-500">Archive?</span>
                          <button
                            type="button"
                            disabled={archiving === r.id}
                            onClick={() => void handleArchive(r, true)}
                            className="font-medium text-red-600 hover:underline disabled:opacity-50"
                          >
                            {archiving === r.id ? "Archiving…" : "Yes, archive"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingArchive(null)}
                            className="font-medium text-slate-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => setEditing(r)}
                            className="font-medium text-brand-600 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingArchive(r.id)}
                            className="font-medium text-slate-500 hover:text-red-600 hover:underline"
                          >
                            Archive
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {archived.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-1 font-semibold text-slate-800">
                Archived ({archived.length})
              </h2>
              <p className="mb-3 text-sm text-slate-500">
                Hidden from search. Their reviews and discount reports are kept, and come back
                with them if they're restored.
              </p>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Company</th>
                      <th className="px-4 py-2">Postcode</th>
                      <th className="px-4 py-2">Archived</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {archived.map((r) => (
                      <tr key={r.id} className="border-t border-slate-200 text-slate-500">
                        <td className="px-4 py-2 font-medium">{r.companyName}</td>
                        <td className="px-4 py-2">{r.postcode ?? "—"}</td>
                        <td className="px-4 py-2">
                          {r.archivedAt ? formatArchivedDate(r.archivedAt) : "—"}
                          {r.archivedBy && (
                            <span className="text-slate-400"> by {r.archivedBy}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            disabled={archiving === r.id}
                            onClick={() => void handleArchive(r, false)}
                            className="font-medium text-brand-600 hover:underline disabled:opacity-50"
                          >
                            {archiving === r.id ? "Restoring…" : "Un-archive"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
