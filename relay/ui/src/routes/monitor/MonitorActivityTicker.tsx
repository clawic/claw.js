import type { ActivityRecord } from "./useMonitorStream";
import { relativeTime } from "../../lib/format";

export function MonitorActivityTicker({ activity }: { activity: ActivityRecord[] }) {
  if (activity.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-text-muted border-t border-border bg-bg-panel">
        No activity yet.
      </div>
    );
  }
  return (
    <div className="border-t border-border bg-bg-panel max-h-[120px] overflow-y-auto">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-text-faint sticky top-0 bg-bg-panel border-b border-border">
        Activity
      </div>
      {activity.map((a, i) => {
        const tone =
          a.status === "error"
            ? "text-red"
            : a.status === "success"
              ? "text-green"
              : "text-text-muted";
        return (
          <div
            key={(a.id ?? "") + i + a.createdAt}
            className="px-3 py-1 text-[11px] flex items-center gap-2 border-b border-border last:border-b-0"
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone === "text-red" ? "bg-red" : tone === "text-green" ? "bg-green" : "bg-text-faint"}`} />
            <span className="font-mono text-text">{a.capability}</span>
            {a.agentId ? <span className="text-text-muted">@{a.agentId}</span> : null}
            <span className="flex-1 truncate text-text-muted">{a.detail}</span>
            <span className="text-text-faint shrink-0">{relativeTime(a.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
