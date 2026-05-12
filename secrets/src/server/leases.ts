// Leases: very short-lived single-use tokens for interactive flows. Two
// modes:
//   - process: a CLI invocation will consume the token once.
//   - browser: a URL handed to a browser (OAuth login etc.) consumes it.

import {
  newId,
  nowIso,
  type LeaseRow,
  type SqliteDb,
  type LeaseMode,
} from "./db.ts";
import { generateLeaseToken, hashLeaseToken } from "./crypto.ts";

export interface IssuedLease {
  lease: LeaseRow;
  token: string;
}

export class LeaseStore {
  constructor(private readonly db: SqliteDb) {}

  issue(input: {
    tenantId: string;
    secretId: string;
    mode: LeaseMode;
    durationMinutes: number;
    context?: Record<string, unknown>;
  }): IssuedLease {
    if (input.durationMinutes < 1 || input.durationMinutes > 60) {
      throw new Error("Lease TTL must be 1..60 minutes");
    }
    const { token, hash } = generateLeaseToken();
    const created = new Date();
    const expires = new Date(created.getTime() + input.durationMinutes * 60 * 1000);
    const row: LeaseRow = {
      id: newId(),
      tenant_id: input.tenantId,
      secret_id: input.secretId,
      mode: input.mode,
      token_hash: hash,
      context_json: input.context ? JSON.stringify(input.context) : null,
      created_at: created.toISOString(),
      expires_at: expires.toISOString(),
      consumed_at: null,
      revoked_at: null,
    };
    this.db
      .prepare(
        "INSERT INTO leases (id, tenant_id, secret_id, mode, token_hash, context_json, created_at, expires_at, consumed_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)",
      )
      .run(
        row.id,
        row.tenant_id,
        row.secret_id,
        row.mode,
        row.token_hash,
        row.context_json,
        row.created_at,
        row.expires_at,
      );
    return { lease: row, token };
  }

  consume(token: string): LeaseRow {
    const hash = hashLeaseToken(token);
    const row = this.db.prepare("SELECT * FROM leases WHERE token_hash = ?").get(hash) as LeaseRow | undefined;
    if (!row) throw new Error("Lease not found");
    if (row.revoked_at) throw new Error("Lease revoked");
    if (row.consumed_at) throw new Error("Lease already consumed");
    if (new Date(row.expires_at).getTime() <= Date.now()) throw new Error("Lease expired");
    this.db.prepare("UPDATE leases SET consumed_at = ? WHERE id = ?").run(nowIso(), row.id);
    return { ...row, consumed_at: nowIso() };
  }

  revoke(id: string): LeaseRow | undefined {
    this.db.prepare("UPDATE leases SET revoked_at = ? WHERE id = ?").run(nowIso(), id);
    return this.db.prepare("SELECT * FROM leases WHERE id = ?").get(id) as LeaseRow | undefined;
  }

  list(tenantId: string): LeaseRow[] {
    return this.db
      .prepare("SELECT * FROM leases WHERE tenant_id = ? ORDER BY created_at DESC")
      .all(tenantId) as LeaseRow[];
  }

  listActive(tenantId: string): LeaseRow[] {
    return this.db
      .prepare(
        "SELECT * FROM leases WHERE tenant_id = ? AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC",
      )
      .all(tenantId, nowIso()) as LeaseRow[];
  }

  sweepExpired(): number {
    const result = this.db.prepare("DELETE FROM leases WHERE expires_at < ?").run(nowIso());
    return result.changes;
  }
}
