import type { DB } from "../db/index.ts";

/**
 * Adapter-facing idempotency store. Keys are scoped to (workspace, adapter)
 * via the caller; this store is workspace-agnostic and simply maps key→post_id.
 * Backed by the `setting` table under scope='global', key='idem:...'.
 */
export function makeIdempotencyStore(db: DB) {
  return {
    async lookup(key: string): Promise<string | null> {
      const row = db
        .prepare(`SELECT value FROM setting WHERE scope = 'global' AND workspace_id IS NULL AND key = ?`)
        .get(`idem:${key}`) as { value: string } | undefined;
      return row ? row.value : null;
    },
    async record(key: string, providerPostId: string): Promise<void> {
      db.prepare(
        `INSERT INTO setting (scope, workspace_id, key, value) VALUES ('global', NULL, ?, ?)
         ON CONFLICT(scope, workspace_id, key) DO UPDATE SET value = excluded.value`,
      ).run(`idem:${key}`, providerPostId);
    },
  };
}
