import type { FastifyInstance } from "fastify";

import type { CanonicalEvent } from "../../shared/types.ts";
import type { AuthService } from "../auth.ts";

interface Client {
  workspaceId: string;
  filter?: string;
  send: (data: string) => void;
}

export class RealtimeBus {
  private clients = new Set<Client>();

  emit(event: CanonicalEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.workspaceId !== event.workspace_id) continue;
      if (client.filter && !matches(event.name, client.filter)) continue;
      try {
        client.send(payload);
      } catch {
        // ignore
      }
    }
  }

  subscribe(workspaceId: string, filter: string | undefined, send: (data: string) => void): () => void {
    const client: Client = { workspaceId, filter, send };
    this.clients.add(client);
    return () => this.clients.delete(client);
  }
}

function matches(eventName: string, filter: string): boolean {
  if (filter === "*" || filter === eventName) return true;
  if (filter.endsWith(".*") && eventName.startsWith(filter.slice(0, -2) + ".")) return true;
  return false;
}

export async function registerRealtime(app: FastifyInstance, bus: RealtimeBus, auth: AuthService) {
  app.get<{ Params: { ws: string } }>("/v1/ws/:ws/realtime", { websocket: true } as never, (socket, req) => {
    const principal = auth.resolvePrincipal(req);
    const workspaceId = (req.params as { ws: string }).ws;
    const authorized =
      principal?.kind === "ephemeral_admin" ||
      ((principal?.kind === "user" || principal?.kind === "service") && principal.workspaceId === workspaceId);
    if (!authorized) {
      socket.close(4001, "unauthorized");
      return;
    }
    const filter = (req.query as { filter?: string }).filter;
    const unsubscribe = bus.subscribe(workspaceId, filter, (data) => socket.send(data));
    socket.on("close", unsubscribe);
  });
}
