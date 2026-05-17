import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import type Database from "better-sqlite3";
import { DatabaseServiceStore } from "@clawjs/database";
import { runAgentsCommand, runConnectionsCommand, runPersonalitiesCommand, runSkillCollectionsCommand } from "./v1-data-agent-entities.ts";
import { runProviderRoutingCommand, runSnippetsCommand } from "./v1-data-agent-config.ts";
import { scheduleKnowledgeGraphSearchEvent, scheduleNotesPagesSearchEvent, scheduleSignalsObservationsSearchEvent, scheduleSkillsRegistrySearchEvent } from "./cli-search-events.ts";
export {
  openMainDataStore,
  resolveClawjsDataRoot,
  resolveClawjsFilesDir,
  resolveClawjsMainDbPath,
} from "./v1-data-core.ts";
import {
  V1_DATA_EXIT_FAILURE,
  V1_DATA_EXIT_OK,
  backupDataStore,
  doctorPayload,
  ensureSignalsVariable,
  ensureSignalsVertical,
  expandHome,
  ftsPhrase,
  guessContentType,
  isRecord,
  markdownToPagePatch,
  normalizeDbRow,
  nowIso,
  openMainDataStore,
  openSidecar,
  pageToMarkdown,
  parseCsvOrJson,
  parseJson,
  parseMaybeJson,
  querySearchSidecar,
  readMcpServers,
  readPage,
  rebuildNotesFts,
  rebuildSearchSidecar,
  refreshProfileProjection,
  resolveClawjsDataRoot,
  resetDomain,
  restoreDataStore,
  runRecordGetDelete,
  runSimpleRecordCommand,
  runSidecarArtifactCommand,
  sessionRoots,
  indexSessionRoots,
  stringValue,
  truthy,
  upsertPageWithBlocks,
  upsertRegistry,
  usage,
  usageError,
  writeError,
  writeMcpServers,
  writeSuccess,
  writeUnredactedSuccess,
  PROFILE_ID,
} from "./v1-data-core.ts";
import type { JsonRecord, V1DataCliInput } from "./v1-data-core.ts"; // Public storage surface: CLAW_DATA_DIR, CLAW_HOME, CLAW_DB_PATH, core.sqlite.

export async function runV1DataCli(input: V1DataCliInput): Promise<number | null> {
  const [group, command] = input.positionals;
  if (!shouldHandleV1DataCommand(group, command, input.argv.includes("--help") || input.argv.includes("-h"))) {
    return null;
  }
  const wantsHelp = input.argv.includes("--help") || input.argv.includes("-h");
  if (wantsHelp || !command || command === "help") {
    input.stdout.write(`${usage(input.binName, group)}\n`);
    return V1_DATA_EXIT_OK;
  }
  if (group === "sessions" && (command === "list" || command === "search") && input.flags.workspace) {
    return null;
  }
  if (group === "data" && command === "restore") {
    const from = input.flags.from || input.flags.input;
    if (!from) return usageError(input, "Usage: claw data restore --from DIR [--json]");
    try {
      const restored = restoreDataStore(path.resolve(input.cwd, expandHome(from)));
      writeSuccess(input, restored);
      return V1_DATA_EXIT_OK;
    } catch (error) {
      writeError(input, "data_error", error instanceof Error ? error.message : String(error));
      return V1_DATA_EXIT_FAILURE;
    }
  }

  let store: DatabaseServiceStore | null = null;
  try {
    store = openMainDataStore();
    switch (group) {
      case "data":
        return runDataMaintenanceCommand(input, store);
      case "app-state":
        return runAppStateCommand(input, store);
      case "signals":
      case "life":
        return runSignalsCommand(input, store);
      case "knowledge":
        return runKnowledgeCommand(input, store);
      case "notes":
        return runNotesCommand(input, store);
      case "wiki":
        return runWikiCommand(input, store);
      case "profile":
        return runProfileCommand(input, store);
      case "tasks":
      case "projects":
      case "goals":
      case "reminders":
      case "deadlines":
        return runProductivityCommand(input, store, group);
      case "business":
        return runBusinessCommand(input, store);
      case "content":
        return runContentCommand(input, store);
      case "social":
        return runSocialCommand(input, store);
      case "finance":
        return runFinanceCommand(input, store);
      case "calendar":
        return runCalendarCommand(input, store);
      case "iot":
        return runIotConfigCommand(input, store);
      case "marketplace":
        return runMarketplaceCommand(input, store);
      case "ledger":
        return runLedgerCommand(input, store);
      case "search":
        return runSearchCommand(input, store);
      case "audio":
        return runAudioSidecarCommand(input, store);
      case "drive":
        return runDriveSidecarCommand(input, store);
      case "runtime":
        return runRuntimeSidecarCommand(input, store);
      case "notify":
        return runOperationalSidecarCommand(input, store, "notify.sqlite", "notify");
      case "monitor":
        return runOperationalSidecarCommand(input, store, "monitor.sqlite", "monitor");
      case "infra":
        return runOperationalSidecarCommand(input, store, "infra.sqlite", "infra");
      case "feed":
        return runOperationalSidecarCommand(input, store, "feed.sqlite", "feed");
      case "ops":
        return runOperationalSidecarCommand(input, store, "ops.sqlite", "ops");
      case "mcp":
        return runMcpCommand(input);
      case "apps":
        return runAppsCommand(input, store);
      case "design":
        return runDesignCommand(input, store);
      case "agents":
        return runAgentsCommand(input, store);
      case "skills": return runSkillsCommand(input, store);
      case "personalities": return runPersonalitiesCommand(input, store);
      case "skill-collections": return runSkillCollectionsCommand(input, store);
      case "connections": return runConnectionsCommand(input, store);
      case "providers": return runProviderRoutingCommand(input, store);
      case "snippets": return runSnippetsCommand(input, store);
      case "sessions": return runSessionsIndexCommand(input, store);
      default:
        return null;
    }
  } catch (error) {
    writeError(input, "data_error", error instanceof Error ? error.message : String(error));
    return V1_DATA_EXIT_FAILURE;
  } finally {
    store?.close();
  }
}

function shouldHandleV1DataCommand(group: string | undefined, command: string | undefined, wantsHelp: boolean): group is string {
  if (group === "providers") return command === "routing" || command === "settings";
  const commandsByGroup: Record<string, Set<string>> = {
    data: new Set(["doctor", "backup", "restore", "reset", "help"]),
    "app-state": new Set(["get", "set", "snapshot", "project", "pin", "title", "archive", "sidebar", "terminal", "help"]),
    signals: new Set(["catalog", "seed-catalog", "observe", "list", "delete", "help"]),
    life: new Set(["catalog", "seed-catalog", "observe", "list", "delete", "help"]),
    knowledge: new Set(["entity", "fact", "list", "search", "promote", "help"]),
    notes: new Set(["create", "list", "get", "update", "delete", "search", "export", "import", "link", "record-note", "help"]),
    wiki: new Set(["create", "list", "get", "update", "delete", "search", "export", "import", "link", "help"]),
    profile: new Set(["get", "refresh", "list", "help"]),
    business: new Set(["upsert", "list", "get", "delete", "help"]),
    content: new Set(["upsert", "list", "get", "delete", "help"]),
    social: new Set(["upsert", "list", "get", "delete", "help"]),
    finance: new Set(["upsert", "list", "get", "delete", "help"]),
    iot: new Set(["config", "help"]),
    marketplace: new Set(["choice", "choices", "help"]),
    ledger: new Set(["entry", "line", "list", "get", "delete", "help"]),
    search: new Set(["query", "rebuild", "help"]),
    audio: new Set(["index", "artifact", "transcript", "help"]),
    drive: new Set(["index", "artifact", "attach", "help"]),
    runtime: new Set(["queue", "job", "event", "retention", "help"]),
    notify: new Set(["event", "list", "retention", "help"]),
    monitor: new Set(["event", "list", "retention", "help"]),
    infra: new Set(["event", "list", "retention", "help"]),
    ops: new Set(["event", "metric", "list", "retention", "help"]),
    mcp: new Set(["list", "get", "upsert", "delete", "config-path", "help"]),
    apps: new Set(["list", "upsert", "help"]),
    design: new Set(["list", "upsert", "help"]),
    agents: new Set(["list", "get", "upsert", "delete", "schema", "evaluate-access", "delegation-check", "supervisor-check", "route-check", "resolve-external-identity", "project-support-inbox", "memory-check", "budget-check", "action-severity", "autonomy-check", "dispatch-plan", "context-pack", "tool-catalog", "creation-review", "storage-audit", "audit-coverage", "operational-snapshot", "control-panel", "privacy-plan", "paperclip-import", "surface-projection", "config-revision", "incident", "activity-feed", "blueprint", "evaluation", "retirement-plan", "help"]),
    skills: new Set(["get", "upsert", "delete", "help"]),
    personalities: new Set(["list", "get", "upsert", "delete", "help"]),
    "skill-collections": new Set(["list", "get", "upsert", "delete", "help"]),
    connections: new Set(["list", "get", "upsert", "delete", "help"]),
    snippets: new Set(["list", "upsert", "delete", "help"]),
    sessions: new Set(["index", "list", "get", "search", "help"]),
  };
  if (!group || !(group in commandsByGroup)) return false;
  if (wantsHelp || !command) return true;
  return commandsByGroup[group].has(command);
}

function runDataMaintenanceCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "doctor") {
    const payload = doctorPayload(store.sqlite);
    writeSuccess(input, payload);
    return V1_DATA_EXIT_OK;
  }
  if (command === "backup") {
    const out = input.flags.out || input.flags.to;
    if (!out) return usageError(input, "Usage: claw data backup --out DIR [--json]");
    const backup = backupDataStore(path.resolve(input.cwd, expandHome(out)));
    writeSuccess(input, backup);
    return V1_DATA_EXIT_OK;
  }
  if (command === "reset") {
    const domain = input.flags.domain || input.positionals[2];
    if (!domain) return usageError(input, "Usage: claw data reset --domain app-state|knowledge|notes|profile|signals|business|content|social|marketplace|iot|sessions|audio|drive|search|runtime|notify|monitor|infra|ops|all");
    const result = resetDomain(store.sqlite, domain);
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "data"));
}

function runAppStateCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "get") {
    const key = input.flags.key || input.positionals[2];
    if (!key) {
      const rows = store.sqlite.prepare("SELECT key, value_json, updated_at FROM app_state WHERE profile_id = ? ORDER BY key").all(PROFILE_ID) as Array<{ key: string; value_json: string; updated_at: string }>;
      writeSuccess(input, { items: rows.map((row) => ({ key: row.key, value: parseJson(row.value_json, null), updatedAt: row.updated_at })) });
      return V1_DATA_EXIT_OK;
    }
    const row = store.sqlite.prepare("SELECT value_json, updated_at FROM app_state WHERE profile_id = ? AND key = ?").get(PROFILE_ID, key) as { value_json: string; updated_at: string } | undefined;
    writeSuccess(input, row ? { key, value: parseJson(row.value_json, null), updatedAt: row.updated_at } : null);
    return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  if (command === "set") {
    const key = input.flags.key || input.positionals[2];
    if (!key) return usageError(input, "Usage: claw app-state set KEY --value JSON|TEXT");
    const value = input.flags.json ? JSON.parse(input.flags.json) : parseMaybeJson(input.flags.value ?? input.positionals.slice(3).join(" "));
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO app_state (profile_id, key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(PROFILE_ID, key, JSON.stringify(value), now);
    writeSuccess(input, { key, value, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "snapshot") {
    const payload = {
      projects: store.sqlite.prepare("SELECT * FROM app_projects ORDER BY COALESCE(sort_order, 999999), name").all().map(normalizeDbRow),
      pinnedThreads: store.sqlite.prepare("SELECT * FROM app_pinned_threads ORDER BY sort_order").all().map(normalizeDbRow),
      titles: store.sqlite.prepare("SELECT * FROM app_session_titles ORDER BY updated_at DESC").all().map(normalizeDbRow),
      archives: store.sqlite.prepare("SELECT * FROM app_archives ORDER BY archived_at DESC").all().map(normalizeDbRow),
      sidebar: store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots ORDER BY pinned DESC, updated_at DESC LIMIT ?").all(Number(input.flags.limit ?? 200)).map(normalizeDbRow),
      terminalTabs: store.sqlite.prepare("SELECT * FROM app_terminal_tabs ORDER BY sort_order, updated_at DESC").all().map(normalizeDbRow),
    };
    writeSuccess(input, payload);
    return V1_DATA_EXIT_OK;
  }
  if (command === "project") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_projects ORDER BY COALESCE(sort_order, 999999), name").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    if (action === "order") {
      const ids = parseCsvOrJson(input.flags.ids || input.positionals.slice(3).join(",")) ?? [];
      const now = nowIso();
      const tx = store.sqlite.transaction(() => {
        ids.forEach((id, index) => {
          store.sqlite.prepare(`
            UPDATE app_projects
            SET sort_order = ?, updated_at = ?
            WHERE id = ?
          `).run((index + 1) * 1000, now, id);
        });
      });
      tx();
      writeSuccess(input, { items: ids });
      return V1_DATA_EXIT_OK;
    }
    const id = input.flags.id || input.positionals[3];
    if (!id) return usageError(input, "Usage: claw app-state project upsert|delete|order ID [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_projects WHERE id = ?").run(id).changes;
      writeSuccess(input, { id, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      const name = input.flags.name || id;
      const projectPath = input.flags.path || "";
      const resourceId = input.flags["resource-id"] || input.flags.resourceId || null, sortOrder = input.flags["sort-order"] !== undefined ? Number(input.flags["sort-order"]) : null;
      store.sqlite.prepare(`
        INSERT INTO app_projects (id, resource_id, name, path, sort_order, hidden, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path,
          resource_id = COALESCE(excluded.resource_id, app_projects.resource_id), sort_order = COALESCE(excluded.sort_order, app_projects.sort_order),
          hidden = excluded.hidden, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(id, resourceId, name, projectPath, sortOrder, truthy(input.flags.hidden) ? 1 : 0, input.flags.metadata || "{}", now, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_projects WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "pin") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_pinned_threads ORDER BY sort_order").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state pin upsert|delete THREAD_ID [--json]");
    if (action === "delete" || action === "unset") {
      const changes = store.sqlite.prepare("DELETE FROM app_pinned_threads WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      const sortOrder = input.flags["sort-order"] !== undefined
        ? Number(input.flags["sort-order"])
        : ((store.sqlite.prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM app_pinned_threads").get() as { max_order: number }).max_order + 1000);
      store.sqlite.prepare(`
        INSERT INTO app_pinned_threads (thread_id, sort_order, pinned_at)
        VALUES (?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET sort_order = excluded.sort_order, pinned_at = excluded.pinned_at
      `).run(threadId, sortOrder, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_pinned_threads WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
    if (action === "order") {
      const ids = parseCsvOrJson(input.flags.ids || input.positionals.slice(3).join(",")) ?? [];
      const now = nowIso();
      const tx = store.sqlite.transaction(() => {
        store.sqlite.prepare("DELETE FROM app_pinned_threads").run();
        ids.forEach((id, index) => {
          store.sqlite.prepare("INSERT INTO app_pinned_threads (thread_id, sort_order, pinned_at) VALUES (?, ?, ?)").run(id, (index + 1) * 1000, now);
        });
      });
      tx();
      writeSuccess(input, { items: ids });
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "title") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_session_titles ORDER BY updated_at DESC").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state title upsert|delete THREAD_ID --title TEXT [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_session_titles WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const title = input.flags.title || input.positionals.slice(4).join(" ");
      if (!title.trim()) return usageError(input, "Usage: claw app-state title upsert THREAD_ID --title TEXT [--json]");
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_session_titles (thread_id, title, source, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET title = excluded.title, source = excluded.source, updated_at = excluded.updated_at
      `).run(threadId, title.trim(), input.flags.source || "manual", now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_session_titles WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "archive") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_archives ORDER BY archived_at DESC").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state archive set|delete THREAD_ID [--json]");
    if (action === "delete" || action === "unset") {
      const changes = store.sqlite.prepare("DELETE FROM app_archives WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_archives (thread_id, archived_at)
        VALUES (?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET archived_at = excluded.archived_at
      `).run(threadId, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_archives WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "sidebar") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots ORDER BY pinned DESC, updated_at DESC LIMIT ?").all(Number(input.flags.limit ?? 200));
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    if (action === "replace") {
      const rawItems = input.flags.items || "[]";
      const items = JSON.parse(rawItems) as Array<Record<string, unknown>>;
      const now = nowIso();
      const tx = store.sqlite.transaction(() => {
        store.sqlite.prepare("DELETE FROM app_sidebar_snapshots").run();
        for (const item of items) {
          const threadId = String(item.threadId || "");
          if (!threadId) continue;
          store.sqlite.prepare(`
            INSERT INTO app_sidebar_snapshots (thread_id, chat_uuid, title, cwd, project_path, updated_at, archived, pinned, captured_at, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            threadId,
            String(item.chatUuid || ""),
            String(item.title || threadId),
            typeof item.cwd === "string" && item.cwd ? item.cwd : null,
            typeof item.projectPath === "string" && item.projectPath ? item.projectPath : null,
            typeof item.updatedAt === "string" ? item.updatedAt : now,
            truthy(item.archived) ? 1 : 0,
            truthy(item.pinned) ? 1 : 0,
            now,
            typeof item.metadata === "string" ? item.metadata : JSON.stringify(item.metadata || {}),
          );
        }
      });
      tx();
      writeSuccess(input, { count: items.length });
      return V1_DATA_EXIT_OK;
    }
    const threadId = input.flags.id || input.flags["thread-id"] || input.positionals[3];
    if (!threadId) return usageError(input, "Usage: claw app-state sidebar upsert|delete|replace THREAD_ID [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_sidebar_snapshots WHERE thread_id = ?").run(threadId).changes;
      writeSuccess(input, { threadId, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_sidebar_snapshots (thread_id, chat_uuid, title, cwd, project_path, updated_at, archived, pinned, captured_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id) DO UPDATE SET chat_uuid = excluded.chat_uuid, title = excluded.title,
          cwd = excluded.cwd, project_path = excluded.project_path, updated_at = excluded.updated_at,
          archived = excluded.archived, pinned = excluded.pinned, captured_at = excluded.captured_at,
          metadata_json = excluded.metadata_json
      `).run(
        threadId,
        input.flags["chat-uuid"] || null,
        input.flags.title || threadId,
        input.flags.cwd || null,
        input.flags["project-path"] || null,
        input.flags["updated-at"] || now,
        truthy(input.flags.archived) ? 1 : 0,
        truthy(input.flags.pinned) ? 1 : 0,
        now,
        input.flags.metadata || "{}",
      );
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_sidebar_snapshots WHERE thread_id = ?").get(threadId) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  if (command === "terminal") {
    const action = input.positionals[2] || "list";
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM app_terminal_tabs ORDER BY sort_order, updated_at DESC").all();
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    const id = input.flags.id || input.positionals[3];
    if (!id) return usageError(input, "Usage: claw app-state terminal upsert|delete ID [--json]");
    if (action === "delete") {
      const changes = store.sqlite.prepare("DELETE FROM app_terminal_tabs WHERE id = ?").run(id).changes;
      writeSuccess(input, { id, deleted: changes > 0 });
      return V1_DATA_EXIT_OK;
    }
    if (action === "upsert" || action === "set") {
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO app_terminal_tabs (id, title, cwd, sort_order, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title = excluded.title, cwd = excluded.cwd,
          sort_order = excluded.sort_order, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(id, input.flags.title || id, input.flags.cwd || null, Number(input.flags["sort-order"] ?? 0), input.flags.metadata || "{}", now, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM app_terminal_tabs WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
  }
  return usageError(input, usage(input.binName, "app-state"));
}

function runSignalsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "catalog") {
    const verticalId = input.flags.vertical || input.flags["vertical-id"] || input.positionals[2];
    const rows = verticalId
      ? store.sqlite.prepare("SELECT * FROM signals_variables WHERE vertical_id = ? ORDER BY id").all(verticalId)
      : store.sqlite.prepare("SELECT * FROM signals_verticals ORDER BY category, label").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "seed-catalog") {
    const file = input.flags.file;
    const verticalId = input.flags.vertical || input.flags["vertical-id"];
    if (!file || !verticalId) return usageError(input, "Usage: claw signals seed-catalog --vertical ID --file catalog.json");
    const raw = fs.readFileSync(path.resolve(input.cwd, expandHome(file)), "utf8");
    const catalog = JSON.parse(raw) as { vertical?: JsonRecord; variables?: JsonRecord[] } | JsonRecord[];
    const variables = Array.isArray(catalog) ? catalog : Array.isArray(catalog.variables) ? catalog.variables : [];
    const vertical = !Array.isArray(catalog) && catalog.vertical ? catalog.vertical : {};
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO signals_verticals (id, label, category, description, status, sensitive, catalog_version, metadata_json, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, category = excluded.category, description = excluded.description,
        status = excluded.status, sensitive = excluded.sensitive, catalog_version = excluded.catalog_version,
        metadata_json = excluded.metadata_json, synced_at = excluded.synced_at
    `).run(
      verticalId,
      stringValue(vertical.label, verticalId),
      stringValue(vertical.category, null),
      stringValue(vertical.description, null),
      stringValue(vertical.status, "dev_only"),
      truthy(vertical.sensitive) ? 1 : 0,
      stringValue(vertical.version, null),
      JSON.stringify(vertical),
      now,
    );
    const insert = store.sqlite.prepare(`
      INSERT INTO signals_variables (id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET label = excluded.label, value_type = excluded.value_type,
        unit_json = excluded.unit_json, category = excluded.category, sensitive = excluded.sensitive,
        definition_json = excluded.definition_json, updated_at = excluded.updated_at
    `);
    const tx = store.sqlite.transaction(() => {
      for (const entry of variables) {
        const id = stringValue(entry.id, "");
        if (!id) continue;
        insert.run(
          id,
          verticalId,
          stringValue(entry.label, id),
          stringValue(entry.valueType ?? entry.value_type, "text"),
          entry.unit ? JSON.stringify(entry.unit) : null,
          stringValue(entry.category, null),
          truthy(entry.sensitive) ? 1 : 0,
          JSON.stringify(entry),
          now,
        );
      }
    });
    tx();
    upsertRegistry(store.sqlite, "signals", "catalog", verticalId, { sensitive: truthy(vertical.sensitive), metadata: { count: variables.length } });
    scheduleSignalsObservationsSearchEvent({
      operation: "upsert",
      kind: "vertical",
      id: verticalId,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    for (const entry of variables) {
      const variableIdForSearch = stringValue(entry.id, "");
      if (!variableIdForSearch) continue;
      scheduleSignalsObservationsSearchEvent({
        operation: "upsert",
        kind: "variable",
        id: variableIdForSearch,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { verticalId, variables: variables.length, syncedAt: now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "observe") {
    const variableId = input.flags.variable || input.flags["variable-id"];
    if (!variableId) return usageError(input, "Usage: claw signals observe --variable ID --value JSON|TEXT [--vertical ID]");
    const variable = store.sqlite.prepare("SELECT vertical_id, sensitive FROM signals_variables WHERE id = ?").get(variableId) as { vertical_id: string; sensitive: number } | undefined;
    const verticalId = input.flags.vertical || input.flags["vertical-id"] || variable?.vertical_id;
    if (!verticalId) return usageError(input, "--vertical is required when the variable is not seeded");
    ensureSignalsVertical(store.sqlite, verticalId);
    if (!variable) ensureSignalsVariable(store.sqlite, verticalId, variableId);
    const now = nowIso();
    const id = input.flags.id || `obs-${randomUUID()}`;
    const value = input.flags.json ? JSON.parse(input.flags.json) : parseMaybeJson(input.flags.value ?? input.positionals.slice(2).join(" "));
    const pageId = input.flags.notes
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-signals-${id}`,
          title: input.flags.title || `${variableId} notes`,
          surface: "record_note",
          space: "signals",
          sourceRecordDomain: "signals_observations",
          sourceRecordId: id,
          sensitivity: variable?.sensitive ? "sensitive" : "normal",
          text: input.flags.notes,
          authorKind: input.flags["author-kind"] || "user",
          authorId: input.flags["author-id"] || null,
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO signals_observations (id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id, session_id, external_id, sensitive, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, unit_id = excluded.unit_id,
        recorded_at = excluded.recorded_at, source_json = excluded.source_json, notes = excluded.notes,
        page_id = excluded.page_id,
        session_id = excluded.session_id, external_id = excluded.external_id, sensitive = excluded.sensitive,
        updated_at = excluded.updated_at
    `).run(
      id,
      verticalId,
      variableId,
      JSON.stringify(value),
      input.flags.unit || input.flags["unit-id"] || null,
      input.flags.at || input.flags["recorded-at"] || now,
      input.flags.source ? JSON.stringify(parseMaybeJson(input.flags.source)) : "{}",
      null,
      pageId,
      input.flags["session-id"] || null,
      input.flags["external-id"] || null,
      variable?.sensitive ?? 0,
      now,
      now,
    );
    scheduleSignalsObservationsSearchEvent({
      operation: "upsert",
      kind: "observation",
      id,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, { id, verticalId, variableId, value, pageId, recordedAt: input.flags.at || input.flags["recorded-at"] || now });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const verticalId = input.flags.vertical || input.flags["vertical-id"];
    const variableId = input.flags.variable || input.flags["variable-id"];
    const limit = Math.max(1, Number(input.flags.limit ?? 200));
    const rows = variableId
      ? store.sqlite.prepare("SELECT * FROM signals_observations WHERE variable_id = ? ORDER BY recorded_at DESC LIMIT ?").all(variableId, limit)
      : verticalId
        ? store.sqlite.prepare("SELECT * FROM signals_observations WHERE vertical_id = ? ORDER BY recorded_at DESC LIMIT ?").all(verticalId, limit)
        : store.sqlite.prepare("SELECT * FROM signals_observations ORDER BY recorded_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw signals delete OBSERVATION_ID");
    const changes = store.sqlite.prepare("DELETE FROM signals_observations WHERE id = ?").run(id).changes;
    if (changes > 0) {
      scheduleSignalsObservationsSearchEvent({
        operation: "delete",
        kind: "observation",
        id,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, input.positionals[0] || "signals"));
}

function runKnowledgeCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "entity") {
    const id = input.flags.id || input.positionals[2] || `ent-${randomUUID()}`;
    const type = input.flags.type || "entity";
    const label = input.flags.label || input.flags.name || input.positionals.slice(3).join(" ") || id;
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO knowledge_entities (id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET type = excluded.type, label = excluded.label, description = excluded.description,
        properties_json = excluded.properties_json, sensitivity = excluded.sensitivity, source = excluded.source,
        provenance_json = excluded.provenance_json, updated_at = excluded.updated_at
    `).run(
      id,
      type,
      label,
      input.flags.description || null,
      input.flags.properties ? JSON.stringify(parseMaybeJson(input.flags.properties)) : "{}",
      input.flags.sensitivity || "normal",
      input.flags.source || "manual",
      input.flags.provenance ? JSON.stringify(parseMaybeJson(input.flags.provenance)) : "{}",
      now,
      now,
    );
    scheduleKnowledgeGraphSearchEvent({
      operation: "upsert",
      kind: "entity",
      id,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM knowledge_entities WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "fact" || command === "promote") {
    const id = input.flags.id || `fact-${randomUUID()}`;
    const predicate = input.flags.predicate || input.flags.key || input.positionals[2];
    if (!predicate) return usageError(input, "Usage: claw knowledge fact --predicate KEY --value JSON|TEXT [--subject ID]");
    const objectValue = input.flags.json ? JSON.parse(input.flags.json) : parseMaybeJson(input.flags.value ?? input.positionals.slice(3).join(" "));
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO knowledge_facts (id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json, sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET subject_id = excluded.subject_id, predicate = excluded.predicate,
        object_kind = excluded.object_kind, object_value_json = excluded.object_value_json, confidence = excluded.confidence,
        scope_json = excluded.scope_json, sensitivity = excluded.sensitivity, source = excluded.source,
        provenance_json = excluded.provenance_json, supersedes_id = excluded.supersedes_id,
        valid_from = excluded.valid_from, valid_to = excluded.valid_to, updated_at = excluded.updated_at
    `).run(
      id,
      input.flags.subject || input.flags["subject-id"] || "user:me",
      predicate,
      input.flags["object-kind"] || "literal",
      JSON.stringify(objectValue),
      input.flags.confidence ? Number(input.flags.confidence) : null,
      input.flags.scope ? JSON.stringify(parseMaybeJson(input.flags.scope)) : "{}",
      input.flags.sensitivity || "normal",
      input.flags.source || (command === "promote" ? "promotion" : "manual"),
      input.flags.provenance ? JSON.stringify(parseMaybeJson(input.flags.provenance)) : "{}",
      input.flags.supersedes || null,
      input.flags["valid-from"] || null,
      input.flags["valid-to"] || null,
      now,
      now,
    );
    scheduleKnowledgeGraphSearchEvent({
      operation: "upsert",
      kind: "fact",
      id,
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM knowledge_facts WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const kind = input.flags.kind || "facts";
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const rows = kind === "entities"
      ? store.sqlite.prepare("SELECT * FROM knowledge_entities ORDER BY updated_at DESC LIMIT ?").all(limit)
      : store.sqlite.prepare("SELECT * FROM knowledge_facts ORDER BY updated_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "search") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw knowledge search QUERY [--json]");
    const like = `%${query}%`;
    const entities = store.sqlite.prepare("SELECT * FROM knowledge_entities WHERE label LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT 25").all(like, like).map(normalizeDbRow);
    const facts = store.sqlite.prepare("SELECT * FROM knowledge_facts WHERE predicate LIKE ? OR object_value_json LIKE ? ORDER BY updated_at DESC LIMIT 25").all(like, like).map(normalizeDbRow);
    writeSuccess(input, { entities, facts });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "knowledge"));
}

function runNotesCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "create" || command === "record-note") {
    const title = input.flags.title || input.positionals[2] || "Untitled";
    const text = input.flags.body || input.flags.text || input.flags.content || input.positionals.slice(3).join(" ");
    const result = upsertPageWithBlocks(store.sqlite, {
      id: input.flags.id,
      title,
      text,
      space: input.flags.space || (command === "record-note" ? "records" : "notes"),
      surface: input.flags.surface || (command === "record-note" ? "record_note" : "note"),
      visibility: input.flags.visibility || "private",
      sensitivity: input.flags.sensitivity || "normal",
      tags: parseCsvOrJson(input.flags.tags),
      sourceRecordDomain: input.flags["record-domain"] || null,
      sourceRecordId: input.flags["record-id"] || null,
      authorKind: input.flags["author-kind"] || "user",
      authorId: input.flags["author-id"] || null,
      properties: input.flags.properties ? parseMaybeJson(input.flags.properties) as JsonRecord : {},
    });
    scheduleNotesPagesSearchEvent({
      operation: "upsert",
      pageId: String(result.id),
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const space = input.flags.space;
    const surface = input.flags.surface;
    const rows = space
      ? store.sqlite.prepare("SELECT * FROM pages WHERE space = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(space, limit)
      : surface
        ? store.sqlite.prepare("SELECT * FROM pages WHERE surface = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(surface, limit)
        : store.sqlite.prepare("SELECT * FROM pages WHERE archived_at IS NULL ORDER BY updated_at DESC LIMIT ?").all(limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "get" || command === "export") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw notes get PAGE_ID [--format markdown] [--json]");
    const page = readPage(store.sqlite, id);
    if (!page) {
      writeSuccess(input, null);
      return V1_DATA_EXIT_FAILURE;
    }
    const format = input.flags.format || (command === "export" ? "markdown" : "json");
    writeSuccess(input, format === "markdown" ? { id, markdown: pageToMarkdown(page) } : page);
    return V1_DATA_EXIT_OK;
  }
  if (command === "search") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw notes search QUERY [--json]");
    rebuildNotesFts(store.sqlite);
    const limit = Math.max(1, Number(input.flags.limit ?? 25));
    const space = input.flags.space;
    const surface = input.flags.surface;
    const rows = space
      ? store.sqlite.prepare(`
          SELECT pages.*
          FROM notes_fts
          JOIN pages ON pages.id = notes_fts.page_id
          WHERE notes_fts MATCH ? AND pages.archived_at IS NULL AND pages.space = ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsPhrase(query), space, limit)
      : surface
        ? store.sqlite.prepare(`
            SELECT pages.*
            FROM notes_fts
            JOIN pages ON pages.id = notes_fts.page_id
            WHERE notes_fts MATCH ? AND pages.archived_at IS NULL AND pages.surface = ?
            ORDER BY rank
            LIMIT ?
          `).all(ftsPhrase(query), surface, limit)
        : store.sqlite.prepare(`
            SELECT pages.*
            FROM notes_fts
            JOIN pages ON pages.id = notes_fts.page_id
            WHERE notes_fts MATCH ? AND pages.archived_at IS NULL
            ORDER BY rank
            LIMIT ?
          `).all(ftsPhrase(query), limit);
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "update" || command === "import") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw notes update PAGE_ID --body TEXT|--from FILE");
    const rawText = input.flags.from ? fs.readFileSync(path.resolve(input.cwd, expandHome(input.flags.from)), "utf8") : (input.flags.body || input.flags.text || input.flags.content || input.positionals.slice(3).join(" "));
    const parsed = markdownToPagePatch(rawText);
    const existing = readPage(store.sqlite, id);
    const result = upsertPageWithBlocks(store.sqlite, {
      id,
      title: input.flags.title || parsed.title || stringValue(existing?.title, "Untitled") || "Untitled",
      text: parsed.body,
      space: input.flags.space || stringValue(existing?.space, "notes") || "notes",
      surface: input.flags.surface || stringValue(existing?.surface, "note") || "note",
      visibility: input.flags.visibility || stringValue(existing?.visibility, "private") || "private",
      sensitivity: input.flags.sensitivity || stringValue(existing?.sensitivity, "normal") || "normal",
      tags: parseCsvOrJson(input.flags.tags) ?? (Array.isArray(existing?.tags) ? existing.tags.filter((tag): tag is string => typeof tag === "string") : []),
      authorKind: input.flags["author-kind"] || "user",
      authorId: input.flags["author-id"] || stringValue(existing?.authorId, null),
      sourceRecordDomain: stringValue(existing?.sourceRecordDomain, null),
      sourceRecordId: stringValue(existing?.sourceRecordId, null),
      properties: isRecord(existing?.properties) ? existing.properties : {},
    });
    scheduleNotesPagesSearchEvent({
      operation: "upsert",
      pageId: String(result.id),
      dataDir: resolveClawjsDataRoot(),
      flags: input.flags,
    });
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  if (command === "link") {
    const source = input.flags.source || input.positionals[2];
    const target = input.flags.target || input.positionals[3];
    if (!source || !target) return usageError(input, "Usage: claw notes link SOURCE_PAGE TARGET_PAGE");
    const now = nowIso();
    const id = input.flags.id || `link-${randomUUID()}`;
    store.sqlite.prepare(`
      INSERT OR IGNORE INTO page_links (id, source_page_id, target_page_id, relation, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, source, target, input.flags.relation || "related", now);
    writeSuccess(input, { id, sourcePageId: source, targetPageId: target, relation: input.flags.relation || "related" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw notes delete PAGE_ID");
    const now = nowIso();
    const changes = store.sqlite.prepare("UPDATE pages SET archived_at = ?, updated_at = ? WHERE id = ?").run(now, now, id).changes;
    if (changes > 0) {
      scheduleNotesPagesSearchEvent({
        operation: "delete",
        pageId: id,
        dataDir: resolveClawjsDataRoot(),
        flags: input.flags,
      });
    }
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "notes"));
}

function runWikiCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const notesInput: V1DataCliInput = {
    ...input,
    positionals: ["notes", ...input.positionals.slice(1)],
    flags: {
      space: "wiki",
      surface: "wiki_page",
      ...input.flags,
    },
  };
  return runNotesCommand(notesInput, store);
}

function runProfileCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "refresh") {
    const result = refreshProfileProjection(store.sqlite);
    writeSuccess(input, result);
    return V1_DATA_EXIT_OK;
  }
  if (command === "get" || command === "list") {
    if (command === "get") refreshProfileProjection(store.sqlite);
    const section = input.flags.section || input.positionals[2];
    const rows = section
      ? store.sqlite.prepare("SELECT * FROM profile_projection WHERE section = ? ORDER BY refreshed_at DESC").all(section)
      : store.sqlite.prepare("SELECT * FROM profile_projection ORDER BY section, refreshed_at DESC").all();
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "profile"));
}

function runProductivityCommand(input: V1DataCliInput, store: DatabaseServiceStore, group: string): number {
  const command = input.positionals[1];
  const kind = group.endsWith("s") ? group.slice(0, -1) : group;
  if (command === "create") {
    const title = input.flags.title || input.positionals.slice(2).join(" ");
    if (!title) return usageError(input, `Usage: claw ${group} create TITLE [--json]`);
    const now = nowIso();
    const id = input.flags.id || `${kind}-${randomUUID()}`;
    const pageId = input.flags.notes || input.flags.body
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-${id}`,
          title: `${title} notes`,
          text: input.flags.notes || input.flags.body || "",
          space: "tasks",
          surface: "record_note",
          sourceRecordDomain: "productivity_items",
          sourceRecordId: id,
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO productivity_items (id, kind, title, status, due_at, anchor_type, anchor_id, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, status = excluded.status,
        due_at = excluded.due_at, anchor_type = excluded.anchor_type, anchor_id = excluded.anchor_id,
        page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, kind, title, input.flags.status || "active", input.flags.due || input.flags["due-at"] || null, input.flags["anchor-type"] || null, input.flags["anchor-id"] || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM productivity_items WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM productivity_items WHERE kind = ? ORDER BY COALESCE(due_at, updated_at) ASC LIMIT ?").all(kind, Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  if (command === "update" || command === "done") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, `Usage: claw ${group} ${command} ID`);
    const existing = store.sqlite.prepare("SELECT * FROM productivity_items WHERE id = ?").get(id) as {
      title: string;
      status: string;
      due_at: string | null;
      metadata_json: string;
    } | undefined;
    if (!existing) {
      writeSuccess(input, null);
      return V1_DATA_EXIT_FAILURE;
    }
    const now = nowIso();
    store.sqlite.prepare(`
      UPDATE productivity_items SET title = ?, status = ?, due_at = ?, metadata_json = ?, updated_at = ? WHERE id = ?
    `).run(
      input.flags.title || existing.title,
      command === "done" ? "done" : (input.flags.status || existing.status),
      input.flags.due || input.flags["due-at"] || existing.due_at || null,
      input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : existing.metadata_json,
      now,
      id,
    );
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM productivity_items WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, `Usage: claw ${group} delete ID`);
    const changes = store.sqlite.prepare("DELETE FROM productivity_items WHERE id = ?").run(id).changes;
    writeSuccess(input, { deleted: changes > 0, id });
    return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, group));
}

function runBusinessCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  return runSimpleRecordCommand(input, store, {
    table: "business_records",
    defaultKind: "record",
    idPrefix: "biz",
    usageGroup: "business",
    fields: ["id", "kind", "name", "status", "page_id", "metadata_json", "created_at", "updated_at"],
  });
}

function runContentCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || `content-${randomUUID()}`;
    const title = input.flags.title || input.positionals.slice(2).join(" ") || id;
    const pageId = input.flags.body || input.flags.content
      ? upsertPageWithBlocks(store.sqlite, { id: input.flags["page-id"] || `page-${id}`, title, text: input.flags.body || input.flags.content || "", space: "content", surface: "content_entry", sourceRecordDomain: "content_items", sourceRecordId: id }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO content_items (id, kind, title, status, brand_id, campaign_id, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, status = excluded.status,
        brand_id = excluded.brand_id, campaign_id = excluded.campaign_id, page_id = excluded.page_id,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "entry", title, input.flags.status || "draft", input.flags["brand-id"] || null, input.flags["campaign-id"] || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM content_items WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM content_items ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow), opsSidecars: ["publication-runs", "webhook-deliveries", "provider-logs"] });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "content_items", "content");
}

function runSocialCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || `post-${randomUUID()}`;
    const title = input.flags.title || input.positionals.slice(2).join(" ") || id;
    const pageId = input.flags.body || input.flags.content
      ? upsertPageWithBlocks(store.sqlite, { id: input.flags["page-id"] || `page-${id}`, title, text: input.flags.body || input.flags.content || "", space: "social", surface: "social_post", sourceRecordDomain: "social_posts", sourceRecordId: id }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO social_posts (id, title, status, channel_json, scheduled_at, published_at, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, status = excluded.status, channel_json = excluded.channel_json,
        scheduled_at = excluded.scheduled_at, published_at = excluded.published_at, page_id = excluded.page_id,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, title, input.flags.status || "draft", input.flags.channel ? JSON.stringify(parseMaybeJson(input.flags.channel)) : "{}", input.flags["scheduled-at"] || null, input.flags["published-at"] || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM social_posts WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM social_posts ORDER BY COALESCE(scheduled_at, updated_at) DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow), opsSidecars: ["queues", "webhook-deliveries", "raw-metrics"] });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "social_posts", "social");
}

function runFinanceCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "upsert") {
    const now = nowIso();
    const id = input.flags.id || input.positionals[2] || `finance-${randomUUID()}`;
    const amount = input.flags.amount ?? input.positionals[3];
    if (amount === undefined) return usageError(input, "Usage: claw finance upsert --id ID --amount NUMBER [--currency USD]");
    const pageId = input.flags.notes || input.flags.body
      ? upsertPageWithBlocks(store.sqlite, {
          id: input.flags["page-id"] || `page-${id}`,
          title: `${input.flags.kind || "transaction"} notes`,
          text: input.flags.notes || input.flags.body || "",
          space: "finance",
          surface: "record_note",
          sourceRecordDomain: "finance_records",
          sourceRecordId: id,
          sensitivity: input.flags.sensitivity || "sensitive",
        }).id
      : input.flags["page-id"] || null;
    store.sqlite.prepare(`
      INSERT INTO finance_records (id, kind, account_id, amount, currency, occurred_at, merchant, category, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, account_id = excluded.account_id,
        amount = excluded.amount, currency = excluded.currency, occurred_at = excluded.occurred_at,
        merchant = excluded.merchant, category = excluded.category, page_id = excluded.page_id,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "transaction", input.flags["account-id"] || null, Number(amount), input.flags.currency || "USD", input.flags.at || input.flags["occurred-at"] || now, input.flags.merchant || null, input.flags.category || null, pageId, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM finance_records WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM finance_records ORDER BY occurred_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "finance_records", "finance");
}

function runCalendarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "create" || command === "update") {
    const id = input.flags.id || input.positionals[2] || `event-${randomUUID()}`;
    const existing = store.sqlite.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as JsonRecord | undefined;
    const title = input.flags.title || (command === "create" ? input.positionals.slice(2).join(" ") : stringValue(existing?.title, id));
    const startsAt = input.flags.start || input.flags["starts-at"] || stringValue(existing?.startsAt, nowIso());
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO calendar_events (id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
        calendar_id = excluded.calendar_id, source = excluded.source, external_id = excluded.external_id,
        page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
    `).run(id, title, startsAt, input.flags.end || input.flags["ends-at"] || null, input.flags["calendar-id"] || null, input.flags.source || "clawjs", input.flags["external-id"] || null, input.flags["page-id"] || null, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM calendar_events WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM calendar_events ORDER BY starts_at ASC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "calendar_events", "calendar");
}

function runIotConfigCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const action = input.positionals[2] || "list";
  if (action === "set" || action === "upsert") {
    const id = input.flags.id || input.positionals[3];
    const name = input.flags.name || id;
    if (!id || !name) return usageError(input, "Usage: claw iot config set ID --name NAME [--kind KIND] [--secret-ref REF]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO iot_config (id, kind, name, config_json, secret_ref, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, name = excluded.name, config_json = excluded.config_json,
        secret_ref = excluded.secret_ref, enabled = excluded.enabled, updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "device", name, input.flags.config ? JSON.stringify(parseMaybeJson(input.flags.config)) : "{}", input.flags["secret-ref"] || null, truthy(input.flags.enabled ?? "true") ? 1 : 0, now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM iot_config WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (action === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM iot_config ORDER BY kind, name LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete({ ...input, positionals: ["iot", action, ...input.positionals.slice(3)] }, store, "iot_config", "iot config");
}

function runMarketplaceCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const action = input.positionals[2] || "list";
  if (action === "upsert" || action === "set") {
    const id = input.flags.id || input.positionals[3] || `choice-${randomUUID()}`;
    const target = input.flags.target || input.positionals[4];
    const choice = input.flags.choice || input.positionals[5];
    if (!target || !choice) return usageError(input, "Usage: claw marketplace choice upsert --target TARGET --choice CHOICE [--kind KIND]");
    const now = nowIso();
    store.sqlite.prepare(`
      INSERT INTO marketplace_choices (id, kind, target, choice, status, rationale, metadata_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, target = excluded.target, choice = excluded.choice,
        status = excluded.status, rationale = excluded.rationale, metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(id, input.flags.kind || "selection", target, choice, input.flags.status || "active", input.flags.rationale || null, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
    writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM marketplace_choices WHERE id = ?").get(id) as JsonRecord));
    return V1_DATA_EXIT_OK;
  }
  if (action === "list") {
    const target = input.flags.target;
    const rows = target
      ? store.sqlite.prepare("SELECT * FROM marketplace_choices WHERE target = ? ORDER BY updated_at DESC LIMIT ?").all(target, Math.max(1, Number(input.flags.limit ?? 100)))
      : store.sqlite.prepare("SELECT * FROM marketplace_choices ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete({ ...input, positionals: ["marketplace", action, ...input.positionals.slice(3)] }, store, "marketplace_choices", "marketplace choice");
}

function runLedgerCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "entry") {
    const action = input.positionals[2] || "upsert";
    if (action === "upsert" || action === "create") {
      const id = input.flags.id || input.positionals[3] || `entry-${randomUUID()}`;
      const description = input.flags.description || input.flags.memo || input.positionals.slice(4).join(" ") || id;
      const now = nowIso();
      store.sqlite.prepare(`
        INSERT INTO accounting_entries (id, entity_id, period_id, entry_date, description, status, page_id, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET entity_id = excluded.entity_id, period_id = excluded.period_id,
          entry_date = excluded.entry_date, description = excluded.description, status = excluded.status,
          page_id = excluded.page_id, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(id, input.flags["entity-id"] || null, input.flags["period-id"] || null, input.flags.date || input.flags["entry-date"] || now.slice(0, 10), description, input.flags.status || "draft", input.flags["page-id"] || null, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}", now, now);
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM accounting_entries WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
    if (action === "list") {
      const rows = store.sqlite.prepare("SELECT * FROM accounting_entries ORDER BY entry_date DESC, updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    return runRecordGetDelete({ ...input, positionals: ["ledger", action, ...input.positionals.slice(3)] }, store, "accounting_entries", "ledger entry");
  }
  if (command === "line") {
    const action = input.positionals[2] || "add";
    if (action === "add" || action === "upsert") {
      const id = input.flags.id || input.positionals[3] || `line-${randomUUID()}`;
      const entryId = input.flags["entry-id"] || input.positionals[4];
      const accountCode = input.flags["account-code"] || input.flags.account || input.positionals[5];
      const amount = input.flags.amount ?? input.positionals[6];
      if (!entryId || !accountCode || amount === undefined) return usageError(input, "Usage: claw ledger line add --entry-id ENTRY --account-code ACCOUNT --amount NUMBER");
      const now = nowIso();
      const numericAmount = Number(amount);
      const side = input.flags.side || (numericAmount >= 0 ? "debit" : "credit");
      store.sqlite.prepare(`
        INSERT INTO accounting_lines (id, entry_id, account_code, side, amount_cents, currency, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET entry_id = excluded.entry_id, account_code = excluded.account_code,
          side = excluded.side, amount_cents = excluded.amount_cents, currency = excluded.currency,
          metadata_json = excluded.metadata_json
      `).run(id, entryId, accountCode, side, Math.round(Math.abs(numericAmount) * 100), input.flags.currency || "USD", input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}");
      upsertRegistry(store.sqlite, "ledger", "line", id, { metadata: { entryId, updatedAt: now } });
      writeSuccess(input, normalizeDbRow(store.sqlite.prepare("SELECT * FROM accounting_lines WHERE id = ?").get(id) as JsonRecord));
      return V1_DATA_EXIT_OK;
    }
    if (action === "list") {
      const entryId = input.flags["entry-id"];
      const rows = entryId
        ? store.sqlite.prepare("SELECT * FROM accounting_lines WHERE entry_id = ? ORDER BY id LIMIT ?").all(entryId, Math.max(1, Number(input.flags.limit ?? 100)))
        : store.sqlite.prepare("SELECT * FROM accounting_lines ORDER BY entry_id, id LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
      writeSuccess(input, { items: rows.map(normalizeDbRow) });
      return V1_DATA_EXIT_OK;
    }
    return runRecordGetDelete({ ...input, positionals: ["ledger", action, ...input.positionals.slice(3)] }, store, "accounting_lines", "ledger line");
  }
  if (command === "list") {
    const rows = store.sqlite.prepare("SELECT * FROM accounting_entries ORDER BY entry_date DESC, updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100)));
    writeSuccess(input, { items: rows.map(normalizeDbRow) });
    return V1_DATA_EXIT_OK;
  }
  return runRecordGetDelete(input, store, "accounting_entries", "ledger");
}

function runSearchCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "rebuild") {
    const rebuilt = rebuildNotesFts(store.sqlite);
    const sidecar = rebuildSearchSidecar(store.sqlite);
    upsertRegistry(store.sqlite, "search", "sidecar", "global-search", { path: path.join(resolveClawjsDataRoot(), "search.sqlite"), metadata: { reconstructible: true, rebuilt } });
    writeSuccess(input, { rebuilt, sidecar: "search.sqlite", sidecarDocuments: sidecar, canonical: "main-db" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "query") {
    const query = input.flags.query || input.flags.q || input.positionals.slice(2).join(" ");
    if (!query) return usageError(input, "Usage: claw search query TEXT [--json]");
    rebuildNotesFts(store.sqlite);
    rebuildSearchSidecar(store.sqlite);
    const limit = Math.max(1, Number(input.flags.limit ?? 25));
    const pages = store.sqlite.prepare(`
      SELECT pages.*
      FROM notes_fts
      JOIN pages ON pages.id = notes_fts.page_id
      WHERE notes_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsPhrase(query), limit).map(normalizeDbRow);
    const knowledge = store.sqlite.prepare("SELECT * FROM knowledge_facts WHERE predicate LIKE ? OR object_value_json LIKE ? ORDER BY updated_at DESC LIMIT ?").all(`%${query}%`, `%${query}%`, limit).map(normalizeDbRow);
    const global = querySearchSidecar(query, limit);
    writeSuccess(input, { pages, knowledge, global });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "search"));
}

function runAudioSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "index") {
    const file = input.flags.file || input.flags.path || input.positionals[2];
    if (!file) return usageError(input, "Usage: claw audio index --file PATH [--session-id ID] [--transcript TEXT] [--json]");
    const filePath = path.resolve(input.cwd, expandHome(file));
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const now = nowIso();
    const id = input.flags.id || `audio-${randomUUID()}`;
    const sqlite = openSidecar("audio.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO audio_items (id, session_id, message_id, path, content_type, duration_ms, size_bytes, transcript_text, transcript_source, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, message_id = excluded.message_id,
          path = excluded.path, content_type = excluded.content_type, duration_ms = excluded.duration_ms,
          size_bytes = excluded.size_bytes, transcript_text = excluded.transcript_text,
          transcript_source = excluded.transcript_source, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(
        id,
        input.flags["session-id"] || null,
        input.flags["message-id"] || null,
        filePath,
        input.flags["content-type"] || guessContentType(filePath),
        input.flags["duration-ms"] ? Number(input.flags["duration-ms"]) : null,
        stat?.size ?? null,
        input.flags.transcript || null,
        input.flags["transcript-source"] || (input.flags.transcript ? "manual" : null),
        now,
        now,
        input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}",
      );
      sqlite.prepare("DELETE FROM audio_fts WHERE item_id = ?").run(id);
      sqlite.prepare("INSERT INTO audio_fts (item_id, transcript, path) VALUES (?, ?, ?)").run(id, input.flags.transcript || "", filePath);
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, "conversation-artifacts", "audio", id, { path: filePath, metadata: { sessionId: input.flags["session-id"] || null } });
    writeSuccess(input, { id, path: filePath, sidecar: "audio.sqlite", sizeBytes: stat?.size ?? null });
    return V1_DATA_EXIT_OK;
  }
  if (command === "transcript") {
    const id = input.flags.id || input.positionals[2];
    const text = input.flags.text || input.flags.transcript || input.positionals.slice(3).join(" ");
    if (!id || !text) return usageError(input, "Usage: claw audio transcript AUDIO_ID --text TEXT [--json]");
    const sqlite = openSidecar("audio.sqlite");
    try {
      const now = nowIso();
      const changes = sqlite.prepare("UPDATE audio_items SET transcript_text = ?, transcript_source = ?, updated_at = ? WHERE id = ?").run(text, input.flags.source || "manual", now, id).changes;
      sqlite.prepare("DELETE FROM audio_fts WHERE item_id = ?").run(id);
      const row = sqlite.prepare("SELECT path FROM audio_items WHERE id = ?").get(id) as { path: string } | undefined;
      sqlite.prepare("INSERT INTO audio_fts (item_id, transcript, path) VALUES (?, ?, ?)").run(id, text, row?.path ?? "");
      writeSuccess(input, { updated: changes > 0, id });
      return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
    } finally {
      sqlite.close();
    }
  }
  if (command === "artifact") {
    return runSidecarArtifactCommand(input, "audio.sqlite", "audio_items", "audio");
  }
  return usageError(input, usage(input.binName, "audio"));
}

function runDriveSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "index" || command === "attach") {
    const file = input.flags.file || input.flags.path || input.positionals[2];
    if (!file) return usageError(input, "Usage: claw drive index --file PATH [--session-id ID] [--json]");
    const filePath = path.resolve(input.cwd, expandHome(file));
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const now = nowIso();
    const id = input.flags.id || `drive-${randomUUID()}`;
    const name = input.flags.name || path.basename(filePath);
    const sqlite = openSidecar("drive.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO drive_items (id, parent_id, session_id, message_id, kind, name, path, content_type, size_bytes, checksum, created_at, updated_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET parent_id = excluded.parent_id, session_id = excluded.session_id,
          message_id = excluded.message_id, kind = excluded.kind, name = excluded.name, path = excluded.path,
          content_type = excluded.content_type, size_bytes = excluded.size_bytes, checksum = excluded.checksum,
          metadata_json = excluded.metadata_json, updated_at = excluded.updated_at
      `).run(
        id,
        input.flags["parent-id"] || null,
        input.flags["session-id"] || null,
        input.flags["message-id"] || null,
        input.flags.kind || "file",
        name,
        filePath,
        input.flags["content-type"] || guessContentType(filePath),
        stat?.size ?? null,
        input.flags.checksum || null,
        now,
        now,
        input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}",
      );
      sqlite.prepare("DELETE FROM drive_fts WHERE item_id = ?").run(id);
      sqlite.prepare("INSERT INTO drive_fts (item_id, name, path, metadata) VALUES (?, ?, ?, ?)").run(id, name, filePath, input.flags.metadata || "");
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, "conversation-artifacts", "drive-item", id, { path: filePath, metadata: { sessionId: input.flags["session-id"] || null, name } });
    writeSuccess(input, { id, name, path: filePath, sidecar: "drive.sqlite", sizeBytes: stat?.size ?? null });
    return V1_DATA_EXIT_OK;
  }
  if (command === "artifact") {
    return runSidecarArtifactCommand(input, "drive.sqlite", "drive_items", "drive");
  }
  return usageError(input, usage(input.binName, "drive"));
}

function runRuntimeSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[1];
  if (command === "queue") {
    const title = input.flags.title || input.positionals.slice(2).join(" ") || "Runtime job";
    const now = nowIso();
    const id = input.flags.id || `job-${randomUUID()}`;
    const sqlite = openSidecar("runtime.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO runtime_jobs (id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, 'queued', NULL, ?, 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, run_at = excluded.run_at,
          payload_json = excluded.payload_json, updated_at = excluded.updated_at
      `).run(id, input.flags.kind || "job", title, input.flags["run-at"] || now, input.flags.payload ? JSON.stringify(parseMaybeJson(input.flags.payload)) : "{}", now, now);
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, "runtime", "job", id, { metadata: { status: "queued" } });
    writeSuccess(input, { id, title, status: "queued", sidecar: "runtime.sqlite" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "job") {
    const action = input.positionals[2] || "list";
    const sqlite = openSidecar("runtime.sqlite");
    try {
      if (action === "list") {
        const rows = sqlite.prepare("SELECT * FROM runtime_jobs ORDER BY updated_at DESC LIMIT ?").all(Math.max(1, Number(input.flags.limit ?? 100))).map(normalizeDbRow);
        writeSuccess(input, { items: rows });
        return V1_DATA_EXIT_OK;
      }
      const id = input.flags.id || input.positionals[3];
      if (!id) return usageError(input, "Usage: claw runtime job get|delete ID [--json]");
      if (action === "get") {
        const row = sqlite.prepare("SELECT * FROM runtime_jobs WHERE id = ?").get(id) as JsonRecord | undefined;
        writeSuccess(input, row ? normalizeDbRow(row) : null);
        return row ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
      }
      if (action === "delete") {
        const changes = sqlite.prepare("DELETE FROM runtime_jobs WHERE id = ?").run(id).changes;
        writeSuccess(input, { deleted: changes > 0, id });
        return changes > 0 ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
      }
    } finally {
      sqlite.close();
    }
  }
  if (command === "event") {
    const now = nowIso();
    const sqlite = openSidecar("runtime.sqlite");
    try {
      sqlite.prepare(`
        INSERT INTO runtime_events (id, job_id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.flags.id || `event-${randomUUID()}`, input.flags["job-id"] || null, input.flags.kind || "event", input.flags.level || "info", input.flags.message || input.positionals.slice(2).join(" "), now, input.flags.metadata ? JSON.stringify(parseMaybeJson(input.flags.metadata)) : "{}");
    } finally {
      sqlite.close();
    }
    writeSuccess(input, { recorded: true, sidecar: "runtime.sqlite" });
    return V1_DATA_EXIT_OK;
  }
  if (command === "retention") {
    const days = Math.max(1, Number(input.flags.days ?? 30));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sqlite = openSidecar("runtime.sqlite");
    try {
      const events = sqlite.prepare("DELETE FROM runtime_events WHERE created_at < ?").run(cutoff).changes;
      const jobs = sqlite.prepare("DELETE FROM runtime_jobs WHERE updated_at < ? AND status IN ('done','failed','cancelled')").run(cutoff).changes;
      writeSuccess(input, { cutoff, deleted: { runtimeEvents: events, runtimeJobs: jobs } });
      return V1_DATA_EXIT_OK;
    } finally {
      sqlite.close();
    }
  }
  return usageError(input, usage(input.binName, "runtime"));
}

function runOperationalSidecarCommand(input: V1DataCliInput, store: DatabaseServiceStore, filename: string, domain: string): number {
  const command = input.positionals[1];
  if (command === "event" || command === "metric") {
    const now = nowIso();
    const id = input.flags.id || `${domain}-${randomUUID()}`;
    const kind = command === "metric" ? (input.flags.kind || "metric") : (input.flags.kind || "event");
    const level = command === "metric" ? (input.flags.level || "info") : (input.flags.level || "info");
    const message = input.flags.message || input.positionals.slice(2).join(" ") || "";
    const metadata = input.flags.metadata ? parseMaybeJson(input.flags.metadata) : {};
    const sqlite = openSidecar(filename);
    try {
      sqlite.prepare(`
        INSERT INTO operational_events (id, kind, level, message, created_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, level = excluded.level,
          message = excluded.message, metadata_json = excluded.metadata_json
      `).run(id, kind, level, message, now, JSON.stringify(metadata));
    } finally {
      sqlite.close();
    }
    upsertRegistry(store.sqlite, domain, command === "metric" ? "metric" : "event", id, { metadata: { kind, level } });
    writeSuccess(input, { id, kind, level, message, sidecar: filename });
    return V1_DATA_EXIT_OK;
  }
  if (command === "list") {
    const kind = input.flags.kind;
    const limit = Math.max(1, Number(input.flags.limit ?? 100));
    const sqlite = openSidecar(filename);
    try {
      const rows = kind
        ? sqlite.prepare("SELECT * FROM operational_events WHERE kind = ? ORDER BY created_at DESC LIMIT ?").all(kind, limit)
        : sqlite.prepare("SELECT * FROM operational_events ORDER BY created_at DESC LIMIT ?").all(limit);
      writeSuccess(input, { items: rows.map(normalizeDbRow), sidecar: filename });
      return V1_DATA_EXIT_OK;
    } finally {
      sqlite.close();
    }
  }
  if (command === "retention") {
    const days = Math.max(1, Number(input.flags.days ?? 30));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const sqlite = openSidecar(filename);
    try {
      const events = sqlite.prepare("DELETE FROM operational_events WHERE created_at < ?").run(cutoff).changes;
      writeSuccess(input, { cutoff, deleted: { operationalEvents: events }, sidecar: filename });
      return V1_DATA_EXIT_OK;
    } finally {
      sqlite.close();
    }
  }
  return usageError(input, usage(input.binName, domain));
}

function runMcpCommand(input: V1DataCliInput): number {
  const command = input.positionals[1];
  const configPath = input.flags.config || path.join(os.homedir(), ".codex", "config.toml");
  if (command === "config-path") {
    const scope = input.flags.scope || input.positionals[2] || "user";
    const resolved = scope === "project"
      ? path.join(path.resolve(input.cwd, expandHome(input.flags.project || input.flags.cwd || input.cwd)), ".codex", "config.toml")
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
    writeUnredactedSuccess(input, { id, configPath, server: next });
    return V1_DATA_EXIT_OK;
  }
  if (command === "delete") {
    const id = input.flags.id || input.positionals[2];
    if (!id) return usageError(input, "Usage: claw mcp delete SERVER_ID [--json]");
    const current = readMcpServers(configPath);
    const items = current.filter((server) => server.id !== id);
    writeMcpServers(configPath, items);
    writeSuccess(input, { id, deleted: items.length !== current.length, configPath });
    return items.length !== current.length ? V1_DATA_EXIT_OK : V1_DATA_EXIT_FAILURE;
  }
  return usageError(input, usage(input.binName, "mcp"));
}

function runAppsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
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
    writeSuccess(input, { slug, name, rootPath: path.resolve(input.cwd, expandHome(rootPath)), updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "apps"));
}

function runDesignCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
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
    writeSuccess(input, { id, kind, name, updatedAt: now });
    return V1_DATA_EXIT_OK;
  }
  return usageError(input, usage(input.binName, "design"));
}

function runSkillsCommand(input: V1DataCliInput, store: DatabaseServiceStore): number {
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

function runSessionsIndexCommand(input: V1DataCliInput, store: DatabaseServiceStore): number | null {
  const command = input.positionals[1];
  if ((command === "list" || command === "search") && input.flags.workspace) {
    return null;
  }
  if (command === "index") {
    const roots = sessionRoots(input);
    const indexed = indexSessionRoots(store.sqlite, roots, input.flags.source || "codex");
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
