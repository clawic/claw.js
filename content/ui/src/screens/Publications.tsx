import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { useUrlFilters } from "../hooks/useUrlFilters";
import { getPublications, retryPublication, getPublicationDetail } from "../api/client";
import type { PublicationRun, RunStatus } from "../api/types";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Link } from "react-router-dom";

const RUN_BADGE: Record<RunStatus, { v: "success" | "danger" | "warning" | "muted"; l: string }> = {
  running: { v: "warning", l: "Running" },
  succeeded: { v: "success", l: "Succeeded" },
  failed: { v: "danger", l: "Failed" },
  cancelled: { v: "muted", l: "Cancelled" },
};

export function PublicationsScreen() {
  const { filters, setFilter } = useUrlFilters(["status"]);
  const { status, data, error, reload } = useApi<{ items: PublicationRun[] }>(getPublications);
  useRealtimeRevalidation(["publication.completed", "publication.failed"], reload);

  const [selected, setSelected] = useState<PublicationRun | null>(null);
  const [detail, setDetail] = useState<{ run: PublicationRun; canRetry: boolean; plan: unknown } | null>(null);
  const [retryTarget, setRetryTarget] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const items = data?.items ?? [];
  const filtered = filters.status
    ? items.filter((i) => i.status === filters.status)
    : items;

  async function handleSelect(run: PublicationRun) {
    setSelected(run);
    try {
      const d = await getPublicationDetail(run.id);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  }

  async function handleRetry() {
    if (!retryTarget) return;
    setProcessing(true);
    try {
      await retryPublication(retryTarget);
      setRetryTarget(null);
      reload();
    } finally {
      setProcessing(false);
    }
  }

  if (status === "loading") return <div data-testid="content-publications"><LoadingSkeleton rows={6} /></div>;
  if (status === "error") return <div data-testid="content-publications"><ErrorBlock message={error!} onRetry={reload} /></div>;

  return (
    <div data-testid="content-publications">
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Publications</h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>{filtered.length} run{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input" style={{ width: "auto" }} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {(["running", "succeeded", "failed", "cancelled"] as RunStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="▸" title="No publications" description="Publication runs will appear here." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", gap: "var(--sp-4)" }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Entry</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Attempt</th>
                  <th>External ID</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const rb = RUN_BADGE[r.status];
                  return (
                    <tr
                      key={r.id}
                      data-testid="publication-row"
                      className={selected?.id === r.id ? "selected" : ""}
                      onClick={() => handleSelect(r)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{r.id}</td>
                      <td>
                        <Link to={`/entries/${r.entryId}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
                          {r.entry?.title ?? r.entryId}
                        </Link>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)" }}>{r.destination?.name ?? r.destinationId}</td>
                      <td><Badge variant={rb.v}>{rb.l}</Badge></td>
                      <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>#{r.attemptNumber}</td>
                      <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{r.externalId ?? "—"}</td>
                      <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{new Date(r.startedAt).toLocaleString()}</td>
                      <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.canRetry && (
                          <button data-testid="publication-retry-cta" className="btn btn--sm btn--secondary" onClick={() => setRetryTarget(r.id)}>
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="card" style={{ position: "sticky", top: "calc(var(--topbar-height) + var(--sp-4))" }}>
              <h3 style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginBottom: "var(--sp-3)" }}>Run Detail</h3>
              <div style={{ fontSize: "var(--fs-sm)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                <div><strong>Status:</strong> {(() => { const rb = RUN_BADGE[selected.status]; return <Badge variant={rb.v}>{rb.l}</Badge>; })()}</div>
                <div><strong>Attempt:</strong> <span className="mono">#{selected.attemptNumber}</span></div>
                <div><strong>External ID:</strong> <span className="mono">{selected.externalId ?? "None"}</span></div>
                <div><strong>Provider message:</strong> {selected.providerMessage ?? "None"}</div>

                {/* Error envelope */}
                {selected.error && (
                  <div style={{ marginTop: "var(--sp-2)" }}>
                    <h4 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--c-danger)", marginBottom: "var(--sp-1)" }}>Error</h4>
                    <pre style={{
                      background: "var(--c-danger-subtle)",
                      border: "1px solid var(--c-danger)",
                      borderRadius: "var(--r-md)",
                      padding: "var(--sp-3)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-xs)",
                      whiteSpace: "pre-wrap",
                      overflowX: "auto",
                    }}>
                      {selected.error}
                    </pre>
                  </div>
                )}

                {/* Provider timeline */}
                <div style={{ marginTop: "var(--sp-2)" }}>
                  <h4 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-1)" }}>Timeline</h4>
                  <div style={{ fontSize: "var(--fs-xs)", display: "flex", flexDirection: "column", gap: "var(--sp-1)" }}>
                    <div className="flex justify-between">
                      <span>Started</span>
                      <span className="mono">{new Date(selected.startedAt).toLocaleString()}</span>
                    </div>
                    {selected.completedAt && (
                      <div className="flex justify-between">
                        <span>Completed</span>
                        <span className="mono">{new Date(selected.completedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Destination snapshot */}
                {detail?.plan != null && (
                  <div style={{ marginTop: "var(--sp-2)" }}>
                    <h4 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-1)" }}>Destination Snapshot</h4>
                    <pre style={{
                      background: "var(--c-surface-raised)",
                      borderRadius: "var(--r-md)",
                      padding: "var(--sp-3)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-xs)",
                      whiteSpace: "pre-wrap",
                      overflowX: "auto",
                      maxHeight: 200,
                      overflow: "auto",
                    }}>
                      {JSON.stringify(detail.plan, null, 2)}
                    </pre>
                  </div>
                )}

                {selected.canRetry && (
                  <button className="btn btn--primary" style={{ marginTop: "var(--sp-3)" }} onClick={() => setRetryTarget(selected.id)}>
                    Retry Run
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {retryTarget && (
        <ConfirmDialog
          title="Retry Publication"
          description="This will create a new publication attempt."
          confirmLabel="Retry"
          onConfirm={handleRetry}
          onCancel={() => setRetryTarget(null)}
        />
      )}
    </div>
  );
}
