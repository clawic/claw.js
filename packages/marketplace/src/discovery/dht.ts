// Iroh-backed DHT client for marketplace/2.0.0.
//
// Iroh exposes a Kademlia DHT (the same one used by iroh-blobs / iroh-gossip).
// To stay portable and avoid forcing every consumer to pull the iroh node
// crate, we abstract over an `IrohAdapter` interface: tests use an in-memory
// adapter, the daemon uses one backed by `@n0-computer/iroh` (or any binding
// that exposes the same surface).

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "../cbor.ts";
import type { Intent } from "../wire.ts";
import { discoveryKey, intentFromCborMap, intentToCborMap } from "../wire.ts";
import { InProcessBroker, publishIntent, queryByIntentVertical } from "./brokers.ts";

export interface DhtClient {
  publish(intent: Intent): Promise<void>;
  query(opts: { vertical: string; geoZone?: string; tag?: string; priceBand?: number; limit?: number }): Promise<Intent[]>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

// ---- in-memory DHT used for tests ----

export class InMemoryDht implements DhtClient {
  constructor(private readonly broker: InProcessBroker = new InProcessBroker()) {}
  async publish(intent: Intent): Promise<void> { publishIntent(this.broker, intent); }
  async query(opts: { vertical: string; geoZone?: string; tag?: string; priceBand?: number; limit?: number }): Promise<Intent[]> {
    return queryByIntentVertical(this.broker, opts);
  }
  underlying(): InProcessBroker { return this.broker; }
}

// ---- Iroh-backed DHT ----

/**
 * Minimal surface the DHT client needs from an Iroh node. The daemon binds
 * this to `@n0-computer/iroh` when the napi binding is available; tests can
 * use an in-memory implementation.
 */
export interface IrohAdapter {
  /** Store `value` indexed by `discoveryKey`. */
  put(discoveryKey: Uint8Array, value: Uint8Array, ttlSeconds: number): Promise<void>;
  /** Look up all values stored under `discoveryKey`. */
  get(discoveryKey: Uint8Array, limit: number): Promise<Uint8Array[]>;
  /** Open / close the underlying Iroh node. Optional for in-memory adapters. */
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

export interface IrohDhtOptions {
  adapter: IrohAdapter;
  defaultTtlSeconds?: number;
}

export class IrohDht implements DhtClient {
  constructor(private readonly opts: IrohDhtOptions) {}

  async start(): Promise<void> { await this.opts.adapter.start?.(); }
  async stop(): Promise<void> { await this.opts.adapter.stop?.(); }

  async publish(intent: Intent): Promise<void> {
    const key = discoveryKey({
      vertical: intent.vertical,
      geoZone: (intent.fields as Record<string, CborValue>).geo_zone as string | undefined,
      tag: extractTag(intent),
      priceBand: (intent.fields as Record<string, CborValue>).price_band as number | undefined,
    });
    const wire = encodeCanonicalCbor(intentToCborMap(intent));
    const ttl = Math.max(60, intent.expiresAt - Math.floor(Date.now() / 1000));
    const cap = this.opts.defaultTtlSeconds ?? ttl;
    await this.opts.adapter.put(key, wire, Math.min(ttl, cap));
  }

  async query(opts: { vertical: string; geoZone?: string; tag?: string; priceBand?: number; limit?: number }): Promise<Intent[]> {
    const key = discoveryKey(opts);
    const values = await this.opts.adapter.get(key, opts.limit ?? 100);
    const intents: Intent[] = [];
    for (const v of values) {
      try {
        const { intent } = intentFromCborMap(decodeCanonicalCbor(v));
        intents.push(intent);
      } catch {
        /* malformed entry; skip */
      }
    }
    return intents;
  }
}

function extractTag(intent: Intent): string | undefined {
  const f = intent.fields as Record<string, CborValue>;
  return (f.tag as string | undefined)
      ?? (f.transaction as string | undefined)
      ?? (f.category as string | undefined);
}

// ---- in-memory IrohAdapter (for tests) ----

export class InMemoryIrohAdapter implements IrohAdapter {
  private store = new Map<string, { value: Uint8Array; expiresAt: number }[]>();
  async put(discoveryKey: Uint8Array, value: Uint8Array, ttlSeconds: number): Promise<void> {
    const k = Buffer.from(discoveryKey).toString("hex");
    const list = this.store.get(k) ?? [];
    list.push({ value, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds });
    this.store.set(k, list);
  }
  async get(discoveryKey: Uint8Array, limit: number): Promise<Uint8Array[]> {
    const now = Math.floor(Date.now() / 1000);
    const list = this.store.get(Buffer.from(discoveryKey).toString("hex")) ?? [];
    return list.filter((e) => e.expiresAt > now).slice(0, limit).map((e) => e.value);
  }
}
