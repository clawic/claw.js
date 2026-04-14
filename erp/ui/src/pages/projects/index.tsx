import { api, type ProjectRecord } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";

const columns: Column<ProjectRecord>[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "createdAt", label: "Created", type: "date" },
];

export function ProjectsListPage() {
  const { data, loading, error, refresh } = useApi(() => api.listProjects(), []);
  return (
    <DataTable<ProjectRecord>
      testId="projects-list-table"
      title="Projects"
      columns={columns}
      data={data?.projects ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => row.id}
      emptyTitle="No projects"
    />
  );
}

export function PortfolioPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Portfolio" text="Project portfolio overview and health." /></div></div>;
}
export function TasksPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Tasks" text="Project task management." /></div></div>;
}
export function MilestonesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Milestones" text="Project milestones and deliverables." /></div></div>;
}
export function TimesheetsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Timesheets" text="Time entry and approval." /></div></div>;
}
export function ProfitabilityPage() {
  return (
    <div className="card">
      <div className="card-header">Project Profitability</div>
      <div className="card-body">
        <div className="detail-summary">
          <div className="detail-summary-item"><label>Revenue</label><div className="value">-</div></div>
          <div className="detail-summary-item"><label>Cost</label><div className="value">-</div></div>
          <div className="detail-summary-item"><label>Margin</label><div className="value">-</div></div>
          <div className="detail-summary-item"><label>Billed Hours</label><div className="value">-</div></div>
          <div className="detail-summary-item"><label>Unbilled Hours</label><div className="value">-</div></div>
        </div>
        <div className="text-muted text-sm">Create projects and log timesheets to see profitability data.</div>
      </div>
    </div>
  );
}
export function BillingPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Billing" text="Project invoicing and billing rules." /></div></div>;
}
