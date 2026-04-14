import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, TrendingUp, Shield, Zap } from "lucide-react";
import { fetchMonitor } from "../lib/api";
import { HeartbeatBar } from "../components/HeartbeatBar";
import { ResponseTime } from "../components/ResponseTime";
import { UptimePercent } from "../components/UptimePercent";
import { IncidentList } from "../components/IncidentList";
import type { MonitorStatus } from "../lib/types";

const BADGE: Record<MonitorStatus, { bg: string; text: string; label: string }> = {
  up:       { bg: "bg-green",  text: "text-[#0f1115]", label: "Up" },
  down:     { bg: "bg-red",    text: "text-white",     label: "Down" },
  degraded: { bg: "bg-yellow", text: "text-[#0f1115]", label: "Degraded" },
  pending:  { bg: "bg-gray",   text: "text-white",     label: "Pending" },
};

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${(diff / 3_600_000).toFixed(1)}h ago`;
}

export function MonitorDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: monitor, isLoading } = useQuery({
    queryKey: ["monitor", id],
    queryFn: () => fetchMonitor(id!),
    enabled: !!id,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  if (!monitor) {
    return (
      <div className="p-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text mb-4">
          <ArrowLeft size={14} /> Back
        </Link>
        <p className="text-red text-sm">Monitor not found.</p>
      </div>
    );
  }

  const badge = BADGE[monitor.latestStatus];
  const heartbeats = monitor.heartbeats;
  const hasResponseTimes = heartbeats.some((h) => h.responseTimeMs != null);

  const rts = heartbeats.filter((h) => h.responseTimeMs != null).map((h) => h.responseTimeMs!);
  const avgRt = rts.length > 0 ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : null;

  return (
    <div className="p-8 max-w-[1000px] mx-auto">
      {/* Back */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[12px] text-text-faint hover:text-text transition-colors mb-5"
      >
        <ArrowLeft size={13} /> Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold leading-tight truncate">{monitor.name}</h1>
          <div className="text-[12px] text-text-faint mt-1">
            {monitor.type.toUpperCase()}
            <span className="mx-2 opacity-30">|</span>
            {monitor.group}
          </div>
        </div>
        <span className={`px-6 py-2 rounded-xl text-[13px] font-bold tracking-wide ${badge.bg} ${badge.text}`}>
          {badge.label}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card icon={Shield} label="Uptime (24h)">
          <UptimePercent percent={monitor.uptimePercent24h} size="sm" />
        </Card>
        <Card icon={Zap} label="Current Ping">
          <span className="text-xl font-bold text-text">
            {monitor.latestResponseTimeMs != null ? `${monitor.latestResponseTimeMs}ms` : "—"}
          </span>
        </Card>
        <Card icon={TrendingUp} label="Avg Response">
          <span className="text-xl font-bold text-text">
            {avgRt != null ? `${avgRt}ms` : "—"}
          </span>
        </Card>
        <Card icon={Clock} label="Last Check">
          <span className="text-xl font-bold text-text">
            {monitor.latestCheckedAt ? formatAgo(monitor.latestCheckedAt) : "—"}
          </span>
        </Card>
      </div>

      {/* Heartbeat */}
      <Section title="Heartbeat" meta={`${heartbeats.length} checks`}>
        <HeartbeatBar
          heartbeats={heartbeats}
          barWidth={6}
          barHeight={34}
          gap={3}
          maxBars={90}
        />
        <div className="flex justify-between mt-2 text-[10px] text-text-faint font-medium">
          {heartbeats.length > 0 && (
            <>
              <span>{new Date(heartbeats[0].createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span>Now</span>
            </>
          )}
        </div>
      </Section>

      {/* Response time */}
      {hasResponseTimes && (
        <Section title="Response Time">
          <ResponseTime heartbeats={heartbeats} height={160} />
        </Section>
      )}

      {/* Incidents */}
      <Section title="Incidents" meta={`${monitor.incidents.length} total`}>
        <IncidentList incidents={monitor.incidents} />
      </Section>
    </div>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-[11px] font-bold text-text-faint uppercase tracking-[0.12em]">{title}</h2>
        {meta && <span className="text-[10px] text-text-faint opacity-60">{meta}</span>}
      </div>
      <div className="rounded-2xl border border-white/6 bg-bg-panel p-5 shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
        {children}
      </div>
    </section>
  );
}

function Card({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-bg-panel p-4 shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-1.5 text-text-faint text-[10px] uppercase tracking-[0.1em] font-medium mb-2.5">
        <Icon size={11} />
        {label}
      </div>
      {children}
    </div>
  );
}
