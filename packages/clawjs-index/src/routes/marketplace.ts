// Marketplace routes under the registered public API prefix.
//
// Sits on top of `RemoteBrokerClient` + `FederatedBrokerClient` + `IrohDht` +
// `InMemoryGossip` — the daemon binds one or more discovery transports and
// the route layer just decides which to fan out to per call.

import type { FastifyInstance } from "fastify";
import { clawPublicApiPrefix } from "@clawjs/core";

const INDEX_API = clawPublicApiPrefix;

export interface DiscoveredIntent {
  intentId: Uint8Array;
  vertical: string;
  side: "offer" | "want";
  fields: Record<string, unknown>;
  geoZone?: string;
  tag?: string;
  priceBand?: number;
  expiresAt: number;
  ownerHandle?: { alias: string; fingerprint: string };
}

export interface ExpressInterestResult {
  capabilityId: string;
  mailboxMessageId: string;
}

export interface MarketplaceDeps {
  discoveredIntents(filter: { vertical?: string; geoZone?: string; tag?: string; priceBand?: number; limit?: number }): Promise<DiscoveredIntent[]>;
  expressInterest(input: { intentIdHex: string; bodyTemplate?: string }): Promise<ExpressInterestResult>;
  listInquiries(): { threadPeerRootPubkey: Uint8Array; blockIdHex: string; lastAt: number; status: "open" | "closed" }[];
}

export function registerMarketplaceRoutes(app: FastifyInstance, deps: MarketplaceDeps): void {
  app.get(`${INDEX_API}/marketplace/discovered-intents`, async (req) => {
    const q = (req.query ?? {}) as { vertical?: string; geoZone?: string; tag?: string; priceBand?: string; limit?: string };
    const limit = q.limit ? Number(q.limit) : 100;
    const intents = await deps.discoveredIntents({
      vertical: q.vertical, geoZone: q.geoZone, tag: q.tag,
      priceBand: q.priceBand ? Number(q.priceBand) : undefined,
      limit,
    });
    return { intents: intents.map(serializeIntent) };
  });

  app.post(`${INDEX_API}/marketplace/express-interest`, async (req, reply) => {
    const body = (req.body ?? {}) as { intentId?: string; bodyTemplate?: string };
    if (!body.intentId) return reply.code(400).send({ error: "intentId required" });
    const res = await deps.expressInterest({ intentIdHex: body.intentId, bodyTemplate: body.bodyTemplate });
    return res;
  });

  app.get(`${INDEX_API}/marketplace/inquiries`, async () => ({
    inquiries: deps.listInquiries().map((i) => ({
      threadPeerRootPubkey: Buffer.from(i.threadPeerRootPubkey).toString("hex"),
      blockId: i.blockIdHex,
      lastAt: i.lastAt,
      status: i.status,
    })),
  }));
}

function serializeIntent(i: DiscoveredIntent): Record<string, unknown> {
  return {
    intentId: Buffer.from(i.intentId).toString("hex"),
    vertical: i.vertical,
    side: i.side,
    fields: i.fields,
    geoZone: i.geoZone,
    tag: i.tag,
    priceBand: i.priceBand,
    expiresAt: i.expiresAt,
    ownerHandle: i.ownerHandle,
  };
}
