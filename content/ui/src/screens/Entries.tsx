import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { useUrlFilters } from "../hooks/useUrlFilters";
import { getEntries } from "../api/client";
import type { Entry, EntryStatus } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { FormRenderer } from "../components/FormRenderer";
import { createEntry } from "../api/client";
import { Link, useNavigate } from "react-router-dom";

export function EntriesScreen() {
  const { filters, setFilter } = useUrlFilters(["status", "brand", "campaign"]);
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params: Record<string, string> = {};
  if (filters.status) params.status = filters.status;
  if (filters.brand) params.brandId = filters.brand;
  if (filters.campaign) params.campaignId = filters.campaign;

  const { status, data, error, reload } = useApi<{ entries: Entry[] }>(
    () => getEntries(Object.keys(params).length ? params : undefined),
    [filters.status, filters.brand, filters.campaign],
  );
  useRealtimeRevalidation(["entry.created", "entry.updated", "entry.archived"], reload);

  const entries = data?.entries ?? [];

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (status === "loading") return <div data-testid="content-entry-list"><LoadingSkeleton rows={8} /></div>;
  if (status === "error") return <div data-testid="content-entry-list"><ErrorBlock message={error!} onRetry={reload} /></div>;

  return (
    <div data-testid="content-entry-list">
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Entries</h1>
        <div className="flex gap-2 items-center">
          <select className="input" style={{ width: "auto" }} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {["draft", "in_review", "approved", "scheduled", "published", "failed", "archived"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <input className="input" style={{ width: 140 }} placeholder="Brand..." value={filters.brand} onChange={(e) => setFilter("brand", e.target.value)} />
          <input className="input" style={{ width: 140 }} placeholder="Campaign..." value={filters.campaign} onChange={(e) => setFilter("campaign", e.target.value)} />
          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
          <button data-testid="entry-create-cta" className="btn btn--primary" onClick={() => setShowCreate(true)}>
            Create entry
          </button>
        </div>
      </div>

      <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", marginBottom: "var(--sp-3)" }}>
        {entries.length} entr{entries.length !== 1 ? "ies" : "y"} total
        {selected.size > 0 && <span> · {selected.size} selected</span>}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon="☰" title="No entries found" description="Create your first entry to get started." action={
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>Create entry</button>
        } />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" /></th>
                <th>Title</th>
                <th>Status</th>
                <th>Rev</th>
                <th>Type</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} data-testid="entry-row" className={selected.has(e.id) ? "selected" : ""}>
                  <td><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} /></td>
                  <td>
                    <Link to={`/entries/${e.id}`} style={{ fontWeight: 600 }}>{e.title}</Link>
                    {e.summary && <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>{e.summary}</div>}
                  </td>
                  <td><StatusBadge status={e.status as EntryStatus} /></td>
                  <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>v{e.currentRevisionNumber}</td>
                  <td style={{ fontSize: "var(--fs-xs)" }}>{e.contentType}</td>
                  <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{new Date(e.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create entry dialog */}
      {showCreate && (
        <div className="dialog-overlay" onClick={() => setShowCreate(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <FormRenderer
              formId="entry.create"
              onSubmit={async (vals) => {
                const res = await createEntry(vals);
                setShowCreate(false);
                reload();
                navigate(`/composer/${res.entry.id}`);
              }}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
