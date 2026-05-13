import { DocumentListPage } from "../DocumentListPage";
import { DocumentDetailPage } from "../DocumentDetailPage";
import { EmptyState } from "../../components/EmptyState";

export function MrpOrdersPage() {
  return (
    <DocumentListPage
      kind="production_order"
      title="Production Orders"
      testId="mrp-orders-table"
      basePath="/mrp/orders"
    />
  );
}

export function MrpOrderDetailPage() {
  return <DocumentDetailPage testId="mrp-order" />;
}

export function BomsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Bills of Materials" text="Product structure and component lists." /></div></div>;
}
export function RoutingsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Routings" text="Manufacturing routing sequences." /></div></div>;
}
export function WorkCentersPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Work Centers" text="Production work center capacity." /></div></div>;
}
export function ConsumptionPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Consumption" text="Material consumption tracking." /></div></div>;
}
export function ProductionPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Production" text="Production output tracking." /></div></div>;
}
export function QualityPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Quality" text="Quality control inspections." /></div></div>;
}
export function MaintenancePage() {
  return <div className="card"><div className="card-body"><EmptyState title="Maintenance" text="Equipment maintenance schedules." /></div></div>;
}
