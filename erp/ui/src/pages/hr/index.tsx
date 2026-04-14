import { api, type EmployeeRecord } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";

const columns: Column<EmployeeRecord>[] = [
  { key: "employeeNumber", label: "Number", type: "text" },
  { key: "displayName", label: "Name", type: "text" },
  { key: "createdAt", label: "Created", type: "date" },
];

export function EmployeesPage() {
  const { data, loading, error, refresh } = useApi(() => api.listEmployees(), []);
  return (
    <DataTable<EmployeeRecord>
      testId="hr-employees-table"
      title="Employees"
      columns={columns}
      data={data?.employees ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => row.id}
      emptyTitle="No employees"
    />
  );
}

export function StructurePage() {
  return <div className="card"><div className="card-body"><EmptyState title="Organization Structure" text="Departments, positions, and reporting lines." /></div></div>;
}
export function ContractsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Contracts" text="Employment contracts and terms." /></div></div>;
}
export function LeavePage() {
  return <div className="card"><div className="card-body"><EmptyState title="Leave" text="Leave requests, balances, and policies." /></div></div>;
}
export function AttendancePage() {
  return <div className="card"><div className="card-body"><EmptyState title="Attendance" text="Attendance records and clock entries." /></div></div>;
}
export function HrDocumentsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="HR Documents" text="Employee document management." /></div></div>;
}
export function ReviewsPage() {
  return <div className="card"><div className="card-body"><EmptyState title="Performance Reviews" text="Review cycles and evaluations." /></div></div>;
}
