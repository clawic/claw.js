import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { SourceLocation, discoverSources } from "./discovery";

export interface SourceStatus {
  id: string;
  label: string;
  kind: SourceLocation["kind"];
  path: string | null;
  available: boolean;
  rowCount: number;
  tables: string[];
  error?: string;
}

export interface UserRowRef {
  source: string;
  table: string;
  primaryKey: string;
  identityFields: Record<string, unknown>;
  row: Record<string, unknown>;
}

export interface UserBundle {
  identity: { id: string; email: string | null; label: string };
  rows: UserRowRef[];
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    kind: "user" | "source" | "table" | "row";
    sourceId?: string;
    tableId?: string;
  }>;
  edges: Array<{ source: string; target: string; relation: string }>;
}

const TABLE_SPECS: Record<string, Array<{
  table: string;
  primaryKey: string;
  identityFields: string[];
  emailField?: string;
  labelField?: string;
  writableFields: string[];
  deletable?: boolean;
}>> = {
  relay: [
    {
      table: "users",
      primaryKey: "id",
      identityFields: ["id", "email"],
      emailField: "email",
      labelField: "email",
      writableFields: ["email", "role"],
      deletable: false,
    },
    {
      table: "memberships",
      primaryKey: "rowid",
      identityFields: ["user_id"],
      writableFields: ["scopes_json"],
    },
    {
      table: "refresh_tokens",
      primaryKey: "rowid",
      identityFields: ["user_id"],
      writableFields: [],
      deletable: true,
    },
  ],
  "execution-plane": [
    {
      table: "users",
      primaryKey: "id",
      identityFields: ["id", "email"],
      emailField: "email",
      labelField: "email",
      writableFields: ["email"],
    },
    {
      table: "memberships",
      primaryKey: "rowid",
      identityFields: ["user_id"],
      writableFields: ["scopes_json", "role"],
    },
  ],
  notify: [
    {
      table: "device_installations",
      primaryKey: "rowid",
      identityFields: ["user_id", "tenant_id"],
      writableFields: ["device_name", "platform"],
      deletable: true,
    },
    {
      table: "user_preferences",
      primaryKey: "rowid",
      identityFields: ["user_id", "tenant_id"],
      writableFields: ["critical_only", "quiet_hours_json"],
    },
    {
      table: "subscriptions",
      primaryKey: "rowid",
      identityFields: ["user_id"],
      writableFields: [],
      deletable: true,
    },
  ],
  feed: [
    {
      table: "items",
      primaryKey: "rowid",
      identityFields: ["saved_by_agent_id", "created_by_agent_id"],
      writableFields: [],
    },
    {
      table: "sources",
      primaryKey: "rowid",
      identityFields: ["created_by_agent_id"],
      writableFields: [],
    },
    {
      table: "collections",
      primaryKey: "rowid",
      identityFields: ["created_by_agent_id"],
      writableFields: [],
    },
  ],
  wiki: [
    {
      table: "pages",
      primaryKey: "rowid",
      identityFields: ["created_by_user_id", "created_by_agent_id"],
      writableFields: [],
    },
    {
      table: "page_revisions",
      primaryKey: "rowid",
      identityFields: ["edited_by_user_id", "edited_by_agent_id"],
      writableFields: [],
    },
    {
      table: "comments",
      primaryKey: "rowid",
      identityFields: ["author_user_id", "author_agent_id"],
      writableFields: [],
    },
  ],
  content: [
    {
      table: "entries",
      primaryKey: "rowid",
      identityFields: ["owner_id", "author_id"],
      writableFields: [],
    },
    {
      table: "revisions",
      primaryKey: "rowid",
      identityFields: ["author_id"],
      writableFields: [],
    },
  ],
  erp: [
    {
      table: "employees",
      primaryKey: "id",
      identityFields: ["id"],
      labelField: "display_name",
      writableFields: ["display_name", "employee_number"],
    },
  ],
  "delegation-plane": [
    {
      table: "delegation_graphs",
      primaryKey: "rowid",
      identityFields: ["creator"],
      writableFields: [],
    },
    {
      table: "agent_runs",
      primaryKey: "rowid",
      identityFields: ["worker_id"],
      writableFields: [],
    },
  ],
};

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    )
    .get(table) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function getColumns(db: Database.Database, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

export class UserService {
  readonly workspace: string;
  private sources: SourceLocation[];
  private dbCache = new Map<string, Database.Database>();

  constructor(workspace: string) {
    this.workspace = workspace;
    this.sources = discoverSources(workspace);
  }

  refreshDiscovery(): void {
    this.close();
    this.sources = discoverSources(this.workspace);
  }

  close(): void {
    for (const db of this.dbCache.values()) {
      try {
        db.close();
      } catch {}
    }
    this.dbCache.clear();
  }

  private openDb(sourceId: string): Database.Database | null {
    const cached = this.dbCache.get(sourceId);
    if (cached) return cached;
    const source = this.sources.find((s) => s.id === sourceId);
    if (!source || source.kind !== "sqlite" || !source.path) return null;
    const db = new Database(source.path);
    db.pragma("foreign_keys = ON");
    this.dbCache.set(sourceId, db);
    return db;
  }

  listSources(): SourceStatus[] {
    return this.sources.map((source) => this.statusFor(source));
  }

  private statusFor(source: SourceLocation): SourceStatus {
    const base: SourceStatus = {
      id: source.id,
      label: source.label,
      kind: source.kind,
      path: source.path,
      available: Boolean(source.path),
      rowCount: 0,
      tables: [],
    };
    if (!source.path) return base;
    try {
      if (source.kind === "sqlite") {
        const db = this.openDb(source.id);
        if (!db) return base;
        const specs = TABLE_SPECS[source.id] ?? [];
        let total = 0;
        const tables: string[] = [];
        for (const spec of specs) {
          if (!tableExists(db, spec.table)) continue;
          tables.push(spec.table);
          const row = db
            .prepare(`SELECT COUNT(*) AS c FROM ${spec.table}`)
            .get() as { c: number };
          total += row.c;
        }
        base.tables = tables;
        base.rowCount = total;
      } else if (source.kind === "memory") {
        const persons = this.listMemoryPersons();
        base.tables = ["entities/person"];
        base.rowCount = persons.length;
      } else if (source.kind === "telegram") {
        const channels = this.readTelegramChannels();
        base.tables = ["accounts", "knownChats"];
        base.rowCount = channels.accounts.length + channels.chats.length;
      }
    } catch (err) {
      base.error = err instanceof Error ? err.message : String(err);
    }
    return base;
  }

  listUsers(): Array<{
    id: string;
    label: string;
    email: string | null;
    sources: string[];
  }> {
    const map = new Map<string, { id: string; label: string; email: string | null; sources: Set<string> }>();
    const upsert = (rawId: unknown, email: string | null, label: string | null, sourceId: string) => {
      const id = String(rawId ?? "").trim();
      if (!id) return;
      const existing = map.get(id);
      if (existing) {
        if (email && !existing.email) existing.email = email;
        if (label && existing.label === existing.id) existing.label = label;
        existing.sources.add(sourceId);
        return;
      }
      map.set(id, {
        id,
        email,
        label: label ?? email ?? id,
        sources: new Set([sourceId]),
      });
    };

    for (const source of this.sources) {
      if (source.kind !== "sqlite" || !source.path) continue;
      const specs = TABLE_SPECS[source.id] ?? [];
      const db = this.openDb(source.id);
      if (!db) continue;
      for (const spec of specs) {
        if (!tableExists(db, spec.table)) continue;
        const cols = getColumns(db, spec.table);
        const idCols = spec.identityFields.filter((c) => cols.has(c));
        if (idCols.length === 0) continue;
        const selectCols = new Set([...idCols]);
        if (spec.emailField && cols.has(spec.emailField)) selectCols.add(spec.emailField);
        if (spec.labelField && cols.has(spec.labelField)) selectCols.add(spec.labelField);
        const sql = `SELECT ${[...selectCols].join(", ")} FROM ${spec.table}`;
        const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
        for (const row of rows) {
          const email = spec.emailField ? (row[spec.emailField] as string | null) ?? null : null;
          const label = spec.labelField ? (row[spec.labelField] as string | null) ?? null : null;
          for (const col of idCols) {
            upsert(row[col], email, label, source.id);
          }
        }
      }
    }

    for (const person of this.listMemoryPersons()) {
      upsert(person.id, null, person.title, "memory");
    }
    const tg = this.readTelegramChannels();
    for (const account of tg.accounts) {
      upsert(account.accountId, null, account.label, "telegram");
    }

    return Array.from(map.values()).map((entry) => ({
      id: entry.id,
      label: entry.label,
      email: entry.email,
      sources: Array.from(entry.sources).sort(),
    })).sort((a, b) => a.label.localeCompare(b.label));
  }

  getUserBundle(userId: string): UserBundle {
    const target = userId.trim();
    let email: string | null = null;
    let label = target;
    const rows: UserRowRef[] = [];

    for (const source of this.sources) {
      if (source.kind !== "sqlite" || !source.path) continue;
      const specs = TABLE_SPECS[source.id] ?? [];
      const db = this.openDb(source.id);
      if (!db) continue;
      for (const spec of specs) {
        if (!tableExists(db, spec.table)) continue;
        const cols = getColumns(db, spec.table);
        const matchCols = spec.identityFields.filter((c) => cols.has(c));
        if (matchCols.length === 0) continue;
        const where = matchCols.map((c) => `${c} = ?`).join(" OR ");
        const sql = `SELECT *, ${spec.primaryKey} AS __pk FROM ${spec.table} WHERE ${where}`;
        const params = matchCols.map(() => target);
        const matches = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
        for (const row of matches) {
          if (spec.emailField && cols.has(spec.emailField)) {
            const candidate = row[spec.emailField];
            if (candidate && !email) email = String(candidate);
          }
          if (spec.labelField && cols.has(spec.labelField)) {
            const candidate = row[spec.labelField];
            if (candidate && label === target) label = String(candidate);
          }
          const identity: Record<string, unknown> = {};
          for (const col of matchCols) identity[col] = row[col];
          rows.push({
            source: source.id,
            table: spec.table,
            primaryKey: String(row.__pk),
            identityFields: identity,
            row,
          });
        }
      }
    }

    for (const person of this.listMemoryPersons()) {
      if (person.id === target || person.slug === target) {
        if (label === target) label = person.title;
        rows.push({
          source: "memory",
          table: "entities/person",
          primaryKey: person.id,
          identityFields: { id: person.id, slug: person.slug ?? person.id },
          row: { id: person.id, slug: person.slug, title: person.title, frontmatter: person.frontmatter, body: person.body },
        });
      }
    }

    const tg = this.readTelegramChannels();
    for (const account of tg.accounts) {
      if (account.accountId === target) {
        if (label === target) label = account.label;
        rows.push({
          source: "telegram",
          table: "accounts",
          primaryKey: account.accountId,
          identityFields: { accountId: account.accountId },
          row: account.raw,
        });
      }
    }

    return {
      identity: { id: target, email, label },
      rows,
    };
  }

  updateRow(input: {
    source: string;
    table: string;
    primaryKey: string;
    updates: Record<string, unknown>;
  }): { ok: true; row: Record<string, unknown> } {
    const spec = (TABLE_SPECS[input.source] ?? []).find((s) => s.table === input.table);
    if (!spec) {
      throw new Error(`Unknown source/table: ${input.source}/${input.table}`);
    }
    if (spec.writableFields.length === 0) {
      throw new Error(`${input.source}/${input.table} is read-only`);
    }
    const db = this.openDb(input.source);
    if (!db) throw new Error(`Source database is not available: ${input.source}`);
    const cols = getColumns(db, input.table);
    const setParts: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(input.updates)) {
      if (!spec.writableFields.includes(key)) {
        throw new Error(`Field ${key} is not writable on ${input.source}/${input.table}`);
      }
      if (!cols.has(key)) {
        throw new Error(`Column ${key} does not exist on ${input.source}/${input.table}`);
      }
      setParts.push(`${key} = ?`);
      values.push(value);
    }
    if (setParts.length === 0) {
      throw new Error("No writable updates supplied");
    }
    const sql = `UPDATE ${input.table} SET ${setParts.join(", ")} WHERE ${spec.primaryKey} = ?`;
    db.prepare(sql).run(...values, input.primaryKey);
    const row = db
      .prepare(`SELECT * FROM ${input.table} WHERE ${spec.primaryKey} = ?`)
      .get(input.primaryKey) as Record<string, unknown>;
    return { ok: true, row };
  }

  deleteRow(input: { source: string; table: string; primaryKey: string }): { ok: true } {
    const spec = (TABLE_SPECS[input.source] ?? []).find((s) => s.table === input.table);
    if (!spec) throw new Error(`Unknown source/table: ${input.source}/${input.table}`);
    if (!spec.deletable) throw new Error(`${input.source}/${input.table} is not deletable`);
    const db = this.openDb(input.source);
    if (!db) throw new Error(`Source database is not available: ${input.source}`);
    db.prepare(`DELETE FROM ${input.table} WHERE ${spec.primaryKey} = ?`).run(input.primaryKey);
    return { ok: true };
  }

  updateMemoryPerson(personId: string, updates: { title?: string; frontmatter?: Record<string, unknown>; body?: string }): { ok: true } {
    const file = this.findMemoryPersonFile(personId);
    if (!file) throw new Error(`Memory person not found: ${personId}`);
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseFrontmatter(raw);
    if (updates.frontmatter) {
      parsed.frontmatter = { ...parsed.frontmatter, ...updates.frontmatter };
    }
    if (updates.title !== undefined) {
      parsed.frontmatter.title = updates.title;
    }
    if (updates.body !== undefined) {
      parsed.body = updates.body;
    }
    const next = stringifyFrontmatter(parsed.frontmatter, parsed.body);
    fs.writeFileSync(file, next, "utf8");
    return { ok: true };
  }

  buildGraph(): GraphData {
    const nodes: GraphData["nodes"] = [];
    const edges: GraphData["edges"] = [];
    const users = this.listUsers();
    for (const user of users) {
      nodes.push({ id: `user:${user.id}`, label: user.label, kind: "user" });
    }
    for (const source of this.sources) {
      nodes.push({ id: `source:${source.id}`, label: source.label, kind: "source", sourceId: source.id });
    }
    for (const user of users) {
      for (const sourceId of user.sources) {
        edges.push({ source: `user:${user.id}`, target: `source:${sourceId}`, relation: "in" });
      }
    }
    return { nodes, edges };
  }

  // ---- memory helpers ----

  private memoryNotesDir(): string | null {
    const root = path.join(this.workspace, ".memory");
    if (!fs.existsSync(root)) return null;
    const candidates = [
      path.join(root, "notes", "entities"),
      path.join(root, "entities"),
      path.join(root, "notes"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return root;
  }

  listMemoryPersons(): Array<{ id: string; slug: string | null; title: string; frontmatter: Record<string, unknown>; body: string }> {
    const dir = this.memoryNotesDir();
    if (!dir) return [];
    const out: Array<{ id: string; slug: string | null; title: string; frontmatter: Record<string, unknown>; body: string }> = [];
    walkMarkdown(dir, (file) => {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = parseFrontmatter(raw);
      const type = parsed.frontmatter.type;
      const kind = parsed.frontmatter.kind;
      if (type !== "person" && kind !== "person") return;
      const id = String(parsed.frontmatter.id ?? path.basename(file, ".md"));
      out.push({
        id,
        slug: typeof parsed.frontmatter.slug === "string" ? parsed.frontmatter.slug : null,
        title: String(parsed.frontmatter.title ?? id),
        frontmatter: parsed.frontmatter,
        body: parsed.body,
      });
    });
    return out;
  }

  private findMemoryPersonFile(personId: string): string | null {
    const dir = this.memoryNotesDir();
    if (!dir) return null;
    let found: string | null = null;
    walkMarkdown(dir, (file) => {
      if (found) return;
      const raw = fs.readFileSync(file, "utf8");
      const parsed = parseFrontmatter(raw);
      const id = String(parsed.frontmatter.id ?? path.basename(file, ".md"));
      const slug = parsed.frontmatter.slug;
      if (id === personId || slug === personId) {
        found = file;
      }
    });
    return found;
  }

  // ---- telegram helpers ----

  readTelegramChannels(): {
    accounts: Array<{ accountId: string; label: string; raw: Record<string, unknown> }>;
    chats: Array<{ chatId: string; label: string; raw: Record<string, unknown> }>;
  } {
    const file = path.join(this.workspace, ".clawjs", "observed", "channels.json");
    if (!fs.existsSync(file)) return { accounts: [], chats: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const accountsRaw = Array.isArray(raw.accounts) ? raw.accounts : [];
      const accounts = accountsRaw
        .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
        .map((account) => {
          const id = String(account.accountId ?? account.id ?? "");
          const details = (account.details as Record<string, unknown> | undefined) ?? {};
          const telegram = (details.telegram as Record<string, unknown> | undefined) ?? {};
          const profile = (telegram.botProfile as Record<string, unknown> | undefined) ?? {};
          const username = profile.username ? `@${profile.username}` : "";
          const firstName = profile.firstName ? String(profile.firstName) : "";
          const label = [firstName, username].filter(Boolean).join(" ").trim() || id;
          return { accountId: id, label, raw: account };
        })
        .filter((a) => a.accountId);
      const chatsRaw: Array<Record<string, unknown>> = [];
      for (const account of accountsRaw) {
        if (!account || typeof account !== "object") continue;
        const details = ((account as Record<string, unknown>).details as Record<string, unknown> | undefined) ?? {};
        const telegram = (details.telegram as Record<string, unknown> | undefined) ?? {};
        const known = telegram.knownChats;
        if (Array.isArray(known)) {
          for (const chat of known) {
            if (chat && typeof chat === "object") chatsRaw.push(chat as Record<string, unknown>);
          }
        }
      }
      const chats = chatsRaw.map((chat) => ({
        chatId: String(chat.id ?? chat.chatId ?? ""),
        label: String(chat.title ?? chat.username ?? chat.id ?? "(chat)"),
        raw: chat,
      })).filter((c) => c.chatId);
      return { accounts, chats };
    } catch {
      return { accounts: [], chats: [] };
    }
  }

  updateTelegramAccount(accountId: string, updates: Record<string, unknown>): { ok: true } {
    const file = path.join(this.workspace, ".clawjs", "observed", "channels.json");
    if (!fs.existsSync(file)) throw new Error("Telegram channels.json not found in workspace");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
    let touched = false;
    for (const account of accounts) {
      if (account && typeof account === "object" && String((account as Record<string, unknown>).accountId) === accountId) {
        Object.assign(account, updates);
        touched = true;
      }
    }
    if (!touched) throw new Error(`Telegram account not found: ${accountId}`);
    fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");
    return { ok: true };
  }
}

function walkMarkdown(dir: string, visit: (file: string) => void): void {
  if (!fs.existsSync(dir)) return;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        visit(full);
      }
    }
  }
}

interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: raw };
  const fmText = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\n/, "");
  return { frontmatter: parseSimpleYaml(fmText), body };
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (!value) {
      out[key] = "";
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value
        .slice(1, -1)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }
    const stripped = value.replace(/^['"]|['"]$/g, "");
    out[key] = stripped;
  }
  return out;
}

function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => String(v)).join(", ")}]`);
    } else if (value === null || value === undefined) {
      lines.push(`${key}:`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n") + body;
}
