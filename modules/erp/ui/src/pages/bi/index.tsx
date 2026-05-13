import { EmptyState } from "../../components/EmptyState";

export function BiDashboardsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="BI Dashboards" text="Custom analytics dashboards." /></div></div>;
}
export function MetricsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Metrics" text="KPI definitions and targets." /></div></div>;
}
export function ViewsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Saved Views" text="Custom report views." /></div></div>;
}
export function DrilldownPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Drilldown" text="Interactive data exploration." /></div></div>;
}
export function ExportPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Export" text="Data export and scheduled reports." /></div></div>;
}
