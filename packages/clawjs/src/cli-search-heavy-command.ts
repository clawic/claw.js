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
import {
  codeFileSearchDocument,
  discoverCodeSearchFiles,
  ensureCodeSymbolResourceIndexed,
  resolveCodeSearchRoot,
  upsertCodeFileSearchDocument,
} from "./cli-search-code-symbols-source.ts";
import { scanSearchChangedSourceFiles } from "./cli-search-changes-scan.ts";
import { ensureDocsPageResourceIndexed, ensureDocsPagesSourceIndexed } from "./cli-search-docs-pages-source.ts";
import { ensureGenerationArtifactResourceIndexed, ensureGenerationsArtifactsSourceIndexed } from "./cli-search-generations-source.ts";
import { ensureImageDerivedResourceIndexed, ensureImagesDerivedSourceIndexed, ensureMediaAssetResourceIndexed, ensureMediaAssetsSourceIndexed } from "./cli-search-image-media-sources.ts";
import { ensureLocalFileResourceIndexed, ensureLocalFilesSourceIndexed } from "./cli-search-local-files-source.ts";
import { ensureSheetsWorkbookResourceIndexed, ensureSheetsWorkbooksSourceIndexed, ensureSlidesDeckResourceIndexed, ensureSlidesDecksSourceIndexed } from "./cli-search-slides-sheets-sources.ts";
import { ensureSurfaceRegistryResourceIndexed, ensureSurfaceRouteResourceIndexed, ensureSurfacesRegistrySourceIndexed, ensureSurfacesRoutesSourceIndexed } from "./cli-search-surface-routes-source.ts";
import {
  ensureExternalCacheResourceIndexed,
  ensureExternalCacheSourceIndexed,
  ensureWebIngestedResourceIndexed,
  ensureWebIngestedSourceIndexed,
  redactExternalCachePayload,
  redactedStructuredText,
} from "./cli-search-web-external-source.ts";
import { pathSafeBasename, resolveRuntimeAdapterId } from "./cli-runtime-utils.ts";
import { listReferences, readReference, referenceDir } from "./references/storage.ts";
import { listStyles, readStyle, styleManifestPath } from "./styles/storage.ts";
import { listTemplates, readTemplate, templateManifestPath } from "./templates/storage.ts";
import { resolveClawjsDataRoot, resolveClawjsMainDbPath } from "./v1-data.ts";
import { ensureV1MainSchema, readMcpServers, type JsonRecord } from "./v1-data-core.ts";
import * as SearchDocuments from "./cli-search-documents.ts";
const BUILTIN_SEARCH_SOURCES: SearchSourceManifest[] = createBuiltinSearchSourceManifests();
type SimpleChangedSourceScheduleInput = {
  operation: "upsert" | "delete";
  id: string;
  dataDir: string;
  flags: Record<string, string>;
  observedAt?: string;
  workspaceRoot?: string;
};

const SIMPLE_CHANGED_SOURCE_SCHEDULES = new Map<string, {
  idFlagNames: string[];
  idLabel: string;
  workspaceRoot?: boolean;
  schedule: (input: SimpleChangedSourceScheduleInput) => SearchEventScheduleResult;
}>([
  ["images.derived", { idFlagNames: ["image-id", "image"], idLabel: "image-id", schedule: (input) => scheduleImageDerivedSearchEvent({ operation: input.operation, imageId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["media.assets", { idFlagNames: ["media-id", "media"], idLabel: "media-id", schedule: (input) => scheduleMediaAssetSearchEvent({ operation: input.operation, mediaId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["generations.artifacts", { idFlagNames: ["generation-id", "generation"], idLabel: "generation-id", schedule: (input) => scheduleGenerationArtifactSearchEvent({ operation: input.operation, generationId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["slides.decks", { idFlagNames: ["deck-id", "deck"], idLabel: "deck-id", workspaceRoot: true, schedule: (input) => scheduleSlidesDeckSearchEvent({ operation: input.operation, deckId: input.id, workspaceRoot: input.workspaceRoot ?? process.cwd(), dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["skills.registry", { idFlagNames: ["slug", "skill-slug", "skill"], idLabel: "slug", schedule: (input) => scheduleSkillsRegistrySearchEvent({ operation: input.operation, slug: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["snippets.library", { idFlagNames: ["slug", "snippet-slug", "snippet"], idLabel: "slug", schedule: (input) => scheduleSnippetsLibrarySearchEvent({ operation: input.operation, slug: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["marketplace.choices", { idFlagNames: ["choice-id", "choice"], idLabel: "choice-id", schedule: (input) => scheduleMarketplaceChoicesSearchEvent({ operation: input.operation, id: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["content.items", { idFlagNames: ["item-id", "item"], idLabel: "item-id", schedule: (input) => scheduleContentItemsSearchEvent({ operation: input.operation, itemId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["business.records", { idFlagNames: ["record-id", "record"], idLabel: "record-id", schedule: (input) => scheduleBusinessRecordsSearchEvent({ operation: input.operation, recordId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["social.posts", { idFlagNames: ["post-id", "post"], idLabel: "post-id", schedule: (input) => scheduleSocialPostsSearchEvent({ operation: input.operation, postId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["iot.config", { idFlagNames: ["config-id", "config"], idLabel: "config-id", schedule: (input) => scheduleIotConfigSearchEvent({ operation: input.operation, configId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["notes.pages", { idFlagNames: ["page-id", "page"], idLabel: "page-id", schedule: (input) => scheduleNotesPagesSearchEvent({ operation: input.operation, pageId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["calendar.events", { idFlagNames: ["event-id", "event"], idLabel: "event-id", schedule: (input) => scheduleCalendarEventsSearchEvent({ operation: input.operation, eventId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["connectors.catalog", { idFlagNames: ["operation-id", "operation"], idLabel: "operation-id", schedule: (input) => scheduleConnectorCatalogSearchEvent({ operation: input.operation, operationId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["apps.catalog", { idFlagNames: ["app-id", "app"], idLabel: "app-id", schedule: (input) => scheduleAppsCatalogSearchEvent({ operation: input.operation, appId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["design.resources", { idFlagNames: ["resource-id", "resource"], idLabel: "resource-id", workspaceRoot: true, schedule: (input) => scheduleDesignResourcesSearchEvent({ operation: input.operation, resourceId: input.id, workspaceRoot: input.workspaceRoot, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
  ["surfaces.registry", { idFlagNames: ["surface-id", "surface"], idLabel: "surface-id", schedule: (input) => scheduleSurfaceRegistrySearchEvent({ operation: input.operation, surfaceId: input.id, dataDir: input.dataDir, flags: input.flags, observedAt: input.observedAt }) }],
]);

export function isSearchAdminCommand(command: string | undefined): boolean {
  return !!command && SEARCH_ADMIN_COMMANDS.has(command);
}
export async function runSearchQueryCli(input: {
  positionals: string[];
  flags: Record<string, string>;
  argv?: string[];
  context: CliContext;
  wantsJson: boolean;
  binName: string;
}): Promise<number> {
  const query = input.positionals.slice(2).join(" ") || input.flags.query;
  if (!query) {
    input.context.stderr.write(`Usage: ${input.binName} search query <query> [--domains tasks,notes,...] [--shards hot,cold] [--strategy lexical|semantic|hybrid] [--json]\n`);
    return CLI_EXIT_USAGE;
  }
  const domains = SearchDocuments.parseListFlag(input.flags.domains);
  if (domains?.some((domain) => WORKSPACE_SEARCH_DOMAINS.has(domain))) {
    return await runWorkspaceSearchQueryCli(input, query, domains);
  }
  const scheduleRefresh = readBooleanFlag(input.argv ?? [], input.flags, "schedule-refresh");
  const persistentQuery = readBooleanFlag(input.argv ?? [], input.flags, "persistent") || scheduleRefresh;
  const searchDbPath = resolveSearchDbPath(input.flags);
  if (!persistentQuery && !fs.existsSync(searchDbPath)) {
    const data = {
      query,
      sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
      results: [],
      partial: false,
      omittedSources: [],
      stale: false,
      staleSources: [],
      elapsedMs: 0,
      strategy: SearchDocuments.parseSearchStrategyFlag(input.flags.strategy) ?? "lexical",
      embeddingModel: null,
      agentBudget: SearchDocuments.parseSearchAgentBudget(input.flags) ?? null,
      commandFallback: { policy: importedParseCommandFallbackPolicy(input.flags["command-fallback"] ?? input.flags["fallback-commands"]), applied: false, reason: "missing_index", added: 0 },
      storage: searchStorageMetadata(input.flags),
      indexState: "missing",
    };
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "query" });
    } else {
      input.context.stdout.write("");
    }
    return CLI_EXIT_DEGRADED;
  }
  const store = openCliSearchStore(input.flags);
  try {
    registerCliSearchSources(store, input.flags);
    const sources = SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source);
    const shards = SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard);
    const filters = SearchDocuments.parseSearchFiltersFlag(input.flags.filters ?? input.flags.filter);
    const strategy = SearchDocuments.parseSearchStrategyFlag(input.flags.strategy);
    const embedding = SearchDocuments.parseSearchEmbeddingFlag(input.flags.embedding ?? input.flags["embedding-json"], input.flags["embedding-model"] ?? input.flags.model)
      ?? SearchDocuments.localTextEmbeddingForQuery(query, strategy, input.flags);
    const agentBudget = SearchDocuments.parseSearchAgentBudget(input.flags);
    const limit = input.flags.limit ? SearchDocuments.boundedNumberFlag(input.flags.limit, 20, 1, 1000) : undefined;
    const sourceSet = input.flags["source-set"] === "full" ? "full" : "framework";
    const queryStaleness = scheduleSearchQueryRefreshJobs(store, {
      domains,
      sources,
      shards,
      sourceSet,
      scheduleRefresh,
    });
    const results = withSearchQueryStaleness(store.query({
      query,
      sourceSet,
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
    }), queryStaleness);
    const commandFallback = importedCommandFallbackForSearchQuery(store, {
      query,
      flags: input.flags,
      policy: importedParseCommandFallbackPolicy(input.flags["command-fallback"] ?? input.flags["fallback-commands"]),
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
    const canUseLocalDiscoveryFallback = !domains?.length && !sources?.length && !shards?.length;
    const outputResults = canUseLocalDiscoveryFallback
      ? SearchDocuments.mergeQueryOutputWithLocalDiscovery(
          commandFallback.output ?? results,
          SearchDocuments.searchRegisteredLocalFiles(query, input.context.cwd),
          limit ?? 20,
        )
      : commandFallback.output ?? results;
    if (persistentQuery && SearchDocuments.searchQueryRequiresAudit(query, outputResults.results, filters)) {
      store.recordAuditEvent({
        type: "sensitive_query",
        actor: input.flags.actor,
        surface: input.flags.surface,
        query,
        reason: "sensitive_query_or_redacted_result",
        metadata: {
          sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
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
      indexState: persistentQuery ? "ready" : "ephemeral",
      ...(queryStaleness.scheduledRefreshJobs.length ? { scheduledRefreshJobs: queryStaleness.scheduledRefreshJobs } : {}),
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

interface SearchQueryStaleness {
  staleSources: SearchQueryOutput["staleSources"];
  scheduledRefreshJobs: SearchIndexJob[];
}

function withSearchQueryStaleness(output: SearchQueryOutput, staleness: SearchQueryStaleness): SearchQueryOutput {
  if (!staleness.staleSources.length) return output;
  return {
    ...output,
    stale: true,
    staleSources: mergeSearchQueryStaleSources(output.staleSources, staleness.staleSources),
  };
}

function scheduleSearchQueryRefreshJobs(store: SearchStore, input: {
  domains?: string[];
  sources?: string[];
  shards?: string[];
  sourceSet: SearchSourceSetId;
  scheduleRefresh: boolean;
}): SearchQueryStaleness {
  const explicitlyScoped = Boolean(input.domains?.length || input.sources?.length);
  const selectedManifests = searchQuerySelectedSourceManifests(input);
  const statusBySource = new Map(store.sourceStatus().map((status) => [status.source, status]));
  const staleSources: SearchQueryOutput["staleSources"] = [];
  const scheduledRefreshJobs: SearchIndexJob[] = [];
  for (const manifest of selectedManifests) {
    if (!importedSourceCanIndex(store, manifest.id)) continue;
    const status = statusBySource.get(manifest.id);
    const activeJobs = store.listIndexJobs({ source: manifest.id, limit: 200 })
      .filter((job) => (job.status === "queued" || job.status === "leased") && searchQueryJobMatchesShards(job, input.shards));
    const hasActiveJobs = activeJobs.length > 0;
    const backlog = status?.backlog ?? 0;
    let reason: SearchQueryOutput["staleSources"][number]["reason"] | null = null;
    if (hasActiveJobs) reason = "pending_jobs";
    else if (backlog > 0) reason = "backlog";
    else if (explicitlyScoped && !status?.lastIndexedAt) reason = "never_indexed";
    if (!reason) continue;
    if (!explicitlyScoped && backlog <= 0) continue;
    staleSources.push({
      source: manifest.id,
      reason,
      backlog,
      ...(status?.lastIndexedAt ? { lastIndexedAt: status.lastIndexedAt } : {}),
    });
    if (input.scheduleRefresh && !hasActiveJobs) {
      for (const shard of input.shards?.length ? input.shards : ["default"]) {
        scheduledRefreshJobs.push(store.enqueueIndexJob({
          id: `query-refresh:${manifest.id}:${shard}`,
          source: manifest.id,
          shard,
          operation: "backfill",
          payload: {
            requestedBy: "search.query",
            sourceSet: input.sourceSet,
            staleReason: reason,
          },
          priority: 40,
        }));
      }
    }
  }
  return { staleSources, scheduledRefreshJobs };
}

function searchQuerySelectedSourceManifests(input: {
  domains?: string[];
  sources?: string[];
  sourceSet: SearchSourceSetId;
}): SearchSourceManifest[] {
  const sourceFilter = input.sources?.length ? new Set(input.sources) : null;
  const domainFilter = input.domains?.length ? new Set(input.domains) : null;
  return BUILTIN_SEARCH_SOURCES.filter((manifest) => {
    if (input.sourceSet !== "full" && manifest.sourceSet !== "framework") return false;
    if (sourceFilter && !sourceFilter.has(manifest.id)) return false;
    if (domainFilter && !domainFilter.has(manifest.domain)) return false;
    return true;
  });
}

function searchQueryJobMatchesShards(job: SearchIndexJob, shards: string[] | undefined): boolean {
  return !shards?.length || shards.includes(job.shard);
}

function mergeSearchQueryStaleSources(
  base: SearchQueryOutput["staleSources"],
  extra: SearchQueryOutput["staleSources"],
): SearchQueryOutput["staleSources"] {
  const merged = new Map<string, SearchQueryOutput["staleSources"][number]>();
  for (const staleSource of [...base, ...extra]) merged.set(staleSource.source, staleSource);
  return [...merged.values()];
}

export async function runSearchRebuildCli(input: {
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const store = openCliSearchStore(input.flags);
  try {
    const selectedSources = SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source);
    const selectedShards = SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard);
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
    registerCliSearchSources(store, input.flags);
    const enqueueRebuild = readBooleanFlag(input.argv, input.flags, "enqueue")
      || readBooleanFlag(input.argv, input.flags, "background")
      || readBooleanFlag(input.argv, input.flags, "async");
    if (enqueueRebuild) {
      const jobSources = (selectedSources ?? BUILTIN_SEARCH_SOURCES.map((source) => source.id)).filter((source) => importedSourceCanIndex(store, source));
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
          sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
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
    registerCliSearchSources(store, input.flags, preservedStates);
    importedEnableNativeSystemSourceFromSnapshotFlag({
      store,
      flags: input.flags,
      selectedSources,
      writeCanonicalSearchSourceState,
    });
    const rebuildsSource = (source: string) => (!selectedSources || selectedSources.includes(source)) && importedSourceCanIndex(store, source);
    const commandsIndexed = rebuildsSource("commands") ? importedEnsureCommandSourceIndexed(store) : 0;
    const sessionsIndexed = rebuildsSource("sessions.chats") ? ensureSessionsChatsSourceIndexed(store, input.flags) : 0;
    const databaseIndexed = rebuildsSource("database.records") ? ensureDatabaseRecordsSourceIndexed(store, input.flags) : 0;
    const workIndexed = rebuildsSource("work.items") ? ensureWorkItemsSourceIndexed(store, input.flags) : 0;
    const documentsIndexed = rebuildsSource("documents.blocks") ? ensureDocumentsBlocksSourceIndexed(store, input.flags) : 0;
    const notesIndexed = rebuildsSource("notes.pages") ? ensureNotesPagesSourceIndexed(store, input.flags) : 0;
    const knowledgeIndexed = rebuildsSource("knowledge.graph") ? ensureKnowledgeGraphSourceIndexed(store, input.flags) : 0;
    const signalsIndexed = rebuildsSource("signals.observations") ? ensureSignalsObservationsSourceIndexed(store, input.flags) : 0;
    const calendarIndexed = rebuildsSource("calendar.events") ? ensureCalendarEventsSourceIndexed(store, input.flags) : 0;
    const financeIndexed = rebuildsSource("finance.records") ? ensureFinanceRecordsSourceIndexed(store, input.flags) : 0;
    const elnIndexed = rebuildsSource("eln.records") ? ensureElnRecordsSourceIndexed(store, input.flags) : 0;
    const imagesIndexed = rebuildsSource("images.derived") ? ensureImagesDerivedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const mediaIndexed = rebuildsSource("media.assets") ? ensureMediaAssetsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const slidesIndexed = rebuildsSource("slides.decks") ? ensureSlidesDecksSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const sheetsIndexed = rebuildsSource("sheets.workbooks") ? ensureSheetsWorkbooksSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const generationsIndexed = rebuildsSource("generations.artifacts") ? ensureGenerationsArtifactsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const codeIndexed = rebuildsSource("code.symbols") ? ensureCodeSymbolsSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const docsIndexed = rebuildsSource("docs.pages") ? ensureDocsPagesSourceIndexed(store, input.context.cwd) : 0;
    const skillsIndexed = rebuildsSource("skills.registry") ? ensureSkillsRegistrySourceIndexed(store, input.flags) : 0;
    const providersIndexed = rebuildsSource("providers.routing") ? ensureProvidersRoutingSourceIndexed(store, input.flags) : 0;
    const snippetsIndexed = rebuildsSource("snippets.library") ? ensureSnippetsLibrarySourceIndexed(store, input.flags) : 0;
    const agentsIndexed = rebuildsSource("agents.catalog") ? ensureAgentsCatalogSourceIndexed(store, input.flags) : 0;
    const marketplaceIndexed = rebuildsSource("marketplace.choices") ? ensureMarketplaceChoicesSourceIndexed(store, input.flags) : 0;
    const contentIndexed = rebuildsSource("content.items") ? ensureContentItemsSourceIndexed(store, input.flags) : 0;
    const businessIndexed = rebuildsSource("business.records") ? ensureBusinessRecordsSourceIndexed(store, input.flags) : 0;
    const socialIndexed = rebuildsSource("social.posts") ? ensureSocialPostsSourceIndexed(store, input.flags) : 0;
    const iotIndexed = rebuildsSource("iot.config") ? ensureIotConfigSourceIndexed(store, input.flags) : 0;
    const connectorsIndexed = rebuildsSource("connectors.catalog") ? ensureConnectorsCatalogSourceIndexed(store, input.flags) : 0;
    const mcpIndexed = rebuildsSource("mcp.servers") ? ensureMcpServersSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const appsIndexed = rebuildsSource("apps.catalog") ? ensureAppsCatalogSourceIndexed(store, input.flags) : 0;
    const designIndexed = rebuildsSource("design.resources") ? ensureDesignResourcesSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const runtimeIndexed = rebuildsSource("runtime.events") ? ensureRuntimeEventsSourceIndexed(store, input.flags) : 0;
    const surfacesIndexed = rebuildsSource("surfaces.routes") ? ensureSurfacesRoutesSourceIndexed(store) : 0;
    const surfaceRegistryIndexed = rebuildsSource("surfaces.registry") ? ensureSurfacesRegistrySourceIndexed(store) : 0;
    const localFilesIndexed = rebuildsSource("local.files") ? ensureLocalFilesSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const webIndexed = rebuildsSource("web.ingested") ? ensureWebIngestedSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const externalIndexed = rebuildsSource("external.cache") ? ensureExternalCacheSourceIndexed(store, input.flags, input.context.cwd) : 0;
    const nativeSystemIndexed = rebuildsSource("native.system")
      ? importedEnsureNativeSystemSourceIndexed({ store, flags: input.flags, cwd: input.context.cwd, writeCanonicalSearchSourceState })
      : 0;
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
      ...(elnIndexed > 0 ? ["eln.records"] : []),
      ...(imagesIndexed > 0 ? ["images.derived"] : []),
      ...(mediaIndexed > 0 ? ["media.assets"] : []),
      ...(slidesIndexed > 0 ? ["slides.decks"] : []),
      ...(sheetsIndexed > 0 ? ["sheets.workbooks"] : []),
      ...(generationsIndexed > 0 ? ["generations.artifacts"] : []),
      ...(codeIndexed > 0 ? ["code.symbols"] : []),
      ...(docsIndexed > 0 ? ["docs.pages"] : []),
      ...(skillsIndexed > 0 ? ["skills.registry"] : []),
      ...(providersIndexed > 0 ? ["providers.routing"] : []),
      ...(snippetsIndexed > 0 ? ["snippets.library"] : []),
      ...(agentsIndexed > 0 ? ["agents.catalog"] : []),
      ...(marketplaceIndexed > 0 ? ["marketplace.choices"] : []),
      ...(contentIndexed > 0 ? ["content.items"] : []),
      ...(businessIndexed > 0 ? ["business.records"] : []),
      ...(socialIndexed > 0 ? ["social.posts"] : []),
      ...(iotIndexed > 0 ? ["iot.config"] : []),
      ...(connectorsIndexed > 0 ? ["connectors.catalog"] : []),
      ...(mcpIndexed > 0 ? ["mcp.servers"] : []),
      ...(appsIndexed > 0 ? ["apps.catalog"] : []),
      ...(designIndexed > 0 ? ["design.resources"] : []),
      ...(runtimeIndexed > 0 ? ["runtime.events"] : []),
      ...(surfacesIndexed > 0 ? ["surfaces.routes"] : []),
      ...(surfaceRegistryIndexed > 0 ? ["surfaces.registry"] : []),
      ...(localFilesIndexed > 0 ? ["local.files"] : []),
      ...(webIndexed > 0 ? ["web.ingested"] : []),
      ...(externalIndexed > 0 ? ["external.cache"] : []),
      ...(nativeSystemIndexed > 0 ? ["native.system"] : []),
    ]);
    const pendingScope = selectedSources ?? BUILTIN_SEARCH_SOURCES.map((source) => source.id);
    const pendingSources = BUILTIN_SEARCH_SOURCES
      .filter((source) => pendingScope.includes(source.id))
      .filter((source) => !indexedSourceIds.has(source.id) && importedSourceCanIndex(store, source.id))
      .map((source) => source.id);
    const data = {
      rebuilt: true,
      mode: selectedSources && selectedShards ? "shard_scoped" : selectedSources ? "scoped" : "full",
      selectedSources: selectedSources ?? null,
      selectedShards: selectedShards ?? null,
      reindexed: commandsIndexed + sessionsIndexed + databaseIndexed + workIndexed + documentsIndexed + notesIndexed + knowledgeIndexed + signalsIndexed + calendarIndexed + financeIndexed + elnIndexed + imagesIndexed + mediaIndexed + slidesIndexed + sheetsIndexed + generationsIndexed + codeIndexed + docsIndexed + skillsIndexed + providersIndexed + snippetsIndexed + agentsIndexed + marketplaceIndexed + contentIndexed + businessIndexed + socialIndexed + iotIndexed + connectorsIndexed + mcpIndexed + appsIndexed + designIndexed + runtimeIndexed + surfacesIndexed + surfaceRegistryIndexed + localFilesIndexed + webIndexed + externalIndexed + nativeSystemIndexed,
      embeddings: 0,
      sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
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
        "eln.records": elnIndexed,
        "images.derived": imagesIndexed,
        "media.assets": mediaIndexed,
        "slides.decks": slidesIndexed,
        "sheets.workbooks": sheetsIndexed,
        "generations.artifacts": generationsIndexed,
        "code.symbols": codeIndexed,
        "docs.pages": docsIndexed,
        "skills.registry": skillsIndexed,
        "providers.routing": providersIndexed,
        "snippets.library": snippetsIndexed,
        "agents.catalog": agentsIndexed,
        "marketplace.choices": marketplaceIndexed,
        "content.items": contentIndexed,
        "business.records": businessIndexed,
        "social.posts": socialIndexed,
        "iot.config": iotIndexed,
        "connectors.catalog": connectorsIndexed,
        "mcp.servers": mcpIndexed,
        "apps.catalog": appsIndexed,
        "design.resources": designIndexed,
        "runtime.events": runtimeIndexed,
        "surfaces.routes": surfacesIndexed,
        "surfaces.registry": surfaceRegistryIndexed,
        "local.files": localFilesIndexed,
        "web.ingested": webIndexed,
        "external.cache": externalIndexed,
        "native.system": nativeSystemIndexed,
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
        SearchDocuments.boundedNumberFlag,
        expandSearchPath,
        openStore: openCliSearchStore,
        registerSources: registerCliSearchSources,
        scheduleChangedEvent: scheduleSearchChangedSourceEvent,
        SearchDocuments.stableSearchId,
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
    registerCliSearchSources(store, flags);
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
    registerCliSearchSources(store, flags);
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
        sources: SearchDocuments.parseListFlag(flags.sources ?? flags.source),
        shards: SearchDocuments.parseListFlag(flags.shards ?? flags.shard),
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
        const message = searchWorkerErrorMessage(error);
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

function searchWorkerErrorMessage(error: unknown): string {
  if (error instanceof CliHandledError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function scheduleSearchChangedSourceEvent(input: {
  source: string;
  operation: "upsert" | "delete";
  cwd: string;
  flags: Record<string, string>;
  positionals: string[];
}): SearchEventScheduleResult {
  const dataDir = input.flags["data-dir"] ?? resolveClawjsDataRoot();
  const observedAt = input.flags["observed-at"];
  const filePath = input.flags.path ?? input.flags.file ?? input.flags["file-path"] ?? input.positionals[5];
  const root = input.flags.root
    ?? input.flags["code-root"]
    ?? input.flags["file-root"]
    ?? input.flags["web-root"]
    ?? input.flags["external-root"];
  switch (input.source) {
    case "code.symbols":
      if (!root || !filePath) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source code.symbols --root <code-root> --path <file>" };
      return scheduleCodeSymbolsSearchEvent({
        operation: input.operation,
        root: path.resolve(input.cwd, expandSearchPath(root)),
        filePath: path.resolve(input.cwd, expandSearchPath(filePath)),
        dataDir,
        flags: input.flags,
        observedAt,
      });
    case "local.files":
      if (!root || !filePath) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source local.files --root <file-root> --path <file>" };
      return scheduleLocalFileSearchEvent({
        operation: input.operation,
        root: path.resolve(input.cwd, expandSearchPath(root)),
        filePath: path.resolve(input.cwd, expandSearchPath(filePath)),
        dataDir,
        flags: input.flags,
        observedAt,
      });
    case "web.ingested":
      if (!root || !filePath) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source web.ingested --root <web-root> --path <file>" };
      return scheduleWebIngestedSearchEvent({
        operation: input.operation,
        root: path.resolve(input.cwd, expandSearchPath(root)),
        filePath: path.resolve(input.cwd, expandSearchPath(filePath)),
        dataDir,
        flags: input.flags,
        observedAt,
      });
    case "external.cache":
      if (!root || !filePath) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source external.cache --root <external-root> --path <file>" };
      return scheduleExternalCacheSearchEvent({
        operation: input.operation,
        root: path.resolve(input.cwd, expandSearchPath(root)),
        filePath: path.resolve(input.cwd, expandSearchPath(filePath)),
        dataDir,
        flags: input.flags,
        observedAt,
      });
    case "surfaces.routes": {
      const routeId = input.flags["route-id"] ?? input.flags["resource-id"] ?? input.flags.route ?? input.positionals[5];
      if (!routeId) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source surfaces.routes --route-id <route-id>" };
      return scheduleSurfaceRouteSearchEvent({
        operation: input.operation,
        routeId,
        dataDir,
        flags: input.flags,
        observedAt,
      });
    }
    case "surfaces.registry": {
      const surfaceId = input.flags["surface-id"] ?? input.flags["resource-id"] ?? input.flags.surface ?? input.positionals[5];
      if (!surfaceId) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source surfaces.registry --surface-id <surface-id>" };
      return scheduleSurfaceRegistrySearchEvent({
        operation: input.operation,
        surfaceId,
        dataDir,
        flags: input.flags,
        observedAt,
      });
    }
    case "sessions.chats": {
      const sessionId = input.flags["session-id"] ?? input.flags["resource-id"] ?? input.flags.session ?? input.positionals[5];
      if (!sessionId) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source sessions.chats --session-id <session-id>" };
      return scheduleSessionChatSearchEvent({
        operation: input.operation,
        sessionId,
        dataDir,
        flags: input.flags,
        observedAt,
      });
    }
    case "docs.pages": {
      const workspaceRoot = input.flags.workspace ?? root ?? input.cwd;
      if (!filePath) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source docs.pages --workspace <workspace-root> --path <file>" };
      return scheduleDocsPagesSearchEvent({
        operation: input.operation,
        workspaceRoot: path.resolve(input.cwd, expandSearchPath(workspaceRoot)),
        filePath: path.resolve(input.cwd, expandSearchPath(filePath)),
        dataDir,
        flags: input.flags,
        observedAt,
      });
    }
    case "sheets.workbooks": {
      const workbookId = input.flags["workbook-id"] ?? input.flags["resource-id"] ?? input.flags.workbook ?? input.positionals[5];
      const workspaceRoot = input.flags.workspace ?? root ?? input.cwd;
      if (!workbookId) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source sheets.workbooks --workbook-id <workbook-id> [--workspace <workspace-root>]" };
      return scheduleSheetsWorkbookSearchEvent({
        operation: input.operation,
        workbookId,
        workspaceRoot: path.resolve(input.cwd, expandSearchPath(workspaceRoot)),
        dataDir,
        flags: input.flags,
        observedAt,
      });
    }
    case "database.records":
      return scheduleDatabaseOrWorkChangedSourceEvent(input, { dataDir, observedAt, source: "database.records" });
    case "work.items":
      return scheduleDatabaseOrWorkChangedSourceEvent(input, { dataDir, observedAt, source: "work.items" });
    case "documents.blocks":
      return scheduleDocumentBlocksChangedSourceEvent(input, { dataDir, observedAt });
    case "knowledge.graph":
      return scheduleKnowledgeGraphChangedSourceEvent(input, { dataDir, observedAt });
    case "signals.observations":
      return scheduleSignalsObservationsChangedSourceEvent(input, { dataDir, observedAt });
    case "finance.records":
      return scheduleFinanceRecordsChangedSourceEvent(input, { dataDir, observedAt });
    case "eln.records":
      return scheduleNamespaceRecordChangedSourceEvent(input, { dataDir, observedAt, source: "eln.records" });
    case "providers.routing":
      return scheduleProvidersRoutingChangedSourceEvent(input, { dataDir, observedAt });
    case "agents.catalog":
      return scheduleAgentsCatalogChangedSourceEvent(input, { dataDir, observedAt });
    case "mcp.servers":
      return scheduleMcpServersChangedSourceEvent(input, { dataDir, observedAt });
    case "runtime.events":
      return scheduleRuntimeEventsChangedSourceEvent(input, { dataDir, observedAt });
    default:
      return scheduleSimpleChangedSourceEvent(input, { dataDir, observedAt, root });
  }
}

function scheduleDatabaseOrWorkChangedSourceEvent(input: {
  source: string;
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string; source: "database.records" | "work.items" }): SearchEventScheduleResult {
  const namespaceId = input.flags["namespace-id"] ?? input.flags.namespace;
  const collectionName = input.flags["collection-name"] ?? input.flags.collection;
  const recordId = input.flags["record-id"] ?? input.flags["resource-id"] ?? input.flags.record ?? input.positionals[5];
  if (!namespaceId || !collectionName || !recordId) {
    return { ok: false, error: `Usage: claw search changes schedule <upsert|delete> --source ${options.source} --namespace <id> --collection <name> --record-id <id>` };
  }
  if (options.source === "database.records") {
    return scheduleDatabaseRecordSearchEvent({
      operation: input.operation,
      namespaceId,
      collectionName,
      recordId,
      dataDir: options.dataDir,
      flags: input.flags,
      observedAt: options.observedAt,
    });
  }
  return scheduleWorkItemsSearchEvent({
    operation: input.operation,
    namespaceId,
    collectionName,
    recordId,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleDocumentBlocksChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const namespaceId = input.flags["namespace-id"] ?? input.flags.namespace;
  const documentId = input.flags["document-id"] ?? input.flags.document ?? input.flags["resource-id"] ?? input.positionals[5];
  const collectionName = input.flags["collection-name"] ?? input.flags.collection ?? "documents";
  if (collectionName !== "documents" && collectionName !== "document_blocks") {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source documents.blocks --namespace <id> --document-id <id> [--collection documents|document_blocks --record-id <id>]" };
  }
  const recordId = input.flags["record-id"] ?? input.flags.record ?? (collectionName === "documents" ? documentId : undefined);
  if (!namespaceId || !documentId || !recordId) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source documents.blocks --namespace <id> --document-id <id> [--collection documents|document_blocks --record-id <id>]" };
  }
  return scheduleDocumentBlocksSearchEvent({
    operation: input.operation,
    namespaceId,
    documentId,
    collectionName,
    recordId,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleKnowledgeGraphChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const kind = input.flags.kind ?? input.flags.type;
  if (kind !== "entity" && kind !== "fact") {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source knowledge.graph --kind entity|fact --id <id>" };
  }
  const id = input.flags.id
    ?? input.flags["resource-id"]
    ?? (kind === "entity" ? input.flags["entity-id"] : input.flags["fact-id"])
    ?? input.positionals[5];
  if (!id) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source knowledge.graph --kind entity|fact --id <id>" };
  }
  return scheduleKnowledgeGraphSearchEvent({
    operation: input.operation,
    kind,
    id,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleSignalsObservationsChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const kind = input.flags.kind ?? input.flags.type;
  if (kind !== "vertical" && kind !== "variable" && kind !== "observation") {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source signals.observations --kind vertical|variable|observation --id <id>" };
  }
  const id = input.flags.id
    ?? input.flags["resource-id"]
    ?? (kind === "vertical" ? input.flags["vertical-id"] : kind === "variable" ? input.flags["variable-id"] : input.flags["observation-id"])
    ?? input.positionals[5];
  if (!id) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source signals.observations --kind vertical|variable|observation --id <id>" };
  }
  return scheduleSignalsObservationsSearchEvent({
    operation: input.operation,
    kind,
    id,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleNamespaceRecordChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string; source: "eln.records" }): SearchEventScheduleResult {
  const namespaceId = input.flags["namespace-id"] ?? input.flags.namespace;
  const collectionName = input.flags["collection-name"] ?? input.flags.collection;
  const recordId = input.flags["record-id"] ?? input.flags["resource-id"] ?? input.flags.record ?? input.positionals[5];
  if (!namespaceId || !collectionName || !recordId) {
    return { ok: false, error: `Usage: claw search changes schedule <upsert|delete> --source ${options.source} --namespace <id> --collection <name> --record-id <id>` };
  }
  return scheduleElnRecordsSearchEvent({
    operation: input.operation,
    namespaceId,
    collectionName,
    recordId,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleFinanceRecordsChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const table = input.flags.table;
  const recordId = input.flags["record-id"] ?? input.flags["resource-id"] ?? input.flags.record ?? input.positionals[5];
  if (table === "finance_records") {
    if (!recordId) {
      return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source finance.records --table finance_records --record-id <id>" };
    }
    return scheduleFinanceRecordTableSearchEvent({
      operation: input.operation,
      recordId,
      dataDir: options.dataDir,
      flags: input.flags,
      observedAt: options.observedAt,
    });
  }
  const namespaceId = input.flags["namespace-id"] ?? input.flags.namespace;
  const collectionName = input.flags["collection-name"] ?? input.flags.collection;
  if (!namespaceId || !collectionName || !recordId) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source finance.records --namespace <id> --collection <name> --record-id <id> OR --table finance_records --record-id <id>" };
  }
  return scheduleFinanceRecordsSearchEvent({
    operation: input.operation,
    namespaceId,
    collectionName,
    recordId,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleProvidersRoutingChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const kind = input.flags.kind ?? input.flags.type;
  if (kind !== "routing" && kind !== "setting") {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source providers.routing --kind routing --feature <feature> [--capability <capability>] OR --kind setting --provider <provider>" };
  }
  const provider = input.flags.provider ?? input.flags["provider-id"];
  const feature = input.flags.feature ?? input.positionals[5];
  const capability = input.flags.capability ?? "chat";
  if (kind === "routing" && (!feature || !capability)) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source providers.routing --kind routing --feature <feature> [--capability <capability>]" };
  }
  if (kind === "setting" && !provider) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source providers.routing --kind setting --provider <provider>" };
  }
  return scheduleProvidersRoutingSearchEvent({
    operation: input.operation,
    kind,
    provider,
    feature,
    capability,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleAgentsCatalogChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const rawKind = input.flags.kind ?? input.flags.type;
  const kind = rawKind === "skill-collection" ? "skill_collection" : rawKind;
  if (kind !== "agent" && kind !== "personality" && kind !== "skill_collection" && kind !== "connection") {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source agents.catalog --kind agent|personality|skill_collection|connection --id <id>" };
  }
  const id = input.flags.id
    ?? input.flags["resource-id"]
    ?? (kind === "agent"
      ? input.flags["agent-id"]
      : kind === "personality"
        ? input.flags["personality-id"]
        : kind === "skill_collection"
          ? input.flags["skill-collection-id"]
          : input.flags["connection-id"])
    ?? input.positionals[5];
  if (!id) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source agents.catalog --kind agent|personality|skill_collection|connection --id <id>" };
  }
  return scheduleAgentsCatalogSearchEvent({
    operation: input.operation,
    kind,
    id,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleMcpServersChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  cwd: string;
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const serverId = input.flags["server-id"] ?? input.flags.server ?? input.flags["resource-id"] ?? input.positionals[5];
  const configPath = input.flags["config-path"] ?? input.flags.config ?? input.flags.path;
  if (!serverId || !configPath) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source mcp.servers --server-id <id> --config-path <path>" };
  }
  return scheduleMcpServersSearchEvent({
    operation: input.operation,
    serverId,
    configPath: path.resolve(input.cwd, expandSearchPath(configPath)),
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleRuntimeEventsChangedSourceEvent(input: {
  operation: "upsert" | "delete";
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string }): SearchEventScheduleResult {
  const rawKind = input.flags.kind ?? input.flags.type ?? input.flags["runtime-kind"];
  const kind = rawKind === "operational-event" ? "operational" : rawKind;
  if (kind !== "job" && kind !== "event" && kind !== "operational") {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source runtime.events --kind job|event|operational --id <id> [--domain <domain>]" };
  }
  const id = input.flags.id
    ?? input.flags["resource-id"]
    ?? (kind === "job" ? input.flags["job-id"] : kind === "event" ? input.flags["event-id"] : input.flags["operational-id"])
    ?? input.positionals[5];
  if (!id) {
    return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source runtime.events --kind job|event|operational --id <id> [--domain <domain>]" };
  }
  const domain = input.flags.domain ?? input.flags["operational-domain"];
  return scheduleRuntimeEventsSearchEvent({
    operation: input.operation,
    kind,
    id,
    domain,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
  });
}

function scheduleSimpleChangedSourceEvent(input: {
  source: string;
  operation: "upsert" | "delete";
  cwd: string;
  flags: Record<string, string>;
  positionals: string[];
}, options: { dataDir: string; observedAt?: string; root?: string }): SearchEventScheduleResult {
  const spec = SIMPLE_CHANGED_SOURCE_SCHEDULES.get(input.source);
  if (!spec) {
    return { ok: false, error: `Search changed events are typed for ${typedChangedSourceList()}; use search jobs schedule for ${input.source}.` };
  }
  const id = changedScheduleResourceId(input, spec.idFlagNames);
  if (!id) {
    return { ok: false, error: `Usage: claw search changes schedule <upsert|delete> --source ${input.source} --${spec.idLabel} <id>` };
  }
  const workspaceRootFlag = input.flags.workspace ?? options.root ?? input.cwd;
  return spec.schedule({
    operation: input.operation,
    id,
    dataDir: options.dataDir,
    flags: input.flags,
    observedAt: options.observedAt,
    workspaceRoot: spec.workspaceRoot ? path.resolve(input.cwd, expandSearchPath(workspaceRootFlag)) : undefined,
  });
}

function changedScheduleResourceId(input: { flags: Record<string, string>; positionals: string[] }, flagNames: string[]): string | undefined {
  for (const flagName of flagNames) {
    const value = input.flags[flagName];
    if (value) return value;
  }
  return input.flags["resource-id"] ?? input.flags.resource ?? input.positionals[5];
}

function typedChangedSourceList(): string {
  return [
    "sessions.chats",
    "docs.pages",
    "sheets.workbooks",
    "code.symbols",
    "local.files",
    "web.ingested",
    "external.cache",
    "surfaces.routes",
    "surfaces.registry",
    "database.records",
    "work.items",
    "documents.blocks",
    "knowledge.graph",
    "signals.observations",
    "finance.records",
    "eln.records",
    "providers.routing",
    "agents.catalog",
    "mcp.servers",
    "runtime.events",
    ...SIMPLE_CHANGED_SOURCE_SCHEDULES.keys(),
  ].join(", ");
}

function expandSearchPath(value: string): string {
  return value === "~" || value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

function readSearchServiceWorkerBudgets(flags: Record<string, string>): SearchServiceWorkerBudgets {
  const maxJobs = SearchDocuments.boundedNumberFlag(flags["max-jobs"] ?? flags.limit, 10, 1, 1000);
  const maxRuntimeMs = SearchDocuments.boundedNumberFlag(flags["max-runtime-ms"] ?? flags["worker-runtime-ms"], 30_000, 1, 10 * 60 * 1000);
  const maxFailures = SearchDocuments.boundedNumberFlag(flags["max-failures"] ?? flags["failure-limit"], 10, 1, 1000);
  const leaseMs = SearchDocuments.parseOptionalBoundedInteger(flags["lease-ms"], 1000, 60 * 60 * 1000);
  return {
    maxJobs,
    maxRuntimeMs,
    maxFailures,
    ...(leaseMs === undefined ? {} : { leaseMs }),
  };
}

function localSearchEmbeddingModel(model: string | undefined): string {
  if (!model || model === LOCAL_TEXT_EMBEDDING_MODEL) return LOCAL_TEXT_EMBEDDING_MODEL;
  throw new CliHandledError("SEARCH_EMBEDDING_PROVIDER_PENDING", `Search local embedding indexing only supports ${LOCAL_TEXT_EMBEDDING_MODEL}; provider-backed embedding workers are EXTERNAL PENDING.`, CLI_EXIT_USAGE);
}
function searchActionAccessInput(flags: Record<string, string>): Pick<SearchQueryInput, "actor" | "surface" | "filters"> {
  const parsedFilters = SearchDocuments.parseSearchFiltersFlag(flags.filters ?? flags.filter);
  const filters = { ...(parsedFilters ?? {}) };
  if (flags.scope) filters.scope = flags.scope;
  if (flags["scope-id"] || flags.scopeId) filters.scopeId = flags["scope-id"] ?? flags.scopeId;
  return {
    actor: flags.actor,
    surface: flags.surface,
    ...(Object.keys(filters).length ? { filters } : {}),
  };
}

function stringPayloadValue(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numericPayloadValue(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function runSearchIndexJob(store: SearchStore, job: SearchIndexJob, flags: Record<string, string>, cwd: string): number {
  if (!importedSourceCanIndex(store, job.source)) return 0;
  if (job.operation === "delete") {
    if (!job.resourceId) return 0;
    store.tombstone({ source: job.source, resourceId: job.resourceId, reason: "search service delete job" });
    return 1;
  }
  if (job.operation === "upsert" && job.resourceId) {
    const indexed = runSearchResourceIndexJob(store, job, flags, cwd);
    if (indexed !== null) return indexed;
  }
  if (job.operation === "embed") {
    return store.indexLocalEmbeddings({
      sources: [job.source],
      shards: job.shard ? [job.shard] : undefined,
      limit: numericPayloadValue(job.payload, "limit") ?? (flags.limit ? Number(flags.limit) : undefined),
      model: localSearchEmbeddingModel(stringPayloadValue(job.payload, "model") ?? flags.model ?? flags["embedding-model"]),
    }).indexed;
  }
  if (job.operation === "rebuild") {
    if (job.shard && job.shard !== "default") store.resetSourceShards({ sources: [job.source], shards: [job.shard] });
    else store.resetSources([job.source]);
  }
  switch (job.source) {
    case "commands":
      return importedEnsureCommandSourceIndexed(store);
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
    case "eln.records":
      return ensureElnRecordsSourceIndexed(store, flags);
    case "images.derived":
      return ensureImagesDerivedSourceIndexed(store, flags, cwd);
    case "media.assets":
      return ensureMediaAssetsSourceIndexed(store, flags, cwd);
    case "slides.decks":
      return ensureSlidesDecksSourceIndexed(store, flags, cwd);
    case "sheets.workbooks":
      return ensureSheetsWorkbooksSourceIndexed(store, flags, cwd);
    case "generations.artifacts":
      return ensureGenerationsArtifactsSourceIndexed(store, flags, cwd);
    case "code.symbols":
      return ensureCodeSymbolsSourceIndexed(store, flags, cwd);
    case "docs.pages":
      return ensureDocsPagesSourceIndexed(store, cwd);
    case "skills.registry":
      return ensureSkillsRegistrySourceIndexed(store, flags);
    case "providers.routing":
      return ensureProvidersRoutingSourceIndexed(store, flags);
    case "snippets.library":
      return ensureSnippetsLibrarySourceIndexed(store, flags);
    case "agents.catalog":
      return ensureAgentsCatalogSourceIndexed(store, flags);
    case "marketplace.choices":
      return ensureMarketplaceChoicesSourceIndexed(store, flags);
    case "content.items":
      return ensureContentItemsSourceIndexed(store, flags);
    case "business.records":
      return ensureBusinessRecordsSourceIndexed(store, flags);
    case "social.posts":
      return ensureSocialPostsSourceIndexed(store, flags);
    case "iot.config":
      return ensureIotConfigSourceIndexed(store, flags);
    case "connectors.catalog":
      return ensureConnectorsCatalogSourceIndexed(store, flags);
    case "mcp.servers":
      return ensureMcpServersSourceIndexed(store, flags, cwd);
    case "apps.catalog":
      return ensureAppsCatalogSourceIndexed(store, flags);
    case "design.resources":
      return ensureDesignResourcesSourceIndexed(store, flags, cwd);
    case "runtime.events":
      return ensureRuntimeEventsSourceIndexed(store, flags);
    case "surfaces.routes":
      return ensureSurfacesRoutesSourceIndexed(store);
    case "surfaces.registry":
      return ensureSurfacesRegistrySourceIndexed(store);
    case "local.files":
      return ensureLocalFilesSourceIndexed(store, flags, cwd);
    case "web.ingested":
      return ensureWebIngestedSourceIndexed(store, flags, cwd);
    case "external.cache":
      return ensureExternalCacheSourceIndexed(store, flags, cwd);
    case "native.system":
      importedEnableNativeSystemSourceFromSnapshotFlag({
        store,
        flags,
        selectedSources: ["native.system"],
        writeCanonicalSearchSourceState,
      });
      return importedEnsureNativeSystemSourceIndexed({ store, flags, cwd, writeCanonicalSearchSourceState });
    default:
      throw new Error(`Search service cannot index source: ${job.source}`);
  }
}

function runSearchResourceIndexJob(store: SearchStore, job: SearchIndexJob, flags: Record<string, string>, cwd: string): number | null {
  switch (job.source) {
    case "sessions.chats":
      return indexJobResource(job, "sessionId", (sessionId) => ensureSessionChatResourceIndexed(store, flags, sessionId));
    case "database.records":
      return ensureDatabaseRecordResourceIndexed(store, flags, job);
    case "work.items":
      return ensureWorkItemResourceIndexed(store, flags, job);
    case "documents.blocks":
      return ensureDocumentBlocksResourceIndexed(store, flags, job);
    case "notes.pages":
      return indexJobResource(job, "pageId", (resourceId) => ensureNotesPageResourceIndexed(store, flags, resourceId));
    case "knowledge.graph":
      return indexJobResource(job, "knowledgeResourceId", (resourceId) => ensureKnowledgeGraphResourceIndexed(store, flags, resourceId));
    case "signals.observations":
      return indexJobResource(job, "signalsResourceId", (resourceId) => ensureSignalsObservationsResourceIndexed(store, flags, resourceId));
    case "calendar.events":
      return indexJobResource(job, "eventId", (resourceId) => ensureCalendarEventResourceIndexed(store, flags, resourceId));
    case "finance.records": {
      const resourceId = job.payload.table === "finance_records" && job.resourceId
        ? job.resourceId
        : resourceIdFromJobPayload(job, "recordId") ?? job.resourceId;
      return resourceId ? ensureFinanceRecordResourceIndexed(store, flags, resourceId) : 0;
    }
    case "eln.records":
      return ensureElnRecordResourceIndexed(store, flags, job);
    case "images.derived":
      return indexJobResource(job, "imageId", (resourceId) => ensureImageDerivedResourceIndexed(store, flags, cwd, resourceId));
    case "media.assets": {
      if (job.operation === "delete") {
        const resourceId = resourceIdFromJobPayload(job, "mediaId") ?? job.resourceId;
        if (!resourceId) return 0;
        store.tombstone({ source: "media.assets", resourceId, reason: "media asset delete event" });
        return 1;
      }
      return indexJobResource(job, "mediaId", (resourceId) => ensureMediaAssetResourceIndexed(store, flags, cwd, resourceId));
    }
    case "slides.decks": {
      const deckId = resourceIdFromJobPayload(job, "deckId") ?? job.resourceId;
      return deckId ? ensureSlidesDeckResourceIndexed(store, flags, cwd, deckId, resourceIdFromJobPayload(job, "workspaceRoot")) : 0;
    }
    case "sheets.workbooks": {
      const workbookId = resourceIdFromJobPayload(job, "workbookId") ?? job.resourceId;
      return workbookId ? ensureSheetsWorkbookResourceIndexed(store, flags, cwd, workbookId, resourceIdFromJobPayload(job, "workspaceRoot")) : 0;
    }
    case "generations.artifacts":
      return indexJobResource(job, "generationId", (resourceId) => ensureGenerationArtifactResourceIndexed(store, flags, cwd, resourceId));
    case "code.symbols": {
      const relativePath = resourceIdFromJobPayload(job, "relativePath") ?? job.resourceId;
      return relativePath ? ensureCodeSymbolResourceIndexed(store, flags, cwd, relativePath, resourceIdFromJobPayload(job, "root")) : 0;
    }
    case "docs.pages":
      return indexJobResource(job, "relativePath", (relativePath) => ensureDocsPageResourceIndexed(store, cwd, relativePath));
    case "skills.registry":
      return indexJobResource(job, "slug", (resourceId) => ensureSkillsRegistryResourceIndexed(store, flags, resourceId));
    case "providers.routing": {
      const resourceId = job.resourceId;
      return resourceId ? ensureProvidersRoutingResourceIndexed(store, flags, resourceId) : 0;
    }
    case "snippets.library":
      return indexJobResource(job, "slug", (resourceId) => ensureSnippetsLibraryResourceIndexed(store, flags, resourceId));
    case "agents.catalog": {
      const resourceId = job.resourceId;
      return resourceId ? ensureAgentsCatalogResourceIndexed(store, flags, resourceId) : 0;
    }
    case "marketplace.choices":
      return indexJobResource(job, "choiceId", (choiceId) => ensureMarketplaceChoiceResourceIndexed(store, flags, choiceId));
    case "content.items":
      return indexJobResource(job, "itemId", (itemId) => ensureContentItemResourceIndexed(store, flags, itemId));
    case "business.records":
      return indexJobResource(job, "recordId", (recordId) => ensureBusinessRecordResourceIndexed(store, flags, recordId));
    case "social.posts":
      return indexJobResource(job, "postId", (postId) => ensureSocialPostResourceIndexed(store, flags, postId));
    case "iot.config":
      return indexJobResource(job, "configId", (configId) => ensureIotConfigResourceIndexed(store, flags, configId));
    case "connectors.catalog":
      return indexJobResource(job, "operationId", (resourceId) => ensureConnectorCatalogResourceIndexed(store, flags, resourceId));
    case "mcp.servers": {
      const serverId = resourceIdFromJobPayload(job, "serverId") ?? job.resourceId;
      return serverId ? ensureMcpServerResourceIndexed(store, flags, serverId, cwd, resourceIdFromJobPayload(job, "configPath")) : 0;
    }
    case "apps.catalog":
      return indexJobResource(job, "appId", (appId) => ensureAppCatalogResourceIndexed(store, flags, appId));
    case "design.resources": {
      const resourceId = resourceIdFromJobPayload(job, "resourceId") ?? job.resourceId;
      return resourceId ? ensureDesignResourceIndexed(store, flags, resourceId, cwd, resourceIdFromJobPayload(job, "workspaceRoot")) : 0;
    }
    case "runtime.events":
      return indexJobResource(job, "runtimeResourceId", (resourceId) => ensureRuntimeEventsResourceIndexed(store, flags, resourceId));
    case "surfaces.routes":
      return indexJobResource(job, "routeId", (routeId) => ensureSurfaceRouteResourceIndexed(store, routeId));
    case "surfaces.registry":
      return indexJobResource(job, "surfaceId", (surfaceId) => ensureSurfaceRegistryResourceIndexed(store, surfaceId));
    case "local.files": {
      const relativePath = resourceIdFromJobPayload(job, "relativePath") ?? job.resourceId;
      return relativePath ? ensureLocalFileResourceIndexed(store, flags, cwd, relativePath, resourceIdFromJobPayload(job, "root")) : 0;
    }
    case "web.ingested": {
      const relativePath = resourceIdFromJobPayload(job, "relativePath") ?? job.resourceId;
      return relativePath ? ensureWebIngestedResourceIndexed(store, flags, cwd, relativePath, resourceIdFromJobPayload(job, "root")) : 0;
    }
    case "external.cache": {
      const relativePath = resourceIdFromJobPayload(job, "relativePath") ?? job.resourceId;
      return relativePath ? ensureExternalCacheResourceIndexed(store, flags, cwd, relativePath, resourceIdFromJobPayload(job, "root")) : 0;
    }
    default:
      return null;
  }
}

function indexJobResource(job: SearchIndexJob, payloadKey: string, indexResource: (resourceId: string) => number): number {
  const resourceId = resourceIdFromJobPayload(job, payloadKey) ?? job.resourceId;
  return resourceId ? indexResource(resourceId) : 0;
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

function financeRecordTableIdFromResourceId(resourceId: string): string | null {
  const prefix = "finance_records:";
  if (!resourceId.startsWith(prefix)) return null;
  const id = resourceId.slice(prefix.length);
  return id || null;
}

function parseProviderRoutingResourceId(resourceId: string): { feature: string; capability: string } | null {
  const parts = resourceId.split(":");
  if (parts.length !== 3 || parts[0] !== "routing" || !parts[1] || !parts[2]) return null;
  return { feature: parts[1], capability: parts[2] };
}

function parseAgentCatalogResourceId(resourceId: string): { kind: "agent" | "personality" | "skill_collection" | "connection"; id: string } | null {
  for (const kind of ["agent", "personality", "skill_collection", "connection"] as const) {
    const prefix = `${kind}:`;
    if (resourceId.startsWith(prefix)) {
      const id = resourceId.slice(prefix.length);
      return id ? { kind, id } : null;
    }
  }
  return null;
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
    input.context.stderr.write(`Usage: ${input.binName} search actions execute <result-id> <action-id> [--dry-run] [--host-approval-id <id>] [--policy-mode normal|strict|authorized_automation] [--automation-authorized true] [--json]\n`);
    return CLI_EXIT_USAGE;
  }

  const dryRun = readBooleanFlag(input.argv, input.flags, "dry-run", false);
  const hostApprovalId = input.flags["host-approval-id"] || input.flags["approval-id"];
  const automationAuthorized = readBooleanFlag(input.argv, input.flags, "automation-authorized", false);
  const auditOnly = readBooleanFlag(input.argv, input.flags, "audit-only", false);
  const confirmed = readBooleanFlag(input.argv, input.flags, "confirm", false);
  const store = openCliSearchStore(input.flags);
  let plan: SearchActionExecutionPlan | undefined;
  try {
    registerCliSearchSources(store, input.flags);
    const access = searchActionAccessInput(input.flags);
    const result = store.resultForId(resultId, access);
    const action = store.actionsForResult(resultId, access).find((candidate) => candidate.id === actionId);
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

    plan = createSearchActionExecutionPlan({
      result,
      action,
      dryRun,
      hostApprovalId,
      policyConfig: {
        mode: parseSearchPolicyMode(input.flags["policy-mode"]),
        confirmed,
        automationAuthorized,
        auditOnly,
      },
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
      metadata: {
        dryRun,
        requiresApproval: plan.requiresApproval,
        hostApprovalId: hostApprovalId ?? null,
        policyDecision: plan.policy?.policyDecision,
        policyReasonCodes: plan.policy?.reasonCodes ?? [],
      },
    });
    if (!dryRun && plan.status === "blocked") {
      const policyDecision = plan.policy?.policyDecision;
      const errorCode = policyDecision === "block" ? "regulated_policy_blocked" : "host_approval_required";
      const message = policyDecision === "block"
        ? `Search action execution is blocked by regulated safety policy: ${plan.policy?.reasonCodes.join(", ") || "blocked"}.`
        : "Search action execution requires --host-approval-id from the signed host approval flow, --policy-mode authorized_automation with --automation-authorized true, or --dry-run for a brokered preview.";
      const error = new CliHandledError(errorCode, message, CLI_EXIT_FAILURE);
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

function parseSearchPolicyMode(value: string | undefined): "strict" | "normal" | "authorized_automation" | undefined {
  if (!value) return undefined;
  if (value === "strict" || value === "normal" || value === "authorized_automation") return value;
  throw new CliHandledError("invalid_policy_mode", "Use --policy-mode strict, normal, or authorized_automation.", CLI_EXIT_USAGE);
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

function searchCanonicalConfigEnv(flags: Record<string, string>): NodeJS.ProcessEnv {
  return flags["data-dir"] ? { ...process.env, CLAW_DATA_DIR: flags["data-dir"] } : process.env;
}

function ensureSearchCanonicalConfigSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS search_source_config (
      source TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      source_set TEXT NOT NULL DEFAULT 'framework',
      updated_at TEXT NOT NULL,
      actor TEXT,
      surface TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS search_source_config_state_idx ON search_source_config(state);
  `);
  const columns = new Set((sqlite.prepare("PRAGMA table_info(search_source_config)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("source_set")) sqlite.exec("ALTER TABLE search_source_config ADD COLUMN source_set TEXT NOT NULL DEFAULT 'framework'");
}

function readCanonicalSearchSourceStates(flags: Record<string, string>): Map<string, SearchSourceState> {
  const env = searchCanonicalConfigEnv(flags);
  const dbPath = resolveClawjsMainDbPath(env);
  if (!fs.existsSync(dbPath)) return new Map();
  const db = new Database(dbPath);
  try {
    ensureSearchCanonicalConfigSchema(db);
    const rows = db.prepare("SELECT source, state FROM search_source_config").all() as Array<{ source: string; state: string }>;
    return new Map(rows.flatMap((row) => {
      const state = parseSearchSourceState(row.state);
      return state ? [[row.source, state] as const] : [];
    }));
  } finally {
    db.close();
  }
}

function writeCanonicalSearchSourceState(
  flags: Record<string, string>,
  source: string,
  state: SearchSourceState,
  input: { sourceSet: SearchSourceSetId; actor?: string; surface?: string } = { sourceSet: "framework" },
): void {
  const env = searchCanonicalConfigEnv(flags);
  const dbPath = resolveClawjsMainDbPath(env);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    ensureV1MainSchema(db, env);
    ensureSearchCanonicalConfigSchema(db);
    db.prepare(`
      INSERT INTO search_source_config (source, state, source_set, updated_at, actor, surface, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        state = excluded.state,
        source_set = excluded.source_set,
        updated_at = excluded.updated_at,
        actor = excluded.actor,
        surface = excluded.surface,
        metadata_json = excluded.metadata_json
    `).run(
      source,
      state,
      input.sourceSet,
      new Date().toISOString(),
      input.actor ?? null,
      input.surface ?? null,
      JSON.stringify({ source: "claw search sources" }),
    );
  } finally {
    db.close();
  }
}

function parseSearchSourceState(value: string): SearchSourceState | undefined {
  return value === "enabled"
    || value === "disabled"
    || value === "paused"
    || value === "excluded"
    || value === "backfilling"
    || value === "degraded"
    || value === "external_pending"
    || value === "error"
    ? value
    : undefined;
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

function registerCliSearchSources(store: SearchStore, flags: Record<string, string>, states: Map<string, SearchSourceState> = new Map()): void {
  const mergedStates = new Map(states);
  for (const [source, state] of readCanonicalSearchSourceStates(flags)) {
    mergedStates.set(source, state);
  }
  registerBuiltinSources(store, mergedStates);
}

function registerBuiltinSources(store: SearchStore, states: Map<string, SearchSourceState> = new Map()): void {
  for (const source of BUILTIN_SEARCH_SOURCES) {
    const state = states.get(source.id);
    store.registerSource(source, state ? { state } : {});
  }
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
  if (importedSourceCanIndex(store, "commands")) importedEnsureCommandSourceIndexed(store);
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
    if (SearchDocuments.searchQueryRequiresAudit(query.query, output.results, query.filters)) {
      store.recordAuditEvent({
        type: "sensitive_query",
        actor: query.actor,
        surface: query.surface,
        query: query.query,
        reason: "sensitive_query_or_redacted_result",
        metadata: {
          sourceSet: query.sourceSet ?? "framework",
          domains: query.domains ?? [],
          sources: query.sources ?? [],
          shards: query.shards ?? [],
          strategy: query.strategy ?? "lexical",
          embeddingModel: query.embedding?.model,
          resultCount: output.results.length,
          redactedResultCount: output.results.filter((result) => result.permissions?.redacted).length,
          monitorId: monitor.id,
          savedSearchId: monitor.savedSearchId,
        },
      });
    }
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

function sourceStateForAction(action: string, sourceId?: string, flags: Record<string, string> = {}): SearchSourceState {
  if ((action === "enable" || action === "resume") && sourceId === "native.system") {
    return importedHasNativeSystemSnapshotFlag(flags) ? "enabled" : "external_pending";
  }
  if (action === "enable" || action === "resume") return "enabled";
  if (action === "disable") return "disabled";
  if (action === "pause") return "paused";
  if (action === "exclude") return "excluded";
  return "enabled";
}

const SESSIONS_CHATS_INDEX_CURSOR_VERSION = 2;

interface SessionsChatsIndexCursor {
  updatedAt: string;
  sessionId: string;
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
    if (!SearchDocuments.hasTable(db, "conversation_sessions")) {
      store.setSourceState("sessions.chats", "degraded", {
        backlog: 0,
        error: "sessions sidecar does not contain conversation_sessions",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const batchSize = SearchDocuments.boundedNumberFlag(flags["sessions-index-batch-size"], 100, 1, 1000);
    const sessionsAfterCursor = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE archived = 0
        AND (
          updated_at > ?
          OR (updated_at = ? AND session_id > ?)
        )
      ORDER BY updated_at ASC, session_id ASC
      LIMIT ?
    `);
    const sessionsFromStart = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE archived = 0
      ORDER BY updated_at ASC, session_id ASC
      LIMIT ?
    `);
    const messageRows = SearchDocuments.hasTable(db, "conversation_messages")
      ? db.prepare(`
          SELECT id, role, text, turn_index, created_at, metadata_json
          FROM conversation_messages
          WHERE session_id = ?
          ORDER BY turn_index ASC, id ASC
          LIMIT 50
        `)
      : null;
    let indexed = 0;
    let cursor = sessionsChatsIndexCursor(store);
    while (true) {
      const sessions = cursor
        ? sessionsAfterCursor.all(cursor.updatedAt, cursor.updatedAt, cursor.sessionId, batchSize) as SearchDocuments.ConversationSessionRow[]
        : sessionsFromStart.all(batchSize) as SearchDocuments.ConversationSessionRow[];
      if (sessions.length === 0) break;
      for (const session of sessions) {
        const messages = messageRows?.all(session.session_id) as SearchDocuments.ConversationMessageRow[] | undefined;
        store.upsertDocument(SearchDocuments.sessionSearchDocument(session, messages ?? []));
      }
      const lastSession = sessions.at(-1);
      if (lastSession) {
        cursor = { updatedAt: lastSession.updated_at, sessionId: lastSession.session_id };
        store.setCursor(sessionsChatsCursorInput(cursor, batchSize));
      }
      indexed += sessions.length;
    }
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function sessionsChatsIndexCursor(store: SearchStore): SessionsChatsIndexCursor | null {
  const cursor = store.getCursor("sessions.chats");
  const metadata = cursor?.metadata ?? {};
  if (
    metadata.version === SESSIONS_CHATS_INDEX_CURSOR_VERSION
    && typeof metadata.updatedAt === "string"
    && typeof metadata.sessionId === "string"
  ) {
    return { updatedAt: metadata.updatedAt, sessionId: metadata.sessionId };
  }
  return null;
}

function sessionsChatsCursorInput(cursor: SessionsChatsIndexCursor, batchSize: number): { source: string; cursor: string; watermark: string; metadata: Record<string, unknown> } {
  return {
    source: "sessions.chats",
    cursor: `v${SESSIONS_CHATS_INDEX_CURSOR_VERSION}:${cursor.updatedAt}:${cursor.sessionId}`,
    watermark: cursor.updatedAt,
    metadata: {
      sidecar: "sessions.sqlite",
      version: SESSIONS_CHATS_INDEX_CURSOR_VERSION,
      updatedAt: cursor.updatedAt,
      sessionId: cursor.sessionId,
      batchSize,
    },
  };
}

function ensureSessionChatResourceIndexed(store: SearchStore, flags: Record<string, string>, sessionId: string): number {
  const dbPath = resolveSessionsDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "conversation_sessions")) return 0;
    const session = db.prepare(`
      SELECT session_id, source, artifact_path, title, cwd, updated_at, snippet, metadata_json, archived, pinned
      FROM conversation_sessions
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId) as SearchDocuments.ConversationSessionRow | undefined;
    if (!session || session.archived === 1) {
      store.tombstone({ source: "sessions.chats", resourceId: sessionId, reason: "session chat missing during Search event refresh" });
      return 1;
    }
    const messages = SearchDocuments.hasTable(db, "conversation_messages")
      ? db.prepare(`
          SELECT id, role, text, turn_index, created_at, metadata_json
          FROM conversation_messages
          WHERE session_id = ?
          ORDER BY turn_index ASC, id ASC
          LIMIT 50
        `).all(sessionId) as SearchDocuments.ConversationMessageRow[]
      : [];
    store.upsertDocument(SearchDocuments.sessionSearchDocument(session, messages));
    store.setSourceState("sessions.chats", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
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
    if (!SearchDocuments.hasTable(db, "records")) {
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
    `).all() as SearchDocuments.DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.databaseRecordSearchDocument(row);
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
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "database.records", resourceId: target.resourceId, reason: "database record missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.databaseRecordSearchDocument(row);
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
    const hasRecords = SearchDocuments.hasTable(db, "records");
    const hasWorkspaceRecords = SearchDocuments.hasTable(db, "workspace_records");
    if (!hasRecords && !hasWorkspaceRecords) {
      store.setSourceState("work.items", "degraded", {
        backlog: 0,
        error: "core database does not contain records/workspace_records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    let indexed = 0;
    const rows: SearchDocuments.DatabaseRecordRow[] = [];
    if (hasRecords) {
      rows.push(...db.prepare(`
        SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
        FROM records
        WHERE collection_name IN (${Array.from(WORK_SEARCH_COLLECTIONS).map(() => "?").join(", ")})
        ORDER BY updated_at DESC
      `).all(...Array.from(WORK_SEARCH_COLLECTIONS)) as SearchDocuments.DatabaseRecordRow[]);
    }
    if (hasWorkspaceRecords) {
      rows.push(...db.prepare(`
        SELECT
          'main' AS namespace_id,
          collection_name,
          record_id AS id,
          payload_json AS data_json,
          COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS created_at,
          COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS updated_at
        FROM workspace_records
        WHERE collection_name IN (${Array.from(WORK_SEARCH_COLLECTIONS).map(() => "?").join(", ")})
        ORDER BY updated_at DESC
      `).all(...Array.from(WORK_SEARCH_COLLECTIONS)) as SearchDocuments.DatabaseRecordRow[]);
    }
    for (const row of rows) {
      const document = SearchDocuments.workItemSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "work.items",
      cursor: `records:${indexed}`,
      metadata: { store: "core.sqlite", collections: Array.from(WORK_SEARCH_COLLECTIONS).sort(), tables: ["records", "workspace_records"] },
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
    const row = findWorkItemRecordRow(db, target);
    if (!row) {
      store.tombstone({ source: "work.items", resourceId: target.resourceId, reason: "work item missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.workItemSearchDocument(row);
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

function findWorkItemRecordRow(db: Database.Database, target: { namespaceId: string; collectionName: string; recordId: string }): SearchDocuments.DatabaseRecordRow | undefined {
  if (SearchDocuments.hasTable(db, "records")) {
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (row) return row;
  }
  if (!SearchDocuments.hasTable(db, "workspace_records")) return undefined;
  return db.prepare(`
    SELECT
      ? AS namespace_id,
      collection_name,
      record_id AS id,
      payload_json AS data_json,
      COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS created_at,
      COALESCE(updated_at, '1970-01-01T00:00:00.000Z') AS updated_at
    FROM workspace_records
    WHERE collection_name = ? AND record_id = ?
    LIMIT 1
  `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
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
    if (!SearchDocuments.hasTable(db, "records")) {
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
    `).all() as SearchDocuments.DatabaseRecordRow[];
    const blocksByDocument = new Map<string, SearchDocuments.DatabaseRecordRow[]>();
    const documents = rows.filter((row) => row.collection_name === "documents");
    for (const block of rows.filter((row) => row.collection_name === "document_blocks")) {
      const payload = SearchDocuments.parseJsonRecord(block.data_json);
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
      const searchDocument = SearchDocuments.documentBlocksSearchDocument(document, blocks);
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
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const document = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = 'documents' AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.documentId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!document) {
      store.tombstone({ source: "documents.blocks", resourceId: target.resourceId, reason: "document missing during Search event refresh" });
      return 1;
    }
    const blockRows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = 'document_blocks'
      ORDER BY updated_at DESC
    `).all(target.namespaceId) as SearchDocuments.DatabaseRecordRow[];
    const blocks = blockRows.filter((block) => {
      const payload = SearchDocuments.parseJsonRecord(block.data_json);
      return payload.documentId === target.documentId;
    });
    const searchDocument = SearchDocuments.documentBlocksSearchDocument(document, blocks);
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
    if (!SearchDocuments.hasTable(db, "pages") || !SearchDocuments.hasTable(db, "page_blocks")) {
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
    `).all() as SearchDocuments.NotesPageRow[];
    const blockRows = db.prepare(`
      SELECT id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at
      FROM page_blocks
      ORDER BY page_id, sort_order ASC, created_at ASC
    `).all() as SearchDocuments.NotesPageBlockRow[];
    const blocksByPage = new Map<string, SearchDocuments.NotesPageBlockRow[]>();
    for (const block of blockRows) {
      const blocks = blocksByPage.get(block.page_id) ?? [];
      blocks.push(block);
      blocksByPage.set(block.page_id, blocks);
    }
    let indexed = 0;
    for (const page of pages) {
      const searchDocument = SearchDocuments.notesPageSearchDocument(page, blocksByPage.get(page.id) ?? []);
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
    if (!SearchDocuments.hasTable(db, "pages") || !SearchDocuments.hasTable(db, "page_blocks")) return 0;
    const page = db.prepare(`
      SELECT id, title, space, surface, owner_id, author_kind, author_id, visibility, sensitivity,
        tags_json, properties_json, source_record_domain, source_record_id, created_at, updated_at, archived_at
      FROM pages
      WHERE id = ?
      LIMIT 1
    `).get(pageId) as SearchDocuments.NotesPageRow | undefined;
    if (!page || page.archived_at) {
      store.tombstone({ source: "notes.pages", resourceId: pageId, reason: "note page missing during Search event refresh" });
      return 1;
    }
    const blocks = db.prepare(`
      SELECT id, page_id, parent_block_id, sort_order, kind, content_json, text, metadata_json, created_at, updated_at
      FROM page_blocks
      WHERE page_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(pageId) as SearchDocuments.NotesPageBlockRow[];
    const searchDocument = SearchDocuments.notesPageSearchDocument(page, blocks);
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
    if (!SearchDocuments.hasTable(db, "knowledge_entities") || !SearchDocuments.hasTable(db, "knowledge_facts")) {
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
    `).all() as SearchDocuments.KnowledgeEntityRow[];
    const facts = db.prepare(`
      SELECT id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json,
        sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at
      FROM knowledge_facts
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.KnowledgeFactRow[];
    let indexed = 0;
    for (const entity of entities) {
      const document = SearchDocuments.knowledgeEntitySearchDocument(entity);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    for (const fact of facts) {
      const document = SearchDocuments.knowledgeFactSearchDocument(fact);
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
  const target = SearchDocuments.parseKnowledgeGraphResourceId(resourceId);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "knowledge_entities") || !SearchDocuments.hasTable(db, "knowledge_facts")) return 0;
    if (target.kind === "entity") {
      const entity = db.prepare(`
        SELECT id, type, label, description, properties_json, sensitivity, source, provenance_json, created_at, updated_at
        FROM knowledge_entities
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.KnowledgeEntityRow | undefined;
      if (!entity) {
        store.tombstone({ source: "knowledge.graph", resourceId, reason: "knowledge entity missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.knowledgeEntitySearchDocument(entity));
    } else {
      const fact = db.prepare(`
        SELECT id, subject_id, predicate, object_kind, object_value_json, confidence, scope_json,
          sensitivity, source, provenance_json, supersedes_id, valid_from, valid_to, created_at, updated_at
        FROM knowledge_facts
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.KnowledgeFactRow | undefined;
      if (!fact) {
        store.tombstone({ source: "knowledge.graph", resourceId, reason: "knowledge fact missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.knowledgeFactSearchDocument(fact));
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
    if (!SearchDocuments.hasTable(db, "signals_verticals") || !SearchDocuments.hasTable(db, "signals_variables") || !SearchDocuments.hasTable(db, "signals_observations")) {
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
    `).all() as SearchDocuments.SignalsVerticalRow[];
    const variables = db.prepare(`
      SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
      FROM signals_variables
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.SignalsVariableRow[];
    const observations = db.prepare(`
      SELECT id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id,
        session_id, external_id, sensitive, created_at, updated_at
      FROM signals_observations
      ORDER BY recorded_at DESC
    `).all() as SearchDocuments.SignalsObservationRow[];
    const verticalsById = new Map(verticals.map((vertical) => [vertical.id, vertical]));
    const variablesById = new Map(variables.map((variable) => [variable.id, variable]));
    let indexed = 0;
    for (const vertical of verticals) {
      store.upsertDocument(SearchDocuments.signalVerticalSearchDocument(vertical));
      indexed += 1;
    }
    for (const variable of variables) {
      store.upsertDocument(SearchDocuments.signalVariableSearchDocument(variable, verticalsById.get(variable.vertical_id)));
      indexed += 1;
    }
    for (const observation of observations) {
      store.upsertDocument(SearchDocuments.signalObservationSearchDocument(observation, verticalsById.get(observation.vertical_id), variablesById.get(observation.variable_id)));
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
  const target = SearchDocuments.parseSignalsObservationsResourceId(resourceId);
  if (!target) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "signals_verticals") || !SearchDocuments.hasTable(db, "signals_variables") || !SearchDocuments.hasTable(db, "signals_observations")) return 0;
    if (target.kind === "vertical") {
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.SignalsVerticalRow | undefined;
      if (!vertical) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals vertical missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.signalVerticalSearchDocument(vertical));
    } else if (target.kind === "variable") {
      const variable = db.prepare(`
        SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
        FROM signals_variables
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.SignalsVariableRow | undefined;
      if (!variable) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals variable missing during Search event refresh" });
        return 1;
      }
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(variable.vertical_id) as SearchDocuments.SignalsVerticalRow | undefined;
      store.upsertDocument(SearchDocuments.signalVariableSearchDocument(variable, vertical));
    } else {
      const observation = db.prepare(`
        SELECT id, vertical_id, variable_id, value_json, unit_id, recorded_at, source_json, notes, page_id,
          session_id, external_id, sensitive, created_at, updated_at
        FROM signals_observations
        WHERE id = ?
        LIMIT 1
      `).get(target.id) as SearchDocuments.SignalsObservationRow | undefined;
      if (!observation) {
        store.tombstone({ source: "signals.observations", resourceId, reason: "signals observation missing during Search event refresh" });
        return 1;
      }
      const vertical = db.prepare(`
        SELECT id, label, category, description, status, sensitive, catalog_version, catalog_source, metadata_json, synced_at
        FROM signals_verticals
        WHERE id = ?
        LIMIT 1
      `).get(observation.vertical_id) as SearchDocuments.SignalsVerticalRow | undefined;
      const variable = db.prepare(`
        SELECT id, vertical_id, label, value_type, unit_json, category, sensitive, definition_json, updated_at
        FROM signals_variables
        WHERE id = ?
        LIMIT 1
      `).get(observation.variable_id) as SearchDocuments.SignalsVariableRow | undefined;
      store.upsertDocument(SearchDocuments.signalObservationSearchDocument(observation, vertical, variable));
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
    const hasCalendarEvents = SearchDocuments.hasTable(db, "calendar_events");
    const hasTemporalItems = SearchDocuments.hasTable(db, "temporal_items");
    if (!hasCalendarEvents && !hasTemporalItems) {
      store.setSourceState("calendar.events", "degraded", {
        backlog: 0,
        error: "core database does not contain calendar event tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    let indexed = 0;
    if (hasCalendarEvents) {
      const rows = db.prepare(`
        SELECT id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at
        FROM calendar_events
        ORDER BY starts_at ASC
      `).all() as SearchDocuments.CalendarEventRow[];
      for (const row of rows) {
        store.upsertDocument(calendarEventSearchDocument(row));
        indexed += 1;
      }
    }
    if (hasTemporalItems) {
      const rows = db.prepare(`
        SELECT id, title, status, workspace_id, project_id, agent_id, source_provider, starts_at, next_run_at, created_at, updated_at, payload
        FROM temporal_items
        WHERE kind = 'event'
        ORDER BY COALESCE(starts_at, next_run_at, updated_at) ASC
      `).all() as SearchDocuments.TemporalCalendarEventRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.temporalCalendarEventSearchDocument(row));
        indexed += 1;
      }
    }
    store.setCursor({
      source: "calendar.events",
      cursor: `events:${indexed}`,
      metadata: { store: "core.sqlite", tables: [...(hasCalendarEvents ? ["calendar_events"] : []), ...(hasTemporalItems ? ["temporal_items"] : [])] },
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
    if (SearchDocuments.hasTable(db, "calendar_events")) {
      const row = db.prepare(`
        SELECT id, title, starts_at, ends_at, calendar_id, source, external_id, page_id, metadata_json, created_at, updated_at
        FROM calendar_events
        WHERE id = ?
        LIMIT 1
      `).get(eventId) as SearchDocuments.CalendarEventRow | undefined;
      if (row) {
        store.upsertDocument(calendarEventSearchDocument(row));
        store.setSourceState("calendar.events", "enabled", {
          backlog: 0,
          error: null,
          lastIndexedAt: new Date().toISOString(),
        });
        return 1;
      }
    }
    if (SearchDocuments.hasTable(db, "temporal_items")) {
      const row = db.prepare(`
        SELECT id, title, status, workspace_id, project_id, agent_id, source_provider, starts_at, next_run_at, created_at, updated_at, payload
        FROM temporal_items
        WHERE kind = 'event' AND id = ?
        LIMIT 1
      `).get(eventId) as SearchDocuments.TemporalCalendarEventRow | undefined;
      if (row) {
        store.upsertDocument(SearchDocuments.temporalCalendarEventSearchDocument(row));
        store.setSourceState("calendar.events", "enabled", {
          backlog: 0,
          error: null,
          lastIndexedAt: new Date().toISOString(),
        });
        return 1;
      }
    }
    store.tombstone({ source: "calendar.events", resourceId: eventId, reason: "calendar event missing during Search event refresh" });
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
    if (!SearchDocuments.hasTable(db, "records") && !SearchDocuments.hasTable(db, "finance_records")) {
      store.setSourceState("finance.records", "degraded", {
        backlog: 0,
        error: "core database does not contain finance records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    let indexed = 0;
    if (SearchDocuments.hasTable(db, "records")) {
      const placeholders = FINANCE_SEARCH_COLLECTIONS.map(() => "?").join(", ");
      const rows = db.prepare(`
        SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
        FROM records
        WHERE collection_name IN (${placeholders})
        ORDER BY updated_at DESC
      `).all(...FINANCE_SEARCH_COLLECTIONS) as SearchDocuments.DatabaseRecordRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.financeRecordSearchDocument(row));
        indexed += 1;
      }
    }
    if (SearchDocuments.hasTable(db, "finance_records")) {
      const rows = db.prepare(`
        SELECT id, kind, account_id, amount, currency, occurred_at, merchant, category, page_id, metadata_json, created_at, updated_at
        FROM finance_records
        ORDER BY occurred_at DESC, updated_at DESC
      `).all() as SearchDocuments.FinanceRecordTableRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.financeRecordTableSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
        indexed += 1;
      }
    }
    store.setCursor({
      source: "finance.records",
      cursor: `records:${indexed}`,
      metadata: { store: "core.sqlite", collections: [...FINANCE_SEARCH_COLLECTIONS, "finance_records"] },
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
  const tableRecordId = financeRecordTableIdFromResourceId(recordId);
  if (tableRecordId) return ensureFinanceRecordTableResourceIndexed(store, flags, tableRecordId, recordId);
  const target = financeRecordTargetFromResourceId(recordId);
  if (!target || !FINANCE_SEARCH_COLLECTIONS.includes(target.collectionName as typeof FINANCE_SEARCH_COLLECTIONS[number])) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "finance.records", resourceId: recordId, reason: "finance record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.financeRecordSearchDocument(row));
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

function ensureFinanceRecordTableResourceIndexed(store: SearchStore, flags: Record<string, string>, tableRecordId: string, resourceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "finance_records")) return 0;
    const row = db.prepare(`
      SELECT id, kind, account_id, amount, currency, occurred_at, merchant, category, page_id, metadata_json, created_at, updated_at
      FROM finance_records
      WHERE id = ?
      LIMIT 1
    `).get(tableRecordId) as SearchDocuments.FinanceRecordTableRow | undefined;
    if (!row) {
      store.tombstone({ source: "finance.records", resourceId, reason: "finance table record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.financeRecordTableSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
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

function ensureElnRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("eln.records", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) {
      store.setSourceState("eln.records", "degraded", {
        backlog: 0,
        error: "core database does not contain records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const placeholders = ELN_SEARCH_COLLECTIONS.map(() => "?").join(", ");
    const rows = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE collection_name IN (${placeholders})
      ORDER BY updated_at DESC
    `).all(...ELN_SEARCH_COLLECTIONS) as SearchDocuments.DatabaseRecordRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.elnRecordSearchDocument(row);
      if (!document) continue;
      store.upsertDocument(document);
      indexed += 1;
    }
    store.setCursor({
      source: "eln.records",
      cursor: `eln:${indexed}`,
      metadata: { store: "core.sqlite", collections: [...ELN_SEARCH_COLLECTIONS] },
    });
    store.setSourceState("eln.records", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureElnRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, job: SearchIndexJob): number {
  const target = databaseRecordTargetFromJob(job);
  if (!target || !ELN_SEARCH_COLLECTIONS.includes(target.collectionName as typeof ELN_SEARCH_COLLECTIONS[number])) return 0;
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "records")) return 0;
    const row = db.prepare(`
      SELECT namespace_id, collection_name, id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
      LIMIT 1
    `).get(target.namespaceId, target.collectionName, target.recordId) as SearchDocuments.DatabaseRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "eln.records", resourceId: target.resourceId, reason: "ELN record missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.elnRecordSearchDocument(row);
    if (!document) {
      store.tombstone({ source: "eln.records", resourceId: target.resourceId, reason: "ELN record excluded during Search event refresh" });
      return 1;
    }
    store.upsertDocument(document);
    store.setSourceState("eln.records", "enabled", {
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
    if (!SearchDocuments.hasTable(db, "skills")) {
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
    `).all() as SearchDocuments.SkillRegistryRow[];
    let indexed = 0;
    for (const row of rows) {
      const document = SearchDocuments.skillRegistrySearchDocument(row);
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
    if (!SearchDocuments.hasTable(db, "skills")) return 0;
    const row = db.prepare(`
      SELECT id, slug, kind, name, body, scope_json, secret_refs_json, metadata_json, export_path, created_at, updated_at
      FROM skills
      WHERE slug = ?
      LIMIT 1
    `).get(slug) as SearchDocuments.SkillRegistryRow | undefined;
    if (!row) {
      store.tombstone({ source: "skills.registry", resourceId: slug, reason: "skill missing during Search event refresh" });
      return 1;
    }
    const document = SearchDocuments.skillRegistrySearchDocument(row);
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

function ensureProvidersRoutingSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("providers.routing", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "provider_routing") || !SearchDocuments.hasTable(db, "provider_settings")) {
      store.setSourceState("providers.routing", "degraded", {
        backlog: 0,
        error: "core database does not contain provider routing tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const routingRows = db.prepare(`
      SELECT id, feature, capability, provider, model, account_ref, policy_json, metadata_json, created_at, updated_at
      FROM provider_routing
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.ProviderRoutingRow[];
    const settingRows = db.prepare(`
      SELECT id, provider, enabled, policy_json, metadata_json, created_at, updated_at
      FROM provider_settings
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.ProviderSettingRow[];
    let indexed = 0;
    for (const row of routingRows) {
      store.upsertDocument(SearchDocuments.providerRoutingSearchDocument(row));
      indexed += 1;
    }
    for (const row of settingRows) {
      store.upsertDocument(SearchDocuments.providerSettingSearchDocument(row));
      indexed += 1;
    }
    store.setCursor({
      source: "providers.routing",
      cursor: `providers:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["provider_routing", "provider_settings"] },
    });
    store.setSourceState("providers.routing", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureProvidersRoutingResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "provider_routing") || !SearchDocuments.hasTable(db, "provider_settings")) return 0;
    if (resourceId.startsWith("setting:")) {
      const provider = resourceId.slice("setting:".length);
      const row = db.prepare(`
        SELECT id, provider, enabled, policy_json, metadata_json, created_at, updated_at
        FROM provider_settings
        WHERE provider = ?
        LIMIT 1
      `).get(provider) as SearchDocuments.ProviderSettingRow | undefined;
      if (!row) {
        store.tombstone({ source: "providers.routing", resourceId, reason: "provider setting missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.providerSettingSearchDocument(row));
      store.setSourceState("providers.routing", "enabled", {
        backlog: 0,
        error: null,
        lastIndexedAt: new Date().toISOString(),
      });
      return 1;
    }
    const parsed = parseProviderRoutingResourceId(resourceId);
    if (!parsed) {
      store.tombstone({ source: "providers.routing", resourceId, reason: "unknown provider routing resource during Search event refresh" });
      return 1;
    }
    const row = db.prepare(`
      SELECT id, feature, capability, provider, model, account_ref, policy_json, metadata_json, created_at, updated_at
      FROM provider_routing
      WHERE feature = ? AND capability = ?
      LIMIT 1
    `).get(parsed.feature, parsed.capability) as SearchDocuments.ProviderRoutingRow | undefined;
    if (!row) {
      store.tombstone({ source: "providers.routing", resourceId, reason: "provider route missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.providerRoutingSearchDocument(row));
    store.setSourceState("providers.routing", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureSnippetsLibrarySourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("snippets.library", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "snippets")) {
      store.setSourceState("snippets.library", "degraded", {
        backlog: 0,
        error: "core database does not contain snippets",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, slug, kind, title, body, shortcut, scope_json, skill_refs_json, metadata_json, created_at, updated_at
      FROM snippets
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.SnippetLibraryRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.snippetLibrarySearchDocument(row));
    store.setCursor({
      source: "snippets.library",
      cursor: `snippets:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["snippets"] },
    });
    store.setSourceState("snippets.library", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureSnippetsLibraryResourceIndexed(store: SearchStore, flags: Record<string, string>, slug: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "snippets")) return 0;
    const row = db.prepare(`
      SELECT id, slug, kind, title, body, shortcut, scope_json, skill_refs_json, metadata_json, created_at, updated_at
      FROM snippets
      WHERE slug = ?
      LIMIT 1
    `).get(slug) as SearchDocuments.SnippetLibraryRow | undefined;
    if (!row) {
      store.tombstone({ source: "snippets.library", resourceId: slug, reason: "snippet missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.snippetLibrarySearchDocument(row));
    store.setSourceState("snippets.library", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureAgentsCatalogSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("agents.catalog", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "agents") || !SearchDocuments.hasTable(db, "personalities") || !SearchDocuments.hasTable(db, "skill_collections") || !SearchDocuments.hasTable(db, "connections")) {
      store.setSourceState("agents.catalog", "degraded", {
        backlog: 0,
        error: "core database does not contain agent catalog tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const agents = db.prepare(`
      SELECT id, kind, name, status, agency_mode, role, title, description, owner_kind, owner_id,
        workspace_id, project_id, runtime, model, autonomy_profile, builtin, secret_ref,
        config_json, export_path, retired_at, created_at, updated_at
      FROM agents
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogAgentRow[];
    const personalities = db.prepare(`
      SELECT id, name, description, prompt, version, created_at, updated_at
      FROM personalities
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogPersonalityRow[];
    const collections = db.prepare(`
      SELECT id, name, description, skills_json, metadata_json, export_path, created_at, updated_at
      FROM skill_collections
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogSkillCollectionRow[];
    const connections = db.prepare(`
      SELECT id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at
      FROM connections
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.AgentCatalogConnectionRow[];
    let indexed = 0;
    for (const row of agents) {
      store.upsertDocument(agentCatalogAgentSearchDocument(row));
      indexed += 1;
    }
    for (const row of personalities) {
      store.upsertDocument(agentCatalogPersonalitySearchDocument(row));
      indexed += 1;
    }
    for (const row of collections) {
      store.upsertDocument(agentCatalogSkillCollectionSearchDocument(row));
      indexed += 1;
    }
    for (const row of connections) {
      store.upsertDocument(agentCatalogConnectionSearchDocument(row));
      indexed += 1;
    }
    store.setCursor({
      source: "agents.catalog",
      cursor: `agents:${indexed}`,
      metadata: { store: "core.sqlite", collections: ["agents", "personalities", "skill_collections", "connections"] },
    });
    store.setSourceState("agents.catalog", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureAgentsCatalogResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string): number {
  const parsed = parseAgentCatalogResourceId(resourceId);
  if (!parsed) {
    store.tombstone({ source: "agents.catalog", resourceId, reason: "unknown agent catalog resource during Search event refresh" });
    return 1;
  }
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (parsed.kind === "agent") {
      if (!SearchDocuments.hasTable(db, "agents")) return 0;
      const row = db.prepare(`
        SELECT id, kind, name, status, agency_mode, role, title, description, owner_kind, owner_id,
          workspace_id, project_id, runtime, model, autonomy_profile, builtin, secret_ref,
          config_json, export_path, retired_at, created_at, updated_at
        FROM agents
        WHERE id = ?
        LIMIT 1
      `).get(parsed.id) as SearchDocuments.AgentCatalogAgentRow | undefined;
      if (!row) {
        store.tombstone({ source: "agents.catalog", resourceId, reason: "agent missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(agentCatalogAgentSearchDocument(row));
      store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
      return 1;
    }
    if (parsed.kind === "personality") {
      if (!SearchDocuments.hasTable(db, "personalities")) return 0;
      const row = db.prepare(`
        SELECT id, name, description, prompt, version, created_at, updated_at
        FROM personalities
        WHERE id = ?
        LIMIT 1
      `).get(parsed.id) as SearchDocuments.AgentCatalogPersonalityRow | undefined;
      if (!row) {
        store.tombstone({ source: "agents.catalog", resourceId, reason: "personality missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(agentCatalogPersonalitySearchDocument(row));
      store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
      return 1;
    }
    if (parsed.kind === "skill_collection") {
      if (!SearchDocuments.hasTable(db, "skill_collections")) return 0;
      const row = db.prepare(`
        SELECT id, name, description, skills_json, metadata_json, export_path, created_at, updated_at
        FROM skill_collections
        WHERE id = ?
        LIMIT 1
      `).get(parsed.id) as SearchDocuments.AgentCatalogSkillCollectionRow | undefined;
      if (!row) {
        store.tombstone({ source: "agents.catalog", resourceId, reason: "skill collection missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(agentCatalogSkillCollectionSearchDocument(row));
      store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
      return 1;
    }
    if (!SearchDocuments.hasTable(db, "connections")) return 0;
    const row = db.prepare(`
      SELECT id, provider, label, secret_ref, config_json, metadata_json, created_at, updated_at
      FROM connections
      WHERE id = ?
      LIMIT 1
    `).get(parsed.id) as SearchDocuments.AgentCatalogConnectionRow | undefined;
    if (!row) {
      store.tombstone({ source: "agents.catalog", resourceId, reason: "connection missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(agentCatalogConnectionSearchDocument(row));
    store.setSourceState("agents.catalog", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

function ensureMarketplaceChoicesSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("marketplace.choices", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "marketplace_choices")) {
      store.setSourceState("marketplace.choices", "degraded", {
        backlog: 0,
        error: "core database does not contain marketplace choices",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, target, choice, status, rationale, metadata_json, created_at, updated_at
      FROM marketplace_choices
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.MarketplaceChoiceRow[];
    for (const row of rows) store.upsertDocument(marketplaceChoiceSearchDocument(row));
    store.setCursor({
      source: "marketplace.choices",
      cursor: `marketplace:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["marketplace_choices"] },
    });
    store.setSourceState("marketplace.choices", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureMarketplaceChoiceResourceIndexed(store: SearchStore, flags: Record<string, string>, choiceId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "marketplace_choices")) return 0;
    const row = db.prepare(`
      SELECT id, kind, target, choice, status, rationale, metadata_json, created_at, updated_at
      FROM marketplace_choices
      WHERE id = ?
      LIMIT 1
    `).get(choiceId) as SearchDocuments.MarketplaceChoiceRow | undefined;
    if (!row) {
      store.tombstone({ source: "marketplace.choices", resourceId: choiceId, reason: "marketplace choice missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(marketplaceChoiceSearchDocument(row));
    store.setSourceState("marketplace.choices", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  } finally {
    db.close();
  }
}

function ensureContentItemsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("content.items", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "content_items")) {
      store.setSourceState("content.items", "degraded", {
        backlog: 0,
        error: "core database does not contain content items",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, title, status, brand_id, campaign_id, page_id, metadata_json, created_at, updated_at
      FROM content_items
      ORDER BY updated_at DESC
    `).all() as SearchDocuments.ContentItemRow[];
    for (const row of rows) store.upsertDocument(contentItemSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setCursor({
      source: "content.items",
      cursor: `content:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["content_items"] },
    });
    store.setSourceState("content.items", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureContentItemResourceIndexed(store: SearchStore, flags: Record<string, string>, itemId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "content_items")) return 0;
    const row = db.prepare(`
      SELECT id, kind, title, status, brand_id, campaign_id, page_id, metadata_json, created_at, updated_at
      FROM content_items
      WHERE id = ?
      LIMIT 1
    `).get(itemId) as SearchDocuments.ContentItemRow | undefined;
    if (!row) {
      store.tombstone({ source: "content.items", resourceId: itemId, reason: "content item missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(contentItemSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("content.items", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

function ensureBusinessRecordsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("business.records", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "business_records")) {
      store.setSourceState("business.records", "degraded", {
        backlog: 0,
        error: "core database does not contain business records",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, name, status, page_id, metadata_json, created_at, updated_at
      FROM business_records
      ORDER BY updated_at DESC
    `).all() as BusinessRecordRow[];
    for (const row of rows) store.upsertDocument(businessRecordSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setCursor({
      source: "business.records",
      cursor: `business:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["business_records"] },
    });
    store.setSourceState("business.records", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureBusinessRecordResourceIndexed(store: SearchStore, flags: Record<string, string>, recordId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "business_records")) return 0;
    const row = db.prepare(`
      SELECT id, kind, name, status, page_id, metadata_json, created_at, updated_at
      FROM business_records
      WHERE id = ?
      LIMIT 1
    `).get(recordId) as BusinessRecordRow | undefined;
    if (!row) {
      store.tombstone({ source: "business.records", resourceId: recordId, reason: "business record missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(businessRecordSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("business.records", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

function ensureSocialPostsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("social.posts", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "social_posts")) {
      store.setSourceState("social.posts", "degraded", {
        backlog: 0,
        error: "core database does not contain social posts",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, title, status, channel_json, scheduled_at, published_at, page_id, metadata_json, created_at, updated_at
      FROM social_posts
      ORDER BY COALESCE(scheduled_at, updated_at) DESC
    `).all() as SearchDocuments.SocialPostRow[];
    for (const row of rows) store.upsertDocument(SearchDocuments.socialPostSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setCursor({
      source: "social.posts",
      cursor: `social:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["social_posts"] },
    });
    store.setSourceState("social.posts", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureSocialPostResourceIndexed(store: SearchStore, flags: Record<string, string>, postId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "social_posts")) return 0;
    const row = db.prepare(`
      SELECT id, title, status, channel_json, scheduled_at, published_at, page_id, metadata_json, created_at, updated_at
      FROM social_posts
      WHERE id = ?
      LIMIT 1
    `).get(postId) as SearchDocuments.SocialPostRow | undefined;
    if (!row) {
      store.tombstone({ source: "social.posts", resourceId: postId, reason: "social post missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(SearchDocuments.socialPostSearchDocument(row, SearchDocuments.pageBodyForSearch(db, row.page_id)));
    store.setSourceState("social.posts", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return 1;
  } finally {
    db.close();
  }
}

function ensureIotConfigSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setSourceState("iot.config", "enabled", { backlog: 0, lastIndexedAt: new Date().toISOString() });
    return 0;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "iot_config")) {
      store.setSourceState("iot.config", "degraded", {
        backlog: 0,
        error: "core database does not contain IoT config",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const rows = db.prepare(`
      SELECT id, kind, name, parent_id, status, config_json, secret_ref, enabled, metadata_json, created_at, updated_at
      FROM iot_config
      ORDER BY kind, name
    `).all() as SearchDocuments.IotConfigRow[];
    for (const row of rows) store.upsertDocument(iotConfigSearchDocument(row));
    store.setCursor({
      source: "iot.config",
      cursor: `iot:${rows.length}`,
      metadata: { store: "core.sqlite", collections: ["iot_config"] },
    });
    store.setSourceState("iot.config", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
    return rows.length;
  } finally {
    db.close();
  }
}

function ensureIotConfigResourceIndexed(store: SearchStore, flags: Record<string, string>, configId: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "iot_config")) return 0;
    const row = db.prepare(`
      SELECT id, kind, name, parent_id, status, config_json, secret_ref, enabled, metadata_json, created_at, updated_at
      FROM iot_config
      WHERE id = ?
      LIMIT 1
    `).get(configId) as SearchDocuments.IotConfigRow | undefined;
    if (!row) {
      store.tombstone({ source: "iot.config", resourceId: configId, reason: "IoT config missing during Search event refresh" });
      return 1;
    }
    store.upsertDocument(iotConfigSearchDocument(row));
    store.setSourceState("iot.config", "enabled", { backlog: 0, error: null, lastIndexedAt: new Date().toISOString() });
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
    if (!SearchDocuments.hasTable(db, "connector_operations") || !SearchDocuments.hasTable(db, "connector_providers")) {
      store.setSourceState("connectors.catalog", "degraded", {
        backlog: 0,
        error: "core database does not contain connector catalog tables",
        lastIndexedAt: new Date().toISOString(),
      });
      return 0;
    }
    const capabilities = SearchDocuments.connectorCapabilitiesById(db);
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
    `).all() as SearchDocuments.ConnectorOperationRow[];
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
    if (!SearchDocuments.hasTable(db, "connector_operations") || !SearchDocuments.hasTable(db, "connector_providers")) return 0;
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
    `).get(operationId) as SearchDocuments.ConnectorOperationRow | undefined;
    if (!row) {
      store.tombstone({ source: "connectors.catalog", resourceId: operationId, reason: "connector operation missing during Search event refresh" });
      return 1;
    }
    const document = connectorCatalogSearchDocument(row, SearchDocuments.connectorCapabilitiesById(db));
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
    cursor: `config:${SearchDocuments.stableSearchId(configPath)}:servers:${indexed}`,
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
    if (!SearchDocuments.hasTable(db, "apps")) return 0;
    const rows = db.prepare(`
      SELECT id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      FROM apps
      ORDER BY pinned DESC, COALESCE(last_opened_at, updated_at) DESC
    `).all() as SearchDocuments.AppCatalogRow[];
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
    if (!SearchDocuments.hasTable(db, "apps")) return 0;
    const row = db.prepare(`
      SELECT id, slug, name, description, root_path, manifest_json, permissions_json, pinned, last_opened_at, created_by_chat_id, created_at, updated_at
      FROM apps
      WHERE id = ? OR slug = ?
      LIMIT 1
    `).get(appId, appId) as SearchDocuments.AppCatalogRow | undefined;
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

function ensureDesignResourcesSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const workspaceRoot = resolveDesignWorkspaceRoot(flags, cwd);
  let indexed = ensureFileBackedDesignResourcesIndexed(store, workspaceRoot);
  const dbPath = resolveMainDbPath(flags);
  if (!fs.existsSync(dbPath)) {
    store.setCursor({
      source: "design.resources",
      cursor: `workspace:${SearchDocuments.stableSearchId(workspaceRoot)}:resources:${indexed}`,
      metadata: { workspaceRoot, fileBacked: true },
    });
    store.setSourceState("design.resources", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  }
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!SearchDocuments.hasTable(db, "design_resources")) {
      store.setCursor({
        source: "design.resources",
        cursor: `workspace:${SearchDocuments.stableSearchId(workspaceRoot)}:resources:${indexed}`,
        metadata: { workspaceRoot, fileBacked: true },
      });
      store.setSourceState("design.resources", "enabled", {
        backlog: 0,
        error: null,
        lastIndexedAt: new Date().toISOString(),
      });
      return indexed;
    }
    const rows = db.prepare(`
      SELECT id, kind, name, root_path, manifest_json, builtin, created_at, updated_at
      FROM design_resources
      ORDER BY kind, updated_at DESC
    `).all() as SearchDocuments.DesignResourceRow[];
    for (const row of rows) store.upsertDocument(designResourceSearchDocument(row));
    indexed += rows.length;
    store.setCursor({
      source: "design.resources",
      cursor: `resources:${rows.length}:workspace:${SearchDocuments.stableSearchId(workspaceRoot)}:${indexed}`,
      metadata: { store: "core.sqlite", table: "design_resources", workspaceRoot, fileBacked: true },
    });
    store.setSourceState("design.resources", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return indexed;
  } finally {
    db.close();
  }
}

function ensureDesignResourceIndexed(store: SearchStore, flags: Record<string, string>, resourceId: string, cwd: string, workspaceRootOverride?: string): number {
  const dbPath = resolveMainDbPath(flags);
  if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      if (SearchDocuments.hasTable(db, "design_resources")) {
        const row = db.prepare(`
      SELECT id, kind, name, root_path, manifest_json, builtin, created_at, updated_at
      FROM design_resources
      WHERE id = ?
      LIMIT 1
    `).get(resourceId) as SearchDocuments.DesignResourceRow | undefined;
        if (row) {
          store.upsertDocument(designResourceSearchDocument(row));
          store.setSourceState("design.resources", "enabled", {
            backlog: 0,
            error: null,
            lastIndexedAt: new Date().toISOString(),
          });
          return 1;
        }
      }
    } finally {
      db.close();
    }
  }
  const workspaceRoot = workspaceRootOverride ? path.resolve(workspaceRootOverride) : resolveDesignWorkspaceRoot(flags, cwd);
  const fileBacked = fileBackedDesignResourceSearchDocument(workspaceRoot, resourceId);
  if (fileBacked) {
    store.upsertDocument(fileBacked);
  } else {
    store.tombstone({ source: "design.resources", resourceId, reason: "design resource missing during Search event refresh" });
  }
  store.setSourceState("design.resources", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function resolveDesignWorkspaceRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags.workspace ?? cwd);
}

function ensureFileBackedDesignResourcesIndexed(store: SearchStore, workspaceRoot: string): number {
  const documents = [
    ...listStyles(workspaceRoot).map((summary) => fileBackedDesignResourceSearchDocument(workspaceRoot, `style:${summary.id}`)),
    ...listTemplates(workspaceRoot).map((summary) => fileBackedDesignResourceSearchDocument(workspaceRoot, `template:${summary.id}`)),
    ...listReferences(workspaceRoot).map((summary) => fileBackedDesignResourceSearchDocument(workspaceRoot, `reference:${summary.id}`)),
  ].filter((document): document is SearchDocumentInput => !!document);
  for (const document of documents) store.upsertDocument(document);
  return documents.length;
}

function fileBackedDesignResourceSearchDocument(workspaceRoot: string, resourceId: string): SearchDocumentInput | null {
  const [kind, id] = parseDesignResourceId(resourceId);
  try {
    if (kind === "style") {
      const manifest = readStyle(workspaceRoot, id);
      return designResourceSearchDocument({
        id: `style:${manifest.id}`,
        kind: "style",
        name: manifest.name,
        root_path: styleManifestPath(workspaceRoot, manifest.id),
        manifest_json: JSON.stringify(manifest),
        builtin: manifest.builtin ? 1 : 0,
        created_at: manifest.createdAt,
        updated_at: manifest.updatedAt,
      });
    }
    if (kind === "template") {
      const manifest = readTemplate(workspaceRoot, id);
      return designResourceSearchDocument({
        id: `template:${manifest.id}`,
        kind: "template",
        name: manifest.name,
        root_path: templateManifestPath(workspaceRoot, manifest.id),
        manifest_json: JSON.stringify(manifest),
        builtin: manifest.builtin ? 1 : 0,
        created_at: manifest.createdAt,
        updated_at: manifest.updatedAt,
      });
    }
    if (kind === "reference") {
      const manifest = readReference(workspaceRoot, id);
      return designResourceSearchDocument({
        id: `reference:${manifest.id}`,
        kind: "reference",
        name: manifest.name,
        root_path: path.join(referenceDir(workspaceRoot, manifest.id), "REFERENCE.md"),
        manifest_json: JSON.stringify(manifest),
        builtin: 0,
        created_at: manifest.createdAt,
        updated_at: manifest.updatedAt,
      });
    }
  } catch {
    return null;
  }
  return null;
}

function parseDesignResourceId(resourceId: string): ["style" | "template" | "reference", string] {
  const separator = resourceId.indexOf(":");
  if (separator > 0) {
    const kind = resourceId.slice(0, separator);
    const id = resourceId.slice(separator + 1);
    if ((kind === "style" || kind === "template" || kind === "reference") && id) return [kind, id];
  }
  return ["style", resourceId];
}

function ensureRuntimeEventsSourceIndexed(store: SearchStore, flags: Record<string, string>): number {
  let indexed = 0;
  const runtimePath = resolveSearchSidecarPath(flags, "runtime.sqlite");
  if (fs.existsSync(runtimePath)) {
    const db = new Database(runtimePath, { readonly: true, fileMustExist: true });
    try {
      if (SearchDocuments.hasTable(db, "runtime_jobs")) {
        const jobs = db.prepare(`
          SELECT id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at
          FROM runtime_jobs
          ORDER BY updated_at DESC
        `).all() as SearchDocuments.RuntimeJobRow[];
        for (const job of jobs) {
          store.upsertDocument(SearchDocuments.runtimeJobSearchDocument(job));
          indexed += 1;
        }
      }
      if (SearchDocuments.hasTable(db, "runtime_events")) {
        const events = db.prepare(`
          SELECT id, job_id, kind, level, message, created_at, metadata_json
          FROM runtime_events
          ORDER BY created_at DESC
        `).all() as SearchDocuments.RuntimeEventRow[];
        for (const event of events) {
          store.upsertDocument(SearchDocuments.runtimeEventSearchDocument(event));
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
      if (!SearchDocuments.hasTable(db, "operational_events")) continue;
      const rows = db.prepare(`
        SELECT id, kind, level, message, created_at, metadata_json
        FROM operational_events
        ORDER BY created_at DESC
      `).all() as SearchDocuments.OperationalEventRow[];
      for (const row of rows) {
        store.upsertDocument(SearchDocuments.operationalEventSearchDocument(row, sidecar));
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
      if (!SearchDocuments.hasTable(db, "runtime_jobs")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, kind, title, status, claim_owner, run_at, attempts, payload_json, created_at, updated_at
        FROM runtime_jobs
        WHERE id = ?
      `).get(jobId) as SearchDocuments.RuntimeJobRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime job missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.runtimeJobSearchDocument(row));
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
      if (!SearchDocuments.hasTable(db, "runtime_events")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, job_id, kind, level, message, created_at, metadata_json
        FROM runtime_events
        WHERE id = ?
      `).get(eventId) as SearchDocuments.RuntimeEventRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "runtime event missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.runtimeEventSearchDocument(row));
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
      if (!SearchDocuments.hasTable(db, "operational_events")) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "operational event table missing during Search event refresh" });
        return 1;
      }
      const row = db.prepare(`
        SELECT id, kind, level, message, created_at, metadata_json
        FROM operational_events
        WHERE id = ?
      `).get(eventId) as SearchDocuments.OperationalEventRow | undefined;
      if (!row) {
        store.tombstone({ source: "runtime.events", resourceId, reason: "operational event missing during Search event refresh" });
        return 1;
      }
      store.upsertDocument(SearchDocuments.operationalEventSearchDocument(row, sidecar));
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
  const maxFiles = SearchDocuments.boundedNumberFlag(flags["code-limit"] ?? flags["search-code-limit"], 500, 1, 10000);
  const maxDepth = SearchDocuments.boundedNumberFlag(flags["code-max-depth"], 8, 1, 32);
  const maxBytes = SearchDocuments.boundedNumberFlag(flags["code-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const files = discoverCodeSearchFiles(root, { maxFiles, maxDepth, maxBytes });
  let indexed = 0;
  for (const file of files) {
    const document = codeFileSearchDocument(root, file);
    if (!document) continue;
    upsertCodeFileSearchDocument(store, document);
    indexed += 1;
  }
  store.setCursor({
    source: "code.symbols",
    cursor: `root:${SearchDocuments.stableSearchId(root)}:files:${indexed}`,
    metadata: { root, maxFiles, maxDepth, maxBytes },
  });
  store.setSourceState("code.symbols", "enabled", {
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
