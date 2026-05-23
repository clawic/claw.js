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
import { isRebuildableSearchStorageError, openCliSearchStore, registerCliSearchSources, resolveSearchDbPath, searchStorageMetadata } from "./cli-search-heavy-command.ts";

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
  const strategy = SearchDocuments.parseSearchStrategyFlag(input.flags.strategy);
  const embedding = SearchDocuments.parseSearchEmbeddingFlag(input.flags.embedding ?? input.flags["embedding-json"], input.flags["embedding-model"] ?? input.flags.model)
    ?? SearchDocuments.localTextEmbeddingForQuery(query, strategy, input.flags);
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
      strategy: strategy ?? "lexical",
      embeddingModel: embedding?.model ?? null,
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
  let store: SearchStore;
  try {
    store = openCliSearchStore(input.flags);
  } catch (error) {
    if (!isRebuildableSearchStorageError(error)) throw error;
    const data = {
      query,
      sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
      results: [],
      partial: true,
      omittedSources: [],
      stale: true,
      staleSources: [],
      elapsedMs: 0,
      strategy: strategy ?? "lexical",
      embeddingModel: embedding?.model ?? null,
      agentBudget: SearchDocuments.parseSearchAgentBudget(input.flags) ?? null,
      commandFallback: { policy: importedParseCommandFallbackPolicy(input.flags["command-fallback"] ?? input.flags["fallback-commands"]), applied: false, reason: "corrupt_index", added: 0 },
      storage: searchStorageMetadata(input.flags),
      indexState: "corrupt",
    };
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "search", data, { subcommand: "query" });
    } else {
      input.context.stdout.write("");
    }
    return CLI_EXIT_DEGRADED;
  }
  try {
    registerCliSearchSources(store, input.flags);
    const sources = SearchDocuments.parseListFlag(input.flags.sources ?? input.flags.source);
    const shards = SearchDocuments.parseListFlag(input.flags.shards ?? input.flags.shard);
    const filters = SearchDocuments.parseSearchFiltersFlag(input.flags.filters ?? input.flags.filter);
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
    if (SearchDocuments.searchQueryRequiresAudit(query, outputResults.results, filters)) {
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
export async function runWorkspaceSearchQueryCli(input: {
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

export interface SearchQueryStaleness {
  staleSources: SearchQueryOutput["staleSources"];
  scheduledRefreshJobs: SearchIndexJob[];
}

export function withSearchQueryStaleness(output: SearchQueryOutput, staleness: SearchQueryStaleness): SearchQueryOutput {
  if (!staleness.staleSources.length) return output;
  return {
    ...output,
    stale: true,
    staleSources: mergeSearchQueryStaleSources(output.staleSources, staleness.staleSources),
  };
}

export function scheduleSearchQueryRefreshJobs(store: SearchStore, input: {
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

export function searchQuerySelectedSourceManifests(input: {
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

export function searchQueryJobMatchesShards(job: SearchIndexJob, shards: string[] | undefined): boolean {
  return !shards?.length || shards.includes(job.shard);
}

export function mergeSearchQueryStaleSources(
  base: SearchQueryOutput["staleSources"],
  extra: SearchQueryOutput["staleSources"],
): SearchQueryOutput["staleSources"] {
  const merged = new Map<string, SearchQueryOutput["staleSources"][number]>();
  for (const staleSource of [...base, ...extra]) merged.set(staleSource.source, staleSource);
  return [...merged.values()];
}
