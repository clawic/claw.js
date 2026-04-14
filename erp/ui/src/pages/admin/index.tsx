import { api, type ApprovalRecord, type AuditRecord } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";

// Approvals page (shared admin tool)
const approvalColumns: Column<ApprovalRecord>[] = [
  { key: "kind", label: "Kind", type: "text" },
  { key: "status", label: "Status", type: "status" },
  { key: "requestedBy", label: "Requested By", type: "text" },
  { key: "decidedBy", label: "Decided By", type: "text", render: (r) => r.decidedBy ?? "-" },
  { key: "createdAt", label: "Created", type: "date" },
];

export function ApprovalsPage() {
  const { data, loading, error, refresh } = useApi(() => api.listApprovals(), []);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleApprove = async () => {
    if (!approvingId) return;
    await api.approveAction(approvingId);
    setApprovingId(null);
    refresh();
  };

  return (
    <>
      <DataTable<ApprovalRecord>
        testId="admin-approvals-table"
        title="Approvals"
        columns={approvalColumns}
        data={data?.approvals ?? []}
        loading={loading}
        error={error}
        onRetry={refresh}
        onRowClick={(row) => row.status === "pending" && setApprovingId(row.id)}
        rowKey={(row) => row.id}
        emptyTitle="No approvals"
      />
      {approvingId && (
        <ConfirmDialog
          title="Approve Action"
          message="Approve this regulated action?"
          effects={["The requested action will be executed upon approval."]}
          confirmLabel="Approve"
          onConfirm={handleApprove}
          onCancel={() => setApprovingId(null)}
        />
      )}
    </>
  );
}

// Audit page
const auditColumns: Column<AuditRecord>[] = [
  { key: "createdAt", label: "Time", type: "date" },
  { key: "action", label: "Action", type: "text" },
  { key: "entityType", label: "Entity Type", type: "text" },
  { key: "entityId", label: "Entity", type: "text", render: (r) => r.entityId.slice(0, 12) },
  { key: "actorType", label: "Actor Type", type: "text" },
  { key: "actorId", label: "Actor", type: "text", render: (r) => r.actorId.slice(0, 12) },
];

export function AuditPage() {
  const { data, loading, error, refresh } = useApi(() => api.listAudit(), []);
  return (
    <DataTable<AuditRecord>
      testId="admin-audit-table"
      title="Audit Log"
      columns={auditColumns}
      data={data?.audit ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => row.id}
      emptyTitle="No audit events"
    />
  );
}

export function UsersPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Users" text="User accounts and access management." /></div></div>;
}
export function RolesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Roles" text="Role definitions and permission sets." /></div></div>;
}
export function PoliciesPage() {
  return (
    <div className="card">
      <div className="card-header">Policies</div>
      <div className="card-body">
        <table>
          <thead>
            <tr><th>Actor Type</th><th>Action Family</th><th>Threshold</th><th>Approval Req.</th><th>Escalation</th></tr>
          </thead>
          <tbody>
            <tr><td colSpan={5} className="text-muted text-sm" style={{ textAlign: "center", padding: 24 }}>Configure policies through the backend. Policies control approval requirements for regulated actions.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function LocalizationsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Localizations" text="Localization packs and regional settings." /></div></div>;
}
export function NumberingPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Numbering" text="Document numbering sequences." /></div></div>;
}
export function TemplatesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Templates" text="Document and email templates." /></div></div>;
}
export function IntegrationsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Integrations" text="Third-party integrations and webhooks." /></div></div>;
}
export function AgentsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Agents" text="AI agent configurations and permissions." /></div></div>;
}
export function SettingsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Settings" text="Global system configuration." /></div></div>;
}
