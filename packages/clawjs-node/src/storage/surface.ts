import { clawPersistentSurface } from "@clawjs/core";

const source = { file: "packages/clawjs-node/src/storage/surface.ts", language: "typescript" } as const;

const schemaSurfaceNodes = [
  clawPersistentSurface.table({ id: `claw.database.drive.table.storage_objects`, name: "storage_objects", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.table({ id: `claw.database.drive.table.storage_tokens`, name: "storage_tokens", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.table({ id: `claw.database.drive.table.storage_shares`, name: "storage_shares", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.index({ id: `claw.database.drive.index.storage_objects_bucket_key_idx`, name: "storage_objects_bucket_key_idx", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.index({ id: `claw.database.drive.index.storage_objects_blob_path_idx`, name: "storage_objects_blob_path_idx", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.index({ id: `claw.database.drive.index.storage_shares_snapshot_blob_path_idx`, name: "storage_shares_snapshot_blob_path_idx", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.index({ id: `claw.database.drive.index.storage_tokens_token_hash_active_idx`, name: "storage_tokens_token_hash_active_idx", parentId: "claw.database.drive", databaseId: "claw.database.drive", source }),
  clawPersistentSurface.index({ id: `claw.database.drive.index.storage_tokens_owner_active_created_idx`, name: "storage_tokens_owner_active_created_idx", parentId: "claw.database.drive", databaseId: "claw.database.drive", source })
];

export const STORAGE_STORE_SCHEMA_SQL = String.raw`
      CREATE TABLE IF NOT EXISTS storage_objects (
        bucket TEXT NOT NULL,
        object_key TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        blob_path TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by_agent_id TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'internal',
        PRIMARY KEY (bucket, object_key)
      );

      CREATE INDEX IF NOT EXISTS storage_objects_bucket_key_idx
      ON storage_objects (bucket, object_key);

      CREATE INDEX IF NOT EXISTS storage_objects_blob_path_idx
      ON storage_objects (blob_path);

      CREATE TABLE IF NOT EXISTS storage_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        grants_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        is_owner INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS storage_tokens_token_hash_active_idx
      ON storage_tokens (token_hash)
      WHERE revoked_at IS NULL;

      CREATE INDEX IF NOT EXISTS storage_tokens_owner_active_created_idx
      ON storage_tokens (is_owner, created_at DESC)
      WHERE revoked_at IS NULL;

      CREATE TABLE IF NOT EXISTS storage_shares (
        id TEXT PRIMARY KEY,
        bucket TEXT NOT NULL,
        object_key TEXT NOT NULL,
        label TEXT NOT NULL,
        legal_label TEXT NOT NULL DEFAULT 'legacy-unlabeled-export',
        approval_id TEXT NOT NULL DEFAULT 'legacy-missing-approval',
        mode TEXT NOT NULL,
        url TEXT NOT NULL,
        external_item_id TEXT,
        external_share_id TEXT,
        snapshot_blob_path TEXT NOT NULL DEFAULT '',
        snapshot_size_bytes INTEGER NOT NULL DEFAULT 0,
        snapshot_content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        snapshot_sha256 TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT
      );

      CREATE INDEX IF NOT EXISTS storage_shares_snapshot_blob_path_idx
      ON storage_shares (snapshot_blob_path);
    `;
