import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { useUrlFilters } from "../hooks/useUrlFilters";
import { getApprovals, approveApproval, rejectApproval } from "../api/client";
import type { ApprovalRequest, ApprovalStatus } from "../api/types";
import { Badge } from "../components/Badge";
import { LoadingSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Link } from "react-router-dom";

const STATUS_BADGE: Record<ApprovalStatus, { v: "success" | "warning" | "danger" | "muted"; l: string }> = {
  pending: { v: "warning", l: "Pending" },
  approved: { v: "success", l: "Approved" },
  rejected: { v: "danger", l: "Rejected" },
  expired: { v: "muted", l: "Expired" },
  cancelled: { v: "muted", l: "Cancelled" },
};

export function ApprovalsScreen() {
  const { filters, setFilter } = useUrlFilters(["status"]);
  const { status, data, error, reload } = useApi<{ items: ApprovalRequest[] }>(getApprovals);
  useRealtimeRevalidation(["approval.created", "approval.reviewed"], reload);

  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [processing, setProcessing] = useState(false);

  const items = data?.items ?? [];
  const filtered = filters.status
    ? items.filter((i) => i.status === filters.status)
    : items;

  async function handleApprove(id: string) {
    setProcessing(true);
    try {
      await approveApproval(id);
      setSelected(null);
      reload();
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget || !rejectComment.trim()) return;
    setProcessing(true);
    try {
      await rejectApproval(rejectTarget, rejectComment);
      setRejectTarget(null);
      setRejectComment("");
      setSelected(null);
      reload();
    } finally {
      setProcessing(false);
    }
  }

  if (status === "loading") return <div data-testid="content-approvals"><LoadingSkeleton rows={6} /></div>;
  if (status === "error") return <div data-testid="content-approvals"><ErrorBlock message={error!} onRetry={reload} /></div>;

  return (
    <div data-testid="content-approvals">
      <div className="flex justify-between items-center" style={{ marginBottom: "var(--sp-4)", flexWrap: "wrap", gap: "var(--sp-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>Approvals</h1>
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-muted)" }}>{filtered.length} approval{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 items-center">
          <select className="input" style={{ width: "auto" }} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All statuses</option>
            {(["pending", "approved", "rejected", "expired", "cancelled"] as ApprovalStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="✓" title="No approvals" description="The approval queue is empty." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", gap: "var(--sp-4)" }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Entry</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Diff</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const sb = STATUS_BADGE[a.status];
                  return (
                    <tr
                      key={a.id}
                      data-testid="approval-row"
                      className={selected?.id === a.id ? "selected" : ""}
                      onClick={() => setSelected(a)}
                      style={{ cursor: "pointer" }}
                    >
                      <td className="mono" style={{ fontSize: "var(--fs-xs)" }}>{new Date(a.requestedAt).toLocaleString()}</td>
                      <td>
                        <Link to={`/entries/${a.entryId}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>
                          {a.entry?.title ?? a.entryId}
                        </Link>
                      </td>
                      <td style={{ fontSize: "var(--fs-sm)" }}>{a.destination?.name ?? a.destinationId}</td>
                      <td><Badge variant={sb.v}>{sb.l}</Badge></td>
                      <td>{a.latestRevision && a.previousRevision ? <Badge variant="info">Diff available</Badge> : <span style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-xs)" }}>N/A</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {a.status === "pending" && (
                          <div className="flex gap-1">
                            <button data-testid="approval-approve-cta" className="btn btn--sm btn--primary" onClick={() => handleApprove(a.id)} disabled={processing}>
                              Approve
                            </button>
                            <button data-testid="approval-reject-cta" className="btn btn--sm btn--danger" onClick={() => { setRejectTarget(a.id); setRejectComment(""); }} disabled={processing}>
                              Reject
                            </button>
                          </div>
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
              <h3 style={{ fontSize: "var(--fs-md)", fontWeight: 700, marginBottom: "var(--sp-3)" }}>Approval Detail</h3>
              <div style={{ fontSize: "var(--fs-sm)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
                <div><strong>Entry:</strong> {selected.entry?.title ?? selected.entryId}</div>
                <div><strong>Destination:</strong> {selected.destination?.name ?? selected.destinationId}</div>
                <div><strong>Status:</strong> {(() => { const sb = STATUS_BADGE[selected.status]; return <Badge variant={sb.v}>{sb.l}</Badge>; })()}</div>
                <div><strong>Requested by:</strong> {selected.requestedBy ?? "System"}</div>
                <div><strong>Requested at:</strong> <span className="mono">{new Date(selected.requestedAt).toLocaleString()}</span></div>
                {selected.reviewedAt && <div><strong>Reviewed at:</strong> <span className="mono">{new Date(selected.reviewedAt).toLocaleString()}</span></div>}
                {selected.comment && <div><strong>Comment:</strong> {selected.comment}</div>}

                {/* Diff section */}
                {selected.latestRevision && selected.previousRevision && (
                  <div style={{ marginTop: "var(--sp-3)" }}>
                    <h4 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Revision Diff</h4>
                    <div style={{ background: "var(--c-surface-raised)", borderRadius: "var(--r-md)", padding: "var(--sp-3)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)" }}>
                      <div style={{ color: "var(--c-danger)" }}>- Rev {selected.previousRevision.revisionNumber}</div>
                      <div style={{ color: "var(--c-success)" }}>+ Rev {selected.latestRevision.revisionNumber}</div>
                    </div>
                  </div>
                )}

                {/* Impact preview by destination */}
                {selected.destination && (
                  <div style={{ marginTop: "var(--sp-3)" }}>
                    <h4 style={{ fontSize: "var(--fs-sm)", fontWeight: 700, marginBottom: "var(--sp-2)" }}>Impact Preview</h4>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--c-text-secondary)" }}>
                      Publishing to <strong>{selected.destination.name}</strong> ({selected.destination.kind})
                      {selected.destination.publishPolicy === "autopublish" && (
                        <span style={{ color: "var(--c-warning)" }}> — autopublish enabled</span>
                      )}
                    </div>
                  </div>
                )}

                {selected.status === "pending" && (
                  <div className="flex gap-2" style={{ marginTop: "var(--sp-3)" }}>
                    <button className="btn btn--primary" onClick={() => handleApprove(selected.id)} disabled={processing}>
                      Approve
                    </button>
                    <button className="btn btn--danger" onClick={() => { setRejectTarget(selected.id); setRejectComment(""); }} disabled={processing}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <div className="dialog-overlay" onClick={() => setRejectTarget(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="dialog__title">Reject Approval</h3>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--c-text-secondary)", marginBottom: "var(--sp-3)" }}>
              A rejection comment is required.
            </p>
            <textarea
              className="input"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              autoFocus
            />
            <div className="dialog__actions">
              <button className="btn btn--secondary" onClick={() => setRejectTarget(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={handleReject} disabled={!rejectComment.trim() || processing}>
                {processing ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
