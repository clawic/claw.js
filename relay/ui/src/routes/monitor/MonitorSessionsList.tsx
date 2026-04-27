import type { ActiveSession, AttachedClient } from "./useMonitorStream";
import { relativeTime } from "../../lib/format";

export function MonitorSessionsList({
  sessions,
  attachedClients,
  selectedSessionId,
  myClientId,
  onSelect,
}: {
  sessions: Record<string, ActiveSession>;
  attachedClients: Record<string, AttachedClient>;
  selectedSessionId: string | null;
  myClientId?: string;
  onSelect: (sessionId: string) => void;
}) {
  const rows = Object.values(sessions).sort((a, b) => {
    const aActive = a.isStreaming ? 1 : 0;
    const bActive = b.isStreaming ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0);
  });

  const viewerCount: Record<string, number> = {};
  for (const c of Object.values(attachedClients)) {
    if (c.openedSessionId) {
      viewerCount[c.openedSessionId] = (viewerCount[c.openedSessionId] ?? 0) + 1;
    }
  }

  return (
    <aside className="flex flex-col border-r border-border bg-bg-panel min-h-0">
      <div className="flex items-center justify-between px-3 h-10 border-b border-border">
        <h2 className="text-[11px] font-semibold tracking-wide uppercase text-text-muted">
          Live sessions
        </h2>
        <span className="text-[11px] text-text-faint">{rows.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-3 text-xs text-text-muted">No active sessions.</div>
        ) : (
          rows.map((s) => {
            const isSelected = s.sessionId === selectedSessionId;
            const others = myClientId
              ? Object.values(attachedClients).filter(
                  (c) => c.openedSessionId === s.sessionId && c.clientId !== myClientId,
                ).length
              : viewerCount[s.sessionId] ?? 0;
            return (
              <button
                key={s.sessionId}
                type="button"
                onClick={() => onSelect(s.sessionId)}
                className={[
                  "w-full text-left px-3 py-2 border-l-2 transition-colors",
                  isSelected
                    ? "border-text bg-bg-hover"
                    : "border-transparent hover:bg-bg-hover",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      s.isStreaming ? "bg-green animate-pulse" : "bg-text-faint"
                    }`}
                  />
                  <span className="text-xs text-text truncate flex-1">
                    {s.agentId ? s.agentId : "agent ?"}
                    {s.workspaceId ? (
                      <span className="text-text-faint"> / {s.workspaceId}</span>
                    ) : null}
                  </span>
                  {others > 0 ? (
                    <span
                      className="text-[10px] text-text-faint"
                      title={`${others} other viewer${others === 1 ? "" : "s"}`}
                    >
                      +{others}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-text-muted mt-0.5 truncate font-mono">
                  {s.snippet || s.sessionId}
                </div>
                <div className="text-[10px] text-text-faint mt-0.5 flex items-center gap-2">
                  {s.isStreaming ? (
                    <span className="text-green">escribiendo…</span>
                  ) : s.endReason === "error" ? (
                    <span className="text-red">error</span>
                  ) : s.endReason === "cancelled" ? (
                    <span>cancelada</span>
                  ) : null}
                  <span>{relativeTime(s.lastEventAt ?? s.lastMessageAt)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
