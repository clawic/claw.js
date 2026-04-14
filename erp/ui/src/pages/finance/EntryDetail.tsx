import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, type JournalEntry } from "../../api/client";
import { useApi } from "../../hooks/useApi";
import { StatusBadge } from "../../components/StatusBadge";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { ErrorBlock } from "../../components/ErrorBlock";
import { ConfirmDialog } from "../../components/ConfirmDialog";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(cents / 100);
}

export function EntryDetailPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApi(() => api.listEntries(), []);
  const [showReverse, setShowReverse] = useState(false);

  if (loading) return <LoadingSkeleton rows={8} />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;

  const entry = data?.entries.find((e) => e.id === entryId);
  if (!entry) return <ErrorBlock message="Entry not found" />;

  const handleReverse = async () => {
    await api.reverseEntry(entry.id);
    setShowReverse(false);
    refresh();
  };

  return (
    <div>
      <div className="detail-header" data-testid="gl-entry-header">
        <div>
          <div className="detail-header-title">Journal Entry</div>
          <div className="detail-header-number">{entry.id.slice(0, 12)}</div>
        </div>
        <StatusBadge status={entry.kind} />
        <div className="detail-actions">
          {!entry.reversedFromEntryId && (
            <button className="btn btn-danger btn-sm" data-testid="gl-entry-reverse" onClick={() => setShowReverse(true)}>
              Reverse
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={refresh}>Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-body">
          <div className="detail-summary">
            <div className="detail-summary-item">
              <label>Date</label>
              <div className="value">{entry.entryDate}</div>
            </div>
            <div className="detail-summary-item">
              <label>Memo</label>
              <div className="value">{entry.memo}</div>
            </div>
            <div className="detail-summary-item">
              <label>Total Debit</label>
              <div className="value">{formatMoney(entry.totalDebitCents)}</div>
            </div>
            <div className="detail-summary-item">
              <label>Total Credit</label>
              <div className="value">{formatMoney(entry.totalCreditCents)}</div>
            </div>
            {entry.sourceDocumentId && (
              <div className="detail-summary-item">
                <label>Source Document</label>
                <div className="value text-mono">{entry.sourceDocumentId.slice(0, 12)}</div>
              </div>
            )}
            {entry.reversedFromEntryId && (
              <div className="detail-summary-item">
                <label>Reversed From</label>
                <div className="value text-mono">{entry.reversedFromEntryId.slice(0, 12)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" data-testid="gl-entry-lines">
        <div className="card-header">Lines</div>
        <div className="card-body">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr key={line.id}>
                  <td className="text-mono">{line.accountCode}</td>
                  <td className="text-right">{line.side === "debit" ? formatMoney(line.amountCents) : "-"}</td>
                  <td className="text-right">{line.side === "credit" ? formatMoney(line.amountCents) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td className="text-right">{formatMoney(entry.totalDebitCents)}</td>
                <td className="text-right">{formatMoney(entry.totalCreditCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {showReverse && (
        <ConfirmDialog
          title="Reverse Journal Entry"
          message={`Reverse entry ${entry.id.slice(0, 12)}? This creates a new offsetting entry.`}
          effects={["Creates a new reversing journal entry", "Original entry remains unchanged"]}
          danger
          confirmLabel="Reverse"
          onConfirm={handleReverse}
          onCancel={() => setShowReverse(false)}
        />
      )}
    </div>
  );
}
