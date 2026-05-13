import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { CardSkeleton } from "../components/LoadingSkeleton";
import { ErrorBlock } from "../components/ErrorBlock";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DashboardPage() {
  const { data, loading, error, refresh } = useApi(() => api.dashboard(), []);

  if (loading) return <CardSkeleton count={10} />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!data) return null;

  const m = data.metrics;

  const metricCards = [
    { testId: "dashboard-cash-card", label: "Cash Position", value: formatMoney(m.cashCents), cls: m.cashCents >= 0 ? "positive" : "negative" },
    { testId: "dashboard-ar-aging-card", label: "AR Aging", value: formatMoney(m.arAgingCents), cls: "neutral" },
    { testId: "dashboard-ap-aging-card", label: "AP Aging", value: formatMoney(m.apAgingCents), cls: "neutral" },
    { testId: "dashboard-revenue-card", label: "Revenue", value: formatMoney(m.revenueCents), cls: m.revenueCents > 0 ? "positive" : "neutral" },
    { testId: "dashboard-margin-card", label: "Margin", value: formatMoney(m.marginCents), cls: m.marginCents >= 0 ? "positive" : "negative" },
    { testId: "dashboard-overdue-approvals-card", label: "Overdue Approvals", value: String(m.overdueApprovals), cls: m.overdueApprovals > 0 ? "negative" : "neutral" },
    { testId: "dashboard-inventory-alerts-card", label: "Inventory Alerts", value: String(m.inventoryAlerts), cls: m.inventoryAlerts > 0 ? "negative" : "neutral" },
    { testId: "dashboard-production-bottlenecks-card", label: "Production Bottlenecks", value: String(m.productionBottlenecks), cls: m.productionBottlenecks > 0 ? "negative" : "neutral" },
    { testId: "dashboard-payroll-calendar-card", label: "Payroll Calendar", value: String(m.payrollCalendarItems), cls: "neutral" },
    { testId: "dashboard-open-tickets-card", label: "Open Tickets", value: String(m.openTickets), cls: m.openTickets > 0 ? "negative" : "neutral" },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <button className="btn btn-outline btn-sm" onClick={refresh}>Refresh</button>
      </div>

      <div className="metric-grid">
        {metricCards.map((card) => (
          <div key={card.testId} className="metric-card" data-testid={card.testId}>
            <div className="metric-card-label">{card.label}</div>
            <div className={`metric-card-value ${card.cls}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">Activity Feed</div>
          <div className="card-body" data-testid="dashboard-activity-feed">
            {data.feed.length === 0 ? (
              <div className="text-muted text-sm">No recent activity</div>
            ) : (
              <ul className="timeline">
                {data.feed.map((event) => (
                  <li key={event.id} className="timeline-item">
                    <span className="timeline-time">{formatDate(event.createdAt)}</span>
                    <span className="timeline-action">{event.action}</span>
                    <span className="timeline-actor">{event.actorType}:{event.actorId.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <div className="card mb-12">
            <div className="card-header">Stock Positions</div>
            <div className="card-body">
              {data.cards.stockPositions.length === 0 ? (
                <div className="text-muted text-sm">No inventory data</div>
              ) : (
                <table>
                  <thead>
                    <tr><th>SKU</th><th>Warehouse</th><th>On Hand</th><th>Avg Cost</th></tr>
                  </thead>
                  <tbody>
                    {data.cards.stockPositions.map((pos, i) => (
                      <tr key={i}>
                        <td className="text-mono">{pos.itemSku}</td>
                        <td>{pos.warehouseId.slice(0, 8)}</td>
                        <td className="text-right">{pos.onHandQty}</td>
                        <td className="text-right">{formatMoney(pos.averageCostCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">Jobs in Progress</div>
            <div className="card-body">
              <div className="text-muted text-sm">No jobs in progress</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-header">Latest Approvals</div>
            <div className="card-body">
              <div className="text-muted text-sm">Check the approvals module for pending items</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
