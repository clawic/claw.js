import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, Wifi } from "lucide-react";
import { fetchMonitors, fetchSummary, runSetup } from "../lib/api";
import { StatusDot } from "../components/StatusDot";
import { HeartbeatBar } from "../components/HeartbeatBar";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { MonitorStatus } from "../lib/types";

const BADGE: Record<MonitorStatus, { bg: string; text: string; label: string }> = {
  up:       { bg: "bg-green",      text: "text-[#0f1115]", label: "Up" },
  down:     { bg: "bg-red",        text: "text-white",     label: "Down" },
  degraded: { bg: "bg-yellow",     text: "text-[#0f1115]", label: "Degraded" },
  pending:  { bg: "bg-gray",       text: "text-white",     label: "Pending" },
};

export function Dashboard() {
  const [discovering, setDiscovering] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
    refetchInterval: 30_000,
  });

  const { data: monitors = [], refetch } = useQuery({
    queryKey: ["monitors"],
    queryFn: fetchMonitors,
    refetchInterval: 30_000,
  });

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      await runSetup();
      await refetch();
    } finally {
      setDiscovering(false);
    }
  };

  const allUp = summary && summary.down === 0 && summary.degraded === 0;
  const hasDown = summary && summary.down > 0;

  return (
    <div className="p-8 max-w-[1000px] mx-auto">
      {/* Overall status */}
      {summary && summary.total > 0 && (
        <div className={`rounded-2xl p-6 mb-8 border backdrop-blur-sm ${
          hasDown
            ? "bg-red/8 border-red/15"
            : allUp
              ? "bg-green/8 border-green/15"
              : "bg-yellow/8 border-yellow/15"
        }`}>
          <div className="flex items-center gap-5">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              hasDown ? "bg-red/15" : allUp ? "bg-green/15" : "bg-yellow/15"
            }`}>
              {hasDown ? (
                <XCircle size={24} className="text-red" />
              ) : allUp ? (
                <CheckCircle size={24} className="text-green" />
              ) : (
                <AlertTriangle size={24} className="text-yellow" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-bold text-[18px] leading-tight">
                {hasDown
                  ? `${summary.down} Monitor${summary.down > 1 ? "s" : ""} Down`
                  : allUp
                    ? "All Systems Operational"
                    : `${summary.degraded} Degraded`}
              </div>
              <div className="text-[13px] text-text-muted mt-1">
                {summary.up} up, {summary.degraded} degraded, {summary.down} down
                <span className="mx-1.5 text-text-faint">|</span>
                Avg ping {summary.avgResponseTimeMs}ms
              </div>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold tracking-tight ${
                summary.overallUptimePercent >= 99.5 ? "text-green"
                : summary.overallUptimePercent >= 95 ? "text-yellow"
                : "text-red"
              }`}>
                {summary.overallUptimePercent.toFixed(1)}%
              </div>
              <div className="text-[10px] text-text-faint uppercase tracking-widest font-medium mt-0.5">
                Overall Uptime
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions row */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[11px] font-bold text-text-faint uppercase tracking-[0.12em]">
          All Monitors
          {summary ? ` (${summary.total})` : ""}
        </h2>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-text-muted border border-white/8 hover:bg-white/5 hover:text-text transition-all disabled:opacity-40"
        >
          <RefreshCw size={11} className={discovering ? "animate-spin" : ""} />
          Discover
        </button>
      </div>

      {/* Monitor cards */}
      {monitors.length > 0 && (
        <div className="space-y-1.5">
          {monitors.map((m) => {
            const badge = BADGE[m.latestStatus];
            return (
              <Link
                key={m.id}
                to={`/monitor/${encodeURIComponent(m.id)}`}
                className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/6 bg-bg-panel hover:bg-bg-card hover:border-white/10 transition-all group shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              >
                <StatusDot status={m.latestStatus} size={10} pulse />

                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-[14px] text-text group-hover:text-green transition-colors truncate block leading-tight">
                    {m.name}
                  </span>
                </div>

                <span className={`px-2.5 py-[3px] rounded-md text-[10px] font-bold tracking-wider ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </span>

                <span className={`text-[12px] font-bold w-[50px] text-right ${
                  m.uptimePercent24h >= 99.5 ? "text-green"
                  : m.uptimePercent24h >= 95 ? "text-yellow"
                  : "text-red"
                }`}>
                  {m.uptimePercent24h.toFixed(1)}%
                </span>

                <span className="text-[12px] text-text-faint w-[48px] text-right font-mono tabular-nums">
                  {m.latestResponseTimeMs != null ? `${m.latestResponseTimeMs}ms` : "—"}
                </span>

                <div className="w-[160px] shrink-0">
                  <HeartbeatBar
                    heartbeats={m.heartbeats}
                    barWidth={3}
                    barHeight={18}
                    gap={2}
                    maxBars={38}
                    showTooltip={false}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {monitors.length === 0 && (
        <div className="text-center py-24 rounded-2xl border border-white/5 bg-bg-panel">
          <Wifi size={36} className="mx-auto mb-4 text-text-faint opacity-30" />
          <p className="text-text-muted text-sm font-medium mb-1">No monitors configured</p>
          <p className="text-text-faint text-xs mb-5">
            Click Discover to auto-detect from the relay.
          </p>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="px-5 py-2.5 rounded-xl text-[13px] font-bold bg-green text-[#0f1115] hover:brightness-110 transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={`inline mr-1.5 -mt-px ${discovering ? "animate-spin" : ""}`} />
            Discover Monitors
          </button>
        </div>
      )}
    </div>
  );
}
