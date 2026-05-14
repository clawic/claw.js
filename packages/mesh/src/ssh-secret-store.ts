// @clawjs-persistent-surface-ddl-source
import type Database from "better-sqlite3";
import { z } from "zod";

import { DEFAULT_TENANT_ID } from "./host-store.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS ssh_secrets (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
`;

export const SshStoredSecretKindSchema = z.enum([
  "private-key",
  "password",
  "passphrase",
]);

export const SshStoredSecretSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("private-key"),
    privateKeyPem: z.string().min(1),
    passphrase: z.string().optional(),
  }),
  z.object({
    kind: z.literal("password"),
    password: z.string().min(1),
  }),
  z.object({
    kind: z.literal("passphrase"),
    passphrase: z.string().min(1),
  }),
]);

export type SshStoredSecret = z.infer<typeof SshStoredSecretSchema>;

export interface SshSecretRecord {
  id: string;
  kind: SshStoredSecret["kind"];
  createdAt: Date;
  updatedAt: Date;
}

interface Row {
  id: string;
  tenant_id: string;
  kind: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export class SshSecretStore {
  private readonly db: Database.Database;
  private readonly tenantId: string;

  constructor(db: Database.Database, tenantId: string = DEFAULT_TENANT_ID) {
    this.db = db;
    this.tenantId = tenantId;
    this.db.exec(DDL);
  }

  put(id: string, secret: SshStoredSecret): SshSecretRecord {
    const parsed = SshStoredSecretSchema.parse(secret);
    const now = new Date();
    const existing = this.metaRow(id);
    const createdAt = existing ? new Date(existing.created_at) : now;
    this.db
      .prepare(
        `INSERT INTO ssh_secrets (
          id, tenant_id, kind, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          kind = excluded.kind,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        this.tenantId,
        parsed.kind,
        JSON.stringify(parsed),
        createdAt.toISOString(),
        now.toISOString(),
      );
    return {
      id,
      kind: parsed.kind,
      createdAt,
      updatedAt: now,
    };
  }

  get(id: string): SshStoredSecret | null {
    const row = this.db
      .prepare<[string, string], Row>(
        "SELECT * FROM ssh_secrets WHERE tenant_id = ? AND id = ?",
      )
      .get(this.tenantId, id);
    if (!row) return null;
    return SshStoredSecretSchema.parse(JSON.parse(row.payload_json));
  }

  meta(id: string): SshSecretRecord | null {
    const row = this.metaRow(id);
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind as SshStoredSecret["kind"],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  list(): SshSecretRecord[] {
    const rows = this.db
      .prepare<[string], Row>(
        "SELECT * FROM ssh_secrets WHERE tenant_id = ? ORDER BY id ASC",
      )
      .all(this.tenantId);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as SshStoredSecret["kind"],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM ssh_secrets WHERE tenant_id = ? AND id = ?")
      .run(this.tenantId, id);
    return result.changes > 0;
  }

  private metaRow(id: string): Row | undefined {
    return this.db
      .prepare<[string, string], Row>(
        "SELECT * FROM ssh_secrets WHERE tenant_id = ? AND id = ?",
      )
      .get(this.tenantId, id);
  }
}
