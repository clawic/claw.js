import type { RelayDatabase } from "../db.ts";

export interface PreauthKeySpec {
  tenantId: string;
  createdByUserId?: string;
  label?: string;
  scopes?: string[];
  reusable?: boolean;
  maxUses?: number;
  ttlSec?: number;
}

const DEFAULT_DEVICE_SCOPES = [
  "tenant:read",
  "device:read",
  "device:write",
  "agent:read",
  "workspace:read",
  "workspace:data",
  "chat:read",
  "chat:write",
  "chat:stream",
];

export class PreauthKeyService {
  constructor(private readonly db: RelayDatabase) {}

  create(spec: PreauthKeySpec): { keyId: string; token: string; expiresAt: number | null } {
    const expiresAt = spec.ttlSec ? Date.now() + spec.ttlSec * 1000 : null;
    const scopes = spec.scopes ?? DEFAULT_DEVICE_SCOPES;
    const result = this.db.createPreauthKey({
      tenantId: spec.tenantId,
      ...(spec.createdByUserId ? { createdByUserId: spec.createdByUserId } : {}),
      ...(spec.label ? { label: spec.label } : {}),
      scopes,
      reusable: spec.reusable ?? false,
      ...(spec.maxUses != null ? { maxUses: spec.maxUses } : {}),
      ...(expiresAt != null ? { expiresAt } : {}),
    });
    return { keyId: result.keyId, token: result.token, expiresAt };
  }

  consume(token: string): { keyId: string; tenantId: string; scopes: string[] } | null {
    return this.db.consumePreauthKey(token);
  }

  list(tenantId: string) {
    return this.db.listPreauthKeys(tenantId);
  }

  revoke(tenantId: string, keyId: string): boolean {
    return this.db.revokePreauthKey(tenantId, keyId);
  }
}
