import type { WebSocket } from "ws";

import type { AuthPrincipal } from "./auth.ts";
import type { FeedChangeEvent } from "../shared/types.ts";

interface ClientState {
  socket: WebSocket;
  principal: AuthPrincipal;
}

export class FeedRealtimeHub {
  private readonly clients = new Set<ClientState>();

  attach(socket: WebSocket, principal: AuthPrincipal): void {
    const client: ClientState = { socket, principal };
    this.clients.add(client);

    socket.on("message", (buffer) => {
      try {
        const payload = JSON.parse(buffer.toString()) as { type?: string };
        if (payload.type === "subscribe") {
          socket.send(JSON.stringify({ type: "subscribed" }));
        } else {
          socket.send(JSON.stringify({ type: "error", message: "Unknown message type." }));
        }
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

  broadcast(event: FeedChangeEvent): void {
    const payload = JSON.stringify({ type: "event", event });
    for (const client of this.clients) {
      client.socket.send(payload);
    }
  }
}
