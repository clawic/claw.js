// LAN gossip stub for mp/1.0.0. Phase 4 will wire up mDNS / Bonjour. For now
// this exposes the interface and an in-memory testing client.

import type { Intent } from "../wire.ts";

export interface GossipClient {
  announce(intent: Intent): Promise<void>;
  observe(handler: (intent: Intent) => void): () => void;
}

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
