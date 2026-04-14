import { useState } from "react";
import { api, type FiscalPeriodRecord } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { DataTable, type Column } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";

const columns: Column<FiscalPeriodRecord>[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "startsOn", label: "Start", type: "date" },
  { key: "endsOn", label: "End", type: "date" },
  { key: "status", label: "Status", type: "status" },
  { key: "closedAt", label: "Closed At", type: "date" },
];

export function PeriodsPage() {
  const { data, loading, error, refresh } = useApi(() => api.listPeriods(), []);
  const [closingPeriod, setClosingPeriod] = useState<FiscalPeriodRecord | null>(null);

  const handleClose = async () => {
    if (!closingPeriod) return;
    await api.closePeriod(closingPeriod.id);
    setClosingPeriod(null);
    refresh();
  };

  return (
    <>
      <DataTable<FiscalPeriodRecord>
        testId="finance-periods-table"
        title="Fiscal Periods"
        columns={columns}
        data={data?.periods ?? []}
        loading={loading}
        error={error}
        onRetry={refresh}
        onRowClick={(row) => row.status === "open" && setClosingPeriod(row)}
        rowKey={(row) => row.id}
        emptyTitle="No fiscal periods"
      />

      {closingPeriod && (
        <ConfirmDialog
          title="Close Fiscal Period"
          message={`Close period ${closingPeriod.code}? This action is irreversible.`}
          effects={[
            "No further journal entries can be posted to this period",
            "All balances for this period become final",
          ]}
          danger
          confirmLabel="Close Period"
          onConfirm={handleClose}
          onCancel={() => setClosingPeriod(null)}
        />
      )}
    </>
  );
}
