import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { generateOpaqueToken, hashSecret } from "./auth.ts";
import type {
  DriveAgentCapability,
  DriveAgentShareRecord,
  DriveAuditEvent,
  DriveAuditEventKind,
  DriveAuditFilter,
  DriveComment,
  DriveDocContent,
  DriveEmbeddingRecord,
  DriveEncryptedFolderRecord,
  DriveExifRecord,
  DriveItem,
  DriveItemDetail,
  DriveItemKind,
  DriveMimeClass,
  DriveNativeContent,
  DriveOperation,
  DrivePreviewKind,
  DriveRevision,
  DriveScopedTokenRecord,
  DriveShareRecord,
  DriveSheetContent,
  DriveSlideContent,
  DriveTailnetShareRecord,
  DriveThumbnailRecord,
  DriveTunnelShareRecord,
  DriveUploadContent,
  DriveView,
  DriveViewCounts,
} from "../shared/types.ts";

const ROOT_FOLDER_ID = "root";

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function previewFromNativeContent(content: DriveNativeContent): string {
  if (content.kind === "doc") {
    return content.blocks.map((block) => {
      if (block.type === "table") return (block.cells ?? []).flat().join(" ");
      return block.text ?? "";
    }).join(" ").replace(/\s+/g, " ").trim();
  }
  if (content.kind === "sheet") {
    return content.tabs.flatMap((tab) => [tab.name, ...tab.rows.flat()]).join(" ").replace(/\s+/g, " ").trim();
  }
  return content.slides.map((slide) => `${slide.title} ${slide.body} ${slide.notes}`).join(" ").replace(/\s+/g, " ").trim();
}

function defaultDocContent(name: string): DriveDocContent {
  return {
    kind: "doc",
    blocks: [
      { id: uuid(), type: "heading", text: name },
      { id: uuid(), type: "paragraph", text: "Write here. This document is stored in Drive's native JSON format." },
      { id: uuid(), type: "bullet", text: "Use comments, revisions, sharing, and export from the details panel." },
    ],
  };
}

function defaultSheetContent(): DriveSheetContent {
  return {
    kind: "sheet",
    tabs: [
      {
        id: uuid(),
        name: "Sheet 1",
        freeze: { row: 1, col: 1 },
        rows: [
          ["Item", "Owner", "Status", "Formula"],
          ["Launch plan", "Ops", "Ready", "=A2"],
          ["Budget", "Finance", "Draft", "=A3"],
          ["Notes", "Product", "In progress", "=A4"],
          ["", "", "", ""],
          ["", "", "", ""],
        ],
      },
    ],
  };
}

function defaultSlideContent(name: string): DriveSlideContent {
  return {
    kind: "slide",
    slides: [
      {
        id: uuid(),
        title: name,
        body: "Use this deck to shape the narrative, structure sections, and stage visuals.",
        notes: "Speaker notes stay local to the deck.",
        background: "sunset-grid",
      },
      {
        id: uuid(),
        title: "Next steps",
        body: "Add content blocks, comments, and revisions from Drive.",
        notes: "Keep slides concise.",
        background: "paper",
      },
    ],
  };
}

export interface DriveActor {
  kind: "admin" | "token" | "share";
  id: string;
  name: string;
}

interface ItemRow {
  id: string;
  name: string;
  kind: DriveItemKind;
  parent_id: string | null;
  mime_type: string | null;
  size_bytes: number;
  storage_path: string | null;
  content_json: string | null;
  preview_kind: DrivePreviewKind;
  preview_text: string;
  indexed_text: string;
  starred: number;
  trashed_at: string | null;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
  last_viewed_at: string | null;
  child_count?: number;
  comment_count?: number;
  revision_count?: number;
  share_count?: number;
}

interface RevisionRow {
  id: string;
  item_id: string;
  version_number: number;
  summary: string | null;
  content_json: string;
  preview_text: string;
  created_at: string;
  author_kind: "admin" | "token" | "share";
  author_id: string;
}

interface CommentRow {
  id: string;
  item_id: string;
  body: string;
  author_name: string;
  created_at: string;
}

interface TokenRow {
  id: string;
  label: string;
  token_hash: string;
  operations_json: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ShareRow {
  id: string;
  item_id: string;
  label: string;
  token_hash: string;
  mode: "read";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

function serializeItem(row: ItemRow): DriveItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id === ROOT_FOLDER_ID ? null : row.parent_id,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    starred: Boolean(row.starred),
    trashedAt: row.trashed_at,
    previewKind: row.preview_kind,
    previewText: row.preview_text,
    currentRevisionId: row.current_revision_id,
    childCount: Number(row.child_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    revisionCount: Number(row.revision_count ?? 0),
    shareCount: Number(row.share_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastViewedAt: row.last_viewed_at,
  };
}

function serializeRevision(row: RevisionRow): DriveRevision {
  return {
    id: row.id,
    itemId: row.item_id,
    versionNumber: row.version_number,
    summary: row.summary,
    previewText: row.preview_text,
    createdAt: row.created_at,
    authorKind: row.author_kind,
    authorId: row.author_id,
  };
}

function serializeComment(row: CommentRow): DriveComment {
  return {
    id: row.id,
    itemId: row.item_id,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

function serializeToken(row: TokenRow): DriveScopedTokenRecord {
  return {
    id: row.id,
    label: row.label,
    operations: parseJson<DriveOperation[]>(row.operations_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function serializeShare(row: ShareRow): DriveShareRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    label: row.label,
    mode: row.mode,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export class DriveConflictError extends Error {
  constructor(readonly currentRevisionId: string | null) {
    super("drive_revision_conflict");
  }
}

export class DriveStore {
  private readonly sqlite: Database.Database;
  readonly blobsDir: string;

  constructor(dbPath: string, dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.blobsDir = path.join(dataDir, "blobs");
    fs.mkdirSync(this.blobsDir, { recursive: true });

    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        parent_id TEXT,
        mime_type TEXT,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT,
        content_json TEXT,
        preview_kind TEXT NOT NULL,
        preview_text TEXT NOT NULL DEFAULT '',
        indexed_text TEXT NOT NULL DEFAULT '',
        starred INTEGER NOT NULL DEFAULT 0,
        trashed_at TEXT,
        current_revision_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_viewed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        summary TEXT,
        content_json TEXT NOT NULL,
        preview_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        author_kind TEXT NOT NULL,
        author_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        body TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'read',
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      -- v002 Clawix extensions ------------------------------------------------

      CREATE TABLE IF NOT EXISTS drive_audit_events (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        item_id TEXT,
        principal_kind TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        principal_name TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS drive_audit_events_timestamp
        ON drive_audit_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS drive_audit_events_item
        ON drive_audit_events(item_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS drive_audit_events_kind
        ON drive_audit_events(kind, timestamp DESC);

      CREATE TABLE IF NOT EXISTS encrypted_folders (
        folder_id TEXT PRIMARY KEY,
        wrap_strategy TEXT NOT NULL DEFAULT 'vault.master',
        enabled_at TEXT NOT NULL,
        enabled_by TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tailnet_shares (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        magicdns_name TEXT NOT NULL,
        tailnet_node_id TEXT,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tunnel_shares (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        tunnel_url TEXT NOT NULL,
        tunnel_pid INTEGER,
        started_at TEXT NOT NULL,
        stopped_at TEXT,
        status TEXT NOT NULL DEFAULT 'starting'
      );

      CREATE TABLE IF NOT EXISTS agent_shares (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        capability_kind TEXT NOT NULL,
        capability_scope_json TEXT NOT NULL DEFAULT '{}',
        ttl_minutes INTEGER NOT NULL,
        reason TEXT,
        agent_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        used_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT
      );

      CREATE INDEX IF NOT EXISTS agent_shares_token
        ON agent_shares(token_hash);
      CREATE INDEX IF NOT EXISTS agent_shares_item
        ON agent_shares(item_id);

      CREATE TABLE IF NOT EXISTS thumbnails (
        item_id TEXT NOT NULL,
        size INTEGER NOT NULL,
        path TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
        created_at TEXT NOT NULL,
        PRIMARY KEY (item_id, size)
      );

      CREATE TABLE IF NOT EXISTS exif_metadata (
        item_id TEXT PRIMARY KEY,
        taken_at TEXT,
        camera_make TEXT,
        camera_model TEXT,
        lens_model TEXT,
        iso INTEGER,
        shutter_speed TEXT,
        aperture REAL,
        focal_length REAL,
        latitude REAL,
        longitude REAL,
        orientation INTEGER,
        width INTEGER,
        height INTEGER,
        raw_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS exif_metadata_taken
        ON exif_metadata(taken_at DESC);
      CREATE INDEX IF NOT EXISTS exif_metadata_geo
        ON exif_metadata(latitude, longitude);

      CREATE TABLE IF NOT EXISTS embeddings (
        item_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        dim INTEGER NOT NULL,
        vector BLOB NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (item_id, model_id)
      );
    `);

    // Items column extensions: only add when not present (idempotent migration).
    const existingCols = (this.sqlite.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>).map((c) => c.name);
    if (!existingCols.includes("mime_class")) {
      this.sqlite.exec("ALTER TABLE items ADD COLUMN mime_class TEXT NOT NULL DEFAULT 'other'");
      this.sqlite.exec("CREATE INDEX IF NOT EXISTS items_mime_class ON items(mime_class, created_at DESC)");
    }
    if (!existingCols.includes("is_in_encrypted_folder")) {
      this.sqlite.exec("ALTER TABLE items ADD COLUMN is_in_encrypted_folder INTEGER NOT NULL DEFAULT 0");
    }
    if (!existingCols.includes("ocr_pending")) {
      this.sqlite.exec("ALTER TABLE items ADD COLUMN ocr_pending INTEGER NOT NULL DEFAULT 0");
    }
    if (!existingCols.includes("embedding_pending")) {
      this.sqlite.exec("ALTER TABLE items ADD COLUMN embedding_pending INTEGER NOT NULL DEFAULT 0");
    }

    // Auto-purge support: index for trashed_at sweep job.
    this.sqlite.exec("CREATE INDEX IF NOT EXISTS items_trashed_at ON items(trashed_at) WHERE trashed_at IS NOT NULL");
  }

  private seed(): void {
    const adminCount = Number((this.sqlite.prepare("SELECT COUNT(*) AS count FROM admins").get() as { count: number }).count);
    if (adminCount === 0) {
      const now = nowIso();
      this.sqlite.prepare(`
        INSERT INTO admins (id, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
      `).run("admin", "admin@localhost", hashSecret("admin"), now);
    }

    const root = this.sqlite.prepare("SELECT id FROM items WHERE id = ?").get(ROOT_FOLDER_ID) as { id: string } | undefined;
    if (!root) {
      const now = nowIso();
      this.sqlite.prepare(`
        INSERT INTO items (
          id, name, kind, parent_id, mime_type, size_bytes, storage_path, content_json,
          preview_kind, preview_text, indexed_text, starred, trashed_at, current_revision_id,
          created_at, updated_at, last_viewed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ROOT_FOLDER_ID, "My Drive", "folder", null, null, 0, null, null, "folder", "", "", 0, null, null, now, now, now);
    }
  }

  authenticateAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email, password_hash, created_at
      FROM admins
      WHERE email = ?
      LIMIT 1
    `).get(email) as AdminRow | undefined;
    if (!row) return null;
    return row.password_hash === hashSecret(password) ? { id: row.id, email: row.email } : null;
  }

  authenticateScopedToken(token: string): DriveScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, token_hash, operations_json, created_at, last_used_at, revoked_at
      FROM tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `).get(hashSecret(token)) as TokenRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
    return serializeToken(row);
  }

  listTokens(): DriveScopedTokenRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, label, token_hash, operations_json, created_at, last_used_at, revoked_at
      FROM tokens
      ORDER BY created_at DESC
    `).all() as TokenRow[]).map(serializeToken);
  }

  createScopedToken(input: { label: string; operations: DriveOperation[] }) {
    const rawToken = generateOpaqueToken("drv_tok");
    const id = uuid();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO tokens (id, label, token_hash, operations_json, created_at, last_used_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.label, hashSecret(rawToken), stringifyJson(input.operations), now, null, null);
    return {
      token: rawToken,
      record: this.listTokens().find((entry) => entry.id === id)!,
    };
  }

  revokeToken(tokenId: string): boolean {
    return this.sqlite.prepare(`
      UPDATE tokens
      SET revoked_at = ?
      WHERE id = ? AND revoked_at IS NULL
    `).run(nowIso(), tokenId).changes > 0;
  }

  authenticateShareToken(token: string): DriveShareRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, item_id, label, token_hash, mode, created_at, last_used_at, revoked_at
      FROM shares
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `).get(hashSecret(token)) as ShareRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE shares SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
    return serializeShare(row);
  }

  listShares(itemId: string): DriveShareRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, item_id, label, token_hash, mode, created_at, last_used_at, revoked_at
      FROM shares
      WHERE item_id = ?
      ORDER BY created_at DESC
    `).all(itemId) as ShareRow[]).map(serializeShare);
  }

  createShare(itemId: string, label: string) {
    const token = generateOpaqueToken("drv_shr");
    const id = uuid();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO shares (id, item_id, label, token_hash, mode, created_at, last_used_at, revoked_at)
      VALUES (?, ?, ?, ?, 'read', ?, ?, ?)
    `).run(id, itemId, label, hashSecret(token), now, null, null);
    return {
      share: this.listShares(itemId).find((entry) => entry.id === id)!,
      token,
    };
  }

  revokeShare(itemId: string, shareId: string): boolean {
    return this.sqlite.prepare(`
      UPDATE shares
      SET revoked_at = ?
      WHERE id = ? AND item_id = ? AND revoked_at IS NULL
    `).run(nowIso(), shareId, itemId).changes > 0;
  }

  private getItemRow(id: string): ItemRow | null {
    const row = this.sqlite.prepare(`
      SELECT
        i.*,
        (SELECT COUNT(*) FROM items child WHERE child.parent_id = i.id AND child.trashed_at IS NULL) AS child_count,
        (SELECT COUNT(*) FROM comments c WHERE c.item_id = i.id) AS comment_count,
        (SELECT COUNT(*) FROM revisions r WHERE r.item_id = i.id) AS revision_count,
        (SELECT COUNT(*) FROM shares s WHERE s.item_id = i.id AND s.revoked_at IS NULL) AS share_count
      FROM items i
      WHERE i.id = ?
      LIMIT 1
    `).get(id) as ItemRow | undefined;
    return row ?? null;
  }

  private serializeContent(row: ItemRow): DriveItemDetail["content"] {
    if (row.kind === "folder") return null;
    if (row.kind === "upload") {
      return parseJson<DriveUploadContent>(row.content_json, { kind: "upload", previewKind: row.preview_kind });
    }
    return parseJson<DriveNativeContent>(row.content_json, row.kind === "doc" ? defaultDocContent(row.name) : row.kind === "sheet" ? defaultSheetContent() : defaultSlideContent(row.name));
  }

  private breadcrumbsFor(id: string): Array<{ id: string; name: string }> {
    const crumbs: Array<{ id: string; name: string }> = [];
    let current = this.getItemRow(id);
    while (current && current.parent_id && current.parent_id !== ROOT_FOLDER_ID) {
      const parent = this.getItemRow(current.parent_id);
      if (!parent) break;
      crumbs.unshift({ id: parent.id, name: parent.name });
      current = parent;
    }
    return crumbs;
  }

  getItem(id: string): DriveItemDetail | null {
    const row = this.getItemRow(id);
    if (!row || row.id === ROOT_FOLDER_ID) return null;
    return {
      ...serializeItem(row),
      content: this.serializeContent(row),
      breadcrumbs: this.breadcrumbsFor(id),
    };
  }

  listItems(input: { view?: DriveView; parentId?: string | null; query?: string } = {}): DriveItem[] {
    const view = input.view ?? "my-drive";
    const query = (input.query ?? "").trim().toLowerCase();
    const params: Array<string | number | null> = [];
    const where: string[] = ["i.id != ?"];
    params.push(ROOT_FOLDER_ID);

    if (view === "my-drive") {
      where.push("i.trashed_at IS NULL");
      where.push("i.parent_id = ?");
      params.push(input.parentId ?? ROOT_FOLDER_ID);
    } else if (view === "recent") {
      where.push("i.trashed_at IS NULL");
      where.push("i.last_viewed_at IS NOT NULL");
    } else if (view === "starred") {
      where.push("i.trashed_at IS NULL");
      where.push("i.starred = 1");
    } else if (view === "shared") {
      where.push("i.trashed_at IS NULL");
      where.push("EXISTS (SELECT 1 FROM shares s WHERE s.item_id = i.id AND s.revoked_at IS NULL)");
    } else if (view === "trash") {
      where.push("i.trashed_at IS NOT NULL");
    }

    if (query) {
      where.push("(LOWER(i.name) LIKE ? OR LOWER(i.indexed_text) LIKE ?)");
      params.push(`%${query}%`, `%${query}%`);
    }

    const orderBy = view === "recent"
      ? "ORDER BY COALESCE(i.last_viewed_at, i.updated_at) DESC, i.name ASC"
      : view === "trash"
        ? "ORDER BY i.trashed_at DESC, i.updated_at DESC"
        : "ORDER BY CASE WHEN i.kind = 'folder' THEN 0 ELSE 1 END, i.updated_at DESC, i.name ASC";

    const rows = this.sqlite.prepare(`
      SELECT
        i.*,
        (SELECT COUNT(*) FROM items child WHERE child.parent_id = i.id AND child.trashed_at IS NULL) AS child_count,
        (SELECT COUNT(*) FROM comments c WHERE c.item_id = i.id) AS comment_count,
        (SELECT COUNT(*) FROM revisions r WHERE r.item_id = i.id) AS revision_count,
        (SELECT COUNT(*) FROM shares s WHERE s.item_id = i.id AND s.revoked_at IS NULL) AS share_count
      FROM items i
      WHERE ${where.join(" AND ")}
      ${orderBy}
    `).all(...params) as ItemRow[];

    return rows.map(serializeItem);
  }

  listViewCounts(): DriveViewCounts {
    const count = (query: string, params: unknown[] = []) => Number((this.sqlite.prepare(query).get(...params) as { count: number }).count);
    return {
      myDrive: count("SELECT COUNT(*) AS count FROM items WHERE id != ? AND trashed_at IS NULL AND parent_id = ?", [ROOT_FOLDER_ID, ROOT_FOLDER_ID]),
      recent: count("SELECT COUNT(*) AS count FROM items WHERE id != ? AND trashed_at IS NULL AND last_viewed_at IS NOT NULL", [ROOT_FOLDER_ID]),
      starred: count("SELECT COUNT(*) AS count FROM items WHERE id != ? AND trashed_at IS NULL AND starred = 1", [ROOT_FOLDER_ID]),
      shared: count("SELECT COUNT(*) AS count FROM items WHERE id != ? AND trashed_at IS NULL AND EXISTS (SELECT 1 FROM shares WHERE shares.item_id = items.id AND revoked_at IS NULL)", [ROOT_FOLDER_ID]),
      trash: count("SELECT COUNT(*) AS count FROM items WHERE id != ? AND trashed_at IS NOT NULL", [ROOT_FOLDER_ID]),
    };
  }

  private assertParent(parentId: string | null): string {
    const resolvedParentId = parentId ?? ROOT_FOLDER_ID;
    const parent = this.getItemRow(resolvedParentId);
    if (!parent) throw new Error("Parent folder not found.");
    if (parent.kind !== "folder") throw new Error("Parent item must be a folder.");
    if (parent.trashed_at) throw new Error("Cannot create items inside trash.");
    return resolvedParentId;
  }

  createItem(input: {
    kind: DriveItemKind;
    name: string;
    parentId?: string | null;
    mimeType?: string | null;
    sizeBytes?: number;
    storagePath?: string | null;
    previewKind?: DrivePreviewKind;
    content?: DriveNativeContent | DriveUploadContent | null;
  }, actor: DriveActor): DriveItemDetail {
    const id = uuid();
    const now = nowIso();
    const parentId = this.assertParent(input.parentId ?? null);
    const kind = input.kind;
    const name = input.name.trim() || (kind === "folder" ? "Untitled folder" : `Untitled ${kind}`);

    let content = input.content ?? null;
    let previewKind = input.previewKind ?? (kind === "doc" ? "native-doc" : kind === "sheet" ? "native-sheet" : kind === "slide" ? "native-slide" : kind === "folder" ? "folder" : "binary");
    let previewText = "";
    let indexedText = name;
    let currentRevisionId: string | null = null;

    if (kind === "doc") {
      content = content ?? defaultDocContent(name);
      previewText = previewFromNativeContent(content as DriveNativeContent);
      indexedText = `${name} ${previewText}`.trim();
    } else if (kind === "sheet") {
      content = content ?? defaultSheetContent();
      previewText = previewFromNativeContent(content as DriveNativeContent);
      indexedText = `${name} ${previewText}`.trim();
    } else if (kind === "slide") {
      content = content ?? defaultSlideContent(name);
      previewText = previewFromNativeContent(content as DriveNativeContent);
      indexedText = `${name} ${previewText}`.trim();
    } else if (kind === "upload") {
      const uploadContent = content as DriveUploadContent;
      previewKind = uploadContent.previewKind;
      previewText = uploadContent.textContent?.replace(/\s+/g, " ").trim().slice(0, 240) ?? name;
      indexedText = `${name} ${uploadContent.textContent ?? previewText}`.trim();
    }

    this.sqlite.prepare(`
      INSERT INTO items (
        id, name, kind, parent_id, mime_type, size_bytes, storage_path, content_json,
        preview_kind, preview_text, indexed_text, starred, trashed_at, current_revision_id,
        created_at, updated_at, last_viewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, NULL)
    `).run(
      id,
      name,
      kind,
      parentId,
      input.mimeType ?? null,
      input.sizeBytes ?? 0,
      input.storagePath ?? null,
      content ? stringifyJson(content) : null,
      previewKind,
      previewText,
      indexedText,
      currentRevisionId,
      now,
      now,
    );

    if (kind === "doc" || kind === "sheet" || kind === "slide") {
      const revisionId = this.insertRevision(id, content as DriveNativeContent, actor, "Initial version");
      this.sqlite.prepare("UPDATE items SET current_revision_id = ? WHERE id = ?").run(revisionId, id);
    }

    return this.getItem(id)!;
  }

  private insertRevision(itemId: string, content: DriveNativeContent, actor: DriveActor, summary: string | null): string {
    const versionRow = this.sqlite.prepare(`
      SELECT COALESCE(MAX(version_number), 0) AS version
      FROM revisions
      WHERE item_id = ?
    `).get(itemId) as { version: number };
    const revisionId = uuid();
    this.sqlite.prepare(`
      INSERT INTO revisions (
        id, item_id, version_number, summary, content_json, preview_text, created_at, author_kind, author_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revisionId,
      itemId,
      versionRow.version + 1,
      summary,
      stringifyJson(content),
      previewFromNativeContent(content),
      nowIso(),
      actor.kind,
      actor.id,
    );
    return revisionId;
  }

  updateItem(id: string, patch: {
    name?: string;
    parentId?: string | null;
    starred?: boolean;
  }): DriveItemDetail {
    const row = this.getItemRow(id);
    if (!row || row.id === ROOT_FOLDER_ID) throw new Error("Item not found.");
    const name = patch.name?.trim() || row.name;
    const parentId = patch.parentId === undefined ? row.parent_id : this.assertParent(patch.parentId);
    this.sqlite.prepare(`
      UPDATE items
      SET name = ?, parent_id = ?, starred = ?, updated_at = ?
      WHERE id = ?
    `).run(name, parentId, patch.starred === undefined ? row.starred : Number(patch.starred), nowIso(), id);
    return this.getItem(id)!;
  }

  moveItem(id: string, parentId: string | null): DriveItemDetail {
    return this.updateItem(id, { parentId });
  }

  copyItem(itemId: string, parentId: string | null, actor: DriveActor): DriveItemDetail {
    const source = this.getItem(itemId);
    if (!source) throw new Error("Item not found.");
    const destinationParent = parentId ?? source.parentId;
    const copy = this.createItem({
      kind: source.kind,
      name: `${source.name} copy`,
      parentId: destinationParent,
      mimeType: source.mimeType,
      sizeBytes: source.sizeBytes,
      storagePath: source.kind === "upload" ? this.copyBlob(itemId) : null,
      previewKind: source.previewKind,
      content: source.content,
    }, actor);

    if (source.kind === "folder") {
      const children = this.listItems({ view: "my-drive", parentId: source.id });
      for (const child of children) {
        this.copyItem(child.id, copy.id, actor);
      }
    }
    return copy;
  }

  private copyBlob(itemId: string): string | null {
    const row = this.getItemRow(itemId);
    if (!row?.storage_path) return null;
    const sourcePath = path.isAbsolute(row.storage_path) ? row.storage_path : path.join(this.blobsDir, row.storage_path);
    const basename = `${uuid()}-${path.basename(sourcePath)}`;
    const relativePath = basename;
    const targetPath = path.join(this.blobsDir, relativePath);
    fs.copyFileSync(sourcePath, targetPath);
    return relativePath;
  }

  saveNativeContent(itemId: string, input: {
    baseRevisionId: string | null;
    content: DriveNativeContent;
    summary?: string | null;
  }, actor: DriveActor): DriveItemDetail {
    const row = this.getItemRow(itemId);
    if (!row || !(row.kind === "doc" || row.kind === "sheet" || row.kind === "slide")) {
      throw new Error("Native Drive item not found.");
    }
    if (row.current_revision_id !== input.baseRevisionId) {
      throw new DriveConflictError(row.current_revision_id);
    }
    const previewText = previewFromNativeContent(input.content);
    const revisionId = this.insertRevision(itemId, input.content, actor, input.summary ?? null);
    this.sqlite.prepare(`
      UPDATE items
      SET content_json = ?, preview_text = ?, indexed_text = ?, current_revision_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      stringifyJson(input.content),
      previewText,
      `${row.name} ${previewText}`.trim(),
      revisionId,
      nowIso(),
      itemId,
    );
    return this.getItem(itemId)!;
  }

  listRevisions(itemId: string): DriveRevision[] {
    return (this.sqlite.prepare(`
      SELECT id, item_id, version_number, summary, content_json, preview_text, created_at, author_kind, author_id
      FROM revisions
      WHERE item_id = ?
      ORDER BY version_number DESC
    `).all(itemId) as RevisionRow[]).map(serializeRevision);
  }

  restoreRevision(itemId: string, revisionId: string, actor: DriveActor): DriveItemDetail {
    const revision = this.sqlite.prepare(`
      SELECT id, item_id, version_number, summary, content_json, preview_text, created_at, author_kind, author_id
      FROM revisions
      WHERE id = ? AND item_id = ?
      LIMIT 1
    `).get(revisionId, itemId) as RevisionRow | undefined;
    if (!revision) throw new Error("Revision not found.");
    return this.saveNativeContent(itemId, {
      baseRevisionId: this.getItem(itemId)?.currentRevisionId ?? null,
      content: parseJson<DriveNativeContent>(revision.content_json, defaultDocContent("Untitled")),
      summary: `Restored revision ${revision.version_number}`,
    }, actor);
  }

  listComments(itemId: string): DriveComment[] {
    return (this.sqlite.prepare(`
      SELECT id, item_id, body, author_name, created_at
      FROM comments
      WHERE item_id = ?
      ORDER BY created_at DESC
    `).all(itemId) as CommentRow[]).map(serializeComment);
  }

  addComment(itemId: string, body: string, authorName: string): DriveComment {
    const id = uuid();
    const createdAt = nowIso();
    this.sqlite.prepare(`
      INSERT INTO comments (id, item_id, body, author_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, itemId, body.trim(), authorName, createdAt);
    return this.listComments(itemId).find((comment) => comment.id === id)!;
  }

  markViewed(itemId: string): void {
    this.sqlite.prepare("UPDATE items SET last_viewed_at = ? WHERE id = ?").run(nowIso(), itemId);
  }

  trashItem(itemId: string): DriveItemDetail {
    this.sqlite.prepare("UPDATE items SET trashed_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), itemId);
    return this.getItem(itemId)!;
  }

  restoreItem(itemId: string): DriveItemDetail {
    this.sqlite.prepare("UPDATE items SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), itemId);
    return this.getItem(itemId)!;
  }

  deleteItemForever(itemId: string): boolean {
    const row = this.getItemRow(itemId);
    if (!row || row.id === ROOT_FOLDER_ID) return false;
    const children = this.listItems({ view: "my-drive", parentId: itemId });
    for (const child of children) this.deleteItemForever(child.id);
    if (row.storage_path) {
      const remaining = Number((this.sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM items
        WHERE storage_path = ? AND id != ?
      `).get(row.storage_path, itemId) as { count: number }).count);
      if (remaining === 0) {
        const filePath = path.isAbsolute(row.storage_path) ? row.storage_path : path.join(this.blobsDir, row.storage_path);
        fs.rmSync(filePath, { force: true });
      }
    }
    this.sqlite.prepare("DELETE FROM revisions WHERE item_id = ?").run(itemId);
    this.sqlite.prepare("DELETE FROM comments WHERE item_id = ?").run(itemId);
    this.sqlite.prepare("DELETE FROM shares WHERE item_id = ?").run(itemId);
    return this.sqlite.prepare("DELETE FROM items WHERE id = ?").run(itemId).changes > 0;
  }

  getDownload(itemId: string): { filePath: string; name: string; mimeType: string | null } | null {
    const row = this.getItemRow(itemId);
    if (!row) return null;
    if (row.kind === "upload" && row.storage_path) {
      const filePath = path.isAbsolute(row.storage_path) ? row.storage_path : path.join(this.blobsDir, row.storage_path);
      return { filePath, name: row.name, mimeType: row.mime_type };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Mime classification (used to drive Photos/Documents adaptive views)
  // ---------------------------------------------------------------------------

  classifyMime(mimeType: string | null | undefined): DriveMimeClass {
    if (!mimeType) return "other";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (
      mimeType === "application/pdf" ||
      mimeType.startsWith("text/") ||
      mimeType.includes("officedocument") ||
      mimeType === "application/msword" ||
      mimeType === "application/vnd.ms-excel" ||
      mimeType === "application/vnd.ms-powerpoint"
    ) return "doc";
    if (
      mimeType === "application/json" ||
      mimeType === "application/javascript" ||
      mimeType === "application/typescript"
    ) return "code";
    if (
      mimeType === "application/zip" ||
      mimeType === "application/x-tar" ||
      mimeType === "application/gzip"
    ) return "archive";
    return "other";
  }

  setItemMimeClass(itemId: string, klass: DriveMimeClass): void {
    this.sqlite.prepare("UPDATE items SET mime_class = ? WHERE id = ?").run(klass, itemId);
  }

  setItemPending(itemId: string, kind: "ocr" | "embedding", pending: boolean): void {
    const col = kind === "ocr" ? "ocr_pending" : "embedding_pending";
    this.sqlite.prepare(`UPDATE items SET ${col} = ? WHERE id = ?`).run(pending ? 1 : 0, itemId);
  }

  setItemIndexedText(itemId: string, indexedText: string): void {
    const row = this.getItemRow(itemId);
    if (!row) return;
    this.sqlite.prepare("UPDATE items SET indexed_text = ? WHERE id = ?")
      .run(`${row.name} ${indexedText}`.trim(), itemId);
  }

  // ---------------------------------------------------------------------------
  // Path queries (for encrypted folder propagation)
  // ---------------------------------------------------------------------------

  /** True if any ancestor folder is in the encrypted_folders table. */
  isInEncryptedFolder(itemId: string): boolean {
    let cursor = this.getItemRow(itemId);
    while (cursor && cursor.id !== ROOT_FOLDER_ID) {
      const enc = this.sqlite.prepare("SELECT folder_id FROM encrypted_folders WHERE folder_id = ?").get(cursor.id) as { folder_id: string } | undefined;
      if (enc) return true;
      if (!cursor.parent_id) break;
      cursor = this.getItemRow(cursor.parent_id);
    }
    return false;
  }

  recomputeEncryptedFlag(itemId: string): void {
    const flag = this.isInEncryptedFolder(itemId) ? 1 : 0;
    this.sqlite.prepare("UPDATE items SET is_in_encrypted_folder = ? WHERE id = ?").run(flag, itemId);
    const children = this.listItems({ view: "my-drive", parentId: itemId });
    for (const c of children) this.recomputeEncryptedFlag(c.id);
  }

  // ---------------------------------------------------------------------------
  // Audit log (plain, no hash chain)
  // ---------------------------------------------------------------------------

  appendAuditEvent(input: {
    kind: DriveAuditEventKind;
    itemId?: string | null;
    principalKind: DriveAuditEvent["principalKind"];
    principalId: string;
    principalName: string;
    metadata?: Record<string, unknown>;
  }): DriveAuditEvent {
    const id = uuid();
    const timestamp = nowIso();
    this.sqlite.prepare(`
      INSERT INTO drive_audit_events (
        id, kind, item_id, principal_kind, principal_id, principal_name, timestamp, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.kind,
      input.itemId ?? null,
      input.principalKind,
      input.principalId,
      input.principalName,
      timestamp,
      stringifyJson(input.metadata ?? {}),
    );
    return {
      id,
      kind: input.kind,
      itemId: input.itemId ?? null,
      principalKind: input.principalKind,
      principalId: input.principalId,
      principalName: input.principalName,
      timestamp,
      metadata: input.metadata ?? {},
    };
  }

  queryAuditEvents(filter: DriveAuditFilter = {}): DriveAuditEvent[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.kinds?.length) {
      where.push(`kind IN (${filter.kinds.map(() => "?").join(",")})`);
      params.push(...filter.kinds);
    }
    if (filter.itemId) {
      where.push("item_id = ?");
      params.push(filter.itemId);
    }
    if (filter.principalId) {
      where.push("principal_id = ?");
      params.push(filter.principalId);
    }
    if (filter.since) {
      where.push("timestamp >= ?");
      params.push(filter.since);
    }
    if (filter.until) {
      where.push("timestamp <= ?");
      params.push(filter.until);
    }
    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
    const rows = this.sqlite.prepare(`
      SELECT id, kind, item_id, principal_kind, principal_id, principal_name, timestamp, metadata_json
      FROM drive_audit_events
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(...params, limit) as Array<{
      id: string;
      kind: DriveAuditEventKind;
      item_id: string | null;
      principal_kind: DriveAuditEvent["principalKind"];
      principal_id: string;
      principal_name: string;
      timestamp: string;
      metadata_json: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      itemId: row.item_id,
      principalKind: row.principal_kind,
      principalId: row.principal_id,
      principalName: row.principal_name,
      timestamp: row.timestamp,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    }));
  }

  // ---------------------------------------------------------------------------
  // Encrypted folders
  // ---------------------------------------------------------------------------

  setFolderEncrypted(folderId: string, enabled: boolean, enabledBy: string): void {
    if (enabled) {
      this.sqlite.prepare(`
        INSERT OR REPLACE INTO encrypted_folders (folder_id, wrap_strategy, enabled_at, enabled_by)
        VALUES (?, 'vault.master', ?, ?)
      `).run(folderId, nowIso(), enabledBy);
    } else {
      this.sqlite.prepare("DELETE FROM encrypted_folders WHERE folder_id = ?").run(folderId);
    }
    this.recomputeEncryptedFlag(folderId);
  }

  listEncryptedFolders(): DriveEncryptedFolderRecord[] {
    const rows = this.sqlite.prepare(`
      SELECT folder_id, wrap_strategy, enabled_at, enabled_by
      FROM encrypted_folders
      ORDER BY enabled_at DESC
    `).all() as Array<{ folder_id: string; wrap_strategy: string; enabled_at: string; enabled_by: string }>;
    return rows.map((row) => ({
      folderId: row.folder_id,
      wrapStrategy: row.wrap_strategy as "vault.master",
      enabledAt: row.enabled_at,
      enabledBy: row.enabled_by,
    }));
  }

  // ---------------------------------------------------------------------------
  // Tailnet / Tunnel / Agent shares
  // ---------------------------------------------------------------------------

  createTailnetShare(input: { itemId: string; magicdnsName: string; tailnetNodeId?: string | null }): DriveTailnetShareRecord {
    const id = uuid();
    const createdAt = nowIso();
    this.sqlite.prepare(`
      INSERT INTO tailnet_shares (id, item_id, magicdns_name, tailnet_node_id, created_at, revoked_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, NULL, NULL)
    `).run(id, input.itemId, input.magicdnsName, input.tailnetNodeId ?? null, createdAt);
    return {
      id,
      itemId: input.itemId,
      magicdnsName: input.magicdnsName,
      tailnetNodeId: input.tailnetNodeId ?? null,
      createdAt,
      revokedAt: null,
      lastUsedAt: null,
    };
  }

  listTailnetShares(itemId?: string): DriveTailnetShareRecord[] {
    const rows = (itemId
      ? this.sqlite.prepare("SELECT * FROM tailnet_shares WHERE item_id = ? ORDER BY created_at DESC").all(itemId)
      : this.sqlite.prepare("SELECT * FROM tailnet_shares ORDER BY created_at DESC").all()
    ) as Array<{
      id: string; item_id: string; magicdns_name: string; tailnet_node_id: string | null;
      created_at: string; revoked_at: string | null; last_used_at: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      magicdnsName: row.magicdns_name,
      tailnetNodeId: row.tailnet_node_id,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
    }));
  }

  revokeTailnetShare(id: string): boolean {
    return this.sqlite.prepare("UPDATE tailnet_shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(nowIso(), id).changes > 0;
  }

  createTunnelShare(input: { itemId: string; tunnelUrl: string; tunnelPid: number | null }): DriveTunnelShareRecord {
    const id = uuid();
    const startedAt = nowIso();
    this.sqlite.prepare(`
      INSERT INTO tunnel_shares (id, item_id, tunnel_url, tunnel_pid, started_at, stopped_at, status)
      VALUES (?, ?, ?, ?, ?, NULL, 'running')
    `).run(id, input.itemId, input.tunnelUrl, input.tunnelPid, startedAt);
    return {
      id,
      itemId: input.itemId,
      tunnelUrl: input.tunnelUrl,
      tunnelPid: input.tunnelPid,
      startedAt,
      stoppedAt: null,
      status: "running",
    };
  }

  listTunnelShares(itemId?: string): DriveTunnelShareRecord[] {
    const rows = (itemId
      ? this.sqlite.prepare("SELECT * FROM tunnel_shares WHERE item_id = ? ORDER BY started_at DESC").all(itemId)
      : this.sqlite.prepare("SELECT * FROM tunnel_shares ORDER BY started_at DESC").all()
    ) as Array<{
      id: string; item_id: string; tunnel_url: string; tunnel_pid: number | null;
      started_at: string; stopped_at: string | null; status: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      tunnelUrl: row.tunnel_url,
      tunnelPid: row.tunnel_pid,
      startedAt: row.started_at,
      stoppedAt: row.stopped_at,
      status: row.status as DriveTunnelShareRecord["status"],
    }));
  }

  stopTunnelShare(id: string, status: DriveTunnelShareRecord["status"] = "stopped"): boolean {
    return this.sqlite.prepare("UPDATE tunnel_shares SET stopped_at = ?, status = ? WHERE id = ? AND stopped_at IS NULL")
      .run(nowIso(), status, id).changes > 0;
  }

  createAgentShare(input: {
    itemId: string;
    capability: DriveAgentCapability;
    reason: string | null;
    agentName: string;
  }): { record: DriveAgentShareRecord; token: string } {
    const id = uuid();
    const token = generateOpaqueToken("svagt_drv");
    const tokenHash = hashSecret(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + input.capability.ttlMinutes * 60_000).toISOString();
    this.sqlite.prepare(`
      INSERT INTO agent_shares (
        id, item_id, token_hash, capability_kind, capability_scope_json, ttl_minutes,
        reason, agent_name, created_at, expires_at, revoked_at, used_count, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL)
    `).run(
      id, input.itemId, tokenHash,
      input.capability.kind,
      stringifyJson({ itemId: input.capability.itemId }),
      input.capability.ttlMinutes,
      input.reason, input.agentName, createdAt, expiresAt,
    );
    return {
      record: {
        id,
        itemId: input.itemId,
        capability: input.capability,
        reason: input.reason,
        agentName: input.agentName,
        createdAt,
        expiresAt,
        revokedAt: null,
        usedCount: 0,
        lastUsedAt: null,
      },
      token,
    };
  }

  authenticateAgentShare(token: string): DriveAgentShareRecord | null {
    const tokenHash = hashSecret(token);
    const row = this.sqlite.prepare(`
      SELECT id, item_id, token_hash, capability_kind, capability_scope_json, ttl_minutes,
        reason, agent_name, created_at, expires_at, revoked_at, used_count, last_used_at
      FROM agent_shares
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
      LIMIT 1
    `).get(tokenHash, nowIso()) as undefined | {
      id: string; item_id: string; token_hash: string;
      capability_kind: string; capability_scope_json: string; ttl_minutes: number;
      reason: string | null; agent_name: string; created_at: string; expires_at: string;
      revoked_at: string | null; used_count: number; last_used_at: string | null;
    };
    if (!row) return null;
    this.sqlite.prepare(`
      UPDATE agent_shares SET used_count = used_count + 1, last_used_at = ? WHERE id = ?
    `).run(nowIso(), row.id);
    const scope = parseJson<{ itemId: string | null }>(row.capability_scope_json, { itemId: null });
    return {
      id: row.id,
      itemId: row.item_id,
      capability: {
        kind: row.capability_kind as DriveAgentCapability["kind"],
        itemId: scope.itemId,
        ttlMinutes: row.ttl_minutes,
      },
      reason: row.reason,
      agentName: row.agent_name,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      usedCount: row.used_count + 1,
      lastUsedAt: nowIso(),
    };
  }

  listAgentShares(itemId?: string): DriveAgentShareRecord[] {
    const rows = (itemId
      ? this.sqlite.prepare("SELECT * FROM agent_shares WHERE item_id = ? ORDER BY created_at DESC").all(itemId)
      : this.sqlite.prepare("SELECT * FROM agent_shares ORDER BY created_at DESC").all()
    ) as Array<{
      id: string; item_id: string; capability_kind: string; capability_scope_json: string;
      ttl_minutes: number; reason: string | null; agent_name: string;
      created_at: string; expires_at: string; revoked_at: string | null;
      used_count: number; last_used_at: string | null;
    }>;
    return rows.map((row) => {
      const scope = parseJson<{ itemId: string | null }>(row.capability_scope_json, { itemId: null });
      return {
        id: row.id,
        itemId: row.item_id,
        capability: {
          kind: row.capability_kind as DriveAgentCapability["kind"],
          itemId: scope.itemId,
          ttlMinutes: row.ttl_minutes,
        },
        reason: row.reason,
        agentName: row.agent_name,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        usedCount: row.used_count,
        lastUsedAt: row.last_used_at,
      };
    });
  }

  revokeAgentShare(id: string): boolean {
    return this.sqlite.prepare("UPDATE agent_shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(nowIso(), id).changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Thumbnails
  // ---------------------------------------------------------------------------

  setThumbnail(record: DriveThumbnailRecord): void {
    this.sqlite.prepare(`
      INSERT OR REPLACE INTO thumbnails (item_id, size, path, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(record.itemId, record.size, record.path, record.mimeType, record.createdAt);
  }

  getThumbnail(itemId: string, size: 256 | 512): DriveThumbnailRecord | null {
    const row = this.sqlite.prepare(`
      SELECT item_id, size, path, mime_type, created_at
      FROM thumbnails
      WHERE item_id = ? AND size = ?
      LIMIT 1
    `).get(itemId, size) as undefined | {
      item_id: string; size: number; path: string; mime_type: string; created_at: string;
    };
    if (!row) return null;
    return {
      itemId: row.item_id,
      size: row.size as 256 | 512,
      path: row.path,
      mimeType: row.mime_type,
      createdAt: row.created_at,
    };
  }

  // ---------------------------------------------------------------------------
  // EXIF
  // ---------------------------------------------------------------------------

  setExif(record: DriveExifRecord): void {
    this.sqlite.prepare(`
      INSERT OR REPLACE INTO exif_metadata (
        item_id, taken_at, camera_make, camera_model, lens_model, iso, shutter_speed,
        aperture, focal_length, latitude, longitude, orientation, width, height, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.itemId, record.takenAt, record.cameraMake, record.cameraModel, record.lensModel,
      record.iso, record.shutterSpeed, record.aperture, record.focalLength,
      record.latitude, record.longitude, record.orientation, record.width, record.height,
      stringifyJson(record.raw),
    );
  }

  getExif(itemId: string): DriveExifRecord | null {
    const row = this.sqlite.prepare(`
      SELECT * FROM exif_metadata WHERE item_id = ? LIMIT 1
    `).get(itemId) as undefined | {
      item_id: string; taken_at: string | null; camera_make: string | null;
      camera_model: string | null; lens_model: string | null; iso: number | null;
      shutter_speed: string | null; aperture: number | null; focal_length: number | null;
      latitude: number | null; longitude: number | null; orientation: number | null;
      width: number | null; height: number | null; raw_json: string;
    };
    if (!row) return null;
    return {
      itemId: row.item_id,
      takenAt: row.taken_at,
      cameraMake: row.camera_make,
      cameraModel: row.camera_model,
      lensModel: row.lens_model,
      iso: row.iso,
      shutterSpeed: row.shutter_speed,
      aperture: row.aperture,
      focalLength: row.focal_length,
      latitude: row.latitude,
      longitude: row.longitude,
      orientation: row.orientation,
      width: row.width,
      height: row.height,
      raw: parseJson<Record<string, unknown>>(row.raw_json, {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  setEmbedding(itemId: string, modelId: string, vector: Float32Array): DriveEmbeddingRecord {
    const buf = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    const createdAt = nowIso();
    this.sqlite.prepare(`
      INSERT OR REPLACE INTO embeddings (item_id, model_id, dim, vector, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(itemId, modelId, vector.length, buf, createdAt);
    return { itemId, modelId, dim: vector.length, createdAt };
  }

  getEmbedding(itemId: string, modelId: string): Float32Array | null {
    const row = this.sqlite.prepare(`
      SELECT dim, vector FROM embeddings WHERE item_id = ? AND model_id = ? LIMIT 1
    `).get(itemId, modelId) as undefined | { dim: number; vector: Buffer };
    if (!row) return null;
    return new Float32Array(row.vector.buffer, row.vector.byteOffset, row.dim);
  }

  /** All embeddings for a given model, joined with the item, used by semantic search. */
  listAllEmbeddings(modelId: string): Array<{ itemId: string; vector: Float32Array; item: DriveItem }> {
    const rows = this.sqlite.prepare(`
      SELECT e.item_id AS item_id, e.dim AS dim, e.vector AS vector
      FROM embeddings e
      INNER JOIN items i ON i.id = e.item_id
      WHERE e.model_id = ? AND i.trashed_at IS NULL
    `).all(modelId) as Array<{ item_id: string; dim: number; vector: Buffer }>;
    return rows.flatMap((row) => {
      const item = this.getItem(row.item_id);
      if (!item) return [];
      return [{
        itemId: row.item_id,
        vector: new Float32Array(row.vector.buffer, row.vector.byteOffset, row.dim),
        item,
      }];
    });
  }

  // ---------------------------------------------------------------------------
  // Auto-purge (Apple-style 30 day retention for trashed items)
  // ---------------------------------------------------------------------------

  sweepTrashedOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = this.sqlite.prepare(`
      SELECT id FROM items WHERE trashed_at IS NOT NULL AND trashed_at < ?
    `).all(cutoff) as Array<{ id: string }>;
    let purged = 0;
    for (const row of rows) {
      if (this.deleteItemForever(row.id)) purged += 1;
    }
    return purged;
  }

  // ---------------------------------------------------------------------------
  // Project folder hook (auto-create /projects/<slug>/)
  // ---------------------------------------------------------------------------

  ensureProjectFolder(projectSlug: string, actor: DriveActor): string {
    // Find or create /projects/
    let projects = this.sqlite.prepare(`
      SELECT id FROM items WHERE parent_id = ? AND name = 'projects' AND kind = 'folder' AND trashed_at IS NULL LIMIT 1
    `).get(ROOT_FOLDER_ID) as { id: string } | undefined;
    if (!projects) {
      const detail = this.createItem({ kind: "folder", name: "projects", parentId: null }, actor);
      projects = { id: detail.id };
    }
    // Find or create /projects/<slug>/
    let projectFolder = this.sqlite.prepare(`
      SELECT id FROM items WHERE parent_id = ? AND name = ? AND kind = 'folder' AND trashed_at IS NULL LIMIT 1
    `).get(projects.id, projectSlug) as { id: string } | undefined;
    if (!projectFolder) {
      const detail = this.createItem({ kind: "folder", name: projectSlug, parentId: projects.id }, actor);
      projectFolder = { id: detail.id };
    }
    return projectFolder.id;
  }

  /** Find a single existing item by SHA256 storage_path (dedup helper). */
  findByStoragePath(relativePath: string): DriveItem | null {
    const row = this.sqlite.prepare(`
      SELECT * FROM items WHERE storage_path = ? AND trashed_at IS NULL LIMIT 1
    `).get(relativePath) as ItemRow | undefined;
    return row ? serializeItem(row) : null;
  }
}
