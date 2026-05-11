import type { WebSocket, RawData } from "ws";
import type { IndexEvent } from "./types.ts";

interface ClientState { socket: WebSocket; authenticated: boolean; }

export class IndexRealtimeHub {
  private readonly clients = new Set<ClientState>();

  attach(socket: WebSocket, authenticated: boolean): void {
    const client: ClientState = { socket, authenticated };
    this.clients.add(client);
    try { socket.send(JSON.stringify({ type: "hello", at: new Date().toISOString() })); } catch { /* ignore */ }
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
        const payload = JSON.parse(buffer.toString()) as { type?: string };
        if (payload.type === "ping") {
          alive = true;
          try { socket.send(JSON.stringify({ type: "pong", at: new Date().toISOString() })); } catch { /* ignore */ }
        }
      } catch {
        /* ignore */
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

  broadcast(event: IndexEvent): void {
    const payload = JSON.stringify({ type: "event", event });
    for (const client of this.clients) {
      if (!client.authenticated) continue;
      try { client.socket.send(payload); } catch { /* ignore */ }
    }
  }
}
