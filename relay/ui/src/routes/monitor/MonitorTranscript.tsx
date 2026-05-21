import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ActiveSession } from "./useMonitorStream";

const BOTTOM_STICKY_PX = 48;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_STICKY_PX;
}

export function MonitorTranscript({ session }: { session: ActiveSession | null }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lines = useMemo(() => splitTranscriptLines(session?.fullText ?? ""), [session?.fullText]);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 22,
    getItemKey: (index) => index,
    overscan: 16,
  });

  useEffect(() => {
    if (!stickToBottomRef.current || !scrollerRef.current) return;
    requestAnimationFrame(() => {
      if (stickToBottomRef.current && scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    });
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
        onScroll={(event) => {
          stickToBottomRef.current = isNearBottom(event.currentTarget);
        }}
        className="flex-1 min-h-0 overflow-y-auto p-4 whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-text"
      >
        {lines.length > 0
          ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const line = lines[item.index] ?? "";
                const isLast = item.index === lines.length - 1;
                return (
                  <div
                    key={item.key}
                    ref={virtualizer.measureElement}
                    data-index={item.index}
                    data-testid="relay-monitor-transcript-line"
                    className="absolute left-0 top-0 w-full min-h-[1.5em]"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    {line}
                    {isLast && session.isStreaming ? <span className="opacity-50">&nbsp;▍</span> : null}
                  </div>
                );
              })}
            </div>
          )
          : session.isStreaming
            ? <span className="text-text-muted">waiting for tokens…</span>
            : <span className="text-text-muted">no live tokens for this session yet. New deltas will appear here as the agent writes.</span>}
      </div>
    </section>
  );
}

function splitTranscriptLines(text: string): string[] {
  if (!text) return [];
  return text.split("\n");
}
