import { useNavigate } from "react-router-dom";
import { api, type ItemRecord, type InventoryBalance } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";

const itemColumns: Column<ItemRecord>[] = [
  { key: "sku", label: "SKU", type: "text" },
  { key: "name", label: "Description", type: "text" },
  { key: "kind", label: "Kind", type: "badge" },
  { key: "createdAt", label: "Created", type: "date" },
];

export function ItemsPage() {
  const { data, loading, error, refresh } = useApi(() => api.listItems(), []);
  return (
    <DataTable<ItemRecord>
      testId="inventory-items-table"
      title="Items"
      columns={itemColumns}
      data={data?.items ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => row.id}
      emptyTitle="No items"
      emptyText="Add your first inventory item."
    />
  );
}

const balanceColumns: Column<InventoryBalance>[] = [
  { key: "itemSku", label: "SKU", type: "text" },
  { key: "warehouseId", label: "Warehouse", type: "text", render: (r) => r.warehouseId.slice(0, 8) },
  { key: "onHandQty", label: "On Hand", type: "number" },
  { key: "averageCostCents", label: "Avg Cost", type: "money" },
  { key: "updatedAt", label: "Last Movement", type: "date" },
];

export function BalancesPage() {
  const { data, loading, error, refresh } = useApi(() => api.listInventoryBalances(), []);
  return (
    <DataTable<InventoryBalance>
      testId="inventory-balances-table"
      title="Inventory Balances"
      columns={balanceColumns}
      data={data?.balances ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => `${row.itemSku}-${row.warehouseId}`}
      emptyTitle="No inventory"
    />
  );
}

export function VariantsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Variants" text="Item variant configurations." /></div></div>;
}
export function UomPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Units of Measure" text="UoM definitions and conversions." /></div></div>;
}
export function LotsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Lots" text="Lot and batch tracking." /></div></div>;
}
export function SerialsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Serials" text="Serial number tracking." /></div></div>;
}
export function WarehousesPage() {
  const { data, loading, error, refresh } = useApi(() => api.listWarehouses(), []);
  const columns: Column<Record<string, unknown>>[] = [
    { key: "code", label: "Code", type: "text" },
    { key: "name", label: "Name", type: "text" },
    { key: "createdAt", label: "Created", type: "date" },
  ];
  return (
    <DataTable
      testId="inventory-warehouses-table"
      title="Warehouses"
      columns={columns}
      data={(data?.warehouses ?? []) as any[]}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => String(row.id)}
      emptyTitle="No warehouses"
    />
  );
}
export function LocationsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Locations" text="Warehouse bin and zone locations." /></div></div>;
}
export function MovementsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Movements" text="Inventory movement log." /></div></div>;
}
export function ValuationPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Valuation" text="Inventory valuation methods and reports." /></div></div>;
}
export function CountsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Cycle Counts" text="Physical inventory counts and adjustments." /></div></div>;
}
export function ReorderRulesPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Reorder Rules" text="Automatic replenishment rules." /></div></div>;
}
