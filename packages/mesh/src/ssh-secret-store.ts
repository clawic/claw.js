// @clawjs-persistent-surface-ddl-source
import type Database from "better-sqlite3";
import { z } from "zod";

import { DEFAULT_MESH_ID, migrateMeshScopeColumn } from "./host-store.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS ssh_secrets (
  id TEXT NOT NULL,
  mesh_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (mesh_id, id)
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
  mesh_id: string;
  kind: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

export class SshSecretStore {
  private readonly db: Database.Database;
  private readonly meshId: string;

  constructor(db: Database.Database, meshId: string = DEFAULT_MESH_ID) {
    this.db = db;
    this.meshId = meshId;
    migrateMeshScopeColumn(this.db, "ssh_secrets");
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
          id, mesh_id, kind, payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(mesh_id, id) DO UPDATE SET
          kind = excluded.kind,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        id,
        this.meshId,
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
        "SELECT * FROM ssh_secrets WHERE mesh_id = ? AND id = ?",
      )
      .get(this.meshId, id);
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
        "SELECT * FROM ssh_secrets WHERE mesh_id = ? ORDER BY id ASC",
      )
      .all(this.meshId);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as SshStoredSecret["kind"],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM ssh_secrets WHERE mesh_id = ? AND id = ?")
      .run(this.meshId, id);
    return result.changes > 0;
  }

  private metaRow(id: string): Row | undefined {
    return this.db
      .prepare<[string, string], Row>(
        "SELECT * FROM ssh_secrets WHERE mesh_id = ? AND id = ?",
      )
      .get(this.meshId, id);
  }
}
