// DHT client stub for mp/1.0.0. Phase 4 will wire this up against the
// Iroh-backed Kademlia. For now it provides the interface the rest of the
// package can target, plus an in-memory implementation for tests.

import type { Intent } from "../wire.ts";
import { InProcessBroker, publishIntent, queryByIntentVertical } from "./brokers.ts";

export interface DhtClient {
  publish(intent: Intent): Promise<void>;
  query(opts: { vertical: string; geoZone?: string; tag?: string; priceBand?: number; limit?: number }): Promise<Intent[]>;
}

// In-memory DHT backed by the in-process broker. Used for Phase 1 tests.
export class InMemoryDht implements DhtClient {
  constructor(private readonly broker: InProcessBroker = new InProcessBroker()) {}
  async publish(intent: Intent): Promise<void> {
    publishIntent(this.broker, intent);
  }
  async query(opts: { vertical: string; geoZone?: string; tag?: string; priceBand?: number; limit?: number }): Promise<Intent[]> {
    return queryByIntentVertical(this.broker, opts);
  }
  underlying(): InProcessBroker { return this.broker; }
}
