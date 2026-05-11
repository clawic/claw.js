import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";

export interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  branding: Record<string, unknown>;
  default_timezone: string;
  week_starts_on: string;
  default_locale: string;
  settings: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: number;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "ws";
}

export class WorkspacesService {
  constructor(private readonly db: DB) {}

  create(input: {
    name: string;
    slug?: string;
    default_timezone?: string;
    default_locale?: string;
    branding?: Record<string, unknown>;
  }): WorkspaceRow {
    const id = prefixedId("ws");
    let slug = input.slug ? slugify(input.slug) : slugify(input.name);
    let attempt = 0;
    while (this.db.prepare(`SELECT 1 FROM workspace WHERE slug = ?`).get(slug)) {
      attempt += 1;
      slug = `${slug}-${attempt}`;
    }
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO workspace (id, name, slug, branding, default_timezone, week_starts_on, default_locale, settings, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'mon', ?, '{}', ?, ?)`,
      )
      .run(
        id,
        input.name,
        slug,
        jsonStringify(input.branding ?? {}),
        input.default_timezone ?? "UTC",
        input.default_locale ?? "en",
        ts,
        ts,
      );
    return this.get(id)!;
  }

  list(): WorkspaceRow[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, slug, branding, default_timezone, week_starts_on, default_locale, settings, created_at, updated_at
         FROM workspace ORDER BY created_at`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToWorkspace);
  }

  get(id: string): WorkspaceRow | null {
    const row = this.db
      .prepare(
        `SELECT id, name, slug, branding, default_timezone, week_starts_on, default_locale, settings, created_at, updated_at
         FROM workspace WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToWorkspace(row) : null;
  }

  update(id: string, patch: Partial<Omit<WorkspaceRow, "id" | "created_at" | "updated_at">>): WorkspaceRow {
    const cur = this.get(id);
    if (!cur) throw new Error("workspace not found");
    const next: WorkspaceRow = { ...cur, ...patch, updated_at: now() };
    this.db
      .prepare(
        `UPDATE workspace SET name=?, branding=?, default_timezone=?, week_starts_on=?, default_locale=?, settings=?, updated_at=? WHERE id=?`,
      )
      .run(
        next.name,
        jsonStringify(next.branding),
        next.default_timezone,
        next.week_starts_on,
        next.default_locale,
        jsonStringify(next.settings),
        next.updated_at,
        id,
      );
    return next;
  }

  delete(id: string): void {
    this.db.prepare(`DELETE FROM workspace WHERE id = ?`).run(id);
  }
}

function rowToWorkspace(row: Record<string, unknown>): WorkspaceRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    branding: jsonParse<Record<string, unknown>>(row.branding as string, {}),
    default_timezone: String(row.default_timezone),
    week_starts_on: String(row.week_starts_on),
    default_locale: String(row.default_locale),
    settings: jsonParse<Record<string, unknown>>(row.settings as string, {}),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

export class UsersService {
  constructor(private readonly db: DB) {}

  upsert(email: string, displayName: string, avatarUrl?: string | null): UserRow {
    const existing = this.db
      .prepare(`SELECT id, email, display_name, avatar_url, created_at FROM user WHERE email = ?`)
      .get(email) as Record<string, unknown> | undefined;
    if (existing) {
      return rowToUser(existing);
    }
    const id = prefixedId("usr");
    const created = now();
    this.db
      .prepare(`INSERT INTO user (id, email, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, email, displayName, avatarUrl ?? null, created);
    return { id, email, display_name: displayName, avatar_url: avatarUrl ?? null, created_at: created };
  }

  get(id: string): UserRow | null {
    const row = this.db
      .prepare(`SELECT id, email, display_name, avatar_url, created_at FROM user WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToUser(row) : null;
  }
}

function rowToUser(row: Record<string, unknown>): UserRow {
  return {
    id: String(row.id),
    email: String(row.email),
    display_name: String(row.display_name),
    avatar_url: (row.avatar_url as string) ?? null,
    created_at: Number(row.created_at),
  };
}

export class MembersService {
  constructor(private readonly db: DB) {}

  add(workspaceId: string, userId: string, role: string, scopedAccountIds?: string[] | null): void {
    this.db
      .prepare(
        `INSERT INTO workspace_member (workspace_id, user_id, role, scoped_account_ids, invited_at, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, user_id) DO UPDATE SET role=excluded.role, scoped_account_ids=excluded.scoped_account_ids`,
      )
      .run(
        workspaceId,
        userId,
        role,
        scopedAccountIds ? jsonStringify(scopedAccountIds) : null,
        now(),
        now(),
      );
  }

  list(workspaceId: string) {
    return this.db
      .prepare(
        `SELECT workspace_id, user_id, role, scoped_account_ids, invited_at, accepted_at
         FROM workspace_member WHERE workspace_id = ?`,
      )
      .all(workspaceId);
  }

  remove(workspaceId: string, userId: string): void {
    this.db.prepare(`DELETE FROM workspace_member WHERE workspace_id = ? AND user_id = ?`).run(workspaceId, userId);
  }
}

export class InvitationsService {
  constructor(private readonly db: DB) {}

  create(workspaceId: string, email: string, role: string, ttlSeconds = 7 * 86400) {
    const id = prefixedId("inv");
    const token = prefixedId("tok") + "_" + Math.random().toString(36).slice(2, 12);
    const expiresAt = now() + ttlSeconds * 1000;
    this.db
      .prepare(
        `INSERT INTO workspace_invitation (id, workspace_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, workspaceId, email, role, token, expiresAt);
    return { id, workspaceId, email, role, token, expiresAt };
  }

  list(workspaceId: string) {
    return this.db
      .prepare(`SELECT * FROM workspace_invitation WHERE workspace_id = ? ORDER BY expires_at DESC`)
      .all(workspaceId);
  }

  revoke(id: string): void {
    this.db.prepare(`DELETE FROM workspace_invitation WHERE id = ?`).run(id);
  }
}
