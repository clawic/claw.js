import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { resolveClawPersistentSurfacePath, resolveCodexConfigPath, resolveCodexProjectConfigPath } from "@clawjs/core";
import { DatabaseServiceStore } from "@clawjs/database";
import { loadSessionsConfig, runSessionsRuntimeJobs, SessionsRuntimeJobStore, type SessionsRuntimeSessionChangedEvent } from "@clawjs/sessions";
import { scheduleAppsCatalogSearchEvent, scheduleConnectorCatalogSearchEvent, scheduleDesignResourcesSearchEvent, scheduleMcpServersSearchEvent, scheduleRuntimeEventsSearchEvent, scheduleSessionChatSearchEvent, scheduleSessionEventsSearchEvent, scheduleSheetsWorkbookSearchEvent, scheduleSkillsRegistrySearchEvent } from "./cli-search-events.ts";
import {
  V1_DATA_EXIT_FAILURE,
  V1_DATA_EXIT_OK,
  expandHome,
  ftsPhrase,
  indexSessionRoots,
  isRecord,
  normalizeDbRow,
  nowIso,
  parseCsvOrJson,
  parseMaybeJson,
  readMcpServers,
  resolveClawjsDataRoot,
  sessionRoots,
  truthy,
  usage,
  usageError,
  writeMcpServers,
  writeSuccess,
  writeUnredactedSuccess,
} from "./v1-data-core.ts";
import type { JsonRecord, V1DataCliInput } from "./v1-data-core.ts";

export function runMcpCommand(input: V1DataCliInput): number {
  const command = input.positionals[1];
  const configPath = input.flags.config || resolveCodexConfigPath(os.homedir());
  if (command === "config-path") {
    const scope = input.flags.scope || input.positionals[2] || "user";
    const resolved = scope === "project"
      ? resolveCodexProjectConfigPath(path.resolve(input.cwd, expandHome(input.flags.project || input.flags.cwd || input.cwd)))
      : configPath;
    writeSuccess(input, { scope, configPath: resolved, exists: fs.existsSync(resolved), source: "codex-config" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list" || command === "get") {
    const servers = readMcpServers(configPath);
    if (command === "get") {
      const id = input.flags.id || input.positionals[2];
      if (!id) return usageError(input, "Usage: claw mcp get SERVER_ID [--json]");
      writeUnredactedSuccess(input, servers.find((server) => server.id === id) ?? null);
      return servers.some((server) => server.id === id) ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
    }
    writeUnredactedSuccess(input, { source: "codex-config", configPath, items: servers });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw mcp upsert SERVER_ID (--command CMD|--url URL) [--json]");
    const current = readMcpServers(configPath);
    const existing = current.find((server) => server.id === id) ?? { id, source: "codex-config" };
    const next: JsonRecord & { id: string } = {
      ...existing,
      id,
      source: "codex-config",
      ...(input.flags.command ? { command: input.flags.command } : {}),
      ...(input.flags.url ? { url: input.flags.url } : {}),
      ...(input.flags.args ? { args: parseCsvOrJson(input.flags.args) ?? [] } : {}),
      ...(input.flags.cwd ? { cwd: input.flags.cwd } : {}),
      ...(input.flags["env-passthrough"] ? { env_passthrough: parseCsvOrJson(input.flags["env-passthrough"]) ?? [] } : {}),
      ...(input.flags.env ? { env: parseMaybeJson(input.flags.env) } : {}),
      ...(input.flags["bearer-token-env-var"] ? { bearer_token_env_var: input.flags["bearer-token-env-var"] } : {}),
      ...(input.flags.headers ? { headers: parseMaybeJson(input.flags.headers) } : {}),
      ...(input.flags["headers-from-env"] ? { headers_from_env: parseMaybeJson(input.flags["headers-from-env"]) } : {}),
      ...(input.flags.disabled !== undefined ? { disabled: truthy(input.flags.disabled) } : {}),
      ...(input.flags.enabled !== undefined ? { enabled: truthy(input.flags.enabled) } : {}),
    };
    const items = [...current.filter((server) => server.id !== id), next];
    writeMcpServers(configPath, items);
    scheduleMcpServersSearchEvent({
      operation: "upsert",
      serverId: id,
      configPath,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeUnredactedSuccess(input, { id, configPath, server: next });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw mcp delete SERVER_ID [--json]");
    const current = readMcpServers(configPath);
    const items = current.filter((server) => server.id !== id);
    writeMcpServers(configPath, items);
    if (items.length !== current.length) {
      scheduleMcpServersSearchEvent({
        operation: "delete",
        serverId: id,
        configPath,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { id, deleted: items.length !== current.length, configPath });
    return items.length !== current.length ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "mcp"));
}

export function runConnectorsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const scope = input.positionals[1];
  if (scope !== "operation" && scope !== "operations") return usageError(input, usage(input.binName, "connectors"));
  const command = input.positionals[2] || "list";
  if (command === "list") {
    const where: string[] = [];
    const params: string[] = [];
    if (input.flags.provider) {
      where.push("o.provider_id = ?");
      params.push(input.flags.provider);
    }
    if (input.flags.support) {
      where.push("o.support = ?");
      params.push(input.flags.support);
    }
    const rows = store.sqlite.prepare(`
      SELECT o.*, p.display_name AS provider_display_name, p.trust_tier AS provider_trust_tier, p.enabled AS provider_enabled
      FROM connector_operations o
      LEFT JOIN connector_providers p ON p.id = o.provider_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY o.provider_id, o.id
      LIMIT ?
    `).all(...params, Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.flags.operation || input.positionals[3];
    if (!id) return usageError(input, "Usage: claw connectors operation get OPERATION_ID [--json]");
    const row = store.sqlite.prepare(`
      SELECT o.*, p.display_name AS provider_display_name, p.trust_tier AS provider_trust_tier, p.enabled AS provider_enabled
      FROM connector_operations o
      LEFT JOIN connector_providers p ON p.id = o.provider_id
      WHERE o.id = ?
      LIMIT 1
    `).get(id);
    writeSuccess(input, row ? normalizeDbRow(row) : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert" || command === "create" || command === "edit") {
    const id = input.flags.id || input.flags.operation || input.positionals[3];
    const providerId = input.flags.provider || input.flags["provider-id"];
    if (!id || !providerId) return usageError(input, "Usage: claw connectors operation upsert OPERATION_ID --provider PROVIDER [--runtime-kind api|sdk|mcp|cli] [--json]");
    const now = nowIso();
    const providerDisplayName = input.flags["provider-name"] || input.flags["provider-display-name"] || providerId;
    const providerTrustTier = input.flags["provider-trust-tier"] || input.flags["trust-tier"] || "external_saas";
    const providerEnabled = input.flags["provider-enabled"] === undefined ? 1 : (truthy(input.flags["provider-enabled"]) ? 1 : 0);
    const capabilityIds = parseConnectorStringList(input.flags.capabilities || input.flags.capability || input.flags["capability-ids"]);
    const riskTiers = parseConnectorStringList(input.flags["risk-tiers"] || input.flags.risk);
    const metadata = input.flags.metadata ? parseMaybeJson(input.flags.metadata) : {};
    const metadataJson = JSON.stringify(isRecord(metadata) ? metadata : { value: metadata });
    const existing = store.sqlite.prepare("SELECT created_at FROM connector_operations WHERE id = ?").get(id) as { created_at?: string } | undefined;
    store.sqlite.prepare(`
      INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, '{}', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        trust_tier = excluded.trust_tier,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(providerId, providerDisplayName, providerTrustTier, providerEnabled, now, now);
    store.sqlite.prepare(`
      INSERT INTO connector_operations (
        id, provider_id, runtime_kind, support, native_name, capability_ids_json, risk_tiers_json,
        credential_required, cost_risk, requires_approval, network_policy_id, metadata_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        provider_id = excluded.provider_id,
        runtime_kind = excluded.runtime_kind,
        support = excluded.support,
        native_name = excluded.native_name,
        capability_ids_json = excluded.capability_ids_json,
        risk_tiers_json = excluded.risk_tiers_json,
        credential_required = excluded.credential_required,
        cost_risk = excluded.cost_risk,
        requires_approval = excluded.requires_approval,
        network_policy_id = excluded.network_policy_id,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      id,
      providerId,
      input.flags["runtime-kind"] || input.flags.runtime || "api",
      input.flags.support || "external_pending",
      input.flags["native-name"] || input.flags.native || null,
      JSON.stringify(capabilityIds),
      JSON.stringify(riskTiers),
      input.flags["credential-required"] === undefined ? 1 : (truthy(input.flags["credential-required"]) ? 1 : 0),
      input.flags["cost-risk"] || "unknown",
      input.flags["requires-approval"] === undefined ? 1 : (truthy(input.flags["requires-approval"]) ? 1 : 0),
      input.flags["network-policy"] || input.flags["network-policy-id"] || null,
      metadataJson,
      existing?.created_at ?? now,
      now,
    );
    scheduleConnectorCatalogSearchEvent({
      operation: "upsert",
      operationId: id,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    const row = store.sqlite.prepare("SELECT * FROM connector_operations WHERE id = ?").get(id);
    writeSuccess(input, { operation: row ? normalizeDbRow(row) : null, durable: true, store: "core.sqlite" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.flags.operation || input.positionals[3];
    if (!id) return usageError(input, "Usage: claw connectors operation delete OPERATION_ID [--json]");
    const changes = store.sqlite.prepare("DELETE FROM connector_operations WHERE id = ?").run(id).changes;
    if (changes > 0) {
      scheduleConnectorCatalogSearchEvent({
        operation: "delete",
        operationId: id,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "connectors"));
}

function parseConnectorStringList(value: string | undefined): string[] {
  const parsed = parseCsvOrJson(value);
  const entries = Array.isArray(parsed) ? parsed : (parsed === undefined ? [] : [parsed]);
  return entries.map((entry) => String(entry).trim()).filter(Boolean);
}

export function runSheetsCommand(input: V1DataCliInput): number {
  const scope = input.positionals[1];
  if (scope !== "workbook" && scope !== "workbooks") return usageError(input, usage(input.binName, "sheets"));
  const command = input.positionals[2] || "list";
  const workspaceRoot = path.resolve(input.cwd, expandHome(input.flags.workspace || input.cwd));
  const root = resolveSheetsWorkbooksCliRoot(input);
  if (command === "list") {
    const items = fs.existsSync(root)
      ? fs.readdirSync(root)
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .slice(0, Math.max(1, Number(input.flags.limit ?? 100)))
        .map((entry) => normalizeWorkbookManifest(readWorkbookManifest(path.join(root, entry)), path.basename(entry, ".json")))
      : [];
    writeSuccess(input, { root, items });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const workbookId = input.flags.id || input.flags.workbook || input.positionals[3];
    if (!workbookId) return usageError(input, "Usage: claw sheets workbook get WORKBOOK_ID [--json]");
    const filePath = path.join(root, `${workbookId}.json`);
    const manifest = fs.existsSync(filePath) ? normalizeWorkbookManifest(readWorkbookManifest(filePath), workbookId) : null;
    writeSuccess(input, manifest);
    return manifest ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert" || command === "create" || command === "edit") {
    const workbookId = input.flags.id || input.flags.workbook || input.positionals[3];
    if (!workbookId) return usageError(input, "Usage: claw sheets workbook upsert WORKBOOK_ID [--title TITLE] [--sheet NAME] [--json]");
    const filePath = path.join(root, `${workbookId}.json`);
    const existing = fs.existsSync(filePath) ? normalizeWorkbookManifest(readWorkbookManifest(filePath), workbookId) : {};
    const base = workbookManifestFromInput(input);
    const now = nowIso();
    const manifest = normalizeWorkbookManifest({
      ...existing,
      ...base,
      id: workbookId,
      title: input.flags.title || stringFlag(base.title) || stringFlag(existing.title) || `Workbook ${workbookId}`,
      author: workbookAuthorFromFlags(input, base.author, existing.author),
      sheets: workbookSheetsFromFlags(input, base.sheets, existing.sheets),
      metadata: input.flags.metadata ? normalizeWorkbookMetadata(input.flags.metadata) : (isRecord(base.metadata) ? base.metadata : isRecord(existing.metadata) ? existing.metadata : {}),
      outputs: Array.isArray(base.outputs) ? base.outputs : Array.isArray(existing.outputs) ? existing.outputs : [],
      createdAt: stringFlag(existing.createdAt) || stringFlag(base.createdAt) || now,
      updatedAt: now,
    }, workbookId);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    scheduleSheetsWorkbookSearchEvent({
      operation: "upsert",
      workbookId,
      workspaceRoot,
      dataDir: resolveClawjsDataRoot(),
      flags: { ...input.flags, workspace: workspaceRoot },
    });
    writeSuccess(input, { workbook: manifest, path: filePath, durable: true, store: "workspace" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const workbookId = input.flags.id || input.flags.workbook || input.positionals[3];
    if (!workbookId) return usageError(input, "Usage: claw sheets workbook delete WORKBOOK_ID [--json]");
    const filePath = path.join(root, `${workbookId}.json`);
    const existed = fs.existsSync(filePath);
    if (existed) {
      fs.rmSync(filePath, { force: true });
      scheduleSheetsWorkbookSearchEvent({
        operation: "delete",
        workbookId,
        workspaceRoot,
        dataDir: resolveClawjsDataRoot(),
        flags: { ...input.flags, workspace: workspaceRoot },
      });
    }
    writeSuccess(input, { id: workbookId, deleted: existed, path: filePath });
    return existed ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "sheets"));
}

function resolveSheetsWorkbooksCliRoot(input: V1DataCliInput): string {
  const configured = input.flags["sheets-root"] || input.flags["sheets-workbooks-root"] || input.flags["workbooks-root"];
  if (configured) return path.resolve(input.cwd, expandHome(configured));
  const workspaceRoot = path.resolve(input.cwd, expandHome(input.flags.workspace || input.cwd));
  return resolveClawPersistentSurfacePath("claw.workspace.sheets", workspaceRoot, "workbooks");
}

function workbookManifestFromInput(input: V1DataCliInput): Record<string, unknown> {
  if (input.flags.file) return readWorkbookManifest(path.resolve(input.cwd, expandHome(input.flags.file)));
  if (input.flags.manifest) {
    const parsed = parseMaybeJson(input.flags.manifest);
    return isRecord(parsed) ? parsed : {};
  }
  return {};
}

function readWorkbookManifest(filePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeWorkbookManifest(value: Record<string, unknown>, fallbackId: string): Record<string, unknown> {
  return {
    ...value,
    schemaVersion: value.schemaVersion ?? 1,
    id: stringFlag(value.id) || fallbackId,
  };
}

function workbookAuthorFromFlags(input: V1DataCliInput, base: unknown, existing: unknown): Record<string, unknown> {
  const current = isRecord(base) ? base : isRecord(existing) ? existing : {};
  return {
    ...current,
    ...(input.flags["agent-id"] ? { agentId: input.flags["agent-id"] } : {}),
    ...(input.flags.author ? { name: input.flags.author } : {}),
  };
}

function workbookSheetsFromFlags(input: V1DataCliInput, base: unknown, existing: unknown): unknown[] {
  if (!input.flags.sheet && !input.flags["sheet-name"] && !input.flags.columns && !input.flags["rows-json"] && !input.flags.notes) {
    if (Array.isArray(base)) return base;
    if (Array.isArray(existing)) return existing;
    return [];
  }
  const sheetName = input.flags.sheet || input.flags["sheet-name"] || "Sheet 1";
  const parsedRows = parseMaybeJson(input.flags["rows-json"]);
  return [{
    id: input.flags["sheet-id"] || slugifySheetId(sheetName),
    name: sheetName,
    columns: parseCsvOrJson(input.flags.columns) ?? [],
    rows: Array.isArray(parsedRows) ? parsedRows : [],
    ...(input.flags.notes ? { notes: input.flags.notes } : {}),
  }];
}

function normalizeWorkbookMetadata(value: string): Record<string, unknown> {
  const parsed = parseMaybeJson(value);
  return isRecord(parsed) ? parsed : { value: parsed };
}

function stringFlag(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugifySheetId(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "sheet-1";
}

export function runAppsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM apps ORDER BY pinned DESC, COALESCE(last_opened_at, updated_at) DESC").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const slug = input.flags.slug || input.positionals[2];
    const name = input.flags.name || slug;
    const rootPath = input.flags.path || input.flags.root || (slug ? path.join(resolveClawjsDataRoot(), "apps", slug) : "");
    if (!slug || !name || !rootPath) return usageError(input, "Usage: claw apps upsert SLUG --name NAME --path PATH");
    const now = nowIso();
    const manifest = input.flags.manifest ? JSON.parse(input.flags.manifest) : {};
    store.sqlite.prepare(`
      INSERT INTO apps (id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, root_path = excluded.root_path,
        manifest_json = excluded.manifest_json, permissions_json = excluded.permissions_json, pinned = excluded.pinned,
        last_opened_at = excluded.last_opened_at, created_by_chat_id = excluded.created_by_chat_id, updated_at = excluded.updated_at
    `).run(
      input.flags.id || `app-${slug}`,
      slug,
      name,
      input.flags.description || null,
      path.resolve(input.cwd, expandHome(rootPath)),
      JSON.stringify(manifest),
      input.flags.permissions ? JSON.stringify(JSON.parse(input.flags.permissions)) : "{}",
      truthy(input.flags.pinned) ? 1 : 0,
      input.flags["last-opened-at"] || null,
      input.flags["created-by-chat-id"] || null,
      now,
      now,
    );
    scheduleAppsCatalogSearchEvent({
      operation: "upsert",
      appId: input.flags.id || `app-${slug}`,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, { slug, name, rootPath: path.resolve(input.cwd, expandHome(rootPath)), updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const appId = input.flags.id || input.positionals[2];
    if (!appId) return usageError(input, "Usage: claw apps delete APP_ID [--json]");
    const row = store.sqlite.prepare("SELECT id, slug FROM apps WHERE id = ? OR slug = ? LIMIT 1").get(appId, appId) as { id: string; slug: string } | undefined;
    const changes = row ? store.sqlite.prepare("DELETE FROM apps WHERE id = ?").run(row.id).changes : 0;
    if (changes > 0) {
      scheduleAppsCatalogSearchEvent({
        operation: "delete",
        appId: row?.id ?? appId,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { id: row?.id ?? appId, slug: row?.slug ?? null, deleted: changes > 0 });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "apps"));
}

export function runDesignCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const kind = input.flags.kind;
    const rows = kind
      ? store.sqlite.prepare("SELECT * FROM design_resources WHERE kind = ? ORDER BY updated_at DESC").all(kind)
      : store.sqlite.prepare("SELECT * FROM design_resources ORDER BY kind, updated_at DESC").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "upsert") {
    const kind = input.flags.kind || input.positionals[2];
    const id = input.flags.id || input.positionals[3] || (kind ? `${kind}-${randomUUID().slice(0, 8)}` : "");
    const name = input.flags.name || id;
    if (!kind || !id || !name) return usageError(input, "Usage: claw design upsert KIND ID --name NAME [--path PATH]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO design_resources (id, kind, name, root_path, manifest_json, builtin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, root_path = excluded.root_path,
        manifest_json = excluded.manifest_json, builtin = excluded.builtin, updated_at = excluded.updated_at
    `).run(id, kind, name, input.flags.path ? path.resolve(input.cwd, expandHome(input.flags.path)) : null, input.flags.manifest ? JSON.stringify(JSON.parse(input.flags.manifest)) : "{}", truthy(input.flags.builtin) ? 1 : 0, now, now);
    scheduleDesignResourcesSearchEvent({
      operation: "upsert",
      resourceId: id,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, { id, kind, name, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const resourceId = input.flags.id || input.positionals[2];
    if (!resourceId) return usageError(input, "Usage: claw design delete RESOURCE_ID [--json]");
    const row = store.sqlite.prepare("SELECT id, kind FROM design_resources WHERE id = ? LIMIT 1").get(resourceId) as { id: string; kind: string } | undefined;
    const changes = row ? store.sqlite.prepare("DELETE FROM design_resources WHERE id = ?").run(row.id).changes : 0;
    if (changes > 0) {
      scheduleDesignResourcesSearchEvent({
        operation: "delete",
        resourceId: row?.id ?? resourceId,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { id: row?.id ?? resourceId, kind: row?.kind ?? null, deleted: changes > 0 });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "design"));
}

export function runSkillsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "list") {
    const kind = input.flags.kind;
    const rows = kind
      ? store.sqlite.prepare("SELECT * FROM skills WHERE kind = ? ORDER BY kind, name").all(kind)
      : store.sqlite.prepare("SELECT * FROM skills ORDER BY kind, name").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const slug = input.flags.slug || input.positionals[2];
    if (!slug) return usageError(input, "Usage: claw skills get SLUG [--json]");
    const row = store.sqlite.prepare("SELECT * FROM skills WHERE slug = ?").get(slug);
    writeSuccess(input, row ? normalizeDbRow(row) : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "upsert") {
    const slug = input.flags.slug || input.positionals[2];
    const name = input.flags.name || slug;
    if (!slug || !name) return usageError(input, "Usage: claw skills upsert SLUG --name NAME [--body TEXT|--file SKILL.md] [--secret-refs REF,REF]");
    const now = nowIso();
    const body = input.flags.file ? fs.readFileSync(path.resolve(input.cwd, expandHome(input.flags.file)), "utf8") : (input.flags.body || "");
    const secretRefs = parseCsvOrJson(input.flags["secret-refs"] || input.flags["secret-ref"]) ?? [];
    store.sqlite.prepare(`
      INSERT INTO skills (id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET kind = excluded.kind, name = excluded.name, body = excluded.body,
        scope_json = excluded.scope_json, secret_refs_json = excluded.secret_refs_json, metadata_json = excluded.metadata_json,
        export_path = excluded.export_path, updated_at = excluded.updated_at
    `).run(input.flags.id || `skill-${slug}`, slug, input.flags.kind || "skill", name, body, input.flags.scope ? JSON.stringify(JSON.parse(input.flags.scope)) : "{}", JSON.stringify(secretRefs), input.flags.metadata ? JSON.stringify(JSON.parse(input.flags.metadata)) : "{}", input.flags["export-path"] || null, now, now);
    scheduleSkillsRegistrySearchEvent({
      operation: "upsert",
      slug,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, { slug, name, secretRefs, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const slug = input.flags.slug || input.positionals[2];
    if (!slug) return usageError(input, "Usage: claw skills delete SLUG [--json]");
    const changes = store.sqlite.prepare("DELETE FROM skills WHERE slug = ?").run(slug).changes;
    if (changes > 0) {
      scheduleSkillsRegistrySearchEvent({
        operation: "delete",
        slug,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { slug, deleted: changes > 0 });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "skills"));
}

export async function runSessionsIndexCommand(input: V1DataCliInput, store: DatabaseServiceStore): Promise<number | null> {
  const command = input.positionals[1];
  if ((command === "list" || command === "search") && input.flags.workspace) {
    return null;
  }
  if (command === "runtime") {
    return runSessionsRuntimeCommand(input);
  }
  if (command === "index") {
    const roots = sessionRoots(input);
    const sessionEvents = new Map<string, boolean>();
    const indexed = indexSessionRoots(store.sqlite, roots, input.flags.source || "codex", (sessionId, archived) => {
      sessionEvents.set(sessionId, archived);
    });
    for (const [sessionId, archived] of sessionEvents) {
      scheduleSessionChatSearchEvent({
        operation: archived ? "delete" : "upsert",
        sessionId,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { indexed, roots });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const source = input.flags.source;
    const rows = source
      ? store.sqlite.prepare("SELECT * FROM session_index WHERE source = ? ORDER BY updated_at DESC LIMIT ?").all(source, limit)
      : store.sqlite.prepare("SELECT * FROM session_index ORDER BY updated_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get") {
    const id = input.flags.id || input.flags["session-id"] || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw sessions get SESSION_ID [--json]");
    const row = store.sqlite.prepare("SELECT * FROM session_index WHERE session_id = ?").get(id) as JsonRecord | undefined;
    writeSuccess(input, row ? normalizeDbRow(row) : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "search") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw sessions search --query TEXT [--json]");
    const limit = Math.max(1, Number(input.flags.limit ?? 50));
    const rows = store.sqlite.prepare(`
      SELECT session_index.*
      FROM session_index_fts
      JOIN session_index ON session_index.session_id = session_index_fts.session_id
      WHERE session_index_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsPhrase(query), limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "sessions"));
}

async function runSessionsRuntimeCommand(input: V1DataCliInput): Promise<number> {
  const action = input.positionals[2] || "jobs";
  const paths = resolveSessionsRuntimePaths(input);
  if (action === "enqueue") {
    const jobType = input.positionals[3] || input.flags.kind;
    const store = new SessionsRuntimeJobStore(paths.runtimeDbPath);
    try {
      if (jobType === "import-codex" || jobType === "sessions.import_codex") {
        const dir = input.flags.dir || input.flags["codex-dir"] || paths.codexSessionsDir;
        const job = store.enqueueJob({
          id: input.flags.id,
          kind: "sessions.import_codex",
          title: input.flags.title,
          resourceId: input.flags["resource-id"] ?? "codex",
          priority: numberFlag(input.flags.priority, 20),
          scheduledAt: input.flags["scheduled-at"] || input.flags["run-at"],
          maxAttempts: numberFlag(input.flags["max-attempts"], 3),
          payload: {
            dir,
            mode: input.flags.mode,
            machine: input.flags.machine,
            forceReimport: truthy(input.flags["force-reimport"]),
            budgetMs: optionalNumberFlag(input.flags["budget-ms"]),
            maxFiles: optionalNumberFlag(input.flags["max-files"]),
            batchSize: optionalNumberFlag(input.flags["batch-size"]),
          },
        });
        scheduleRuntimeJobSearch(input, job.id);
        writeSuccess(input, { item: job, paths: publicSessionsRuntimePaths(paths) });
        return V1_DATA_EXIT_OK;
      }
      if (jobType === "rebuild-projection" || jobType === "sessions.rebuild_projection") {
        const sessionId = input.flags["session-id"] || input.flags.session || input.flags["resource-id"] || input.positionals[4];
        if (!sessionId) return usageError(input, `Usage: ${input.binName} sessions runtime enqueue rebuild-projection --session-id SESSION_ID [--json]`);
        const job = store.enqueueJob({
          id: input.flags.id,
          kind: "sessions.rebuild_projection",
          title: input.flags.title,
          resourceId: sessionId,
          priority: numberFlag(input.flags.priority, 10),
          scheduledAt: input.flags["scheduled-at"] || input.flags["run-at"],
          maxAttempts: numberFlag(input.flags["max-attempts"], 3),
          payload: { sessionId },
        });
        scheduleRuntimeJobSearch(input, job.id);
        writeSuccess(input, { item: job, paths: publicSessionsRuntimePaths(paths) });
        return V1_DATA_EXIT_OK;
      }
      if (jobType === "rebuild-projections" || jobType === "rebuild-project" || jobType === "sessions.rebuild_projections") {
        const projectId = input.flags["project-id"];
        const projectPath = input.flags["project-path"];
        const resourceId = input.flags["resource-id"] ?? projectId ?? projectPath ?? "all";
        const job = store.enqueueJob({
          id: input.flags.id,
          kind: "sessions.rebuild_projections",
          title: input.flags.title,
          resourceId,
          priority: numberFlag(input.flags.priority, 8),
          scheduledAt: input.flags["scheduled-at"] || input.flags["run-at"],
          maxAttempts: numberFlag(input.flags["max-attempts"], 3),
          payload: {
            projectId,
            projectPath,
            maxSessions: optionalNumberFlag(input.flags["max-sessions"]),
            budgetMs: optionalNumberFlag(input.flags["budget-ms"]),
            batchSize: optionalNumberFlag(input.flags["batch-size"]),
            offset: optionalNumberFlag(input.flags.offset),
          },
        });
        scheduleRuntimeJobSearch(input, job.id);
        writeSuccess(input, { item: job, paths: publicSessionsRuntimePaths(paths) });
        return V1_DATA_EXIT_OK;
      }
    } finally {
      store.close();
    }
    return usageError(input, `Usage: ${input.binName} sessions runtime enqueue import-codex|rebuild-projection|rebuild-projections [--json]`);
  }
  if (action === "run-once") {
    const searchEvents: unknown[] = [];
    const result = await runSessionsRuntimeJobs({
      runtimeDbPath: paths.runtimeDbPath,
      sessionsDbPath: paths.sessionsDbPath,
      codexSessionsDir: paths.codexSessionsDir,
      owner: input.flags.owner,
      maxJobs: numberFlag(input.flags.limit ?? input.flags["max-jobs"], 10),
      maxRuntimeMs: numberFlag(input.flags["max-runtime-ms"], 30_000),
      maxFailures: numberFlag(input.flags["max-failures"], 10),
      leaseMs: numberFlag(input.flags["lease-ms"], 30_000),
      now: input.flags.now,
      onSessionChanged: (event) => {
        searchEvents.push(...scheduleSessionChangedSearchEvents(input, paths, event));
      },
    });
    writeSuccess(input, { worker: result, searchEvents, paths: publicSessionsRuntimePaths(paths) });
    return V1_DATA_EXIT_OK;
  }
  if (action === "jobs" || action === "list") {
    const store = new SessionsRuntimeJobStore(paths.runtimeDbPath);
    try {
      const items = store.listJobs({
        status: input.flags.status as never,
        kind: input.flags.kind,
        limit: numberFlag(input.flags.limit, 100),
      });
      writeSuccess(input, { items, paths: publicSessionsRuntimePaths(paths) });
      return V1_DATA_EXIT_OK;
    } finally {
      store.close();
    }
  }
  if (action === "events") {
    const store = new SessionsRuntimeJobStore(paths.runtimeDbPath);
    try {
      const items = store.listEvents({
        jobId: input.flags["job-id"],
        sessionId: input.flags["session-id"] || input.flags.session,
        target: input.flags.target,
        subsystem: input.flags.subsystem,
        pinned: input.flags.pinned === undefined ? undefined : truthy(input.flags.pinned),
        limit: numberFlag(input.flags.limit, 100),
      });
      writeSuccess(input, { items, paths: publicSessionsRuntimePaths(paths) });
      return V1_DATA_EXIT_OK;
    } finally {
      store.close();
    }
  }
  if (action === "logs") {
    const store = new SessionsRuntimeJobStore(paths.runtimeDbPath);
    try {
      const items = store.listLogs({
        jobId: input.flags["job-id"],
        sessionId: input.flags["session-id"] || input.flags.session,
        target: input.flags.target,
        subsystem: input.flags.subsystem,
        pinned: input.flags.pinned === undefined ? undefined : truthy(input.flags.pinned),
        limit: numberFlag(input.flags.limit, 100),
      });
      writeSuccess(input, { items, paths: publicSessionsRuntimePaths(paths) });
      return V1_DATA_EXIT_OK;
    } finally {
      store.close();
    }
  }
  if (action === "retention") {
    const store = new SessionsRuntimeJobStore(paths.runtimeDbPath);
    try {
      const result = store.applyRetention({
        now: input.flags.now,
        maxAgeDays: numberFlag(input.flags.days ?? input.flags["max-age-days"], 30),
        maxEvents: numberFlag(input.flags["max-events"], 10_000),
        maxLogs: numberFlag(input.flags["max-logs"], 10_000),
        maxEventBytes: numberFlag(input.flags["max-event-bytes"], 50 * 1024 * 1024),
        maxLogBytes: numberFlag(input.flags["max-log-bytes"], 50 * 1024 * 1024),
        dryRun: truthy(input.flags["dry-run"]),
      });
      writeSuccess(input, { retention: result, paths: publicSessionsRuntimePaths(paths) });
      return V1_DATA_EXIT_OK;
    } finally {
      store.close();
    }
  }
  if (action === "job") {
    const subaction = input.positionals[3] || "get";
    const id = input.flags.id || input.positionals[4];
    if (!id) return usageError(input, `Usage: ${input.binName} sessions runtime job get|cancel ID [--json]`);
    const store = new SessionsRuntimeJobStore(paths.runtimeDbPath);
    try {
      if (subaction === "get") {
        const job = store.getJob(id);
        writeSuccess(input, { item: job, paths: publicSessionsRuntimePaths(paths) });
        return job ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
      }
      if (subaction === "cancel") {
        const job = store.cancelJob(id);
        if (job) scheduleRuntimeJobSearch(input, id);
        writeSuccess(input, { item: job, cancelled: Boolean(job), paths: publicSessionsRuntimePaths(paths) });
        return job ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
      }
    } finally {
      store.close();
    }
  }
  return usageError(input, `Usage: ${input.binName} sessions runtime enqueue|run-once|jobs|job|events|logs|retention [--json]`);
}

function scheduleSessionChangedSearchEvents(input: V1DataCliInput, paths: SessionsRuntimePaths, event: SessionsRuntimeSessionChangedEvent): unknown[] {
  const flags = { ...input.flags, "data-dir": paths.dataDir, "sessions-db-path": paths.sessionsDbPath };
  return [
    {
      source: "sessions.chats",
      sessionId: event.sessionId,
      result: scheduleSessionChatSearchEvent({
        operation: "upsert",
        sessionId: event.sessionId,
        dataDir: paths.dataDir,
        flags,
      }),
    },
    {
      source: "sessions.events",
      sessionId: event.sessionId,
      result: scheduleSessionEventsSearchEvent({
        operation: "upsert",
        sessionId: event.sessionId,
        dataDir: paths.dataDir,
        flags,
      }),
    },
  ];
}

function scheduleRuntimeJobSearch(input: V1DataCliInput, jobId: string): void {
  scheduleRuntimeEventsSearchEvent({
    operation: "upsert",
    kind: "job",
    id: jobId,
    dataDir: resolveClawjsDataRoot(input.flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: input.flags["data-dir"] } : process.env),
    flags: input.flags,
  });
}

interface SessionsRuntimePaths {
  dataDir: string;
  sessionsDbPath: string;
  runtimeDbPath: string;
  codexSessionsDir: string;
}

function resolveSessionsRuntimePaths(input: V1DataCliInput): SessionsRuntimePaths {
  const explicitDataDir = input.flags["data-dir"]
    ? path.resolve(input.cwd, expandHome(input.flags["data-dir"]))
    : undefined;
  const config = loadSessionsConfig(explicitDataDir ? {
    dataDir: explicitDataDir,
    dbPath: path.join(explicitDataDir, "sessions.sqlite"),
  } : {});
  const dataDir = explicitDataDir ?? config.dataDir;
  return {
    dataDir,
    sessionsDbPath: path.resolve(input.cwd, expandHome(input.flags["sessions-db-path"] || input.flags["sessions-db"] || config.dbPath)),
    runtimeDbPath: path.resolve(input.cwd, expandHome(input.flags["runtime-db-path"] || input.flags["runtime-db"] || path.join(dataDir, "runtime.sqlite"))),
    codexSessionsDir: path.resolve(input.cwd, expandHome(input.flags["codex-dir"] || input.flags.dir || config.codexSessionsDir)),
  };
}

function publicSessionsRuntimePaths(paths: SessionsRuntimePaths): SessionsRuntimePaths {
  return paths;
}

function numberFlag(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumberFlag(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
