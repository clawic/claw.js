import type { RawData, WebSocket } from "ws";

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
}

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

  attach(socket: WebSocket, principal: AuthPrincipal): void {
    const client: ClientState = { socket, principal, subscriptions: [] };
    this.clients.add(client);

    socket.send(JSON.stringify({ type: "hello", at: new Date().toISOString() }));

    // Heartbeat: ping every 30s. Clients reply with pong; if no pong for
    // ~70s we drop the socket so a half-open TCP connection doesn't keep
    // a ghost subscription alive forever.
    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) {
        try { socket.terminate(); } catch { /* ignore */ }
        clearInterval(heartbeat);
        this.clients.delete(client);
        return;
      }
      alive = false;
      try { socket.ping(); } catch { /* ignore */ }
    }, 30_000);

    socket.on("pong", () => { alive = true; });

    socket.on("message", (buffer: RawData) => {
      try {
        const payload = JSON.parse(buffer.toString()) as {
          type?: string;
          namespaceId?: string;
          collectionName?: string;
        };
        if (payload.type === "ping") {
          alive = true;
          socket.send(JSON.stringify({ type: "pong", at: new Date().toISOString() }));
          return;
        }
        if (payload.type === "unsubscribe" && payload.namespaceId && payload.collectionName) {
          client.subscriptions = client.subscriptions.filter((entry) => !(entry.namespaceId === payload.namespaceId && entry.collectionName === payload.collectionName));
          socket.send(JSON.stringify({ type: "unsubscribed", namespaceId: payload.namespaceId, collectionName: payload.collectionName }));
          return;
        }
        if (payload.type !== "subscribe" || !payload.namespaceId || !payload.collectionName) {
          socket.send(JSON.stringify({ type: "error", message: "Invalid subscription payload." }));
          return;
        }
        if (!hasRealtimePermission(principal, payload.namespaceId, payload.collectionName, "realtime:subscribe")) {
          socket.send(JSON.stringify({ type: "error", message: "Forbidden" }));
          return;
        }
        client.subscriptions = client.subscriptions.filter((entry) => !(entry.namespaceId === payload.namespaceId && entry.collectionName === payload.collectionName));
        client.subscriptions.push({
          namespaceId: payload.namespaceId,
          collectionName: payload.collectionName,
        });
        socket.send(JSON.stringify({ type: "subscribed", namespaceId: payload.namespaceId, collectionName: payload.collectionName }));
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      }
    });

    socket.on("close", () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
    });

    socket.on("error", () => {
      clearInterval(heartbeat);
      this.clients.delete(client);
    });
  }

  broadcast(event: RecordChangeEvent): void {
    const payload = JSON.stringify({ type: "event", event });
    for (const client of this.clients) {
      const matchesSubscription = client.subscriptions.some((entry) => entry.namespaceId === event.namespaceId && entry.collectionName === event.collectionName);
      if (!matchesSubscription) continue;
      if (!hasRealtimePermission(client.principal, event.namespaceId, event.collectionName, "realtime:subscribe")) continue;
      client.socket.send(payload);
    }
  }
}
