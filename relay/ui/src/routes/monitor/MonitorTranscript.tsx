import { useEffect, useRef } from "react";
import type { ActiveSession } from "./useMonitorStream";

export function MonitorTranscript({ session }: { session: ActiveSession | null }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [session?.fullText]);

  if (!session) {
    return (
      <section className="flex-1 flex items-center justify-center text-xs text-text-muted bg-bg">
        Pick a session on the left to watch it live.
      </section>
    );
  }

  return (
    <section className="flex flex-col min-h-0 bg-bg flex-1">
      <header className="flex items-center justify-between px-3 h-10 border-b border-border">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              session.isStreaming ? "bg-green animate-pulse" : "bg-text-faint"
            }`}
          />
          <span className="text-text">{session.agentId ?? "agent ?"}</span>
          {session.workspaceId ? (
            <span className="text-text-faint">/ {session.workspaceId}</span>
          ) : null}
          <span className="text-text-faint font-mono">· {session.sessionId.slice(0, 8)}</span>
        </div>
        <div className="text-[11px] text-text-muted">
          {session.isStreaming
            ? "escribiendo…"
            : session.endReason === "error"
              ? `error: ${session.endError ?? "?"}`
              : session.endReason
                ? session.endReason
                : "idle"}
        </div>
      </header>
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-text"
      >
        {session.fullText
          ? (
            <>
              {session.fullText}
              {session.isStreaming ? <span className="opacity-50">&nbsp;▍</span> : null}
            </>
          )
          : session.isStreaming
            ? <span className="text-text-muted">waiting for tokens…</span>
            : <span className="text-text-muted">no live tokens for this session yet. New deltas will appear here as the agent writes.</span>}
      </div>
    </section>
  );
}
