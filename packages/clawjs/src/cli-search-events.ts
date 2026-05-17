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
