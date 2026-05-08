// Agent grants: short-lived `svagt_<base64url>` tokens that authorize an
// agent (CLI, daemon, plugin) to use a specific secret with a specific
// BusinessCapability and a set of VaultCapabilities. Token value is shown
// to the issuer ONCE; only the SHA-256 hash is persisted.

import {
  asBuffer,
  newId,
  nowIso,
  type AgentGrantRow,
  type SqliteDb,
} from "./db.ts";
import {
  generateAgentToken,
  hashAgentToken,
} from "./crypto.ts";
import {
  type BusinessCapability,
  type CapabilityCheck,
  type VaultCapability,
  deserializeBusinessCapability,
  matchesScope,
  serializeBusinessCapability,
} from "./capabilities.ts";

export interface IssuedAgentToken {
  grant: AgentGrantRow;
  token: string;
}

export interface AgentGrantSummary {
  id: string;
  tenantId: string;
  agent: string;
  secretId: string;
  capability: BusinessCapability;
  vaultCapabilities: VaultCapability[];
  reason: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  usedCount: number;
  lastUsedAt: string | null;
}

export class AgentGrantStore {
  constructor(private readonly db: SqliteDb) {}

  issue(input: {
    tenantId: string;
    agent: string;
    secretId: string;
    capability: BusinessCapability;
    vaultCapabilities: VaultCapability[];
    reason: string;
    durationMinutes: number;
  }): IssuedAgentToken {
    if (input.durationMinutes < 1 || input.durationMinutes > 60) {
      throw new Error("Grant TTL must be 1..60 minutes");
    }
    const { token, hash } = generateAgentToken();
    const { kind, scopeJson } = serializeBusinessCapability(input.capability);
    const created = new Date();
    const expires = new Date(created.getTime() + input.durationMinutes * 60 * 1000);
    const row: AgentGrantRow = {
      id: newId(),
      tenant_id: input.tenantId,
      agent: input.agent,
      secret_id: input.secretId,
      capability_kind: kind,
      capability_scope_json: scopeJson,
      vault_capabilities_json: JSON.stringify(input.vaultCapabilities),
      reason: input.reason,
      token_hash: hash,
      created_at: created.toISOString(),
      expires_at: expires.toISOString(),
      revoked_at: null,
      used_count: 0,
      last_used_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO agent_grants (
           id, tenant_id, agent, secret_id, capability_kind, capability_scope_json,
           vault_capabilities_json, reason, token_hash, created_at, expires_at,
           revoked_at, used_count, last_used_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)`,
      )
      .run(
        row.id,
        row.tenant_id,
        row.agent,
        row.secret_id,
        row.capability_kind,
        row.capability_scope_json,
        row.vault_capabilities_json,
        row.reason,
        row.token_hash,
        row.created_at,
        row.expires_at,
      );
    return { grant: row, token };
  }

  resolve(token: string, check?: CapabilityCheck): AgentGrantRow {
    if (!token.startsWith("svagt_")) throw new Error("Invalid grant token format");
    const hash = hashAgentToken(token);
    const row = this.db.prepare("SELECT * FROM agent_grants WHERE token_hash = ?").get(hash) as
      | AgentGrantRow
      | undefined;
    if (!row) throw new Error("Grant not found");
    if (row.revoked_at) throw new Error("Grant revoked");
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error("Grant expired");

    if (check) {
      if (check.expectedKind && row.capability_kind !== check.expectedKind) {
        throw new Error(`Grant capability mismatch (expected ${check.expectedKind}, got ${row.capability_kind})`);
      }
      if (check.expectedScope) {
        const stored = deserializeBusinessCapability(row.capability_kind, row.capability_scope_json);
        if (!matchesScope(stored, check.expectedScope)) {
          throw new Error("Grant scope mismatch");
        }
      }
      if (check.requiredVaultCapabilities && check.requiredVaultCapabilities.length > 0) {
        const have = JSON.parse(row.vault_capabilities_json) as VaultCapability[];
        const missing = check.requiredVaultCapabilities.filter((c) => !have.includes(c));
        if (missing.length > 0) {
          throw new Error(`Grant missing vault capabilities: ${missing.join(", ")}`);
        }
      }
    }
    return row;
  }

  bumpUsage(id: string): void {
    this.db
      .prepare("UPDATE agent_grants SET used_count = used_count + 1, last_used_at = ? WHERE id = ?")
      .run(nowIso(), id);
  }

  revoke(id: string): AgentGrantRow | undefined {
    this.db.prepare("UPDATE agent_grants SET revoked_at = ? WHERE id = ?").run(nowIso(), id);
    return this.db.prepare("SELECT * FROM agent_grants WHERE id = ?").get(id) as AgentGrantRow | undefined;
  }

  listActive(tenantId: string): AgentGrantRow[] {
    return this.db
      .prepare(
        "SELECT * FROM agent_grants WHERE tenant_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC",
      )
      .all(tenantId, nowIso()) as AgentGrantRow[];
  }

  list(tenantId: string): AgentGrantRow[] {
    return this.db
      .prepare("SELECT * FROM agent_grants WHERE tenant_id = ? ORDER BY created_at DESC")
      .all(tenantId) as AgentGrantRow[];
  }

  sweepExpired(): number {
    const result = this.db
      .prepare("DELETE FROM agent_grants WHERE expires_at < ?")
      .run(nowIso());
    return result.changes;
  }

  toSummary(row: AgentGrantRow): AgentGrantSummary {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      agent: row.agent,
      secretId: row.secret_id,
      capability: deserializeBusinessCapability(row.capability_kind, row.capability_scope_json),
      vaultCapabilities: JSON.parse(row.vault_capabilities_json) as VaultCapability[],
      reason: row.reason,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      usedCount: row.used_count,
      lastUsedAt: row.last_used_at,
    };
  }
}
