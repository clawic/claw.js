import crypto from "node:crypto";

import Database from "better-sqlite3";

import { hashSecret } from "./auth.ts";
import type {
  FeedSource,
  FeedItem,
  FeedAnnotation,
  FeedCollection,
  FeedCollectionItem,
  ScopedTokenRecord,
  FeedStats,
  SourceType,
  ItemType,
  ItemStatus,
  Importance,
  AnnotationType,
  FeedOperation,
} from "../shared/types.ts";

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Row types ────────────────────────────────────────────────────────────────

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

interface SourceRow {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  url: string | null;
  config_json: string;
  enabled: number;
  poll_interval_minutes: number;
  last_polled_at: string | null;
  last_error: string | null;
  item_count: number;
  tags_json: string;
  created_by_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  source_id: string | null;
  item_type: string;
  external_id: string | null;
  url: string | null;
  title: string;
  body: string;
  author_name: string | null;
  author_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  meta_json: string;
  status: string;
  starred: number;
  importance: string;
  tags_json: string;
  saved_by_agent_id: string | null;
  save_reason: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  archived_at: string | null;
}

interface AnnotationRow {
  id: string;
  item_id: string;
  agent_id: string | null;
  annotation_type: string;
  body: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface CollectionRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  is_smart: number;
  filter_json: string | null;
  sort_order: string;
  created_by_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectionItemRow {
  id: string;
  collection_id: string;
  item_id: string;
  position: number;
  added_at: string;
  added_by_agent_id: string | null;
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

// ── Serializers ──────────────────────────────────────────────────────────────

function serializeSource(row: SourceRow): FeedSource {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sourceType: row.source_type as SourceType,
    url: row.url,
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    enabled: row.enabled === 1,
    pollIntervalMinutes: row.poll_interval_minutes,
    lastPolledAt: row.last_polled_at,
    lastError: row.last_error,
    itemCount: row.item_count,
    tags: parseJson<string[]>(row.tags_json, []),
    createdByAgentId: row.created_by_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeItem(row: ItemRow): FeedItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    itemType: row.item_type as ItemType,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    authorUrl: row.author_url,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    meta: parseJson<Record<string, unknown>>(row.meta_json, {}),
    status: row.status as ItemStatus,
    starred: row.starred === 1,
    importance: row.importance as Importance,
    tags: parseJson<string[]>(row.tags_json, []),
    savedByAgentId: row.saved_by_agent_id,
    saveReason: row.save_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readAt: row.read_at,
    archivedAt: row.archived_at,
  };
}

function serializeAnnotation(row: AnnotationRow): FeedAnnotation {
  return {
    id: row.id,
    itemId: row.item_id,
    agentId: row.agent_id,
    annotationType: row.annotation_type as AnnotationType,
    body: row.body,
    data: parseJson<Record<string, unknown>>(row.data_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeCollection(row: CollectionRow): FeedCollection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    isSmart: row.is_smart === 1,
    filter: row.filter_json ? parseJson<Record<string, unknown>>(row.filter_json, null) : null,
    sortOrder: row.sort_order,
    createdByAgentId: row.created_by_agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeCollectionItem(row: CollectionItemRow): FeedCollectionItem {
  return {
    id: row.id,
    collectionId: row.collection_id,
    itemId: row.item_id,
    position: row.position,
    addedAt: row.added_at,
    addedByAgentId: row.added_by_agent_id,
  };
}

function serializeToken(row: TokenRow): ScopedTokenRecord {
  return {
    id: row.id,
    label: row.label,
    operations: parseJson<FeedOperation[]>(row.operations_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

// ── FeedStore ────────────────────────────────────────────────────────────────

export class FeedStore {
  private readonly sqlite: ReturnType<typeof Database>;

  constructor(dbPath: string) {
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
  }

  close(): void {
    this.sqlite.close();
  }

  // ── Schema ───────────────────────────────────────────────────────────────

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        source_type TEXT NOT NULL,
        url TEXT,
        config_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 1,
        poll_interval_minutes INTEGER NOT NULL DEFAULT 60,
        last_polled_at TEXT,
        last_error TEXT,
        item_count INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_by_agent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        item_type TEXT NOT NULL,
        external_id TEXT,
        url TEXT,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        author_name TEXT,
        author_url TEXT,
        thumbnail_url TEXT,
        published_at TEXT,
        meta_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'unread',
        starred INTEGER NOT NULL DEFAULT 0,
        importance TEXT NOT NULL DEFAULT 'normal',
        tags_json TEXT NOT NULL DEFAULT '[]',
        saved_by_agent_id TEXT,
        save_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        read_at TEXT,
        archived_at TEXT,
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS items_source_external_idx
        ON items(source_id, external_id)
        WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        agent_id TEXT,
        annotation_type TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT,
        is_smart INTEGER NOT NULL DEFAULT 0,
        filter_json TEXT,
        sort_order TEXT NOT NULL DEFAULT 'newest',
        created_by_agent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS collection_items (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL,
        added_by_agent_id TEXT,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
        UNIQUE (collection_id, item_id)
      );

      CREATE TABLE IF NOT EXISTS scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT
      );

      CREATE INDEX IF NOT EXISTS items_source_idx ON items(source_id);
      CREATE INDEX IF NOT EXISTS items_type_idx ON items(item_type);
      CREATE INDEX IF NOT EXISTS items_status_idx ON items(status);
      CREATE INDEX IF NOT EXISTS items_importance_idx ON items(importance);
      CREATE INDEX IF NOT EXISTS items_published_idx ON items(published_at);
      CREATE INDEX IF NOT EXISTS items_created_idx ON items(created_at);
      CREATE INDEX IF NOT EXISTS annotations_item_idx ON annotations(item_id);
      CREATE INDEX IF NOT EXISTS annotations_type_idx ON annotations(annotation_type);
      CREATE INDEX IF NOT EXISTS collection_items_coll_idx ON collection_items(collection_id);
      CREATE INDEX IF NOT EXISTS collection_items_item_idx ON collection_items(item_id);
      CREATE INDEX IF NOT EXISTS sources_type_idx ON sources(source_type);
      CREATE INDEX IF NOT EXISTS sources_enabled_idx ON sources(enabled);
    `);

    this.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        title, body, author_name, tags,
        tokenize='porter unicode61'
      );
    `);
  }

  private seed(): void {
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run("admin", "admin@localhost", hashSecret("admin"), now);
  }

  // ── Admins ───────────────────────────────────────────────────────────────

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare("SELECT * FROM admins WHERE email = ?").get(email) as AdminRow | undefined;
    if (!row) return null;
    if (row.password_hash !== hashSecret(password)) return null;
    return { id: row.id, email: row.email };
  }

  // ── Sources ──────────────────────────────────────────────────────────────

  listSources(options: { type?: SourceType; enabled?: boolean } = {}): FeedSource[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.type) {
      conditions.push("source_type = ?");
      params.push(options.type);
    }
    if (options.enabled !== undefined) {
      conditions.push("enabled = ?");
      params.push(options.enabled ? 1 : 0);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return (this.sqlite.prepare(`SELECT * FROM sources ${where} ORDER BY name ASC`).all(...params) as SourceRow[]).map(serializeSource);
  }

  getSource(id: string): FeedSource | undefined {
    const row = this.sqlite.prepare("SELECT * FROM sources WHERE id = ?").get(id) as SourceRow | undefined;
    return row ? serializeSource(row) : undefined;
  }

  getSourceBySlug(slug: string): FeedSource | undefined {
    const row = this.sqlite.prepare("SELECT * FROM sources WHERE slug = ?").get(slug) as SourceRow | undefined;
    return row ? serializeSource(row) : undefined;
  }

  resolveSourceId(idOrSlug: string): string | undefined {
    const byId = this.getSource(idOrSlug);
    if (byId) return byId.id;
    const bySlug = this.getSourceBySlug(idOrSlug);
    return bySlug?.id;
  }

  createSource(input: {
    name: string;
    sourceType: SourceType;
    url?: string;
    slug?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
    pollIntervalMinutes?: number;
    tags?: string[];
    createdByAgentId?: string;
  }): FeedSource {
    const id = uuid();
    const slug = input.slug ?? slugify(input.name);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO sources (id, name, slug, source_type, url, config_json, enabled,
        poll_interval_minutes, tags_json, created_by_agent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, slug, input.sourceType, input.url ?? null,
      JSON.stringify(input.config ?? {}), input.enabled !== false ? 1 : 0,
      input.pollIntervalMinutes ?? 60, JSON.stringify(input.tags ?? []),
      input.createdByAgentId ?? null, now, now,
    );
    return this.getSource(id)!;
  }

  updateSource(id: string, input: {
    name?: string;
    url?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
    pollIntervalMinutes?: number;
    tags?: string[];
  }): FeedSource {
    const current = this.getSource(id);
    if (!current) throw new Error(`Source ${id} not found.`);
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE sources SET name = ?, url = ?, config_json = ?, enabled = ?,
        poll_interval_minutes = ?, tags_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name ?? current.name,
      input.url ?? current.url,
      input.config ? JSON.stringify(input.config) : JSON.stringify(current.config),
      input.enabled !== undefined ? (input.enabled ? 1 : 0) : (current.enabled ? 1 : 0),
      input.pollIntervalMinutes ?? current.pollIntervalMinutes,
      input.tags ? JSON.stringify(input.tags) : JSON.stringify(current.tags),
      now, id,
    );
    return this.getSource(id)!;
  }

  deleteSource(id: string): boolean {
    return this.sqlite.prepare("DELETE FROM sources WHERE id = ?").run(id).changes > 0;
  }

  updateSourcePolled(id: string, error?: string): void {
    const now = nowIso();
    const count = (this.sqlite.prepare(
      "SELECT COUNT(*) as count FROM items WHERE source_id = ?",
    ).get(id) as { count: number }).count;
    this.sqlite.prepare(`
      UPDATE sources SET last_polled_at = ?, last_error = ?, item_count = ?, updated_at = ? WHERE id = ?
    `).run(now, error ?? null, count, now, id);
  }

  // ── Items ────────────────────────────────────────────────────────────────

  listItems(options: {
    sourceId?: string;
    status?: ItemStatus;
    itemType?: ItemType;
    importance?: Importance;
    tag?: string;
    starred?: boolean;
    after?: string;
    before?: string;
    limit?: number;
    offset?: number;
    sort?: "newest" | "oldest" | "importance" | "published";
  } = {}): { items: FeedItem[]; total: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.sourceId) {
      conditions.push("source_id = ?");
      params.push(options.sourceId);
    }
    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }
    if (options.itemType) {
      conditions.push("item_type = ?");
      params.push(options.itemType);
    }
    if (options.importance) {
      conditions.push("importance = ?");
      params.push(options.importance);
    }
    if (options.tag) {
      conditions.push("tags_json LIKE ?");
      params.push(`%"${options.tag}"%`);
    }
    if (options.starred !== undefined) {
      conditions.push("starred = ?");
      params.push(options.starred ? 1 : 0);
    }
    if (options.after) {
      conditions.push("created_at >= ?");
      params.push(options.after);
    }
    if (options.before) {
      conditions.push("created_at <= ?");
      params.push(options.before);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = (this.sqlite.prepare(`SELECT COUNT(*) as count FROM items ${where}`).get(...params) as { count: number }).count;

    let orderBy: string;
    switch (options.sort) {
      case "oldest":
        orderBy = "created_at ASC";
        break;
      case "importance":
        orderBy = "CASE importance WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END ASC, created_at DESC";
        break;
      case "published":
        orderBy = "published_at DESC NULLS LAST, created_at DESC";
        break;
      default:
        orderBy = "created_at DESC";
    }

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const rows = this.sqlite.prepare(`
      SELECT * FROM items ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ItemRow[];

    return { items: rows.map(serializeItem), total };
  }

  getItem(id: string): FeedItem | undefined {
    const row = this.sqlite.prepare("SELECT * FROM items WHERE id = ?").get(id) as ItemRow | undefined;
    return row ? serializeItem(row) : undefined;
  }

  createItem(input: {
    sourceId?: string;
    itemType: ItemType;
    externalId?: string;
    url?: string;
    title?: string;
    body?: string;
    authorName?: string;
    authorUrl?: string;
    thumbnailUrl?: string;
    publishedAt?: string;
    meta?: Record<string, unknown>;
    status?: ItemStatus;
    importance?: Importance;
    tags?: string[];
    savedByAgentId?: string;
    saveReason?: string;
  }): FeedItem {
    const id = uuid();
    const now = nowIso();
    const tagsJson = JSON.stringify(input.tags ?? []);

    this.sqlite.prepare(`
      INSERT INTO items (id, source_id, item_type, external_id, url, title, body,
        author_name, author_url, thumbnail_url, published_at, meta_json,
        status, importance, tags_json, saved_by_agent_id, save_reason,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.sourceId ?? null, input.itemType, input.externalId ?? null,
      input.url ?? null, input.title ?? "", input.body ?? "",
      input.authorName ?? null, input.authorUrl ?? null,
      input.thumbnailUrl ?? null, input.publishedAt ?? null,
      JSON.stringify(input.meta ?? {}),
      input.status ?? "unread", input.importance ?? "normal",
      tagsJson, input.savedByAgentId ?? null, input.saveReason ?? null,
      now, now,
    );

    // Insert into FTS
    this.sqlite.prepare(
      "INSERT INTO items_fts(rowid, title, body, author_name, tags) VALUES ((SELECT rowid FROM items WHERE id = ?), ?, ?, ?, ?)",
    ).run(id, input.title ?? "", input.body ?? "", input.authorName ?? "", tagsJson);

    return this.getItem(id)!;
  }

  /** Insert item only if no duplicate exists (for ingestion). Returns the item or null if skipped. */
  createItemIfNew(input: Parameters<FeedStore["createItem"]>[0]): FeedItem | null {
    if (input.sourceId && input.externalId) {
      const existing = this.sqlite.prepare(
        "SELECT id FROM items WHERE source_id = ? AND external_id = ?",
      ).get(input.sourceId, input.externalId) as { id: string } | undefined;
      if (existing) return null;
    }
    return this.createItem(input);
  }

  updateItem(id: string, input: {
    title?: string;
    body?: string;
    status?: ItemStatus;
    starred?: boolean;
    importance?: Importance;
    tags?: string[];
  }): FeedItem {
    const current = this.getItem(id);
    if (!current) throw new Error(`Item ${id} not found.`);
    const now = nowIso();

    const newTitle = input.title ?? current.title;
    const newBody = input.body ?? current.body;
    const newStatus = input.status ?? current.status;
    const newStarred = input.starred !== undefined ? input.starred : current.starred;
    const newImportance = input.importance ?? current.importance;
    const newTags = input.tags ?? current.tags;
    const newTagsJson = JSON.stringify(newTags);

    let readAt = current.readAt;
    let archivedAt = current.archivedAt;
    if (newStatus === "read" && current.status !== "read") readAt = now;
    if (newStatus === "archived" && current.status !== "archived") archivedAt = now;

    // Update FTS
    const rowid = (this.sqlite.prepare("SELECT rowid FROM items WHERE id = ?").get(id) as { rowid: number })?.rowid;
    if (rowid) {
      this.sqlite.prepare("DELETE FROM items_fts WHERE rowid = ?").run(rowid);
    }

    this.sqlite.prepare(`
      UPDATE items SET title = ?, body = ?, status = ?, starred = ?, importance = ?,
        tags_json = ?, read_at = ?, archived_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newTitle, newBody, newStatus, newStarred ? 1 : 0, newImportance,
      newTagsJson, readAt, archivedAt, now, id,
    );

    if (rowid) {
      this.sqlite.prepare(
        "INSERT INTO items_fts(rowid, title, body, author_name, tags) VALUES (?, ?, ?, ?, ?)",
      ).run(rowid, newTitle, newBody, current.authorName ?? "", newTagsJson);
    }

    return this.getItem(id)!;
  }

  markRead(id: string): FeedItem {
    return this.updateItem(id, { status: "read" });
  }

  toggleStar(id: string): FeedItem {
    const current = this.getItem(id);
    if (!current) throw new Error(`Item ${id} not found.`);
    return this.updateItem(id, { starred: !current.starred });
  }

  archiveItem(id: string): FeedItem {
    return this.updateItem(id, { status: "archived" });
  }

  deleteItem(id: string): boolean {
    const rowid = (this.sqlite.prepare("SELECT rowid FROM items WHERE id = ?").get(id) as { rowid: number })?.rowid;
    if (rowid) {
      this.sqlite.prepare("DELETE FROM items_fts WHERE rowid = ?").run(rowid);
    }
    return this.sqlite.prepare("DELETE FROM items WHERE id = ?").run(id).changes > 0;
  }

  bulkUpdateItems(itemIds: string[], action: "read" | "archive" | "delete" | "star", tag?: string): number {
    let changed = 0;
    for (const id of itemIds) {
      switch (action) {
        case "read":
          this.markRead(id);
          changed++;
          break;
        case "archive":
          this.archiveItem(id);
          changed++;
          break;
        case "delete":
          if (this.deleteItem(id)) changed++;
          break;
        case "star":
          this.toggleStar(id);
          changed++;
          break;
      }
    }
    if (tag) {
      for (const id of itemIds) {
        const item = this.getItem(id);
        if (item && !item.tags.includes(tag)) {
          this.updateItem(id, { tags: [...item.tags, tag] });
        }
      }
    }
    return changed;
  }

  // ── Annotations ──────────────────────────────────────────────────────────

  listAnnotations(itemId: string): FeedAnnotation[] {
    return (this.sqlite.prepare(
      "SELECT * FROM annotations WHERE item_id = ? ORDER BY created_at ASC",
    ).all(itemId) as AnnotationRow[]).map(serializeAnnotation);
  }

  getAnnotation(id: string): FeedAnnotation | undefined {
    const row = this.sqlite.prepare("SELECT * FROM annotations WHERE id = ?").get(id) as AnnotationRow | undefined;
    return row ? serializeAnnotation(row) : undefined;
  }

  createAnnotation(itemId: string, input: {
    annotationType: AnnotationType;
    body?: string;
    data?: Record<string, unknown>;
    agentId?: string;
  }): FeedAnnotation {
    const id = uuid();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO annotations (id, item_id, agent_id, annotation_type, body, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, itemId, input.agentId ?? null, input.annotationType,
      input.body ?? "", JSON.stringify(input.data ?? {}), now, now,
    );
    return this.getAnnotation(id)!;
  }

  updateAnnotation(id: string, input: { body?: string; data?: Record<string, unknown> }): FeedAnnotation {
    const current = this.getAnnotation(id);
    if (!current) throw new Error(`Annotation ${id} not found.`);
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE annotations SET body = ?, data_json = ?, updated_at = ? WHERE id = ?
    `).run(
      input.body ?? current.body,
      input.data ? JSON.stringify(input.data) : JSON.stringify(current.data),
      now, id,
    );
    return this.getAnnotation(id)!;
  }

  deleteAnnotation(id: string): boolean {
    return this.sqlite.prepare("DELETE FROM annotations WHERE id = ?").run(id).changes > 0;
  }

  // ── Collections ──────────────────────────────────────────────────────────

  listCollections(): FeedCollection[] {
    return (this.sqlite.prepare("SELECT * FROM collections ORDER BY name ASC").all() as CollectionRow[]).map(serializeCollection);
  }

  getCollection(id: string): FeedCollection | undefined {
    const row = this.sqlite.prepare("SELECT * FROM collections WHERE id = ?").get(id) as CollectionRow | undefined;
    return row ? serializeCollection(row) : undefined;
  }

  getCollectionBySlug(slug: string): FeedCollection | undefined {
    const row = this.sqlite.prepare("SELECT * FROM collections WHERE slug = ?").get(slug) as CollectionRow | undefined;
    return row ? serializeCollection(row) : undefined;
  }

  resolveCollectionId(idOrSlug: string): string | undefined {
    const byId = this.getCollection(idOrSlug);
    if (byId) return byId.id;
    const bySlug = this.getCollectionBySlug(idOrSlug);
    return bySlug?.id;
  }

  createCollection(input: {
    name: string;
    slug?: string;
    description?: string;
    icon?: string;
    isSmart?: boolean;
    filter?: Record<string, unknown>;
    sortOrder?: string;
    createdByAgentId?: string;
  }): FeedCollection {
    const id = uuid();
    const slug = input.slug ?? slugify(input.name);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO collections (id, name, slug, description, icon, is_smart, filter_json,
        sort_order, created_by_agent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, slug, input.description ?? "", input.icon ?? null,
      input.isSmart ? 1 : 0, input.filter ? JSON.stringify(input.filter) : null,
      input.sortOrder ?? "newest", input.createdByAgentId ?? null, now, now,
    );
    return this.getCollection(id)!;
  }

  updateCollection(id: string, input: {
    name?: string;
    description?: string;
    icon?: string;
    filter?: Record<string, unknown>;
    sortOrder?: string;
  }): FeedCollection {
    const current = this.getCollection(id);
    if (!current) throw new Error(`Collection ${id} not found.`);
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE collections SET name = ?, description = ?, icon = ?, filter_json = ?,
        sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.name ?? current.name,
      input.description ?? current.description,
      input.icon ?? current.icon,
      input.filter ? JSON.stringify(input.filter) : (current.filter ? JSON.stringify(current.filter) : null),
      input.sortOrder ?? current.sortOrder,
      now, id,
    );
    return this.getCollection(id)!;
  }

  deleteCollection(id: string): boolean {
    return this.sqlite.prepare("DELETE FROM collections WHERE id = ?").run(id).changes > 0;
  }

  getCollectionItemCount(collectionId: string): number {
    return (this.sqlite.prepare(
      "SELECT COUNT(*) as count FROM collection_items WHERE collection_id = ?",
    ).get(collectionId) as { count: number }).count;
  }

  listCollectionItems(collectionId: string, options: { limit?: number; offset?: number } = {}): { items: FeedItem[]; total: number } {
    const total = this.getCollectionItemCount(collectionId);
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const rows = this.sqlite.prepare(`
      SELECT i.* FROM items i
      JOIN collection_items ci ON ci.item_id = i.id
      WHERE ci.collection_id = ?
      ORDER BY ci.position ASC, ci.added_at DESC
      LIMIT ? OFFSET ?
    `).all(collectionId, limit, offset) as ItemRow[];
    return { items: rows.map(serializeItem), total };
  }

  addItemsToCollection(collectionId: string, itemIds: string[], addedByAgentId?: string): number {
    const now = nowIso();
    let maxPos = (this.sqlite.prepare(
      "SELECT COALESCE(MAX(position), 0) as max_pos FROM collection_items WHERE collection_id = ?",
    ).get(collectionId) as { max_pos: number }).max_pos;

    let added = 0;
    const stmt = this.sqlite.prepare(`
      INSERT OR IGNORE INTO collection_items (id, collection_id, item_id, position, added_at, added_by_agent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const itemId of itemIds) {
      maxPos++;
      const result = stmt.run(uuid(), collectionId, itemId, maxPos, now, addedByAgentId ?? null);
      if (result.changes > 0) added++;
    }
    return added;
  }

  removeItemFromCollection(collectionId: string, itemId: string): boolean {
    return this.sqlite.prepare(
      "DELETE FROM collection_items WHERE collection_id = ? AND item_id = ?",
    ).run(collectionId, itemId).changes > 0;
  }

  // ── Search ───────────────────────────────────────────────────────────────

  searchItems(query: string, options: {
    itemType?: ItemType;
    status?: ItemStatus;
    sourceId?: string;
    tag?: string;
    limit?: number;
  } = {}): Array<{ item: FeedItem; snippet: string; rank: number }> {
    const limit = options.limit ?? 20;

    const ftsRows = this.sqlite.prepare(`
      SELECT rowid, rank, snippet(items_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
      FROM items_fts WHERE items_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(query, limit * 2) as Array<{ rowid: number; rank: number; snippet: string }>;

    const results: Array<{ item: FeedItem; snippet: string; rank: number }> = [];
    for (const ftsRow of ftsRows) {
      if (results.length >= limit) break;
      const itemRow = this.sqlite.prepare(
        "SELECT * FROM items WHERE rowid = ?",
      ).get(ftsRow.rowid) as ItemRow | undefined;
      if (!itemRow) continue;
      if (options.itemType && itemRow.item_type !== options.itemType) continue;
      if (options.status && itemRow.status !== options.status) continue;
      if (options.sourceId && itemRow.source_id !== options.sourceId) continue;
      if (options.tag && !itemRow.tags_json.includes(`"${options.tag}"`)) continue;
      results.push({
        item: serializeItem(itemRow),
        snippet: ftsRow.snippet,
        rank: ftsRow.rank,
      });
    }

    return results;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  getStats(): FeedStats {
    const total = (this.sqlite.prepare("SELECT COUNT(*) as count FROM items").get() as { count: number }).count;
    const unread = (this.sqlite.prepare("SELECT COUNT(*) as count FROM items WHERE status = 'unread'").get() as { count: number }).count;
    const starred = (this.sqlite.prepare("SELECT COUNT(*) as count FROM items WHERE starred = 1").get() as { count: number }).count;

    const byType: Record<string, number> = {};
    const typeRows = this.sqlite.prepare("SELECT item_type, COUNT(*) as count FROM items GROUP BY item_type").all() as Array<{ item_type: string; count: number }>;
    for (const row of typeRows) byType[row.item_type] = row.count;

    const bySource: Record<string, number> = {};
    const sourceRows = this.sqlite.prepare(
      "SELECT COALESCE(s.name, 'manual') as name, COUNT(*) as count FROM items i LEFT JOIN sources s ON i.source_id = s.id GROUP BY i.source_id",
    ).all() as Array<{ name: string; count: number }>;
    for (const row of sourceRows) bySource[row.name] = row.count;

    const byImportance: Record<string, number> = {};
    const impRows = this.sqlite.prepare("SELECT importance, COUNT(*) as count FROM items GROUP BY importance").all() as Array<{ importance: string; count: number }>;
    for (const row of impRows) byImportance[row.importance] = row.count;

    return { total, unread, starred, byType, bySource, byImportance };
  }

  // ── Scoped Tokens ────────────────────────────────────────────────────────

  listScopedTokens(): ScopedTokenRecord[] {
    return (this.sqlite.prepare(
      "SELECT * FROM scoped_tokens WHERE revoked_at IS NULL ORDER BY created_at DESC",
    ).all() as TokenRow[]).map(serializeToken);
  }

  createScopedToken(input: {
    label: string;
    operations: FeedOperation[];
  }): { token: ScopedTokenRecord; plaintext: string } {
    const id = uuid();
    const plaintext = `fd_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO scoped_tokens (id, label, token_hash, operations_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, input.label, hashSecret(plaintext), JSON.stringify(input.operations), now);
    return {
      token: serializeToken(this.sqlite.prepare("SELECT * FROM scoped_tokens WHERE id = ?").get(id) as TokenRow),
      plaintext,
    };
  }

  authenticateScopedToken(plaintext: string): ScopedTokenRecord | null {
    const hash = hashSecret(plaintext);
    const row = this.sqlite.prepare(
      "SELECT * FROM scoped_tokens WHERE token_hash = ? AND revoked_at IS NULL",
    ).get(hash) as TokenRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE scoped_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
    return serializeToken(row);
  }

  revokeScopedToken(tokenId: string): boolean {
    return this.sqlite.prepare(
      "UPDATE scoped_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    ).run(nowIso(), tokenId).changes > 0;
  }

  // ── Enabled sources for polling ──────────────────────────────────────────

  getSourcesDueForPolling(): FeedSource[] {
    const now = new Date();
    const all = this.listSources({ enabled: true });
    return all.filter((source) => {
      if (!source.lastPolledAt) return true;
      const lastPolled = new Date(source.lastPolledAt);
      const nextPoll = new Date(lastPolled.getTime() + source.pollIntervalMinutes * 60_000);
      return now >= nextPoll;
    });
  }
}
