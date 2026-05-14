// Feed routes under the registered public API prefix.
//
// Reads blocks from peers the owner follows (members of any group), filters
// by vertical / keywords / timestamp, and emits a stream of new entries over
// the registered feed stream.

import type { FastifyInstance } from "fastify";
import { clawPublicApiPrefix } from "@clawjs/core";
import type { CborValue } from "@clawjs/marketplace/cbor";
import type { Block } from "@clawjs/profile";

const INDEX_API = clawPublicApiPrefix;

export interface FeedEntry {
  blockId: Uint8Array;
  vertical: string;
  ownerRootPubkey: Uint8Array;
  ownerHandle: { alias: string; fingerprint: string };
  publishedAt: number;
  preview: Record<string, unknown>;
}

export interface FeedDeps {
  list(filter: { vertical?: string; groupId?: string; keywords?: string; limit?: number; offset?: number }): FeedEntry[];
  subscribe(cb: (entry: FeedEntry) => void): () => void;
}

export function registerFeedRoutes(app: FastifyInstance, deps: FeedDeps): void {
  app.get(`${INDEX_API}/feed`, async (req) => {
    const q = (req.query ?? {}) as { vertical?: string; groupId?: string; keywords?: string; limit?: string; offset?: string };
    const limit = q.limit ? Number(q.limit) : 50;
    const offset = q.offset ? Number(q.offset) : 0;
    const entries = deps.list({
      vertical: q.vertical, groupId: q.groupId, keywords: q.keywords, limit, offset,
    });
    return { entries: entries.map(serializeEntry) };
  });

  // The websocket route runs inside the daemon's existing `websocket`
  // registration; this helper exposes the inbound handler so app.ts can wire
  // it from its own `wsApp.get` call.
  (app as unknown as { decorate(name: string, value: unknown): void })
    .decorate("__clawixFeedAttach", (socket: { send: (data: string) => void; on: (event: string, cb: () => void) => void }) => {
      const off = deps.subscribe((entry) => {
        try { socket.send(JSON.stringify({ kind: "feed.entry", entry: serializeEntry(entry) })); }
        catch { /* socket likely closed */ }
      });
      socket.on("close", () => off());
    });
}

export function makeFeedEntryFromBlock(block: Block, owner: { rootPubkey: Uint8Array; handle: { alias: string; fingerprint: string } }): FeedEntry {
  return {
    blockId: block.blockId,
    vertical: block.vertical,
    ownerRootPubkey: owner.rootPubkey,
    ownerHandle: owner.handle,
    publishedAt: block.updatedAt,
    preview: previewFor(block),
  };
}

function previewFor(block: Block): Record<string, unknown> {
  // Light projection for feed cards: a few fields known to most verticals.
  const src = (block.overlay ?? block.content ?? {}) as Record<string, CborValue>;
  const keys = ["title", "display_name", "headline", "body", "text", "summary"];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  if (src.photos_blurred) out.photos_blurred = src.photos_blurred;
  if (src.photos) out.photos = src.photos;
  if (src.geo_zone) out.geo_zone = src.geo_zone;
  return out;
}

function serializeEntry(e: FeedEntry): Record<string, unknown> {
  return {
    blockId: Buffer.from(e.blockId).toString("hex"),
    vertical: e.vertical,
    owner: {
      rootPubkey: Buffer.from(e.ownerRootPubkey).toString("hex"),
      handle: e.ownerHandle,
    },
    publishedAt: e.publishedAt,
    preview: e.preview,
  };
}
