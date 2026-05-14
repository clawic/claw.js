// Clawix-grade SQLite schema. Replaces the prior thin schema with the
// full data model needed to host the merged Clawix Secrets + Secrets
// Secrets feature set under ClawJS Secrets.
//
// All tables carry `tenant_id` so the multitenant infra of ClawJS is
// preserved. Clawix Mac uses a fixed tenant ("clawix-local") + an
// implicit single user; the schema is ready to grow without migration.

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import {
  toBase64,
  fromBase64,
  type SecretsMetaSnapshot,
} from "./crypto.ts";

export type SqliteDb = Database.Database;

// ---------- Schema ----------

const SCHEMA_VERSION = 2;

const DDL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS principals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS secrets_meta (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  trashed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  type_id TEXT,
  internal_name TEXT NOT NULL,
  title TEXT NOT NULL,
  wrapped_item_key BLOB NOT NULL,
  current_version_id TEXT,
  -- Governance
  allowed_hosts_json TEXT NOT NULL DEFAULT '[]',
  allowed_headers_json TEXT NOT NULL DEFAULT '[]',
  allow_in_url INTEGER NOT NULL DEFAULT 0,
  allow_in_body INTEGER NOT NULL DEFAULT 0,
  allow_in_env INTEGER NOT NULL DEFAULT 0,
  allow_insecure_transport INTEGER NOT NULL DEFAULT 0,
  allow_local_network INTEGER NOT NULL DEFAULT 0,
  allowed_agents_json TEXT,
  approval_mode TEXT NOT NULL DEFAULT 'auto',
  approval_window_minutes INTEGER,
  ttl_expires_at TEXT,
  max_uses INTEGER,
  rotation_reminder_days INTEGER,
  redaction_label TEXT,
  clipboard_clear_seconds INTEGER,
  audit_retention_days INTEGER,
  requires_vpn INTEGER NOT NULL DEFAULT 0,
  vpn_profile_name TEXT,
  -- States
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_compromised INTEGER NOT NULL DEFAULT 0,
  is_compromised_reason TEXT,
  is_locked INTEGER NOT NULL DEFAULT 0,
  read_only INTEGER NOT NULL DEFAULT 0,
  trashed_at TEXT,
  -- Counters
  use_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  last_rotated_at TEXT,
  -- Misc
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, internal_name)
);

CREATE INDEX IF NOT EXISTS idx_secrets_tenant ON secrets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_secrets_tenant_internal ON secrets(tenant_id, internal_name);
CREATE INDEX IF NOT EXISTS idx_secrets_folder ON secrets(folder_id);

CREATE TABLE IF NOT EXISTS secret_versions (
  id TEXT PRIMARY KEY,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  reason TEXT NOT NULL,
  diff_summary TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(secret_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_versions_secret ON secret_versions(secret_id);

CREATE TABLE IF NOT EXISTS secret_fields (
  id TEXT PRIMARY KEY,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES secret_versions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_kind TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'none',
  is_secret INTEGER NOT NULL DEFAULT 0,
  is_concealed INTEGER NOT NULL DEFAULT 0,
  public_value TEXT,
  value_ciphertext BLOB,
  otp_period INTEGER,
  otp_digits INTEGER,
  otp_algorithm TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fields_version ON secret_fields(version_id);

CREATE TABLE IF NOT EXISTS secret_notes (
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES secret_versions(id) ON DELETE CASCADE,
  ciphertext BLOB,
  PRIMARY KEY (secret_id, version_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES secret_versions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER NOT NULL,
  wrapped_attachment_key BLOB NOT NULL,
  ciphertext BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_version ON attachments(version_id);

CREATE TABLE IF NOT EXISTS secret_ephemeral_authorizations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ephemeral_secret ON secret_ephemeral_authorizations(secret_id);
CREATE INDEX IF NOT EXISTS idx_ephemeral_expires ON secret_ephemeral_authorizations(expires_at);

CREATE TABLE IF NOT EXISTS agent_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  capability_kind TEXT NOT NULL,
  capability_scope_json TEXT,
  secrets_capabilities_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_grants_tenant ON agent_grants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_grants_secret ON agent_grants(secret_id);
CREATE INDEX IF NOT EXISTS idx_grants_token ON agent_grants(token_hash);

CREATE TABLE IF NOT EXISTS leases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  context_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_leases_secret ON leases(secret_id);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  capability TEXT NOT NULL,
  effect TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policies_tenant ON policies(tenant_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  secret_id TEXT,
  folder_id TEXT,
  version_id TEXT,
  kind TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  success INTEGER,
  device_id TEXT,
  session_id TEXT,
  wrapped_event_key BLOB NOT NULL,
  payload_ciphertext BLOB NOT NULL,
  prev_hash BLOB NOT NULL,
  self_hash BLOB NOT NULL,
  sequence INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_seq ON audit_events(tenant_id, sequence);
CREATE INDEX IF NOT EXISTS idx_audit_secret ON audit_events(secret_id);
CREATE INDEX IF NOT EXISTS idx_audit_kind ON audit_events(kind);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);

CREATE TABLE IF NOT EXISTS secret_session_cache (
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  wrapped_token BLOB NOT NULL,
  expires_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  PRIMARY KEY (secret_id, cache_key)
);

CREATE TABLE IF NOT EXISTS secret_synced_resources (
  id TEXT PRIMARY KEY,
  secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_metadata_json TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  UNIQUE(secret_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_secret ON secret_synced_resources(secret_id);

CREATE TABLE IF NOT EXISTS plugin_registry (
  plugin_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  installed_at TEXT NOT NULL
);
`;

// ---------- SecretsMeta serialization ----------

interface SerializedMeta {
  formatVersion: number;
  cryptoVersion: number;
  schemaVersion: number;
  appVersionAtSetup: string;
  deviceId: string;
  createdAt: string;
  kdfSalt: string;
  kdfParams: { t: number; m: number; p: number };
  verifier: string;
  recoverySalt: string;
  recoveryParams: { t: number; m: number; p: number };
  recoveryWrap: string;
  auditMacKeyWrap: string;
  auditChainGenesis: string;
  platformKeyWrap?: string;
}

export function serializeSecretsMeta(meta: SecretsMetaSnapshot): string {
  const obj: SerializedMeta = {
    formatVersion: meta.formatVersion,
    cryptoVersion: meta.cryptoVersion,
    schemaVersion: meta.schemaVersion,
    appVersionAtSetup: meta.appVersionAtSetup,
    deviceId: meta.deviceId,
    createdAt: meta.createdAt,
    kdfSalt: toBase64(meta.kdfSalt),
    kdfParams: meta.kdfParams,
    verifier: toBase64(meta.verifier),
    recoverySalt: toBase64(meta.recoverySalt),
    recoveryParams: meta.recoveryParams,
    recoveryWrap: toBase64(meta.recoveryWrap),
    auditMacKeyWrap: toBase64(meta.auditMacKeyWrap),
    auditChainGenesis: toBase64(meta.auditChainGenesis),
    ...(meta.platformKeyWrap ? { platformKeyWrap: toBase64(meta.platformKeyWrap) } : {}),
  };
  return JSON.stringify(obj);
}

export function deserializeSecretsMeta(json: string): SecretsMetaSnapshot {
  const obj = JSON.parse(json) as SerializedMeta;
  return {
    formatVersion: obj.formatVersion,
    cryptoVersion: obj.cryptoVersion,
    schemaVersion: obj.schemaVersion,
    appVersionAtSetup: obj.appVersionAtSetup,
    deviceId: obj.deviceId,
    createdAt: obj.createdAt,
    kdfSalt: fromBase64(obj.kdfSalt),
    kdfParams: obj.kdfParams,
    verifier: fromBase64(obj.verifier),
    recoverySalt: fromBase64(obj.recoverySalt),
    recoveryParams: obj.recoveryParams,
    recoveryWrap: fromBase64(obj.recoveryWrap),
    auditMacKeyWrap: fromBase64(obj.auditMacKeyWrap),
    auditChainGenesis: fromBase64(obj.auditChainGenesis),
    ...(obj.platformKeyWrap ? { platformKeyWrap: fromBase64(obj.platformKeyWrap) } : {}),
  };
}

// ---------- Database open + migrate ----------

export function openDatabase(dbPath: string): SqliteDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.exec(DDL);
  ensureSchemaVersion(db);
  return db;
}

function ensureSchemaVersion(db: SqliteDb): void {
  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
    return;
  }
  if (row.version !== SCHEMA_VERSION) {
    db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION);
  }
}

// ---------- Row types ----------

export type ApprovalMode = "auto" | "window" | "every-use";
export type Placement = "header" | "query" | "body" | "env" | "none";
export type FieldKind =
  | "text"
  | "password"
  | "url"
  | "email"
  | "number"
  | "otp"
  | "note"
  | "reference";
export type VersionReason =
  | "create"
  | "edit"
  | "rotate"
  | "import"
  | "restore"
  | "proxyRefresh";
export type VersionAuthor = "ui" | "admin" | "proxy" | "system";
export type AuditSource = "proxy" | "ui" | "admin" | "system";
export type LeaseMode = "process" | "browser";

export interface TenantRow {
  id: string;
  label: string;
  created_at: string;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: "tenant_admin" | "tenant_operator";
  created_at: string;
}

export interface PrincipalRow {
  id: string;
  tenant_id: string;
  type: "service_principal" | "sidecar_principal";
  label: string;
  token_hash: string;
  created_at: string;
  last_used_at: string | null;
}

export interface FolderRow {
  id: string;
  tenant_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SecretRow {
  id: string;
  tenant_id: string;
  folder_id: string | null;
  type_id: string | null;
  internal_name: string;
  title: string;
  wrapped_item_key: Buffer;
  current_version_id: string | null;
  allowed_hosts_json: string;
  allowed_headers_json: string;
  allow_in_url: number;
  allow_in_body: number;
  allow_in_env: number;
  allow_insecure_transport: number;
  allow_local_network: number;
  allowed_agents_json: string | null;
  approval_mode: ApprovalMode;
  approval_window_minutes: number | null;
  ttl_expires_at: string | null;
  max_uses: number | null;
  rotation_reminder_days: number | null;
  redaction_label: string | null;
  clipboard_clear_seconds: number | null;
  audit_retention_days: number | null;
  requires_vpn: number;
  vpn_profile_name: string | null;
  is_archived: number;
  is_compromised: number;
  is_compromised_reason: string | null;
  is_locked: number;
  read_only: number;
  trashed_at: string | null;
  use_count: number;
  last_used_at: string | null;
  last_rotated_at: string | null;
  tags_json: string;
  created_at: string;
  updated_at: string;
}

export interface SecretVersionRow {
  id: string;
  secret_id: string;
  version_number: number;
  reason: VersionReason;
  diff_summary: string | null;
  created_at: string;
  created_by: VersionAuthor;
}

export interface SecretFieldRow {
  id: string;
  secret_id: string;
  version_id: string;
  field_name: string;
  field_kind: FieldKind;
  placement: Placement;
  is_secret: number;
  is_concealed: number;
  public_value: string | null;
  value_ciphertext: Buffer | null;
  otp_period: number | null;
  otp_digits: number | null;
  otp_algorithm: string | null;
  sort_order: number;
}

export interface SecretNotesRow {
  secret_id: string;
  version_id: string;
  ciphertext: Buffer | null;
}

export interface AttachmentRow {
  id: string;
  secret_id: string;
  version_id: string;
  filename: string;
  mime_type: string | null;
  size: number;
  wrapped_attachment_key: Buffer;
  ciphertext: Buffer;
  created_at: string;
}

export interface EphemeralAuthorizationRow {
  id: string;
  tenant_id: string;
  secret_id: string;
  kind: string;
  scope_json: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface AgentGrantRow {
  id: string;
  tenant_id: string;
  agent: string;
  secret_id: string;
  capability_kind: string;
  capability_scope_json: string | null;
  secrets_capabilities_json: string;
  reason: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  used_count: number;
  last_used_at: string | null;
}

export interface LeaseRow {
  id: string;
  tenant_id: string;
  secret_id: string;
  mode: LeaseMode;
  token_hash: string;
  context_json: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
}

export interface PolicyRow {
  id: string;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  secret_name: string;
  capability: string;
  effect: "allow" | "deny";
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  tenant_id: string;
  secret_id: string | null;
  folder_id: string | null;
  version_id: string | null;
  kind: string;
  timestamp: string;
  source: AuditSource;
  success: number | null;
  device_id: string | null;
  session_id: string | null;
  wrapped_event_key: Buffer;
  payload_ciphertext: Buffer;
  prev_hash: Buffer;
  self_hash: Buffer;
  sequence: number;
}

export interface SecretSessionCacheRow {
  secret_id: string;
  cache_key: string;
  wrapped_token: Buffer;
  expires_at: string;
  refreshed_at: string;
}

export interface SecretSyncedResourceRow {
  id: string;
  secret_id: string;
  resource_type: string;
  resource_id: string;
  resource_metadata_json: string;
  synced_at: string;
}

export interface PluginRegistryRow {
  plugin_id: string;
  version: string;
  manifest_json: string;
  installed_at: string;
}

// ---------- Helpers ----------

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function asUint8Array(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function parseJsonArray<T = string>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
