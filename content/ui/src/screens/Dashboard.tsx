import { useApi } from "../hooks/useApi";
import { useRealtimeRevalidation } from "../hooks/useWebSocket";
import { getDashboard } from "../api/client";
import type { DashboardPayload } from "../api/types";
import { LoadingSkeleton, CardSkeleton } from "../components/LoadingState";
import { ErrorBlock } from "../components/ErrorBlock";
import { EmptyState } from "../components/EmptyState";
import { Link } from "react-router-dom";
import "./Dashboard.css";

function MetricTile({ testId, label, value, accent }: { testId: string; label: string; value: number; accent?: string }) {
  return (
    <div data-testid={testId} className="dash-metric" style={accent ? { borderLeftColor: accent } : undefined}>
      <div className="dash-metric__value">{value}</div>
      <div className="dash-metric__label">{label}</div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DashboardScreen() {
  const { status, data, error, reload } = useApi<DashboardPayload>(getDashboard);

  useRealtimeRevalidation([
    "entry.created", "entry.updated", "publication.completed", "publication.failed",
    "approval.created", "approval.reviewed", "plan.created", "plan.executed",
  ], reload);

  if (status === "loading") return (
    <div data-testid="content-dashboard">
      <div className="dash-grid">
        {Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
      <div className="card" style={{ marginTop: "var(--sp-4)" }}><LoadingSkeleton rows={6} /></div>
    </div>
  );

  if (status === "error") return (
    <div data-testid="content-dashboard">
      <ErrorBlock message={error!} onRetry={reload} />
    </div>
  );

  const d = data!;
  const m = d.metrics;

  return (
    <div data-testid="content-dashboard" className="dash">
      {/* Hero section */}
      <div className="dash__hero">
        <h1 className="dash__title">Editorial Overview</h1>
        <p className="dash__subtitle">
          {m.published} published, {m.scheduled} scheduled, {m.pendingApprovals} awaiting review
        </p>
        <button className="btn btn--secondary btn--sm" onClick={reload}>Refresh</button>
      </div>

      {/* Metric tiles */}
      <div className="dash-grid">
        <MetricTile testId="dashboard-drafts-card" label="Drafts" value={m.drafts} accent="var(--c-neutral)" />
        <MetricTile testId="dashboard-scheduled-card" label="Scheduled" value={m.scheduled} accent="var(--c-accent)" />
        <MetricTile testId="dashboard-published-card" label="Published" value={m.published} accent="var(--c-success)" />
        <MetricTile testId="dashboard-failed-card" label="Failed" value={m.failed} accent="var(--c-danger)" />
        <MetricTile testId="dashboard-pending-approvals-card" label="Pending Approvals" value={m.pendingApprovals} accent="var(--c-warning)" />
        <MetricTile testId="dashboard-destination-health-card" label="Healthy Destinations" value={m.healthyDestinations} accent="var(--c-success)" />
        <MetricTile testId="dashboard-assets-card" label="Assets Attached" value={m.assetsAttached} />
        <MetricTile testId="dashboard-campaigns-card" label="Active Campaigns" value={m.activeCampaigns} accent="var(--c-info)" />
      </div>

      <div className="dash-body">
        {/* Upcoming 7-day strip */}
        <section className="dash-section">
          <h2 className="dash-section__title">Next 7 Days</h2>
          {d.upcoming.length === 0 ? (
            <EmptyState icon="📅" title="Nothing scheduled" description="No publications in the next 7 days." />
          ) : (
            <div className="dash-upcoming">
              {d.upcoming.map((u) => (
                <div key={u.planId} className="dash-upcoming__item card card--clickable">
                  <div className="dash-upcoming__time mono">{formatDate(u.scheduledAt)}</div>
                  <div className="dash-upcoming__title">{u.title}</div>
                  <div className="dash-upcoming__dest">{u.destination}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Activity feed */}
        <section className="dash-section" data-testid="dashboard-activity-feed">
          <h2 className="dash-section__title">Activity</h2>
          {d.activity.length === 0 ? (
            <EmptyState icon="📋" title="No recent activity" />
          ) : (
            <div className="dash-feed">
              {d.activity.map((a) => (
                <div key={a.id} className="dash-feed__item">
                  <span className={`dash-feed__dot ${a.type.includes("failed") ? "dash-feed__dot--danger" : "dash-feed__dot--success"}`} />
                  <span className="dash-feed__label">{a.label}</span>
                  <span className="dash-feed__time mono">{relativeTime(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick links */}
        <section className="dash-section">
          <h2 className="dash-section__title">Quick Access</h2>
          <div className="dash-quick">
            <Link to="/pipeline" className="card card--clickable dash-quick__link">
              <span className="dash-quick__icon">⟶</span> Pipeline
            </Link>
            <Link to="/approvals" className="card card--clickable dash-quick__link">
              <span className="dash-quick__icon">✓</span> Approvals
            </Link>
            <Link to="/publications" className="card card--clickable dash-quick__link">
              <span className="dash-quick__icon">▸</span> Publications
            </Link>
            <Link to="/calendar" className="card card--clickable dash-quick__link">
              <span className="dash-quick__icon">▦</span> Calendar
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
