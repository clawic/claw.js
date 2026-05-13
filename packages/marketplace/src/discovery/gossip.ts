// LAN gossip for marketplace/2.0.0.
//
// Discovery on the same network segment goes via mDNS (Bonjour). Each peer
// advertises a `_clawix-marketplace._udp.local` service with its handle fingerprint and
// listening address. The gossip client subscribes to the service browser and
// surfaces new peers as observed Intent announcements.
//
// `bonjour-service` is loaded lazily so test environments without multicast
// capability can still construct `InMemoryGossip` for unit tests.

import type { Intent } from "../wire.ts";
import { intentFromCborMap, intentToCborMap } from "../wire.ts";
import { encodeCanonicalCbor, decodeCanonicalCbor } from "../cbor.ts";

export interface GossipClient {
  announce(intent: Intent): Promise<void>;
  observe(handler: (intent: Intent) => void): () => void;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

// ---- in-memory (tests) ----

export class InMemoryGossip implements GossipClient {
  private listeners: Array<(intent: Intent) => void> = [];
  async announce(intent: Intent): Promise<void> {
    for (const l of this.listeners) l(intent);
  }
  observe(handler: (intent: Intent) => void): () => void {
    this.listeners.push(handler);
    return () => { this.listeners = this.listeners.filter((l) => l !== handler); };
  }
}

// ---- mDNS via bonjour-service ----

export const CLAWIX_MARKETPLACE_SERVICE_TYPE = "clawix-marketplace" as const;

export interface MdnsGossipOptions {
  /** Hostname / fingerprint to advertise. */
  instanceName: string;
  /** TCP / UDP port the peer is listening on. */
  port: number;
  /** Address of the service. */
  host?: string;
  /** Free-form txt records (handle fingerprint, etc.). */
  txt?: Record<string, string>;
  /** Whether to actually start a multicast publisher / browser. */
  publish?: boolean;
  browse?: boolean;
}

interface BonjourLike {
  publish(opts: Record<string, unknown>): { stop?: () => void };
  find(opts: { type: string }, cb: (svc: { txt?: Record<string, string>; name: string }) => void): { stop?: () => void };
  destroy?: () => void;
}

export class MdnsGossip implements GossipClient {
  private listeners: Array<(intent: Intent) => void> = [];
  private bonjour: BonjourLike | null = null;
  private publisher?: { stop?: () => void };
  private browser?: { stop?: () => void };

  constructor(private readonly opts: MdnsGossipOptions) {}

  async start(): Promise<void> {
    let mod: { Bonjour?: new () => BonjourLike } | null = null;
    try {
      mod = await import("bonjour-service") as unknown as { Bonjour?: new () => BonjourLike };
    } catch {
      // Bonjour not available in this environment — gossip is a no-op.
      return;
    }
    if (!mod?.Bonjour) return;
    this.bonjour = new mod.Bonjour();
    if (this.opts.publish !== false) {
      this.publisher = this.bonjour!.publish({
        name: this.opts.instanceName,
        type: CLAWIX_MARKETPLACE_SERVICE_TYPE,
        port: this.opts.port,
        host: this.opts.host,
        txt: this.opts.txt ?? {},
      });
    }
    if (this.opts.browse !== false) {
      this.browser = this.bonjour!.find({ type: CLAWIX_MARKETPLACE_SERVICE_TYPE }, (svc) => {
        // The actual Intent payload travels in a TXT record (`intent_cbor_b64`).
        const b64 = svc.txt?.intent_cbor_b64;
        if (!b64) return;
        try {
          const buf = Buffer.from(b64, "base64");
          const map = decodeCanonicalCbor(new Uint8Array(buf));
          const { intent } = intentFromCborMap(map);
          for (const l of this.listeners) l(intent);
        } catch {
          /* malformed peer; ignore */
        }
      });
    }
  }

  async stop(): Promise<void> {
    try { this.publisher?.stop?.(); } catch { /* noop */ }
    try { this.browser?.stop?.(); } catch { /* noop */ }
    this.bonjour?.destroy?.();
    this.bonjour = null;
  }

  async announce(intent: Intent): Promise<void> {
    if (!this.bonjour || this.opts.publish === false) return;
    // We re-publish the service with the intent encoded in TXT.
    try { this.publisher?.stop?.(); } catch { /* noop */ }
    const intentCbor = encodeCanonicalCbor(intentToCborMap(intent));
    this.publisher = this.bonjour.publish({
      name: this.opts.instanceName,
      type: CLAWIX_MARKETPLACE_SERVICE_TYPE,
      port: this.opts.port,
      host: this.opts.host,
      txt: {
        ...(this.opts.txt ?? {}),
        intent_cbor_b64: Buffer.from(intentCbor).toString("base64"),
      },
    });
  }

  observe(handler: (intent: Intent) => void): () => void {
    this.listeners.push(handler);
    return () => { this.listeners = this.listeners.filter((l) => l !== handler); };
  }
}
