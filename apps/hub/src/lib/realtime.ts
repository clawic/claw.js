/**
 * Browser WebSocket client for the database real-time hub.
 * Subscribes to collection changes and dispatches events.
 */

const DEFAULT_WS_URL = "ws://127.0.0.1:4510/v1/realtime";
const DEFAULT_NAMESPACE = "main";

export type RealtimeEventType = "record.created" | "record.updated" | "record.deleted";

export interface RealtimeEvent {
  type: RealtimeEventType;
  namespaceId: string;
  collectionName: string;
  recordId: string;
  record?: Record<string, unknown>;
  at: string;
}

type Listener = (event: RealtimeEvent) => void;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private namespace: string;
  private url: string;

  constructor(opts?: { url?: string; namespace?: string }) {
    this.url = opts?.url ?? DEFAULT_WS_URL;
    this.namespace = opts?.namespace ?? DEFAULT_NAMESPACE;
  }

  connect(): void {
    if (this.ws) return;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      for (const collection of this.subscriptions) {
        this.sendSubscribe(collection);
      }
    };

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as RealtimeEvent;
        this.dispatch(event);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  subscribe(collectionName: string): void {
    this.subscriptions.add(collectionName);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(collectionName);
    }
  }

  unsubscribe(collectionName: string): void {
    this.subscriptions.delete(collectionName);
  }

  on(collectionName: string, listener: Listener): () => void {
    let set = this.listeners.get(collectionName);
    if (!set) {
      set = new Set();
      this.listeners.set(collectionName, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  onAny(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  private sendSubscribe(collectionName: string): void {
    this.ws?.send(
      JSON.stringify({
        type: "subscribe",
        namespaceId: this.namespace,
        collectionName,
      }),
    );
  }

  private dispatch(event: RealtimeEvent): void {
    const collectionListeners = this.listeners.get(event.collectionName);
    if (collectionListeners) {
      for (const listener of collectionListeners) listener(event);
    }
    for (const listener of this.globalListeners) listener(event);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}
