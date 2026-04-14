import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { useUrlFilters } from "../hooks/useUrlFilters";
import { getPipeline } from "../api/client";
import type { PipelineColumn, EntryStatus, RunStatus } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { Link } from "react-router-dom";
import "./Pipeline.css";

const COLUMN_ORDER = ["draft", "review", "approved", "scheduled", "failed", "published"];
const COLUMN_LABELS: Record<string, string> = {
  draft: "Draft", review: "Review", approved: "Approved",
  scheduled: "Scheduled", failed: "Failed", published: "Published",
};
const COLUMN_ACCENT: Record<string, string> = {
  draft: "var(--c-neutral)", review: "var(--c-warning)", approved: "var(--c-info)",
  scheduled: "var(--c-accent)", failed: "var(--c-danger)", published: "var(--c-success)",
};

function runBadge(status: RunStatus | null) {
  if (!status) return null;
  const map: Record<RunStatus, { v: "success" | "danger" | "warning" | "muted"; l: string }> = {
    running: { v: "warning", l: "Running" },
    succeeded: { v: "success", l: "Succeeded" },
    failed: { v: "danger", l: "Failed" },
    cancelled: { v: "muted", l: "Cancelled" },
  };
  const b = map[status];
  return b ? <Badge variant={b.v}>{b.l}</Badge> : null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PipelineScreen() {
  const { filters, setFilter } = useUrlFilters(["brand", "destination", "campaign", "status", "owner"]);
  const { status, data, error, reload } = useApi<{ columns: PipelineColumn[] }>(getPipeline);
  useRealtimeRevalidation(["entry.created", "entry.updated", "approval.reviewed", "plan.executed", "publication.completed", "publication.failed"], reload);

  if (status === "loading") return <div data-testid="content-pipeline"><LoadingSkeleton rows={8} /></div>;
  if (status === "error") return <div data-testid="content-pipeline"><ErrorBlock message={error!} onRetry={reload} /></div>;

  const columns = data!.columns;
  const colMap = new Map(columns.map((c) => [c.id, c]));

  return (
    <div data-testid="content-pipeline" className="pipe">
      <div className="pipe__header">
        <h1 className="pipe__title">Pipeline</h1>
        <div className="filter-bar">
          <input className="input" style={{ width: 150 }} placeholder="Filter brand..." value={filters.brand} onChange={(e) => setFilter("brand", e.target.value)} />
          <input className="input" style={{ width: 150 }} placeholder="Filter destination..." value={filters.destination} onChange={(e) => setFilter("destination", e.target.value)} />
          <input className="input" style={{ width: 150 }} placeholder="Filter campaign..." value={filters.campaign} onChange={(e) => setFilter("campaign", e.target.value)} />
          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
        </div>
      </div>

      <div className="pipe__board">
        {COLUMN_ORDER.map((colId) => {
          const col = colMap.get(colId);
          const items = col?.items ?? [];
          return (
            <div key={colId} data-testid={`pipeline-column-${colId}`} className="pipe__col">
              <div className="pipe__col-header" style={{ borderTopColor: COLUMN_ACCENT[colId] }}>
                <span className="pipe__col-label">{COLUMN_LABELS[colId]}</span>
                <span className="pipe__col-count">{items.length}</span>
              </div>
              <div className="pipe__col-items">
                {items.map((item) => (
                  <Link key={item.id} to={`/composer/${item.id}`} className="pipe__card card card--clickable" style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="pipe__card-title truncate">{item.title}</div>
                    <div className="pipe__card-meta">
                      <StatusBadge status={item.status as EntryStatus} />
                      {runBadge(item.latestRunStatus)}
                    </div>
                    <div className="pipe__card-info">
                      <span>{item.destinationSummary} dest{item.destinationSummary !== 1 ? "s" : ""}</span>
                      <span>{item.assetCount} asset{item.assetCount !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="pipe__card-time mono">{relativeTime(item.updatedAt)}</div>
                  </Link>
                ))}
                {items.length === 0 && (
                  <div style={{ padding: "var(--sp-4)", textAlign: "center", color: "var(--c-text-muted)", fontSize: "var(--fs-xs)" }}>
                    No entries
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
