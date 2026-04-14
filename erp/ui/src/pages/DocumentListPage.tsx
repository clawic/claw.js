import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DocumentRecord } from "../api/client";
import { useApi } from "../hooks/useApi";
import { DataTable, type Column } from "../components/DataTable";

interface Props {
  kind: string;
  title: string;
  testId: string;
  basePath: string;
  createPath?: string;
  extraColumns?: Column<DocumentRecord>[];
  bulkActions?: Array<{ label: string; onClick: (rows: DocumentRecord[]) => void }>;
}

const baseColumns: Column<DocumentRecord>[] = [
  { key: "number", label: "Number", type: "text" },
  { key: "status", label: "Status", type: "status" },
  { key: "counterpartyName", label: "Counterparty", type: "text" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "totalAmountCents", label: "Amount", type: "money" },
  { key: "issuedOn", label: "Issued", type: "date" },
  { key: "createdAt", label: "Created", type: "date" },
];

export function DocumentListPage({ kind, title, testId, basePath, createPath, extraColumns, bulkActions }: Props) {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApi(() => api.listDocuments(kind), [kind]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const docs = data?.documents ?? [];

  const filtered = useMemo(() => {
    let result = docs;
    if (statusFilter) result = result.filter((d) => d.status === statusFilter);
    if (search) result = result.filter((d) =>
      (d.number + " " + (d.counterpartyName ?? "")).toLowerCase().includes(search.toLowerCase())
    );
    return result;
  }, [docs, statusFilter, search]);

  const columns = extraColumns ? [...baseColumns, ...extraColumns] : baseColumns;
  const statuses = Array.from(new Set(docs.map((d) => d.status)));

  return (
    <DataTable<DocumentRecord>
      testId={testId}
      title={title}
      columns={columns}
      data={filtered}
      loading={loading}
      error={error}
      onRetry={refresh}
      onRowClick={(row) => navigate(`${basePath}/${row.id}`)}
      onCreate={createPath ? () => navigate(createPath) : undefined}
      createLabel={`New ${title.replace(/s$/, "")}`}
      bulkActions={bulkActions}
      rowKey={(row) => row.id}
      emptyTitle={`No ${title.toLowerCase()}`}
      emptyText={`Create your first ${title.toLowerCase().replace(/s$/, "")} to get started.`}
      filters={
        <>
          <input
            className="filter-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid={`${testId.replace("-table", "")}-filter-status`}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </>
      }
    />
  );
}
