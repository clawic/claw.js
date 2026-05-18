import fs from "node:fs";
import path from "node:path";

import { SearchStore, createBuiltinSearchSourceManifests, type SearchIndexJob } from "@clawjs/search";

import { resolveClawjsDataRoot } from "./v1-data-core.ts";

const BUILTIN_SEARCH_SOURCES_BY_ID = new Map(createBuiltinSearchSourceManifests().map((source) => [source.id, source]));

export interface SearchEventScheduleResult {
  ok: boolean;
  job?: SearchIndexJob;
  error?: string;
}

export function scheduleDatabaseRecordSearchEvent(input: {
  operation: "upsert" | "delete";
  namespaceId: string;
  collectionName: string;
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "database.records",
    operation: input.operation,
    resourceId: `${input.namespaceId}:${input.collectionName}:${input.recordId}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      namespaceId: input.namespaceId,
      collection: input.collectionName,
      recordId: input.recordId,
    },
  });
}

export function scheduleSessionChatSearchEvent(input: {
  operation: "upsert" | "delete";
  sessionId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "sessions.chats",
    operation: input.operation,
    resourceId: input.sessionId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      sessionId: input.sessionId,
    },
  });
}

export function scheduleDocumentBlocksSearchEvent(input: {
  operation: "upsert" | "delete";
  namespaceId: string;
  documentId: string;
  collectionName: "documents" | "document_blocks";
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "documents.blocks",
    operation: input.operation,
    resourceId: `${input.namespaceId}:documents:${input.documentId}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      namespaceId: input.namespaceId,
      collection: input.collectionName,
      recordId: input.recordId,
      documentId: input.documentId,
    },
  });
}

export function scheduleGenerationArtifactSearchEvent(input: {
  operation: "upsert" | "delete";
  generationId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "generations.artifacts",
    operation: input.operation,
    resourceId: input.generationId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      generationId: input.generationId,
    },
  });
}

export function scheduleCodeSymbolsSearchEvent(input: {
  operation: "upsert" | "delete";
  root: string;
  filePath: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  const root = path.resolve(input.root);
  const absolutePath = path.resolve(input.filePath);
  const relativeFromRoot = path.relative(root, absolutePath);
  if (relativeFromRoot === ".." || relativeFromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeFromRoot)) {
    return { ok: false, error: `code file is outside root: ${input.filePath}` };
  }
  const relativePath = normalizeEventRelativePath(relativeFromRoot);
  return scheduleSearchIndexEvent({
    source: "code.symbols",
    operation: input.operation,
    resourceId: relativePath,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      root,
      relativePath,
      absolutePath,
    },
  });
}

export function scheduleDocsPagesSearchEvent(input: {
  operation: "upsert" | "delete";
  workspaceRoot: string;
  filePath: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const absolutePath = path.resolve(input.filePath);
  const relativeFromWorkspace = path.relative(workspaceRoot, absolutePath);
  if (relativeFromWorkspace === ".." || relativeFromWorkspace.startsWith(`..${path.sep}`) || path.isAbsolute(relativeFromWorkspace)) {
    return { ok: false, error: `docs page is outside workspace root: ${input.filePath}` };
  }
  const relativePath = normalizeEventRelativePath(relativeFromWorkspace);
  if (!isDocsPageSearchResource(relativePath)) {
    return { ok: false, error: `docs page is outside public docs scope: ${relativePath}` };
  }
  return scheduleSearchIndexEvent({
    source: "docs.pages",
    operation: input.operation,
    resourceId: relativePath,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      workspaceRoot,
      relativePath,
      absolutePath,
    },
  });
}

export function scheduleSurfaceRouteSearchEvent(input: {
  operation: "upsert" | "delete";
  routeId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "surfaces.routes",
    operation: input.operation,
    resourceId: input.routeId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      routeId: input.routeId,
    },
  });
}

export function scheduleImageDerivedSearchEvent(input: {
  operation: "upsert" | "delete";
  imageId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "images.derived",
    operation: input.operation,
    resourceId: input.imageId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      imageId: input.imageId,
    },
  });
}

export function scheduleMediaAssetSearchEvent(input: {
  operation: "upsert" | "delete";
  mediaId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "media.assets",
    operation: input.operation,
    resourceId: input.mediaId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      mediaId: input.mediaId,
    },
  });
}

export function scheduleSlidesDeckSearchEvent(input: {
  operation: "upsert" | "delete";
  deckId: string;
  workspaceRoot: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "slides.decks",
    operation: input.operation,
    resourceId: input.deckId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      deckId: input.deckId,
      workspaceRoot: path.resolve(input.workspaceRoot),
    },
  });
}

export function scheduleSheetsWorkbookSearchEvent(input: {
  operation: "upsert" | "delete";
  workbookId: string;
  workspaceRoot: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "sheets.workbooks",
    operation: input.operation,
    resourceId: input.workbookId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      workbookId: input.workbookId,
      workspaceRoot: path.resolve(input.workspaceRoot),
    },
  });
}

export function scheduleSkillsRegistrySearchEvent(input: {
  operation: "upsert" | "delete";
  slug: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "skills.registry",
    operation: input.operation,
    resourceId: input.slug,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      slug: input.slug,
    },
  });
}

export function scheduleProvidersRoutingSearchEvent(input: {
  operation: "upsert" | "delete";
  kind: "routing" | "setting";
  provider?: string;
  dataDir: string;
  feature?: string;
  capability?: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  const resourceId = input.kind === "routing"
    ? `routing:${input.feature ?? "unknown"}:${input.capability ?? "chat"}`
    : `setting:${input.provider ?? "unknown"}`;
  return scheduleSearchIndexEvent({
    source: "providers.routing",
    operation: input.operation,
    resourceId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      kind: input.kind,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.feature ? { feature: input.feature } : {}),
      ...(input.capability ? { capability: input.capability } : {}),
    },
  });
}

export function scheduleSnippetsLibrarySearchEvent(input: {
  operation: "upsert" | "delete";
  slug: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "snippets.library",
    operation: input.operation,
    resourceId: input.slug,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      slug: input.slug,
    },
  });
}

export function scheduleAgentsCatalogSearchEvent(input: {
  operation: "upsert" | "delete";
  kind: "agent" | "personality" | "skill_collection" | "connection";
  id: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "agents.catalog",
    operation: input.operation,
    resourceId: `${input.kind}:${input.id}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      kind: input.kind,
      id: input.id,
    },
  });
}

export function scheduleMarketplaceChoicesSearchEvent(input: {
  operation: "upsert" | "delete";
  id: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "marketplace.choices",
    operation: input.operation,
    resourceId: input.id,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      choiceId: input.id,
    },
  });
}

export function scheduleContentItemsSearchEvent(input: {
  operation: "upsert" | "delete";
  itemId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "content.items",
    operation: input.operation,
    resourceId: input.itemId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      itemId: input.itemId,
    },
  });
}

export function scheduleBusinessRecordsSearchEvent(input: {
  operation: "upsert" | "delete";
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "business.records",
    operation: input.operation,
    resourceId: input.recordId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      recordId: input.recordId,
    },
  });
}

export function scheduleSocialPostsSearchEvent(input: {
  operation: "upsert" | "delete";
  postId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "social.posts",
    operation: input.operation,
    resourceId: input.postId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      postId: input.postId,
    },
  });
}

export function scheduleIotConfigSearchEvent(input: {
  operation: "upsert" | "delete";
  configId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "iot.config",
    operation: input.operation,
    resourceId: input.configId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      configId: input.configId,
    },
  });
}

export function scheduleNotesPagesSearchEvent(input: {
  operation: "upsert" | "delete";
  pageId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "notes.pages",
    operation: input.operation,
    resourceId: input.pageId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      pageId: input.pageId,
    },
  });
}

export function scheduleKnowledgeGraphSearchEvent(input: {
  operation: "upsert" | "delete";
  kind: "entity" | "fact";
  id: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  const knowledgeResourceId = `${input.kind}:${input.id}`;
  return scheduleSearchIndexEvent({
    source: "knowledge.graph",
    operation: input.operation,
    resourceId: knowledgeResourceId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      kind: input.kind,
      knowledgeResourceId,
      [`${input.kind}Id`]: input.id,
    },
  });
}

export function scheduleSignalsObservationsSearchEvent(input: {
  operation: "upsert" | "delete";
  kind: "vertical" | "variable" | "observation";
  id: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  const signalsResourceId = `${input.kind}:${input.id}`;
  return scheduleSearchIndexEvent({
    source: "signals.observations",
    operation: input.operation,
    resourceId: signalsResourceId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      kind: input.kind,
      signalsResourceId,
      [`${input.kind}Id`]: input.id,
    },
  });
}

export function scheduleCalendarEventsSearchEvent(input: {
  operation: "upsert" | "delete";
  eventId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "calendar.events",
    operation: input.operation,
    resourceId: input.eventId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      eventId: input.eventId,
    },
  });
}

export function scheduleFinanceRecordsSearchEvent(input: {
  operation: "upsert" | "delete";
  namespaceId: string;
  collectionName: string;
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "finance.records",
    operation: input.operation,
    resourceId: `${input.namespaceId}:${input.collectionName}:${input.recordId}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      namespaceId: input.namespaceId,
      collection: input.collectionName,
      recordId: input.recordId,
    },
  });
}

export function scheduleFinanceRecordTableSearchEvent(input: {
  operation: "upsert" | "delete";
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "finance.records",
    operation: input.operation,
    resourceId: `finance_records:${input.recordId}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      table: "finance_records",
      recordId: input.recordId,
    },
  });
}

export function scheduleElnRecordsSearchEvent(input: {
  operation: "upsert" | "delete";
  namespaceId: string;
  collectionName: string;
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "eln.records",
    operation: input.operation,
    resourceId: `${input.namespaceId}:${input.collectionName}:${input.recordId}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      namespaceId: input.namespaceId,
      collection: input.collectionName,
      recordId: input.recordId,
    },
  });
}

export function scheduleWorkItemsSearchEvent(input: {
  operation: "upsert" | "delete";
  namespaceId: string;
  collectionName: string;
  recordId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "work.items",
    operation: input.operation,
    resourceId: `${input.namespaceId}:${input.collectionName}:${input.recordId}`,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      namespaceId: input.namespaceId,
      collection: input.collectionName,
      recordId: input.recordId,
    },
  });
}

export function scheduleConnectorCatalogSearchEvent(input: {
  operation: "upsert" | "delete";
  operationId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "connectors.catalog",
    operation: input.operation,
    resourceId: input.operationId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      operationId: input.operationId,
    },
  });
}

export function scheduleMcpServersSearchEvent(input: {
  operation: "upsert" | "delete";
  serverId: string;
  configPath: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "mcp.servers",
    operation: input.operation,
    resourceId: input.serverId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      serverId: input.serverId,
      configPath: input.configPath,
    },
  });
}

export function scheduleAppsCatalogSearchEvent(input: {
  operation: "upsert" | "delete";
  appId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "apps.catalog",
    operation: input.operation,
    resourceId: input.appId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      appId: input.appId,
    },
  });
}

export function scheduleDesignResourcesSearchEvent(input: {
  operation: "upsert" | "delete";
  resourceId: string;
  workspaceRoot?: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  return scheduleSearchIndexEvent({
    source: "design.resources",
    operation: input.operation,
    resourceId: input.resourceId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      resourceId: input.resourceId,
      ...(input.workspaceRoot ? { workspaceRoot: path.resolve(input.workspaceRoot) } : {}),
    },
  });
}

export function scheduleRuntimeEventsSearchEvent(input: {
  operation: "upsert" | "delete";
  kind: "job" | "event" | "operational";
  id: string;
  dataDir: string;
  domain?: string;
  flags?: Record<string, string>;
  observedAt?: string;
}): SearchEventScheduleResult {
  const resourceId = input.kind === "operational" ? `operational:${input.domain ?? "runtime"}:${input.id}` : `${input.kind}:${input.id}`;
  return scheduleSearchIndexEvent({
    source: "runtime.events",
    operation: input.operation,
    resourceId,
    dataDir: input.dataDir,
    flags: input.flags,
    observedAt: input.observedAt,
    payload: {
      runtimeKind: input.kind,
      runtimeResourceId: resourceId,
      id: input.id,
      ...(input.domain ? { domain: input.domain } : {}),
    },
  });
}

export function scheduleSearchIndexEvent(input: {
  source: string;
  operation: "upsert" | "delete";
  resourceId: string;
  dataDir: string;
  flags?: Record<string, string>;
  observedAt?: string;
  payload?: Record<string, unknown>;
}): SearchEventScheduleResult {
  const dbPath = resolveSearchEventDbPath(input.dataDir, input.flags ?? {});
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const store = new SearchStore(dbPath);
    try {
      const manifest = BUILTIN_SEARCH_SOURCES_BY_ID.get(input.source);
      if (manifest) store.registerSource(manifest);
      const job = store.scheduleIndexEvent({
        source: input.source,
        shard: "hot",
        operation: input.operation,
        resourceId: input.resourceId,
        observedAt: input.observedAt,
        payload: input.payload,
      });
      return { ok: true, job };
    } finally {
      store.close();
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveSearchEventDbPath(dataDir: string, flags: Record<string, string>): string {
  if (flags["search-db-path"]) return path.resolve(flags["search-db-path"]);
  if (process.env.CLAW_SEARCH_DB_PATH) return path.resolve(process.env.CLAW_SEARCH_DB_PATH);
  return path.join(resolveClawjsDataRoot({ ...process.env, CLAW_DATA_DIR: dataDir }), "search.sqlite");
}

function normalizeEventRelativePath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function isDocsPageSearchResource(relativePath: string): boolean {
  return path.posix.extname(relativePath).toLowerCase() === ".md"
    && (relativePath.startsWith("docs/") || ROOT_DOCS_PAGE_FILES.has(relativePath));
}

const ROOT_DOCS_PAGE_FILES = new Set([
  "AGENTS.md",
  "CONSTITUTION.md",
  "DISCLAIMER.md",
  "PRIVACY.md",
  "README.md",
  "REGULATED_DOMAINS.md",
  "RELEASING.md",
  "SAFETY.md",
  "SECURITY.md",
  "TERMS.md",
]);
