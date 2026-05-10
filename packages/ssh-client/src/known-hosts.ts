import { createHash } from "node:crypto";

export interface KnownHostRecord {
  hostId: string;
  fingerprintSha256: string;
  lastSeenAt: Date;
}

export interface KnownHostsStore {
  get(hostId: string): Promise<KnownHostRecord | null>;
  put(record: KnownHostRecord): Promise<void>;
}

export class InMemoryKnownHostsStore implements KnownHostsStore {
  private readonly map = new Map<string, KnownHostRecord>();
  async get(hostId: string): Promise<KnownHostRecord | null> {
    return this.map.get(hostId) ?? null;
  }
  async put(record: KnownHostRecord): Promise<void> {
    this.map.set(record.hostId, record);
  }
}

export function fingerprintHostKey(key: Buffer): string {
  return createHash("sha256").update(key).digest("base64");
}
