// In-process broker for mp/1.0.0 Phase 1 tests, plus a thin client for the
// real federated broker that will land in Phase 4.

import { encodeCanonicalCbor, decodeCanonicalCbor, type CborValue } from "../cbor.ts";
import {
  buildEnvelope, decodeEnvelope, encodeEnvelope,
  intentFromCborMap, intentToCborMap, type Envelope, type Intent,
  discoveryKey,
} from "../wire.ts";
import { blake3Hash } from "../identity.ts";

// ---- in-process broker (Phase 1) ----

interface StoredIntent {
  intent: Intent;
  envelope: Envelope;
  storedAt: number;
  expiresAt: number;
}

export class InProcessBroker {
  private byKey = new Map<string, Map<string, StoredIntent>>();   // discoveryKey hex -> intentId hex -> entry
  private byId = new Map<string, StoredIntent>();                  // intentId hex -> entry
  private subscribers: Array<(event: { kind: "publish"; intent: Intent }) => void> = [];

  publish(envelope: Envelope, opts: { keyForIntent?: (intent: Intent) => Uint8Array } = {}): void {
    if (envelope.kind !== "publish_intent") {
      throw new Error(`broker: refuses non-publish envelope (kind=${envelope.kind})`);
    }
    const payload = envelope.payload as Record<string, CborValue>;
    const intentMap = payload.intent as CborValue;
    if (!intentMap) throw new Error("broker: publish_intent without intent payload");
    const { intent } = intentFromCborMap(intentMap);
    if (intent.expiresAt * 1000 < Date.now()) {
      throw new Error("broker: refuses already-expired intent");
    }
    const f = intent.fields as Record<string, CborValue>;
    const fallbackTag = (f.tag as string | undefined)
      ?? (f.transaction as string | undefined)
      ?? (f.category as string | undefined)
      ?? (f.activity_kind as string | undefined);
    const dKey = opts.keyForIntent
      ? opts.keyForIntent(intent)
      : discoveryKey({
          vertical: intent.vertical,
          geoZone: f.geo_zone as string | undefined,
          tag: fallbackTag,
          priceBand: f.price_band as number | undefined,
        });
    const dKeyHex = toHex(dKey);
    const idHex = toHex(intent.intentId);
    let bucket = this.byKey.get(dKeyHex);
    if (!bucket) { bucket = new Map(); this.byKey.set(dKeyHex, bucket); }
    const entry: StoredIntent = {
      intent, envelope,
      storedAt: Math.floor(Date.now() / 1000),
      expiresAt: intent.expiresAt,
    };
    bucket.set(idHex, entry);
    this.byId.set(idHex, entry);
    for (const sub of this.subscribers) sub({ kind: "publish", intent });
  }

  query(input: {
    discoveryKey: Uint8Array;
    limit?: number;
  }): Intent[] {
    const dKeyHex = toHex(input.discoveryKey);
    const bucket = this.byKey.get(dKeyHex);
    if (!bucket) return [];
    const now = Math.floor(Date.now() / 1000);
    const out: Intent[] = [];
    for (const entry of bucket.values()) {
      if (entry.expiresAt < now) continue;
      out.push(entry.intent);
      if (input.limit && out.length >= input.limit) break;
    }
    return out;
  }

  byIntentId(intentId: Uint8Array): Intent | null {
    const entry = this.byId.get(toHex(intentId));
    return entry ? entry.intent : null;
  }

  subscribe(fn: (event: { kind: "publish"; intent: Intent }) => void): () => void {
    this.subscribers.push(fn);
    return () => { this.subscribers = this.subscribers.filter((f) => f !== fn); };
  }

  size(): number {
    return this.byId.size;
  }
}

function toHex(buf: Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

// ---- broker hello / federation discovery ----

export interface BrokerHello {
  brokerPubkey: Uint8Array;
  endpoints: string[];
  verticals: string[];
  policies?: {
    proofOfWorkTarget?: number;
    depositRequired?: boolean;
    acceptsAnonymous?: boolean;
  };
  signature?: Uint8Array;
}

export function encodeBrokerHello(input: BrokerHello): Uint8Array {
  const obj: Record<string, CborValue> = {
    broker_pubkey: input.brokerPubkey,
    endpoints: input.endpoints,
    verticals: input.verticals,
    policies: {
      proof_of_work_target: input.policies?.proofOfWorkTarget ?? 0,
      deposit_required: input.policies?.depositRequired ?? false,
      accepts_anonymous: input.policies?.acceptsAnonymous ?? true,
    },
  };
  if (input.signature) obj.signature = input.signature;
  return encodeCanonicalCbor(obj);
}

// ---- helpers ----

export function publishIntent(broker: InProcessBroker, intent: Intent): void {
  const envelope = buildEnvelope({
    kind: "publish_intent",
    payload: { intent: intentToCborMap(intent) },
    features: [`vertical.${intent.vertical.replace("/", ".")}`],
  });
  broker.publish(envelope);
}

export function queryByIntentVertical(broker: InProcessBroker, opts: {
  vertical: string;
  geoZone?: string;
  tag?: string;
  priceBand?: number;
  limit?: number;
}): Intent[] {
  const key = discoveryKey({
    vertical: opts.vertical,
    geoZone: opts.geoZone,
    tag: opts.tag,
    priceBand: opts.priceBand,
  });
  return broker.query({ discoveryKey: key, limit: opts.limit });
}

export { encodeEnvelope, decodeEnvelope };

// ---- federated HTTP broker client ----
//
// `RemoteBrokerClient` lets a Profile daemon publish to and query a remote
// broker over plain HTTP. The broker accepts CBOR-encoded envelopes on
// `POST /mp/publish` and serves an array of matching intents on
// `POST /mp/query` keyed by `discovery_key`.
//
// Servers can run anywhere — a community broker, a self-host on a friend's
// machine, a NAT-piercing relay — but they speak the same protocol and a
// daemon can talk to multiple in parallel.

export interface RemoteBrokerOptions {
  baseUrl: string;                      // e.g. "https://broker.example.org"
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
  headers?: Record<string, string>;
}

export interface RemoteBrokerHealth {
  ok: boolean;
  protocol?: string;
  verticals?: string[];
  intentCount?: number;
}

export class RemoteBrokerClient {
  constructor(private readonly opts: RemoteBrokerOptions) {}

  private get fetcher(): typeof fetch {
    return this.opts.fetchImpl ?? globalThis.fetch;
  }

  async publish(intent: Intent): Promise<void> {
    const envelope = buildEnvelope({
      kind: "publish_intent",
      payload: { intent: intentToCborMap(intent) },
      features: [`vertical.${intent.vertical.replace("/", ".")}`],
    });
    const body = Buffer.from(encodeEnvelope(envelope));
    const res = await this.fetcher(`${this.opts.baseUrl}/mp/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor", ...(this.opts.headers ?? {}) },
      body,
      signal: this.signal(),
    });
    if (!res.ok) throw new Error(`broker: publish failed (${res.status})`);
  }

  async query(opts: { discoveryKey: Uint8Array; limit?: number }): Promise<Intent[]> {
    const body = Buffer.from(encodeCanonicalCbor({
      discovery_key: opts.discoveryKey,
      limit: opts.limit ?? 100,
    }));
    const res = await this.fetcher(`${this.opts.baseUrl}/mp/query`, {
      method: "POST",
      headers: { "Content-Type": "application/cbor", ...(this.opts.headers ?? {}) },
      body,
      signal: this.signal(),
    });
    if (!res.ok) throw new Error(`broker: query failed (${res.status})`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const decoded = decodeBrokerQueryResponse(buf);
    return decoded;
  }

  async health(): Promise<RemoteBrokerHealth> {
    try {
      const res = await this.fetcher(`${this.opts.baseUrl}/mp/health`, { signal: this.signal() });
      if (!res.ok) return { ok: false };
      return await res.json() as RemoteBrokerHealth;
    } catch {
      return { ok: false };
    }
  }

  private signal(): AbortSignal | undefined {
    const ms = this.opts.defaultTimeoutMs;
    if (!ms) return undefined;
    return AbortSignal.timeout(ms);
  }
}

function decodeBrokerQueryResponse(buf: Uint8Array): Intent[] {
  const decoded = decodeCanonicalCbor(buf) as Record<string, CborValue> | CborValue[];
  const list = Array.isArray(decoded) ? decoded : (decoded.intents as CborValue[] | undefined ?? []);
  const out: Intent[] = [];
  for (const v of list) {
    try { out.push(intentFromCborMap(v).intent); } catch { /* skip malformed */ }
  }
  return out;
}

// ---- broker federation: aggregator ----
//
// `FederatedBrokerClient` accepts a list of `RemoteBrokerClient`s plus an
// optional local in-process broker and fans publish/query out across all of
// them in parallel. De-dups query results by `intentId` hex.

export class FederatedBrokerClient {
  constructor(
    private readonly brokers: RemoteBrokerClient[],
    private readonly local?: InProcessBroker,
  ) {}

  async publish(intent: Intent): Promise<void> {
    if (this.local) publishIntent(this.local, intent);
    await Promise.allSettled(this.brokers.map((b) => b.publish(intent)));
  }

  async query(opts: { discoveryKey: Uint8Array; limit?: number }): Promise<Intent[]> {
    const seen = new Map<string, Intent>();
    if (this.local) {
      for (const intent of this.local.query({ discoveryKey: opts.discoveryKey, limit: opts.limit })) {
        seen.set(toHex(intent.intentId), intent);
      }
    }
    const results = await Promise.allSettled(this.brokers.map((b) => b.query(opts)));
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const intent of r.value) seen.set(toHex(intent.intentId), intent);
    }
    return [...seen.values()].slice(0, opts.limit ?? Number.POSITIVE_INFINITY);
  }
}

// ---- low-level helpers exposed for federation servers ----

/**
 * Encode a query response: an array of CBOR-encoded intents under
 * `{ intents: [...] }`. Servers that implement the federation endpoint can
 * reuse this helper.
 */
export function encodeBrokerQueryResponse(intents: Intent[]): Uint8Array {
  return encodeCanonicalCbor({ intents: intents.map(intentToCborMap) });
}

/**
 * Decode the payload of a `POST /mp/query` body sent by `RemoteBrokerClient`.
 * Servers parse this to know which `discovery_key` they're being asked about.
 */
export function decodeBrokerQueryRequest(buf: Uint8Array): { discoveryKey: Uint8Array; limit: number } {
  const obj = decodeCanonicalCbor(buf) as Record<string, CborValue>;
  return {
    discoveryKey: obj.discovery_key as Uint8Array,
    limit: (obj.limit as number | undefined) ?? 100,
  };
}
