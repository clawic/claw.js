/**
 * Clawix Apps store · Node side.
 *
 * DB-backed metadata plus filesystem-backed assets. ClawJS owns the
 * canonical app registry in `core.sqlite`; HTML/assets stay on disk and
 * are referenced from the DB.
 *
 * Mirrors the schema documented in
 * `clawix/macos/Sources/Clawix/Apps/AGENT_CONTRACT.md`.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";

export interface AppPermissions {
  internet: boolean;
  callAgent: boolean;
  allowedTools: string[];
}

export const DEFAULT_PERMISSIONS: AppPermissions = {
  internet: false,
  callAgent: true,
  allowedTools: [],
};

export interface AppRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  projectId: string | null;
  tags: string[];
  permissions: AppPermissions;
  pinned: boolean;
  lastOpenedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByChatId: string | null;
}

export interface CreateAppInput {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  projectId?: string | null;
  tags?: string[];
  permissions?: Partial<AppPermissions>;
  createdByChatId?: string | null;
  /** Inline body for index.html. If omitted a placeholder is written. */
  indexHtml?: string;
}

export interface WriteFileInput {
  appId?: string;
  slug?: string;
  /** Relative path within the app folder. "/" or "" defaults to index.html. */
  path: string;
  content: string;
  /** Encoding hint for binary blobs. Defaults to "utf8". */
  encoding?: "utf8" | "base64";
}

export interface AppsStore {
  rootDir(): string;
  list(): AppRecord[];
  get(idOrSlug: string): AppRecord | null;
  create(input: CreateAppInput): AppRecord;
  update(record: AppRecord): AppRecord;
  remove(idOrSlug: string): boolean;
  writeFile(input: WriteFileInput): { app: AppRecord; absolutePath: string };
  deleteFile(idOrSlug: string, relativePath: string): boolean;
  setPinned(idOrSlug: string, pinned: boolean): AppRecord | null;
  setPermissions(idOrSlug: string, partial: Partial<AppPermissions>): AppRecord | null;
}

export interface CreateAppsStoreOptions {
  /** Override the on-disk asset root. Defaults to the canonical ClawJS root. */
  rootDir?: string;
  /** Override the canonical metadata DB. Defaults to `core.sqlite`. */
  dbPath?: string;
}

export function createAppsStore(options: CreateAppsStoreOptions = {}): AppsStore {
  const dataRoot = defaultDataRoot();
  const rootDir = options.rootDir ?? path.join(dataRoot, "apps");
  const dbPath = options.dbPath ?? process.env.CLAW_DB_PATH ?? process.env.CLAWJS_MAIN_DB_PATH ?? path.join(dataRoot, "core.sqlite");
  ensureDir(rootDir);
  ensureDir(path.dirname(dbPath));
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureAppsSchema(sqlite);

  function listRecords(): AppRecord[] {
    return (sqlite.prepare("SELECT * FROM apps").all() as AppRow[]).map(rowToRecord);
  }

  function findRecord(idOrSlug: string): AppRecord | null {
    const row = sqlite.prepare("SELECT * FROM apps WHERE id = ? OR slug = ?").get(idOrSlug, idOrSlug) as AppRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  function ensureUniqueSlug(preferred: string | undefined, name: string): string {
    const base = normalizeSlug(preferred && preferred.length > 0 ? preferred : name);
    if (!base) {
      throw new Error(`Cannot derive slug from name '${name}'`);
    }
    const taken = new Set(listRecords().map((r) => r.slug));
    if (!taken.has(base)) return base;
    let counter = 2;
    while (taken.has(`${base}-${counter}`)) {
      counter += 1;
      if (counter > 999) {
        throw new Error(`Too many slugs starting with '${base}'`);
      }
    }
    return `${base}-${counter}`;
  }

  function persistRecord(record: AppRecord): void {
    const dir = path.join(rootDir, record.slug);
    ensureDir(dir);
    sqlite.prepare(`
      INSERT INTO apps (
        id, slug, name, description, root_path, manifest_json, permissions_json,
        pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        name = excluded.name,
        description = excluded.description,
        root_path = excluded.root_path,
        manifest_json = excluded.manifest_json,
        permissions_json = excluded.permissions_json,
        pinned = excluded.pinned,
        last_opened_at = excluded.last_opened_at,
        created_by_chat_id = excluded.created_by_chat_id,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.slug,
      record.name,
      record.description,
      dir,
      JSON.stringify(record),
      JSON.stringify(record.permissions),
      record.pinned ? 1 : 0,
      record.lastOpenedAt,
      record.createdByChatId,
      record.createdAt,
      record.updatedAt,
    );
  }

  function placeholderIndexHTML(name: string): string {
    const escaped = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return [
      "<!doctype html>",
      `<html><head><meta charset=\"utf-8\"><title>${escaped}</title></head>`,
      `<body style=\"font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0e0e10;color:#aaa\">`,
      `<div style=\"text-align:center\"><h1 style=\"color:#eee\">${escaped}</h1>`,
      "<p>This app has no content yet. Drop files into the app folder to fill it.</p></div>",
      "</body></html>",
      "",
    ].join("\n");
  }

  return {
    rootDir() {
      return rootDir;
    },

    list() {
      return listRecords().sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aOpen = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
        const bOpen = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
        if (aOpen !== bOpen) return bOpen - aOpen;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      });
    },

    get(idOrSlug) {
      return findRecord(idOrSlug);
    },

    create(input) {
      const trimmedName = (input.name ?? "").trim();
      if (!trimmedName) throw new Error("name is required");
      const slug = ensureUniqueSlug(input.slug, trimmedName);
      const now = new Date().toISOString();
      const record: AppRecord = {
        id: randomUUID(),
        slug,
        name: trimmedName,
        description: input.description ?? "",
        icon: input.icon ?? "",
        accentColor: input.accentColor ?? "",
        projectId: input.projectId ?? null,
        tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === "string" && t.length > 0) : [],
        permissions: {
          ...DEFAULT_PERMISSIONS,
          ...(input.permissions ?? {}),
          allowedTools: Array.isArray(input.permissions?.allowedTools)
            ? (input.permissions!.allowedTools as string[])
            : DEFAULT_PERMISSIONS.allowedTools,
        },
        pinned: false,
        lastOpenedAt: null,
        createdAt: now,
        updatedAt: now,
        createdByChatId: input.createdByChatId ?? null,
      };
      persistRecord(record);
      const indexPath = path.join(rootDir, slug, "index.html");
      if (!fs.existsSync(indexPath)) {
        const body = input.indexHtml ?? placeholderIndexHTML(trimmedName);
        fs.writeFileSync(indexPath, body, "utf8");
      }
      return record;
    },

    update(record) {
      const updated: AppRecord = { ...record, updatedAt: new Date().toISOString() };
      persistRecord(updated);
      return updated;
    },

    remove(idOrSlug) {
      const record = findRecord(idOrSlug);
      if (!record) return false;
      const dir = path.join(rootDir, record.slug);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      sqlite.prepare("DELETE FROM apps WHERE id = ?").run(record.id);
      return true;
    },

    writeFile(input) {
      const record = input.appId
        ? findRecord(input.appId)
        : input.slug
          ? findRecord(input.slug)
          : null;
      if (!record) throw new Error("app not found (provide appId or slug)");
      const trimmed = input.path.replace(/^\/+|\s+$/g, "");
      const safeRel = trimmed.length > 0 ? trimmed : "index.html";
      if (safeRel.includes("..")) {
        throw new Error(`Refusing to write outside app folder: ${input.path}`);
      }
      const targetPath = path.join(rootDir, record.slug, safeRel);
      ensureDir(path.dirname(targetPath));
      const data = input.encoding === "base64"
        ? Buffer.from(input.content, "base64")
        : Buffer.from(input.content, "utf8");
      fs.writeFileSync(targetPath, data);
      // Bump updatedAt so the manifest mtime tracks file edits.
      const bumped = { ...record, updatedAt: new Date().toISOString() };
      persistRecord(bumped);
      return { app: bumped, absolutePath: targetPath };
    },

    deleteFile(idOrSlug, relativePath) {
      const record = findRecord(idOrSlug);
      if (!record) return false;
      const trimmed = relativePath.replace(/^\/+|\s+$/g, "");
      if (trimmed === "" || trimmed === "manifest.json") return false;
      if (trimmed.includes("..")) return false;
      const targetPath = path.join(rootDir, record.slug, trimmed);
      if (!fs.existsSync(targetPath)) return false;
      fs.rmSync(targetPath, { recursive: true, force: true });
      persistRecord({ ...record, updatedAt: new Date().toISOString() });
      return true;
    },

    setPinned(idOrSlug, pinned) {
      const record = findRecord(idOrSlug);
      if (!record) return null;
      const updated: AppRecord = { ...record, pinned, updatedAt: new Date().toISOString() };
      persistRecord(updated);
      return updated;
    },

    setPermissions(idOrSlug, partial) {
      const record = findRecord(idOrSlug);
      if (!record) return null;
      const updated: AppRecord = {
        ...record,
        permissions: {
          ...record.permissions,
          ...partial,
          allowedTools: Array.isArray(partial.allowedTools)
            ? partial.allowedTools
            : record.permissions.allowedTools,
        },
        updatedAt: new Date().toISOString(),
      };
      persistRecord(updated);
      return updated;
    },
  };
}

// Helpers ----------------------------------------------------------------

export function defaultRootDir(): string {
  return path.join(defaultDataRoot(), "apps");
}

function defaultDataRoot(): string {
  const explicit = process.env.CLAW_DATA_DIR ?? process.env.CLAWIX_CLAW_DATA_DIR ?? process.env.CLAWJS_MAIN_DATA_DIR ?? process.env.CLAWIX_CLAWJS_DATA_DIR;
  if (explicit) return expandHome(explicit);
  return path.join(expandHome(process.env.CLAW_HOME ?? path.join(os.homedir(), ".claw")), "data");
}

function expandHome(value: string): string {
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeRecord(raw: any): AppRecord {
  const permissions: AppPermissions = {
    internet: !!raw.permissions?.internet,
    callAgent: raw.permissions?.callAgent !== false,
    allowedTools: Array.isArray(raw.permissions?.allowedTools)
      ? raw.permissions.allowedTools.filter((t: unknown): t is string => typeof t === "string")
      : [],
  };
  return {
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    slug: String(raw.slug),
    name: String(raw.name),
    description: typeof raw.description === "string" ? raw.description : "",
    icon: typeof raw.icon === "string" ? raw.icon : "",
    accentColor: typeof raw.accentColor === "string" ? raw.accentColor : "",
    projectId: typeof raw.projectId === "string" ? raw.projectId : null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown): t is string => typeof t === "string") : [],
    permissions,
    pinned: !!raw.pinned,
    lastOpenedAt: typeof raw.lastOpenedAt === "string" ? raw.lastOpenedAt : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    createdByChatId: typeof raw.createdByChatId === "string" ? raw.createdByChatId : null,
  };
}

interface AppRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  root_path: string;
  manifest_json: string;
  permissions_json: string;
  pinned: number;
  last_opened_at: string | null;
  created_by_chat_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: AppRow): AppRecord {
  const manifest = parseJson(row.manifest_json, {});
  return normalizeRecord({
    ...manifest,
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    permissions: parseJson(row.permissions_json, manifest.permissions ?? {}),
    pinned: row.pinned === 1,
    lastOpenedAt: row.last_opened_at,
    createdByChatId: row.created_by_chat_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function parseJson(raw: string, fallback: any): any {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function ensureAppsSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      root_path TEXT NOT NULL,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      pinned INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      created_by_chat_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function normalizeSlug(raw: string): string {
  const lowered = raw.toLowerCase();
  let result = "";
  let lastWasDash = false;
  for (const ch of lowered) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      result += ch;
      lastWasDash = false;
    } else if (!lastWasDash && result.length > 0) {
      result += "-";
      lastWasDash = true;
    }
  }
  if (result.endsWith("-")) result = result.slice(0, -1);
  return result;
}
