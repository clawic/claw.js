import { api, type AccountRecord } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";

const columns: Column<AccountRecord>[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "category", label: "Category", type: "badge" },
  { key: "createdAt", label: "Created", type: "date" },
];

export function AccountsPage() {
  const { data, loading, error, refresh } = useApi(() => api.listAccounts(), []);
  return (
    <DataTable<AccountRecord>
      testId="finance-accounts-table"
      title="Chart of Accounts"
      columns={columns}
      data={data?.accounts ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      rowKey={(row) => row.code}
      emptyTitle="No accounts"
    />
  );
}
