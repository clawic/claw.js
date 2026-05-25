// @clawjs-persistent-surface-ddl-source
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto"; import Database from "better-sqlite3";
import { requireMacCareRoutePathPattern } from "@clawjs/core";
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
  scheduleSessionEventsSearchEvent,
  scheduleSessionTurnsSearchEvent,
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
export { runSearchQueryCli } from "./cli-search-query-heavy.ts";
export { runSearchAdminCli } from "./cli-search-admin-heavy.ts";
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
  ensureSessionEventsResourceIndexed,
  ensureSessionTurnsResourceIndexed,
  ensureSessionsEventsSourceIndexed,
  ensureSessionsChatsSourceIndexed,
  ensureSessionsTurnsSourceIndexed,
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
export async function runSearchRebuildCli(input: {
  flags: Record<string, string>;
  argv: string[];
  context: CliContext;
  wantsJson: boolean;
}): Promise<number> {
  const store = openCliSearchStore(input.flags, { recoverRebuildableIndex: true });
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
      const priority = parseSearchRebuildJobPriority(input.flags.priority);
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
        priority,
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
  const sessionEventsIndexed = rebuildsSource("sessions.events") ? ensureSessionsEventsSourceIndexed(store, input.flags) : 0;
  const sessionTurnsIndexed = rebuildsSource("sessions.turns") ? ensureSessionsTurnsSourceIndexed(store, input.flags) : 0;
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
      ...(sessionEventsIndexed > 0 ? ["sessions.events"] : []),
      ...(sessionTurnsIndexed > 0 ? ["sessions.turns"] : []),
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
      reindexed: commandsIndexed + sessionsIndexed + sessionEventsIndexed + sessionTurnsIndexed + databaseIndexed + workIndexed + documentsIndexed + notesIndexed + knowledgeIndexed + signalsIndexed + calendarIndexed + financeIndexed + elnIndexed + imagesIndexed + mediaIndexed + slidesIndexed + sheetsIndexed + generationsIndexed + codeIndexed + docsIndexed + skillsIndexed + providersIndexed + snippetsIndexed + agentsIndexed + marketplaceIndexed + contentIndexed + businessIndexed + socialIndexed + iotIndexed + connectorsIndexed + mcpIndexed + appsIndexed + designIndexed + runtimeIndexed + surfacesIndexed + surfaceRegistryIndexed + localFilesIndexed + webIndexed + externalIndexed + nativeSystemIndexed,
      embeddings: 0,
      sourceSet: input.flags["source-set"] === "full" ? "full" : "framework",
      storage: searchStorageMetadata(input.flags),
      sources: Array.from(indexedSourceIds),
      indexedBySource: {
        commands: commandsIndexed,
        "sessions.chats": sessionsIndexed,
        "sessions.events": sessionEventsIndexed,
        "sessions.turns": sessionTurnsIndexed,
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

function parseSearchRebuildJobPriority(raw: string | undefined): number {
  if (raw === undefined) return 50;
  const priority = Number(raw);
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) {
    throw new CliHandledError("invalid_search_job_priority", `Expected --priority to be a number between 0 and 100, got ${raw}.`, CLI_EXIT_USAGE, {
      location: "cli.search.rebuild.priority",
      suggestion: "Pass a bounded priority such as --priority 50.",
      safeNextStep: "Rerun search rebuild with a numeric --priority from 0 to 100.",
    });
  }
  return Math.floor(priority);
}

export function runSearchServiceAction(action: string, input: {
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

export function scheduleSearchChangedSourceEvent(input: {
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
    case "sessions.events": {
      const sessionId = input.flags["session-id"] ?? input.flags["resource-id"] ?? input.flags.session ?? input.positionals[5];
      if (!sessionId) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source sessions.events --session-id <session-id>" };
      return scheduleSessionEventsSearchEvent({
        operation: input.operation,
        sessionId,
        dataDir,
        flags: input.flags,
        observedAt,
      });
    }
    case "sessions.turns": {
      const sessionId = input.flags["session-id"] ?? input.flags["resource-id"] ?? input.flags.session ?? input.positionals[5];
      if (!sessionId) return { ok: false, error: "Usage: claw search changes schedule <upsert|delete> --source sessions.turns --session-id <session-id>" };
      return scheduleSessionTurnsSearchEvent({
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
    "sessions.events",
    "sessions.turns",
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

export function expandSearchPath(value: string): string {
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
  const jobFlags = searchIndexJobFlags(flags, job);
  if (job.operation === "delete") {
    if (!job.resourceId) return 0;
    store.tombstone({ source: job.source, resourceId: job.resourceId, reason: "search service delete job" });
    return 1;
  }
  if (job.operation === "upsert" && job.resourceId) {
    const indexed = runSearchResourceIndexJob(store, job, jobFlags, cwd);
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
      return ensureSessionsChatsSourceIndexed(store, jobFlags);
    case "sessions.events":
      return ensureSessionsEventsSourceIndexed(store, jobFlags);
    case "sessions.turns":
      return ensureSessionsTurnsSourceIndexed(store, jobFlags);
    case "database.records":
      return ensureDatabaseRecordsSourceIndexed(store, jobFlags);
    case "work.items":
      return ensureWorkItemsSourceIndexed(store, jobFlags);
    case "documents.blocks":
      return ensureDocumentsBlocksSourceIndexed(store, jobFlags);
    case "notes.pages":
      return ensureNotesPagesSourceIndexed(store, jobFlags);
    case "knowledge.graph":
      return ensureKnowledgeGraphSourceIndexed(store, jobFlags);
    case "signals.observations":
      return ensureSignalsObservationsSourceIndexed(store, jobFlags);
    case "calendar.events":
      return ensureCalendarEventsSourceIndexed(store, jobFlags);
    case "finance.records":
      return ensureFinanceRecordsSourceIndexed(store, jobFlags);
    case "eln.records":
      return ensureElnRecordsSourceIndexed(store, jobFlags);
    case "images.derived":
      return ensureImagesDerivedSourceIndexed(store, jobFlags, cwd);
    case "media.assets":
      return ensureMediaAssetsSourceIndexed(store, jobFlags, cwd);
    case "slides.decks":
      return ensureSlidesDecksSourceIndexed(store, jobFlags, cwd);
    case "sheets.workbooks":
      return ensureSheetsWorkbooksSourceIndexed(store, jobFlags, cwd);
    case "generations.artifacts":
      return ensureGenerationsArtifactsSourceIndexed(store, jobFlags, cwd);
    case "code.symbols":
      return ensureCodeSymbolsSourceIndexed(store, jobFlags, cwd);
    case "docs.pages":
      return ensureDocsPagesSourceIndexed(store, cwd);
    case "skills.registry":
      return ensureSkillsRegistrySourceIndexed(store, jobFlags);
    case "providers.routing":
      return ensureProvidersRoutingSourceIndexed(store, jobFlags);
    case "snippets.library":
      return ensureSnippetsLibrarySourceIndexed(store, jobFlags);
    case "agents.catalog":
      return ensureAgentsCatalogSourceIndexed(store, jobFlags);
    case "marketplace.choices":
      return ensureMarketplaceChoicesSourceIndexed(store, jobFlags);
    case "content.items":
      return ensureContentItemsSourceIndexed(store, jobFlags);
    case "business.records":
      return ensureBusinessRecordsSourceIndexed(store, jobFlags);
    case "social.posts":
      return ensureSocialPostsSourceIndexed(store, jobFlags);
    case "iot.config":
      return ensureIotConfigSourceIndexed(store, jobFlags);
    case "connectors.catalog":
      return ensureConnectorsCatalogSourceIndexed(store, jobFlags);
    case "mcp.servers":
      return ensureMcpServersSourceIndexed(store, jobFlags, cwd);
    case "apps.catalog":
      return ensureAppsCatalogSourceIndexed(store, jobFlags);
    case "design.resources":
      return ensureDesignResourcesSourceIndexed(store, jobFlags, cwd);
    case "runtime.events":
      return ensureRuntimeEventsSourceIndexed(store, jobFlags);
    case "surfaces.routes":
      return ensureSurfacesRoutesSourceIndexed(store);
    case "surfaces.registry":
      return ensureSurfacesRegistrySourceIndexed(store);
    case "local.files":
      return ensureLocalFilesSourceIndexed(store, jobFlags, cwd);
    case "web.ingested":
      return ensureWebIngestedSourceIndexed(store, jobFlags, cwd);
    case "external.cache":
      return ensureExternalCacheSourceIndexed(store, jobFlags, cwd);
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
    case "sessions.events":
      return indexJobResource(job, "sessionId", (sessionId) => ensureSessionEventsResourceIndexed(store, flags, sessionId));
    case "sessions.turns":
      return indexJobResource(job, "sessionId", (sessionId) => ensureSessionTurnsResourceIndexed(store, flags, sessionId));
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

function searchIndexJobFlags(flags: Record<string, string>, job: SearchIndexJob): Record<string, string> {
  const root = resourceIdFromJobPayload(job, "root");
  if (!root) return flags;
  if (job.source === "code.symbols") return { ...flags, "code-root": root, root };
  if (job.source === "local.files") return { ...flags, "file-root": root, "local-files-root": root, root };
  if (job.source === "web.ingested") return { ...flags, "web-root": root, "web-cache-root": root, root };
  if (job.source === "external.cache") return { ...flags, "external-root": root, "external-cache-root": root, root };
  return flags;
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

export function runSearchActionExecuteCli(input: {
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

export function parseSearchPolicyMode(value: string | undefined): "strict" | "normal" | "authorized_automation" | undefined {
  if (!value) return undefined;
  if (value === "strict" || value === "normal" || value === "authorized_automation") return value;
  throw new CliHandledError("invalid_policy_mode", "Use --policy-mode strict, normal, or authorized_automation.", CLI_EXIT_USAGE);
}

export function openCliSearchStore(flags: Record<string, string>, options: { recoverRebuildableIndex?: boolean } = {}): SearchStore {
  const dbPath = resolveSearchDbPath(flags);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    return new SearchStore(dbPath);
  } catch (error) {
    if (options.recoverRebuildableIndex && isRebuildableSearchStorageError(error)) {
      quarantineRebuildableSearchIndex(dbPath);
      return new SearchStore(dbPath);
    }
    if (hasExplicitSearchStorage(flags)) throw error;
    return new SearchStore(searchFallbackDbPath());
  }
}

export function isRebuildableSearchStorageError(error: unknown): boolean {
  return error instanceof Error
    && /file is not a database|database disk image is malformed|not a database|SQLITE_CORRUPT|SQLITE_NOTADB|malformed database schema/i.test(error.message);
}

function quarantineRebuildableSearchIndex(dbPath: string): void {
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!fs.existsSync(candidate)) continue;
    fs.renameSync(candidate, `${candidate}.corrupt.${suffix}`);
  }
}

export function searchFallbackDbPath(): string {
  return path.join(requireMacCareRoutePathPattern("mac_care.route.system_temp"), "claw-search.sqlite");
}

export function searchCanonicalConfigEnv(flags: Record<string, string>): NodeJS.ProcessEnv {
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

export function readCanonicalSearchSourceStates(flags: Record<string, string>): Map<string, SearchSourceState> {
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

export function writeCanonicalSearchSourceState(
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

export function parseSearchSourceState(value: string): SearchSourceState | undefined {
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

export function resolveSearchDbPath(flags: Record<string, string>): string {
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

export function searchStorageMetadata(flags: Record<string, string>): { canonical: string; index: string; indexRebuildable: true } {
  return {
    canonical: "core.sqlite",
    index: "search.sqlite",
    indexRebuildable: true,
  };
}

export function registerCliSearchSources(store: SearchStore, flags: Record<string, string>, states: Map<string, SearchSourceState> = new Map()): void {
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

export function runSearchMonitorEvaluations(
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
  const limit = input.flags.limit ? SearchDocuments.boundedNumberFlag(input.flags.limit, 20, 1, 1000) : undefined;
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

export function sourceStateForAction(action: string, sourceId?: string, flags: Record<string, string> = {}): SearchSourceState {
  if ((action === "enable" || action === "resume") && sourceId === "native.system") {
    return importedHasNativeSystemSnapshotFlag(flags) ? "enabled" : "external_pending";
  }
  if (action === "enable" || action === "resume") return "enabled";
  if (action === "disable") return "disabled";
  if (action === "pause") return "paused";
  if (action === "exclude") return "excluded";
  return "enabled";
}
