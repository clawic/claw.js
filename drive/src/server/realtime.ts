import crypto from "node:crypto";

import type { FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { clawDriveApiRoutePatterns, clawDriveApiRoutes } from "@clawjs/core";

import type {
  DriveAuthService,
  AuthPrincipal,
} from "./auth.ts";
import type { DriveStore } from "./db.ts";
import type {
  DriveRealtimeEvent,
  DriveRealtimeEventKind,
  DriveRealtimeSubscriptionFilter,
} from "../shared/types.ts";

interface Subscription {
  id: string;
  filter: DriveRealtimeSubscriptionFilter;
}

interface Client {
  socket: WebSocket;
  principal: AuthPrincipal;
  subscriptions: Map<string, Subscription>;
  lastPongAt: number;
}

export class DriveEventBus {
  private readonly clients = new Set<Client>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {}

  attach(client: Client): void {
    this.clients.add(client);
  }

  detach(client: Client): void {
    this.clients.delete(client);
  }

  emit(event: DriveRealtimeEvent): void {
    for (const client of this.clients) {
      const matched = matchAnySubscription(client.subscriptions, event);
      if (!matched) continue;
      try {
        client.socket.send(JSON.stringify({
          type: "event",
          subscriptionId: matched.id,
          event,
        }));
      } catch {
        // ignored: socket may already be closed
      }
    }
  }

  startHeartbeat(intervalMs = 30_000, timeoutMs = 90_000): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const client of this.clients) {
        if (now - client.lastPongAt > timeoutMs) {
          try { client.socket.close(); } catch { /* noop */ }
          this.clients.delete(client);
          continue;
        }
        try {
          client.socket.send(JSON.stringify({ type: "ping", timestamp: now }));
        } catch { /* noop */ }
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients) {
      try { client.socket.close(); } catch { /* noop */ }
    }
    this.clients.clear();
  }

  size(): number { return this.clients.size; }
}

function matchAnySubscription(subscriptions: Map<string, Subscription>, event: DriveRealtimeEvent): Subscription | null {
  for (const sub of subscriptions.values()) {
    if (matches(sub.filter, event)) return sub;
  }
  return null;
}

function matches(filter: DriveRealtimeSubscriptionFilter, event: DriveRealtimeEvent): boolean {
  if (filter.kinds?.length && !filter.kinds.includes(event.kind)) return false;
  if (filter.itemId !== undefined && event.itemId !== filter.itemId) return false;
  if (filter.parentId !== undefined && event.parentId !== filter.parentId) return false;
  return true;
}

export interface RegisterRealtimeOptions {
  app: FastifyInstance;
  bus: DriveEventBus;
  auth: DriveAuthService;
  store: DriveStore;
  resolvePrincipal: (token: string) => Promise<AuthPrincipal | null>;
}

export async function registerRealtime(options: RegisterRealtimeOptions): Promise<void> {
  const { app, bus, resolvePrincipal } = options;
  await app.register(websocket);

  app.get(clawDriveApiRoutePatterns.realtime, { websocket: true }, async (socket, request) => {
    // Authenticate via Authorization header or ?token= query.
    const header = request.headers.authorization;
    const tokenFromHeader = header?.toLowerCase().startsWith("bearer ")
      ? header.slice("bearer ".length).trim()
      : null;
    const url = new URL(request.url ?? clawDriveApiRoutes.realtime, "http://127.0.0.1");
    const tokenFromQuery = url.searchParams.get("token");
    const token = tokenFromHeader ?? tokenFromQuery;
    if (!token) {
      socket.send(JSON.stringify({ type: "error", error: "unauthorized" }));
      socket.close();
      return;
    }
    const principal = await resolvePrincipal(token);
    if (!principal) {
      socket.send(JSON.stringify({ type: "error", error: "unauthorized" }));
      socket.close();
      return;
    }

    const client: Client = {
      socket,
      principal,
      subscriptions: new Map(),
      lastPongAt: Date.now(),
    };
    bus.attach(client);

    socket.send(JSON.stringify({ type: "ready", principal: { kind: principal.kind } }));

    socket.on("message", (raw: Buffer | string) => {
      let message: { type?: string; subscriptionId?: string; filters?: DriveRealtimeSubscriptionFilter };
      try {
        message = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch {
        return;
      }
      if (message.type === "subscribe") {
        const id = message.subscriptionId ?? crypto.randomUUID();
        client.subscriptions.set(id, { id, filter: message.filters ?? {} });
        try {
          socket.send(JSON.stringify({ type: "subscribed", subscriptionId: id }));
        } catch { /* noop */ }
      } else if (message.type === "unsubscribe" && typeof message.subscriptionId === "string") {
        client.subscriptions.delete(message.subscriptionId);
      } else if (message.type === "pong") {
        client.lastPongAt = Date.now();
      }
    });

    socket.on("close", () => bus.detach(client));
    socket.on("error", () => bus.detach(client));
  });

  bus.startHeartbeat();
  app.addHook("onClose", async () => {
    bus.stop();
  });
}

export type { Client, Subscription };
export type { DriveRealtimeEvent, DriveRealtimeEventKind } from "../shared/types.ts";
