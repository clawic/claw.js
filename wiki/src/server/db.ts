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
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'published',
        parent_page_id TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_by_agent_id TEXT,
        created_by_user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_page_id) REFERENCES pages(id) ON DELETE SET NULL,
        UNIQUE (space_id, slug)
      );

      CREATE TABLE IF NOT EXISTS page_revisions (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        change_summary TEXT,
        edited_by_agent_id TEXT,
        edited_by_user_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
        UNIQUE (page_id, revision_number)
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        parent_comment_id TEXT,
        body TEXT NOT NULL,
        author_agent_id TEXT,
        author_user_id TEXT,
        upvotes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        source_page_id TEXT NOT NULL,
        target_page_id TEXT NOT NULL,
        link_type TEXT NOT NULL DEFAULT 'related',
        label TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY (target_page_id) REFERENCES pages(id) ON DELETE CASCADE,
        UNIQUE (source_page_id, target_page_id, link_type)
      );

      CREATE TABLE IF NOT EXISTS scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        space_id TEXT,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS pages_space_idx ON pages(space_id);
      CREATE INDEX IF NOT EXISTS pages_parent_idx ON pages(parent_page_id);
      CREATE INDEX IF NOT EXISTS pages_slug_idx ON pages(slug);
      CREATE INDEX IF NOT EXISTS pages_status_idx ON pages(status);
      CREATE INDEX IF NOT EXISTS links_source_idx ON links(source_page_id);
      CREATE INDEX IF NOT EXISTS links_target_idx ON links(target_page_id);
      CREATE INDEX IF NOT EXISTS links_type_idx ON links(link_type);
      CREATE INDEX IF NOT EXISTS comments_page_idx ON comments(page_id);
      CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_comment_id);
      CREATE INDEX IF NOT EXISTS revisions_page_idx ON page_revisions(page_id);
    `);

    // FTS5 virtual table for full-text search.
    // We manage content manually (external content is fragile with WAL).
    this.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        title, body, tags,
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

    const exists = this.sqlite.prepare("SELECT 1 FROM spaces LIMIT 1").get();
    if (!exists) {
      this.createSpace({ name: "Main", slug: "main" });
    }
  }

  // ── Admins ───────────────────────────────────────────────────────────────

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare("SELECT * FROM admins WHERE email = ?").get(email) as AdminRow | undefined;
    if (!row) return null;
    if (row.password_hash !== hashSecret(password)) return null;
    return { id: row.id, email: row.email };
  }

  // ── Spaces ───────────────────────────────────────────────────────────────

  listSpaces(): WikiSpace[] {
    return (this.sqlite.prepare("SELECT * FROM spaces ORDER BY name ASC").all() as SpaceRow[]).map(serializeSpace);
  }

  getSpace(spaceId: string): WikiSpace | undefined {
    const row = this.sqlite.prepare("SELECT * FROM spaces WHERE id = ?").get(spaceId) as SpaceRow | undefined;
    return row ? serializeSpace(row) : undefined;
  }

  getSpaceBySlug(slug: string): WikiSpace | undefined {
    const row = this.sqlite.prepare("SELECT * FROM spaces WHERE slug = ?").get(slug) as SpaceRow | undefined;
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
      INSERT INTO spaces (id, name, slug, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.name, slug, input.description ?? "", now, now);
    return this.getSpace(id)!;
  }

  updateSpace(spaceId: string, input: { name?: string; slug?: string; description?: string }): WikiSpace {
    const current = this.getSpace(spaceId);
    if (!current) throw new Error(`Space ${spaceId} not found.`);
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE spaces SET name = ?, slug = ?, description = ?, updated_at = ? WHERE id = ?
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
    return this.sqlite.prepare("DELETE FROM spaces WHERE id = ?").run(spaceId).changes > 0;
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  listPages(spaceId: string, options: {
    parentPageId?: string | null;
    status?: PageStatus;
    tag?: string;
    limit?: number;
    offset?: number;
  } = {}): { items: WikiPage[]; total: number } {
    const conditions: string[] = ["p.space_id = ?"];
    const params: unknown[] = [spaceId];

    if (options.parentPageId !== undefined) {
      if (options.parentPageId === null) {
        conditions.push("p.parent_page_id IS NULL");
      } else {
        conditions.push("p.parent_page_id = ?");
        params.push(options.parentPageId);
      }
    }
    if (options.status) {
      conditions.push("p.status = ?");
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
      SELECT p.* FROM pages p WHERE ${where} ORDER BY p.title ASC LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as PageRow[];

    return { items: rows.map(serializePage), total };
  }

  getPage(spaceId: string, slug: string): WikiPage | undefined {
    const row = this.sqlite.prepare(
      "SELECT * FROM pages WHERE space_id = ? AND slug = ?",
    ).get(spaceId, slug) as PageRow | undefined;
    return row ? serializePage(row) : undefined;
  }

  getPageById(pageId: string): WikiPage | undefined {
    const row = this.sqlite.prepare("SELECT * FROM pages WHERE id = ?").get(pageId) as PageRow | undefined;
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

    this.sqlite.prepare(`
      INSERT INTO pages (id, space_id, title, slug, body, status, parent_page_id, tags_json,
        created_by_agent_id, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, spaceId, input.title, slug, input.body ?? "", input.status ?? "published",
      input.parentPageId ?? null, tagsJson,
      input.createdByAgentId ?? null, input.createdByUserId ?? null,
      now, now,
    );

    // Insert initial revision
    this.sqlite.prepare(`
      INSERT INTO page_revisions (id, page_id, revision_number, title, body, change_summary,
        edited_by_agent_id, edited_by_user_id, created_at)
      VALUES (?, ?, 1, ?, ?, 'Initial version', ?, ?, ?)
    `).run(
      uuid(), id, input.title, input.body ?? "",
      input.createdByAgentId ?? null, input.createdByUserId ?? null,
      now,
    );

    // Insert into FTS
    this.sqlite.prepare(
      "INSERT INTO pages_fts(rowid, title, body, tags) VALUES ((SELECT rowid FROM pages WHERE id = ?), ?, ?, ?)",
    ).run(id, input.title, input.body ?? "", tagsJson);

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

    // Delete old FTS entry
    const rowid = (this.sqlite.prepare("SELECT rowid FROM pages WHERE id = ?").get(current.id) as { rowid: number })?.rowid;
    if (rowid) {
      this.sqlite.prepare("DELETE FROM pages_fts WHERE rowid = ?").run(rowid);
    }

    this.sqlite.prepare(`
      UPDATE pages SET title = ?, slug = ?, body = ?, status = ?, parent_page_id = ?,
        tags_json = ?, updated_at = ?
      WHERE id = ?
    `).run(newTitle, newSlug, newBody, newStatus, newParentPageId, newTagsJson, now, current.id);

    // Insert new FTS entry
    if (rowid) {
      this.sqlite.prepare(
        "INSERT INTO pages_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)",
      ).run(rowid, newTitle, newBody, newTagsJson);
    }

    // Create revision if body or title changed
    if (newBody !== current.body || newTitle !== current.title) {
      const maxRev = (this.sqlite.prepare(
        "SELECT COALESCE(MAX(revision_number), 0) as max_rev FROM page_revisions WHERE page_id = ?",
      ).get(current.id) as { max_rev: number }).max_rev;

      this.sqlite.prepare(`
        INSERT INTO page_revisions (id, page_id, revision_number, title, body, change_summary,
          edited_by_agent_id, edited_by_user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(), current.id, maxRev + 1, newTitle, newBody,
        input.changeSummary ?? null,
        input.editedByAgentId ?? null, input.editedByUserId ?? null,
        now,
      );
    }

    return this.getPageById(current.id)!;
  }

  deletePage(spaceId: string, slug: string): boolean {
    const page = this.getPage(spaceId, slug);
    if (!page) return false;

    // Remove from FTS
    const rowid = (this.sqlite.prepare("SELECT rowid FROM pages WHERE id = ?").get(page.id) as { rowid: number })?.rowid;
    if (rowid) {
      this.sqlite.prepare("DELETE FROM pages_fts WHERE rowid = ?").run(rowid);
    }

    return this.sqlite.prepare("DELETE FROM pages WHERE id = ?").run(page.id).changes > 0;
  }

  getPageTree(spaceId: string, slug: string): WikiPage[] {
    const page = this.getPage(spaceId, slug);
    if (!page) return [];
    const rows = this.sqlite.prepare(`
      WITH RECURSIVE tree(id) AS (
        SELECT id FROM pages WHERE id = ?
        UNION ALL
        SELECT p.id FROM pages p JOIN tree t ON p.parent_page_id = t.id
      )
      SELECT p.* FROM pages p JOIN tree t ON p.id = t.id ORDER BY p.title ASC
    `).all(page.id) as PageRow[];
    return rows.map(serializePage);
  }

  // ── Revisions ────────────────────────────────────────────────────────────

  listRevisions(pageId: string): WikiRevision[] {
    return (this.sqlite.prepare(
      "SELECT * FROM page_revisions WHERE page_id = ? ORDER BY revision_number DESC",
    ).all(pageId) as RevisionRow[]).map(serializeRevision);
  }

  getRevision(pageId: string, revisionNumber: number): WikiRevision | undefined {
    const row = this.sqlite.prepare(
      "SELECT * FROM page_revisions WHERE page_id = ? AND revision_number = ?",
    ).get(pageId, revisionNumber) as RevisionRow | undefined;
    return row ? serializeRevision(row) : undefined;
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  listComments(pageId: string): WikiComment[] {
    return (this.sqlite.prepare(
      "SELECT * FROM comments WHERE page_id = ? ORDER BY created_at ASC",
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
    this.sqlite.prepare(`
      INSERT INTO comments (id, page_id, parent_comment_id, body, author_agent_id, author_user_id,
        upvotes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id, pageId, input.parentCommentId ?? null, input.body,
      input.authorAgentId ?? null, input.authorUserId ?? null,
      now, now,
    );
    return this.getCommentById(id)!;
  }

  getCommentById(commentId: string): WikiComment | undefined {
    const row = this.sqlite.prepare("SELECT * FROM comments WHERE id = ?").get(commentId) as CommentRow | undefined;
    return row ? serializeComment(row) : undefined;
  }

  updateComment(commentId: string, input: { body: string }): WikiComment {
    const now = nowIso();
    this.sqlite.prepare("UPDATE comments SET body = ?, updated_at = ? WHERE id = ?").run(input.body, now, commentId);
    return this.getCommentById(commentId)!;
  }

  deleteComment(commentId: string): boolean {
    return this.sqlite.prepare("DELETE FROM comments WHERE id = ?").run(commentId).changes > 0;
  }

  upvoteComment(commentId: string): WikiComment {
    this.sqlite.prepare("UPDATE comments SET upvotes = upvotes + 1 WHERE id = ?").run(commentId);
    return this.getCommentById(commentId)!;
  }

  // ── Links ────────────────────────────────────────────────────────────────

  listPageLinks(pageId: string): WikiLink[] {
    return (this.sqlite.prepare(
      "SELECT * FROM links WHERE source_page_id = ? OR target_page_id = ? ORDER BY created_at DESC",
    ).all(pageId, pageId) as LinkRow[]).map(serializeLink);
  }

  getBacklinks(pageId: string): WikiLink[] {
    return (this.sqlite.prepare(
      "SELECT * FROM links WHERE target_page_id = ? ORDER BY created_at DESC",
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
      INSERT INTO links (id, source_page_id, target_page_id, link_type, label, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.sourcePageId, input.targetPageId, input.linkType ?? "related", input.label ?? null, now);
    return (this.sqlite.prepare("SELECT * FROM links WHERE id = ?").get(id) as LinkRow | undefined) ? serializeLink(this.sqlite.prepare("SELECT * FROM links WHERE id = ?").get(id) as LinkRow) : undefined as never;
  }

  deleteLink(linkId: string): boolean {
    return this.sqlite.prepare("DELETE FROM links WHERE id = ?").run(linkId).changes > 0;
  }

  syncWikilinks(pageId: string, targetPageIds: string[]): void {
    const existing = (this.sqlite.prepare(
      "SELECT target_page_id FROM links WHERE source_page_id = ? AND link_type = 'wikilink'",
    ).all(pageId) as { target_page_id: string }[]).map((row) => row.target_page_id);

    const toAdd = targetPageIds.filter((id) => !existing.includes(id));
    const toRemove = existing.filter((id) => !targetPageIds.includes(id));

    const now = nowIso();
    const insert = this.sqlite.prepare(
      "INSERT OR IGNORE INTO links (id, source_page_id, target_page_id, link_type, label, created_at) VALUES (?, ?, ?, 'wikilink', NULL, ?)",
    );
    for (const targetId of toAdd) {
      insert.run(uuid(), pageId, targetId, now);
    }

    const remove = this.sqlite.prepare(
      "DELETE FROM links WHERE source_page_id = ? AND target_page_id = ? AND link_type = 'wikilink'",
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
        FROM links WHERE source_page_id = ?
        UNION ALL
        SELECT l.target_page_id, t.depth + 1, t.path || ',' || l.target_page_id
        FROM links l JOIN traversal t ON l.source_page_id = t.page_id
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

    // FTS5 match query
    const ftsRows = this.sqlite.prepare(`
      SELECT rowid, rank, snippet(pages_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
      FROM pages_fts WHERE pages_fts MATCH ?
      ORDER BY rank LIMIT ?
    `).all(query, limit) as Array<{ rowid: number; rank: number; snippet: string }>;

    const results: Array<{ page: WikiPage; snippet: string; rank: number }> = [];
    for (const ftsRow of ftsRows) {
      const pageRow = this.sqlite.prepare(
        "SELECT * FROM pages WHERE rowid = ?",
      ).get(ftsRow.rowid) as PageRow | undefined;
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
      "SELECT * FROM scoped_tokens WHERE space_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
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
      INSERT INTO scoped_tokens (id, label, token_hash, space_id, operations_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.label, hashSecret(plaintext), input.spaceId ?? null, JSON.stringify(input.operations), now);
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

  revokeScopedToken(spaceId: string, tokenId: string): boolean {
    return this.sqlite.prepare(
      "UPDATE scoped_tokens SET revoked_at = ? WHERE id = ? AND space_id = ? AND revoked_at IS NULL",
    ).run(nowIso(), tokenId, spaceId).changes > 0;
  }

  // ── Resolve page by slug across spaces (for wikilinks) ──────────────────

  resolvePageBySlug(slug: string, preferredSpaceId?: string): WikiPage | undefined {
    if (preferredSpaceId) {
      const row = this.sqlite.prepare(
        "SELECT * FROM pages WHERE slug = ? AND space_id = ?",
      ).get(slug, preferredSpaceId) as PageRow | undefined;
      if (row) return serializePage(row);
    }
    const row = this.sqlite.prepare(
      "SELECT * FROM pages WHERE slug = ? LIMIT 1",
    ).get(slug) as PageRow | undefined;
    return row ? serializePage(row) : undefined;
  }
}
