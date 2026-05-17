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
  type SearchProfileId,
  type SearchQueryInput,
  type SearchQueryOutput,
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
import { ensureGenerationArtifactResourceIndexed, ensureGenerationsArtifactsSourceIndexed } from "./cli-search-generations-source.ts";
import { ensureImageDerivedResourceIndexed, ensureImagesDerivedSourceIndexed, ensureMediaAssetResourceIndexed, ensureMediaAssetsSourceIndexed } from "./cli-search-image-media-sources.ts";
import { pathSafeBasename, resolveRuntimeAdapterId } from "./cli-runtime-utils.ts";
import { resolveClawjsDataRoot, resolveClawjsMainDbPath } from "./v1-data.ts";
import { readMcpServers, type JsonRecord } from "./v1-data-core.ts";

const SEARCH_ADMIN_COMMANDS = new Set(["sources", "status", "service", "profiles", "saved", "monitors", "actions", "audit", "jobs", "shards", "explain"]);
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
  "people",
  "inbox",
  "events",
]);

const BUILTIN_SEARCH_SOURCES: SearchSourceManifest[] = createBuiltinSearchSourceManifests();
type CommandFallbackPolicy = "off" | "empty" | "always";

const OPERATIONAL_SEARCH_SIDECARS = [
  { filename: "monitor.sqlite", domain: "monitor" },
  { filename: "infra.sqlite", domain: "infra" },
  { filename: "ops.sqlite", domain: "ops" },
] as const;

const FINANCE_SEARCH_COLLECTIONS = [
  "financial_accounts",
  "transactions",
  "invoices",
  "payment_intents",
  "accounting_entries",
  "accounting_lines",
] as const;

const WORK_SEARCH_COLLECTIONS = new Set([
  "tasks",
  "projects",
  "goals",
  "people",
  "inbox_threads",
  "inbox_messages",
  "events",
  "reminders",
  "deadlines",
  "blockers",
  "decisions",
  "assignments",
  "handoffs",
  "approvals",
  "work_sessions",
  "artifacts",
]);

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
  worker?: {
    lastRunAt: string;
    claimed: number;
    completed: number;
    failed: number;
    stoppedReason?: SearchServiceWorkerStopReason;
    budgets?: SearchServiceWorkerBudgets;
  };
}

type SearchServiceWorkerStopReason = "empty" | "job_limit" | "runtime_budget" | "failure_budget";

interface SearchServiceWorkerBudgets {
  maxJobs: number;
  maxRuntimeMs: number;
  maxFailures: number;
  leaseMs?: number;
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
    const shouldRefreshWork = domains?.includes("work") || sources?.includes("work.items");
    const shouldRefreshDocuments = domains?.includes("documents") || sources?.includes("documents.blocks");
    const shouldRefreshNotes = domains?.includes("notes") || sources?.includes("notes.pages");
    const shouldRefreshKnowledge = domains?.includes("knowledge") || sources?.includes("knowledge.graph");
    const shouldRefreshSignals = domains?.includes("signals") || sources?.includes("signals.observations");
    const shouldRefreshCalendar = domains?.includes("calendar") || sources?.includes("calendar.events");
    const shouldRefreshFinance = domains?.includes("finance") || sources?.includes("finance.records");
    const shouldRefreshImages = domains?.includes("images") || sources?.includes("images.derived");
    const shouldRefreshMedia = domains?.includes("media") || sources?.includes("media.assets");
    const shouldRefreshGenerations = domains?.includes("generations") || sources?.includes("generations.artifacts");
    const shouldRefreshCode = domains?.includes("code") || sources?.includes("code.symbols");
    const shouldRefreshSkills = domains?.includes("skills") || sources?.includes("skills.registry");
    const shouldRefreshConnectors = domains?.includes("connectors") || sources?.includes("connectors.catalog");
    const shouldRefreshMcp = domains?.includes("mcp") || sources?.includes("mcp.servers");
    const shouldRefreshApps = domains?.includes("apps") || sources?.includes("apps.catalog");
    const shouldRefreshDesign = domains?.includes("design") || sources?.includes("design.resources");
    const shouldRefreshRuntime = domains?.includes("runtime") || sources?.includes("runtime.events");
    const shouldRefreshLocalFiles = domains?.includes("files") || sources?.includes("local.files");
    const shouldRefreshWeb = domains?.includes("web") || sources?.includes("web.ingested");
    const shouldRefreshExternal = domains?.includes("external") || sources?.includes("external.cache");
    const indexedDatabase = shouldRefreshDatabase && sourceCanIndex(store, "database.records") ? ensureDatabaseRecordsSourceIndexed(store, input.flags) : 0;
    const indexedWork = shouldRefreshWork && sourceCanIndex(store, "work.items") ? ensureWorkItemsSourceIndexed(store, input.flags) : 0;
    const indexedDocuments = shouldRefreshDocuments && sourceCanIndex(store, "documents.blocks") ? ensureDocumentsBlocksSourceIndexed(store, input.flags) : 0;
    const indexedNotes = shouldRefreshNotes && sourceCanIndex(store, "notes.pages") ? ensureNotesPagesSourceIndexed(store, input.flags) : 0;
    const indexedKnowledge = shouldRefreshKnowledge && sourceCanIndex(store, "knowledge.graph") ? ensureKnowledgeGraphSourceIndexed(store, input.flags) : 0;
    const indexedSignals = shouldRefreshSignals && sourceCanIndex(store, "signals.observations") ? ensureSignalsObservationsSourceIndexed(store, input.flags) : 0;
    const indexedCalendar = shouldRefreshCalendar && sourceCanIndex(store, "calendar.events") ? ensureCalendarEventsSourceIndexed(store, input.flags) : 0;
    const indexedFinance = shouldRefreshFinance && sourceCanIndex(store, "finance.records") ? ensureFinanceRecordsSourceIndexed(store, input.flags) : 0;
    const indexedImages = shouldRefreshImages && sourceCanIndex(store, "images.derived") ? ensureImagesDerivedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedMedia = shouldRefreshMedia && sourceCanIndex(store, "media.assets") ? ensureMediaAssetsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedGenerations = shouldRefreshGenerations && sourceCanIndex(store, "generations.artifacts") ? ensureGenerationsArtifactsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedCode = shouldRefreshCode && sourceCanIndex(store, "code.symbols") ? ensureCodeSymbolsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedSkills = shouldRefreshSkills && sourceCanIndex(store, "skills.registry") ? ensureSkillsRegistrySourceIndexed(store, input.flags) : 0;
    const indexedConnectors = shouldRefreshConnectors && sourceCanIndex(store, "connectors.catalog") ? ensureConnectorsCatalogSourceIndexed(store, input.flags) : 0;
    const indexedMcp = shouldRefreshMcp && sourceCanIndex(store, "mcp.servers") ? ensureMcpServersSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedApps = shouldRefreshApps && sourceCanIndex(store, "apps.catalog") ? ensureAppsCatalogSourceIndexed(store, input.flags) : 0;
    const indexedDesign = shouldRefreshDesign && sourceCanIndex(store, "design.resources") ? ensureDesignResourcesSourceIndexed(store, input.flags) : 0;
    const indexedRuntime = shouldRefreshRuntime && sourceCanIndex(store, "runtime.events") ? ensureRuntimeEventsSourceIndexed(store, input.flags) : 0;
    const indexedLocalFiles = shouldRefreshLocalFiles && sourceCanIndex(store, "local.files") ? ensureLocalFilesSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedWeb = shouldRefreshWeb && sourceCanIndex(store, "web.ingested") ? ensureWebIngestedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedExternal = shouldRefreshExternal && sourceCanIndex(store, "external.cache") ? ensureExternalCacheSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const filters = parseSearchFiltersFlag(input.flags.filters ?? input.flags.filter);
    const strategy = parseSearchStrategyFlag(input.flags.strategy);
    const embedding = parseSearchEmbeddingFlag(input.flags.embedding ?? input.flags["embedding-json"], input.flags["embedding-model"] ?? input.flags.model);
    const agentBudget = parseSearchAgentBudget(input.flags);
    const limit = input.flags.limit ? boundedNumberFlag(input.flags.limit, 20, 1, 1000) : undefined;
    const results = store.query({
      query,
      profile: input.flags.profile === "full" ? "full" : "framework",
      domains,
      sources,
      shards,
      filters,
      strategy,
      agentBudget,
      embedding,
      limit,
      explain: input.flags.explain === "true" || input.flags.explain === "1",
      surface: input.flags.surface,
      actor: input.flags.actor,
    });
    const commandFallback = commandFallbackForSearchQuery(store, {
      query,
      flags: input.flags,
      policy: parseCommandFallbackPolicy(input.flags["command-fallback"] ?? input.flags["fallback-commands"]),
      limit: limit ?? 20,
      domains,
      sources,
      shards,
      filters,
      strategy,
      agentBudget,
      embedding,
      explain: input.flags.explain === "true" || input.flags.explain === "1",
      surface: input.flags.surface,
      actor: input.flags.actor,
      baseResults: results,
    });
    const outputResults = commandFallback.output ?? results;
    if (searchQueryRequiresAudit(query, outputResults.results, filters)) {
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
          resultCount: outputResults.results.length,
          redactedResultCount: outputResults.results.filter((result) => result.permissions?.redacted).length,
        },
      });
    }
    const data = {
      ...outputResults,
      strategy: strategy ?? "lexical",
      embeddingModel: embedding?.model,
      agentBudget: agentBudget ?? null,
      commandFallback: commandFallback.report,
      storage: searchStorageMetadata(input.flags),
      indexedFastPaths: {
        commands: indexedCommands,
        ...(shouldRefreshDatabase ? { "database.records": indexedDatabase } : {}),
        ...(shouldRefreshWork ? { "work.items": indexedWork } : {}),
        ...(shouldRefreshDocuments ? { "documents.blocks": indexedDocuments } : {}),
        ...(shouldRefreshNotes ? { "notes.pages": indexedNotes } : {}),
        ...(shouldRefreshKnowledge ? { "knowledge.graph": indexedKnowledge } : {}),
        ...(shouldRefreshSignals ? { "signals.observations": indexedSignals } : {}),
        ...(shouldRefreshCalendar ? { "calendar.events": indexedCalendar } : {}),
        ...(shouldRefreshFinance ? { "finance.records": indexedFinance } : {}),
        ...(shouldRefreshImages ? { "images.derived": indexedImages } : {}),
        ...(shouldRefreshMedia ? { "media.assets": indexedMedia } : {}),
        ...(shouldRefreshGenerations ? { "generations.artifacts": indexedGenerations } : {}),
        ...(shouldRefreshCode ? { "code.symbols": indexedCode } : {}),
        ...(shouldRefreshSkills ? { "skills.registry": indexedSkills } : {}),
        ...(shouldRefreshConnectors ? { "connectors.catalog": indexedConnectors } : {}),
        ...(shouldRefreshMcp ? { "mcp.servers": indexedMcp } : {}),
        ...(shouldRefreshApps ? { "apps.catalog": indexedApps } : {}),
        ...(shouldRefreshDesign ? { "design.resources": indexedDesign } : {}),
        ...(shouldRefreshRuntime ? { "runtime.events": indexedRuntime } : {}),
        ...(shouldRefreshLocalFiles ? { "local.files": indexedLocalFiles } : {}),
        ...(shouldRefreshWeb ? { "web.ingested": indexedWeb } : {}),
        ...(shouldRefreshExternal ? { "external.cache": indexedExternal } : {}),
      },
    };
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "query" });
    } else {
      input.context.stdout.write(`${outputResults.results.map((result) => `${result.domain}\t${result.score.toFixed(1)}\t${result.id}\t${result.title}`).join("\n")}\n`);
    }
    return outputResults.results.length > 0 ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
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
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const store = openCliSearchStore(input.flags);
  try {
    const selectedSources = parseListFlag(input.flags.sources ?? input.flags.source);
    const selectedShards = parseListFlag(input.flags.shards ?? input.flags.shard);
    const knownSources = new Set(BUILTIN_SEARCH_SOURCES.map((source) => source.id));
    const unknownSources = (selectedSources ?? []).filter((source) => !knownSources.has(source));
    if (unknownSources.length) {
      const message = `Unknown search source(s): ${unknownSources.join(", ")}`;
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "search", { code: "unknown_source", message }, { subcommand: "rebuild" });
      else input.context.stderr.write(`${message}\n`);
      return CLI_EXIT_USAGE;
    }
    if (selectedShards && !selectedSources) {
      const message = "Search shard rebuilds require --source or --sources.";
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "search", { code: "missing_source", message }, { subcommand: "rebuild" });
      else input.context.stderr.write(`${message}\n`);
      return CLI_EXIT_USAGE;
    }
    registerBuiltinSources(store);
    const enqueueRebuild = readBooleanFlag(input.argv, input.flags, "enqueue")
      || readBooleanFlag(input.argv, input.flags, "background")
      || readBooleanFlag(input.argv, input.flags, "async");
    if (enqueueRebuild) {
      const jobSources = (selectedSources ?? BUILTIN_SEARCH_SOURCES.map((source) => source.id)).filter((source) => sourceCanIndex(store, source));
      const jobShards = selectedShards ?? ["default"];
      const hasMultipleJobs = jobSources.length * jobShards.length > 1;
      const jobs = jobSources.flatMap((source) => jobShards.map((shard) => store.enqueueIndexJob({
        id: input.flags.id ? (hasMultipleJobs ? `${input.flags.id}:${source}:${shard}` : input.flags.id) : `rebuild:${source}:${shard}`,
        source,
        shard,
        operation: "rebuild",
        payload: {
          requestedBy: "search.rebuild",
          background: true,
          profile: input.flags.profile === "full" ? "full" : "framework",
          ...(selectedShards ? { shardScoped: true } : {}),
        },
        priority: input.flags.priority ? Number(input.flags.priority) : 50,
        scheduledAt: input.flags["scheduled-at"],
      })));
      const data = {
        rebuilt: false,
        enqueued: true,
        mode: selectedSources && selectedShards ? "queued_shard_scoped" : selectedSources ? "queued_scoped" : "queued_full",
        selectedSources: selectedSources ?? null,
        selectedShards: selectedShards ?? null,
        jobs,
        storage: searchStorageMetadata(input.flags),
        note: "Rebuild jobs are queued in search.sqlite and processed by search service run-once or the signed host worker.",
      };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "rebuild" });
      else input.context.stdout.write(`enqueued=${jobs.length} index=search.sqlite\n`);
      return CLI_EXIT_OK;
    }
    const preservedStates = new Map(store.sourceStatus().map((status) => [status.source, status.state]));
    if (selectedSources && selectedShards) store.resetSourceShards({ sources: selectedSources, shards: selectedShards });
    else if (selectedSources) store.resetSources(selectedSources);
    else store.reset();
    registerBuiltinSources(store, preservedStates);
    const rebuildsSource = (source: string) => (!selectedSources || selectedSources.includes(source)) && sourceCanIndex(store, source);
    const commandsIndexed = rebuildsSource("commands") ? ensureCommandSourceIndexed(store) : 0;
    const sessionsIndexed = rebuildsSource("sessions.chats") ? ensureSessionsChatsSourceIndexed(store, input.flags) : 0;
    const databaseIndexed = rebuildsSource("database.records") ? ensureDatabaseRecordsSourceIndexed(store, input.flags) : 0;
    const workIndexed = rebuildsSource("work.items") ? ensureWorkItemsSourceIndexed(store, input.flags) : 0;
    const documentsIndexed = rebuildsSource("documents.blocks") ? ensureDocumentsBlocksSourceIndexed(store, input.flags) : 0;
    const notesIndexed = rebuildsSource("notes.pages") ? ensureNotesPagesSourceIndexed(store, input.flags) : 0;
    const knowledgeIndexed = rebuildsSource("knowledge.graph") ? ensureKnowledgeGraphSourceIndexed(store, input.flags) : 0;
    const signalsIndexed = rebuildsSource("signals.observations") ? ensureSignalsObservationsSourceIndexed(store, input.flags) : 0;
    const calendarIndexed = rebuildsSource("calendar.events") ? ensureCalendarEventsSourceIndexed(store, input.flags) : 0;
    const financeIndexed = rebuildsSource("finance.records") ? ensureFinanceRecordsSourceIndexed(store, input.flags) : 0;
    const imagesIndexed = rebuildsSource("images.derived") ? ensureImagesDerivedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const mediaIndexed = rebuildsSource("media.assets") ? ensureMediaAssetsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const generationsIndexed = rebuildsSource("generations.artifacts") ? ensureGenerationsArtifactsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const codeIndexed = rebuildsSource("code.symbols") ? ensureCodeSymbolsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const skillsIndexed = rebuildsSource("skills.registry") ? ensureSkillsRegistrySourceIndexed(store, input.flags) : 0;
    const connectorsIndexed = rebuildsSource("connectors.catalog") ? ensureConnectorsCatalogSourceIndexed(store, input.flags) : 0;
    const mcpIndexed = rebuildsSource("mcp.servers") ? ensureMcpServersSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const appsIndexed = rebuildsSource("apps.catalog") ? ensureAppsCatalogSourceIndexed(store, input.flags) : 0;
    const designIndexed = rebuildsSource("design.resources") ? ensureDesignResourcesSourceIndexed(store, input.flags) : 0;
    const runtimeIndexed = rebuildsSource("runtime.events") ? ensureRuntimeEventsSourceIndexed(store, input.flags) : 0;
    const localFilesIndexed = rebuildsSource("local.files") ? ensureLocalFilesSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const webIndexed = rebuildsSource("web.ingested") ? ensureWebIngestedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const externalIndexed = rebuildsSource("external.cache") ? ensureExternalCacheSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const indexedSourceIds = new Set([
      ...(commandsIndexed > 0 ? ["commands"] : []),
      ...(sessionsIndexed > 0 ? ["sessions.chats"] : []),
      ...(databaseIndexed > 0 ? ["database.records"] : []),
      ...(workIndexed > 0 ? ["work.items"] : []),
      ...(documentsIndexed > 0 ? ["documents.blocks"] : []),
      ...(notesIndexed > 0 ? ["notes.pages"] : []),
      ...(knowledgeIndexed > 0 ? ["knowledge.graph"] : []),
      ...(signalsIndexed > 0 ? ["signals.observations"] : []),
      ...(calendarIndexed > 0 ? ["calendar.events"] : []),
      ...(financeIndexed > 0 ? ["finance.records"] : []),
      ...(imagesIndexed > 0 ? ["images.derived"] : []),
      ...(mediaIndexed > 0 ? ["media.assets"] : []),
      ...(generationsIndexed > 0 ? ["generations.artifacts"] : []),
      ...(codeIndexed > 0 ? ["code.symbols"] : []),
      ...(skillsIndexed > 0 ? ["skills.registry"] : []),
      ...(connectorsIndexed > 0 ? ["connectors.catalog"] : []),
      ...(mcpIndexed > 0 ? ["mcp.servers"] : []),
      ...(appsIndexed > 0 ? ["apps.catalog"] : []),
      ...(designIndexed > 0 ? ["design.resources"] : []),
      ...(runtimeIndexed > 0 ? ["runtime.events"] : []),
      ...(localFilesIndexed > 0 ? ["local.files"] : []),
      ...(webIndexed > 0 ? ["web.ingested"] : []),
      ...(externalIndexed > 0 ? ["external.cache"] : []),
    ]);
    const pendingScope = selectedSources ?? BUILTIN_SEARCH_SOURCES.map((source) => source.id);
    const pendingSources = BUILTIN_SEARCH_SOURCES
      .filter((source) => pendingScope.includes(source.id))
      .filter((source) => !indexedSourceIds.has(source.id) && sourceCanIndex(store, source.id))
      .map((source) => source.id);
    const data = {
      rebuilt: true,
      mode: selectedSources && selectedShards ? "shard_scoped" : selectedSources ? "scoped" : "full",
      selectedSources: selectedSources ?? null,
      selectedShards: selectedShards ?? null,
      reindexed: commandsIndexed + sessionsIndexed + databaseIndexed + workIndexed + documentsIndexed + notesIndexed + knowledgeIndexed + signalsIndexed + calendarIndexed + financeIndexed + imagesIndexed + mediaIndexed + generationsIndexed + codeIndexed + skillsIndexed + connectorsIndexed + mcpIndexed + appsIndexed + designIndexed + runtimeIndexed + localFilesIndexed + webIndexed + externalIndexed,
      embeddings: 0,
      profile: input.flags.profile === "full" ? "full" : "framework",
      storage: searchStorageMetadata(input.flags),
      sources: Array.from(indexedSourceIds),
      indexedBySource: {
        commands: commandsIndexed,
        "sessions.chats": sessionsIndexed,
        "database.records": databaseIndexed,
        "work.items": workIndexed,
        "documents.blocks": documentsIndexed,
        "notes.pages": notesIndexed,
        "knowledge.graph": knowledgeIndexed,
        "signals.observations": signalsIndexed,
        "calendar.events": calendarIndexed,
        "finance.records": financeIndexed,
        "images.derived": imagesIndexed,
        "media.assets": mediaIndexed,
        "generations.artifacts": generationsIndexed,
        "code.symbols": codeIndexed,
        "skills.registry": skillsIndexed,
        "connectors.catalog": connectorsIndexed,
        "mcp.servers": mcpIndexed,
        "apps.catalog": appsIndexed,
        "design.resources": designIndexed,
        "runtime.events": runtimeIndexed,
        "local.files": localFilesIndexed,
        "web.ingested": webIndexed,
        "external.cache": externalIndexed,
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
  const profile: SearchProfileId = input.flags.profile === "full" ? "full" : "framework";
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
      } else if (command === "monitors" && (action === "run" || action === "evaluate")) {
        data = runSearchMonitorEvaluations(store, input, action);
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
      } else if (action === "schedule" || action === "event") {
        const source = input.flags.source ?? input.positionals[4];
        const operation = parseSearchIndexJobOperation(input.flags.operation ?? input.flags.op ?? input.positionals[3]);
        const resourceId = input.flags["resource-id"] ?? input.flags.resource ?? input.positionals[5];
        if (!source || (operation !== "upsert" && operation !== "delete") || !resourceId) {
          input.context.stderr.write(`Usage: ${input.binName} search jobs schedule <upsert|delete> --source <source-id> --resource-id <id> [--shard <shard>] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = store.scheduleIndexEvent({
          source,
          shard: input.flags.shard ?? "hot",
          operation,
          resourceId,
          payload: parseSearchJobPayloadFlag(input.flags.payload),
          priority: input.flags.priority ? Number(input.flags.priority) : undefined,
          scheduledAt: input.flags["scheduled-at"],
          observedAt: input.flags["observed-at"],
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

  if (command === "shards") {
    const store = openCliSearchStore(input.flags);
    let shards: ReturnType<SearchStore["listShards"]>;
    try {
      registerBuiltinSources(store);
      shards = store.listShards({
        source: input.flags.source,
        domain: input.flags.domain,
      });
    } finally {
      store.close();
    }
    const data = {
      state: shards.length ? "ready" : "empty",
      profile,
      source: input.flags.source ?? null,
      domain: input.flags.domain ?? null,
      shards,
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "shards" });
    else input.context.stdout.write(`${shards.map((shard) => formatSearchShardLine(shard)).join("\n")}\n`);
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
    const actions = resultId ? (indexedActions ?? []) : [
      { id: "open", kind: "open", label: "Open", requiresApproval: false },
      { id: "copy", kind: "copy", label: "Copy reference", requiresApproval: false },
    ];
    const data = {
      resultId: resultId ?? null,
      actions,
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
  const budgets = readSearchServiceWorkerBudgets(flags);
  const startedAt = Date.now();
  const items: Array<{ id: string; source: string; operation: string; status: string; indexed?: number; error?: string }> = [];
  let stoppedReason: SearchServiceWorkerStopReason = "empty";
  try {
    registerBuiltinSources(store);
    while (items.length < budgets.maxJobs) {
      if (Date.now() - startedAt >= budgets.maxRuntimeMs) {
        stoppedReason = "runtime_budget";
        break;
      }
      if (items.filter((item) => item.status === "failed").length >= budgets.maxFailures) {
        stoppedReason = "failure_budget";
        break;
      }
      const [job] = store.claimIndexJobs({
        limit: 1,
        sources: parseListFlag(flags.sources ?? flags.source),
        shards: parseListFlag(flags.shards ?? flags.shard),
        leaseMs: budgets.leaseMs,
      });
      if (!job) {
        stoppedReason = "empty";
        break;
      }
      try {
        const indexed = runSearchIndexJob(store, job, flags, cwd);
        const completed = store.completeIndexJob(job.id);
        items.push({ id: job.id, source: job.source, operation: job.operation, status: completed?.status ?? "done", indexed });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = store.failIndexJob(job.id, { error: message, retry: readBooleanish(flags.retry) });
        items.push({ id: job.id, source: job.source, operation: job.operation, status: failed?.status ?? "failed", error: message });
      }
      if (items.filter((item) => item.status === "failed").length >= budgets.maxFailures) {
        stoppedReason = "failure_budget";
        break;
      }
      if (items.length >= budgets.maxJobs) stoppedReason = "job_limit";
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
    stoppedReason,
    budgets,
    items,
  };
}

function readSearchServiceWorkerBudgets(flags: Record<string, string>): SearchServiceWorkerBudgets {
  const maxJobs = boundedNumberFlag(flags["max-jobs"] ?? flags.limit, 10, 1, 1000);
  const maxRuntimeMs = boundedNumberFlag(flags["max-runtime-ms"] ?? flags["worker-runtime-ms"], 30_000, 1, 10 * 60 * 1000);
  const maxFailures = boundedNumberFlag(flags["max-failures"] ?? flags["failure-limit"], 10, 1, 1000);
  const leaseMs = parseOptionalBoundedInteger(flags["lease-ms"], 1000, 60 * 60 * 1000);
  return {
    maxJobs,
    maxRuntimeMs,
    maxFailures,
    ...(leaseMs === undefined ? {} : { leaseMs }),
  };
}

function runSearchIndexJob(store: SearchStore, job: SearchIndexJob, flags: Record<string, string>, cwd: string): number {
  if (!sourceCanIndex(store, job.source)) return 0;
  if (job.operation === "delete") {
    if (!job.resourceId) return 0;
    store.tombstone({ source: job.source, resourceId: job.resourceId, reason: "search service delete job" });
    return 1;
  }
  if (job.operation === "upsert" && job.resourceId) {
    const indexed = runSearchResourceIndexJob(store, job, flags, cwd);
    if (indexed !== null) return indexed;
  }
  if (job.operation === "rebuild") {
    if (job.shard && job.shard !== "default") store.resetSourceShards({ sources: [job.source], shards: [job.shard] });
    else store.resetSources([job.source]);
  }
  switch (job.source) {
    case "commands":
      return ensureCommandSourceIndexed(store);
    case "sessions.chats":
      return ensureSessionsChatsSourceIndexed(store, flags);
    case "database.records":
      return ensureDatabaseRecordsSourceIndexed(store, flags);
    case "work.items":
      return ensureWorkItemsSourceIndexed(store, flags);
    case "documents.blocks":
      return ensureDocumentsBlocksSourceIndexed(store, flags);
    case "notes.pages":
      return ensureNotesPagesSourceIndexed(store, flags);
    case "knowledge.graph":
      return ensureKnowledgeGraphSourceIndexed(store, flags);
    case "signals.observations":
      return ensureSignalsObservationsSourceIndexed(store, flags);
    case "calendar.events":
      return ensureCalendarEventsSourceIndexed(store, flags);
    case "finance.records":
      return ensureFinanceRecordsSourceIndexed(store, flags);
    case "images.derived":
      return ensureImagesDerivedSourceIndexed(store, flags, cwd);
    case "media.assets":
      return ensureMediaAssetsSourceIndexed(store, flags, cwd);
    case "generations.artifacts":
      return ensureGenerationsArtifactsSourceIndexed(store, flags, cwd);
    case "code.symbols":
      return ensureCodeSymbolsSourceIndexed(store, flags, cwd);
    case "skills.registry":
      return ensureSkillsRegistrySourceIndexed(store, flags);
    case "connectors.catalog":
      return ensureConnectorsCatalogSourceIndexed(store, flags);
    case "mcp.servers":
      return ensureMcpServersSourceIndexed(store, flags, cwd);
    case "apps.catalog":
      return ensureAppsCatalogSourceIndexed(store, flags);
    case "design.resources":
      return ensureDesignResourcesSourceIndexed(store, flags);
    case "runtime.events":
      return ensureRuntimeEventsSourceIndexed(store, flags);
    case "local.files":
      return ensureLocalFilesSourceIndexed(store, flags, cwd);
    case "web.ingested":
      return ensureWebIngestedSourceIndexed(store, flags, cwd);
    case "external.cache":
      return ensureExternalCacheSourceIndexed(store, flags, cwd);
    default:
      throw new Error(`Search service cannot index source: ${job.source}`);
  }
}

function runSearchResourceIndexJob(store: SearchStore, job: SearchIndexJob, flags: Record<string, string>, cwd: string): number | null {
  switch (job.source) {
    case "database.records":
      return ensureDatabaseRecordResourceIndexed(store, flags, job);
    case "work.items":
      return ensureWorkItemResourceIndexed(store, flags, job);
    case "documents.blocks":
      return ensureDocumentBlocksResourceIndexed(store, flags, job);
    case "notes.pages": {
      const resourceId = resourceIdFromJobPayload(job, "pageId") ?? job.resourceId;
      return resourceId ? ensureNotesPageResourceIndexed(store, flags, resourceId) : 0;
    }
    case "knowledge.graph": {
      const resourceId = resourceIdFromJobPayload(job, "knowledgeResourceId") ?? job.resourceId;
      return resourceId ? ensureKnowledgeGraphResourceIndexed(store, flags, resourceId) : 0;
    }
    case "signals.observations": {
      const resourceId = resourceIdFromJobPayload(job, "signalsResourceId") ?? job.resourceId;
      return resourceId ? ensureSignalsObservationsResourceIndexed(store, flags, resourceId) : 0;
    }
    case "calendar.events": {
      const resourceId = resourceIdFromJobPayload(job, "eventId") ?? job.resourceId;
      return resourceId ? ensureCalendarEventResourceIndexed(store, flags, resourceId) : 0;
    }
    case "finance.records": {
      const resourceId = resourceIdFromJobPayload(job, "recordId") ?? job.resourceId;
      return resourceId ? ensureFinanceRecordResourceIndexed(store, flags, resourceId) : 0;
    }
    case "images.derived": {
      const resourceId = resourceIdFromJobPayload(job, "imageId") ?? job.resourceId;
      return resourceId ? ensureImageDerivedResourceIndexed(store, flags, cwd, resourceId) : 0;
    }
    case "media.assets": {
      const resourceId = resourceIdFromJobPayload(job, "mediaId") ?? job.resourceId;
      return resourceId ? ensureMediaAssetResourceIndexed(store, flags, cwd, resourceId) : 0;
    }
    case "generations.artifacts": {
      const resourceId = resourceIdFromJobPayload(job, "generationId") ?? job.resourceId;
      return resourceId ? ensureGenerationArtifactResourceIndexed(store, flags, cwd, resourceId) : 0;
    }
    case "skills.registry": {
      const resourceId = resourceIdFromJobPayload(job, "slug") ?? job.resourceId;
      return resourceId ? ensureSkillsRegistryResourceIndexed(store, flags, resourceId) : 0;
    }
    case "connectors.catalog": {
      const resourceId = resourceIdFromJobPayload(job, "operationId") ?? job.resourceId;
      return resourceId ? ensureConnectorCatalogResourceIndexed(store, flags, resourceId) : 0;
    }
    case "mcp.servers": {
      const serverId = resourceIdFromJobPayload(job, "serverId") ?? job.resourceId;
      return serverId ? ensureMcpServerResourceIndexed(store, flags, serverId, cwd, resourceIdFromJobPayload(job, "configPath")) : 0;
    }
    case "apps.catalog": {
      const appId = resourceIdFromJobPayload(job, "appId") ?? job.resourceId;
      return appId ? ensureAppCatalogResourceIndexed(store, flags, appId) : 0;
    }
    case "design.resources": {
      const resourceId = resourceIdFromJobPayload(job, "resourceId") ?? job.resourceId;
      return resourceId ? ensureDesignResourceIndexed(store, flags, resourceId) : 0;
    }
    case "runtime.events": {
      const resourceId = resourceIdFromJobPayload(job, "runtimeResourceId") ?? job.resourceId;
      return resourceId ? ensureRuntimeEventsResourceIndexed(store, flags, resourceId) : 0;
    }
    default:
      return null;
  }
}

function databaseRecordTargetFromJob(job: SearchIndexJob): { namespaceId: string; collectionName: string; recordId: string; resourceId: string } | null {
  const namespaceId = resourceIdFromJobPayload(job, "namespaceId");
  const collectionName = resourceIdFromJobPayload(job, "collection");
  const recordId = resourceIdFromJobPayload(job, "recordId");
  if (namespaceId && collectionName && recordId) {
    return { namespaceId, collectionName, recordId, resourceId: `${namespaceId}:${collectionName}:${recordId}` };
  }
  const parts = job.resourceId?.split(":") ?? [];
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { namespaceId: parts[0], collectionName: parts[1], recordId: parts[2], resourceId: job.resourceId ?? parts.join(":") };
}

function financeRecordTargetFromResourceId(resourceId: string): { namespaceId: string; collectionName: string; recordId: string } | null {
  const parts = resourceId.split(":");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { namespaceId: parts[0], collectionName: parts[1], recordId: parts[2] };
}

function documentTargetFromJob(job: SearchIndexJob): { namespaceId: string; documentId: string; resourceId: string } | null {
  const namespaceId = resourceIdFromJobPayload(job, "namespaceId");
  const documentId = resourceIdFromJobPayload(job, "documentId");
  if (namespaceId && documentId) {
    return { namespaceId, documentId, resourceId: `${namespaceId}:documents:${documentId}` };
  }
  const parts = job.resourceId?.split(":") ?? [];
  if (parts.length !== 3 || !parts[0] || parts[1] !== "documents" || !parts[2]) return null;
  return { namespaceId: parts[0], documentId: parts[2], resourceId: job.resourceId ?? parts.join(":") };
}

function resourceIdFromJobPayload(job: SearchIndexJob, key: string): string | undefined {
  const value = job.payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
    if (!dryRun && plan.status !== "blocked") {
      store.recordInteraction({
        resultId,
        actor: input.flags.actor,
        surface: input.flags.surface,
        actionId,
        kind: action.kind === "open" || action.kind === "copy" ? action.kind : "action",
        metadata: {
          status: plan.status,
          risk: plan.risk,
          grant: plan.grant,
        },
      });
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

function resolveSearchSidecarPath(flags: Record<string, string>, filename: string): string {
  const env = flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
  return path.join(resolveClawjsDataRoot(env), filename);
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

function parseCommandFallbackPolicy(value: string | undefined): CommandFallbackPolicy {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "off" || normalized === "none" || normalized === "never" || normalized === "false" || normalized === "0") return "off";
  if (normalized === "empty" || normalized === "empty-results" || normalized === "no-results" || normalized === "missing") return "empty";
  if (normalized === "always" || normalized === "on" || normalized === "true" || normalized === "1") return "always";
  return "off";
}

function commandFallbackForSearchQuery(store: SearchStore, input: {
  query: string;
  flags: Record<string, string>;
  policy: CommandFallbackPolicy;
  limit: number;
  domains?: string[];
  sources?: string[];
  shards?: string[];
  filters?: Record<string, unknown>;
  strategy?: SearchQueryInput["strategy"];
  agentBudget?: SearchQueryInput["agentBudget"];
  embedding?: SearchQueryInput["embedding"];
  explain?: boolean;
  surface?: string;
  actor?: string;
  baseResults: SearchQueryOutput;
}): {
  output?: SearchQueryOutput;
  report: {
    policy: CommandFallbackPolicy;
    applied: boolean;
    reason: "disabled" | "already_in_scope" | "not_needed" | "source_disabled" | "no_budget" | "queried";
    added: number;
  };
} {
  if (input.policy === "off") {
    return { report: { policy: "off", applied: false, reason: "disabled", added: 0 } };
  }
  if (input.domains?.includes("commands") || input.sources?.includes("commands")) {
    return { report: { policy: input.policy, applied: false, reason: "already_in_scope", added: 0 } };
  }
  if (input.policy === "empty" && input.baseResults.results.length > 0) {
    return { report: { policy: input.policy, applied: false, reason: "not_needed", added: 0 } };
  }
  if (!sourceCanIndex(store, "commands")) {
    return { report: { policy: input.policy, applied: false, reason: "source_disabled", added: 0 } };
  }
  const fallbackLimit = boundedNumberFlag(input.flags["command-fallback-limit"] ?? input.flags["fallback-commands-limit"], 5, 1, 20);
  const remaining = input.policy === "empty" ? input.limit : Math.max(0, input.limit - input.baseResults.results.length);
  const limit = Math.min(fallbackLimit, remaining);
  if (limit <= 0) {
    return { report: { policy: input.policy, applied: false, reason: "no_budget", added: 0 } };
  }
  const commandOutput = store.query({
    query: input.query,
    profile: input.flags.profile === "full" ? "full" : "framework",
    domains: ["commands"],
    shards: input.shards,
    filters: input.filters,
    strategy: input.strategy,
    agentBudget: input.agentBudget,
    embedding: input.embedding,
    limit,
    explain: input.explain,
    surface: input.surface,
    actor: input.actor,
  });
  const existingIds = new Set(input.baseResults.results.map((result) => result.id));
  const addedResults = commandOutput.results.filter((result) => !existingIds.has(result.id)).slice(0, limit);
  if (!addedResults.length) {
    return { report: { policy: input.policy, applied: true, reason: "queried", added: 0 } };
  }
  return {
    output: {
      ...input.baseResults,
      results: [...input.baseResults.results, ...addedResults].slice(0, input.limit),
      partial: input.baseResults.partial || commandOutput.partial,
      omittedSources: [...input.baseResults.omittedSources, ...commandOutput.omittedSources],
      elapsedMs: input.baseResults.elapsedMs + commandOutput.elapsedMs,
    },
    report: { policy: input.policy, applied: true, reason: "queried", added: addedResults.length },
  };
}

function runSearchMonitorEvaluations(
  store: SearchStore,
  input: {
    positionals: string[];
    flags: Record<string, string>;
    argv: string[];
    context: CliContext;
  },
  action: string,
): {
  action: string;
  items: Array<{
    monitorId: string;
    savedSearchId: string;
    name?: string;
    cadence?: string;
    enabled: boolean;
    query?: SearchQueryInput;
    state: "ready" | "missing_saved_search";
    resultCount: number;
    partial: boolean;
    omittedSources: SearchQueryOutput["omittedSources"];
    results: SearchResult[];
    evaluatedAt: string;
  }>;
  state: string;
} {
  const monitorId = input.positionals[3] ?? input.flags.id ?? input.flags.monitor;
  const includeDisabled = readBooleanFlag(input.argv, input.flags, "include-disabled") || readBooleanFlag(input.argv, input.flags, "all");
  const savedSearches = new Map(store.listSavedSearches().map((saved) => [saved.id, saved]));
  const monitors = store.listMonitors().filter((monitor) => {
    if (monitorId) return monitor.id === monitorId;
    return includeDisabled || monitor.enabled;
  });
  if (sourceCanIndex(store, "commands")) ensureCommandSourceIndexed(store);
  const limit = input.flags.limit ? Number(input.flags.limit) : undefined;
  const evaluatedAt = new Date().toISOString();
  const items = monitors.map((monitor) => {
    const saved = savedSearches.get(monitor.savedSearchId);
    if (!saved) {
      return {
        monitorId: monitor.id,
        savedSearchId: monitor.savedSearchId,
        ...(monitor.name ? { name: monitor.name } : {}),
        ...(monitor.cadence ? { cadence: monitor.cadence } : {}),
        enabled: monitor.enabled,
        state: "missing_saved_search" as const,
        resultCount: 0,
        partial: true,
        omittedSources: [
          {
            source: "saved_searches",
            reason: "error" as const,
            message: `Saved search '${monitor.savedSearchId}' was not found.`,
          },
        ],
        results: [],
        evaluatedAt,
      };
    }
    const query = {
      ...saved.query,
      ...(limit === undefined ? {} : { limit }),
    };
    const output = store.query(query);
    return {
      monitorId: monitor.id,
      savedSearchId: monitor.savedSearchId,
      name: monitor.name ?? saved.name,
      ...(monitor.cadence ? { cadence: monitor.cadence } : {}),
      enabled: monitor.enabled,
      query,
      state: "ready" as const,
      resultCount: output.results.length,
      partial: output.partial,
      omittedSources: output.omittedSources,
      results: output.results,
      evaluatedAt,
    };
  });
  const state = items.length === 0 ? "empty" : items.some((item) => item.partial) ? "partial" : "ready";
  return { action, items, state };
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

function ensureDatabaseRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = databaseRecordTargetFromJob(job);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "database.records", resourceId: target.resourceId, reason: "database record missing during Search event refresh" });
      return 1;
    }
    const document = databaseRecordSearchDocument(row);
    if (!document) {
      store.tombstone({ source: "database.records", resourceId: target.resourceId, reason: "database record skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("database.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureWorkItemsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("work.items", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) {
      store.setSourceState("work.items", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE collection_name IN (${Array.from(WORK_SEARCH_COLLECTIONS).map(() => "?").join(", ")})
      ORDER BY updated_at DESC
    `).all(...Array.from(WORK_SEARCH_COLLECTIONS)) as DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = workItemSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "work.items",
      cursor: `records:${indexed}`,
      metadata: { store: "core.sqlite", collections: Array.from(WORK_SEARCH_COLLECTIONS).sort() },
    });
    store.setSourceState("work.items", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureWorkItemResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = databaseRecordTargetFromJob(job);
  if (!target || !WORK_SEARCH_COLLECTIONS.has(target.collectionName)) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "work.items", resourceId: target.resourceId, reason: "work item missing during Search event refresh" });
      return 1;
    }
    const document = workItemSearchDocument(row);
    if (!document) {
      store.tombstone({ source: "work.items", resourceId: target.resourceId, reason: "work item skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("work.items", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
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

function ensureDocumentBlocksResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = documentTargetFromJob(job);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) return 0;
    const document = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = 'documents' AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.documentId) as DatabaseRecordRow | undefined;
    if (!document) {
      store.tombstone({ source: "documents.blocks", resourceId: target.resourceId, reason: "document missing during Search event refresh" });
      return 1;
    }
    const blockRows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = 'document_blocks'
      ORDER BY updated_at DESC
    `).all(target.namespaceId) as DatabaseRecordRow[];
    const blocks = blockRows.filter((block) => {
      const payload = parseJsonRecord(block.data_json);
      return payload.documentId === target.documentId;
    });
    const searchDocument = documentBlocksSearchDocument(document, blocks);
    if (!searchDocument) {
      store.tombstone({ source: "documents.blocks", resourceId: target.resourceId, reason: "document skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(searchDocument);
    store.setSourceState("documents.blocks", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureNotesPagesSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("notes.pages", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "pages") || !hasTable(db, "page_blocks")) {
      store.setSourceState("notes.pages", "degraded", {
        backlog: 0,
        error: "core database does not contain pages/page_blocks",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const pages = db.prepare(`
      SELECT id, title, space, surface, owner_id, author_kind, author_id, visibility, sensitivity,
        tags_json, properties_json, source_record_domain, source_record_id, created_at, updated_at, archived_at
      FROM pages
      WHERE archived_at IS NULL
      ORDER BY updated_at DESC
    `).all() as NotesPageRow[];
    const blockRows = db.prepare(`
      SELECT id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at
      FROM page_blocks
      ORDER BY page_id, sort_order ASC, created_at ASC
    `).all() as NotesPageBlockRow[];
    const blocksByPage = new Map<string, NotesPageBlockRow[]>();
    for (const block of blockRows) {
      const blocks = blocksByPage.get(block.page_id) ?? [];
      blocks.push(block);
      blocksByPage.set(block.page_id, blocks);
    }
    let indexed = 0;
    for (const page of pages) {
      const searchDocument = notesPageSearchDocument(page, blocksByPage.get(page.id) ?? []);
      if (!searchDocument) continue;
      store.upsertDocument(searchDocument);
      indexed += 1;
    }
    store.setCursor({
      source: "notes.pages",
      cursor: `pages:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["pages", "page_blocks"] },
    });
    store.setSourceState("notes.pages", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureNotesPageResourceIndexed(store: SearchStore, flags: Record<string, string>, pageId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "pages") || !hasTable(db, "page_blocks")) return 0;
    const page = db.prepare(`
      SELECT id, title, space, surface, owner_id, author_kind, author_id, visibility, sensitivity,
        tags_json, properties_json, source_record_domain, source_record_id, created_at, updated_at, archived_at
      FROM pages
      WHERE id = ?
      LIMIT 1
    `).get(pageId) as NotesPageRow | undefined;
    if (!page || page.archived_at) {
      store.tombstone({ source: "notes.pages", resourceId: pageId, reason: "note page missing during Search event refresh" });
      return 1;
    }
    const blocks = db.prepare(`
      SELECT id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at
      FROM page_blocks
      WHERE page_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(pageId) as NotesPageBlockRow[];
    const searchDocument = notesPageSearchDocument(page, blocks);
    if (!searchDocument) {
      store.tombstone({ source: "notes.pages", resourceId: pageId, reason: "note page skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(searchDocument);
    store.setSourceState("notes.pages", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureKnowledgeGraphSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("knowledge.graph", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "knowledge_entities") || !hasTable(db, "knowledge_facts")) {
      store.setSourceState("knowledge.graph", "degraded", {
        backlog: 0,
        error: "core database does not contain knowledge_entities/knowledge_facts",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const entities = db.prepare(`
      SELECT id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at
      FROM knowledge_entities
      ORDER BY updated_at DESC
    `).all() as KnowledgeEntityRow[];
    const facts = db.prepare(`
      SELECT id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json,
        sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at
      FROM knowledge_facts
      ORDER BY updated_at DESC
    `).all() as KnowledgeFactRow[];
    let indexed = 0;
    for (const entity of entities) {
      const document = knowledgeEntitySearchDocument(entity);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    for (const fact of facts) {
      const document = knowledgeFactSearchDocument(fact);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "knowledge.graph",
      cursor: `items:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["knowledge_entities", "knowledge_facts"] },
    });
    store.setSourceState("knowledge.graph", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureKnowledgeGraphResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const target = parseKnowledgeGraphResourceId(resourceId);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "knowledge_entities") || !hasTable(db, "knowledge_facts")) return 0;
    if (target.kind === "entity") {
      const entity = db.prepare(`
        SELECT id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at
        FROM knowledge_entities
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as KnowledgeEntityRow | undefined;
      if (!entity) {
        store.tombstone({ source: "knowledge.graph", resourceId, reason: "knowledge entity missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(knowledgeEntitySearchDocument(entity));
    } else {
      const fact = db.prepare(`
        SELECT id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json,
          sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at
        FROM knowledge_facts
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as KnowledgeFactRow | undefined;
      if (!fact) {
        store.tombstone({ source: "knowledge.graph", resourceId, reason: "knowledge fact missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(knowledgeFactSearchDocument(fact));
    }
    store.setSourceState("knowledge.graph", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureSignalsObservationsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("signals.observations", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "signals_verticals") || !hasTable(db, "signals_variables") || !hasTable(db, "signals_observations")) {
      store.setSourceState("signals.observations", "degraded", {
        backlog: 0,
        error: "core database does not contain signals catalog/observations tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const verticals = db.prepare(`
      SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
      FROM signals_verticals
      ORDER BY label ASC
    `).all() as SignalsVerticalRow[];
    const variables = db.prepare(`
      SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
      FROM signals_variables
      ORDER BY updated_at DESC
    `).all() as SignalsVariableRow[];
    const observations = db.prepare(`
      SELECT id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id,
        session_id, external_id, sensitive, created_at, updated_at
      FROM signals_observations
      ORDER BY recorded_at DESC
    `).all() as SignalsObservationRow[];
    const verticalsById = new Map(verticals.map((vertical) => [vertical.id, vertical]));
    const variablesById = new Map(variables.map((variable) => [variable.id, variable]));
    let indexed = 0;
    for (const vertical of verticals) {
      store.upsertDocument(signalVerticalSearchDocument(vertical));
      indexed += 1;
    }
    for (const variable of variables) {
      store.upsertDocument(signalVariableSearchDocument(variable, verticalsById.get(variable.vertical_id)));
      indexed += 1;
    }
    for (const observation of observations) {
      store.upsertDocument(signalObservationSearchDocument(observation, verticalsById.get(observation.vertical_id), variablesById.get(observation.variable_id)));
      indexed += 1;
    }
    store.setCursor({
      source: "signals.observations",
      cursor: `items:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["signals_verticals", "signals_variables", "signals_observations"] },
    });
    store.setSourceState("signals.observations", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureSignalsObservationsResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const target = parseSignalsObservationsResourceId(resourceId);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "signals_verticals") || !hasTable(db, "signals_variables") || !hasTable(db, "signals_observations")) return 0;
    if (target.kind === "vertical") {
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SignalsVerticalRow | undefined;
      if (!vertical) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals vertical missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(signalVerticalSearchDocument(vertical));
    } else if (target.kind === "variable") {
      const variable = db.prepare(`
        SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
        FROM signals_variables
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SignalsVariableRow | undefined;
      if (!variable) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals variable missing during Search event refresh" });
        return 1;
      }
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(variable.vertical_id) as SignalsVerticalRow | undefined;
      store.upsertDocument(signalVariableSearchDocument(variable, vertical));
    } else {
      const observation = db.prepare(`
        SELECT id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id,
          session_id, external_id, sensitive, created_at, updated_at
        FROM signals_observations
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SignalsObservationRow | undefined;
      if (!observation) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals observation missing during Search event refresh" });
        return 1;
      }
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(observation.vertical_id) as SignalsVerticalRow | undefined;
      const variable = db.prepare(`
        SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
        FROM signals_variables
        WHERE id = ?
        LIMIT 1
      `).get(observation.variable_id) as SignalsVariableRow | undefined;
      store.upsertDocument(signalObservationSearchDocument(observation, vertical, variable));
    }
    store.setSourceState("signals.observations", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureCalendarEventsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("calendar.events", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "calendar_events")) {
      store.setSourceState("calendar.events", "degraded", {
        backlog: 0,
        error: "core database does not contain calendar_events",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at
      FROM calendar_events
      ORDER BY starts_at ASC
    `).all() as CalendarEventRow[];
    let indexed = 0;
    for (const row of rows) {
      store.upsertDocument(calendarEventSearchDocument(row));
      indexed += 1;
    }
    store.setCursor({
      source: "calendar.events",
      cursor: `events:${indexed}`,
      metadata: { store: "core.sqlite", tables: ["calendar_events"] },
    });
    store.setSourceState("calendar.events", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureCalendarEventResourceIndexed(store: SearchStore, flags: Record<string, string>, eventId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "calendar_events")) return 0;
    const row = db.prepare(`
      SELECT id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at
      FROM calendar_events
      WHERE id = ?
      LIMIT 1
    `).get(eventId) as CalendarEventRow | undefined;
    if (!row) {
      store.tombstone({ source: "calendar.events", resourceId: eventId, reason: "calendar event missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(calendarEventSearchDocument(row));
    store.setSourceState("calendar.events", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureFinanceRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) {
      store.setSourceState("finance.records", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const placeholders = FINANCE_SEARCH_COLLECTIONS.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE collection_name IN (${placeholders})
      ORDER BY updated_at DESC
    `).all(...FINANCE_SEARCH_COLLECTIONS) as DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      store.upsertDocument(financeRecordSearchDocument(row));
      indexed += 1;
    }
    store.setCursor({
      source: "finance.records",
      cursor: `records:${indexed}`,
      metadata: { store: "core.sqlite", collections: FINANCE_SEARCH_COLLECTIONS },
    });
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureFinanceRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, recordId: string): number {
  const target = financeRecordTargetFromResourceId(recordId);
  if (!target || !FINANCE_SEARCH_COLLECTIONS.includes(target.collectionName as typeof FINANCE_SEARCH_COLLECTIONS[number])) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "finance.records", resourceId: recordId, reason: "finance record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(financeRecordSearchDocument(row));
    store.setSourceState("finance.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureSkillsRegistrySourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("skills.registry", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "skills")) {
      store.setSourceState("skills.registry", "degraded", {
        backlog: 0,
        error: "core database does not contain skills",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at
      FROM skills
      ORDER BY updated_at DESC
    `).all() as SkillRegistryRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = skillRegistrySearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "skills.registry",
      cursor: `skills:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["skills"] },
    });
    store.setSourceState("skills.registry", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureSkillsRegistryResourceIndexed(store: SearchStore, flags: Record<string, string>, slug: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "skills")) return 0;
    const row = db.prepare(`
      SELECT id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at
      FROM skills
      WHERE slug = ?
      LIMIT 1
    `).get(slug) as SkillRegistryRow | undefined;
    if (!row) {
      store.tombstone({ source: "skills.registry", resourceId: slug, reason: "skill missing during Search event refresh" });
      return 1;
    }
    const document = skillRegistrySearchDocument(row);
    if (!document) {
      store.tombstone({ source: "skills.registry", resourceId: slug, reason: "skill skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("skills.registry", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureConnectorsCatalogSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("connectors.catalog", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "connector_operations") || !hasTable(db, "connector_providers")) {
      store.setSourceState("connectors.catalog", "degraded", {
        backlog: 0,
        error: "core database does not contain connector catalog tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const capabilities = connectorCapabilitiesById(db);
    const rows = db.prepare(`
      SELECT
        o.id, o.provider_id, o.runtime_kind, o.support, o.native_name,
        o.capability_ids_json, o.risk_tiers_json, o.credential_required,
        o.cost_risk, o.requires_approval, o.network_policy_id,
        o.metadata_json, o.created_at, o.updated_at,
        p.display_name AS provider_display_name,
        p.trust_tier AS provider_trust_tier,
        p.enabled AS provider_enabled
      FROM connector_operations o
      LEFT JOIN connector_providers p ON p.id = o.provider_id
      ORDER BY o.updated_at DESC
    `).all() as ConnectorOperationRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = connectorCatalogSearchDocument(row, capabilities);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "connectors.catalog",
      cursor: `operations:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["connector_operations", "connector_providers", "connector_capabilities"] },
    });
    store.setSourceState("connectors.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureConnectorCatalogResourceIndexed(store: SearchStore, flags: Record<string, string>, operationId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "connector_operations") || !hasTable(db, "connector_providers")) return 0;
    const row = db.prepare(`
      SELECT
        o.id, o.provider_id, o.runtime_kind, o.support, o.native_name,
        o.capability_ids_json, o.risk_tiers_json, o.credential_required,
        o.cost_risk, o.requires_approval, o.network_policy_id,
        o.metadata_json, o.created_at, o.updated_at,
        p.display_name AS provider_display_name,
        p.trust_tier AS provider_trust_tier,
        p.enabled AS provider_enabled
      FROM connector_operations o
      LEFT JOIN connector_providers p ON p.id = o.provider_id
      WHERE o.id = ?
      LIMIT 1
    `).get(operationId) as ConnectorOperationRow | undefined;
    if (!row) {
      store.tombstone({ source: "connectors.catalog", resourceId: operationId, reason: "connector operation missing during Search event refresh" });
      return 1;
    }
    const document = connectorCatalogSearchDocument(row, connectorCapabilitiesById(db));
    if (!document) {
      store.tombstone({ source: "connectors.catalog", resourceId: operationId, reason: "connector operation skipped during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("connectors.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureMcpServersSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const configPath = resolveMcpSearchConfigPath(flags, cwd);
  const updatedAt = mcpConfigUpdatedAt(configPath);
  const servers = readMcpServers(configPath);
  let indexed = 0;
  for (const server of servers) {
    store.upsertDocument(mcpServerSearchDocument(server, configPath, updatedAt));
    indexed += 1;
  }
  store.setCursor({
    source: "mcp.servers",
    cursor: `config:${stableSearchId(configPath)}:servers:${indexed}`,
    metadata: { configPath, count: indexed },
  });
  store.setSourceState("mcp.servers", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function ensureMcpServerResourceIndexed(store: SearchStore, flags: Record<string, string>, serverId: string, cwd: string, configPathFromJob?: string): number {
  const configPath = configPathFromJob ? path.resolve(expandSearchHome(configPathFromJob)) : resolveMcpSearchConfigPath(flags, cwd);
  const updatedAt = mcpConfigUpdatedAt(configPath);
  const server = readMcpServers(configPath).find((entry) => entry.id === serverId);
  if (!server) {
    store.tombstone({ source: "mcp.servers", resourceId: serverId, reason: "MCP server missing during Search event refresh" });
    return 1;
  }
  store.upsertDocument(mcpServerSearchDocument(server, configPath, updatedAt));
  store.setSourceState("mcp.servers", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function ensureAppsCatalogSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "apps")) return 0;
    const rows = db.prepare(`
      SELECT id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      FROM apps
      ORDER BY pinned DESC, COALESCE(last_opened_at, updated_at) DESC
    `).all() as AppCatalogRow[];
    for (const row of rows) store.upsertDocument(appCatalogSearchDocument(row));
    store.setCursor({
      source: "apps.catalog",
      cursor: `apps:${rows.length}`,
      metadata: { store: "core.sqlite", table: "apps" },
    });
    store.setSourceState("apps.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureAppCatalogResourceIndexed(store: SearchStore, flags: Record<string, string>, appId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "apps")) return 0;
    const row = db.prepare(`
      SELECT id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      FROM apps
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(appId, appId) as AppCatalogRow | undefined;
    if (!row) {
      store.tombstone({ source: "apps.catalog", resourceId: appId, reason: "app missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(appCatalogSearchDocument(row));
    store.setSourceState("apps.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureDesignResourcesSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "design_resources")) return 0;
    const rows = db.prepare(`
      SELECT id, kind, name, root_path, manifest_json, builtin, created_at, updated_at
      FROM design_resources
      ORDER BY kind, updated_at DESC
    `).all() as DesignResourceRow[];
    for (const row of rows) store.upsertDocument(designResourceSearchDocument(row));
    store.setCursor({
      source: "design.resources",
      cursor: `resources:${rows.length}`,
      metadata: { store: "core.sqlite", table: "design_resources" },
    });
    store.setSourceState("design.resources", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureDesignResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!hasTable(db, "design_resources")) return 0;
    const row = db.prepare(`
      SELECT id, kind, name, root_path, manifest_json, builtin, created_at, updated_at
      FROM design_resources
      WHERE id = ?
      LIMIT 1
    `).get(resourceId) as DesignResourceRow | undefined;
    if (!row) {
      store.tombstone({ source: "design.resources", resourceId, reason: "design resource missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(designResourceSearchDocument(row));
    store.setSourceState("design.resources", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureRuntimeEventsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  let indexed = 0;
  const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
  if (fs.existsSync(runtimePath)) {
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (hasTable(db, "runtime_jobs")) {
        const jobs = db.prepare(`
          SELECT id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at
          FROM runtime_jobs
          ORDER BY updated_at DESC
        `).all() as RuntimeJobRow[];
        for (const job of jobs) {
          store.upsertDocument(runtimeJobSearchDocument(job));
          indexed += 1;
        }
      }
      if (hasTable(db, "runtime_events")) {
        const events = db.prepare(`
          SELECT id, job_id, kind, level, message, created_at, metadata_json
          FROM runtime_events
          ORDER BY created_at DESC
        `).all() as RuntimeEventRow[];
        for (const event of events) {
          store.upsertDocument(runtimeEventSearchDocument(event));
          indexed += 1;
        }
      }
    } finally {
      db.close();
    }
  }
  for (const sidecar of OPERATIONAL_SEARCH_SIDECARS) {
    const dbPath = resolveSearchSidecarPath(flags, sidecar.filename);
    if (!fs.existsSync(dbPath)) continue;
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      if (!hasTable(db, "operational_events")) continue;
      const rows = db.prepare(`
        SELECT id, kind, level, message, created_at, metadata_json
        FROM operational_events
        ORDER BY created_at DESC
      `).all() as OperationalEventRow[];
      for (const row of rows) {
        store.upsertDocument(operationalEventSearchDocument(row, sidecar));
        indexed += 1;
      }
    } finally {
      db.close();
    }
  }
  store.setCursor({
    source: "runtime.events",
    cursor: `items:${indexed}`,
    metadata: {
      sidecars: ["runtime.sqlite", ...OPERATIONAL_SEARCH_SIDECARS.map((entry) => entry.filename)],
    },
  });
  store.setSourceState("runtime.events", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function ensureRuntimeEventsResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  if (resourceId.startsWith("job:")) {
    const jobId = resourceId.slice("job:".length);
    const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
    if (!jobId || !fs.existsSync(runtimePath)) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job missing during Search event refresh" });
      return 1;
    }
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (!hasTable(db, "runtime_jobs")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at
        FROM runtime_jobs
        WHERE id = ?
      `).get(jobId) as RuntimeJobRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(runtimeJobSearchDocument(row));
    } finally {
      db.close();
    }
    setRuntimeEventsResourceState(store);
    return 1;
  }
  if (resourceId.startsWith("event:")) {
    const eventId = resourceId.slice("event:".length);
    const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
    if (!eventId || !fs.existsSync(runtimePath)) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event missing during Search event refresh" });
      return 1;
    }
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (!hasTable(db, "runtime_events")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, job_id, kind, level, message, created_at, metadata_json
        FROM runtime_events
        WHERE id = ?
      `).get(eventId) as RuntimeEventRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(runtimeEventSearchDocument(row));
    } finally {
      db.close();
    }
    setRuntimeEventsResourceState(store);
    return 1;
  }
  if (resourceId.startsWith("operational:")) {
    const [, domain, ...idParts] = resourceId.split(":");
    const eventId = idParts.join(":");
    const sidecar = OPERATIONAL_SEARCH_SIDECARS.find((entry) => entry.domain === domain);
    if (!sidecar || !eventId) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "operational event target missing during Search event refresh" });
      return 1;
    }
    const sidecarPath = resolveSearchSidecarPath(flags, sidecar.filename);
    if (!fs.existsSync(sidecarPath)) {
      store.tombstone({ source: "runtime.events", resourceId, reason: "operational sidecar missing during Search event refresh" });
      return 1;
    }
    const db = new Database(sidecarPath, { readonly: true, fileMustExist: true });
    try {
      if (!hasTable(db, "operational_events")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "operational event table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, kind, level, message, created_at, metadata_json
        FROM operational_events
        WHERE id = ?
      `).get(eventId) as OperationalEventRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "operational event missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(operationalEventSearchDocument(row, sidecar));
    } finally {
      db.close();
    }
    setRuntimeEventsResourceState(store);
    return 1;
  }
  store.tombstone({ source: "runtime.events", resourceId, reason: "unknown runtime event resource during Search event refresh" });
  return 1;
}

function setRuntimeEventsResourceState(store: SearchStore): void {
  store.setSourceState("runtime.events", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
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

function resolveMcpSearchConfigPath(flags: Record<string, string>, cwd: string): string {
  const configured = flags["mcp-config"] ?? flags.config ?? process.env.CLAW_MCP_CONFIG_PATH;
  if (!configured) return path.join(os.homedir(), ".codex", "config.toml");
  const expanded = expandSearchHome(configured);
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

function expandSearchHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function mcpConfigUpdatedAt(configPath: string): string {
  try {
    return fs.statSync(configPath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
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

function workItemSearchDocument(row: DatabaseRecordRow): SearchDocumentInput | null {
  if (!WORK_SEARCH_COLLECTIONS.has(row.collection_name)) return null;
  const payload = parseJsonRecord(row.data_json);
  if (payload.archivedAt || payload.archived_at || payload.deletedAt || payload.deleted_at) return null;
  const sensitive = isSensitiveRecord(payload);
  const title = titleForDatabaseRecord(row, payload);
  const fields = searchableRecordFields(payload);
  const body = fields.map(([key, value]) => `${key}: ${stringifySearchValue(value)}`).join("\n");
  const snippet = sensitive ? "[redacted]" : firstTextValue(payload) ?? body.slice(0, 180);
  const type = workItemResultType(row.collection_name);
  return {
    id: `work.items:${row.namespace_id}:${row.collection_name}:${row.id}`,
    source: "work.items",
    shard: workItemShard(payload),
    domain: "work",
    type,
    resourceId: `${row.namespace_id}:${row.collection_name}:${row.id}`,
    title,
    subtitle: `${row.collection_name} · ${row.namespace_id}`,
    snippet,
    body,
    updatedAt: row.updated_at,
    metadata: {
      namespaceId: row.namespace_id,
      collection: row.collection_name,
      recordId: row.id,
      status: stringMetadata(payload.status),
      priority: stringMetadata(payload.priority),
      projectId: stringMetadata(payload.projectId),
      goalId: stringMetadata(payload.goalId),
      assigneeActorId: stringMetadata(payload.assigneeActorId ?? payload.assignee),
      sensitive,
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 2,
      workItem: 2,
      ...(workItemShard(payload) === "hot" ? { hot: 1 } : {}),
    },
    fragments: sensitive ? [] : fields.slice(0, 16).map(([key, value], index) => ({
      id: `work.items:${row.namespace_id}:${row.collection_name}:${row.id}:field:${key}`,
      title: key,
      body: stringifySearchValue(value),
      snippet: stringifySearchValue(value).slice(0, 180),
      sortOrder: index,
      metadata: { field: key },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open work item", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy work item reference", requiresApproval: false },
    ],
  };
}

function workItemResultType(collectionName: string): string {
  if (collectionName === "people") return "person";
  if (collectionName === "inbox_threads") return "inbox_thread";
  if (collectionName === "inbox_messages") return "inbox_message";
  if (collectionName === "work_sessions") return "work_session";
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return "work_item";
}

function workItemShard(payload: Record<string, unknown>): "hot" | "cold" {
  const status = String(payload.status ?? payload.state ?? "").toLowerCase();
  if (payload.completedAt || payload.completed_at || payload.cancelledAt || payload.cancelled_at) return "cold";
  if (["done", "completed", "cancelled", "archived", "closed"].includes(status)) return "cold";
  return "hot";
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function notesPageSearchDocument(row: NotesPageRow, blockRows: NotesPageBlockRow[]): SearchDocumentInput | null {
  if (row.archived_at) return null;
  const tags = parseJsonArray(row.tags_json).filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  const properties = parseJsonRecord(row.properties_json);
  const sensitive = ["sensitive", "secret", "restricted"].includes(row.sensitivity.toLowerCase());
  const blocks = blockRows
    .filter((block) => block.page_id === row.id)
    .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at));
  const blockTexts = blocks.map((block) => block.text || textFromStructuredContent(parseJsonRecord(block.content_json))).filter(Boolean);
  const propertiesText = textFromStructuredContent(properties);
  const body = [row.title, row.space, row.surface, tags.join(" "), propertiesText, ...blockTexts].filter(Boolean).join("\n");
  const snippet = sensitive ? "[redacted]" : firstMeaningfulLine(blockTexts.join("\n")) ?? row.title;
  const blockTypes = Array.from(new Set(blocks.map((block) => block.kind || "block")));
  return {
    id: `notes.pages:${row.id}`,
    source: "notes.pages",
    domain: "notes",
    type: row.surface || "note",
    resourceId: row.id,
    title: row.title || `Note ${row.id}`,
    subtitle: [row.space, row.surface].filter(Boolean).join(" / "),
    snippet,
    body,
    updatedAt: row.updated_at,
    metadata: {
      pageId: row.id,
      space: row.space,
      surface: row.surface,
      visibility: row.visibility,
      sensitivity: row.sensitivity,
      tag: tags,
      sourceRecordDomain: row.source_record_domain,
      sourceRecordId: row.source_record_id,
      ownerId: row.owner_id,
      authorKind: row.author_kind,
      authorId: row.author_id,
      blockCount: blocks.length,
      blockType: blockTypes,
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      note: 1,
      blockCount: Math.min(blocks.length, 50) / 50,
    },
    fragments: sensitive ? [] : blocks.slice(0, 50).map((block) => {
      const text = block.text || textFromStructuredContent(parseJsonRecord(block.content_json)) || "";
      return {
        id: `notes.pages:${row.id}:block:${block.id}`,
        title: block.kind || "block",
        body: text,
        snippet: text.slice(0, 180),
        sortOrder: block.sort_order,
        metadata: {
          blockId: block.id,
          type: block.kind,
          parentBlockId: block.parent_block_id,
        },
      };
    }),
    actions: [
      { id: "open", kind: "open", label: "Open note", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy note reference", requiresApproval: false },
    ],
  };
}

function knowledgeEntitySearchDocument(row: KnowledgeEntityRow): SearchDocumentInput {
  const properties = parseJsonRecord(row.properties_json);
  const provenance = parseJsonRecord(row.provenance_json);
  const sensitive = isSensitiveKnowledge(row.sensitivity);
  const propertiesText = textFromStructuredContent(properties);
  const provenanceText = textFromStructuredContent(provenance);
  const body = [row.label, row.type, row.description, propertiesText, provenanceText, row.source].filter(Boolean).join("\n");
  return {
    id: `knowledge.graph:entity:${row.id}`,
    source: "knowledge.graph",
    domain: "knowledge",
    type: "entity",
    resourceId: `entity:${row.id}`,
    title: row.label || row.id,
    subtitle: row.type,
    snippet: sensitive ? "[redacted]" : firstMeaningfulLine(row.description ?? propertiesText ?? "") ?? row.label,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "entity",
      entityId: row.id,
      type: row.type,
      source: row.source,
      sensitivity: row.sensitivity,
      propertyNames: Object.keys(properties).sort(),
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      knowledge: 1,
      entity: 1,
    },
    fragments: sensitive ? [] : [
      ...(row.description ? [{
        id: `knowledge.graph:entity:${row.id}:description`,
        title: "description",
        body: row.description,
        snippet: row.description.slice(0, 180),
        sortOrder: 0,
      }] : []),
      ...(propertiesText ? [{
        id: `knowledge.graph:entity:${row.id}:properties`,
        title: "properties",
        body: propertiesText,
        snippet: propertiesText.slice(0, 180),
        sortOrder: 1,
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open entity", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy entity reference", requiresApproval: false },
    ],
  };
}

function knowledgeFactSearchDocument(row: KnowledgeFactRow): SearchDocumentInput {
  const scope = parseJsonRecord(row.scope_json);
  const provenance = parseJsonRecord(row.provenance_json);
  const objectValue = parseJsonValue(row.object_value_json);
  const objectText = stringifySearchValue(objectValue);
  const scopeText = textFromStructuredContent(scope);
  const provenanceText = textFromStructuredContent(provenance);
  const sensitive = isSensitiveKnowledge(row.sensitivity);
  const body = [row.subject_id, row.predicate, row.object_kind, objectText, scopeText, provenanceText, row.source].filter(Boolean).join("\n");
  return {
    id: `knowledge.graph:fact:${row.id}`,
    source: "knowledge.graph",
    domain: "knowledge",
    type: "fact",
    resourceId: `fact:${row.id}`,
    title: `${row.predicate}: ${objectText.slice(0, 80)}`,
    subtitle: [row.subject_id, row.object_kind].filter(Boolean).join(" / "),
    snippet: sensitive ? "[redacted]" : firstMeaningfulLine(objectText) ?? row.predicate,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "fact",
      factId: row.id,
      subjectId: row.subject_id,
      predicate: row.predicate,
      objectKind: row.object_kind,
      confidence: row.confidence,
      source: row.source,
      sensitivity: row.sensitivity,
      supersedesId: row.supersedes_id,
      validFrom: row.valid_from,
      validTo: row.valid_to,
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      knowledge: 1,
      fact: 1,
      confidence: typeof row.confidence === "number" ? row.confidence : 0,
    },
    fragments: sensitive ? [] : [
      {
        id: `knowledge.graph:fact:${row.id}:object`,
        title: row.predicate,
        body: objectText,
        snippet: objectText.slice(0, 180),
        sortOrder: 0,
      },
      ...(scopeText ? [{
        id: `knowledge.graph:fact:${row.id}:scope`,
        title: "scope",
        body: scopeText,
        snippet: scopeText.slice(0, 180),
        sortOrder: 1,
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open fact", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy fact reference", requiresApproval: false },
    ],
  };
}

function signalVerticalSearchDocument(row: SignalsVerticalRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = textFromStructuredContent(metadata);
  const sensitive = row.sensitive === 1;
  const body = [row.label, row.category, row.description, row.status, row.catalog_version, row.catalog_source, metadataText].filter(Boolean).join("\n");
  return {
    id: `signals.observations:vertical:${row.id}`,
    source: "signals.observations",
    domain: "signals",
    type: "vertical",
    resourceId: `vertical:${row.id}`,
    title: row.label || row.id,
    subtitle: [row.category, row.status].filter(Boolean).join(" / "),
    snippet: sensitive ? "[redacted]" : firstMeaningfulLine(row.description ?? metadataText ?? "") ?? row.label,
    body,
    updatedAt: row.synced_at,
    metadata: {
      kind: "vertical",
      verticalId: row.id,
      category: row.category,
      status: row.status,
      catalogVersion: row.catalog_version,
      catalogSource: row.catalog_source,
      sensitive,
      metadataKeys: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      signals: 1,
      vertical: 1,
    },
    fragments: sensitive || !row.description ? [] : [{
      id: `signals.observations:vertical:${row.id}:description`,
      title: "description",
      body: row.description,
      snippet: row.description.slice(0, 180),
      sortOrder: 0,
    }],
    actions: [
      { id: "open", kind: "open", label: "Open signal vertical", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy signal reference", requiresApproval: false },
    ],
  };
}

function signalVariableSearchDocument(row: SignalsVariableRow, vertical?: SignalsVerticalRow): SearchDocumentInput {
  const definition = parseJsonRecord(row.definition_json);
  const unit = parseJsonValue(row.unit_json);
  const unitText = signalUnitLabel(unit);
  const definitionText = textFromStructuredContent(definition);
  const sensitive = row.sensitive === 1 || vertical?.sensitive === 1;
  const body = [row.label, row.id, vertical?.label, row.value_type, row.category, unitText, definitionText].filter(Boolean).join("\n");
  return {
    id: `signals.observations:variable:${row.id}`,
    source: "signals.observations",
    domain: "signals",
    type: "variable",
    resourceId: `variable:${row.id}`,
    title: row.label || row.id,
    subtitle: [vertical?.label ?? row.vertical_id, row.value_type].filter(Boolean).join(" / "),
    snippet: sensitive ? "[redacted]" : firstMeaningfulLine(definitionText ?? "") ?? row.label,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "variable",
      verticalId: row.vertical_id,
      variableId: row.id,
      valueType: row.value_type,
      category: row.category,
      unit: unitText,
      sensitive,
      definitionKeys: Object.keys(definition).sort(),
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      signals: 1,
      variable: 1,
    },
    fragments: sensitive || !definitionText ? [] : [{
      id: `signals.observations:variable:${row.id}:definition`,
      title: "definition",
      body: definitionText,
      snippet: definitionText.slice(0, 180),
      sortOrder: 0,
    }],
    actions: [
      { id: "open", kind: "open", label: "Open signal variable", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy signal reference", requiresApproval: false },
    ],
  };
}

function signalObservationSearchDocument(row: SignalsObservationRow, vertical?: SignalsVerticalRow, variable?: SignalsVariableRow): SearchDocumentInput {
  const value = parseJsonValue(row.value_json);
  const source = parseJsonRecord(row.source_json);
  const valueText = stringifySearchValue(value);
  const sourceText = textFromStructuredContent(source);
  const unit = row.unit_id || signalUnitLabel(parseJsonValue(variable?.unit_json));
  const sensitive = row.sensitive === 1 || variable?.sensitive === 1 || vertical?.sensitive === 1;
  const title = `${variable?.label ?? row.variable_id}: ${valueText.slice(0, 80)}`;
  const body = [variable?.label, vertical?.label, row.variable_id, row.vertical_id, valueText, unit, row.recorded_at, row.notes, sourceText].filter(Boolean).join("\n");
  return {
    id: `signals.observations:observation:${row.id}`,
    source: "signals.observations",
    domain: "signals",
    type: "observation",
    resourceId: `observation:${row.id}`,
    title,
    subtitle: [vertical?.label ?? row.vertical_id, row.recorded_at].filter(Boolean).join(" / "),
    snippet: sensitive ? "[redacted]" : firstMeaningfulLine([valueText, row.notes ?? ""].join("\n")) ?? title,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "observation",
      observationId: row.id,
      verticalId: row.vertical_id,
      variableId: row.variable_id,
      valueType: variable?.value_type,
      unit,
      recordedAt: row.recorded_at,
      pageId: row.page_id,
      sessionId: row.session_id,
      externalId: row.external_id,
      sensitive,
      sourceKeys: Object.keys(source).sort(),
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      signals: 1,
      observation: 1,
      recent: Date.parse(row.recorded_at) > Date.now() - 1000 * 60 * 60 * 24 * 30 ? 0.2 : 0,
    },
    fragments: sensitive ? [] : [
      {
        id: `signals.observations:observation:${row.id}:value`,
        title: "value",
        body: valueText,
        snippet: valueText.slice(0, 180),
        sortOrder: 0,
      },
      ...(row.notes ? [{
        id: `signals.observations:observation:${row.id}:notes`,
        title: "notes",
        body: row.notes,
        snippet: row.notes.slice(0, 180),
        sortOrder: 1,
      }] : []),
      ...(sourceText ? [{
        id: `signals.observations:observation:${row.id}:source`,
        title: "source",
        body: sourceText,
        snippet: sourceText.slice(0, 180),
        sortOrder: 2,
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open signal observation", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy signal reference", requiresApproval: false },
    ],
  };
}

function calendarEventSearchDocument(row: CalendarEventRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = textFromStructuredContent(metadata) ?? (Object.keys(metadata).length ? JSON.stringify(metadata) : undefined);
  const body = [row.title, row.starts_at, row.ends_at, row.calendar_id, row.source, row.external_id, metadataText].filter(Boolean).join("\n");
  return {
    id: `calendar.events:${row.id}`,
    source: "calendar.events",
    domain: "calendar",
    type: "event",
    resourceId: row.id,
    title: row.title || row.id,
    subtitle: [row.starts_at, row.calendar_id].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(metadataText ?? "") ?? row.starts_at,
    body,
    updatedAt: row.updated_at,
    metadata: {
      eventId: row.id,
      calendarId: row.calendar_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      source: row.source,
      externalId: row.external_id,
      pageId: row.page_id,
      hasPage: Boolean(row.page_id),
      metadataKeys: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      calendar: 1,
      upcoming: Date.parse(row.starts_at) >= Date.now() ? 0.2 : 0,
    },
    fragments: metadataText ? [{
      id: `calendar.events:${row.id}:metadata`,
      title: "metadata",
      body: metadataText,
      snippet: metadataText.slice(0, 180),
      sortOrder: 0,
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open calendar event", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy event reference", requiresApproval: false },
    ],
  };
}

function financeRecordSearchDocument(row: DatabaseRecordRow): SearchDocumentInput {
  const payload = parseJsonRecord(row.data_json);
  const metadata = isPlainRecord(payload.metadata) ? payload.metadata : {};
  const metadataText = textFromStructuredContent(metadata) ?? (Object.keys(metadata).length ? JSON.stringify(redactExternalCachePayload(metadata)) : undefined);
  const occurredAt = stringValue(payload.postedAt) ?? stringValue(payload.occurredAt) ?? stringValue(payload.date) ?? row.updated_at;
  const kind = financeRecordKind(row.collection_name, payload);
  const currency = stringValue(payload.currency);
  const accountId = stringValue(payload.accountId) ?? stringValue(payload.account_id);
  const category = stringValue(payload.category) ?? stringValue(payload.type);
  const description = stringValue(payload.description) ?? stringValue(payload.memo) ?? stringValue(payload.number) ?? stringValue(payload.name);
  const body = [
    row.collection_name,
    kind,
    accountId,
    currency,
    occurredAt,
    stringValue(payload.merchant),
    category,
    payload.amount,
    payload.amountCents,
    description,
    metadataText,
  ].filter((value) => value !== null && value !== undefined && String(value).trim()).join("\n");
  return {
    id: `finance.records:${row.namespace_id}:${row.collection_name}:${row.id}`,
    source: "finance.records",
    domain: "finance",
    type: kind,
    resourceId: `${row.namespace_id}:${row.collection_name}:${row.id}`,
    title: `${kind} ${row.id}`,
    subtitle: [currency, occurredAt].filter(Boolean).join(" / "),
    snippet: "[redacted]",
    body,
    updatedAt: row.updated_at,
    metadata: {
      recordId: row.id,
      namespaceId: row.namespace_id,
      collection: row.collection_name,
      kind,
      accountId,
      currency,
      category,
      occurredAt,
      sensitive: true,
      metadataKeys: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: false, redacted: true },
    rankingHints: {
      fastPath: 1,
      finance: 1,
      transaction: row.collection_name === "transactions" ? 0.2 : 0,
    },
    fragments: [],
    actions: [
      { id: "open", kind: "open", label: "Open finance record", requiresApproval: true, risk: "read", grant: "search.finance.open" },
      { id: "copy-reference", kind: "copy", label: "Copy finance reference", requiresApproval: false },
    ],
  };
}

function runtimeJobSearchDocument(row: RuntimeJobRow): SearchDocumentInput {
  const payload = parseJsonRecord(row.payload_json);
  const payloadText = textFromStructuredContent(payload) ?? (Object.keys(payload).length ? JSON.stringify(payload) : undefined);
  const body = [row.title, row.kind, row.status, row.claim_owner, row.run_at, payloadText].filter(Boolean).join("\n");
  return {
    id: `runtime.events:job:${row.id}`,
    source: "runtime.events",
    domain: "runtime",
    type: "job",
    resourceId: `job:${row.id}`,
    title: row.title || row.id,
    subtitle: [row.kind, row.status].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(payloadText ?? "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      claimOwner: row.claim_owner,
      runAt: row.run_at,
      attempts: row.attempts,
      sidecar: "runtime.sqlite",
      payloadKeys: Object.keys(payload).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      runtime: 1,
      job: 1,
    },
    fragments: payloadText ? [{
      id: `runtime.events:job:${row.id}:payload`,
      title: "payload",
      body: payloadText,
      snippet: payloadText.slice(0, 180),
      sortOrder: 0,
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open runtime job", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy runtime job reference", requiresApproval: false },
    ],
  };
}

function runtimeEventSearchDocument(row: RuntimeEventRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = textFromStructuredContent(metadata) ?? (Object.keys(metadata).length ? JSON.stringify(metadata) : undefined);
  const body = [row.message, row.kind, row.level, row.job_id, metadataText].filter(Boolean).join("\n");
  return {
    id: `runtime.events:event:${row.id}`,
    source: "runtime.events",
    domain: "runtime",
    type: "event",
    resourceId: `event:${row.id}`,
    title: row.message || row.kind,
    subtitle: [row.kind, row.level].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.message || metadataText || "") ?? row.kind,
    body,
    updatedAt: row.created_at,
    metadata: {
      kind: row.kind,
      level: row.level,
      jobId: row.job_id,
      sidecar: "runtime.sqlite",
      metadataKeys: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      runtime: 1,
      event: 1,
    },
    fragments: metadataText ? [{
      id: `runtime.events:event:${row.id}:metadata`,
      title: "metadata",
      body: metadataText,
      snippet: metadataText.slice(0, 180),
      sortOrder: 0,
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open runtime event", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy runtime event reference", requiresApproval: false },
    ],
  };
}

function operationalEventSearchDocument(row: OperationalEventRow, sidecar: typeof OPERATIONAL_SEARCH_SIDECARS[number]): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = textFromStructuredContent(metadata) ?? (Object.keys(metadata).length ? JSON.stringify(metadata) : undefined);
  const body = [row.message, row.kind, row.level, sidecar.domain, metadataText].filter(Boolean).join("\n");
  return {
    id: `runtime.events:operational:${sidecar.domain}:${row.id}`,
    source: "runtime.events",
    domain: "runtime",
    type: "operational_event",
    resourceId: `operational:${sidecar.domain}:${row.id}`,
    title: row.message || `${sidecar.domain} ${row.kind}`,
    subtitle: [sidecar.domain, row.kind, row.level].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.message || metadataText || "") ?? row.kind,
    body,
    updatedAt: row.created_at,
    metadata: {
      kind: row.kind,
      level: row.level,
      sidecar: sidecar.filename,
      operationalDomain: sidecar.domain,
      metadataKeys: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      runtime: 1,
      operationalEvent: 1,
    },
    fragments: metadataText ? [{
      id: `runtime.events:operational:${sidecar.domain}:${row.id}:metadata`,
      title: "metadata",
      body: metadataText,
      snippet: metadataText.slice(0, 180),
      sortOrder: 0,
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open operational event", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy operational event reference", requiresApproval: false },
    ],
  };
}

function skillRegistrySearchDocument(row: SkillRegistryRow): SearchDocumentInput | null {
  if (!row.slug) return null;
  const scope = parseJsonRecord(row.scope_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const secretRefs = parseJsonArray(row.secret_refs_json);
  const metadataText = textFromStructuredContent(metadata);
  const body = [
    row.name,
    row.slug,
    row.kind,
    row.body,
    metadataText,
    row.export_path,
  ].filter(Boolean).join("\n");
  const scopeKind = typeof scope.kind === "string" ? scope.kind : undefined;
  return {
    id: `skills.registry:${row.slug}`,
    source: "skills.registry",
    domain: "skills",
    type: row.kind || "skill",
    resourceId: row.slug,
    title: row.name || row.slug,
    subtitle: [row.kind, scopeKind].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.body) ?? row.name ?? row.slug,
    body,
    ...(row.export_path ? { path: row.export_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      skillId: row.id,
      slug: row.slug,
      kind: row.kind,
      scopeKind: scopeKind ?? null,
      requiresProtectedRefs: secretRefs.length > 0,
      exportPath: row.export_path ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      skill: 1,
      requiresProtectedRefs: secretRefs.length > 0 ? -0.1 : 0,
    },
    fragments: row.body ? [{
      id: `skills.registry:${row.slug}:body`,
      title: "body",
      body: row.body,
      snippet: row.body.slice(0, 180),
      sortOrder: 0,
      metadata: { kind: "body" },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open skill", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy skill reference", requiresApproval: false },
    ],
  };
}

function connectorCatalogSearchDocument(row: ConnectorOperationRow, capabilitiesById: Map<string, ConnectorCapabilityRow>): SearchDocumentInput | null {
  if (!row.id) return null;
  const capabilityIds = parseJsonArray(row.capability_ids_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const riskTiers = parseJsonArray(row.risk_tiers_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const metadata = parseJsonRecord(row.metadata_json);
  const capabilities = capabilityIds
    .map((id) => capabilitiesById.get(id))
    .filter((value): value is ConnectorCapabilityRow => Boolean(value));
  const capabilityText = capabilities.map((capability) => [
    capability.id,
    capability.domain,
    capability.action,
    capability.facet,
    capability.summary,
  ].filter(Boolean).join(" ")).join("\n");
  const providerName = row.provider_display_name || row.provider_id;
  const nativeName = row.native_name || row.id;
  const body = [
    providerName,
    row.provider_id,
    row.id,
    row.runtime_kind,
    row.support,
    nativeName,
    row.cost_risk,
    row.network_policy_id,
    capabilityText,
    textFromStructuredContent(metadata),
  ].filter(Boolean).join("\n");
  const capabilityDomains = Array.from(new Set(capabilities.map((capability) => capability.domain)));
  const capabilityActions = Array.from(new Set(capabilities.map((capability) => capability.action)));
  const requiresApproval = row.requires_approval === 1;
  const costRisk = row.cost_risk || "unknown";
  return {
    id: `connectors.catalog:${row.id}`,
    source: "connectors.catalog",
    domain: "connectors",
    type: "operation",
    resourceId: row.id,
    title: `${providerName} ${nativeName}`.trim(),
    subtitle: [row.runtime_kind, row.support].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(capabilityText) ?? nativeName,
    body,
    updatedAt: row.updated_at,
    metadata: {
      provider: row.provider_id,
      providerDisplayName: providerName,
      providerTrustTier: row.provider_trust_tier ?? null,
      providerEnabled: row.provider_enabled === 1,
      runtimeKind: row.runtime_kind,
      support: row.support,
      nativeName: row.native_name ?? null,
      capabilityId: capabilityIds,
      capabilityDomain: capabilityDomains,
      capabilityAction: capabilityActions,
      riskTier: riskTiers,
      credentialRequired: row.credential_required === 1,
      costRisk,
      requiresApproval,
      networkPolicyId: row.network_policy_id ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      connectorOperation: 1,
      supported: row.support === "supported" ? 0.2 : 0,
    },
    fragments: capabilities.slice(0, 20).map((capability, index) => ({
      id: `connectors.catalog:${row.id}:capability:${capability.id}`,
      title: capability.id,
      body: [capability.domain, capability.action, capability.facet, capability.summary].filter(Boolean).join("\n"),
      snippet: capability.summary.slice(0, 180),
      sortOrder: index,
      metadata: {
        kind: "capability",
        domain: capability.domain,
        action: capability.action,
        facet: capability.facet,
      },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open connector operation", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy connector reference", requiresApproval: false },
      { id: "execute", kind: "custom", label: "Plan connector operation", requiresApproval, risk: costRisk === "none" || costRisk === "free" ? "system" : "cost", grant: "search.connectors.execute" },
    ],
  };
}

function mcpServerSearchDocument(server: JsonRecord & { id: string }, configPath: string, updatedAt: string): SearchDocumentInput {
  const transport = typeof server.url === "string" ? "http" : typeof server.command === "string" ? "stdio" : "unknown";
  const enabled = typeof server.enabled === "boolean" ? server.enabled : (typeof server.disabled === "boolean" ? !server.disabled : true);
  const command = typeof server.command === "string" ? server.command : undefined;
  const commandName = command ? path.basename(command) : undefined;
  const url = typeof server.url === "string" ? server.url : undefined;
  const urlHost = url ? safeSearchUrlHost(url) : undefined;
  const cwd = typeof server.cwd === "string" ? server.cwd : undefined;
  const envKeys = sortedRecordKeys(server.env);
  const envPassthrough = stringArray(server.env_passthrough);
  const headerKeys = sortedRecordKeys(server.headers);
  const headersFromEnvKeys = sortedRecordKeys(server.headers_from_env);
  const bearerTokenEnvVar = typeof server.bearer_token_env_var === "string" ? server.bearer_token_env_var : undefined;
  const args = Array.isArray(server.args) ? server.args : [];
  const hasEnv = envKeys.length > 0 || envPassthrough.length > 0 || !!bearerTokenEnvVar;
  const hasHeaders = headerKeys.length > 0 || headersFromEnvKeys.length > 0;
  const configName = path.basename(configPath);
  const body = [
    server.id,
    transport,
    enabled ? "enabled" : "disabled",
    commandName,
    urlHost,
    cwd ? path.basename(cwd) : undefined,
    envKeys.join(" "),
    envPassthrough.join(" "),
    headerKeys.join(" "),
    headersFromEnvKeys.join(" "),
    bearerTokenEnvVar,
  ].filter(Boolean).join("\n");
  const secretSummary = [
    envKeys.length ? `env keys: ${envKeys.join(", ")}` : "",
    envPassthrough.length ? `env passthrough: ${envPassthrough.join(", ")}` : "",
    headerKeys.length ? `header keys: ${headerKeys.join(", ")}` : "",
    headersFromEnvKeys.length ? `headers from env: ${headersFromEnvKeys.join(", ")}` : "",
    bearerTokenEnvVar ? `bearer token env var: ${bearerTokenEnvVar}` : "",
  ].filter(Boolean).join("\n");
  return {
    id: `mcp.servers:${server.id}`,
    source: "mcp.servers",
    domain: "mcp",
    type: "server",
    resourceId: server.id,
    title: server.id,
    subtitle: [transport, enabled ? "enabled" : "disabled"].filter(Boolean).join(" / "),
    snippet: [commandName, urlHost, configName].filter(Boolean).join(" / ") || transport,
    body,
    path: configPath,
    updatedAt,
    metadata: {
      serverId: server.id,
      transport,
      enabled,
      commandName: commandName ?? null,
      urlHost: urlHost ?? null,
      cwdBasename: cwd ? path.basename(cwd) : null,
      argCount: args.length,
      hasEnv,
      hasHeaders,
      envKey: envKeys,
      envPassthrough,
      headerKey: headerKeys,
      headersFromEnvKey: headersFromEnvKeys,
      bearerTokenEnvVar: bearerTokenEnvVar ?? null,
      configPath,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      mcp: 1,
      enabled: enabled ? 0.2 : -0.1,
    },
    fragments: secretSummary ? [{
      id: `mcp.servers:${server.id}:redacted-config`,
      title: "redacted config",
      body: secretSummary,
      snippet: secretSummary.slice(0, 180),
      sortOrder: 0,
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open MCP server", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy MCP reference", requiresApproval: false },
    ],
  };
}

function connectorCapabilitiesById(db: Database.Database): Map<string, ConnectorCapabilityRow> {
  if (!hasTable(db, "connector_capabilities")) return new Map();
  const rows = db.prepare(`
    SELECT id, domain, action, facet, summary
    FROM connector_capabilities
  `).all() as ConnectorCapabilityRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

interface DatabaseRecordRow {
  namespace_id: string;
  collection_name: string;
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface NotesPageRow {
  id: string;
  title: string;
  space: string;
  surface: string;
  owner_id: string | null;
  author_kind: string;
  author_id: string | null;
  visibility: string;
  sensitivity: string;
  tags_json: string;
  properties_json: string;
  source_record_domain: string | null;
  source_record_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface NotesPageBlockRow {
  id: string;
  page_id: string;
  parent_block_id: string | null;
  sort_order: number;
  kind: string;
  content_json: string;
  text: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeEntityRow {
  id: string;
  type: string;
  label: string;
  description: string | null;
  properties_json: string;
  sensitivity: string;
  source: string;
  provenance_json: string;
  created_at: string;
  updated_at: string;
}

interface KnowledgeFactRow {
  id: string;
  subject_id: string | null;
  predicate: string;
  object_kind: string;
  object_value_json: string;
  confidence: number | null;
  scope_json: string;
  sensitivity: string;
  source: string;
  provenance_json: string;
  supersedes_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

interface SignalsVerticalRow {
  id: string;
  label: string;
  category: string | null;
  description: string | null;
  status: string;
  sensitive: number;
  catalog_version: string | null;
  catalog_source: string;
  metadata_json: string;
  synced_at: string;
}

interface SignalsVariableRow {
  id: string;
  vertical_id: string;
  label: string;
  value_type: string;
  unit_json: string | null;
  category: string | null;
  sensitive: number;
  definition_json: string;
  updated_at: string;
}

interface SignalsObservationRow {
  id: string;
  vertical_id: string;
  variable_id: string;
  value_json: string;
  unit_id: string | null;
  recorded_at: string;
  source_json: string;
  notes: string | null;
  page_id: string | null;
  session_id: string | null;
  external_id: string | null;
  sensitive: number;
  created_at: string;
  updated_at: string;
}

interface CalendarEventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  calendar_id: string | null;
  source: string;
  external_id: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

interface RuntimeJobRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  claim_owner: string | null;
  run_at: string | null;
  attempts: number;
  payload_json: string;
  created_at: string;
  updated_at: string;
}

interface RuntimeEventRow {
  id: string;
  job_id: string | null;
  kind: string;
  level: string;
  message: string;
  created_at: string;
  metadata_json: string;
}

interface OperationalEventRow {
  id: string;
  kind: string;
  level: string;
  message: string;
  created_at: string;
  metadata_json: string;
}

interface SkillRegistryRow {
  id: string;
  slug: string;
  kind: string;
  name: string;
  body: string;
  scope_json: string;
  secret_refs_json: string;
  metadata_json: string;
  export_path: string | null;
  created_at: string;
  updated_at: string;
}

interface ConnectorOperationRow {
  id: string;
  provider_id: string;
  runtime_kind: string;
  support: string;
  native_name: string | null;
  capability_ids_json: string;
  risk_tiers_json: string;
  credential_required: number;
  cost_risk: string;
  requires_approval: number;
  network_policy_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  provider_display_name: string | null;
  provider_trust_tier: string | null;
  provider_enabled: number | null;
}

interface ConnectorCapabilityRow {
  id: string;
  domain: string;
  action: string;
  facet: string;
  summary: string;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).sort()
    : [];
}

function sortedRecordKeys(value: unknown): string[] {
  return isPlainRecord(value) ? Object.keys(value).sort() : [];
}

function safeSearchUrlHost(value: string): string | undefined {
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
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

function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseKnowledgeGraphResourceId(resourceId: string): { kind: "entity" | "fact"; id: string } | null {
  const separator = resourceId.indexOf(":");
  if (separator <= 0 || separator === resourceId.length - 1) return null;
  const kind = resourceId.slice(0, separator);
  if (kind !== "entity" && kind !== "fact") return null;
  return { kind, id: resourceId.slice(separator + 1) };
}

function parseSignalsObservationsResourceId(resourceId: string): { kind: "vertical" | "variable" | "observation"; id: string } | null {
  const separator = resourceId.indexOf(":");
  if (separator <= 0 || separator === resourceId.length - 1) return null;
  const kind = resourceId.slice(0, separator);
  if (kind !== "vertical" && kind !== "variable" && kind !== "observation") return null;
  return { kind, id: resourceId.slice(separator + 1) };
}

function signalUnitLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isPlainRecord(value)) {
    return stringValue(value.id)
      ?? stringValue(value.symbol)
      ?? stringValue(value.label)
      ?? stringValue(value.name);
  }
  return undefined;
}

function financeRecordKind(collectionName: string, payload: Record<string, unknown>): string {
  const explicit = stringValue(payload.kind) ?? stringValue(payload.type);
  if (explicit) return explicit;
  if (collectionName === "transactions") return "transaction";
  if (collectionName === "financial_accounts") return "financial_account";
  if (collectionName === "invoices") return "invoice";
  if (collectionName === "payment_intents") return "payment_intent";
  if (collectionName === "accounting_entries") return "accounting_entry";
  if (collectionName === "accounting_lines") return "accounting_line";
  return "finance_record";
}

function isSensitiveKnowledge(sensitivity: string): boolean {
  return ["sensitive", "private", "secret", "restricted"].includes(sensitivity.toLowerCase());
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

function parseSearchAgentBudget(flags: Record<string, string>): SearchQueryInput["agentBudget"] | undefined {
  const maxResults = parseOptionalBoundedInteger(flags["agent-result-limit"] ?? flags["agent-results-limit"], 1, 1000);
  const maxResultsPerSource = parseOptionalBoundedInteger(flags["agent-source-limit"] ?? flags["agent-results-per-source"], 1, 1000);
  const maxResultsPerDomain = parseOptionalBoundedInteger(flags["agent-domain-limit"] ?? flags["agent-results-per-domain"], 1, 1000);
  if (maxResults === undefined && maxResultsPerSource === undefined && maxResultsPerDomain === undefined) return undefined;
  return {
    ...(maxResults === undefined ? {} : { maxResults }),
    ...(maxResultsPerSource === undefined ? {} : { maxResultsPerSource }),
    ...(maxResultsPerDomain === undefined ? {} : { maxResultsPerDomain }),
  };
}

function parseOptionalBoundedInteger(value: string | undefined, min: number, max: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
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

function formatSearchShardLine(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const shard = item as { source?: string; shard?: string; domain?: string; state?: string; documentCount?: number; fragmentCount?: number };
  return `${shard.source ?? ""}\t${shard.shard ?? ""}\t${shard.domain ?? ""}\t${shard.state ?? ""}\tdocuments=${shard.documentCount ?? 0}\tfragments=${shard.fragmentCount ?? 0}`;
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
