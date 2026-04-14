import { useNavigate } from "react-router-dom";
import { api, type JournalEntry } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";

const columns: Column<JournalEntry>[] = [
  { key: "entryDate", label: "Date", type: "date" },
  { key: "kind", label: "Kind", type: "badge" },
  { key: "memo", label: "Memo", type: "text" },
  { key: "totalDebitCents", label: "Debit", type: "money" },
  { key: "totalCreditCents", label: "Credit", type: "money" },
  { key: "periodId", label: "Period", type: "text", render: (r) => r.periodId.slice(0, 8) },
  { key: "createdAt", label: "Created", type: "date" },
];

export function EntriesPage() {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApi(() => api.listEntries(), []);
  return (
    <DataTable<JournalEntry>
      testId="finance-entries-table"
      title="Journal Entries"
      columns={columns}
      data={data?.entries ?? []}
      loading={loading}
      error={error}
      onRetry={refresh}
      onRowClick={(row) => navigate(`/finance/entries/${row.id}`)}
      rowKey={(row) => row.id}
      emptyTitle="No journal entries"
    />
  );
}
