import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { getDestinations, testConnection, createDestination } from "../api/client";
import type { Destination, DestinationKind, PublishPolicy, CapabilityMap } from "../api/types";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { FormRenderer } from "../components/FormRenderer";
import "./Destinations.css";

function healthBadge(status: string) {
  const map: Record<string, { v: "success" | "danger" | "warning"; l: string }> = {
    active: { v: "success", l: "Healthy" },
    paused: { v: "warning", l: "Paused" },
    error: { v: "danger", l: "Error" },
  };
  const b = map[status] ?? { v: "warning" as const, l: status };
  return <Badge variant={b.v}>{b.l}</Badge>;
}

function policyBadge(p: PublishPolicy) {
  const map: Record<PublishPolicy, { v: "info" | "success" | "warning"; l: string }> = {
    manual: { v: "info", l: "Manual" },
    autopublish: { v: "success", l: "Autopublish" },
    conditional: { v: "warning", l: "Conditional" },
  };
  const b = map[p];
  return <Badge variant={b.v}>{b.l}</Badge>;
}

function kindLabel(k: DestinationKind): string {
  return { website_page: "Website", blog_post: "Blog", webhook: "Webhook", linkedin_post: "LinkedIn", bluesky_post: "Bluesky", mastodon_post: "Mastodon" }[k] ?? k;
}

function CapBadges({ cap }: { cap: CapabilityMap }) {
  const items: Array<{ key: string; label: string; supported: boolean }> = [
    { key: "text", label: "Text", supported: cap.supportsText },
    { key: "images", label: "Images", supported: cap.supportsImages },
    { key: "video", label: "Video", supported: cap.supportsVideo },
    { key: "thread", label: "Thread", supported: cap.supportsThread },
    { key: "linkCard", label: "Link Card", supported: cap.supportsLinkCard },
    { key: "richBlocks", label: "Rich Blocks", supported: cap.supportsRichBlocks },
    { key: "schedule", label: "Scheduling", supported: cap.supportsScheduling },
    { key: "immediate", label: "Immediate", supported: cap.supportsImmediatePublish },
  ];
  return (
    <div className="dest-caps">
      {items.map((i) => (
        <span key={i.key} className={`dest-cap ${i.supported ? "dest-cap--on" : "dest-cap--off"}`}>
          {i.label}
        </span>
      ))}
      {cap.maxTextLength > 0 && <span className="dest-cap dest-cap--info">Max {cap.maxTextLength} chars</span>}
      {cap.maxAssetCount > 0 && <span className="dest-cap dest-cap--info">Max {cap.maxAssetCount} assets</span>}
      {cap.requiresApprovalByDefault && <span className="dest-cap dest-cap--warn">Requires approval</span>}
    </div>
  );
}

export function DestinationsScreen() {
  const { status, data, error, reload } = useApi<{ items: Destination[] }>(getDestinations);
  useRealtimeRevalidation(["destination.created", "destination.updated"], reload);
  const [testing, setTesting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleTest(id: string) {
    setTesting(id);
    try {
      await testConnection(id);
      reload();
    } finally {
      setTesting(null);
    }
  }

  if (status === "loading") return <div data-testid="content-destinations"><LoadingSkeleton rows={6} /></div>;
  if (status === "error") return <div data-testid="content-destinations"><ErrorBlock message={error!} onRetry={reload} /></div>;

  const items = data!.items;

  return (
    <div data-testid="content-destinations">
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-5)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Destinations</h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>{items.length} destination{items.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>Add Destination</button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="◉" title="No destinations" description="Add a publishing destination to get started." action={
          <button className="btn btn--primary" onClick={() => setShowCreate(true)}>Add Destination</button>
        } />
      ) : (
        <div className="dest-grid">
          {items.map((d) => (
            <div key={d.id} data-testid="destination-card" className="card dest-card">
              <div className="dest-card__header">
                <div>
                  <div className="dest-card__name">{d.name}</div>
                  <div className="dest-card__kind">{kindLabel(d.kind)}</div>
                </div>
                {healthBadge(d.status)}
              </div>

              <div className="dest-card__meta">
                <div className="dest-card__row">
                  <span className="dest-card__label">Brand</span>
                  <span>{d.brandId}</span>
                </div>
                <div className="dest-card__row">
                  <span className="dest-card__label">Policy</span>
                  {policyBadge(d.publishPolicy)}
                </div>
                <div className="dest-card__row">
                  <span className="dest-card__label">Secret</span>
                  <span className={d.secretRef ? "dest-secret--set" : "dest-secret--missing"}>
                    {d.secretRef ? "Configured" : "Not set"}
                  </span>
                </div>
                {d.lastError && (
                  <div className="dest-card__error">{d.lastError}</div>
                )}
                {d.lastCheckedAt && (
                  <div className="dest-card__row">
                    <span className="dest-card__label">Last checked</span>
                    <span className="mono" style={{ fontSize: "var(--fs-xs)" }}>{new Date(d.lastCheckedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <CapBadges cap={d.capabilityMap} />

              <div className="dest-card__footer">
                <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>
                  {d.variantCount ?? 0} variants · {d.pendingApprovalCount ?? 0} pending
                </span>
                <button
                  data-testid="destination-test-connection"
                  className="btn btn--secondary btn--sm"
                  onClick={() => handleTest(d.id)}
                  disabled={testing === d.id}
                >
                  {testing === d.id ? "Testing..." : "Test Connection"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="dialog-overlay" onClick={() => setShowCreate(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <FormRenderer
              formId="destination.create"
              onSubmit={async (vals) => {
                await createDestination(vals);
                setShowCreate(false);
                reload();
              }}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
