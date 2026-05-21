/**
 * Browser WebSocket client for the database real-time hub.
 * Subscribes to collection changes and dispatches record events.
 */

const DEFAULT_CONNECTION_PATH = "/api/realtime-token";
const HEALTHY_PONG_WINDOW_MS = 45_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_DELAY_MS = 3_000;

export type RealtimeEventType = "record.created" | "record.updated" | "record.deleted";

export interface RealtimeEvent {
  type: RealtimeEventType;
  namespaceId: string;
  collectionName: string;
  recordId: string;
  record?: Record<string, unknown>;
  at: string;
}

export interface RealtimeConnection {
  url: string;
  namespaceId: string;
}

export interface RealtimeStatus {
  state: "idle" | "connecting" | "open" | "healthy" | "degraded" | "closed" | "error";
  isHealthy: boolean;
  expectedCollections: string[];
  subscribedCollections: string[];
  lastPongAt: number | null;
  error?: string;
}

type Listener = (event: RealtimeEvent) => void;
type StatusListener = (status: RealtimeStatus) => void;

type RealtimeServerMessage =
  | { type: "hello"; at?: string }
  | { type: "pong"; at?: string }
  | { type: "subscribed"; namespaceId?: string; collectionName?: string }
  | { type: "unsubscribed"; namespaceId?: string; collectionName?: string }
  | { type: "error"; message?: string }
  | { type: "event"; event?: unknown };

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private subscriptions = new Set<string>();
  private acknowledgedSubscriptions = new Set<string>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private namespace = "main";
  private connectionPath: string;
  private connecting = false;
  private shouldReconnect = true;
  private refreshConnectionOnNextOpen = false;
  private status: RealtimeStatus = {
    state: "idle",
    isHealthy: false,
    expectedCollections: [],
    subscribedCollections: [],
    lastPongAt: null,
  };

  constructor(opts?: { connectionPath?: string }) {
    this.connectionPath = opts?.connectionPath ?? DEFAULT_CONNECTION_PATH;
  }

  connect(): void {
    if (this.ws || this.connecting) return;
    this.shouldReconnect = true;
    void this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    this.clearHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.acknowledgedSubscriptions.clear();
    this.publishStatus("closed");
  }

  subscribe(collectionName: string): void {
    this.subscriptions.add(collectionName);
    this.publishStatus(this.status.state);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(collectionName);
    }
  }

  unsubscribe(collectionName: string): void {
    this.subscriptions.delete(collectionName);
    this.acknowledgedSubscriptions.delete(collectionName);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "unsubscribe",
          namespaceId: this.namespace,
          collectionName,
        }),
      );
    }
    this.publishStatus(this.status.state);
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

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  snapshotStatus(): RealtimeStatus {
    return this.status;
  }

  private async open(): Promise<void> {
    this.connecting = true;
    this.publishStatus("connecting");
    try {
      const connection = await this.loadConnection();
      this.refreshConnectionOnNextOpen = false;
      if (!this.shouldReconnect) return;
      this.namespace = connection.namespaceId;
      const ws = new WebSocket(connection.url);
      this.ws = ws;

      ws.onopen = () => {
        this.acknowledgedSubscriptions.clear();
        this.publishStatus("open");
      };

      ws.onmessage = (e) => {
        this.handleMessage(e.data);
      };

      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.clearHeartbeat();
        this.acknowledgedSubscriptions.clear();
        this.refreshConnectionOnNextOpen = true;
        this.publishStatus("closed");
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        this.refreshConnectionOnNextOpen = true;
        this.publishStatus("error", "Realtime socket error.");
        ws.close();
      };
    } catch (error) {
      this.publishStatus(
        "error",
        error instanceof Error ? error.message : "Realtime connection failed.",
      );
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private async loadConnection(): Promise<RealtimeConnection> {
    const path = this.refreshConnectionOnNextOpen
      ? withSearchParam(this.connectionPath, "refresh", "1")
      : this.connectionPath;
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Realtime token request failed: ${response.status}`);
    }
    const data = (await response.json()) as Partial<RealtimeConnection>;
    if (!data.url || !data.namespaceId) {
      throw new Error("Realtime token response was incomplete.");
    }
    return {
      url: data.url,
      namespaceId: data.namespaceId,
    };
  }

  private handleMessage(data: unknown): void {
    let payload: RealtimeServerMessage;
    try {
      payload = JSON.parse(String(data)) as RealtimeServerMessage;
    } catch {
      return;
    }

    if (payload.type === "hello") {
      for (const collection of this.subscriptions) {
        this.sendSubscribe(collection);
      }
      this.sendPing();
      this.startHeartbeat();
      this.publishStatus(this.status.state);
      return;
    }

    if (payload.type === "pong") {
      this.publishStatus(this.status.state, undefined, Date.now());
      return;
    }

    if (payload.type === "subscribed" && payload.collectionName) {
      this.acknowledgedSubscriptions.add(payload.collectionName);
      this.publishStatus(this.status.state);
      return;
    }

    if (payload.type === "unsubscribed" && payload.collectionName) {
      this.acknowledgedSubscriptions.delete(payload.collectionName);
      this.publishStatus(this.status.state);
      return;
    }

    if (payload.type === "error") {
      this.publishStatus("degraded", payload.message ?? "Realtime hub error.");
      return;
    }

    if (payload.type === "event" && isRealtimeEvent(payload.event)) {
      this.dispatch(payload.event);
    }
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

  private sendPing(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "ping" }));
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
      this.publishStatus(this.status.state);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat(): void {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearReconnect(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private dispatch(event: RealtimeEvent): void {
    const collectionListeners = this.listeners.get(event.collectionName);
    if (collectionListeners) {
      for (const listener of collectionListeners) listener(event);
    }
    for (const listener of this.globalListeners) listener(event);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private publishStatus(
    state: RealtimeStatus["state"],
    error?: string,
    lastPongAt = this.status.lastPongAt,
  ): void {
    const expectedCollections = [...this.subscriptions].sort();
    const subscribedCollections = [...this.acknowledgedSubscriptions].sort();
    const allSubscribed = expectedCollections.every((collection) =>
      this.acknowledgedSubscriptions.has(collection),
    );
    const pongIsFresh =
      lastPongAt !== null && Date.now() - lastPongAt <= HEALTHY_PONG_WINDOW_MS;
    const socketIsOpen = this.ws?.readyState === WebSocket.OPEN;
    const isHealthy = socketIsOpen && allSubscribed && pongIsFresh;
    const nextState = isHealthy ? "healthy" : state === "healthy" ? "degraded" : state;

    this.status = {
      state: nextState,
      isHealthy,
      expectedCollections,
      subscribedCollections,
      lastPongAt,
      ...(error ? { error } : {}),
    };

    for (const listener of this.statusListeners) listener(this.status);
  }
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RealtimeEvent>;
  return (
    (event.type === "record.created" ||
      event.type === "record.updated" ||
      event.type === "record.deleted") &&
    typeof event.namespaceId === "string" &&
    typeof event.collectionName === "string" &&
    typeof event.recordId === "string" &&
    typeof event.at === "string"
  );
}

function withSearchParam(path: string, key: string, value: string): string {
  const url = new URL(path, window.location.href);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
