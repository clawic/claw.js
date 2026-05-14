// @clawjs-persistent-surface-ddl-source
import crypto from "node:crypto";

import Database from "better-sqlite3";

import { hashSecret } from "./auth.ts";
import type {
  WikiSpace,
  WikiPage,
  WikiRevision,
  WikiComment,
  WikiLink,
  ScopedTokenRecord,
  PageStatus,
  LinkType,
  WikiOperation,
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

interface SpaceRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface PageRow {
  id: string;
  space_id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  parent_page_id: string | null;
  tags_json: string;
  created_by_agent_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RevisionRow {
  id: string;
  page_id: string;
  revision_number: number;
  title: string;
  body: string;
  change_summary: string | null;
  edited_by_agent_id: string | null;
  edited_by_user_id: string | null;
  created_at: string;
}

interface CommentRow {
  id: string;
  page_id: string;
  parent_comment_id: string | null;
  body: string;
  author_agent_id: string | null;
  author_user_id: string | null;
  upvotes: number;
  created_at: string;
  updated_at: string;
}

interface LinkRow {
  id: string;
  source_page_id: string;
  target_page_id: string;
  link_type: string;
  label: string | null;
  created_at: string;
}

interface TokenRow {
  id: string;
  label: string;
  token_hash: string;
  space_id: string | null;
  operations_json: string;
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

const PAGE_ROW_SELECT = `
  p.id,
  p.space AS space_id,
  p.title,
  COALESCE(json_extract(p.properties_json, '$.slug'), p.id) AS slug,
  COALESCE((
    SELECT group_concat(b.text, char(10) || char(10))
    FROM page_blocks b
    WHERE b.page_id = p.id
    ORDER BY b.sort_order ASC, b.created_at ASC
  ), '') AS body,
  COALESCE(json_extract(p.properties_json, '$.status'), 'published') AS status,
  json_extract(p.properties_json, '$.parentPageId') AS parent_page_id,
  p.tags_json,
  CASE WHEN p.author_kind = 'agent' THEN p.author_id ELSE NULL END AS created_by_agent_id,
  CASE WHEN p.author_kind = 'user' THEN p.author_id ELSE NULL END AS created_by_user_id,
  p.created_at,
  p.updated_at
`;

// ── Serializers ──────────────────────────────────────────────────────────────

function serializeSpace(row: SpaceRow): WikiSpace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePage(row: PageRow): WikiPage {
  return {
    id: row.id,
    spaceId: row.space_id,
    title: row.title,
    slug: row.slug,
    body: row.body,
    status: row.status as PageStatus,
    parentPageId: row.parent_page_id,
    tags: parseJson<string[]>(row.tags_json, []),
    createdByAgentId: row.created_by_agent_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRevision(row: RevisionRow): WikiRevision {
  return {
    id: row.id,
    pageId: row.page_id,
    revisionNumber: row.revision_number,
    title: row.title,
    body: row.body,
    changeSummary: row.change_summary,
    editedByAgentId: row.edited_by_agent_id,
    editedByUserId: row.edited_by_user_id,
    createdAt: row.created_at,
  };
}

function serializeComment(row: CommentRow): WikiComment {
  return {
    id: row.id,
    pageId: row.page_id,
    parentCommentId: row.parent_comment_id,
    body: row.body,
    authorAgentId: row.author_agent_id,
    authorUserId: row.author_user_id,
    upvotes: row.upvotes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeLink(row: LinkRow): WikiLink {
  return {
    id: row.id,
    sourcePageId: row.source_page_id,
    targetPageId: row.target_page_id,
    linkType: row.link_type as LinkType,
    label: row.label,
    createdAt: row.created_at,
  };
}

function serializeToken(row: TokenRow): ScopedTokenRecord {
  return {
    id: row.id,
    label: row.label,
    spaceId: row.space_id,
    operations: parseJson<WikiOperation[]>(row.operations_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

// ── WikiStore ────────────────────────────────────────────────────────────────

export class WikiStore {
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
      CREATE TABLE IF NOT EXISTS wiki_admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wiki_spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        space TEXT NOT NULL DEFAULT 'notes',
        surface TEXT NOT NULL DEFAULT 'note',
        owner_id TEXT,
        author_kind TEXT NOT NULL DEFAULT 'user',
        author_id TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        sensitivity TEXT NOT NULL DEFAULT 'normal',
        tags_json TEXT NOT NULL DEFAULT '[]',
        properties_json TEXT NOT NULL DEFAULT '{}',
        source_record_domain TEXT,
        source_record_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE INDEX IF NOT EXISTS pages_space_updated_idx ON pages(space, archived_at, updated_at DESC);
      CREATE INDEX IF NOT EXISTS pages_surface_idx ON pages(surface, updated_at DESC);
      CREATE INDEX IF NOT EXISTS pages_source_record_idx ON pages(source_record_domain, source_record_id);

      CREATE TABLE IF NOT EXISTS page_blocks (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        parent_block_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'paragraph',
        content_json TEXT NOT NULL DEFAULT '{}',
        text TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS page_blocks_page_order_idx ON page_blocks(page_id, sort_order, created_at);

      CREATE TABLE IF NOT EXISTS page_revisions (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        author_kind TEXT NOT NULL DEFAULT 'system',
        author_id TEXT,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
        UNIQUE (page_id, revision_number)
      );

      CREATE TABLE IF NOT EXISTS page_comments (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        block_id TEXT,
        parent_comment_id TEXT,
        body TEXT NOT NULL,
        author_kind TEXT NOT NULL DEFAULT 'user',
        author_id TEXT,
        upvotes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS page_comments_page_idx ON page_comments(page_id, created_at);

      CREATE TABLE IF NOT EXISTS page_links (
        id TEXT PRIMARY KEY,
        source_page_id TEXT NOT NULL,
        target_page_id TEXT NOT NULL,
        relation TEXT NOT NULL DEFAULT 'related',
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE,
        UNIQUE (source_page_id, target_page_id, relation)
      );
      CREATE INDEX IF NOT EXISTS page_links_target_idx ON page_links(target_page_id);

      CREATE TABLE IF NOT EXISTS wiki_scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        space_id TEXT,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (space_id) REFERENCES wiki_spaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS page_comments_parent_idx ON page_comments(parent_comment_id);
      CREATE INDEX IF NOT EXISTS wiki_revisions_page_idx ON page_revisions(page_id);
    `);

    this.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        page_id UNINDEXED,
        title,
        body,
        tags,
        tokenize='unicode61'
      );
    `);
  }

  private seed(): void {
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO wiki_admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run("admin", "admin@localhost", hashSecret("admin"), now);

    const exists = this.sqlite.prepare("SELECT 1 FROM wiki_spaces LIMIT 1").get();
    if (!exists) {
      this.createSpace({ name: "Main", slug: "main" });
    }
  }

  // ── Admins ───────────────────────────────────────────────────────────────

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare("SELECT * FROM wiki_admins WHERE email = ?").get(email) as AdminRow | undefined;
    if (!row) return null;
    if (row.password_hash !== hashSecret(password)) return null;
    return { id: row.id, email: row.email };
  }

  // ── Spaces ───────────────────────────────────────────────────────────────

  listSpaces(): WikiSpace[] {
    return (this.sqlite.prepare("SELECT * FROM wiki_spaces ORDER BY name ASC").all() as SpaceRow[]).map(serializeSpace);
  }

  getSpace(spaceId: string): WikiSpace | undefined {
    const row = this.sqlite.prepare("SELECT * FROM wiki_spaces WHERE id = ?").get(spaceId) as SpaceRow | undefined;
    return row ? serializeSpace(row) : undefined;
  }

  getSpaceBySlug(slug: string): WikiSpace | undefined {
    const row = this.sqlite.prepare("SELECT * FROM wiki_spaces WHERE slug = ?").get(slug) as SpaceRow | undefined;
    return row ? serializeSpace(row) : undefined;
  }

  /** Resolve a space by ID or slug. Returns the canonical space ID or undefined. */
  resolveSpaceId(idOrSlug: string): string | undefined {
    const byId = this.getSpace(idOrSlug);
    if (byId) return byId.id;
    const bySlug = this.getSpaceBySlug(idOrSlug);
    return bySlug?.id;
  }

  createSpace(input: { name: string; slug?: string; description?: string }): WikiSpace {
    const id = uuid();
    const slug = input.slug ?? slugify(input.name);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO wiki_spaces (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.name, slug, input.description ?? "", now, now);
    return this.getSpace(id)!;
  }

  updateSpace(spaceId: string, input: { name?: string; slug?: string; description?: string }): WikiSpace {
    const current = this.getSpace(spaceId);
    if (!current) throw new Error(`Space ${spaceId} not found.`);
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE wiki_spaces SET name = ?, slug = ?, description = ?, updated_at = ? WHERE id = ?
    `).run(
      input.name ?? current.name,
      input.slug ?? current.slug,
      input.description ?? current.description,
      now,
      spaceId,
    );
    return this.getSpace(spaceId)!;
  }

  deleteSpace(spaceId: string): boolean {
    return this.sqlite.prepare("DELETE FROM wiki_spaces WHERE id = ?").run(spaceId).changes > 0;
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  private writePageBody(pageId: string, body: string, timestamp: string): void {
    this.sqlite.prepare("DELETE FROM page_blocks WHERE page_id = ?").run(pageId);
    this.sqlite.prepare(`
      INSERT INTO page_blocks (id, page_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at)
      VALUES (?, ?, 0, 'markdown', ?, ?, '{}', ?, ?)
    `).run(`${pageId}:body`, pageId, JSON.stringify({ markdown: body }), body, timestamp, timestamp);
  }

  private writePageFts(pageId: string, title: string, body: string, tagsJson: string): void {
    this.sqlite.prepare("DELETE FROM notes_fts WHERE page_id = ?").run(pageId);
    this.sqlite.prepare("INSERT INTO notes_fts (page_id, title, body, tags) VALUES (?, ?, ?, ?)").run(pageId, title, body, tagsJson);
  }

  private pageRowById(pageId: string): PageRow | undefined {
    return this.sqlite.prepare(`SELECT ${PAGE_ROW_SELECT} FROM pages p WHERE p.id = ? AND p.surface = 'wiki' AND p.archived_at IS NULL`)
      .get(pageId) as PageRow | undefined;
  }

  private pageRowBySlug(spaceId: string, slug: string): PageRow | undefined {
    return this.sqlite.prepare(`
      SELECT ${PAGE_ROW_SELECT}
      FROM pages p
      WHERE p.space = ? AND p.surface = 'wiki' AND p.archived_at IS NULL
        AND COALESCE(json_extract(p.properties_json, '$.slug'), p.id) = ?
    `).get(spaceId, slug) as PageRow | undefined;
  }

  listPages(spaceId: string, options: {
    parentPageId?: string | null;
    status?: PageStatus;
    tag?: string;
    limit?: number;
    offset?: number;
  } = {}): { items: WikiPage[]; total: number } {
    const conditions: string[] = ["p.space = ?", "p.surface = 'wiki'", "p.archived_at IS NULL"];
    const params: unknown[] = [spaceId];

    if (options.parentPageId !== undefined) {
      if (options.parentPageId === null) {
        conditions.push("json_extract(p.properties_json, '$.parentPageId') IS NULL");
      } else {
        conditions.push("json_extract(p.properties_json, '$.parentPageId') = ?");
        params.push(options.parentPageId);
      }
    }
    if (options.status) {
      conditions.push("COALESCE(json_extract(p.properties_json, '$.status'), 'published') = ?");
      params.push(options.status);
    }
    if (options.tag) {
      conditions.push("p.tags_json LIKE ?");
      params.push(`%"${options.tag}"%`);
    }

    const where = conditions.join(" AND ");
    const total = (this.sqlite.prepare(`SELECT COUNT(*) as count FROM pages p WHERE ${where}`).get(...params) as { count: number }).count;

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const rows = this.sqlite.prepare(`
      SELECT ${PAGE_ROW_SELECT} FROM pages p WHERE ${where} ORDER BY p.title ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as PageRow[];

    return { items: rows.map(serializePage), total };
  }

  getPage(spaceId: string, slug: string): WikiPage | undefined {
    const row = this.pageRowBySlug(spaceId, slug);
    return row ? serializePage(row) : undefined;
  }

  getPageById(pageId: string): WikiPage | undefined {
    const row = this.pageRowById(pageId);
    return row ? serializePage(row) : undefined;
  }

  createPage(spaceId: string, input: {
    title: string;
    slug?: string;
    body?: string;
    status?: PageStatus;
    parentPageId?: string | null;
    tags?: string[];
    createdByAgentId?: string;
    createdByUserId?: string;
  }): WikiPage {
    const id = uuid();
    const slug = input.slug ?? slugify(input.title);
    const now = nowIso();
    const tagsJson = JSON.stringify(input.tags ?? []);
    const existing = this.pageRowBySlug(spaceId, slug);
    if (existing) throw new Error(`Page slug ${slug} already exists in space ${spaceId}.`);
    const authorKind = input.createdByAgentId ? "agent" : "user";
    const authorId = input.createdByAgentId ?? input.createdByUserId ?? null;
    const properties = JSON.stringify({
      slug,
      status: input.status ?? "published",
      parentPageId: input.parentPageId ?? null,
    });

    this.sqlite.prepare(`
      INSERT INTO pages (
        id, title, space, surface, author_kind, author_id, visibility, sensitivity,
        tags_json, properties_json, created_at, updated_at
      )
      VALUES (?, ?, ?, 'wiki', ?, ?, 'private', 'normal', ?, ?, ?, ?)
    `).run(
      id, input.title, spaceId, authorKind, authorId, tagsJson, properties, now, now,
    );
    this.writePageBody(id, input.body ?? "", now);

    this.sqlite.prepare(`
      INSERT INTO page_revisions (id, page_id, revision_number, snapshot_json, created_at, author_kind, author_id)
      VALUES (?, ?, 1, ?, ?, ?, ?)
    `).run(
      uuid(),
      id,
      JSON.stringify({ title: input.title, body: input.body ?? "", changeSummary: "Initial version" }),
      now,
      authorKind,
      authorId,
    );

    this.writePageFts(id, input.title, input.body ?? "", tagsJson);

    return this.getPageById(id)!;
  }

  updatePage(spaceId: string, slug: string, input: {
    title?: string;
    slug?: string;
    body?: string;
    status?: PageStatus;
    parentPageId?: string | null;
    tags?: string[];
    changeSummary?: string;
    editedByAgentId?: string;
    editedByUserId?: string;
  }): WikiPage {
    const current = this.getPage(spaceId, slug);
    if (!current) throw new Error(`Page ${slug} not found in space ${spaceId}.`);

    const now = nowIso();
    const newTitle = input.title ?? current.title;
    const newSlug = input.slug ?? current.slug;
    const newBody = input.body ?? current.body;
    const newStatus = input.status ?? current.status;
    const newTags = input.tags ?? current.tags;
    const newTagsJson = JSON.stringify(newTags);
    const newParentPageId = input.parentPageId !== undefined ? input.parentPageId : current.parentPageId;
    const properties = JSON.stringify({ slug: newSlug, status: newStatus, parentPageId: newParentPageId });

    this.sqlite.prepare(`
      UPDATE pages SET title = ?, tags_json = ?, properties_json = ?, updated_at = ?
      WHERE id = ?
    `).run(newTitle, newTagsJson, properties, now, current.id);
    this.writePageBody(current.id, newBody, now);
    this.writePageFts(current.id, newTitle, newBody, newTagsJson);

    if (newBody !== current.body || newTitle !== current.title) {
      const maxRev = (this.sqlite.prepare(
        "SELECT COALESCE(MAX(revision_number), 0) as max_rev FROM page_revisions WHERE page_id = ?",
      ).get(current.id) as { max_rev: number }).max_rev;
      const authorKind = input.editedByAgentId ? "agent" : "user";
      const authorId = input.editedByAgentId ?? input.editedByUserId ?? null;

      this.sqlite.prepare(`
        INSERT INTO page_revisions (id, page_id, revision_number, snapshot_json, created_at, author_kind, author_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        current.id,
        maxRev + 1,
        JSON.stringify({ title: newTitle, body: newBody, changeSummary: input.changeSummary ?? null }),
        now,
        authorKind,
        authorId,
      );
    }

    return this.getPageById(current.id)!;
  }

  deletePage(spaceId: string, slug: string): boolean {
    const page = this.getPage(spaceId, slug);
    if (!page) return false;
    this.sqlite.prepare("DELETE FROM notes_fts WHERE page_id = ?").run(page.id);
    return this.sqlite.prepare("UPDATE pages SET archived_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), page.id).changes > 0;
  }

  getPageTree(spaceId: string, slug: string): WikiPage[] {
    const page = this.getPage(spaceId, slug);
    if (!page) return [];
    const rows = this.sqlite.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM pages WHERE id = ? AND surface = 'wiki' AND archived_at IS NULL
        UNION ALL
        SELECT p.id FROM pages p JOIN tree t ON json_extract(p.properties_json, '$.parentPageId') = t.id
        WHERE p.surface = 'wiki' AND p.archived_at IS NULL
      )
      SELECT ${PAGE_ROW_SELECT} FROM pages p JOIN tree t ON p.id = t.id ORDER BY p.title ASC
    `).all(page.id) as PageRow[];
    return rows.map(serializePage);
  }

  // ── Revisions ────────────────────────────────────────────────────────────

  listRevisions(pageId: string): WikiRevision[] {
    return (this.sqlite.prepare(
      `SELECT
        id,
        page_id,
        revision_number,
        COALESCE(json_extract(snapshot_json, '$.title'), '') AS title,
        COALESCE(json_extract(snapshot_json, '$.body'), '') AS body,
        json_extract(snapshot_json, '$.changeSummary') AS change_summary,
        CASE WHEN author_kind = 'agent' THEN author_id ELSE NULL END AS edited_by_agent_id,
        CASE WHEN author_kind = 'user' THEN author_id ELSE NULL END AS edited_by_user_id,
        created_at
      FROM page_revisions
      WHERE page_id = ?
      ORDER BY revision_number DESC`,
    ).all(pageId) as RevisionRow[]).map(serializeRevision);
  }

  getRevision(pageId: string, revisionNumber: number): WikiRevision | undefined {
    const row = this.sqlite.prepare(
      `SELECT
        id,
        page_id,
        revision_number,
        COALESCE(json_extract(snapshot_json, '$.title'), '') AS title,
        COALESCE(json_extract(snapshot_json, '$.body'), '') AS body,
        json_extract(snapshot_json, '$.changeSummary') AS change_summary,
        CASE WHEN author_kind = 'agent' THEN author_id ELSE NULL END AS edited_by_agent_id,
        CASE WHEN author_kind = 'user' THEN author_id ELSE NULL END AS edited_by_user_id,
        created_at
      FROM page_revisions
      WHERE page_id = ? AND revision_number = ?`,
    ).get(pageId, revisionNumber) as RevisionRow | undefined;
    return row ? serializeRevision(row) : undefined;
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  listComments(pageId: string): WikiComment[] {
    return (this.sqlite.prepare(
      `SELECT
        id,
        page_id,
        parent_comment_id,
        body,
        CASE WHEN author_kind = 'agent' THEN author_id ELSE NULL END AS author_agent_id,
        CASE WHEN author_kind = 'user' THEN author_id ELSE NULL END AS author_user_id,
        upvotes,
        created_at,
        updated_at
      FROM page_comments
      WHERE page_id = ?
      ORDER BY created_at ASC`,
    ).all(pageId) as CommentRow[]).map(serializeComment);
  }

  createComment(pageId: string, input: {
    body: string;
    parentCommentId?: string | null;
    authorAgentId?: string;
    authorUserId?: string;
  }): WikiComment {
    const id = uuid();
    const now = nowIso();
    const authorKind = input.authorAgentId ? "agent" : "user";
    const authorId = input.authorAgentId ?? input.authorUserId ?? null;
    this.sqlite.prepare(`
      INSERT INTO page_comments (id, page_id, parent_comment_id, body, author_kind, author_id, upvotes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, pageId, input.parentCommentId ?? null, input.body,
      authorKind, authorId,
      now, now,
    );
    return this.getCommentById(id)!;
  }

  getCommentById(commentId: string): WikiComment | undefined {
    const row = this.sqlite.prepare(`
      SELECT
        id,
        page_id,
        parent_comment_id,
        body,
        CASE WHEN author_kind = 'agent' THEN author_id ELSE NULL END AS author_agent_id,
        CASE WHEN author_kind = 'user' THEN author_id ELSE NULL END AS author_user_id,
        upvotes,
        created_at,
        updated_at
      FROM page_comments
      WHERE id = ?
    `).get(commentId) as CommentRow | undefined;
    return row ? serializeComment(row) : undefined;
  }

  updateComment(commentId: string, input: { body: string }): WikiComment {
    const now = nowIso();
    this.sqlite.prepare("UPDATE page_comments SET body = ?, updated_at = ? WHERE id = ?").run(input.body, now, commentId);
    return this.getCommentById(commentId)!;
  }

  deleteComment(commentId: string): boolean {
    return this.sqlite.prepare("DELETE FROM page_comments WHERE id = ?").run(commentId).changes > 0;
  }

  upvoteComment(commentId: string): WikiComment {
    this.sqlite.prepare("UPDATE page_comments SET upvotes = upvotes + 1, updated_at = ? WHERE id = ?").run(nowIso(), commentId);
    return this.getCommentById(commentId)!;
  }

  // ── Links ────────────────────────────────────────────────────────────────

  listPageLinks(pageId: string): WikiLink[] {
    return (this.sqlite.prepare(
      "SELECT id, source_page_id, target_page_id, relation AS link_type, NULL AS label, created_at FROM page_links WHERE source_page_id = ? OR target_page_id = ? ORDER BY created_at DESC",
    ).all(pageId, pageId) as LinkRow[]).map(serializeLink);
  }

  getBacklinks(pageId: string): WikiLink[] {
    return (this.sqlite.prepare(
      "SELECT id, source_page_id, target_page_id, relation AS link_type, NULL AS label, created_at FROM page_links WHERE target_page_id = ? ORDER BY created_at DESC",
    ).all(pageId) as LinkRow[]).map(serializeLink);
  }

  createLink(input: {
    sourcePageId: string;
    targetPageId: string;
    linkType?: LinkType;
    label?: string;
  }): WikiLink {
    const id = uuid();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO page_links (id, source_page_id, target_page_id, relation, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, input.sourcePageId, input.targetPageId, input.linkType ?? "related", now);
    const row = this.sqlite.prepare("SELECT id, source_page_id, target_page_id, relation AS link_type, NULL AS label, created_at FROM page_links WHERE id = ?").get(id) as LinkRow | undefined;
    return row ? serializeLink(row) : undefined as never;
  }

  deleteLink(linkId: string): boolean {
    return this.sqlite.prepare("DELETE FROM page_links WHERE id = ?").run(linkId).changes > 0;
  }

  syncWikilinks(pageId: string, targetPageIds: string[]): void {
    const existing = (this.sqlite.prepare(
      "SELECT target_page_id FROM page_links WHERE source_page_id = ? AND relation = 'wikilink'",
    ).all(pageId) as { target_page_id: string }[]).map((row) => row.target_page_id);

    const toAdd = targetPageIds.filter((id) => !existing.includes(id));
    const toRemove = existing.filter((id) => !targetPageIds.includes(id));

    const now = nowIso();
    const insert = this.sqlite.prepare(
      "INSERT OR IGNORE INTO page_links (id, source_page_id, target_page_id, relation, created_at) VALUES (?, ?, ?, 'wikilink', ?)",
    );
    for (const targetId of toAdd) {
      insert.run(uuid(), pageId, targetId, now);
    }

    const remove = this.sqlite.prepare(
      "DELETE FROM page_links WHERE source_page_id = ? AND target_page_id = ? AND relation = 'wikilink'",
    );
    for (const targetId of toRemove) {
      remove.run(pageId, targetId);
    }
  }

  // ── Graph traversal ──────────────────────────────────────────────────────

  traverseGraph(pageId: string, depth: number = 3): Array<{ pageId: string; depth: number; path: string[] }> {
    const rows = this.sqlite.prepare(`
      WITH RECURSIVE traversal(page_id, depth, path) AS (
        SELECT target_page_id, 1, source_page_id || ',' || target_page_id
        FROM page_links WHERE source_page_id = ?
        UNION ALL
        SELECT l.target_page_id, t.depth + 1, t.path || ',' || l.target_page_id
        FROM page_links l JOIN traversal t ON l.source_page_id = t.page_id
        WHERE t.depth < ? AND t.path NOT LIKE '%' || l.target_page_id || '%'
      )
      SELECT DISTINCT page_id, MIN(depth) as depth, path FROM traversal
      GROUP BY page_id ORDER BY depth ASC
    `).all(pageId, depth) as Array<{ page_id: string; depth: number; path: string }>;

    return rows.map((row) => ({
      pageId: row.page_id,
      depth: row.depth,
      path: row.path.split(","),
    }));
  }

  // ── FTS Search ───────────────────────────────────────────────────────────

  searchFts(query: string, options: { spaceId?: string; limit?: number } = {}): Array<{ page: WikiPage; snippet: string; rank: number }> {
    const limit = options.limit ?? 20;

    const ftsRows = this.sqlite.prepare(`
      SELECT page_id, rank, snippet(notes_fts, 2, '<mark>', '</mark>', '...', 40) as snippet
      FROM notes_fts WHERE notes_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(query, limit) as Array<{ page_id: string; rank: number; snippet: string }>;

    const results: Array<{ page: WikiPage; snippet: string; rank: number }> = [];
    for (const ftsRow of ftsRows) {
      const pageRow = this.pageRowById(ftsRow.page_id);
      if (!pageRow) continue;
      if (options.spaceId && pageRow.space_id !== options.spaceId) continue;
      results.push({
        page: serializePage(pageRow),
        snippet: ftsRow.snippet,
        rank: ftsRow.rank,
      });
    }

    return results;
  }

  // ── Scoped Tokens ────────────────────────────────────────────────────────

  listScopedTokens(spaceId: string): ScopedTokenRecord[] {
    return (this.sqlite.prepare(
      "SELECT * FROM wiki_scoped_tokens WHERE space_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
    ).all(spaceId) as TokenRow[]).map(serializeToken);
  }

  createScopedToken(input: {
    label: string;
    spaceId?: string;
    operations: WikiOperation[];
  }): { token: ScopedTokenRecord; plaintext: string } {
    const id = uuid();
    const plaintext = `wk_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO wiki_scoped_tokens (id, label, token_hash, space_id, operations_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.label, hashSecret(plaintext), input.spaceId ?? null, JSON.stringify(input.operations), now);
    return {
      token: serializeToken(this.sqlite.prepare("SELECT * FROM wiki_scoped_tokens WHERE id = ?").get(id) as TokenRow),
      plaintext,
    };
  }

  authenticateScopedToken(plaintext: string): ScopedTokenRecord | null {
    const hash = hashSecret(plaintext);
    const row = this.sqlite.prepare(
      "SELECT * FROM wiki_scoped_tokens WHERE token_hash = ? AND revoked_at IS NULL",
    ).get(hash) as TokenRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE wiki_scoped_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), row.id);
    return serializeToken(row);
  }

  revokeScopedToken(spaceId: string, tokenId: string): boolean {
    return this.sqlite.prepare(
      "UPDATE wiki_scoped_tokens SET revoked_at = ? WHERE id = ? AND space_id = ? AND revoked_at IS NULL",
    ).run(nowIso(), tokenId, spaceId).changes > 0;
  }

  // ── Resolve page by slug across wiki_spaces (for wikilinks) ──────────────────

  resolvePageBySlug(slug: string, preferredSpaceId?: string): WikiPage | undefined {
    if (preferredSpaceId) {
      const row = this.pageRowBySlug(preferredSpaceId, slug);
      if (row) return serializePage(row);
    }
    const row = this.sqlite.prepare(`
      SELECT ${PAGE_ROW_SELECT}
      FROM pages p
      WHERE p.surface = 'wiki' AND p.archived_at IS NULL
        AND COALESCE(json_extract(p.properties_json, '$.slug'), p.id) = ?
      LIMIT 1
    `).get(slug) as PageRow | undefined;
    return row ? serializePage(row) : undefined;
  }
}
