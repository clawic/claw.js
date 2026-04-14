import { useState } from "react";
import type { DocumentDetail, AuditRecord, ApprovalRecord } from "../api/client";
import { StatusBadge } from "./StatusBadge";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface Props {
  testId: string;
  detail: DocumentDetail;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function DetailLayout({ testId, detail, actions, children }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const { header, summary, timeline, audit, approvals, tabs } = detail;

  return (
    <div>
      <div className="detail-header" data-testid={`${testId}-header`}>
        <div>
          <div className="detail-header-title">{header.kind.replace(/_/g, " ")}</div>
          <div className="detail-header-number">{header.number}</div>
        </div>
        <StatusBadge status={header.status} />
        {header.counterpartyName && <span className="text-muted">{header.counterpartyName}</span>}
        <div className="detail-actions">
          {actions}
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-body">
          <div className="detail-summary">
            <div className="detail-summary-item">
              <label>Currency</label>
              <div className="value">{summary.currency}</div>
            </div>
            <div className="detail-summary-item">
              <label>Total</label>
              <div className="value">{formatMoney(summary.totalAmountCents)}</div>
            </div>
            <div className="detail-summary-item">
              <label>Issued</label>
              <div className="value">{formatDate(summary.issuedOn)}</div>
            </div>
            <div className="detail-summary-item">
              <label>Posted</label>
              <div className="value">{formatDate(summary.postedAt)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
            data-testid={tab === "audit" ? `${testId}-audit-tab` : tab === "approvals" ? `${testId}-approvals-tab` : undefined}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="card">
          <div className="card-body">
            {children ?? (
              <div className="text-muted text-sm">
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {JSON.stringify(detail.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="card">
          <div className="card-body">
            {timeline.length === 0 ? (
              <div className="text-muted text-sm">No timeline events</div>
            ) : (
              <ul className="timeline">
                {timeline.map((event, i) => (
                  <li key={i} className="timeline-item">
                    <span className="timeline-time">{formatDate(event.at)}</span>
                    <span className="timeline-action">{event.action}</span>
                    <span className="timeline-actor">{event.actor}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {activeTab === "audit" && (
        <div className="card">
          <div className="card-body">
            <AuditTable audit={audit} />
          </div>
        </div>
      )}

      {activeTab === "attachments" && (
        <div className="card">
          <div className="card-body">
            <div className="text-muted text-sm">No attachments</div>
          </div>
        </div>
      )}

      {activeTab === "approvals" && (
        <div className="card">
          <div className="card-body">
            <ApprovalsTable approvals={approvals} />
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTable({ audit }: { audit: AuditRecord[] }) {
  if (audit.length === 0) return <div className="text-muted text-sm">No audit events</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Action</th>
          <th>Actor</th>
          <th>Entity</th>
        </tr>
      </thead>
      <tbody>
        {audit.map((entry) => (
          <tr key={entry.id}>
            <td className="text-mono text-sm">{formatDate(entry.createdAt)}</td>
            <td>{entry.action}</td>
            <td>{entry.actorType}:{entry.actorId.slice(0, 8)}</td>
            <td>{entry.entityType}:{entry.entityId.slice(0, 8)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApprovalsTable({ approvals }: { approvals: ApprovalRecord[] }) {
  if (approvals.length === 0) return <div className="text-muted text-sm">No approvals</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Kind</th>
          <th>Status</th>
          <th>Requested By</th>
          <th>Decided By</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {approvals.map((a) => (
          <tr key={a.id}>
            <td>{a.kind}</td>
            <td><StatusBadge status={a.status} /></td>
            <td>{a.requestedBy}</td>
            <td>{a.decidedBy ?? "-"}</td>
            <td className="text-mono text-sm">{formatDate(a.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
