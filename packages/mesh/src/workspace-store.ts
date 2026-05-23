// @clawjs-persistent-surface-ddl-source
import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";
import { z } from "zod";

import { DEFAULT_MESH_ID, migrateMeshScopeColumn } from "./host-store.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS local_workspaces (
  id TEXT NOT NULL,
  mesh_id TEXT NOT NULL,
  path TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (mesh_id, id)
);

CREATE INDEX IF NOT EXISTS idx_local_workspaces_mesh
  ON local_workspaces(mesh_id);
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
  mesh_id: string;
  path: string;
  label: string;
  created_at: string;
}

export class WorkspaceStore {
  private readonly db: Database.Database;
  private readonly meshId: string;

  constructor(db: Database.Database, meshId: string = DEFAULT_MESH_ID) {
    this.db = db;
    this.meshId = meshId;
    migrateMeshScopeColumn(this.db, "local_workspaces");
    this.db.exec(DDL);
  }

  list(): LocalWorkspace[] {
    const rows = this.db
      .prepare<[string], WorkspaceRow>(
        "SELECT * FROM local_workspaces WHERE mesh_id = ? ORDER BY label COLLATE NOCASE ASC",
      )
      .all(this.meshId);
    return rows.map(rowToWorkspace);
  }

  get(id: string): LocalWorkspace | null {
    const row = this.db
      .prepare<[string, string], WorkspaceRow>(
        "SELECT * FROM local_workspaces WHERE mesh_id = ? AND id = ?",
      )
      .get(this.meshId, id);
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
        `INSERT INTO local_workspaces (id, mesh_id, path, label, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(mesh_id, id) DO UPDATE SET
           path = excluded.path,
           label = excluded.label`,
      )
      .run(
        merged.id,
        this.meshId,
        merged.path,
        merged.label,
        merged.createdAt.toISOString(),
      );
    return merged;
  }

  remove(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM local_workspaces WHERE mesh_id = ? AND id = ?")
      .run(this.meshId, id);
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
