import { useState, useMemo } from "react";
import { StatusBadge } from "./StatusBadge";

export interface Column<T> {
  key: string;
  label: string;
  type?: "text" | "money" | "status" | "date" | "number" | "badge";
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props<T extends Record<string, any>> {
  testId: string;
  title: string;
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  onCreate?: () => void;
  createLabel?: string;
  bulkActions?: Array<{ label: string; onClick: (selected: T[]) => void }>;
  filters?: React.ReactNode;
  emptyTitle?: string;
  emptyText?: string;
  rowKey?: (row: T) => string;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

function getCellValue<T extends Record<string, any>>(row: T, col: Column<T>): React.ReactNode {
  if (col.render) return col.render(row);
  const val = row[col.key];
  if (val == null) return "-";
  switch (col.type) {
    case "money": return formatMoney(Number(val));
    case "status": return <StatusBadge status={String(val)} />;
    case "badge": return <StatusBadge status={String(val)} />;
    case "date": return formatDate(String(val));
    case "number": return Number(val).toLocaleString();
    default: return String(val);
  }
}

export function DataTable<T extends Record<string, any>>({
  testId, title, columns, data, loading, error, onRetry, onRowClick,
  onCreate, createLabel = "Create", bulkActions, filters,
  emptyTitle = "No data", emptyText, rowKey,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((_, i) => i)));
  };

  const toggleRow = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectedRows = Array.from(selected).map((i) => sorted[i]);

  if (loading) {
    return (
      <div className="data-table-wrapper" data-testid={testId}>
        <div className="table-toolbar">
          <span className="table-toolbar-title">{title}</span>
        </div>
        <div style={{ padding: 16 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton skeleton-table-row" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-table-wrapper" data-testid={testId}>
        <div className="table-toolbar">
          <span className="table-toolbar-title">{title}</span>
        </div>
        <div className="error-block" style={{ margin: 16 }}>
          <div className="error-block-title">Failed to load data</div>
          <div className="error-block-message">{error}</div>
          {onRetry && <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={onRetry}>Retry</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="data-table-wrapper" data-testid={testId}>
      <div className="table-toolbar">
        <span className="table-toolbar-title">{title}</span>
        <span className="table-counter">{data.length} total</span>
        {filters && <div className="filter-bar" data-testid={`${testId.replace("-table", "")}-filters`}>{filters}</div>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {bulkActions && selected.size > 0 && bulkActions.map((action) => (
            <button key={action.label} className="btn btn-outline btn-sm" onClick={() => action.onClick(selectedRows)}>
              {action.label} ({selected.size})
            </button>
          ))}
          <button className="btn btn-outline btn-sm" onClick={onRetry}>Export</button>
          {onCreate && (
            <button className="btn btn-primary btn-sm" data-testid={`${testId.replace("-table", "")}-create`} onClick={onCreate}>
              {createLabel}
            </button>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="table-empty">
          <div className="table-empty-title">{emptyTitle}</div>
          {emptyText && <p className="text-muted text-sm">{emptyText}</p>}
          {onCreate && <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onCreate}>{createLabel}</button>}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th className="table-checkbox">
                <input type="checkbox" checked={selected.size === sorted.length && sorted.length > 0} onChange={toggleAll} />
              </th>
              {columns.map((col) => (
                <th key={col.key} onClick={() => col.sortable !== false && handleSort(col.key)}>
                  {col.label}
                  {sortKey === col.key && (sortDir === "asc" ? " \u2191" : " \u2193")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr
                key={rowKey ? rowKey(row) : idx}
                className={selected.has(idx) ? "selected" : ""}
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? "pointer" : undefined }}
              >
                <td className="table-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleRow(idx)} />
                </td>
                {columns.map((col) => (
                  <td key={col.key} className={col.type === "money" || col.type === "number" ? "text-right" : ""}>
                    {getCellValue(row, col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
