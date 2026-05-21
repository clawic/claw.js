import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Send } from "lucide-react";
import { api, streamSSE } from "../../lib/api";
import { relativeTime } from "../../lib/format";

type SessionSummary = {
  sessionId: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};
type RawMessage = {
  role?: string;
  type?: string;
  content?: string;
  text?: string;
  message?: string;
};
type SessionDetail = {
  session?: { messages?: RawMessage[]; transcript?: RawMessage[] };
  messages?: RawMessage[];
  transcript?: RawMessage[];
};
type TranscriptLine = { id: string; role: "user" | "assistant"; text: string; streaming?: boolean };

function normalizeMessages(data: SessionDetail): TranscriptLine[] {
  const raw =
    data.session?.messages ??
    data.session?.transcript ??
    data.messages ??
    data.transcript ??
    [];
  return raw.map((m, index) => {
    const role = (m.role ?? (m.type === "user" ? "user" : "assistant")) as
      | "user"
      | "assistant";
    const text = m.content ?? m.text ?? m.message ?? "";
    return { id: `history-${index}`, role, text };
  });
}

const BOTTOM_STICKY_PX = 48;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_STICKY_PX;
}

export function SessionsTab({ prefix }: { prefix: string }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["sessions", prefix],
    queryFn: async () => {
      const data = await api.get<{ sessions?: SessionSummary[] } | SessionSummary[]>(
        `${prefix}/sessions`,
      );
      return Array.isArray(data) ? data : (data.sessions ?? []);
    },
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const data = await api.post<{
        session?: { sessionId?: string; id?: string };
        sessionId?: string;
        id?: string;
      }>(`${prefix}/sessions`, {});
      return data.session?.sessionId ?? data.session?.id ?? data.sessionId ?? data.id ?? null;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["sessions", prefix] });
      if (id) setActiveId(id);
    },
  });

  const detailQuery = useQuery({
    queryKey: ["session", prefix, activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const data = await api.get<SessionDetail>(`${prefix}/sessions/${activeId}`);
      return normalizeMessages(data);
    },
  });

  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const lineIdRef = useRef(0);
  const streamTextRef = useRef("");
  const streamLineIdRef = useRef<string | null>(null);
  const streamRafRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);

  const nextLineId = (prefix: string) => `${prefix}-${Date.now()}-${lineIdRef.current++}`;

  const updateStreamingLine = (text: string, streaming: boolean) => {
    const id = streamLineIdRef.current;
    if (!id) return;
    setTranscript((prev) =>
      prev.map((line) => (line.id === id ? { ...line, text, streaming } : line)),
    );
  };

  const cancelStreamingCommit = () => {
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
  };

  const scheduleStreamingCommit = () => {
    if (streamRafRef.current != null) return;
    streamRafRef.current = requestAnimationFrame(() => {
      streamRafRef.current = null;
      updateStreamingLine(streamTextRef.current, true);
    });
  };

  const flushStreamingCommit = (streaming: boolean) => {
    cancelStreamingCommit();
    updateStreamingLine(streamTextRef.current, streaming);
  };

  useEffect(() => {
    if (detailQuery.data) setTranscript(detailQuery.data);
  }, [detailQuery.data]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cancelStreamingCommit();
    };
  }, [activeId, prefix]);

  useEffect(() => {
    if (!stickToBottomRef.current || !scrollerRef.current) return;
    requestAnimationFrame(() => {
      if (stickToBottomRef.current && scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    });
  }, [transcript]);

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !activeId || sending) return;
    const userLineId = nextLineId("user");
    const assistantLineId = nextLineId("assistant");
    setInput("");
    setSending(true);
    streamTextRef.current = "";
    streamLineIdRef.current = assistantLineId;
    stickToBottomRef.current = true;
    setTranscript((prev) => [
      ...prev,
      { id: userLineId, role: "user", text },
      { id: assistantLineId, role: "assistant", text: "", streaming: true },
    ]);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const url = `${prefix}/sessions/${activeId}/stream?message=${encodeURIComponent(text)}`;
      let full = "";
      let finalText: string | null = null;
      for await (const evt of streamSSE(url, { method: "GET", signal: ctrl.signal })) {
        const data = evt.data as { delta?: string; error?: string };
        if (evt.event === "error" && data?.error) {
          finalText = `Error: ${data.error}`;
          break;
        }
        if (data?.delta) {
          full += data.delta;
          streamTextRef.current = full;
          scheduleStreamingCommit();
        }
      }
      streamTextRef.current = finalText ?? (full || "(no response)");
      flushStreamingCommit(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        flushStreamingCommit(false);
      } else {
        const message = (err as Error).message;
        streamTextRef.current = `Error: ${message}`;
        flushStreamingCommit(false);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      streamLineIdRef.current = null;
    }
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="h-full w-full grid grid-cols-[260px_1fr] gap-0 border border-border rounded overflow-hidden bg-bg">
      {/* Sidebar */}
      <aside className="flex flex-col border-r border-border bg-bg-panel min-h-0">
        <div className="flex items-center justify-between px-3 h-10 border-b border-border">
          <h2 className="text-[11px] font-semibold tracking-wide uppercase text-text-muted">
            Sessions
          </h2>
          <button
            type="button"
            onClick={() => createSession.mutate()}
            disabled={createSession.isPending}
            className="h-6 px-2 text-[11px] rounded-sm bg-text text-bg flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={11} strokeWidth={2} /> New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessionsQuery.isLoading ? (
            <div className="p-3 text-xs text-text-muted">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="p-3 text-xs text-text-muted">No sessions yet.</div>
          ) : (
            sessions.map((s) => {
              const isActive = s.sessionId === activeId;
              return (
                <button
                  key={s.sessionId}
                  type="button"
                  onClick={() => setActiveId(s.sessionId)}
                  className={[
                    "w-full text-left px-3 py-2 border-l-2 transition-colors",
                    isActive
                      ? "border-text bg-bg-hover"
                      : "border-transparent hover:bg-bg-hover",
                  ].join(" ")}
                >
                  <div className="text-xs text-text truncate">{s.title || s.sessionId}</div>
                  <div className="text-[11px] text-text-faint mt-0.5">
                    {relativeTime(s.createdAt ?? s.updatedAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Chat pane */}
      <section className="flex flex-col min-h-0 bg-bg">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
            Select or create a session.
          </div>
        ) : (
          <>
            <div
              ref={scrollerRef}
              onScroll={(event) => {
                stickToBottomRef.current = isNearBottom(event.currentTarget);
              }}
              className="flex-1 min-h-0 overflow-y-auto p-4"
            >
              {detailQuery.isLoading && transcript.length === 0 ? (
                <div className="text-xs text-text-muted">Loading messages...</div>
              ) : transcript.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
                  No messages yet. Start chatting below.
                </div>
              ) : (
                <VirtualizedTranscript lines={transcript} scrollerRef={scrollerRef} />
              )}
            </div>
            <div className="border-t border-border p-3 flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKeyDown}
                rows={1}
                placeholder="Type a message..."
                className="flex-1 resize-none min-h-[32px] max-h-[120px] px-2 py-1.5 text-[13px] bg-bg-input text-text border border-border rounded-sm outline-none focus:border-border-strong"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={sending || !input.trim()}
                className="h-8 px-3 rounded-sm bg-text text-bg text-[12px] font-medium flex items-center gap-1 hover:opacity-90 disabled:opacity-50"
              >
                <Send size={12} strokeWidth={2} />
                {sending ? "..." : "Send"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function VirtualizedTranscript({
  lines,
  scrollerRef,
}: {
  lines: TranscriptLine[];
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 64,
    getItemKey: (index) => lines[index]?.id ?? index,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        position: "relative",
      }}
    >
      {virtualItems.map((item) => {
        const line = lines[item.index];
        if (!line) return null;
        return (
          <div
            key={item.key}
            ref={virtualizer.measureElement}
            data-index={item.index}
            data-testid="relay-session-message"
            className={[
              "absolute left-0 top-0 w-full pb-2 flex",
              line.role === "user" ? "justify-end" : "justify-start",
            ].join(" ")}
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <div
              className={[
                "max-w-[80%] px-3 py-2 rounded text-[13px] leading-relaxed whitespace-pre-wrap break-words",
                line.role === "user"
                  ? "bg-text text-bg"
                  : "bg-bg-hover text-text border border-border",
              ].join(" ")}
            >
              {line.text}
              {line.streaming ? <span className="opacity-50">&nbsp;▍</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
