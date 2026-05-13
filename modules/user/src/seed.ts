import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { discoverSources } from "./discovery";

export interface SeedReport {
  source: string;
  table?: string;
  status: "ok" | "skipped" | "error";
  detail: string;
  rows?: number;
}

const TENANT_ID = "test-tenant-001";
const TENANT_NAME = "Test Tenant 001";
const BRAND_ID = "test-brand-001";

const PASSWORD_HASH = "test-hash-do-not-use";

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function safeRun(db: Database.Database, sql: string, params: unknown[] = []): "ok" | string {
  try {
    db.prepare(sql).run(...params);
    return "ok";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function seedUser(workspace: string, userId: string): SeedReport[] {
  const reports: SeedReport[] = [];
  const sources = discoverSources(workspace);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const email = `${userId}@example.local`;

  for (const source of sources) {
    if (source.kind !== "sqlite" || !source.path) continue;
    const db = new Database(source.path);
    db.pragma("foreign_keys = OFF");
    try {
      if (source.id === "relay") seedRelay(db, userId, email, now, reports);
      else if (source.id === "execution") seedExecutionPlane(db, userId, email, now, reports);
      else if (source.id === "notify") seedNotify(db, userId, now, reports);
      else if (source.id === "feed") seedFeed(db, userId, now, reports);
      else if (source.id === "wiki") seedWiki(db, userId, now, reports);
      else if (source.id === "content") seedContent(db, userId, nowIso, reports);
      else if (source.id === "erp") seedErp(db, userId, now, reports);
      else if (source.id === "delegation") seedDelegationPlane(db, userId, now, reports);
    } finally {
      db.close();
    }
  }

  seedMemory(workspace, userId, reports);
  seedTelegram(workspace, userId, reports);

  return reports;
}

function recordRows(reports: SeedReport[], source: string, table: string, n: number, detail = ""): void {
  reports.push({ source, table, status: "ok", rows: n, detail: detail || `${n} row(s)` });
}

function recordError(reports: SeedReport[], source: string, table: string, message: string): void {
  reports.push({ source, table, status: "error", detail: message });
}

function recordSkip(reports: SeedReport[], source: string, table: string, reason: string): void {
  reports.push({ source, table, status: "skipped", detail: reason });
}

function seedRelay(db: Database.Database, userId: string, email: string, now: number, reports: SeedReport[]): void {
  const tx = db.transaction(() => {
    if (tableExists(db, "tenants")) {
      const r = safeRun(db, "INSERT OR REPLACE INTO tenants (id, name, created_at) VALUES (?, ?, ?)", [TENANT_ID, TENANT_NAME, now]);
      r === "ok" ? recordRows(reports, "relay", "tenants", 1) : recordError(reports, "relay", "tenants", r);
    }
    if (tableExists(db, "users")) {
      const r = safeRun(db, "INSERT OR REPLACE INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)", [userId, email, PASSWORD_HASH, "admin", now]);
      r === "ok" ? recordRows(reports, "relay", "users", 1) : recordError(reports, "relay", "users", r);
    }
    if (tableExists(db, "memberships")) {
      safeRun(db, "DELETE FROM memberships WHERE user_id = ?", [userId]);
      const r = safeRun(db, "INSERT INTO memberships (user_id, tenant_id, scopes_json) VALUES (?, ?, ?)", [userId, TENANT_ID, JSON.stringify(["agents:read", "agents:write", "workspaces:read", "workspaces:write", "*"])]);
      r === "ok" ? recordRows(reports, "relay", "memberships", 1) : recordError(reports, "relay", "memberships", r);
    }
    if (tableExists(db, "agents")) {
      const r = safeRun(db, "INSERT OR REPLACE INTO agents (id, tenant_id, display_name, role, description, instructions, resource_refs_json, secret_refs_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [`agent-${userId}-claude`, TENANT_ID, "Claude Worker", "assistant", "Synthetic test agent for the user dashboard", "Be helpful.", "[]", "[]", now, now]);
      r === "ok" ? recordRows(reports, "relay", "agents", 1) : recordError(reports, "relay", "agents", r);
    }
    if (tableExists(db, "workspaces")) {
      const r = safeRun(db, "INSERT OR REPLACE INTO workspaces (id, tenant_id, agent_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [`workspace-${userId}-main`, TENANT_ID, `agent-${userId}-claude`, "Main Workspace", now, now]);
      r === "ok" ? recordRows(reports, "relay", "workspaces", 1) : recordError(reports, "relay", "workspaces", r);
    }
    if (tableExists(db, "refresh_tokens")) {
      safeRun(db, "DELETE FROM refresh_tokens WHERE user_id = ?", [userId]);
      let inserted = 0;
      for (let i = 0; i < 3; i += 1) {
        const r = safeRun(
          db,
          "INSERT INTO refresh_tokens (token_id, token_hash, user_id, tenant_id, scopes_json, agent_id, workspace_id, expires_at, created_at, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            `token-${userId}-${i}`,
            `hash-${userId}-${i}`,
            userId,
            TENANT_ID,
            JSON.stringify(["*"]),
            i === 0 ? `agent-${userId}-claude` : null,
            i === 0 ? `workspace-${userId}-main` : null,
            now + 7 * 24 * 60 * 60 * 1000,
            now - i * 60_000,
            i === 2 ? `device-${userId}-laptop` : null,
          ]
        );
        if (r === "ok") inserted += 1;
      }
      recordRows(reports, "relay", "refresh_tokens", inserted);
    }
    if (tableExists(db, "devices")) {
      safeRun(db, "DELETE FROM devices WHERE user_id = ?", [userId]);
      let inserted = 0;
      for (const [id, label, platform] of [
        [`device-${userId}-laptop`, "MacBook Pro", "macos"],
        [`device-${userId}-iphone`, "iPhone 15", "ios"],
      ] as Array<[string, string, string]>) {
        const r = safeRun(
          db,
          "INSERT INTO devices (id, user_id, tenant_id, label, platform, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [id, userId, TENANT_ID, label, platform, now, now]
        );
        if (r === "ok") inserted += 1;
      }
      recordRows(reports, "relay", "devices", inserted);
    }
  });
  try {
    tx();
  } catch (err) {
    recordError(reports, "relay", "transaction", err instanceof Error ? err.message : String(err));
  }
}

function seedExecutionPlane(db: Database.Database, userId: string, email: string, now: number, reports: SeedReport[]): void {
  const tx = db.transaction(() => {
    if (tableExists(db, "tenants")) {
      safeRun(db, "INSERT OR REPLACE INTO tenants (id, name, created_at) VALUES (?, ?, ?)", [TENANT_ID, TENANT_NAME, now]);
      recordRows(reports, "execution", "tenants", 1);
    }
    if (tableExists(db, "users")) {
      safeRun(db, "INSERT OR REPLACE INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)", [userId, email, PASSWORD_HASH, now]);
      recordRows(reports, "execution", "users", 1);
    }
    if (tableExists(db, "memberships")) {
      safeRun(db, "DELETE FROM memberships WHERE user_id = ?", [userId]);
      safeRun(db, "INSERT INTO memberships (user_id, tenant_id, role, scopes_json) VALUES (?, ?, ?, ?)", [userId, TENANT_ID, "owner", JSON.stringify(["*"])]);
      recordRows(reports, "execution", "memberships", 1);
    }
    const projectId = `project-${userId}-demo`;
    const repoId = `repo-${userId}-demo`;
    const assetId = `asset-${userId}-demo`;
    const revisionId = `rev-${userId}-001`;
    if (tableExists(db, "projects")) {
      safeRun(db, "INSERT OR REPLACE INTO projects (id, tenant_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [projectId, TENANT_ID, "Demo Project", "Synthetic project for the user dashboard demo", now, now]);
      recordRows(reports, "execution", "projects", 1);
    }
    if (tableExists(db, "repositories")) {
      safeRun(db, "INSERT OR REPLACE INTO repositories (id, tenant_id, project_id, name, remote_url, default_branch, secret_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [repoId, TENANT_ID, projectId, "demo-repo", "https://example.local/test/demo.git", "main", `secret-${userId}-git`, now, now]);
      recordRows(reports, "execution", "repositories", 1);
    }
    if (tableExists(db, "code_assets")) {
      safeRun(db, "INSERT OR REPLACE INTO code_assets (id, tenant_id, project_id, repository_id, name, kind, path, runtime, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [assetId, TENANT_ID, projectId, repoId, "hello.ts", "script", "src/hello.ts", "node20", now, now]);
      recordRows(reports, "execution", "code_assets", 1);
    }
    if (tableExists(db, "asset_revisions")) {
      safeRun(db, "DELETE FROM asset_revisions WHERE created_by = ?", [userId]);
      let inserted = 0;
      for (let i = 0; i < 3; i += 1) {
        const r = safeRun(
          db,
          "INSERT INTO asset_revisions (id, tenant_id, project_id, repository_id, asset_id, branch_name, base_ref, git_commit, content, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [`${revisionId}-${i}`, TENANT_ID, projectId, repoId, assetId, "main", "main", `commit-${i}`, `console.log("hello v${i}");\n`, userId, now - i * 3600_000]
        );
        if (r === "ok") inserted += 1;
      }
      recordRows(reports, "execution", "asset_revisions", inserted);
    }
    if (tableExists(db, "runs")) {
      safeRun(db, "DELETE FROM runs WHERE worker_id = ?", [userId]);
      let inserted = 0;
      for (let i = 0; i < 2; i += 1) {
        const r = safeRun(
          db,
          "INSERT INTO runs (id, tenant_id, project_id, repository_id, asset_id, revision_id, status, worker_id, inputs_json, output_text, error_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [`run-${userId}-${i}`, TENANT_ID, projectId, repoId, assetId, `${revisionId}-0`, i === 0 ? "completed" : "running", userId, "{}", `hello v${i}`, "", now - i * 600_000, now - i * 600_000]
        );
        if (r === "ok") inserted += 1;
      }
      recordRows(reports, "execution", "runs", inserted);
    }
  });
  try {
    tx();
  } catch (err) {
    recordError(reports, "execution", "transaction", err instanceof Error ? err.message : String(err));
  }
}

function seedNotify(db: Database.Database, userId: string, now: number, reports: SeedReport[]): void {
  const tx = db.transaction(() => {
    if (tableExists(db, "device_installations")) {
      safeRun(db, "DELETE FROM device_installations WHERE user_id = ?", [userId]);
      let inserted = 0;
      for (const [platform, label] of [["ios", "iPhone 15"], ["macos", "MacBook Pro"]]) {
        const cols = db.prepare("PRAGMA table_info(device_installations)").all() as Array<{ name: string }>;
        const fields: Record<string, unknown> = {
          user_id: userId,
          tenant_id: TENANT_ID,
          platform,
          device_name: label,
          push_token: `token-${userId}-${platform}`,
          created_at: now,
        };
        const usable = cols.filter((c) => c.name in fields);
        const sql = `INSERT INTO device_installations (${usable.map((c) => c.name).join(", ")}) VALUES (${usable.map(() => "?").join(", ")})`;
        const r = safeRun(db, sql, usable.map((c) => fields[c.name]));
        if (r === "ok") inserted += 1;
      }
      recordRows(reports, "notify", "device_installations", inserted);
    }
    if (tableExists(db, "user_preferences")) {
      safeRun(db, "DELETE FROM user_preferences WHERE user_id = ?", [userId]);
      const cols = db.prepare("PRAGMA table_info(user_preferences)").all() as Array<{ name: string }>;
      const fields: Record<string, unknown> = {
        user_id: userId,
        tenant_id: TENANT_ID,
        critical_only: 0,
        quiet_hours_json: JSON.stringify({ start: "22:00", end: "08:00" }),
      };
      const usable = cols.filter((c) => c.name in fields);
      const sql = `INSERT INTO user_preferences (${usable.map((c) => c.name).join(", ")}) VALUES (${usable.map(() => "?").join(", ")})`;
      const r = safeRun(db, sql, usable.map((c) => fields[c.name]));
      if (r === "ok") recordRows(reports, "notify", "user_preferences", 1);
    }
  });
  try {
    tx();
  } catch (err) {
    recordError(reports, "notify", "transaction", err instanceof Error ? err.message : String(err));
  }
}

function seedFeed(db: Database.Database, userId: string, now: number, reports: SeedReport[]): void {
  // feed schema is more elaborate; only insert if items table accepts saved_by_agent_id
  if (!tableExists(db, "items")) return;
  recordSkip(reports, "feed", "items", "skipped (heavier schema, seed not implemented)");
}

function seedWiki(db: Database.Database, userId: string, now: number, reports: SeedReport[]): void {
  if (!tableExists(db, "pages")) return;
  recordSkip(reports, "wiki", "pages", "skipped (heavier schema, seed not implemented)");
}

function seedContent(db: Database.Database, userId: string, nowIso: string, reports: SeedReport[]): void {
  const tx = db.transaction(() => {
    if (tableExists(db, "brands")) {
      safeRun(db, "INSERT OR REPLACE INTO brands (id, name, slug, description, default_locale, voice_summary, tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [BRAND_ID, "Test Brand 001", "test-brand-001", "Synthetic brand for the dashboard demo", "en-US", "Friendly and concise", JSON.stringify(["demo"]), nowIso, nowIso]);
      recordRows(reports, "content", "brands", 1);
    }
    if (tableExists(db, "entries")) {
      safeRun(db, "DELETE FROM entries WHERE owner_id = ?", [userId]);
      let inserted = 0;
      for (let i = 0; i < 3; i += 1) {
        const id = `entry-${userId}-${i}`;
        const r = safeRun(
          db,
          "INSERT INTO entries (id, brand_id, content_type, canonical_format, title, summary, canonical_body, status, tags_json, owner_id, author_id, current_revision_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [id, BRAND_ID, "post", "markdown", `Demo Entry #${i}`, `Synthetic demo entry ${i}`, `# Hello\n\nThis is demo entry ${i}.\n`, i === 0 ? "draft" : "published", JSON.stringify(["demo"]), userId, userId, 1, nowIso, nowIso]
        );
        if (r === "ok") {
          inserted += 1;
          if (tableExists(db, "revisions")) {
            safeRun(db, "INSERT OR REPLACE INTO revisions (id, entry_id, revision_number, title, summary, canonical_body, snapshot_json, created_at, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [`${id}-rev-1`, id, 1, `Demo Entry #${i}`, "Initial revision", `# Hello\n\nDemo entry ${i}.\n`, JSON.stringify({ initial: true }), nowIso, userId]);
          }
        }
      }
      recordRows(reports, "content", "entries", inserted);
      recordRows(reports, "content", "revisions", inserted);
    }
  });
  try {
    tx();
  } catch (err) {
    recordError(reports, "content", "transaction", err instanceof Error ? err.message : String(err));
  }
}

function seedErp(db: Database.Database, userId: string, now: number, reports: SeedReport[]): void {
  if (!tableExists(db, "employees")) return;
  recordSkip(reports, "erp", "employees", "skipped (legal_entity_id required, seed not implemented)");
}

function seedDelegationPlane(db: Database.Database, userId: string, now: number, reports: SeedReport[]): void {
  if (!tableExists(db, "delegation_graphs")) return;
  recordSkip(reports, "delegation", "delegation_graphs", "skipped (heavier schema, seed not implemented)");
}

function seedMemory(workspace: string, userId: string, reports: SeedReport[]): void {
  const memoryRoot = path.join(workspace, ".memory");
  if (!fs.existsSync(memoryRoot)) {
    recordSkip(reports, "memory", "entities/person", ".memory not initialized");
    return;
  }
  const candidates = [
    path.join(memoryRoot, "notes", "entities"),
    path.join(memoryRoot, "entities"),
    path.join(memoryRoot, "notes"),
  ];
  let dir = candidates.find((c) => fs.existsSync(c));
  if (!dir) {
    dir = path.join(memoryRoot, "notes", "entities");
    fs.mkdirSync(dir, { recursive: true });
  }
  const file = path.join(dir, `${userId}.md`);
  const content = [
    "---",
    `id: ${userId}`,
    `slug: ${userId}`,
    `kind: person`,
    `type: person`,
    `title: Test User One`,
    `email: ${userId}@example.local`,
    `role: senior-engineer`,
    `timezone: Europe/Madrid`,
    `aliases: [test-user, demo-user]`,
    "---",
    "",
    "# Test User One",
    "",
    "Synthetic person entity for the user dashboard demo. Likes:",
    "",
    "- TypeScript",
    "- ClawJS",
    "- Espresso",
    "",
  ].join("\n");
  fs.writeFileSync(file, content, "utf8");
  recordRows(reports, "memory", "entities/person", 1, file);
}

function seedTelegram(workspace: string, userId: string, reports: SeedReport[]): void {
  const file = path.join(workspace, ".clawjs", "observed", "channels.json");
  if (!fs.existsSync(file)) {
    recordSkip(reports, "telegram", "accounts", ".clawjs/observed/channels.json not present");
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const accounts = Array.isArray(raw.accounts) ? (raw.accounts as Array<Record<string, unknown>>) : [];
    const filtered = accounts.filter((a) => String(a.accountId) !== userId);
    filtered.push({
      id: `telegram:${userId}`,
      provider: "telegram",
      accountId: userId,
      label: "Test User Telegram",
      enabled: true,
      details: {
        telegram: {
          botProfile: { username: "test_user_bot", firstName: "Test User" },
          knownChats: [
            { id: "test-chat-001", title: "Test Chat 001", type: "private", isAuthorized: true },
            { id: "test-chat-002", title: "Demo Group", type: "group", isAuthorized: false },
          ],
        },
      },
    });
    raw.accounts = filtered;
    fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");
    recordRows(reports, "telegram", "accounts", 1);
  } catch (err) {
    recordError(reports, "telegram", "accounts", err instanceof Error ? err.message : String(err));
  }
}
