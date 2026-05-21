import { WebSocket } from "ws";
import type * as WebSocketTypes from "ws";

import type { AuthPrincipal } from "./auth.ts";
import type { DatabaseOperation, RecordChangeEvent } from "./types.ts";

interface Subscription {
  namespaceId: string;
  collectionName: string;
}

interface ClientState {
  socket: WebSocket;
  principal: AuthPrincipal;
  subscriptions: Subscription[];
  queue: string[];
  flushing: boolean;
  closed: boolean;
}

export interface RealtimeHubOptions {
  maxClients?: number;
  maxSubscriptionsPerClient?: number;
  maxQueuedMessagesPerClient?: number;
  maxBufferedBytesPerClient?: number;
}

export interface RealtimeHubMetrics {
  clients: number;
  subscriptions: number;
  queuedMessages: number;
  maxQueueDepth: number;
  rejectedClients: number;
  rejectedSubscriptions: number;
  droppedMessages: number;
  closedSlowClients: number;
}

const DEFAULT_REALTIME_LIMITS = {
  maxClients: 128,
  maxSubscriptionsPerClient: 64,
  maxQueuedMessagesPerClient: 256,
  maxBufferedBytesPerClient: 1024 * 1024,
} as const;

const CLOSE_CODES = {
  tooManyClients: 4429,
  slowClient: 4408,
} as const;

function hasRealtimePermission(
  principal: AuthPrincipal,
  namespaceId: string,
  collectionName: string,
  operation: DatabaseOperation,
): boolean {
  if (principal.kind === "admin") return true;
  return principal.namespaceId === namespaceId
    && (!principal.collectionName || principal.collectionName === collectionName)
    && principal.operations.includes(operation);
}

export class RealtimeHub {
  private readonly clients = new Set<ClientState>();
  private readonly options: Required<RealtimeHubOptions>;
  private readonly metrics = {
    maxQueueDepth: 0,
    rejectedClients: 0,
    rejectedSubscriptions: 0,
    droppedMessages: 0,
    closedSlowClients: 0,
  };

  constructor(options: RealtimeHubOptions = {}) {
    this.options = {
      maxClients: readPositiveLimit(options.maxClients, DEFAULT_REALTIME_LIMITS.maxClients),
      maxSubscriptionsPerClient: readPositiveLimit(
        options.maxSubscriptionsPerClient,
        DEFAULT_REALTIME_LIMITS.maxSubscriptionsPerClient,
      ),
      maxQueuedMessagesPerClient: readPositiveLimit(
        options.maxQueuedMessagesPerClient,
        DEFAULT_REALTIME_LIMITS.maxQueuedMessagesPerClient,
      ),
      maxBufferedBytesPerClient: readPositiveLimit(
        options.maxBufferedBytesPerClient,
        DEFAULT_REALTIME_LIMITS.maxBufferedBytesPerClient,
      ),
    };
  }

  attach(socket: WebSocket, principal: AuthPrincipal): void {
    if (this.clients.size >= this.options.maxClients) {
      this.metrics.rejectedClients += 1;
      try {
        socket.close(CLOSE_CODES.tooManyClients, "too many realtime clients");
      } catch {
        try { socket.terminate(); } catch { /* ignore */ }
      }
      return;
    }

    const client: ClientState = {
      socket,
      principal,
      subscriptions: [],
      queue: [],
      flushing: false,
      closed: false,
    };
    this.clients.add(client);

    this.enqueue(client, JSON.stringify({ type: "hello", at: new Date().toISOString() }));

    // Heartbeat: ping every 30s. Clients reply with pong; if no pong for
    // ~70s we drop the socket so a half-open TCP connection doesn't keep
    // a ghost subscription alive forever.
    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) {
        try { socket.terminate(); } catch { /* ignore */ }
        clearInterval(heartbeat);
        this.removeClient(client);
        return;
      }
      alive = false;
      try { socket.ping(); } catch { /* ignore */ }
    }, 30_000);

    socket.on("pong", () => { alive = true; });

    socket.on("message", (buffer: WebSocketTypes.RawData) => {
      try {
        const payload = JSON.parse(buffer.toString()) as {
          type?: string;
          namespaceId?: string;
          collectionName?: string;
        };
        if (payload.type === "ping") {
          alive = true;
          this.enqueue(client, JSON.stringify({ type: "pong", at: new Date().toISOString() }));
          return;
        }
        if (payload.type === "unsubscribe" && payload.namespaceId && payload.collectionName) {
          client.subscriptions = client.subscriptions.filter((entry) => !(entry.namespaceId === payload.namespaceId && entry.collectionName === payload.collectionName));
          this.enqueue(client, JSON.stringify({ type: "unsubscribed", namespaceId: payload.namespaceId, collectionName: payload.collectionName }));
          return;
        }
        if (payload.type !== "subscribe" || !payload.namespaceId || !payload.collectionName) {
          this.enqueue(client, JSON.stringify({ type: "error", message: "Invalid subscription payload." }));
          return;
        }
        if (!hasRealtimePermission(principal, payload.namespaceId, payload.collectionName, "realtime:subscribe")) {
          this.enqueue(client, JSON.stringify({ type: "error", message: "Forbidden" }));
          return;
        }
        const existing = client.subscriptions.find((entry) => entry.namespaceId === payload.namespaceId && entry.collectionName === payload.collectionName);
        if (!existing && client.subscriptions.length >= this.options.maxSubscriptionsPerClient) {
          this.metrics.rejectedSubscriptions += 1;
          this.enqueue(client, JSON.stringify({
            type: "error",
            message: "Too many realtime subscriptions.",
          }));
          return;
        }
        client.subscriptions = client.subscriptions.filter((entry) => !(entry.namespaceId === payload.namespaceId && entry.collectionName === payload.collectionName));
        client.subscriptions.push({
          namespaceId: payload.namespaceId,
          collectionName: payload.collectionName,
        });
        this.enqueue(client, JSON.stringify({ type: "subscribed", namespaceId: payload.namespaceId, collectionName: payload.collectionName }));
      } catch {
        this.enqueue(client, JSON.stringify({ type: "error", message: "Invalid JSON." }));
      }
    });

    socket.on("close", () => {
      clearInterval(heartbeat);
      this.removeClient(client);
    });

    socket.on("error", () => {
      clearInterval(heartbeat);
      this.removeClient(client);
    });
  }

  broadcast(event: RecordChangeEvent): void {
    const payload = JSON.stringify({ type: "event", event });
    for (const client of this.clients) {
      const matchesSubscription = client.subscriptions.some((entry) => entry.namespaceId === event.namespaceId && entry.collectionName === event.collectionName);
      if (!matchesSubscription) continue;
      if (!hasRealtimePermission(client.principal, event.namespaceId, event.collectionName, "realtime:subscribe")) continue;
      this.enqueue(client, payload);
    }
  }

  snapshotMetrics(): RealtimeHubMetrics {
    let subscriptions = 0;
    let queuedMessages = 0;
    for (const client of this.clients) {
      subscriptions += client.subscriptions.length;
      queuedMessages += client.queue.length;
    }
    return {
      clients: this.clients.size,
      subscriptions,
      queuedMessages,
      ...this.metrics,
    };
  }

  private enqueue(client: ClientState, payload: string): void {
    if (client.closed || client.socket.readyState !== WebSocket.OPEN) return;
    if (client.queue.length >= this.options.maxQueuedMessagesPerClient) {
      this.closeSlowClient(client);
      return;
    }
    client.queue.push(payload);
    this.metrics.maxQueueDepth = Math.max(this.metrics.maxQueueDepth, client.queue.length);
    this.flush(client);
  }

  private flush(client: ClientState): void {
    if (client.flushing || client.closed) return;
    if (client.socket.readyState !== WebSocket.OPEN) return;
    if (client.socket.bufferedAmount > this.options.maxBufferedBytesPerClient) {
      this.closeSlowClient(client);
      return;
    }
    const next = client.queue.shift();
    if (!next) return;
    client.flushing = true;
    client.socket.send(next, (error) => {
      client.flushing = false;
      if (error) {
        this.closeSlowClient(client);
        return;
      }
      this.flush(client);
    });
  }

  private closeSlowClient(client: ClientState): void {
    if (client.closed) return;
    this.metrics.droppedMessages += client.queue.length + 1;
    this.metrics.closedSlowClients += 1;
    this.removeClient(client);
    try {
      client.socket.close(CLOSE_CODES.slowClient, "slow realtime client");
    } catch {
      try { client.socket.terminate(); } catch { /* ignore */ }
    }
  }

  private removeClient(client: ClientState): void {
    if (client.closed) return;
    client.closed = true;
    client.queue.length = 0;
    client.subscriptions = [];
    this.clients.delete(client);
  }
}

function readPositiveLimit(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
