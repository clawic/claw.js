import { clawApiPath } from "@clawjs/core";
import { useEffect, useRef } from "react";
import { api } from "../api/client";

export function useRealtime(onEvent: (event: Record<string, unknown>) => void) {
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    const token = api.getToken();
    if (!token) return;

    let es: EventSource | null = null;
    try {
      // Use SSE for simplicity
      es = new EventSource(clawApiPath(`events/stream`));
      // SSE requires auth header which EventSource doesn't support.
      // Fall back to WebSocket.
      es.close();
    } catch { /* ignore */ }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/v1/events/ws`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        cbRef.current(data);
      } catch { /* ignore malformed */ }
    };

    return () => {
      ws.close();
    };
  }, []);
}
