// In-process broker for mp/1.0.0 Phase 1 tests, plus a thin client for the
// real federated broker that will land in Phase 4.

import { encodeCanonicalCbor, type CborValue } from "../cbor.ts";
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
    const dKey = opts.keyForIntent
      ? opts.keyForIntent(intent)
      : discoveryKey({
          vertical: intent.vertical,
          geoZone: (intent.fields as Record<string, CborValue>).geo_zone as string | undefined,
          tag: (intent.fields as Record<string, CborValue>).tag as string | undefined,
          priceBand: (intent.fields as Record<string, CborValue>).price_band as number | undefined,
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
