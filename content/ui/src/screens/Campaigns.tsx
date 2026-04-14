import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { useUrlFilters } from "../hooks/useUrlFilters";
import { getCampaigns } from "../api/client";
import type { Campaign, CampaignStatus } from "../api/types";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";

const STATUS_BADGE: Record<CampaignStatus, { v: "success" | "neutral" | "info" | "muted"; l: string }> = {
  draft: { v: "neutral", l: "Draft" },
  active: { v: "success", l: "Active" },
  completed: { v: "info", l: "Completed" },
  archived: { v: "muted", l: "Archived" },
};

export function CampaignsScreen() {
  const { filters, setFilter } = useUrlFilters(["status"]);
  const { status, data, error, reload } = useApi<{ campaigns: Campaign[] }>(getCampaigns);
  useRealtimeRevalidation(["campaign.created", "campaign.updated"], reload);

  const campaigns = data?.campaigns ?? [];
  const filtered = filters.status ? campaigns.filter((c) => c.status === filters.status) : campaigns;

  if (status === "loading") return <LoadingSkeleton rows={6} />;
  if (status === "error") return <ErrorBlock message={error!} onRetry={reload} />;

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Campaigns</h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>{filtered.length} campaign{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input" style={{ width: "auto" }} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {(["draft", "active", "completed", "archived"] as CampaignStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="◎" title="No campaigns" description="Campaigns will appear here once created." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--sp-4)" }}>
          {filtered.map((c) => {
            const sb = STATUS_BADGE[c.status];
            return (
              <div key={c.id} className="card">
                <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-2)" }}>
                  <div style={{ fontSize: "var(--fs-md)", fontWeight: 700 }}>{c.name}</div>
                  <Badge variant={sb.v}>{sb.l}</Badge>
                </div>
                {c.description && <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)", marginBottom: "var(--sp-2)" }}>{c.description}</p>}
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", display: "flex", gap: "var(--sp-4)" }}>
                  {c.startsAt && <span>Starts: {new Date(c.startsAt).toLocaleDateString()}</span>}
                  {c.endsAt && <span>Ends: {new Date(c.endsAt).toLocaleDateString()}</span>}
                </div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)", marginTop: "var(--sp-1)" }}>
                  Brand: {c.brandId} · Slug: {c.slug}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
