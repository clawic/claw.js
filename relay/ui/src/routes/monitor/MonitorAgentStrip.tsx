import type { MonitorAgentSnapshot } from "./useMonitorStream";

export function MonitorAgentStrip({ agents }: { agents: Record<string, MonitorAgentSnapshot> }) {
  const list = Object.values(agents);
  if (list.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] text-text-muted border-b border-border bg-bg-panel">
        No agents connected.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-bg-panel overflow-x-auto">
      {list
        .sort((a, b) => Number(b.status === "online") - Number(a.status === "online") || a.agentId.localeCompare(b.agentId))
        .map((a) => {
          const online = a.status === "online";
          return (
            <div
              key={a.agentId}
              title={`${a.agentId} ${online ? "online" : "offline"}${a.version ? " v" + a.version : ""}`}
              className="flex items-center gap-1.5 text-[11px] whitespace-nowrap"
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${online ? "bg-green" : "bg-red"}`}
              />
              <span className={online ? "text-text" : "text-text-muted"}>
                {a.displayName || a.agentId}
              </span>
            </div>
          );
        })}
    </div>
  );
}
