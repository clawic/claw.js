import { NavLink, useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { useState } from "react";
import type { MonitorEntry, MonitorGroup } from "../lib/types";
import { GROUP_LABELS, GROUP_ORDER } from "../lib/types";
import { StatusDot } from "./StatusDot";
import { HeartbeatBar } from "./HeartbeatBar";

interface Props {
  monitors: MonitorEntry[];
  summary: { up: number; down: number; degraded: number; pending: number; total: number } | null;
}

export function Sidebar({ monitors, summary }: Props) {
  const [filter, setFilter] = useState("");
  const location = useLocation();

  const filtered = filter
    ? monitors.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
    : monitors;

  const grouped = GROUP_ORDER.reduce<Record<string, MonitorEntry[]>>((acc, group) => {
    const items = filtered.filter((m) => m.group === group);
    if (items.length > 0) acc[group] = items;
    return acc;
  }, {});

  return (
    <aside className="w-[320px] shrink-0 h-full bg-bg-sidebar flex flex-col overflow-hidden border-r border-white/5">
      {/* Header with logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <img src="/logo.png" alt="" width={32} height={32} className="rounded-lg" />
          <div>
            <div className="font-bold text-[16px] text-text leading-tight">Monitor</div>
            <div className="text-[11px] text-text-faint">ClawJS</div>
          </div>
          {summary && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="flex items-center gap-1 text-[11px] text-green font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green" />
                {summary.up}
              </span>
              {summary.down > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-red font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red" />
                  {summary.down}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-bg-input border border-white/8 rounded-lg pl-9 pr-3 py-2 text-[13px] text-text placeholder:text-text-faint outline-none focus:border-green/30 transition-colors"
          />
        </div>
      </div>

      {/* Monitor list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="mb-1">
            <div className="text-[10px] font-bold text-text-faint uppercase tracking-[0.1em] px-2 pt-3 pb-1.5">
              {GROUP_LABELS[group as MonitorGroup]}
            </div>
            {items.map((monitor) => {
              const isActive = location.pathname === `/monitor/${encodeURIComponent(monitor.id)}`;
              return (
                <NavLink
                  key={monitor.id}
                  to={`/monitor/${encodeURIComponent(monitor.id)}`}
                  className={`flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] transition-all mb-0.5 ${
                    isActive
                      ? "bg-white/8 text-text shadow-[0_1px_4px_rgba(0,0,0,0.2)]"
                      : "text-text-muted hover:bg-white/4 hover:text-text"
                  }`}
                >
                  <StatusDot status={monitor.latestStatus} size={8} pulse={isActive} />
                  <span className="flex-1 truncate font-medium tracking-[0.01em]">
                    {monitor.name}
                  </span>
                  <div className="shrink-0 w-[56px]">
                    <HeartbeatBar
                      heartbeats={monitor.heartbeats}
                      barWidth={2}
                      barHeight={10}
                      gap={1}
                      maxBars={18}
                      showTooltip={false}
                    />
                  </div>
                </NavLink>
              );
            })}
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-text-faint text-xs text-center mt-10">
            {monitors.length === 0 ? "No monitors configured." : "No matches."}
          </p>
        )}
      </div>
    </aside>
  );
}
