import crypto from "crypto";
import fs from "fs";
import path from "path";
import { STORAGE_STORE_SCHEMA_SQL } from "./surface.ts";

import Database from "better-sqlite3";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { resolveClawGlobalDataRoot } from "../surface-paths.ts";

export type StorageOperation =
  | "objects:list"
  | "objects:read"
  | "objects:write"
  | "objects:delete"
  | "shares:create"
  | "shares:revoke";

export type StorageVisibility = "internal" | "drive";

export interface StorageRef {
  bucket: string;
  key: string;
}

export interface StorageObject extends StorageRef {
  sizeBytes: number;
  contentType: string;
  sha256: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdByAgentId: string;
  filePath: string;
  visibility: StorageVisibility;
}

export interface StorageGetResult extends StorageObject {
  buffer: Buffer;
}

export interface StorageGrant {
  bucket: string;
  prefix?: string;
  operations: StorageOperation[];
}

export interface StorageScopedToken {
  id: string;
  label: string;
  grants: StorageGrant[];
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  isOwner?: boolean;
}

export interface StorageShare {
  id: string;
  bucket: string;
  key: string;
  label: string;
  mode: "read";
  url: string;
  externalItemId?: string;
  externalShareId?: string;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

export interface StoragePutInput {
  bucket?: string;
  key: string;
  data: string | Uint8Array;
  contentType?: string;
  metadata?: Record<string, unknown>;
  visibility?: StorageVisibility;
}

export interface StorageListInput {
  bucket?: string;
  prefix?: string;
  limit?: number;
}

export interface StorageShareAdapter {
  create(input: StorageGetResult & { label: string; expiresAt?: string | null }): Promise<{
    url: string;
    externalItemId?: string;
    externalShareId?: string;
  }>;
  revoke(share: StorageShare): Promise<void>;
}

export interface StorageDriveIndexAdapter {
  index(object: StorageObject): void;
  remove(ref: StorageRef): void;
}

export interface StorageStoreOptions {
  workspaceDir: string;
  agentId: string;
  grants?: StorageGrant[];
  filesystem?: NodeFileSystemHost;
  shareAdapter?: StorageShareAdapter;
  driveIndexAdapter?: StorageDriveIndexAdapter;
  includeDefaultGrants?: boolean;
  rawKeys?: boolean;
  ownerMode?: boolean;
}

interface ObjectRow {
  bucket: string;
  object_key: string;
  size_bytes: number;
  content_type: string;
  sha256: string;
  blob_path: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  created_by_agent_id: string;
  visibility: StorageVisibility;
}

interface TokenRow {
  id: string;
  label: string;
  token_hash: string;
  grants_json: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  is_owner: number;
}

interface ShareRow {
  id: string;
  bucket: string;
  object_key: string;
  label: string;
  mode: "read";
  url: string;
  external_item_id: string | null;
  external_share_id: string | null;
  snapshot_blob_path: string;
  snapshot_size_bytes: number;
  snapshot_content_type: string;
  snapshot_sha256: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

const DEFAULT_BUCKET = "workspace";
const VALID_OPERATIONS = new Set<StorageOperation>([
  "objects:list",
  "objects:read",
  "objects:write",
  "objects:delete",
  "shares:create",
  "shares:revoke",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeBucket(bucket?: string): string {
  const value = (bucket ?? DEFAULT_BUCKET).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid storage bucket: ${bucket ?? ""}`);
  }
  return value;
}

function normalizeKey(key: string): string {
  const value = key.trim();
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized === "."
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || normalized.includes("//")
  ) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return normalized;
}

function normalizePrefix(prefix?: string): string {
  if (!prefix?.trim()) return "";
  const normalized = normalizeKey(prefix);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizeVisibility(visibility?: StorageVisibility): StorageVisibility {
  if (!visibility) return "internal";
  if (visibility !== "internal" && visibility !== "drive") {
    throw new Error(`Invalid storage visibility: ${visibility}`);
  }
  return visibility;
}

function normalizeExpiresAt(input: { expiresAt?: string | null; ttlMs?: number }): string | null {
  if (input.expiresAt === null) return null;
  if (typeof input.expiresAt === "string" && input.expiresAt.trim()) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid storage share expiration: ${input.expiresAt}`);
    return parsed.toISOString();
  }
  if (input.ttlMs !== undefined) {
    if (!Number.isFinite(input.ttlMs) || input.ttlMs <= 0) throw new Error("Storage share ttlMs must be positive.");
    return new Date(Date.now() + input.ttlMs).toISOString();
  }
  return null;
}

function toBuffer(data: string | Uint8Array): Buffer {
  if (typeof data !== "string") return Buffer.from(data);
  return Buffer.from(data, "utf8");
}

function dataRoot(workspaceDir: string): string {
  return resolveClawGlobalDataRoot();
}

function storageDbPath(workspaceDir: string): string {
  return path.join(dataRoot(workspaceDir), "drive.sqlite");
}

function blobsDir(workspaceDir: string): string {
  return path.join(dataRoot(workspaceDir), "blobs");
}

function serializeObject(row: ObjectRow, rootBlobsDir: string): StorageObject {
  return {
    bucket: row.bucket,
    key: row.object_key,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    sha256: row.sha256,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByAgentId: row.created_by_agent_id,
    filePath: path.join(rootBlobsDir, row.blob_path),
    visibility: row.visibility ?? "internal",
  };
}

function serializeToken(row: TokenRow): StorageScopedToken {
  return {
    id: row.id,
    label: row.label,
    grants: parseJson<StorageGrant[]>(row.grants_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    isOwner: Boolean(row.is_owner),
  };
}

function serializeShare(row: ShareRow): StorageShare {
  return {
    id: row.id,
    bucket: row.bucket,
    key: row.object_key,
    label: row.label,
    mode: row.mode,
    url: row.url,
    ...(row.external_item_id ? { externalItemId: row.external_item_id } : {}),
    ...(row.external_share_id ? { externalShareId: row.external_share_id } : {}),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function defaultGrants(agentId: string): StorageGrant[] {
  return [
    {
      bucket: DEFAULT_BUCKET,
      prefix: `agents/${agentId}/`,
      operations: ["objects:list", "objects:read", "objects:write", "objects:delete", "shares:create", "shares:revoke"],
    },
    {
      bucket: DEFAULT_BUCKET,
      prefix: "shared/",
      operations: ["objects:list", "objects:read"],
    },
  ];
}

function normalizeGrants(grants: StorageGrant[]): StorageGrant[] {
  return grants.map((grant) => {
    const operations = [...new Set(grant.operations)];
    if (operations.length === 0) throw new Error("Storage grants require at least one operation.");
    for (const operation of operations) {
      if (!VALID_OPERATIONS.has(operation)) throw new Error(`Invalid storage operation: ${operation}`);
    }
    return {
      bucket: normalizeBucket(grant.bucket),
      ...(grant.prefix !== undefined ? { prefix: normalizePrefix(grant.prefix) } : {}),
      operations,
    };
  });
}

function keyMatchesGrant(key: string, prefix?: string): boolean {
  if (!prefix) return true;
  return key === prefix.slice(0, -1) || key.startsWith(prefix);
}

export class LocalStorageStore {
  private readonly sqlite: Database.Database;
  private readonly filesystem: NodeFileSystemHost;
  private readonly rootBlobsDir: string;
  private readonly grants: StorageGrant[];
  private readonly shareAdapter?: StorageShareAdapter;
  private readonly driveIndexAdapter?: StorageDriveIndexAdapter;
  private readonly options: StorageStoreOptions;

  constructor(options: StorageStoreOptions) {
    this.options = options;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
    this.rootBlobsDir = blobsDir(options.workspaceDir);
    this.filesystem.ensureDir(dataRoot(options.workspaceDir));
    this.filesystem.ensureDir(this.rootBlobsDir);
    this.sqlite = new Database(storageDbPath(options.workspaceDir));
    this.sqlite.pragma("journal_mode = WAL");
    this.grants = normalizeGrants([
      ...(options.grants ?? []),
      ...(options.includeDefaultGrants === false ? [] : defaultGrants(options.agentId)),
    ]);
    this.shareAdapter = options.shareAdapter;
    this.driveIndexAdapter = options.driveIndexAdapter;
    this.init();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(STORAGE_STORE_SCHEMA_SQL);
    this.ensureColumn("storage_objects", "visibility", "TEXT NOT NULL DEFAULT 'internal'");
    this.ensureColumn("storage_tokens", "is_owner", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("storage_shares", "snapshot_blob_path", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("storage_shares", "snapshot_size_bytes", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("storage_shares", "snapshot_content_type", "TEXT NOT NULL DEFAULT 'application/octet-stream'");
    this.ensureColumn("storage_shares", "snapshot_sha256", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("storage_shares", "expires_at", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (columns.some((entry) => entry.name === column)) return;
    this.sqlite.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }

  private resolveKeyForWrite(key: string): string {
    const normalized = normalizeKey(key);
    if (this.options.rawKeys) return normalized;
    if (normalized.startsWith("agents/") || normalized.startsWith("shared/")) return normalized;
    return `agents/${this.options.agentId}/${normalized}`;
  }

  private resolveKeyForRead(key: string): string {
    const normalized = normalizeKey(key);
    if (this.options.rawKeys) return normalized;
    if (normalized.startsWith("agents/") || normalized.startsWith("shared/")) return normalized;
    return `agents/${this.options.agentId}/${normalized}`;
  }

  private resolvePrefix(prefix?: string): string {
    if (prefix?.trim()) return normalizePrefix(prefix);
    if (this.options.ownerMode) return "";
    return `agents/${this.options.agentId}/`;
  }

  private assertAllowed(bucket: string, key: string, operation: StorageOperation): void {
    if (this.options.ownerMode) return;
    const allowed = this.grants.some((grant) => (
      grant.bucket === bucket
      && grant.operations.includes(operation)
      && keyMatchesGrant(key, grant.prefix)
    ));
    if (!allowed) {
      throw new Error(`Storage operation ${operation} is not allowed for ${bucket}:${key}`);
    }
  }

  put(input: StoragePutInput): StorageObject {
    const bucket = normalizeBucket(input.bucket);
    const key = this.resolveKeyForWrite(input.key);
    this.assertAllowed(bucket, key, "objects:write");

    const buffer = toBuffer(input.data);
    const digest = sha256(buffer);
    const relativeBlobPath = path.join(digest.slice(0, 2), digest);
    const absoluteBlobPath = path.join(this.rootBlobsDir, relativeBlobPath);
    this.filesystem.withLockRetry(resolveFileLockPath(absoluteBlobPath), () => {
      if (!this.filesystem.exists(absoluteBlobPath)) {
        this.filesystem.ensureDir(path.dirname(absoluteBlobPath));
        fs.writeFileSync(absoluteBlobPath, buffer);
      }
    });

    const existing = this.getRow(bucket, key);
    const now = nowIso();
    const createdAt = existing?.created_at ?? now;
    const visibility = normalizeVisibility(input.visibility);
    const writeObject = this.sqlite.transaction(() => {
      this.sqlite.prepare(`
      INSERT INTO storage_objects (
        bucket, object_key, size_bytes, content_type, sha256, blob_path,
        metadata_json, created_at, updated_at, created_by_agent_id, visibility
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(bucket, object_key) DO UPDATE SET
        size_bytes = excluded.size_bytes,
        content_type = excluded.content_type,
        sha256 = excluded.sha256,
        blob_path = excluded.blob_path,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at,
        created_by_agent_id = excluded.created_by_agent_id,
        visibility = excluded.visibility
      `).run(
        bucket,
        key,
        buffer.byteLength,
        input.contentType?.trim() || "application/octet-stream",
        digest,
        relativeBlobPath,
        JSON.stringify(input.metadata ?? {}),
        createdAt,
        now,
        this.options.agentId,
        visibility,
      );
      if (existing?.blob_path && existing.blob_path !== relativeBlobPath) this.removeBlobIfUnreferenced(existing.blob_path);
    });
    writeObject();
    const object = this.head({ bucket, key })!;
    if (object.visibility === "drive") this.driveIndexAdapter?.index(object);
    return object;
  }

  putFile(input: Omit<StoragePutInput, "data"> & { filePath: string }): StorageObject {
    return this.put({
      ...input,
      data: fs.readFileSync(input.filePath),
    });
  }

  head(ref: Partial<StorageRef> & { key: string }): StorageObject | null {
    const bucket = normalizeBucket(ref.bucket);
    const key = this.resolveKeyForRead(ref.key);
    this.assertAllowed(bucket, key, "objects:read");
    const row = this.getRow(bucket, key);
    return row ? serializeObject(row, this.rootBlobsDir) : null;
  }

  get(ref: Partial<StorageRef> & { key: string }): StorageGetResult | null {
    const object = this.head(ref);
    if (!object || !this.filesystem.exists(object.filePath)) return null;
    return {
      ...object,
      buffer: fs.readFileSync(object.filePath),
    };
  }

  list(input: StorageListInput = {}): StorageObject[] {
    const bucket = normalizeBucket(input.bucket);
    const prefix = this.resolvePrefix(input.prefix);
    this.assertAllowed(bucket, prefix, "objects:list");
    const limit = Math.max(1, input.limit ?? Number.MAX_SAFE_INTEGER);
    return (this.sqlite.prepare(`
      SELECT bucket, object_key, size_bytes, content_type, sha256, blob_path,
        metadata_json, created_at, updated_at, created_by_agent_id, visibility
      FROM storage_objects
      WHERE bucket = ? AND object_key LIKE ?
      ORDER BY object_key ASC
      LIMIT ?
    `).all(bucket, `${prefix}%`, limit) as ObjectRow[])
      .map((row) => serializeObject(row, this.rootBlobsDir));
  }

  delete(ref: Partial<StorageRef> & { key: string }): boolean {
    const bucket = normalizeBucket(ref.bucket);
    const key = this.resolveKeyForWrite(ref.key);
    this.assertAllowed(bucket, key, "objects:delete");
    const row = this.getRow(bucket, key);
    if (!row) return false;
    const removed = this.sqlite.prepare("DELETE FROM storage_objects WHERE bucket = ? AND object_key = ?").run(bucket, key).changes > 0;
    if (removed) {
      if (row.visibility === "drive") this.driveIndexAdapter?.remove({ bucket, key });
      this.removeBlobIfUnreferenced(row.blob_path);
    }
    return removed;
  }

  readText(ref: Partial<StorageRef> & { key: string }): string | null {
    const object = this.get(ref);
    return object ? object.buffer.toString("utf8") : null;
  }

  writeText(input: { bucket?: string; key: string; content: string; contentType?: string; metadata?: Record<string, unknown>; visibility?: StorageVisibility }): StorageObject {
    return this.put({
      bucket: input.bucket,
      key: input.key,
      data: input.content,
      contentType: input.contentType ?? "text/plain; charset=utf-8",
      metadata: input.metadata,
      visibility: input.visibility,
    });
  }

  exportToFile(ref: Partial<StorageRef> & { key: string; filePath: string }): StorageObject | null {
    const object = this.get(ref);
    if (!object) return null;
    this.filesystem.ensureDir(path.dirname(ref.filePath));
    fs.writeFileSync(ref.filePath, object.buffer);
    return object;
  }

  issueToken(input: { label?: string; grants: StorageGrant[] }): { record: StorageScopedToken; token: string } {
    const grants = normalizeGrants(input.grants);
    for (const grant of grants) {
      for (const operation of grant.operations) {
        this.assertAllowed(grant.bucket, grant.prefix ?? "", operation);
      }
    }
    const token = generateToken("stg_tok");
    const id = crypto.randomUUID();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO storage_tokens (id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, 0)
    `).run(id, input.label?.trim() || "storage token", hashSecret(token), JSON.stringify(grants), now);
    return {
      record: this.getToken(id)!,
      token,
    };
  }

  issueOwnerToken(input: { label?: string } = {}): { record: StorageScopedToken; token: string } {
    const token = generateToken("stg_owner");
    const id = crypto.randomUUID();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO storage_tokens (id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, 1)
    `).run(id, input.label?.trim() || "owner", hashSecret(token), JSON.stringify([]), now);
    return {
      record: this.getToken(id)!,
      token,
    };
  }

  findActiveOwnerToken(): StorageScopedToken | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner
      FROM storage_tokens
      WHERE is_owner = 1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get() as TokenRow | undefined;
    return row ? serializeToken(row) : null;
  }

  isOwnerToken(token: string): boolean {
    const row = this.sqlite.prepare(`
      SELECT is_owner FROM storage_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `).get(hashSecret(token)) as { is_owner: number } | undefined;
    return Boolean(row?.is_owner);
  }

  listBuckets(): string[] {
    const rows = this.sqlite.prepare(`
      SELECT DISTINCT bucket FROM storage_objects ORDER BY bucket ASC
    `).all() as Array<{ bucket: string }>;
    return rows.map((row) => row.bucket);
  }

  listTokens(): StorageScopedToken[] {
    return (this.sqlite.prepare(`
      SELECT id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner
      FROM storage_tokens
      ORDER BY created_at DESC
    `).all() as TokenRow[]).map(serializeToken);
  }

  authenticateToken(token: string): StorageScopedToken | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner
      FROM storage_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `).get(hashSecret(token)) as TokenRow | undefined;
    if (!row) return null;
    const now = nowIso();
    this.sqlite.prepare("UPDATE storage_tokens SET last_used_at = ? WHERE id = ?").run(now, row.id);
    return serializeToken({ ...row, last_used_at: now });
  }

  scopedTokenStore(token: string): LocalStorageStore | null {
    const record = this.authenticateToken(token);
    if (!record) return null;
    return new LocalStorageStore({
      workspaceDir: this.options.workspaceDir,
      agentId: record.isOwner ? "owner" : `token-${record.id}`,
      grants: record.grants,
      filesystem: this.filesystem,
      shareAdapter: this.shareAdapter,
      driveIndexAdapter: this.driveIndexAdapter,
      includeDefaultGrants: false,
      rawKeys: true,
      ownerMode: record.isOwner,
    });
  }

  getToken(id: string): StorageScopedToken | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner
      FROM storage_tokens
      WHERE id = ?
      LIMIT 1
    `).get(id) as TokenRow | undefined;
    return row ? serializeToken(row) : null;
  }

  revokeToken(id: string): boolean {
    return this.sqlite.prepare(`
      UPDATE storage_tokens
      SET revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(nowIso(), id).changes > 0;
  }

  async createShare(input: { bucket?: string; key: string; label?: string; expiresAt?: string | null; ttlMs?: number }): Promise<StorageShare> {
    const bucket = normalizeBucket(input.bucket);
    const key = this.resolveKeyForRead(input.key);
    this.assertAllowed(bucket, key, "objects:read");
    this.assertAllowed(bucket, key, "shares:create");
    if (!this.shareAdapter) {
      throw new Error("Storage share service is not configured.");
    }
    const object = this.get({ bucket, key });
    if (!object) throw new Error(`Storage object not found: ${bucket}:${key}`);
    const label = input.label?.trim() || path.posix.basename(key) || "Shared object";
    const expiresAt = normalizeExpiresAt(input);
    const created = await this.shareAdapter.create({ ...object, label, expiresAt });
    const id = crypto.randomUUID();
    const now = nowIso();
    try {
      this.sqlite.prepare(`
        INSERT INTO storage_shares (
          id, bucket, object_key, label, mode, url, external_item_id, external_share_id,
          snapshot_blob_path, snapshot_size_bytes, snapshot_content_type, snapshot_sha256,
          created_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, 'read', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        id,
        bucket,
        key,
        label,
        created.url,
        created.externalItemId ?? null,
        created.externalShareId ?? null,
        path.relative(this.rootBlobsDir, object.filePath),
        object.sizeBytes,
        object.contentType,
        object.sha256,
        now,
        expiresAt,
      );
    } catch (error) {
      await this.shareAdapter.revoke({
        id,
        bucket,
        key,
        label,
        mode: "read",
        url: created.url,
        ...(created.externalItemId ? { externalItemId: created.externalItemId } : {}),
        ...(created.externalShareId ? { externalShareId: created.externalShareId } : {}),
        createdAt: now,
        expiresAt,
      });
      throw error;
    }
    return this.getShare(id)!;
  }

  async revokeShare(id: string): Promise<boolean> {
    const share = this.getShare(id);
    if (!share || share.revokedAt) return false;
    this.assertAllowed(share.bucket, share.key, "shares:revoke");
    if (this.shareAdapter) await this.shareAdapter.revoke(share);
    return this.sqlite.prepare(`
      UPDATE storage_shares
      SET revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(nowIso(), id).changes > 0;
  }

  listShares(): StorageShare[] {
    return (this.sqlite.prepare(`
      SELECT id, bucket, object_key, label, mode, url, external_item_id, external_share_id,
        snapshot_blob_path, snapshot_size_bytes, snapshot_content_type, snapshot_sha256,
        created_at, expires_at, revoked_at
      FROM storage_shares
      ORDER BY created_at DESC
    `).all() as ShareRow[]).map(serializeShare);
  }

  getShare(id: string): StorageShare | null {
    const row = this.sqlite.prepare(`
      SELECT id, bucket, object_key, label, mode, url, external_item_id, external_share_id,
        snapshot_blob_path, snapshot_size_bytes, snapshot_content_type, snapshot_sha256,
        created_at, expires_at, revoked_at
      FROM storage_shares
      WHERE id = ?
      LIMIT 1
    `).get(id) as ShareRow | undefined;
    return row ? serializeShare(row) : null;
  }

  private getRow(bucket: string, key: string): ObjectRow | null {
    return (this.sqlite.prepare(`
      SELECT bucket, object_key, size_bytes, content_type, sha256, blob_path,
        metadata_json, created_at, updated_at, created_by_agent_id, visibility
      FROM storage_objects
      WHERE bucket = ? AND object_key = ?
      LIMIT 1
    `).get(bucket, key) as ObjectRow | undefined) ?? null;
  }

  private removeBlobIfUnreferenced(blobPath: string): void {
    const remaining = Number((this.sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM storage_objects
      WHERE blob_path = ?
    `).get(blobPath) as { count: number }).count)
      + Number((this.sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM storage_shares
        WHERE snapshot_blob_path = ?
      `).get(blobPath) as { count: number }).count);
    if (remaining === 0) {
      fs.rmSync(path.join(this.rootBlobsDir, blobPath), { force: true });
    }
  }
}

export function createLocalStorageStore(options: StorageStoreOptions): LocalStorageStore {
  return new LocalStorageStore(options);
}

export function createDriveStorageShareAdapter(input: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): StorageShareAdapter {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const authHeaders = () => ({ authorization: `Bearer ${input.token}` });

  return {
    async create(object) {
      const form = new FormData();
      const fileBytes = new Uint8Array(object.buffer);
      form.set("file", new Blob([fileBytes], { type: object.contentType }), path.posix.basename(object.key) || "object.bin");
      const upload = await fetchImpl(`${baseUrl}/v1/uploads`, {
        method: "POST",
        headers: authHeaders(),
        body: form,
      });
      if (!upload.ok) {
        throw new Error(await upload.text() || `Drive upload failed with ${upload.status}`);
      }
      const item = await upload.json() as { id: string };
      const share = await fetchImpl(`${baseUrl}/v1/items/${item.id}/shares`, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ label: object.label }),
      });
      if (!share.ok) {
        throw new Error(await share.text() || `Drive share failed with ${share.status}`);
      }
      const payload = await share.json() as { url: string; share?: { id: string } };
      return {
        url: payload.url,
        externalItemId: item.id,
        externalShareId: payload.share?.id,
      };
    },
    async revoke(share) {
      if (!share.externalItemId || !share.externalShareId) return;
      const response = await fetchImpl(`${baseUrl}/v1/items/${share.externalItemId}/shares/${share.externalShareId}/revoke`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) {
        throw new Error(await response.text() || `Drive share revoke failed with ${response.status}`);
      }
    },
  };
}
