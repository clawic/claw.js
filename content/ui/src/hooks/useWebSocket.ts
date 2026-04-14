import { useEffect, useRef, useState, useCallback } from "react";
import { connectEvents } from "../api/client";
import type { WsEvent, WsEventType } from "../api/types";

export type SyncStatus = "connected" | "disconnected" | "reconnecting";

type EventHandler = (e: WsEvent) => void;

let globalDisconnect: (() => void) | null = null;
let globalStatus: SyncStatus = "disconnected";
const listeners = new Set<EventHandler>();
const statusListeners = new Set<(s: SyncStatus) => void>();

function ensureConnected() {
  if (globalDisconnect) return;
  globalDisconnect = connectEvents(
    (e) => { for (const fn of listeners) fn(e); },
    (s) => { globalStatus = s; for (const fn of statusListeners) fn(s); },
  );
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(globalStatus);

  useEffect(() => {
    ensureConnected();
    statusListeners.add(setStatus);
    return () => { statusListeners.delete(setStatus); };
  }, []);

  return status;
}

export function useRealtimeRevalidation(eventTypes: WsEventType[], revalidate: () => void) {
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;

  const handler = useCallback((e: WsEvent) => {
    if (eventTypes.includes(e.type)) {
      revalidateRef.current();
    }
  }, [eventTypes]);

  useEffect(() => {
    ensureConnected();
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, [handler]);
}
