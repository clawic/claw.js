/**
 * Clawix Apps store · Node side.
 *
 * Thin filesystem-backed CRUD over the same on-disk layout the macOS
 * client (`AppsStore.swift`) reads from. Serves as the agent-facing
 * primitive: `apps.create()` makes a folder + manifest, `apps.write()`
 * drops a single file, and the macOS app picks the change up on its
 * next poll. No bridge frames, no daemon coordination required.
 *
 * Mirrors the schema documented in
 * `clawix/macos/Sources/Clawix/Apps/AGENT_CONTRACT.md`.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

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
  /**
   * Override the on-disk root. Defaults to
   * `~/Library/Application Support/Clawix/Apps` on macOS, the same path
   * the Swift `AppsStore` watches. On non-macOS platforms we still
   * lay out under `~/.local/share/Clawix/Apps` so headless agents on
   * CI / containers stay happy.
   */
  rootDir?: string;
}

export function createAppsStore(options: CreateAppsStoreOptions = {}): AppsStore {
  const rootDir = options.rootDir ?? defaultRootDir();
  ensureDir(rootDir);

  function listManifests(): AppRecord[] {
    const out: AppRecord[] = [];
    const entries = safeReaddir(rootDir);
    for (const entry of entries) {
      const slugDir = path.join(rootDir, entry);
      if (!isDirectory(slugDir)) continue;
      const manifest = readManifest(slugDir);
      if (manifest) out.push(manifest);
    }
    return out;
  }

  function findRecord(idOrSlug: string): AppRecord | null {
    const list = listManifests();
    return list.find((r) => r.id === idOrSlug || r.slug === idOrSlug) ?? null;
  }

  function ensureUniqueSlug(preferred: string | undefined, name: string): string {
    const base = normalizeSlug(preferred && preferred.length > 0 ? preferred : name);
    if (!base) {
      throw new Error(`Cannot derive slug from name '${name}'`);
    }
    const taken = new Set(listManifests().map((r) => r.slug));
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

  function persistManifest(record: AppRecord): void {
    const dir = path.join(rootDir, record.slug);
    ensureDir(dir);
    const manifestPath = path.join(dir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(record, null, 2) + "\n", "utf8");
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
      return listManifests().sort((a, b) => {
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
      persistManifest(record);
      const indexPath = path.join(rootDir, slug, "index.html");
      if (!fs.existsSync(indexPath)) {
        const body = input.indexHtml ?? placeholderIndexHTML(trimmedName);
        fs.writeFileSync(indexPath, body, "utf8");
      }
      return record;
    },

    update(record) {
      const updated: AppRecord = { ...record, updatedAt: new Date().toISOString() };
      persistManifest(updated);
      return updated;
    },

    remove(idOrSlug) {
      const record = findRecord(idOrSlug);
      if (!record) return false;
      const dir = path.join(rootDir, record.slug);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
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
      persistManifest(bumped);
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
      return true;
    },

    setPinned(idOrSlug, pinned) {
      const record = findRecord(idOrSlug);
      if (!record) return null;
      const updated: AppRecord = { ...record, pinned, updatedAt: new Date().toISOString() };
      persistManifest(updated);
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
      persistManifest(updated);
      return updated;
    },
  };
}

// Helpers ----------------------------------------------------------------

export function defaultRootDir(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Clawix", "Apps");
  }
  // Linux + headless agents: XDG-friendly fallback so an agent running
  // on a CI box still has a stable root to write to.
  const xdg = process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), ".local", "share");
  return path.join(xdg, "Clawix", "Apps");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeReaddir(p: string): string[] {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function readManifest(slugDir: string): AppRecord | null {
  const manifestPath = path.join(slugDir, "manifest.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.slug !== "string" || typeof parsed.name !== "string") return null;
    return normalizeRecord(parsed);
  } catch {
    return null;
  }
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
