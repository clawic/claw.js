import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import Database from "better-sqlite3";

import { clawCliCommandRegistry, type ClawCliCommandRegistryEntry, type ClawCliSearchResult } from "@clawjs/core";
import {
  DEFAULT_SEARCH_BUDGETS,
  SEARCH_PROFILES,
  SearchStore,
  createBuiltinSearchSourceManifests,
  type SearchAction,
  type SearchActionExecutionPlan,
  type SearchDocumentInput,
  type SearchIndexJob,
  type SearchResult,
  type SearchSourceManifest,
  type SearchSourceState,
} from "@clawjs/search";

import type { CliContext } from "./index.ts";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { createCliWorkspaceClaw } from "./cli-claw-factory.ts";
import { readBooleanFlag } from "./cli-flag-parsers.ts";
import { writeCommandJsonError, writeCommandJsonOk, writeJsonOk } from "./cli-json.ts";
import { buildCommandHelp, searchCliDiscovery } from "./cli-surface.ts";
import { ensureGenerationsArtifactsSourceIndexed } from "./cli-search-generations-source.ts";
import { ensureImagesDerivedSourceIndexed, ensureMediaAssetsSourceIndexed } from "./cli-search-image-media-sources.ts";
import { pathSafeBasename, resolveRuntimeAdapterId } from "./cli-runtime-utils.ts";
import { resolveClawjsDataRoot, resolveClawjsMainDbPath } from "./v1-data.ts";

const SEARCH_ADMIN_COMMANDS = new Set(["sources", "status", "service", "profiles", "saved", "monitors", "actions", "audit", "jobs", "explain"]);
const WORKSPACE_SEARCH_DOMAINS = new Set([
  "areas",
  "tasks",
  "goals",
  "projects",
  "milestones",
  "activity",
  "blockers",
  "artifacts",
  "decisions",
  "work_sessions",
  "assignments",
  "handoffs",
  "approvals",
  "capacity",
  "reminders",
  "deadlines",
  "notes",
  "people",
  "inbox",
  "events",
]);

const BUILTIN_SEARCH_SOURCES: SearchSourceManifest[] = createBuiltinSearchSourceManifests();

interface SearchServiceStateFile {
  state: "ready" | "stopped" | "external_pending";
  mode: "embedded" | "daemon";
  pid?: number;
  startedAt?: string;
  stoppedAt?: string;
  heartbeatAt?: string;
  reason?: string;
  storage: { canonical: string; index: string; indexRebuildable: true };
  budgets: typeof DEFAULT_SEARCH_BUDGETS;
  worker?: { lastRunAt: string; claimed: number; completed: number; failed: number };
}

export function isSearchAdminCommand(command: string | undefined): boolean {
  return !!command && SEARCH_ADMIN_COMMANDS.has(command);
}

export async function runSearchQueryCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const query = input.positionals.slice(2).join(" ") || input.flags.query;
  if (!query) {
    input.context.stderr.write(`Usage: ${input.binName} search query <query> [--domains tasks,notes,...] [--shards hot,cold] [--strategy lexical|semantic|hybrid] [--json]\n`);
    return CLI_EXIT_USAGE;
  }
  const domains = parseListFlag(input.flags.domains);
  if (domains?.some((domain) => WORKSPACE_SEARCH_DOMAINS.has(domain))) {
    return await runWorkspaceSearchQueryCli(input, query, domains);
  }
  const store = openCliSearchStore(input.flags);
  try {
    registerBuiltinSources(store);
    const indexedCommands = sourceCanIndex(store, "commands") ? ensureCommandSourceIndexed(store) : 0;
    const sources = parseListFlag(input.flags.sources ?? input.flags.source);
    const shards = parseListFlag(input.flags.shards ?? input.flags.shard);
    const shouldRefreshDatabase = domains?.includes("database") || sources?.includes("database.records");
    const shouldRefreshDocuments = domains?.includes("documents") || sources?.includes("documents.blocks");
    const shouldRefreshImages = domains?.includes("images") || sources?.includes("images.derived");
    const shouldRefreshMedia = domains?.includes("media") || sources?.includes("media.assets");
    const shouldRefreshGenerations = domains?.includes("generations") || sources?.includes("generations.artifacts");
    const shouldRefreshCode = domains?.includes("code") || sources?.includes("code.symbols");
    const shouldRefreshLocalFiles = domains?.includes("files") || sources?.includes("local.files");
    const shouldRefreshWeb = domains?.includes("web") || sources?.includes("web.ingested");
    const indexedDatabase = shouldRefreshDatabase && sourceCanIndex(store, "database.records") ? ensureDatabaseRecordsSourceIndexed(store, input.flags) : 0;
    const indexedDocuments = shouldRefreshDocuments && sourceCanIndex(store, "documents.blocks") ? ensureDocumentsBlocksSourceIndexed(store, input.flags) : 0;
    const indexedImages = shouldRefreshImages && sourceCanIndex(store, "images.derived") ? ensureImagesDerivedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedMedia = shouldRefreshMedia && sourceCanIndex(store, "media.assets") ? ensureMediaAssetsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedGenerations = shouldRefreshGenerations && sourceCanIndex(store, "generations.artifacts") ? ensureGenerationsArtifactsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedCode = shouldRefreshCode && sourceCanIndex(store, "code.symbols") ? ensureCodeSymbolsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedLocalFiles = shouldRefreshLocalFiles && sourceCanIndex(store, "local.files") ? ensureLocalFilesSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedWeb = shouldRefreshWeb && sourceCanIndex(store, "web.ingested") ? ensureWebIngestedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const filters = parseSearchFiltersFlag(input.flags.filters ?? input.flags.filter);
    const strategy = parseSearchStrategyFlag(input.flags.strategy);
    const embedding = parseSearchEmbeddingFlag(input.flags.embedding ?? input.flags["embedding-json"], input.flags["embedding-model"] ?? input.flags.model);
    const results = store.query({
      query,
      profile: input.flags.profile === "full" ? "full" : "framework",
      domains,
      sources,
      shards,
      filters,
      strategy,
      embedding,
      limit: input.flags.limit ? Number(input.flags.limit) : undefined,
      explain: input.flags.explain === "true" || input.flags.explain === "1",
      surface: input.flags.surface,
      actor: input.flags.actor,
    });
    if (searchQueryRequiresAudit(query, results.results, filters)) {
      store.recordAuditEvent({
        type: "sensitive_query",
        actor: input.flags.actor,
        surface: input.flags.surface,
        query,
        reason: "sensitive_query_or_redacted_result",
        metadata: {
          profile: input.flags.profile === "full" ? "full" : "framework",
          domains: domains ?? [],
          sources: sources ?? [],
          shards: shards ?? [],
          strategy: input.flags.strategy ?? "lexical",
          embeddingModel: embedding?.model,
          resultCount: results.results.length,
          redactedResultCount: results.results.filter((result) => result.permissions?.redacted).length,
        },
      });
    }
    const data = {
      ...results,
      strategy: strategy ?? "lexical",
      embeddingModel: embedding?.model,
      storage: searchStorageMetadata(input.flags),
      indexedFastPaths: {
        commands: indexedCommands,
        ...(shouldRefreshDatabase ? { "database.records": indexedDatabase } : {}),
        ...(shouldRefreshDocuments ? { "documents.blocks": indexedDocuments } : {}),
        ...(shouldRefreshImages ? { "images.derived": indexedImages } : {}),
        ...(shouldRefreshMedia ? { "media.assets": indexedMedia } : {}),
        ...(shouldRefreshGenerations ? { "generations.artifacts": indexedGenerations } : {}),
        ...(shouldRefreshCode ? { "code.symbols": indexedCode } : {}),
        ...(shouldRefreshLocalFiles ? { "local.files": indexedLocalFiles } : {}),
        ...(shouldRefreshWeb ? { "web.ingested": indexedWeb } : {}),
      },
    };
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "query" });
    } else {
      input.context.stdout.write(`${results.results.map((result) => `${result.domain}\t${result.score.toFixed(1)}\t${result.id}\t${result.title}`).join("\n")}\n`);
    }
    return results.results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
  } finally {
    store.close();
  }
}

async function runWorkspaceSearchQueryCli(input: {
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
}, query: string, domains: string[]): Promise<number> {
  const workspaceRoot = input.flags.workspace || input.context.cwd;
  const claw = await createCliWorkspaceClaw(
    resolveRuntimeAdapterId(input.flags),
    input.flags,
    workspaceRoot,
    input.flags["app-id"] || "clawjs-app",
    input.flags["workspace-id"] || pathSafeBasename(workspaceRoot),
    input.flags["agent-id"] || input.flags["workspace-id"] || pathSafeBasename(workspaceRoot),
    input.context.cwd,
  );
  const results = await claw.search.query({
    query,
    domains: domains as Array<"areas" | "tasks" | "goals" | "projects" | "milestones" | "activity" | "blockers" | "artifacts" | "decisions" | "work_sessions" | "assignments" | "handoffs" | "approvals" | "capacity" | "reminders" | "deadlines" | "notes" | "people" | "inbox" | "events">,
    strategy: input.flags.strategy as "auto" | "keyword" | "semantic" | "hybrid" | undefined,
    ...(input.flags.limit ? { limit: Number(input.flags.limit) } : {}),
    includeArchived: input.flags["include-archived"] === "true" || input.flags["include-archived"] === "1",
  });
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", results, { subcommand: "query" });
  else input.context.stdout.write(`${results.map((result) => `${result.domain} ${result.score.toFixed(1)} ${result.id} ${result.title}`).join("\n")}\n`);
  return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

export async function runSearchRebuildCli(input: {
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const store = openCliSearchStore(input.flags);
  try {
    const selectedSources = parseListFlag(input.flags.sources ?? input.flags.source);
    const knownSources = new Set(BUILTIN_SEARCH_SOURCES.map((source) => source.id));
    const unknownSources = (selectedSources ?? []).filter((source) => !knownSources.has(source));
    if (unknownSources.length) {
      const message = `Unknown search source(s): ${unknownSources.join(", ")}`;
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "search", { code: "unknown_source", message }, { subcommand: "rebuild" });
      else input.context.stderr.write(`${message}\n`);
      return CLI_EXIT_USAGE;
    }
    registerBuiltinSources(store);
    const preservedStates = new Map(store.sourceStatus().map((status) => [status.source, status.state]));
    if (selectedSources) store.resetSources(selectedSources);
    else store.reset();
    registerBuiltinSources(store, preservedStates);
    const rebuildsSource = (source: string) => (!selectedSources || selectedSources.includes(source)) && sourceCanIndex(store, source);
    const commandsIndexed = rebuildsSource("commands") ? ensureCommandSourceIndexed(store) : 0;
    const sessionsIndexed = rebuildsSource("sessions.chats") ? ensureSessionsChatsSourceIndexed(store, input.flags) : 0;
    const databaseIndexed = rebuildsSource("database.records") ? ensureDatabaseRecordsSourceIndexed(store, input.flags) : 0;
    const documentsIndexed = rebuildsSource("documents.blocks") ? ensureDocumentsBlocksSourceIndexed(store, input.flags) : 0;
    const imagesIndexed = rebuildsSource("images.derived") ? ensureImagesDerivedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const mediaIndexed = rebuildsSource("media.assets") ? ensureMediaAssetsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const generationsIndexed = rebuildsSource("generations.artifacts") ? ensureGenerationsArtifactsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const codeIndexed = rebuildsSource("code.symbols") ? ensureCodeSymbolsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const localFilesIndexed = rebuildsSource("local.files") ? ensureLocalFilesSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const webIndexed = rebuildsSource("web.ingested") ? ensureWebIngestedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedSourceIds = new Set([
      ...(commandsIndexed > 0 ? ["commands"] : []),
      ...(sessionsIndexed > 0 ? ["sessions.chats"] : []),
      ...(databaseIndexed > 0 ? ["database.records"] : []),
      ...(documentsIndexed > 0 ? ["documents.blocks"] : []),
      ...(imagesIndexed > 0 ? ["images.derived"] : []),
      ...(mediaIndexed > 0 ? ["media.assets"] : []),
      ...(generationsIndexed > 0 ? ["generations.artifacts"] : []),
      ...(codeIndexed > 0 ? ["code.symbols"] : []),
      ...(localFilesIndexed > 0 ? ["local.files"] : []),
      ...(webIndexed > 0 ? ["web.ingested"] : []),
    ]);
    const pendingScope = selectedSources ?? BUILTIN_SEARCH_SOURCES.map((source) => source.id);
    const pendingSources = BUILTIN_SEARCH_SOURCES
      .filter((source) => pendingScope.includes(source.id))
      .filter((source) => !indexedSourceIds.has(source.id) && sourceCanIndex(store, source.id))
      .map((source) => source.id);
    const data = {
      rebuilt: true,
      mode: selectedSources ? "scoped" : "full",
      selectedSources: selectedSources ?? null,
      reindexed: commandsIndexed + sessionsIndexed + databaseIndexed + documentsIndexed + imagesIndexed + mediaIndexed + generationsIndexed + codeIndexed + localFilesIndexed + webIndexed,
      embeddings: 0,
      profile: input.flags.profile === "full" ? "full" : "framework",
      storage: searchStorageMetadata(input.flags),
      sources: Array.from(indexedSourceIds),
      indexedBySource: {
        commands: commandsIndexed,
        "sessions.chats": sessionsIndexed,
        "database.records": databaseIndexed,
        "documents.blocks": documentsIndexed,
        "images.derived": imagesIndexed,
        "media.assets": mediaIndexed,
        "generations.artifacts": generationsIndexed,
        "code.symbols": codeIndexed,
        "local.files": localFilesIndexed,
        "web.ingested": webIndexed,
      },
      pendingSources,
      note: "Framework domain sources keep independent fast paths; heavyweight extractors remain async or explicit.",
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "rebuild" });
    else input.context.stdout.write(`reindexed=${data.reindexed} embeddings=0 index=search.sqlite\n`);
    return CLI_EXIT_OK;
  } finally {
    store.close();
  }
}

export async function runCliDiscoverySearch(input: {
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  usage: string;
}): Promise<number> {
  const query = input.positionals.slice(1).join(" ") || input.flags.query;
  if (!query) {
    input.context.stdout.write(`${buildCommandHelp(input.binName, "search") ?? input.usage}\n`);
    return CLI_EXIT_OK;
  }
  const limit = input.flags.limit ? Number(input.flags.limit) : 10;
  const results = mergeSearchResults([
    ...searchCliDiscovery(query, { limit }),
    ...searchRegisteredLocalFiles(query, input.context.cwd),
  ], limit);
  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, {
      query,
      results,
    }, {
      schemaVersion: 1,
      canonicalCommand: "search",
      mode: "deterministic-local-discovery",
    });
  } else {
    input.context.stdout.write(`${results.map((result) => `${result.type}\t${result.name}\t${result.canonicalName ?? ""}\t${result.summary}`).join("\n")}\n`);
  }
  return results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

export async function runSearchAdminCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  usage: string;
}): Promise<number> {
  const command = input.positionals[1];
  const profile = input.flags.profile === "full" ? "full" : "framework";
  if (command === "sources") {
    const action = input.positionals[2] ?? "list";
    const store = openCliSearchStore(input.flags);
    const sourceId = input.positionals[3] ?? input.flags.source;
    let data: {
      action: string;
      source?: string;
      state?: SearchSourceState;
      profile: string;
      sources: Array<{
        id: string;
        domain: string;
        name: string;
        profile: string;
        defaultState: string;
        state: string;
        fastPath: boolean;
        resultTypes: string[];
      }>;
    };
    try {
      registerBuiltinSources(store);
      if (["enable", "disable", "pause", "exclude", "resume"].includes(action)) {
        if (!sourceId) {
          input.context.stderr.write(`Usage: ${input.binName} search sources ${action} <source-id> [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const state = sourceStateForAction(action);
        store.setSourceState(sourceId, state, { error: null });
      }
      const statusById = new Map(store.sourceStatus().map((status) => [status.source, status]));
      const sources = BUILTIN_SEARCH_SOURCES
        .filter((source) => profile === "full" || source.profile === "framework")
        .map((source) => ({
          id: source.id,
          domain: source.domain,
          name: source.name,
          profile: source.profile,
          defaultState: source.indexing.defaultState,
          state: statusById.get(source.id)?.state ?? (source.indexing.defaultState === "on" ? "enabled" : "disabled"),
          fastPath: source.capabilities.fastPath,
          resultTypes: source.resultTypes,
        }));
      data = {
        action,
        ...(sourceId ? { source: sourceId, state: statusById.get(sourceId)?.state } : {}),
        profile,
        sources,
      };
    } finally {
      store.close();
    }
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "sources" });
    } else {
      input.context.stdout.write(`${data.sources.map((source) => `${source.id}\t${source.domain}\t${source.state}\t${source.name}`).join("\n")}\n`);
    }
    return CLI_EXIT_OK;
  }

  if (command === "status") {
    const store = openCliSearchStore(input.flags);
    let sources: Array<{ source: string; domain: string; state: string; backlog: number; fastPath: boolean; lastIndexedAt?: string; error?: string }>;
    try {
      registerBuiltinSources(store);
      const manifestById = new Map(BUILTIN_SEARCH_SOURCES.map((source) => [source.id, source]));
      sources = store.sourceStatus().map((status) => ({
        ...status,
        fastPath: manifestById.get(status.source)?.capabilities.fastPath ?? false,
      }));
    } finally {
      store.close();
    }
    const data = {
      state: "ready",
      profile,
      budgets: DEFAULT_SEARCH_BUDGETS,
      sources,
      storage: searchStorageMetadata(input.flags),
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "status" });
    else input.context.stdout.write(`state=${data.state} profile=${profile} sources=${sources.length} index=search.sqlite\n`);
    return CLI_EXIT_OK;
  }

  if (command === "service") {
    const action = input.positionals[2] ?? "status";
    const data = runSearchServiceAction(action, input);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "service" });
    else input.context.stdout.write(`state=${data.service.state} mode=${data.service.mode} index=search.sqlite queued=${data.queuedJobs}\n`);
    return data.service.state === "external_pending" ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
  }

  if (command === "profiles") {
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", { profiles: SEARCH_PROFILES }, { subcommand: "profiles" });
    else input.context.stdout.write(`${SEARCH_PROFILES.map((entry) => `${entry.id}\t${entry.defaultEnabled ? "default" : "opt-in"}\t${entry.label}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "saved" || command === "monitors") {
    const action = input.positionals[2] ?? "list";
    const store = openCliSearchStore(input.flags);
    let data: { action: string; item?: unknown; items: unknown[]; state: string };
    try {
      registerBuiltinSources(store);
      if (command === "saved" && (action === "create" || action === "upsert")) {
        const id = input.positionals[3] ?? input.flags.id;
        const query = input.flags.query ?? input.positionals.slice(4).join(" ");
        if (!id || !query) {
          input.context.stderr.write(`Usage: ${input.binName} search saved create <id> --query <query> [--name <name>] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = { id, name: input.flags.name ?? id, query: { query, profile } };
        store.saveSearch(item);
        data = { action, item, items: store.listSavedSearches(), state: "ready" };
      } else if (command === "monitors" && (action === "create" || action === "upsert")) {
        const id = input.positionals[3] ?? input.flags.id;
        const savedSearchId = input.flags["saved-search"] ?? input.flags["saved-search-id"] ?? input.positionals[4];
        if (!id || !savedSearchId) {
          input.context.stderr.write(`Usage: ${input.binName} search monitors create <id> --saved-search <saved-search-id> [--name <name>] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = {
          id,
          savedSearchId,
          name: input.flags.name,
          enabled: input.flags.enabled === undefined ? true : input.flags.enabled !== "false",
          cadence: input.flags.cadence,
        };
        store.saveMonitor(item);
        data = { action, item, items: store.listMonitors(), state: "ready" };
      } else {
        const items = command === "saved" ? store.listSavedSearches() : store.listMonitors();
        data = { action, items, state: items.length ? "ready" : "empty" };
      }
    } finally {
      store.close();
    }
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: command });
    else input.context.stdout.write(`${command}: ${data.state}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "audit") {
    const store = openCliSearchStore(input.flags);
    let items: ReturnType<SearchStore["listAuditEvents"]>;
    try {
      registerBuiltinSources(store);
      items = store.listAuditEvents({
        limit: input.flags.limit ? Number(input.flags.limit) : undefined,
        type: input.flags.type === "action" || input.flags.type === "sensitive_query" ? input.flags.type : undefined,
      });
    } finally {
      store.close();
    }
    const data = { items, state: items.length ? "ready" : "empty" };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "audit" });
    else input.context.stdout.write(`${items.map((item) => `${item.createdAt}\t${item.type}\t${item.source ?? ""}\t${item.resultId ?? ""}\t${item.status ?? ""}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "jobs") {
    const action = input.positionals[2] ?? "list";
    const store = openCliSearchStore(input.flags);
    let data: {
      action: string;
      item?: unknown;
      items: unknown[];
      state: string;
    };
    try {
      registerBuiltinSources(store);
      if (action === "enqueue" || action === "create") {
        const source = input.flags.source ?? input.positionals[4];
        const operation = parseSearchIndexJobOperation(input.flags.operation ?? input.flags.op ?? input.positionals[3]);
        if (!source || !operation) {
          input.context.stderr.write(`Usage: ${input.binName} search jobs enqueue <operation> --source <source-id> [--id <id>] [--shard <shard>] [--resource-id <id>] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = store.enqueueIndexJob({
          id: input.flags.id,
          source,
          shard: input.flags.shard,
          operation,
          resourceId: input.flags["resource-id"],
          payload: parseSearchJobPayloadFlag(input.flags.payload),
          priority: input.flags.priority ? Number(input.flags.priority) : undefined,
          scheduledAt: input.flags["scheduled-at"],
        });
        data = { action, item, items: store.listIndexJobs({ source, limit: input.flags.limit ? Number(input.flags.limit) : undefined }), state: "ready" };
      } else if (action === "claim") {
        const items = store.claimIndexJobs({
          limit: input.flags.limit ? Number(input.flags.limit) : undefined,
          now: input.flags.now,
          leaseMs: input.flags["lease-ms"] ? Number(input.flags["lease-ms"]) : undefined,
          sources: parseListFlag(input.flags.sources ?? input.flags.source),
          shards: parseListFlag(input.flags.shards ?? input.flags.shard),
        });
        data = { action, items, state: items.length ? "ready" : "empty" };
      } else if (action === "complete") {
        const id = input.positionals[3] ?? input.flags.id;
        if (!id) {
          input.context.stderr.write(`Usage: ${input.binName} search jobs complete <job-id> [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = store.completeIndexJob(id);
        data = { action, item, items: store.listIndexJobs({ limit: input.flags.limit ? Number(input.flags.limit) : undefined }), state: item ? "ready" : "empty" };
      } else if (action === "fail") {
        const id = input.positionals[3] ?? input.flags.id;
        const error = input.flags.error ?? input.positionals.slice(4).join(" ");
        if (!id || !error) {
          input.context.stderr.write(`Usage: ${input.binName} search jobs fail <job-id> --error <message> [--retry] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = store.failIndexJob(id, {
          error,
          retry: readBooleanFlag(input.argv, input.flags, "retry"),
          scheduledAt: input.flags["scheduled-at"],
        });
        data = { action, item, items: store.listIndexJobs({ limit: input.flags.limit ? Number(input.flags.limit) : undefined }), state: item ? "ready" : "empty" };
      } else {
        const items = store.listIndexJobs({
          status: parseSearchIndexJobStatus(input.flags.status),
          source: input.flags.source,
          limit: input.flags.limit ? Number(input.flags.limit) : undefined,
        });
        data = { action, items, state: items.length ? "ready" : "empty" };
      }
    } finally {
      store.close();
    }
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "jobs" });
    else input.context.stdout.write(`${data.items.map((item) => formatSearchJobLine(item)).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "actions") {
    if (input.positionals[2] === "execute") {
      return runSearchActionExecuteCli(input);
    }
    const resultId = input.positionals[2] ?? input.flags["result-id"];
    const store = openCliSearchStore(input.flags);
    let indexedActions: SearchAction[] | null = resultId ? [] : null;
    try {
      registerBuiltinSources(store);
      indexedActions = resultId ? store.actionsForResult(resultId) : null;
    } finally {
      store.close();
    }
    const data = {
      resultId: resultId ?? null,
      actions: resultId ? indexedActions : [
        { id: "open", kind: "open", label: "Open", requiresApproval: false },
        { id: "copy", kind: "copy", label: "Copy reference", requiresApproval: false },
      ],
      brokered: true,
      grantSystem: "host grants/approvals",
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "actions" });
    else input.context.stdout.write(`${data.actions.map((action) => `${action.id}\t${action.kind}\t${action.label}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "explain") {
    const query = input.positionals.slice(2).join(" ") || input.flags.query;
    if (!query) {
      input.context.stderr.write(`Usage: ${input.binName} search explain <query> [--json]\n`);
      return CLI_EXIT_USAGE;
    }
    const data = {
      query,
      profile,
      budgets: DEFAULT_SEARCH_BUDGETS,
      matching: ["exact", "prefix", "fuzzy", "fts"],
      semantic: "optional per source with caller-supplied local embeddings",
      partialResults: "slow sources are omitted instead of blocking fast paths",
      ranking: ["central score", "source hints", "local frecency", "scope", "actor", "surface"],
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "explain" });
    else input.context.stdout.write(`query=${query} sourceTimeoutMs=${DEFAULT_SEARCH_BUDGETS.sourceTimeoutMs} partialResults=omit-slow-sources\n`);
    return CLI_EXIT_OK;
  }

  input.context.stderr.write(`${buildCommandHelp(input.binName, "search") ?? input.usage}\n`);
  return CLI_EXIT_USAGE;
}

function runSearchServiceAction(action: string, input: {
  flags: Record<string, string>;
  context: CliContext;
}): {
  action: string;
  service: SearchServiceStateFile;
  queuedJobs: number;
  sources: ReturnType<SearchStore["sourceStatus"]>;
  jobs: SearchIndexJob[];
  worker?: NonNullable<SearchServiceStateFile["worker"]> & { items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number; error?: string }> };
} {
  const mode = input.flags.mode === "daemon" ? "daemon" : "embedded";
  const now = new Date().toISOString();
  const statePath = resolveSearchServiceStatePath(input.flags);
  const previous = readSearchServiceState(input.flags);
  if (action === "stop") {
    const stopped: SearchServiceStateFile = {
      ...(previous ?? defaultSearchServiceState(input.flags, "embedded")),
      state: "stopped",
      mode: previous?.mode ?? mode,
      stoppedAt: now,
      heartbeatAt: now,
    };
    writeSearchServiceState(input.flags, stopped);
    return searchServiceSnapshot(input.flags, "stop", stopped);
  }
  if (action === "start" || action === "restart") {
    if (mode === "daemon") {
      const pending: SearchServiceStateFile = {
        state: "external_pending",
        mode: "daemon",
        heartbeatAt: now,
        reason: "daemon mode requires a long-running host supervisor; embedded service mode is available locally",
        storage: searchStorageMetadata(input.flags),
        budgets: DEFAULT_SEARCH_BUDGETS,
      };
      writeSearchServiceState(input.flags, pending);
      return searchServiceSnapshot(input.flags, action, pending);
    }
    const started: SearchServiceStateFile = {
      state: "ready",
      mode: "embedded",
      pid: process.pid,
      startedAt: action === "restart" ? now : previous?.startedAt ?? now,
      heartbeatAt: now,
      storage: searchStorageMetadata(input.flags),
      budgets: DEFAULT_SEARCH_BUDGETS,
      ...(previous?.worker ? { worker: previous.worker } : {}),
    };
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    writeSearchServiceState(input.flags, started);
    return searchServiceSnapshot(input.flags, action, started);
  }
  if (action === "run-once" || action === "tick") {
    const base = previous && previous.state !== "external_pending"
      ? previous
      : defaultSearchServiceState(input.flags, "embedded");
    const worker = runSearchServiceWorkerOnce(input.flags, input.context.cwd);
    const updated: SearchServiceStateFile = {
      ...base,
      state: "ready",
      mode: "embedded",
      pid: process.pid,
      startedAt: base.startedAt ?? now,
      heartbeatAt: now,
      storage: searchStorageMetadata(input.flags),
      budgets: DEFAULT_SEARCH_BUDGETS,
      worker,
    };
    writeSearchServiceState(input.flags, updated);
    return searchServiceSnapshot(input.flags, action, updated, worker);
  }
  return searchServiceSnapshot(input.flags, action, previous ?? defaultSearchServiceState(input.flags, "embedded"));
}

function searchServiceSnapshot(
  flags: Record<string, string>,
  action: string,
  service: SearchServiceStateFile,
  worker?: NonNullable<SearchServiceStateFile["worker"]> & { items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number; error?: string }> },
): {
  action: string;
  service: SearchServiceStateFile;
  queuedJobs: number;
  sources: ReturnType<SearchStore["sourceStatus"]>;
  jobs: SearchIndexJob[];
  worker?: NonNullable<SearchServiceStateFile["worker"]> & { items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number; error?: string }> };
} {
  const store = openCliSearchStore(flags);
  try {
    registerBuiltinSources(store);
    const jobs = store.listIndexJobs({ limit: flags.limit ? Number(flags.limit) : 50 });
    return {
      action,
      service,
      queuedJobs: jobs.filter((job) => job.status === "queued" || job.status === "leased").length,
      sources: store.sourceStatus(),
      jobs,
      ...(worker ? { worker } : {}),
    };
  } finally {
    store.close();
  }
}

function runSearchServiceWorkerOnce(flags: Record<string, string>, cwd: string): NonNullable<SearchServiceStateFile["worker"]> & {
  items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number; error?: string }>;
} {
  const store = openCliSearchStore(flags);
  const limit = flags.limit ? Number(flags.limit) : 10;
  const items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number; error?: string }> = [];
  try {
    registerBuiltinSources(store);
    const jobs = store.claimIndexJobs({
      limit,
      sources: parseListFlag(flags.sources ?? flags.source),
      shards: parseListFlag(flags.shards ?? flags.shard),
      leaseMs: flags["lease-ms"] ? Number(flags["lease-ms"]) : undefined,
    });
    for (const job of jobs) {
      try {
        const indexed = runSearchIndexJob(store, job, flags, cwd);
        const completed = store.completeIndexJob(job.id);
        items.push({ id: job.id, source: job.source, operation: job.operation, status: completed?.status ?? "done", indexed });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = store.failIndexJob(job.id, { error: message, retry: readBooleanish(flags.retry) });
        items.push({ id: job.id, source: job.source, operation: job.operation, status: failed?.status ?? "failed", error: message });
      }
    }
  } finally {
    store.close();
  }
  const lastRunAt = new Date().toISOString();
  return {
    lastRunAt,
    claimed: items.length,
    completed: items.filter((item) => item.status === "done").length,
    failed: items.filter((item) => item.status === "failed").length,
    items,
  };
}

function runSearchIndexJob(store: SearchStore, job: SearchIndexJob, flags: Record<string, string>, cwd: string): number {
  if (!sourceCanIndex(store, job.source)) return 0;
  if (job.operation === "delete") {
    if (!job.resourceId) return 0;
    store.tombstone({ source: job.source, resourceId: job.resourceId, reason: "search service delete job" });
    return 1;
  }
  switch (job.source) {
    case "commands":
      return ensureCommandSourceIndexed(store);
    case "sessions.chats":
      return ensureSessionsChatsSourceIndexed(store, flags);
    case "database.records":
      return ensureDatabaseRecordsSourceIndexed(store, flags);
    case "documents.blocks":
      return ensureDocumentsBlocksSourceIndexed(store, flags);
    case "images.derived":
      return ensureImagesDerivedSourceIndexed(store, flags, cwd);
    case "media.assets":
      return ensureMediaAssetsSourceIndexed(store, flags, cwd);
    case "generations.artifacts":
      return ensureGenerationsArtifactsSourceIndexed(store, flags, cwd);
    case "code.symbols":
      return ensureCodeSymbolsSourceIndexed(store, flags, cwd);
    case "local.files":
      return ensureLocalFilesSourceIndexed(store, flags, cwd);
    case "web.ingested":
      return ensureWebIngestedSourceIndexed(store, flags, cwd);
    default:
      throw new Error(`Search service cannot index source: ${job.source}`);
  }
}

function defaultSearchServiceState(flags: Record<string, string>, mode: "embedded" | "daemon"): SearchServiceStateFile {
  return {
    state: "stopped",
    mode,
    storage: searchStorageMetadata(flags),
    budgets: DEFAULT_SEARCH_BUDGETS,
  };
}

function readSearchServiceState(flags: Record<string, string>): SearchServiceStateFile | null {
  const statePath = resolveSearchServiceStatePath(flags);
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as SearchServiceStateFile;
  } catch {
    return null;
  }
}

function writeSearchServiceState(flags: Record<string, string>, state: SearchServiceStateFile): void {
  const statePath = resolveSearchServiceStatePath(flags);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function resolveSearchServiceStatePath(flags: Record<string, string>): string {
  if (flags["search-service-state-path"]) return path.resolve(flags["search-service-state-path"]);
  return path.join(path.dirname(resolveSearchDbPath(flags)), "search-service.json");
}

function readBooleanish(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

function runSearchActionExecuteCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): number {
  const resultId = input.positionals[3] ?? input.flags["result-id"];
  const actionId = input.positionals[4] ?? input.flags["action-id"];
  if (!resultId || !actionId) {
    input.context.stderr.write(`Usage: ${input.binName} search actions execute <result-id> <action-id> [--dry-run] [--host-approval-id <id>] [--json]\n`);
    return CLI_EXIT_USAGE;
  }

  const dryRun = readBooleanFlag(input.argv, input.flags, "dry-run", false);
  const hostApprovalId = input.flags["host-approval-id"] || input.flags["approval-id"];
  const store = openCliSearchStore(input.flags);
  let plan: SearchActionExecutionPlan | undefined;
  try {
    registerBuiltinSources(store);
    const result = store.resultForId(resultId);
    const action = store.actionsForResult(resultId).find((candidate) => candidate.id === actionId);
    if (!result || !action) {
      store.recordAuditEvent({
        type: "action",
        actor: input.flags.actor,
        surface: input.flags.surface,
        resultId,
        actionId,
        status: "not_found",
        reason: "search_action_not_found",
      });
      const error = new CliHandledError("search_action_not_found", `Search action not found: ${resultId} ${actionId}`, CLI_EXIT_FAILURE);
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "search", error, { subcommand: "actions.execute" });
      else input.context.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }

    plan = searchActionExecutionPlan({
      result,
      action,
      dryRun,
      hostApprovalId,
      actor: input.flags.actor,
      surface: input.flags.surface,
    });
    store.recordAuditEvent({
      type: "action",
      actor: input.flags.actor,
      surface: input.flags.surface,
      source: result.source,
      domain: result.domain,
      resultId,
      actionId,
      status: plan.status,
      risk: plan.risk,
      grant: plan.grant,
      reason: plan.reasons.join(","),
      metadata: { dryRun, requiresApproval: plan.requiresApproval, hostApprovalId: hostApprovalId ?? null },
    });
    if (!dryRun && plan.requiresApproval && !hostApprovalId) {
      const error = new CliHandledError("host_approval_required", "Search action execution requires --host-approval-id from the signed host approval flow, or --dry-run for a brokered preview.", CLI_EXIT_FAILURE);
      if (input.wantsJson) {
        writeCommandJsonError(input.context.stdout, "search", error, {
          subcommand: "actions.execute",
          brokeredPlan: plan,
        });
      } else {
        input.context.stderr.write(`${error.message}\n`);
      }
      return error.exitCode;
    }
  } finally {
    store.close();
  }

  if (!plan) return CLI_EXIT_FAILURE;
  if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", { plan }, { subcommand: "actions.execute" });
  else input.context.stdout.write(`${plan.status}\t${plan.resultId}\t${plan.actionId}\t${plan.grant}\n`);
  return CLI_EXIT_OK;
}

function openCliSearchStore(flags: Record<string, string>): SearchStore {
  const dbPath = resolveSearchDbPath(flags);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    return new SearchStore(dbPath);
  } catch (error) {
    if (hasExplicitSearchStorage(flags)) throw error;
    return new SearchStore(path.join(os.tmpdir(), "claw-search.sqlite"));
  }
}

function resolveSearchDbPath(flags: Record<string, string>): string {
  if (flags["search-db-path"]) return path.resolve(flags["search-db-path"]);
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return path.join(resolveClawjsDataRoot(env), "search.sqlite");
}

function hasExplicitSearchStorage(flags: Record<string, string>): boolean {
  return !!(flags["search-db-path"] || flags["data-dir"] || process.env.CLAW_SEARCH_DB_PATH || process.env.CLAW_DATA_DIR || process.env.CLAW_HOME);
}

function searchStorageMetadata(flags: Record<string, string>): { canonical: string; index: string; indexRebuildable: true } {
  return {
    canonical: "core.sqlite",
    index: "search.sqlite",
    indexRebuildable: true,
  };
}

function registerBuiltinSources(store: SearchStore, states: Map<string, SearchSourceState> = new Map()): void {
  for (const source of BUILTIN_SEARCH_SOURCES) {
    const state = states.get(source.id);
    store.registerSource(source, state ? { state } : {});
  }
}

function sourceCanIndex(store: SearchStore, source: string): boolean {
  return !["disabled", "paused", "excluded"].includes(store.sourceState(source) ?? "enabled");
}

function sourceStateForAction(action: string): SearchSourceState {
  if (action === "enable" || action === "resume") return "enabled";
  if (action === "disable") return "disabled";
  if (action === "pause") return "paused";
  if (action === "exclude") return "excluded";
  return "enabled";
}

function searchActionExecutionPlan(input: {
  result: SearchResult;
  action: SearchAction;
  dryRun: boolean;
  hostApprovalId?: string;
  actor?: string;
  surface?: string;
}): SearchActionExecutionPlan {
  const grant = input.action.grant ?? `search.${input.result.domain}.${input.action.kind}`;
  const risk = input.action.risk ?? (input.action.kind === "open" || input.action.kind === "copy" ? "read" : "system");
  const requiresApproval = input.action.requiresApproval ?? input.action.kind !== "copy";
  const status = input.dryRun
    ? "planned"
    : requiresApproval && !input.hostApprovalId
      ? "blocked"
      : "brokered";
  const reasons = [
    ...(requiresApproval ? ["host_approval_required"] : []),
    ...(status === "brokered" ? ["host_broker_receipt_only"] : []),
  ];
  return {
    id: `search-action:${input.result.id}:${input.action.id}`,
    resultId: input.result.id,
    actionId: input.action.id,
    actionKind: input.action.kind,
    source: input.result.source,
    domain: input.result.domain,
    ...(input.result.resourceId ? { resourceId: input.result.resourceId } : {}),
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.surface ? { surface: input.surface } : {}),
    grant,
    risk,
    requiresApproval,
    ...(input.hostApprovalId ? { hostApprovalId: input.hostApprovalId } : {}),
    dryRun: input.dryRun,
    status,
    reasons,
    broker: {
      system: "host grants/approvals",
      operation: "search.action.execute",
      sideEffects: input.dryRun ? "none" : "host_brokered",
    },
  };
}

function ensureCommandSourceIndexed(store: SearchStore): number {
  let reindexed = 0;
  for (const command of clawCliCommandRegistry.commands) {
    store.upsertDocument(commandSearchDocument(command));
    reindexed += 1;
  }
  store.setCursor({
    source: "commands",
    cursor: `registry:${clawCliCommandRegistry.version}:${clawCliCommandRegistry.commands.length}`,
    metadata: { version: clawCliCommandRegistry.version },
  });
  return reindexed;
}

function ensureSessionsChatsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveSessionsDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "conversation_sessions")) {
      store.setSourceState("sessions.chats", "degraded", {
        backlog: 0,
        error: "sessions sidecar does not contain conversation_sessions",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const sessions = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE archived = 0
      ORDER BY updated_at DESC
    `).all() as ConversationSessionRow[];
    const messageRows = hasTable(db, "conversation_messages")
      ? db.prepare(`
          SELECT id, role, text, turn_index, created_at, metadata_json
          FROM conversation_messages
          WHERE session_id = ?
          ORDER BY turn_index ASC, id ASC
          LIMIT 50
        `)
      : null;
    for (const session of sessions) {
      const messages = messageRows?.all(session.session_id) as ConversationMessageRow[] | undefined;
      store.upsertDocument(sessionSearchDocument(session, messages ?? []));
    }
    store.setCursor({
      source: "sessions.chats",
      cursor: `rows:${sessions.length}`,
      metadata: { sidecar: "sessions.sqlite" },
    });
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return sessions.length;
  } finally {
    db.close();
  }
}

function ensureDatabaseRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("database.records", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) {
      store.setSourceState("database.records", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      ORDER BY updated_at DESC
    `).all() as DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = databaseRecordSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "database.records",
      cursor: `rows:${indexed}`,
      metadata: { store: "core.sqlite" },
    });
    store.setSourceState("database.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureDocumentsBlocksSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("documents.blocks", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) {
      store.setSourceState("documents.blocks", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE collection_name IN ('documents', 'document_blocks')
      ORDER BY updated_at DESC
    `).all() as DatabaseRecordRow[];
    const blocksByDocument = new Map<string, DatabaseRecordRow[]>();
    const documents = rows.filter((row) => row.collection_name === "documents");
    for (const block of rows.filter((row) => row.collection_name === "document_blocks")) {
      const payload = parseJsonRecord(block.data_json);
      const documentId = typeof payload.documentId === "string" ? payload.documentId : undefined;
      if (!documentId) continue;
      const key = `${block.namespace_id}:${documentId}`;
      const blocks = blocksByDocument.get(key) ?? [];
      blocks.push(block);
      blocksByDocument.set(key, blocks);
    }
    let indexed = 0;
    for (const document of documents) {
      const blocks = blocksByDocument.get(`${document.namespace_id}:${document.id}`) ?? [];
      const searchDocument = documentBlocksSearchDocument(document, blocks);
      if (!searchDocument) continue;
      store.upsertDocument(searchDocument);
      indexed += 1;
    }
    store.setCursor({
      source: "documents.blocks",
      cursor: `rows:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["documents", "document_blocks"] },
    });
    store.setSourceState("documents.blocks", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureCodeSymbolsSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveCodeSearchRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("code.symbols", "degraded", {
      backlog: 0,
      error: `code root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["code-limit"] ?? flags["search-code-limit"], 500, 1, 10000);
  const maxDepth = boundedNumberFlag(flags["code-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["code-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const files = discoverCodeSearchFiles(root, { maxFiles, maxDepth, maxBytes });
  let indexed = 0;
  for (const file of files) {
    const document = codeFileSearchDocument(root, file);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "code.symbols",
    cursor: `root:${stableSearchId(root)}:files:${indexed}`,
    metadata: { root, maxFiles, maxDepth, maxBytes },
  });
  store.setSourceState("code.symbols", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function ensureLocalFilesSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveLocalFilesSearchRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("local.files", "degraded", {
      backlog: 0,
      error: `local files root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["file-limit"] ?? flags["local-files-limit"], 500, 1, 20000);
  const maxDepth = boundedNumberFlag(flags["file-max-depth"] ?? flags["local-files-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["file-max-bytes"] ?? flags["local-files-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const files = discoverLocalSearchFiles(root, { maxFiles, maxDepth });
  let indexed = 0;
  for (const file of files) {
    const document = localFileSearchDocument(root, file, maxBytes);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "local.files",
    cursor: `root:${stableSearchId(root)}:files:${indexed}`,
    metadata: { root, maxFiles, maxDepth, maxBytes },
  });
  store.setSourceState("local.files", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function ensureWebIngestedSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveWebIngestedRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("web.ingested", "degraded", {
      backlog: 0,
      error: `web cache root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["web-limit"] ?? flags["web-cache-limit"], 500, 1, 20000);
  const maxDepth = boundedNumberFlag(flags["web-max-depth"] ?? flags["web-cache-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["web-max-bytes"] ?? flags["web-cache-max-bytes"], 512 * 1024, 1024, 4 * 1024 * 1024);
  const files = discoverWebIngestedFiles(root, { maxFiles, maxDepth, maxBytes });
  let indexed = 0;
  for (const file of files) {
    const document = webIngestedSearchDocument(root, file, maxBytes);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "web.ingested",
    cursor: `root:${stableSearchId(root)}:pages:${indexed}`,
    metadata: { root, maxFiles, maxDepth, maxBytes },
  });
  store.setSourceState("web.ingested", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function ensureExternalCacheSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveExternalCacheRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("external.cache", "degraded", {
      backlog: 0,
      error: `external cache root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["external-limit"] ?? flags["external-cache-limit"], 500, 1, 20000);
  const maxDepth = boundedNumberFlag(flags["external-max-depth"] ?? flags["external-cache-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["external-max-bytes"] ?? flags["external-cache-max-bytes"], 512 * 1024, 1024, 4 * 1024 * 1024);
  const files = discoverExternalCacheFiles(root, { maxFiles, maxDepth, maxBytes });
  let indexed = 0;
  for (const file of files) {
    const document = externalCacheSearchDocument(root, file, maxBytes);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "external.cache",
    cursor: `root:${stableSearchId(root)}:items:${indexed}`,
    metadata: { root, maxFiles, maxDepth, maxBytes },
  });
  store.setSourceState("external.cache", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function resolveSessionsDbPath(flags: Record<string, string>): string {
  if (flags["sessions-db-path"]) return path.resolve(flags["sessions-db-path"]);
  if (process.env.CLAW_SESSIONS_DB_PATH) return path.resolve(process.env.CLAW_SESSIONS_DB_PATH);
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return path.join(resolveClawjsDataRoot(env), "sessions.sqlite");
}

function resolveMainDbPath(flags: Record<string, string>): string {
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return resolveClawjsMainDbPath(env);
}

function resolveCodeSearchRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["code-root"] ?? flags.workspace ?? cwd);
}

function resolveLocalFilesSearchRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["file-root"] ?? flags["local-files-root"] ?? flags.workspace ?? cwd);
}

function resolveWebIngestedRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["web-root"] ?? flags["web-cache-root"] ?? flags.workspace ?? cwd);
}

function resolveExternalCacheRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["external-root"] ?? flags["external-cache-root"] ?? flags.workspace ?? cwd);
}

function boundedNumberFlag(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function discoverCodeSearchFiles(root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): CodeFileCandidate[] {
  const files: CodeFileCandidate[] = [];
  const visit = (directory: string, depth: number): void => {
    if (files.length >= limits.maxFiles || depth > limits.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limits.maxFiles) break;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredCodeSearchDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const language = languageForCodeSearchExtension(extension);
      if (!language) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxBytes) continue;
      files.push({ absolutePath, extension, language, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function discoverLocalSearchFiles(root: string, limits: { maxFiles: number; maxDepth: number }): LocalFileCandidate[] {
  const files: LocalFileCandidate[] = [];
  const visit = (directory: string, depth: number): void => {
    if (files.length >= limits.maxFiles || depth > limits.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limits.maxFiles) break;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredLocalFilesDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0) continue;
      const extension = path.extname(entry.name).toLowerCase();
      files.push({ absolutePath, extension, kind: localFileKind(extension), size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function discoverWebIngestedFiles(root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): WebIngestedCandidate[] {
  const files: WebIngestedCandidate[] = [];
  const visit = (directory: string, depth: number): void => {
    if (files.length >= limits.maxFiles || depth > limits.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limits.maxFiles) break;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredLocalFilesDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (![".html", ".htm", ".json", ".md", ".txt"].includes(extension)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxBytes) continue;
      files.push({ absolutePath, extension, size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function discoverExternalCacheFiles(root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): ExternalCacheCandidate[] {
  const files: ExternalCacheCandidate[] = [];
  const visit = (directory: string, depth: number): void => {
    if (files.length >= limits.maxFiles || depth > limits.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limits.maxFiles) break;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredLocalFilesDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (![".json", ".jsonl", ".md", ".txt"].includes(extension)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxBytes) continue;
      files.push({ absolutePath, extension, size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function isIgnoredCodeSearchDirectory(name: string): boolean {
  return [
    ".git",
    ".hg",
    ".svn",
    ".codex",
    ".claw",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    ".dart_tool",
    ".build",
    "build",
    "coverage",
    "dist",
    "DerivedData",
    "node_modules",
    "target",
    "vendor",
  ].includes(name);
}

function isIgnoredLocalFilesDirectory(name: string): boolean {
  return isIgnoredCodeSearchDirectory(name) || name === ".Spotlight-V100" || name === ".TemporaryItems" || name === ".Trashes";
}

function languageForCodeSearchExtension(extension: string): string | null {
  return ({
    ".cjs": "javascript",
    ".css": "css",
    ".go": "go",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".md": "markdown",
    ".mdx": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".rs": "rust",
    ".scss": "scss",
    ".swift": "swift",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".yaml": "yaml",
    ".yml": "yaml",
  } as Record<string, string | undefined>)[extension] ?? null;
}

function localFileKind(extension: string): string {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".svg"].includes(extension)) return "image";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac"].includes(extension)) return "audio";
  if ([".mp4", ".mov", ".m4v", ".webm"].includes(extension)) return "video";
  if ([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pages", ".numbers", ".key"].includes(extension)) return "document";
  if (localFileTextExtension(extension)) return "text";
  return "file";
}

function localFileTextExtension(extension: string): boolean {
  return [
    ".csv",
    ".html",
    ".json",
    ".log",
    ".md",
    ".mdx",
    ".rtf",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
  ].includes(extension) || languageForCodeSearchExtension(extension) !== null;
}

function codeFileSearchDocument(root: string, file: CodeFileCandidate): SearchDocumentInput | null {
  let content: string;
  try {
    content = fs.readFileSync(file.absolutePath, "utf8");
  } catch {
    return null;
  }
  if (content.includes("\0")) return null;
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const title = path.basename(file.absolutePath);
  const symbols = extractCodeSearchSymbols(content, file.language);
  const snippet = symbols[0]?.snippet ?? firstMeaningfulLine(content) ?? relativePath;
  const documentType = file.language === "markdown" ? "doc" : "file";
  return {
    id: `code.symbols:${stableSearchId(`${root}\0${relativePath}`)}`,
    source: "code.symbols",
    domain: "code",
    type: documentType,
    resourceId: relativePath,
    title,
    subtitle: relativePath,
    snippet,
    body: content.slice(0, 128 * 1024),
    path: file.absolutePath,
    updatedAt: file.updatedAt,
    metadata: {
      root,
      relativePath,
      extension: file.extension,
      language: file.language,
      symbolCount: symbols.length,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      code: file.language === "markdown" ? 0.6 : 1,
      symbolCount: Math.min(symbols.length, 20) / 20,
    },
    fragments: symbols.slice(0, 25).map((symbol, index) => ({
      id: `code.symbols:${stableSearchId(`${root}\0${relativePath}`)}:symbol:${index}`,
      title: symbol.title,
      body: symbol.body,
      snippet: symbol.snippet,
      sortOrder: index,
      metadata: { kind: symbol.kind, line: symbol.line },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open file", requiresApproval: true, risk: "read", grant: "search.code.open" },
      { id: "copy-reference", kind: "copy", label: "Copy file reference", requiresApproval: false },
    ],
  };
}

function localFileSearchDocument(root: string, file: LocalFileCandidate, maxBytes: number): SearchDocumentInput | null {
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const title = path.basename(file.absolutePath);
  const canReadContent = localFileTextExtension(file.extension) && file.size <= maxBytes;
  const content = canReadContent ? readLocalTextFile(file.absolutePath) : "";
  const snippet = firstMeaningfulLine(content) ?? relativePath;
  return {
    id: `local.files:${stableSearchId(`${root}\0${relativePath}`)}`,
    source: "local.files",
    domain: "files",
    type: "file",
    resourceId: relativePath,
    title,
    subtitle: relativePath,
    snippet,
    body: [
      title,
      relativePath,
      file.extension,
      content,
    ].filter(Boolean).join("\n").slice(0, maxBytes),
    path: file.absolutePath,
    updatedAt: file.updatedAt,
    metadata: {
      root,
      relativePath,
      extension: file.extension,
      kind: file.kind,
      size: file.size,
      indexedContent: Boolean(content),
    },
    permissions: { canOpen: true, canPreview: Boolean(content), redacted: false },
    rankingHints: {
      localFile: 1,
      fastPath: file.kind === "text" || file.kind === "document" ? 0.5 : 0.2,
    },
    fragments: content ? [{
      id: `local.files:${stableSearchId(`${root}\0${relativePath}`)}:content`,
      title: "Content",
      body: content.slice(0, maxBytes),
      snippet,
      sortOrder: 0,
      metadata: { kind: "content" },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open file", requiresApproval: true, risk: "read", grant: "search.files.open" },
      { id: "copy-reference", kind: "copy", label: "Copy file reference", requiresApproval: false },
    ],
  };
}

function webIngestedSearchDocument(root: string, file: WebIngestedCandidate, maxBytes: number): SearchDocumentInput | null {
  const raw = readLocalTextFile(file.absolutePath).slice(0, maxBytes);
  if (!raw) return null;
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const parsed = parseWebIngestedPayload(raw, file.extension);
  const url = parsed.url ?? urlFromWebCachePath(relativePath);
  const title = parsed.title ?? titleFromWebText(parsed.text) ?? path.basename(file.absolutePath);
  const text = parsed.text || title;
  const host = parsed.host ?? hostFromUrl(url);
  return {
    id: `web.ingested:${stableSearchId(`${root}\0${relativePath}`)}`,
    source: "web.ingested",
    domain: "web",
    type: "page",
    resourceId: url ?? relativePath,
    title,
    subtitle: url ?? relativePath,
    snippet: parsed.description ?? firstMeaningfulLine(text) ?? relativePath,
    body: [title, parsed.description, url, text].filter(Boolean).join("\n").slice(0, maxBytes),
    path: file.absolutePath,
    updatedAt: parsed.updatedAt ?? file.updatedAt,
    metadata: {
      root,
      relativePath,
      extension: file.extension,
      host,
      url,
      crawlScope: parsed.crawlScope ?? "explicit_cache",
      contentType: parsed.contentType ?? contentTypeForWebCacheExtension(file.extension),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      web: 1,
      explicitCache: 1,
    },
    fragments: [{
      id: `web.ingested:${stableSearchId(`${root}\0${relativePath}`)}:content`,
      title: "Content",
      body: text.slice(0, maxBytes),
      snippet: firstMeaningfulLine(text) ?? title,
      sortOrder: 0,
      metadata: { kind: "content" },
    }],
    actions: [
      { id: "open", kind: "open", label: "Open cached page", requiresApproval: true, risk: "read", grant: "search.web.open" },
      { id: "copy-reference", kind: "copy", label: "Copy page reference", requiresApproval: false },
    ],
  };
}

function externalCacheSearchDocument(root: string, file: ExternalCacheCandidate, maxBytes: number): SearchDocumentInput | null {
  const raw = readLocalTextFile(file.absolutePath).slice(0, maxBytes);
  if (!raw) return null;
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const record = parseExternalCacheRecord(raw, file.extension, relativePath);
  if (!record) return null;
  const title = record.title ?? record.subject ?? record.name ?? record.id ?? path.basename(file.absolutePath);
  const body = [
    title,
    record.summary,
    record.text,
    record.provider,
    record.app,
    record.externalId,
  ].filter(Boolean).join("\n").slice(0, maxBytes);
  return {
    id: `external.cache:${stableSearchId(`${root}\0${relativePath}\0${record.id ?? ""}`)}`,
    source: "external.cache",
    domain: "external",
    type: record.type ?? "external_record",
    resourceId: record.externalId ?? record.id ?? relativePath,
    title,
    subtitle: [record.provider, record.app].filter(Boolean).join("/") || relativePath,
    snippet: record.summary ?? firstMeaningfulLine(record.text ?? body) ?? relativePath,
    body,
    path: file.absolutePath,
    updatedAt: record.updatedAt ?? file.updatedAt,
    metadata: {
      root,
      relativePath,
      provider: record.provider ?? "unknown",
      app: record.app ?? record.provider ?? "unknown",
      syncMode: record.syncMode ?? "cache",
      externalId: record.externalId ?? record.id,
      kind: record.type ?? "external_record",
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      external: 1,
      explicitCache: 1,
    },
    fragments: record.text ? [{
      id: `external.cache:${stableSearchId(`${root}\0${relativePath}\0${record.id ?? ""}`)}:content`,
      title: "Content",
      body: record.text.slice(0, maxBytes),
      snippet: firstMeaningfulLine(record.text) ?? title,
      sortOrder: 0,
      metadata: { kind: "content" },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open external record", requiresApproval: true, risk: "read", grant: "search.external.open" },
      { id: "copy-reference", kind: "copy", label: "Copy external reference", requiresApproval: false },
    ],
  };
}

function parseExternalCacheRecord(raw: string, extension: string, relativePath: string): {
  id?: string;
  externalId?: string;
  provider?: string;
  app?: string;
  type?: string;
  name?: string;
  title?: string;
  subject?: string;
  summary?: string;
  text?: string;
  updatedAt?: string;
  syncMode?: string;
} | null {
  if (extension === ".json") {
    try {
      return normalizeExternalCachePayload(JSON.parse(raw) as Record<string, unknown>, relativePath);
    } catch {
      return null;
    }
  }
  if (extension === ".jsonl") {
    const first = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (!first) return null;
    try {
      return normalizeExternalCachePayload(JSON.parse(first) as Record<string, unknown>, relativePath);
    } catch {
      return null;
    }
  }
  return {
    id: relativePath,
    provider: path.dirname(relativePath).split(path.posix.sep)[0] || "local",
    type: "external_record",
    title: path.basename(relativePath),
    text: raw,
    syncMode: "cache",
  };
}

function normalizeExternalCachePayload(payload: Record<string, unknown>, relativePath: string): ReturnType<typeof parseExternalCacheRecord> {
  const nested = typeof payload.record === "object" && payload.record !== null ? payload.record as Record<string, unknown> : payload;
  return {
    id: stringValue(nested.id) ?? stringValue(payload.id) ?? relativePath,
    externalId: stringValue(nested.externalId) ?? stringValue(nested.external_id) ?? stringValue(payload.externalId) ?? stringValue(payload.external_id),
    provider: stringValue(nested.provider) ?? stringValue(payload.provider),
    app: stringValue(nested.app) ?? stringValue(payload.app),
    type: stringValue(nested.type) ?? stringValue(nested.kind) ?? "external_record",
    name: stringValue(nested.name),
    title: stringValue(nested.title),
    subject: stringValue(nested.subject),
    summary: stringValue(nested.summary) ?? stringValue(nested.description),
    text: stringValue(nested.text) ?? stringValue(nested.body) ?? stringValue(nested.content) ?? JSON.stringify(redactExternalCachePayload(nested)),
    updatedAt: stringValue(nested.updatedAt) ?? stringValue(nested.updated_at) ?? stringValue(payload.updatedAt) ?? stringValue(payload.updated_at),
    syncMode: stringValue(nested.syncMode) ?? stringValue(nested.sync_mode) ?? stringValue(payload.syncMode) ?? stringValue(payload.sync_mode) ?? "cache",
  };
}

function redactExternalCachePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    redacted[key] = /token|secret|password|credential|api[_-]?key/i.test(key) ? "[redacted]" : value;
  }
  return redacted;
}

function parseWebIngestedPayload(raw: string, extension: string): {
  url?: string;
  host?: string;
  title?: string;
  description?: string;
  text: string;
  updatedAt?: string;
  crawlScope?: string;
  contentType?: string;
} {
  if (extension === ".json") {
    try {
      const payload = JSON.parse(raw) as Record<string, unknown>;
      const html = stringValue(payload.html);
      const text = stringValue(payload.text) ?? stringValue(payload.content) ?? (html ? textFromHtml(html) : "");
      return {
        url: stringValue(payload.url),
        host: stringValue(payload.host),
        title: stringValue(payload.title),
        description: stringValue(payload.description) ?? stringValue(payload.summary),
        text,
        updatedAt: stringValue(payload.updatedAt) ?? stringValue(payload.updated_at),
        crawlScope: stringValue(payload.crawlScope) ?? stringValue(payload.crawl_scope),
        contentType: stringValue(payload.contentType) ?? stringValue(payload.content_type),
      };
    } catch {
      return { text: raw };
    }
  }
  if (extension === ".html" || extension === ".htm") {
    return {
      title: htmlTitle(raw),
      description: htmlMetaDescription(raw),
      text: textFromHtml(raw),
      contentType: "text/html",
    };
  }
  return { text: raw, contentType: extension === ".md" ? "text/markdown" : "text/plain" };
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
}

function htmlMetaDescription(html: string): string | undefined {
  return html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]?.trim()
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)?.[1]?.trim();
}

function titleFromWebText(text: string): string | undefined {
  const first = firstMeaningfulLine(text);
  return first?.replace(/^#+\s*/, "").slice(0, 120);
}

function urlFromWebCachePath(relativePath: string): string | undefined {
  const withoutExtension = relativePath.replace(/\.(html?|json|md|txt)$/i, "");
  return withoutExtension.startsWith("http:/") || withoutExtension.startsWith("https:/")
    ? withoutExtension.replace(/^https:\//, "https://").replace(/^http:\//, "http://")
    : undefined;
}

function hostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function contentTypeForWebCacheExtension(extension: string): string {
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".json") return "application/json";
  if (extension === ".md") return "text/markdown";
  return "text/plain";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readLocalTextFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes("\0") ? "" : content;
  } catch {
    return "";
  }
}

function extractCodeSearchSymbols(content: string, language: string): CodeSearchSymbol[] {
  const symbols: CodeSearchSymbol[] = [];
  const lines = content.split(/\r?\n/);
  const patterns = symbolPatternsForLanguage(language);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    for (const pattern of patterns) {
      const match = pattern.regex.exec(trimmed);
      if (!match) continue;
      const name = match[1] ?? trimmed.replace(/^#+\s*/, "").slice(0, 80);
      symbols.push({
        kind: pattern.kind,
        title: `${pattern.kind} ${name}`.trim(),
        body: trimmed,
        snippet: trimmed.slice(0, 180),
        line: index + 1,
      });
      return;
    }
  });
  return symbols;
}

function symbolPatternsForLanguage(language: string): Array<{ kind: string; regex: RegExp }> {
  if (language === "markdown") return [{ kind: "heading", regex: /^#{1,6}\s+(.+)$/ }];
  if (language === "swift") return [
    { kind: "type", regex: /^(?:public\s+|private\s+|internal\s+|final\s+|open\s+)*(?:struct|class|enum|protocol|actor|extension)\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^(?:public\s+|private\s+|internal\s+|static\s+|mutating\s+|override\s+)*func\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  if (language === "python") return [
    { kind: "type", regex: /^class\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  if (language === "rust") return [
    { kind: "type", regex: /^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  if (language === "go") return [
    { kind: "type", regex: /^type\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  return [
    { kind: "type", regex: /^(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
    { kind: "function", regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
    { kind: "function", regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/ },
  ];
}

function firstMeaningfulLine(content: string): string | undefined {
  return content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)?.slice(0, 180);
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function stableSearchId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(table) as { name: string } | undefined;
  return !!row;
}

function sessionSearchDocument(session: ConversationSessionRow, messages: ConversationMessageRow[]): SearchDocumentInput {
  const metadata = parseJsonRecord(session.metadata_json);
  const title = session.title || `Session ${session.session_id}`;
  const body = [
    session.snippet,
    session.cwd,
    ...messages.map((message) => `${message.role}: ${message.text}`),
  ].filter(Boolean).join("\n");
  return {
    id: `sessions.chats:${session.session_id}`,
    source: "sessions.chats",
    domain: "sessions",
    type: "chat",
    resourceId: session.session_id,
    title,
    subtitle: session.cwd ?? session.source,
    snippet: session.snippet ?? messages[0]?.text ?? "",
    body,
    path: session.artifact_path,
    updatedAt: session.updated_at,
    metadata: {
      ...metadata,
      sessionId: session.session_id,
      source: session.source,
      cwd: session.cwd,
      archived: session.archived === 1,
      pinned: session.pinned === 1,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      pinned: session.pinned === 1 ? 0.2 : 0,
    },
    fragments: messages.slice(0, 25).map((message) => ({
      id: `sessions.chats:${session.session_id}:message:${message.id}`,
      title: message.role,
      body: message.text,
      snippet: message.text.slice(0, 180),
      sortOrder: message.turn_index,
      metadata: {
        role: message.role,
        createdAt: message.created_at,
        ...parseJsonRecord(message.metadata_json),
      },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open chat", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy chat reference", requiresApproval: false },
    ],
  };
}

function databaseRecordSearchDocument(row: DatabaseRecordRow): SearchDocumentInput | null {
  const payload = parseJsonRecord(row.data_json);
  if (payload.archivedAt || payload.archived_at || payload.deletedAt || payload.deleted_at) return null;
  const sensitive = isSensitiveRecord(payload);
  const title = titleForDatabaseRecord(row, payload);
  const fields = searchableRecordFields(payload);
  const body = fields.map(([key, value]) => `${key}: ${stringifySearchValue(value)}`).join("\n");
  const snippet = sensitive ? "[redacted]" : firstTextValue(payload) ?? body.slice(0, 180);
  return {
    id: `database.records:${row.namespace_id}:${row.collection_name}:${row.id}`,
    source: "database.records",
    domain: "database",
    type: "record",
    resourceId: `${row.namespace_id}:${row.collection_name}:${row.id}`,
    title,
    subtitle: `${row.namespace_id}/${row.collection_name}`,
    snippet,
    body,
    updatedAt: row.updated_at,
    metadata: {
      namespaceId: row.namespace_id,
      collection: row.collection_name,
      recordId: row.id,
      fieldNames: Object.keys(payload).sort(),
      sensitive,
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      structuredRecord: 1,
    },
    fragments: sensitive ? [] : fields.slice(0, 20).map(([key, value], index) => ({
      id: `database.records:${row.namespace_id}:${row.collection_name}:${row.id}:field:${key}`,
      title: key,
      body: stringifySearchValue(value),
      snippet: stringifySearchValue(value).slice(0, 180),
      sortOrder: index,
      metadata: { field: key },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open record", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy record reference", requiresApproval: false },
    ],
  };
}

function documentBlocksSearchDocument(row: DatabaseRecordRow, blockRows: DatabaseRecordRow[]): SearchDocumentInput | null {
  const payload = parseJsonRecord(row.data_json);
  if (payload.archivedAt || payload.archived_at || payload.deletedAt || payload.deleted_at) return null;
  const sensitive = isSensitiveRecord(payload) || String(payload.accessLevel ?? "").toUpperCase() === "PRIVATE";
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : `Document ${row.id}`;
  const content = [
    typeof payload.content === "string" ? payload.content : undefined,
    textFromStructuredContent(payload.contentData),
  ].filter(Boolean).join("\n");
  const blocks = blockRows
    .map((block) => ({ row: block, payload: parseJsonRecord(block.data_json) }))
    .filter((block) => !block.payload.archivedAt && !block.payload.archived_at && !block.payload.deletedAt && !block.payload.deleted_at)
    .sort((left, right) => Number(left.payload.position ?? 0) - Number(right.payload.position ?? 0));
  const blockTexts = blocks.map((block) => textFromStructuredContent(block.payload.content)).filter(Boolean);
  const body = [title, content, ...blockTexts].filter(Boolean).join("\n");
  const snippet = sensitive ? "[redacted]" : firstMeaningfulLine([content, ...blockTexts].join("\n")) ?? title;
  const blockTypes = Array.from(new Set(blocks.map((block) => String(block.payload.type ?? "block"))));
  return {
    id: `documents.blocks:${row.namespace_id}:${row.id}`,
    source: "documents.blocks",
    domain: "documents",
    type: "document",
    resourceId: `${row.namespace_id}:documents:${row.id}`,
    title,
    subtitle: [payload.scopeKind, payload.scopeId].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("/") || row.namespace_id,
    snippet,
    body,
    updatedAt: row.updated_at,
    metadata: {
      namespaceId: row.namespace_id,
      collection: "documents",
      documentId: row.id,
      scopeKind: payload.scopeKind ?? null,
      scopeId: payload.scopeId ?? null,
      parentDocumentId: payload.parentDocumentId ?? null,
      accessLevel: payload.accessLevel ?? null,
      blockCount: blocks.length,
      blockType: blockTypes,
      sensitive,
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      structuredDocument: 1,
      blockCount: Math.min(blocks.length, 50) / 50,
    },
    fragments: sensitive ? [] : blocks.slice(0, 50).map((block, index) => {
      const blockType = String(block.payload.type ?? "block");
      const text = textFromStructuredContent(block.payload.content) ?? "";
      return {
        id: `documents.blocks:${row.namespace_id}:${row.id}:block:${block.row.id}`,
        title: blockType,
        body: text,
        snippet: text.slice(0, 180),
        sortOrder: Number(block.payload.position ?? index),
        metadata: {
          blockId: block.row.id,
          type: blockType,
          parentBlockId: block.payload.parentBlockId ?? null,
        },
      };
    }),
    actions: [
      { id: "open", kind: "open", label: "Open document", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy document reference", requiresApproval: false },
    ],
  };
}

interface DatabaseRecordRow {
  namespace_id: string;
  collection_name: string;
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface CodeFileCandidate {
  absolutePath: string;
  extension: string;
  language: string;
  updatedAt: string;
}

interface LocalFileCandidate {
  absolutePath: string;
  extension: string;
  kind: string;
  size: number;
  updatedAt: string;
}

interface WebIngestedCandidate {
  absolutePath: string;
  extension: string;
  size: number;
  updatedAt: string;
}

interface ExternalCacheCandidate {
  absolutePath: string;
  extension: string;
  size: number;
  updatedAt: string;
}

interface CodeSearchSymbol {
  kind: string;
  title: string;
  body: string;
  snippet: string;
  line: number;
}

function titleForDatabaseRecord(row: DatabaseRecordRow, payload: Record<string, unknown>): string {
  const fullName = [payload.firstName, payload.lastName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();
  if (fullName) return fullName;
  const value = payload.title ?? payload.name ?? payload.displayName ?? payload.subject ?? payload.label ?? payload.email;
  return typeof value === "string" && value.trim() ? value.trim() : `${row.collection_name}:${row.id}`;
}

function searchableRecordFields(payload: Record<string, unknown>): Array<[string, unknown]> {
  const fields: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (["id", "createdAt", "updatedAt", "archivedAt", "deletedAt"].includes(key) || !isSearchableValue(value)) continue;
    if (isPlainRecord(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (isSearchableValue(childValue)) fields.push([key === "metadata" ? childKey : `${key}.${childKey}`, childValue]);
      }
      continue;
    }
    fields.push([key, value]);
  }
  return fields;
}

function isSearchableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function stringifySearchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function textFromStructuredContent(value: unknown): string | undefined {
  const parts: string[] = [];
  collectStructuredText(value, parts, 0);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

function collectStructuredText(value: unknown, parts: string[], depth: number): void {
  if (parts.join(" ").length > 8192 || depth > 4 || value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value.trim()) parts.push(value.trim());
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    parts.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStructuredText(item, parts, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const key of ["text", "plainText", "title", "heading", "caption", "alt", "code", "content", "children"]) {
    if (key in value) collectStructuredText(value[key], parts, depth + 1);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstTextValue(payload: Record<string, unknown>): string | undefined {
  for (const key of ["description", "summary", "body", "content", "notes"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 180);
  }
  const metadata = payload.metadata;
  if (isPlainRecord(metadata) && typeof metadata.notes === "string" && metadata.notes.trim()) {
    return metadata.notes.trim().slice(0, 180);
  }
  return undefined;
}

function isSensitiveRecord(payload: Record<string, unknown>): boolean {
  const metadata = isPlainRecord(payload.metadata) ? payload.metadata : {};
  const sensitivity = String(payload.sensitivity ?? metadata.sensitivity ?? payload.visibility ?? metadata.visibility ?? payload.privacy ?? metadata.privacy ?? "").toLowerCase();
  return ["sensitive", "private", "secret", "restricted"].includes(sensitivity);
}

interface ConversationSessionRow {
  session_id: string;
  source: string;
  artifact_path: string;
  title: string;
  cwd: string | null;
  updated_at: string;
  snippet: string | null;
  metadata_json: string | null;
  archived: number;
  pinned: number;
}

interface ConversationMessageRow {
  id: string;
  role: string;
  text: string;
  turn_index: number;
  created_at: string | null;
  metadata_json: string | null;
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function commandSearchDocument(command: ClawCliCommandRegistryEntry): SearchDocumentInput {
  const canonicalName = command.target ?? command.name;
  const references = [...command.docs, ...command.adrs, ...command.tests, command.source.file];
  const aliases = command.aliases ?? [];
  const title = command.name;
  const subtitle = command.kind === "alias" ? `Alias for ${canonicalName}` : command.kind;
  const snippet = command.summary;
  const usage = command.usage ? `Usage: ${command.usage}` : "";
  const body = [
    command.name,
    canonicalName,
    command.kind,
    command.summary,
    usage,
    aliases.length ? `Aliases: ${aliases.join(", ")}` : "",
    command.family ? `Family: ${command.family}` : "",
    command.support.reason,
    command.support.scenario,
    references.join("\n"),
  ].filter(Boolean).join("\n");
  return {
    id: `commands:${command.name}`,
    source: "commands",
    domain: "commands",
    type: "command",
    title,
    subtitle,
    snippet,
    body,
    resourceId: command.name,
    path: command.source.file,
    metadata: {
      canonicalName,
      kind: command.kind,
      aliases,
      family: command.family ?? null,
      schemaVersion: command.schemaVersion,
      support: command.support,
      securityPolicy: command.securityPolicy,
      docs: command.docs,
      adrs: command.adrs,
      tests: command.tests,
    },
    rankingHints: {
      fastPath: 1,
      command: 1,
      advanced: command.advanced ? -0.1 : 0,
    },
    fragments: [
      ...command.docs.map((doc, index) => ({
        id: `commands:${command.name}:doc:${index}`,
        title: "Documentation",
        body: doc,
        sortOrder: index,
        metadata: { kind: "doc", path: doc },
      })),
      ...command.adrs.map((adr, index) => ({
        id: `commands:${command.name}:adr:${index}`,
        title: "ADR",
        body: adr,
        sortOrder: 100 + index,
        metadata: { kind: "adr", path: adr },
      })),
      ...command.tests.map((test, index) => ({
        id: `commands:${command.name}:test:${index}`,
        title: "Test",
        body: test,
        sortOrder: 200 + index,
        metadata: { kind: "test", path: test },
      })),
    ],
    actions: [
      { id: "help", kind: "run", label: `Show ${command.name} help`, requiresApproval: true, risk: "system", grant: "search.commands.run" },
      { id: "copy-reference", kind: "copy", label: "Copy command reference", requiresApproval: false },
    ],
  };
}

function parseListFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? entries : undefined;
}

function parseSearchFiltersFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("--filters must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }
  const filters: Record<string, unknown> = {};
  for (const entry of trimmed.split(",")) {
    const [rawKey, ...rawValue] = entry.split("=");
    const key = rawKey?.trim();
    const text = rawValue.join("=").trim();
    if (!key || !text) continue;
    filters[key] = parseFilterValue(text);
  }
  return Object.keys(filters).length ? filters : undefined;
}

function parseSearchStrategyFlag(value: string | undefined): "lexical" | "semantic" | "hybrid" | undefined {
  return value === "semantic" || value === "hybrid" || value === "lexical" ? value : undefined;
}

function parseSearchIndexJobOperation(value: string | undefined): "upsert" | "delete" | "backfill" | "rebuild" | undefined {
  return value === "upsert" || value === "delete" || value === "backfill" || value === "rebuild" ? value : undefined;
}

function parseSearchIndexJobStatus(value: string | undefined): "queued" | "leased" | "done" | "failed" | undefined {
  return value === "queued" || value === "leased" || value === "done" || value === "failed" ? value : undefined;
}

function parseSearchJobPayloadFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--payload must be a JSON object");
  return parsed as Record<string, unknown>;
}

function formatSearchJobLine(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const job = item as { id?: string; source?: string; shard?: string; operation?: string; status?: string; attempts?: number };
  return `${job.id ?? ""}\t${job.source ?? ""}\t${job.shard ?? ""}\t${job.operation ?? ""}\t${job.status ?? ""}\tattempts=${job.attempts ?? 0}`;
}

function parseSearchEmbeddingFlag(value: string | undefined, model: string | undefined): { model: string; vector: number[] } | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("--embedding must be a JSON number array");
  const vector = parsed.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry)) throw new Error("--embedding must be a JSON number array");
    return entry;
  });
  if (!vector.length) throw new Error("--embedding must not be empty");
  return { model: model ?? "local", vector };
}

function searchQueryRequiresAudit(query: string, results: SearchResult[], filters: Record<string, unknown> | undefined): boolean {
  if (results.some((result) => result.permissions?.redacted)) return true;
  if (filters?.redacted === true || filters?.canPreview === false) return true;
  return /\b(secret|private|restricted|sensitive|token|password|credential)\b/i.test(query);
}

function parseFilterValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.includes("|")) return value.split("|").map((entry) => parseFilterValue(entry.trim()));
  return value;
}

function searchRegisteredLocalFiles(query: string, cwd: string): ClawCliSearchResult[] {
  const paths = new Map<string, { type: ClawCliSearchResult["type"]; canonicalName: string }>();
  for (const entry of clawCliCommandRegistry.commands) {
    for (const doc of entry.docs) paths.set(doc, { type: doc.includes("/adr/") ? "adr" : "doc", canonicalName: entry.target ?? entry.name });
    for (const adr of entry.adrs) paths.set(adr, { type: "adr", canonicalName: entry.target ?? entry.name });
    for (const test of entry.tests) paths.set(test, { type: "test", canonicalName: entry.target ?? entry.name });
    paths.set(entry.source.file, { type: "source", canonicalName: entry.target ?? entry.name });
  }
  for (const entry of discoverabilitySearchFiles(cwd)) {
    paths.set(entry.path, { type: entry.type, canonicalName: entry.canonicalName });
  }

  const results: ClawCliSearchResult[] = [];
  for (const [relativePath, meta] of paths) {
    const absolutePath = path.resolve(cwd, relativePath);
    if (!isSafeSearchFile(cwd, absolutePath)) continue;
    let content = "";
    try {
      const stat = fs.statSync(absolutePath);
      if (!stat.isFile() || stat.size > 512 * 1024) continue;
      content = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    const match = scoreFileContent(query, content);
    if (!match) continue;
    results.push({
      type: meta.type,
      name: relativePath,
      canonicalName: meta.canonicalName,
      score: match.score,
      summary: match.summary,
      path: relativePath,
    });
  }
  return results;
}

function discoverabilitySearchFiles(cwd: string): Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> {
  const registryPath = path.resolve(cwd, "docs/discoverability.registry.json");
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      artifacts?: Array<{
        id?: string;
        kind?: string;
        canonicalSource?: string;
        searchQueries?: Array<{ expectPath?: string }>;
      }>;
    };
    const entries: Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> = [];
    for (const artifact of registry.artifacts ?? []) {
      const type: ClawCliSearchResult["type"] = artifact.kind === "adr" || artifact.canonicalSource?.includes("/adr/") ? "adr"
        : artifact.kind === "skill" || artifact.canonicalSource?.includes("/skills/") ? "doc"
          : "doc";
      const canonicalName = artifact.id ?? "discoverability";
      if (artifact.canonicalSource) entries.push({ path: artifact.canonicalSource, type, canonicalName });
      for (const query of artifact.searchQueries ?? []) {
        if (query.expectPath) entries.push({ path: query.expectPath, type, canonicalName });
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function isSafeSearchFile(cwd: string, absolutePath: string): boolean {
  const relativePath = path.relative(cwd, absolutePath);
  return !!relativePath
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.split(path.sep).some((segment) => ["node_modules", "dist", ".git", ".tmp", "build", ".next"].includes(segment));
}

function scoreFileContent(query: string, content: string): { score: number; summary: string } | null {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return null;
  const lines = content.split(/\r?\n/);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  let best: { score: number; summary: string } | null = null;
  for (const line of lines) {
    const normalizedLine = line.toLowerCase();
    let score = 0;
    if (normalizedLine.includes(normalizedQuery)) score = 75;
    else {
      const hits = terms.filter((term) => normalizedLine.includes(term)).length;
      if (hits > 0) score = 20 + hits * 8;
    }
    if (score === 0) continue;
    const summary = line.trim().replace(/\s+/g, " ").slice(0, 180);
    if (!best || score > best.score) best = { score, summary };
  }
  return best;
}

function mergeSearchResults(results: ClawCliSearchResult[], limit: number): ClawCliSearchResult[] {
  const byKey = new Map<string, ClawCliSearchResult>();
  for (const result of results) {
    const key = `${result.type}:${result.name}:${result.canonicalName ?? ""}`;
    const previous = byKey.get(key);
    if (!previous || result.score > previous.score) byKey.set(key, result);
  }
  return [...byKey.values()]
    .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
    .slice(0, limit);
}
