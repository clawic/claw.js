// @clawjs-persistent-surface-ddl-source
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto"; import Database from "better-sqlite3";
import { clawCliCommandRegistry, detectClawPublicRepositories, listClawCliAliases, type ClawCliCommandRegistryEntry, type ClawCliSearchResult, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import {
  DEFAULT_SEARCH_BUDGETS,
  LOCAL_TEXT_EMBEDDING_MODEL,
  SEARCH_SOURCE_SETS,
  SearchStore,
  createBuiltinSearchSourceManifests,
  createLocalTextEmbedding,
  createSearchActionExecutionPlan,
  listSearchEntrypointContracts,
  type SearchAction,
  type SearchActionExecutionPlan,
  type SearchDocumentInput,
  type SearchIndexJob,
  type SearchSourceSetId,
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
import {
  scheduleAppsCatalogSearchEvent,
  scheduleAgentsCatalogSearchEvent,
  scheduleBusinessRecordsSearchEvent,
  scheduleCalendarEventsSearchEvent,
  scheduleCodeSymbolsSearchEvent,
  scheduleConnectorCatalogSearchEvent,
  scheduleContentItemsSearchEvent,
  scheduleDatabaseRecordSearchEvent,
  scheduleDesignResourcesSearchEvent,
  scheduleDocumentBlocksSearchEvent,
  scheduleDocsPagesSearchEvent,
  scheduleElnRecordsSearchEvent,
  scheduleExternalCacheSearchEvent,
  scheduleFinanceRecordsSearchEvent,
  scheduleFinanceRecordTableSearchEvent,
  scheduleGenerationArtifactSearchEvent,
  scheduleImageDerivedSearchEvent,
  scheduleIotConfigSearchEvent,
  scheduleKnowledgeGraphSearchEvent,
  scheduleLocalFileSearchEvent,
  scheduleMarketplaceChoicesSearchEvent,
  scheduleMediaAssetSearchEvent,
  scheduleMcpServersSearchEvent,
  scheduleNotesPagesSearchEvent,
  scheduleProvidersRoutingSearchEvent,
  scheduleRuntimeEventsSearchEvent,
  scheduleSessionChatSearchEvent,
  scheduleSheetsWorkbookSearchEvent,
  scheduleSignalsObservationsSearchEvent,
  scheduleSkillsRegistrySearchEvent,
  scheduleSlidesDeckSearchEvent,
  scheduleSnippetsLibrarySearchEvent,
  scheduleSocialPostsSearchEvent,
  scheduleSurfaceRegistrySearchEvent,
  scheduleSurfaceRouteSearchEvent,
  scheduleWebIngestedSearchEvent,
  scheduleWorkItemsSearchEvent,
  type SearchEventScheduleResult,
} from "./cli-search-events.ts";
import {
  ELN_SEARCH_COLLECTIONS,
  FINANCE_SEARCH_COLLECTIONS,
  OPERATIONAL_SEARCH_SIDECARS,
  SEARCH_ADMIN_COMMANDS,
  WORKSPACE_SEARCH_DOMAINS,
  WORK_SEARCH_COLLECTIONS,
  type BusinessRecordRow,
  type CommandFallbackPolicy,
  type SearchServiceStateFile,
  type SearchServiceWorkerBudgets,
  type SearchServiceWorkerStopReason,
} from "./cli-search-command-constants.ts";
import {
  commandFallbackForSearchQuery as importedCommandFallbackForSearchQuery,
  ensureCommandSourceIndexed as importedEnsureCommandSourceIndexed,
  parseCommandFallbackPolicy as importedParseCommandFallbackPolicy,
  sourceCanIndex as importedSourceCanIndex,
} from "./cli-search-command-source.ts";
import {
  enableNativeSystemSourceFromSnapshotFlag as importedEnableNativeSystemSourceFromSnapshotFlag,
  ensureNativeSystemSourceIndexed as importedEnsureNativeSystemSourceIndexed,
  hasNativeSystemSnapshotFlag as importedHasNativeSystemSnapshotFlag,
  type NativeSystemSearchSourceSnapshot,
  type NativeSystemSearchSourceSnapshotDocument,
} from "./cli-search-native-system-source.ts";
import { ensureCodeSymbolResourceIndexed, resolveCodeSearchRoot } from "./cli-search-code-symbols-source.ts";
import { scanSearchChangedSourceFiles } from "./cli-search-changes-scan.ts";
import { ensureDocsPageResourceIndexed, ensureDocsPagesSourceIndexed } from "./cli-search-docs-pages-source.ts";
import { ensureGenerationArtifactResourceIndexed, ensureGenerationsArtifactsSourceIndexed } from "./cli-search-generations-source.ts";
import { ensureImageDerivedResourceIndexed, ensureImagesDerivedSourceIndexed, ensureMediaAssetResourceIndexed, ensureMediaAssetsSourceIndexed } from "./cli-search-image-media-sources.ts";
import { ensureLocalFileResourceIndexed, ensureLocalFilesSourceIndexed } from "./cli-search-local-files-source.ts";
import { ensureSheetsWorkbookResourceIndexed, ensureSheetsWorkbooksSourceIndexed, ensureSlidesDeckResourceIndexed, ensureSlidesDecksSourceIndexed } from "./cli-search-slides-sheets-sources.ts";
import { ensureSurfaceRegistryResourceIndexed, ensureSurfaceRouteResourceIndexed, ensureSurfacesRegistrySourceIndexed, ensureSurfacesRoutesSourceIndexed } from "./cli-search-surface-routes-source.ts";
import { pathSafeBasename, resolveRuntimeAdapterId } from "./cli-runtime-utils.ts";
import { listReferences, readReference, referenceDir } from "./references/storage.ts";
import { listStyles, readStyle, styleManifestPath } from "./styles/storage.ts";
import { listTemplates, readTemplate, templateManifestPath } from "./templates/storage.ts";
import { resolveClawjsDataRoot, resolveClawjsMainDbPath } from "./v1-data.ts";
import { ensureV1MainSchema, readMcpServers, type JsonRecord } from "./v1-data-core.ts";
import * as SearchDocuments from "./cli-search-documents.ts";
import {
  ensureCalendarEventResourceIndexed,
  ensureCalendarEventsSourceIndexed,
  ensureDatabaseRecordResourceIndexed,
  ensureDatabaseRecordsSourceIndexed,
  ensureDocumentBlocksResourceIndexed,
  ensureDocumentsBlocksSourceIndexed,
  ensureElnRecordResourceIndexed,
  ensureElnRecordsSourceIndexed,
  ensureFinanceRecordResourceIndexed,
  ensureFinanceRecordTableResourceIndexed,
  ensureFinanceRecordsSourceIndexed,
  ensureKnowledgeGraphResourceIndexed,
  ensureKnowledgeGraphSourceIndexed,
  ensureNotesPageResourceIndexed,
  ensureNotesPagesSourceIndexed,
  ensureSessionChatResourceIndexed,
  ensureSessionsChatsSourceIndexed,
  ensureSignalsObservationsResourceIndexed,
  ensureSignalsObservationsSourceIndexed,
  ensureWorkItemResourceIndexed,
  ensureWorkItemsSourceIndexed,
} from "./cli-search-source-indexers-primary.ts";
import {
  ensureAgentsCatalogResourceIndexed,
  ensureAgentsCatalogSourceIndexed,
  ensureAppCatalogResourceIndexed,
  ensureAppsCatalogSourceIndexed,
  ensureBusinessRecordResourceIndexed,
  ensureBusinessRecordsSourceIndexed,
  ensureCodeSymbolsSourceIndexed,
  ensureConnectorCatalogResourceIndexed,
  ensureConnectorsCatalogSourceIndexed,
  ensureContentItemResourceIndexed,
  ensureContentItemsSourceIndexed,
  ensureDesignResourceIndexed,
  ensureDesignResourcesSourceIndexed,
  ensureIotConfigResourceIndexed,
  ensureIotConfigSourceIndexed,
  ensureMarketplaceChoiceResourceIndexed,
  ensureMarketplaceChoicesSourceIndexed,
  ensureMcpServerResourceIndexed,
  ensureMcpServersSourceIndexed,
  ensureProvidersRoutingResourceIndexed,
  ensureProvidersRoutingSourceIndexed,
  ensureRuntimeEventsResourceIndexed,
  ensureRuntimeEventsSourceIndexed,
  ensureSkillsRegistryResourceIndexed,
  ensureSkillsRegistrySourceIndexed,
  ensureSnippetsLibraryResourceIndexed,
  ensureSnippetsLibrarySourceIndexed,
  ensureSocialPostResourceIndexed,
  ensureSocialPostsSourceIndexed,
} from "./cli-search-source-indexers-secondary.ts";
const BUILTIN_SEARCH_SOURCES: SearchSourceManifest[] = createBuiltinSearchSourceManifests();
import {
  openCliSearchStore,
  registerCliSearchSources,
  runSearchActionExecuteCli,
  runSearchMonitorEvaluations,
  runSearchServiceAction,
  scheduleSearchChangedSourceEvent,
  searchStorageMetadata,
  sourceStateForAction,
  writeCanonicalSearchSourceState,
  expandSearchPath,
} from "./cli-search-heavy-command.ts";

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
  const sourceSet: SearchSourceSetId = input.flags["source-set"] === "full" ? "full" : "framework";
  if (command === "sources") {
    const action = input.positionals[2] ?? "list";
    const store = openCliSearchStore(input.flags);
    const sourceId = input.positionals[3] ?? input.flags.source;
    let data: {
      action: string;
      source?: string;
      state?: SearchSourceState;
      sourceSet: string;
      sources: Array<{
        id: string;
        domain: string;
        name: string;
        sourceSet: string;
        defaultState: string;
        state: string;
        fastPath: boolean;
        resultTypes: string[];
      }>;
    };
    try {
      registerCliSearchSources(store, input.flags);
      if (["enable", "disable", "pause", "exclude", "resume"].includes(action)) {
        if (!sourceId) {
          input.context.stderr.write(`Usage: ${input.binName} search sources ${action} <source-id> [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const state = sourceStateForAction(action, sourceId, input.flags);
        const error = state === "external_pending"
          ? "native.system requires a signed host adapter before it can be indexed"
          : null;
        store.setSourceState(sourceId, state, { error });
        writeCanonicalSearchSourceState(input.flags, sourceId, state, {
          sourceSet,
          actor: input.flags.actor,
          surface: input.flags.surface ?? "claw.search.sources",
        });
      }
      const statusById = new Map(store.sourceStatus().map((status) => [status.source, status]));
      const sources = BUILTIN_SEARCH_SOURCES
        .filter((source) => sourceSet === "full" || source.sourceSet === "framework")
        .map((source) => ({
          id: source.id,
          domain: source.domain,
          name: source.name,
          sourceSet: source.sourceSet,
          defaultState: source.indexing.defaultState,
          state: statusById.get(source.id)?.state ?? (source.indexing.defaultState === "on" ? "enabled" : "disabled"),
          fastPath: source.capabilities.fastPath,
          resultTypes: source.resultTypes,
        }));
      data = {
        action,
        ...(sourceId ? { source: sourceId, state: statusById.get(sourceId)?.state } : {}),
        sourceSet,
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
    let cursors: ReturnType<SearchStore["listCursors"]>;
    try {
      registerCliSearchSources(store, input.flags);
      const manifestById = new Map(BUILTIN_SEARCH_SOURCES.map((source) => [source.id, source]));
      sources = store.sourceStatus().map((status) => ({
        ...status,
        fastPath: manifestById.get(status.source)?.capabilities.fastPath ?? false,
      }));
      cursors = store.listCursors(input.flags.source);
    } finally {
      store.close();
    }
    const data = {
      state: "ready",
      sourceSet,
      budgets: DEFAULT_SEARCH_BUDGETS,
      sources,
      cursors,
      storage: searchStorageMetadata(input.flags),
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "status" });
    else input.context.stdout.write(`state=${data.state} sourceSet=${sourceSet} sources=${sources.length} index=search.sqlite\n`);
    return CLI_EXIT_OK;
  }

  if (command === "service") {
    const action = input.positionals[2] ?? "status";
    const data = runSearchServiceAction(action, input);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "service" });
    else input.context.stdout.write(`state=${data.service.state} mode=${data.service.mode} index=search.sqlite queued=${data.queuedJobs}\n`);
    return data.service.state === "external_pending" ? CLI_EXIT_DEGRADED : CLI_EXIT_OK;
  }

  if (command === "source-sets") {
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", { sourceSets: SEARCH_SOURCE_SETS }, { subcommand: "source-sets" });
    else input.context.stdout.write(`${SEARCH_SOURCE_SETS.map((entry) => `${entry.id}\t${entry.defaultEnabled ? "default" : "opt-in"}\t${entry.label}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "profiles") {
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", { profiles: SEARCH_SOURCE_SETS }, { subcommand: "profiles" });
    else input.context.stdout.write(`${SEARCH_SOURCE_SETS.map((entry) => `${entry.id}\t${entry.defaultEnabled ? "default" : "opt-in"}\t${entry.label}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "entrypoints") {
    const entrypoints = listSearchEntrypointContracts().map((entrypoint) => {
      const { hotkey, ...publicEntrypoint } = entrypoint;
      return { ...publicEntrypoint, shortcut: hotkey };
    });
    const data = {
      entrypoints,
      rootSearchShortcutState: entrypoints.find((entrypoint) => entrypoint.id === "root-search")?.shortcut.state ?? "external_pending",
      chatSearchIsolation: entrypoints.find((entrypoint) => entrypoint.id === "chat-search")?.queryScope === "conversations_only",
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "entrypoints" });
    else input.context.stdout.write(`${entrypoints.map((entrypoint) => `${entrypoint.id}\t${entrypoint.scope}\t${entrypoint.shortcut.state}\t${entrypoint.label}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "aliases") {
    const commandNames = new Set(clawCliCommandRegistry.commands.map((entry) => entry.name));
    const aliases = listClawCliAliases().map((alias) => ({
      ...alias,
      source: alias.source === "collection" ? "collection" : "command",
      searchDomain: "commands",
      resultId: commandNames.has(alias.canonicalName) ? `commands:${alias.canonicalName}` : null,
    }));
    const data = {
      aliases,
      count: aliases.length,
      rootSearchShortcutState: listSearchEntrypointContracts().find((entrypoint) => entrypoint.id === "root-search")?.hotkey.state ?? "external_pending",
      chatSearchIsolation: true,
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "aliases" });
    else input.context.stdout.write(`${aliases.map((alias) => `${alias.alias}\t${alias.canonicalName}\t${alias.source}`).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "saved" || command === "monitors") {
    const action = input.positionals[2] ?? "list";
    const store = openCliSearchStore(input.flags);
    let data: { action: string; id?: string; deleted?: boolean; item?: unknown; items: unknown[]; state: string };
    try {
      registerCliSearchSources(store, input.flags);
      if (command === "saved" && (action === "create" || action === "upsert")) {
        const id = input.positionals[3] ?? input.flags.id;
        const query = input.flags.query ?? input.positionals.slice(4).join(" ");
        if (!id || !query) {
          input.context.stderr.write(`Usage: ${input.binName} search saved create <id> --query <query> [--name <name>] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const strategy = SearchDocuments.parseSearchStrategyFlag(input.flags.strategy);
        const item = {
          id,
          name: input.flags.name ?? id,
          query: {
            query,
            sourceSet,
            domains: SearchDocuments.parseListFlag(input.flags.domains),
            sources: SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source),
            shards: SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard),
            filters: SearchDocuments.parseSearchFiltersFlag(input.flags.filters ?? input.flags.filter),
            strategy,
            embedding: SearchDocuments.parseSearchEmbeddingFlag(input.flags.embedding ?? input.flags["embedding-json"], input.flags["embedding-model"] ?? input.flags.model)
              ?? SearchDocuments.localTextEmbeddingForQuery(query, strategy, input.flags),
            agentBudget: SearchDocuments.parseSearchAgentBudget(input.flags),
            limit: input.flags.limit ? SearchDocuments.boundedNumberFlag(input.flags.limit, 20, 1, 1000) : undefined,
            explain: input.flags.explain === undefined ? undefined : input.flags.explain === "true" || input.flags.explain === "1",
            surface: input.flags.surface,
            actor: input.flags.actor,
          },
        };
        store.saveSearch(item);
        data = { action, item, items: store.listSavedSearches(), state: "ready" };
      } else if (command === "saved" && (action === "delete" || action === "remove")) {
        const id = input.positionals[3] ?? input.flags.id;
        if (!id) {
          input.context.stderr.write(`Usage: ${input.binName} search saved delete <id> [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const deleted = store.deleteSavedSearch(id);
        data = { action, id, deleted, items: store.listSavedSearches(), state: deleted ? "ready" : "missing" };
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
      } else if (command === "monitors" && (action === "delete" || action === "remove")) {
        const id = input.positionals[3] ?? input.flags.id;
        if (!id) {
          input.context.stderr.write(`Usage: ${input.binName} search monitors delete <id> [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const deleted = store.deleteMonitor(id);
        data = { action, id, deleted, items: store.listMonitors(), state: deleted ? "ready" : "missing" };
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
      registerCliSearchSources(store, input.flags);
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

  if (command === "embeddings") {
    const action = input.positionals[2] ?? "status";
    if (action === "create") {
      const text = input.positionals.slice(3).join(" ") || input.flags.text;
      if (!text) {
        input.context.stderr.write(`Usage: ${input.binName} search embeddings create <text> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const embedding = createLocalTextEmbedding(text, {
        model: localSearchEmbeddingModel(input.flags.model ?? input.flags["embedding-model"]),
      });
      const data = { state: "ready", model: embedding.model, dimensions: embedding.vector.length, vector: embedding.vector };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "embeddings" });
      else input.context.stdout.write(`model=${data.model} dimensions=${data.dimensions}\n`);
      return CLI_EXIT_OK;
    }
    const store = openCliSearchStore(input.flags);
    try {
      registerCliSearchSources(store, input.flags);
      if (action === "index") {
        const summary = store.indexLocalEmbeddings({
          sources: SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source),
          domains: SearchDocuments.parseListFlag(input.flags.domains ?? input.flags.domain),
          shards: SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard),
          limit: input.flags.limit ? Number(input.flags.limit) : undefined,
          model: localSearchEmbeddingModel(input.flags.model ?? input.flags["embedding-model"]),
        });
        const data = { state: "ready", ...summary, storage: searchStorageMetadata(input.flags) };
        if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "embeddings" });
        else input.context.stdout.write(`indexed=${data.indexed} documents=${data.documents} model=${data.model}\n`);
        return CLI_EXIT_OK;
      }
      if (action !== "status" && action !== "list") {
        input.context.stderr.write(`Usage: ${input.binName} search embeddings [status|index|create] [--source <source-id>] [--shard <shard>] [--limit <n>] [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const statusModel = input.flags.model === undefined && input.flags["embedding-model"] === undefined ? undefined : localSearchEmbeddingModel(input.flags.model ?? input.flags["embedding-model"]);
      const items = store.listEmbeddingStatus({
        sources: SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source),
        domains: SearchDocuments.parseListFlag(input.flags.domains ?? input.flags.domain),
        shards: SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard),
        model: statusModel,
      });
      const data = { state: items.length ? "ready" : "empty", model: statusModel ?? null, items, storage: searchStorageMetadata(input.flags) };
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "embeddings" });
      else input.context.stdout.write(`${items.map((item) => `${item.source}\t${item.shard}\t${item.model}\tdocuments=${item.documents}\tvectors=${item.vectors}`).join("\n")}\n`);
      return CLI_EXIT_OK;
    } finally {
      store.close();
    }
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
      registerCliSearchSources(store, input.flags);
      if (action === "enqueue" || action === "create") {
        const source = input.flags.source ?? input.positionals[4];
        const operation = SearchDocuments.parseSearchIndexJobOperation(input.flags.operation ?? input.flags.op ?? input.positionals[3]);
        if (!source || !operation) {
          input.context.stderr.write(`Usage: ${input.binName} search jobs enqueue <upsert|delete|backfill|rebuild|embed> --source <source-id> [--id <id>] [--shard <shard>] [--resource-id <id>] [--json]\n`);
          return CLI_EXIT_USAGE;
        }
        const item = store.enqueueIndexJob({
          id: input.flags.id,
          source,
          shard: input.flags.shard,
          operation,
          resourceId: input.flags["resource-id"],
          payload: SearchDocuments.parseSearchJobPayloadFlag(input.flags.payload),
          priority: input.flags.priority ? Number(input.flags.priority) : undefined,
          scheduledAt: input.flags["scheduled-at"],
        });
        data = { action, item, items: store.listIndexJobs({ source, limit: input.flags.limit ? Number(input.flags.limit) : undefined }), state: "ready" };
      } else if (action === "schedule" || action === "event") {
        const source = input.flags.source ?? input.positionals[4];
        const operation = SearchDocuments.parseSearchIndexJobOperation(input.flags.operation ?? input.flags.op ?? input.positionals[3]);
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
          payload: SearchDocuments.parseSearchJobPayloadFlag(input.flags.payload),
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
          sources: SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source),
          shards: SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard),
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
          status: SearchDocuments.parseSearchIndexJobStatus(input.flags.status),
          source: input.flags.source,
          limit: input.flags.limit ? Number(input.flags.limit) : undefined,
        });
        data = { action, items, state: items.length ? "ready" : "empty" };
      }
    } finally {
      store.close();
    }
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "jobs" });
    else input.context.stdout.write(`${data.items.map((item) => SearchDocuments.formatSearchJobLine(item)).join("\n")}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "changes" || command === "changed") {
    const action = input.positionals[2] ?? "schedule";
    if (action === "scan") {
      const source = input.flags.source ?? input.positionals[3];
      if (!source) {
        input.context.stderr.write(`Usage: ${input.binName} search changes scan --source <source-id> --root <root> [--json]\n`);
        return CLI_EXIT_USAGE;
      }
      const data = scanSearchChangedSourceFiles({
        source,
        cwd: input.context.cwd,
        flags: input.flags,
        boundedNumberFlag: SearchDocuments.boundedNumberFlag,
        expandSearchPath,
        openStore: openCliSearchStore,
        registerSources: registerCliSearchSources,
        scheduleChangedEvent: scheduleSearchChangedSourceEvent,
        stableSearchId: SearchDocuments.stableSearchId,
      });
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "changes" });
      else input.context.stdout.write(`source=${data.source} scanned=${data.scanned} upserts=${data.scheduledUpserts} deletes=${data.scheduledDeletes}\n`);
      return CLI_EXIT_OK;
    }
    const operation = SearchDocuments.parseSearchChangedOperation(input.flags.operation ?? input.flags.op ?? input.positionals[3]);
    const source = input.flags.source ?? input.positionals[4];
    if (action !== "schedule" || !operation || !source) {
      input.context.stderr.write(`Usage: ${input.binName} search changes schedule <upsert|delete> --source <source-id> [--root <root> --path <path>|--route-id <id>] [--json]\n`);
      return CLI_EXIT_USAGE;
    }
    const scheduled = scheduleSearchChangedSourceEvent({
      source,
      operation,
      cwd: input.context.cwd,
      flags: input.flags,
      positionals: input.positionals,
    });
    if (!scheduled.ok) {
      if (input.wantsJson) writeCommandJsonError(input.context.stdout, "search", new CliHandledError("search_changed_event_error", scheduled.error ?? "Search changed event could not be scheduled", CLI_EXIT_USAGE), { subcommand: "changes" });
      else input.context.stderr.write(`${scheduled.error ?? "Search changed event could not be scheduled"}\n`);
      return CLI_EXIT_USAGE;
    }
    const data = { action, source, operation, item: scheduled.job ?? null, state: scheduled.job ? "ready" : "empty" };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "changes" });
    else input.context.stdout.write(SearchDocuments.formatSearchJobLine(scheduled.job) + "\n");
    return CLI_EXIT_OK;
  }

  if (command === "shards") {
    const store = openCliSearchStore(input.flags);
    let shards: ReturnType<SearchStore["listShards"]>;
    try {
      registerCliSearchSources(store, input.flags);
      shards = store.listShards({
        source: input.flags.source,
        domain: input.flags.domain,
      });
    } finally {
      store.close();
    }
    const data = {
      state: shards.length ? "ready" : "empty",
      sourceSet,
      source: input.flags.source ?? null,
      domain: input.flags.domain ?? null,
      shards,
    };
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "shards" });
    else input.context.stdout.write(`${shards.map((shard) => SearchDocuments.formatSearchShardLine(shard)).join("\n")}\n`);
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
      registerCliSearchSources(store, input.flags);
      indexedActions = resultId ? store.actionsForResult(resultId, searchActionAccessInput(input.flags)) : null;
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
      sourceSet,
      budgets: DEFAULT_SEARCH_BUDGETS,
      matching: ["exact", "prefix", "fuzzy", "fts"],
      semantic: "optional per source with local embeddings indexed by adapters, CLI, or embed jobs",
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
