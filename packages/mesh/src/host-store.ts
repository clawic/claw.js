// @clawjs-persistent-surface-ddl-source
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

import {
  HostSchema,
  HostInputSchema,
  HostMetadataSchema,
  type Host,
  type HostEndpoint,
  type HostInput,
  type HostKind,
} from "./models.ts";

export const DEFAULT_TENANT_ID = "clawix-local";

export const MESH_SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS mesh_schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS hosts (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  signing_public_key TEXT,
  agreement_public_key TEXT,
  permission_profile TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  ssh_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{"tags":[]}',
  last_seen_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS host_endpoints (
  host_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  kind TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  protocol TEXT,
  PRIMARY KEY (tenant_id, host_id, ord),
  FOREIGN KEY (tenant_id, host_id) REFERENCES hosts(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hosts_tenant_kind ON hosts(tenant_id, kind);
CREATE INDEX IF NOT EXISTS idx_hosts_tenant_revoked ON hosts(tenant_id, revoked_at);
`;

interface HostRow {
  id: string;
  tenant_id: string;
  kind: string;
  display_name: string;
  signing_public_key: string | null;
  agreement_public_key: string | null;
  permission_profile: string;
  capabilities_json: string;
  ssh_json: string | null;
  metadata_json: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface EndpointRow {
  host_id: string;
  tenant_id: string;
  ord: number;
  kind: string;
  host: string;
  port: number;
  protocol: string | null;
}

export interface HostListFilter {
  kind?: HostKind;
  includeRevoked?: boolean;
}

export class HostStore {
  private readonly db: Database.Database;
  private readonly tenantId: string;

  constructor(db: Database.Database, tenantId: string = DEFAULT_TENANT_ID) {
    this.db = db;
    this.tenantId = tenantId;
    this.migrate();
  }

  private migrate(): void {
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(DDL);
    const row = this.db
      .prepare<[], { version: number }>(
        "SELECT version FROM mesh_schema_version LIMIT 1",
      )
      .get();
    if (!row) {
      this.db
        .prepare("INSERT INTO mesh_schema_version (version) VALUES (?)")
        .run(MESH_SCHEMA_VERSION);
    } else if (row.version !== MESH_SCHEMA_VERSION) {
      throw new Error(
        `mesh schema version mismatch: db=${row.version} expected=${MESH_SCHEMA_VERSION}`,
      );
    }
  }

  list(filter: HostListFilter = {}): Host[] {
    const clauses: string[] = ["tenant_id = ?"];
    const args: unknown[] = [this.tenantId];
    if (filter.kind) {
      clauses.push("kind = ?");
      args.push(filter.kind);
    }
    if (!filter.includeRevoked) {
      clauses.push("revoked_at IS NULL");
    }
    const rows = this.db
      .prepare<unknown[], HostRow>(
        `SELECT * FROM hosts WHERE ${clauses.join(" AND ")} ORDER BY display_name COLLATE NOCASE ASC`,
      )
      .all(...args);
    if (rows.length === 0) return [];
    const endpoints = this.endpointsFor(rows.map((r) => r.id));
    return rows.map((row) => rowToHost(row, endpoints.get(row.id) ?? []));
  }

  get(id: string): Host | null {
    const row = this.db
      .prepare<[string, string], HostRow>(
        "SELECT * FROM hosts WHERE tenant_id = ? AND id = ?",
      )
      .get(this.tenantId, id);
    if (!row) return null;
    const endpoints = this.endpointsFor([id]).get(id) ?? [];
    return rowToHost(row, endpoints);
  }

  upsert(input: HostInput): Host {
    const parsed = HostInputSchema.parse(input);
    const existing = parsed.id ? this.get(parsed.id) : null;
    const now = new Date();
    const merged: Host = HostSchema.parse({
      id: parsed.id ?? randomUUID(),
      kind: parsed.kind,
      displayName: parsed.displayName,
      signingPublicKey: parsed.signingPublicKey ?? existing?.signingPublicKey,
      agreementPublicKey:
        parsed.agreementPublicKey ?? existing?.agreementPublicKey,
      endpoints: parsed.endpoints ?? existing?.endpoints ?? [],
      permissionProfile:
        parsed.permissionProfile ?? existing?.permissionProfile ?? "scoped",
      capabilities: parsed.capabilities ?? existing?.capabilities ?? [],
      ssh: parsed.ssh ?? existing?.ssh,
      metadata: HostMetadataSchema.parse({
        tags: [],
        ...(existing?.metadata ?? {}),
        ...(parsed.metadata ?? {}),
      }),
      lastSeenAt: parsed.lastSeenAt ?? existing?.lastSeenAt,
      revokedAt: parsed.revokedAt ?? existing?.revokedAt,
      createdAt: parsed.createdAt ?? existing?.createdAt ?? now,
    });

    const tx = this.db.transaction((host: Host) => {
      this.db
        .prepare(
          `INSERT INTO hosts (
            id, tenant_id, kind, display_name,
            signing_public_key, agreement_public_key,
            permission_profile, capabilities_json,
            ssh_json, metadata_json,
            last_seen_at, revoked_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, id) DO UPDATE SET
            kind = excluded.kind,
            display_name = excluded.display_name,
            signing_public_key = excluded.signing_public_key,
            agreement_public_key = excluded.agreement_public_key,
            permission_profile = excluded.permission_profile,
            capabilities_json = excluded.capabilities_json,
            ssh_json = excluded.ssh_json,
            metadata_json = excluded.metadata_json,
            last_seen_at = excluded.last_seen_at,
            revoked_at = excluded.revoked_at`,
        )
        .run(
          host.id,
          this.tenantId,
          host.kind,
          host.displayName,
          host.signingPublicKey ?? null,
          host.agreementPublicKey ?? null,
          host.permissionProfile,
          JSON.stringify(host.capabilities),
          host.ssh ? JSON.stringify(host.ssh) : null,
          JSON.stringify(host.metadata),
          host.lastSeenAt ? host.lastSeenAt.toISOString() : null,
          host.revokedAt ? host.revokedAt.toISOString() : null,
          host.createdAt.toISOString(),
        );
      this.db
        .prepare(
          "DELETE FROM host_endpoints WHERE tenant_id = ? AND host_id = ?",
        )
        .run(this.tenantId, host.id);
      const insertEndpoint = this.db.prepare(
        `INSERT INTO host_endpoints (
          host_id, tenant_id, ord, kind, host, port, protocol
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      host.endpoints.forEach((ep, idx) => {
        insertEndpoint.run(
          host.id,
          this.tenantId,
          idx,
          ep.kind,
          ep.host,
          ep.port,
          ep.protocol ?? null,
        );
      });
    });
    tx(merged);
    return merged;
  }

  revoke(id: string, at: Date = new Date()): boolean {
    const result = this.db
      .prepare(
        "UPDATE hosts SET revoked_at = ? WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL",
      )
      .run(at.toISOString(), this.tenantId, id);
    return result.changes > 0;
  }

  unrevoke(id: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE hosts SET revoked_at = NULL WHERE tenant_id = ? AND id = ? AND revoked_at IS NOT NULL",
      )
      .run(this.tenantId, id);
    return result.changes > 0;
  }

  touch(id: string, at: Date = new Date()): boolean {
    const result = this.db
      .prepare(
        "UPDATE hosts SET last_seen_at = ? WHERE tenant_id = ? AND id = ?",
      )
      .run(at.toISOString(), this.tenantId, id);
    return result.changes > 0;
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM hosts WHERE tenant_id = ? AND id = ?")
      .run(this.tenantId, id);
    return result.changes > 0;
  }

  private endpointsFor(hostIds: string[]): Map<string, HostEndpoint[]> {
    const out = new Map<string, HostEndpoint[]>();
    if (hostIds.length === 0) return out;
    const placeholders = hostIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare<unknown[], EndpointRow>(
        `SELECT * FROM host_endpoints
         WHERE tenant_id = ? AND host_id IN (${placeholders})
         ORDER BY host_id ASC, ord ASC`,
      )
      .all(this.tenantId, ...hostIds);
    for (const row of rows) {
      const list = out.get(row.host_id) ?? [];
      list.push({
        kind: row.kind as HostEndpoint["kind"],
        host: row.host,
        port: row.port,
        protocol: (row.protocol ?? undefined) as HostEndpoint["protocol"],
      });
      out.set(row.host_id, list);
    }
    return out;
  }
}

function rowToHost(row: HostRow, endpoints: HostEndpoint[]): Host {
  return HostSchema.parse({
    id: row.id,
    kind: row.kind,
    displayName: row.display_name,
    signingPublicKey: row.signing_public_key ?? undefined,
    agreementPublicKey: row.agreement_public_key ?? undefined,
    endpoints,
    permissionProfile: row.permission_profile,
    capabilities: JSON.parse(row.capabilities_json),
    ssh: row.ssh_json ? JSON.parse(row.ssh_json) : undefined,
    metadata: JSON.parse(row.metadata_json),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : undefined,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : undefined,
    createdAt: new Date(row.created_at),
  });
}
