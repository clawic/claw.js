import fs from "node:fs";
import path from "node:path";

import { SearchStore, createBuiltinSearchSourceManifests, type SearchIndexJob } from "@clawjs/search";

import { resolveClawjsDataRoot } from "./v1-data.ts";

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
