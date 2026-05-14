import fs from "fs";
import path from "path";

import Database from "better-sqlite3";
import { resolveWorkspaceSqliteDatabasePath, workspaceSqliteSchemaSql } from "./workspace-sqlite-surface.ts";

// Frozen storage surface remains part of this store contract:
// CLAW_DATA_DIR, CLAW_HOME, CLAW_DB_PATH, core.sqlite.
export interface SqliteCollectionHandle<T = unknown> {
  listIds(): string[];
  list(): T[];
  entries(): Array<{ id: string; value: T }>;
  get(id: string): T | null;
  put(id: string, value: T): T;
  remove(id: string): void;
}

export interface SqliteWorkspaceCollectionStore {
  dbPath(): string;
  collection<T = unknown>(name: string): SqliteCollectionHandle<T>;
}

function assertSafeName(name: string, label: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters: ${name}`);
  }
  return trimmed;
}

function extractRecordMetadata(value: unknown): { updatedAt: string | null; archivedAt: string | null } {
  if (!value || typeof value !== "object") return { updatedAt: null, archivedAt: null };
  const record = value as Record<string, unknown>;
  return {
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
    archivedAt: typeof record.archivedAt === "string" ? record.archivedAt : null,
  };
}

function resolveDatabasePath(workspaceDir: string): string {
  void workspaceDir;
  return resolveWorkspaceSqliteDatabasePath();
}

export function createSqliteWorkspaceCollectionStore(workspaceDir: string): SqliteWorkspaceCollectionStore {
  const dbFilePath = resolveDatabasePath(workspaceDir);
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  const sqlite = new Database(dbFilePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(workspaceSqliteSchemaSql);

  return {
    dbPath: () => dbFilePath,
    collection<T = unknown>(name: string): SqliteCollectionHandle<T> {
      const collectionName = assertSafeName(name, "collection name");
      const listStmt = sqlite.prepare(`
        SELECT record_id, payload_json
        FROM workspace_records
        WHERE collection_name = ?
        ORDER BY record_id ASC
      `);
      const getStmt = sqlite.prepare(`
        SELECT payload_json
        FROM workspace_records
        WHERE collection_name = ? AND record_id = ?
      `);
      const putStmt = sqlite.prepare(`
        INSERT INTO workspace_records (collection_name, record_id, payload_json, updated_at, archived_at)
        VALUES (@collection_name, @record_id, @payload_json, @updated_at, @archived_at)
        ON CONFLICT(collection_name, record_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at
      `);
      const removeStmt = sqlite.prepare(`
        DELETE FROM workspace_records
        WHERE collection_name = ? AND record_id = ?
      `);

      return {
        listIds: () => (listStmt.all(collectionName) as Array<{ record_id: string }>).map((row) => row.record_id),
        list: () => (listStmt.all(collectionName) as Array<{ payload_json: string }>)
          .map((row) => {
            try {
              return JSON.parse(row.payload_json) as T;
            } catch {
              return null;
            }
          })
          .filter((value): value is T => value !== null),
        entries: () => (listStmt.all(collectionName) as Array<{ record_id: string; payload_json: string }>)
          .map((row) => {
            try {
              return { id: row.record_id, value: JSON.parse(row.payload_json) as T };
            } catch {
              return null;
            }
          })
          .filter((value): value is { id: string; value: T } => value !== null),
        get: (id) => {
          const row = getStmt.get(collectionName, assertSafeName(id, "record id")) as { payload_json: string } | undefined;
          if (!row) return null;
          try {
            return JSON.parse(row.payload_json) as T;
          } catch {
            return null;
          }
        },
        put: (id, value) => {
          const safeId = assertSafeName(id, "record id");
          const metadata = extractRecordMetadata(value);
          putStmt.run({
            collection_name: collectionName,
            record_id: safeId,
            payload_json: JSON.stringify(value),
            updated_at: metadata.updatedAt,
            archived_at: metadata.archivedAt,
          });
          return value;
        },
        remove: (id) => {
          removeStmt.run(collectionName, assertSafeName(id, "record id"));
        },
      };
    },
  };
}
