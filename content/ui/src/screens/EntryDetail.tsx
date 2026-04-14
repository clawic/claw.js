import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { getComposer } from "../api/client";
import type { ComposerPayload, EntryStatus } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";

type Tab = "overview" | "timeline" | "approvals" | "attachments" | "runs";

export function EntryDetailScreen() {
  const { entryId } = useParams<{ entryId: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const { status, data, error, reload } = useApi<ComposerPayload>(() => getComposer(entryId!), [entryId]);
  useRealtimeRevalidation(["entry.updated", "variant.updated", "approval.reviewed", "publication.completed"], reload);

  if (status === "loading") return <LoadingSkeleton rows={8} />;
  if (status === "error") return <ErrorBlock message={error!} onRetry={reload} />;

  const d = data!;
  const e = d.entry;

  const TABS: Tab[] = ["overview", "timeline", "approvals", "attachments", "runs"];

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>
            {e.title}
            <StatusBadge status={e.status as EntryStatus} />
          </h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)" }}>
            {e.contentType} · Rev {e.currentRevisionNumber} · {e.canonicalFormat}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/composer/${e.id}`} className="btn btn--primary">Open in Composer</Link>
          <button className="btn btn--secondary" onClick={reload}>Refresh</button>
        </div>
      </div>

      {/* Summary card */}
      <div className="card" style={{ marginBottom: "var(--sp-4)" }}>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)", marginBottom: "var(--sp-2)" }}>
          {e.summary || "No summary"}
        </div>
        <div style={{ fontSize: "var(--fs-sm)", whiteSpace: "pre-wrap" }}>{e.canonicalBody}</div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: "var(--sp-4)" }}>
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "tab--active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
          <div className="card">
            <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Revision History</h3>
            {d.revisions.map((r) => (
              <div key={r.revisionNumber} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-sm)", padding: "var(--sp-1) 0", borderBottom: "1px solid var(--c-border)" }}>
                <span className="mono">v{r.revisionNumber}</span>
                <span className="mono" style={{ color: "var(--c-text-muted)" }}>{new Date(r.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Linked Variants</h3>
            {d.variants.length === 0 ? (
              <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>No variants yet</p>
            ) : (
              <table style={{ width: "100%" }}>
                <thead><tr><th>Destination</th><th>Status</th></tr></thead>
                <tbody>
                  {d.variants.map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontSize: "var(--fs-sm)" }}>{v.destinationName ?? v.destinationId}</td>
                      <td><Badge variant={v.status === "ready" ? "success" : v.status === "blocked" ? "danger" : "neutral"}>{v.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <div className="card">
          <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Timeline</h3>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>
            <p>Created: {new Date(e.createdAt).toLocaleString()}</p>
            <p>Updated: {new Date(e.updatedAt).toLocaleString()}</p>
            {d.plans.map((p) => (
              <p key={p.id}>Plan {p.id}: {p.status} {p.scheduledAt ? `- scheduled ${new Date(p.scheduledAt).toLocaleString()}` : ""}</p>
            ))}
          </div>
        </div>
      )}

      {tab === "approvals" && (
        <div className="card">
          <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Linked Approvals</h3>
          {d.approvals.length === 0 ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>No approvals</p>
          ) : (
            <table style={{ width: "100%" }}>
              <thead><tr><th>Status</th><th>Destination</th><th>Requested</th></tr></thead>
              <tbody>
                {d.approvals.map((a) => (
                  <tr key={a.id}>
                    <td><Badge variant={a.status === "approved" ? "success" : a.status === "pending" ? "warning" : "danger"}>{a.status}</Badge></td>
                    <td style={{ fontSize: "var(--fs-sm)" }}>{a.destinationId}</td>
                    <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{new Date(a.requestedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "attachments" && (
        <div className="card">
          <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Assets</h3>
          {d.assets.length === 0 ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>No assets attached</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "var(--sp-3)" }}>
              {d.assets.map((a) => (
                <div key={a.id} className="card" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "var(--sp-1)" }}>
                    {a.assetKind === "image" ? "🖼" : a.assetKind === "video" ? "🎬" : "📄"}
                  </div>
                  <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>{a.name}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-muted)" }}>{a.altText ?? "No alt text"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "runs" && (
        <div className="card">
          <h3 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Publication Runs</h3>
          {d.plans.length === 0 ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>No publication plans</p>
          ) : (
            <table style={{ width: "100%" }}>
              <thead><tr><th>Plan</th><th>Status</th><th>Scheduled</th></tr></thead>
              <tbody>
                {d.plans.map((p) => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{p.id}</td>
                    <td><Badge variant={p.status === "executed" ? "success" : p.status === "cancelled" ? "muted" : "accent"}>{p.status}</Badge></td>
                    <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : "Immediate"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
