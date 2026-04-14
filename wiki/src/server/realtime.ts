import type { WebSocket } from "ws";

import type { AuthPrincipal } from "./auth.ts";
import type { WikiChangeEvent, WikiOperation } from "../shared/types.ts";

interface Subscription {
  spaceId: string;
}

interface ClientState {
  socket: WebSocket;
  principal: AuthPrincipal;
  subscriptions: Subscription[];
}

function hasRealtimePermission(principal: AuthPrincipal, spaceId: string): boolean {
  if (principal.kind === "admin") return true;
  return !principal.spaceId || principal.spaceId === spaceId;
}

export class WikiRealtimeHub {
  private readonly clients = new Set<ClientState>();

  attach(socket: WebSocket, principal: AuthPrincipal): void {
    const client: ClientState = { socket, principal, subscriptions: [] };
    this.clients.add(client);

    socket.on("message", (buffer) => {
      try {
        const payload = JSON.parse(buffer.toString()) as {
          type?: string;
          spaceId?: string;
        };
        if (payload.type !== "subscribe" || !payload.spaceId) {
          socket.send(JSON.stringify({ type: "error", message: "Invalid subscription payload." }));
          return;
        }
        if (!hasRealtimePermission(principal, payload.spaceId)) {
          socket.send(JSON.stringify({ type: "error", message: "Forbidden" }));
          return;
        }
        client.subscriptions = client.subscriptions.filter(
          (entry) => entry.spaceId !== payload.spaceId,
        );
        client.subscriptions.push({ spaceId: payload.spaceId });
        socket.send(JSON.stringify({ type: "subscribed", spaceId: payload.spaceId }));
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      }
    });

    socket.on("close", () => {
      this.clients.delete(client);
    });

    socket.on("error", () => {
      this.clients.delete(client);
    });
  }

  broadcast(event: WikiChangeEvent): void {
    const payload = JSON.stringify({ type: "event", event });
    for (const client of this.clients) {
      const matches = client.subscriptions.some((entry) => entry.spaceId === event.spaceId);
      if (!matches) continue;
      if (!hasRealtimePermission(client.principal, event.spaceId)) continue;
      client.socket.send(payload);
    }
  }
}
