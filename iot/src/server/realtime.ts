import type { FastifyReply } from "fastify";

export interface IotEventEnvelope {
  id: string;
  homeId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface ClientRecord {
  homeId: string;
  reply: FastifyReply;
}

export class IotRealtimeHub {
  private readonly clients = new Set<ClientRecord>();

  attach(homeId: string, reply: FastifyReply): void {
    const client = { homeId, reply };
    this.clients.add(client);
    reply.raw.on("close", () => {
      this.clients.delete(client);
    });
  }

  broadcast(event: IotEventEnvelope): void {
    const chunk = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      if (client.homeId !== event.homeId) continue;
      client.reply.raw.write(chunk);
    }
  }
}
