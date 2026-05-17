import type { SqliteDb } from "./db.ts";
import {
  aeadOpen,
  aeadSeal,
  deriveKey,
  fromBase64,
  generateSalt,
  toBase64,
} from "./crypto.ts";
import { ARGON2_DEFAULT_PARAMS, type Argon2Params } from "./calibration.ts";

const BACKUP_FORMAT = "clawix-secrets-backup-v1";
const BACKUP_AAD = "clawix-secrets-backup-v1|payload";

const BACKUP_TABLES = [
  "schema_version",
  "tenants",
  "users",
  "principals",
  "secrets_meta",
  "folders",
  "secrets",
  "secret_versions",
  "secret_fields",
  "secret_notes",
  "attachments",
  "secret_ephemeral_authorizations",
  "agent_grants",
  "leases",
  "policies",
  "audit_events",
  "secret_session_cache",
  "secret_synced_resources",
  "plugin_registry",
];

type BackupScalar = string | number | null | { __binary: string };

interface TableSnapshot {
  name: string;
  blobColumns: string[];
  rows: Record<string, BackupScalar>[];
}

interface LogicalBackup {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  schemaVersion: number | null;
  tables: TableSnapshot[];
}

interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  kdf: {
    algorithm: "argon2id";
    params: Argon2Params;
    salt: string;
  };
  aead: {
    algorithm: "chacha20-poly1305";
    aad: typeof BACKUP_AAD;
    ciphertext: string;
  };
}

function tableBlobColumns(db: SqliteDb, table: string): Set<string> {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>;
  return new Set(columns.filter((column) => column.type.toUpperCase().includes("BLOB")).map((column) => column.name));
}

function encodeCell(value: unknown, isBlob: boolean): BackupScalar {
  if (value === null || value === undefined) return null;
  if (isBlob) {
    if (!Buffer.isBuffer(value)) throw new Error("Expected SQLite BLOB column to be a Buffer");
    return { __binary: value.toString("base64") };
  }
  if (typeof value === "string" || typeof value === "number") return value;
  throw new Error(`Unsupported SQLite value in backup: ${typeof value}`);
}

function decodeCell(value: BackupScalar, isBlob: boolean): unknown {
  if (value === null) return null;
  if (isBlob) {
    if (typeof value !== "object" || !("__binary" in value)) throw new Error("Invalid BLOB backup cell");
    return Buffer.from(value.__binary, "base64");
  }
  if (typeof value === "object") throw new Error("Unexpected binary backup cell in non-BLOB column");
  return value;
}

function scrubHostBoundMeta(row: Record<string, BackupScalar>): Record<string, BackupScalar> {
  if (typeof row.snapshot_json !== "string") return row;
  const snapshot = JSON.parse(row.snapshot_json) as { platformKeyWrap?: unknown };
  delete snapshot.platformKeyWrap;
  return { ...row, snapshot_json: JSON.stringify(snapshot) };
}

function exportLogicalBackup(db: SqliteDb): LogicalBackup {
  const schema = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | undefined;
  const tables = BACKUP_TABLES.map((table) => {
    const blobColumns = tableBlobColumns(db, table);
    const rows = (db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]).map((row) => {
      const out: Record<string, BackupScalar> = {};
      for (const [key, value] of Object.entries(row)) {
        out[key] = encodeCell(value, blobColumns.has(key));
      }
      return table === "secrets_meta" ? scrubHostBoundMeta(out) : out;
    });
    return { name: table, blobColumns: [...blobColumns], rows };
  });
  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    schemaVersion: schema?.version ?? null,
    tables,
  };
}

export function restoreLogicalBackup(db: SqliteDb, backup: LogicalBackup): { tables: number; rows: number; secrets: number; folders: number } {
  if (backup.format !== BACKUP_FORMAT) throw new Error("Unsupported backup format");
  const byName = new Map(backup.tables.map((table) => [table.name, table]));
  for (const name of BACKUP_TABLES) {
    if (!byName.has(name)) throw new Error(`Backup missing table: ${name}`);
  }

  db.pragma("foreign_keys = OFF");
  try {
    const restore = db.transaction(() => {
      for (const table of [...BACKUP_TABLES].reverse()) {
        db.prepare(`DELETE FROM ${table}`).run();
      }
      for (const tableName of BACKUP_TABLES) {
        const table = byName.get(tableName)!;
        for (const row of table.rows) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;
          const placeholders = keys.map(() => "?").join(", ");
          const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders})`;
          const blobColumns = new Set(table.blobColumns);
          const values = keys.map((key) => decodeCell(row[key], blobColumns.has(key)));
          db.prepare(sql).run(...values);
        }
      }
    });
    restore();
  } finally {
    db.pragma("foreign_keys = ON");
  }

  const integrity = db.prepare("PRAGMA foreign_key_check").all();
  if (integrity.length > 0) throw new Error("Restored backup failed foreign key validation");
  return {
    tables: backup.tables.length,
    rows: backup.tables.reduce((sum, table) => sum + table.rows.length, 0),
    secrets: byName.get("secrets")?.rows.length ?? 0,
    folders: byName.get("folders")?.rows.length ?? 0,
  };
}

export function encryptBackup(db: SqliteDb, passphrase: string): EncryptedBackup {
  if (!passphrase) throw new Error("Backup passphrase required");
  const logical = exportLogicalBackup(db);
  const salt = generateSalt();
  const key = deriveKey(passphrase, salt, ARGON2_DEFAULT_PARAMS);
  try {
    const plaintext = new TextEncoder().encode(JSON.stringify(logical));
    const ciphertext = aeadSeal(key, plaintext, BACKUP_AAD);
    return {
      format: BACKUP_FORMAT,
      exportedAt: logical.exportedAt,
      kdf: {
        algorithm: "argon2id",
        params: ARGON2_DEFAULT_PARAMS,
        salt: toBase64(salt),
      },
      aead: {
        algorithm: "chacha20-poly1305",
        aad: BACKUP_AAD,
        ciphertext: toBase64(ciphertext),
      },
    };
  } finally {
    key.fill(0);
  }
}

export function decryptBackup(payload: unknown, passphrase: string): LogicalBackup {
  if (!passphrase) throw new Error("Backup passphrase required");
  const backup = payload as EncryptedBackup;
  if (backup?.format !== BACKUP_FORMAT) throw new Error("Unsupported backup format");
  if (backup.kdf?.algorithm !== "argon2id") throw new Error("Unsupported backup KDF");
  if (backup.aead?.algorithm !== "chacha20-poly1305" || backup.aead.aad !== BACKUP_AAD) {
    throw new Error("Unsupported backup encryption");
  }
  const key = deriveKey(passphrase, fromBase64(backup.kdf.salt), backup.kdf.params);
  try {
    const plaintext = aeadOpen(key, fromBase64(backup.aead.ciphertext), BACKUP_AAD);
    const logical = JSON.parse(new TextDecoder().decode(plaintext)) as LogicalBackup;
    if (logical.format !== BACKUP_FORMAT) throw new Error("Unsupported logical backup format");
    return logical;
  } finally {
    key.fill(0);
  }
}

export const CLAW_SECRETS_BACKUP_FORMAT = BACKUP_FORMAT;
