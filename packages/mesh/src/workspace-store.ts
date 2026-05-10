import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import { z } from "zod";

import { DEFAULT_TENANT_ID } from "./host-store.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS local_workspaces (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  path TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_local_workspaces_tenant
  ON local_workspaces(tenant_id);
`;

export const LocalWorkspaceSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  label: z.string().min(1),
  createdAt: z.date(),
});

export type LocalWorkspace = z.infer<typeof LocalWorkspaceSchema>;

export const LocalWorkspaceInputSchema = LocalWorkspaceSchema.partial({
  id: true,
  createdAt: true,
});

export type LocalWorkspaceInput = z.infer<typeof LocalWorkspaceInputSchema>;

interface WorkspaceRow {
  id: string;
  tenant_id: string;
  path: string;
  label: string;
  created_at: string;
}

export class WorkspaceStore {
  private readonly db: Database.Database;
  private readonly tenantId: string;

  constructor(db: Database.Database, tenantId: string = DEFAULT_TENANT_ID) {
    this.db = db;
    this.tenantId = tenantId;
    this.db.exec(DDL);
  }

  list(): LocalWorkspace[] {
    const rows = this.db
      .prepare<[string], WorkspaceRow>(
        "SELECT * FROM local_workspaces WHERE tenant_id = ? ORDER BY label COLLATE NOCASE ASC",
      )
      .all(this.tenantId);
    return rows.map(rowToWorkspace);
  }

  get(id: string): LocalWorkspace | null {
    const row = this.db
      .prepare<[string, string], WorkspaceRow>(
        "SELECT * FROM local_workspaces WHERE tenant_id = ? AND id = ?",
      )
      .get(this.tenantId, id);
    return row ? rowToWorkspace(row) : null;
  }

  upsert(input: LocalWorkspaceInput): LocalWorkspace {
    const parsed = LocalWorkspaceInputSchema.parse(input);
    const merged = LocalWorkspaceSchema.parse({
      id: parsed.id ?? randomUUID(),
      path: parsed.path,
      label: parsed.label,
      createdAt: parsed.createdAt ?? new Date(),
    });
    this.db
      .prepare(
        `INSERT INTO local_workspaces (id, tenant_id, path, label, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, id) DO UPDATE SET
           path = excluded.path,
           label = excluded.label`,
      )
      .run(
        merged.id,
        this.tenantId,
        merged.path,
        merged.label,
        merged.createdAt.toISOString(),
      );
    return merged;
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM local_workspaces WHERE tenant_id = ? AND id = ?")
      .run(this.tenantId, id);
    return result.changes > 0;
  }
}

function rowToWorkspace(row: WorkspaceRow): LocalWorkspace {
  return LocalWorkspaceSchema.parse({
    id: row.id,
    path: row.path,
    label: row.label,
    createdAt: new Date(row.created_at),
  });
}
