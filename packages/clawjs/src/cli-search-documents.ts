import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { clawCliCommandRegistry, type ClawCliSearchResult, type ClawRepositoryRoot } from "@clawjs/core/catalogs";
import { createLocalTextEmbedding, type SearchDocumentInput, type SearchQueryInput, type SearchQueryOutput, type SearchResult } from "@clawjs/search";
import { ELN_SEARCH_COLLECTIONS, OPERATIONAL_SEARCH_SIDECARS, WORK_SEARCH_COLLECTIONS, type BusinessRecordRow } from "./cli-search-command-constants.ts";
import { redactExternalCachePayload, redactedStructuredText } from "./cli-search-web-external-source.ts";
import { type JsonRecord } from "./v1-data-core.ts";

export function boundedNumberFlag(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}
export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export function firstMeaningfulLine(content: string): string | undefined {
  return content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)?.slice(0, 180);
}
export function stableSearchId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
export function hasTable(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(table) as { name: string } | undefined;
  return !!row;
}
export function sessionSearchDocument(session: ConversationSessionRow, messages: ConversationMessageRow[]): SearchDocumentInput {
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
export function databaseRecordSearchDocument(row: DatabaseRecordRow): SearchDocumentInput | null {
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
export function workItemSearchDocument(row: DatabaseRecordRow): SearchDocumentInput | null {
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
export function workItemResultType(collectionName: string): string {
  if (collectionName === "people") return "person";
  if (collectionName === "inbox_threads") return "inbox_thread";
  if (collectionName === "inbox_messages") return "inbox_message";
  if (collectionName === "work_sessions") return "work_session";
  if (collectionName.endsWith("s")) return collectionName.slice(0, -1);
  return "work_item";
}
export function workItemShard(payload: Record<string, unknown>): "hot" | "cold" {
  const status = String(payload.status ?? payload.state ?? "").toLowerCase();
  if (payload.completedAt || payload.completed_at || payload.cancelledAt || payload.cancelled_at) return "cold";
  if (["done", "completed", "cancelled", "archived", "closed"].includes(status)) return "cold";
  return "hot";
}
export const FINANCE_SEARCH_LEGAL_OUTPUT_LABELS = [
  "not_professional_advice",
  "human_review_required",
  "sources_and_gaps_required",
  "regulated_domain:finance",
  "decision_effect:summary",
];
export const ELN_SEARCH_LEGAL_OUTPUT_LABELS = [
  "not_professional_advice",
  "human_review_required",
  "sources_and_gaps_required",
  "regulated_domain:labs_research",
  "decision_effect:summary",
];
export function elnRecordSearchDocument(row: DatabaseRecordRow): SearchDocumentInput | null {
  if (!ELN_SEARCH_COLLECTIONS.includes(row.collection_name as typeof ELN_SEARCH_COLLECTIONS[number])) return null;
  const payload = parseJsonRecord(row.data_json);
  if (payload.archivedAt || payload.archived_at || payload.deletedAt || payload.deleted_at) return null;
  const sensitive = isSensitiveRecord(payload);
  const safePayload = redactExternalCachePayload(payload);
  const title = titleForDatabaseRecord(row, payload);
  const fields = searchableRecordFields(safePayload);
  const body = [title, ...fields.map(([key, value]) => `${key}: ${stringifySearchValue(value)}`)].join("\n");
  const snippet = sensitive ? "[redacted]" : firstTextValue(payload) ?? title;
  const type = elnRecordResultType(row.collection_name);
  return {
    id: `eln.records:${row.namespace_id}:${row.collection_name}:${row.id}`,
    source: "eln.records",
    shard: elnRecordShard(payload),
    domain: "eln",
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
      notebookId: stringMetadata(payload.notebookId),
      studyId: stringMetadata(payload.studyId),
      experimentId: stringMetadata(payload.biologyExperimentId),
      sampleId: stringMetadata(payload.sampleId),
      assayId: stringMetadata(payload.assayId),
      sensitive,
      legalOutputLabels: ELN_SEARCH_LEGAL_OUTPUT_LABELS,
    },
    permissions: { canOpen: true, canPreview: !sensitive, redacted: sensitive },
    rankingHints: {
      fastPath: 1,
      eln: 1,
      ...(elnRecordShard(payload) === "hot" ? { hot: 1 } : {}),
    },
    fragments: sensitive ? [] : fields.slice(0, 16).map(([key, value], index) => ({
      id: `eln.records:${row.namespace_id}:${row.collection_name}:${row.id}:field:${key}`,
      title: key,
      body: stringifySearchValue(value),
      snippet: stringifySearchValue(value).slice(0, 180),
      sortOrder: index,
      metadata: { field: key },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open ELN record", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy ELN reference", requiresApproval: false },
    ],
  };
}
export function elnRecordResultType(collectionName: string): string {
  if (collectionName === "lab_notebooks") return "lab_notebook";
  if (collectionName === "notebook_entries") return "notebook_entry";
  if (collectionName === "protocol_runs") return "protocol_run";
  if (collectionName === "experiment_observations") return "experiment_observation";
  return "eln_record";
}
export function elnRecordShard(payload: Record<string, unknown>): "hot" | "cold" {
  const status = String(payload.status ?? payload.state ?? "").toLowerCase();
  if (payload.archivedAt || payload.archived_at || payload.closedAt || payload.closed_at) return "cold";
  if (["archived", "closed", "void", "voided", "superseded"].includes(status)) return "cold";
  return "hot";
}
export function stringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export function documentBlocksSearchDocument(row: DatabaseRecordRow, blockRows: DatabaseRecordRow[]): SearchDocumentInput | null {
  const payload = parseJsonRecord(row.data_json);
  if (payload.archivedAt || payload.archived_at || payload.deletedAt || payload.deleted_at) return null;
  const sensitive = isSensitiveRecord(payload) || String(payload.accessLevel ?? "").toUpperCase() === "PRIVATE";
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : `Document ${row.id}`;
  const contentDataText = payload.contentData == null
    ? undefined
    : isPlainRecord(payload.contentData)
      ? redactedStructuredText(payload.contentData)
      : redactedStructuredText({ contentData: payload.contentData });
  const content = [
    typeof payload.content === "string" ? payload.content : undefined,
    contentDataText,
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
    fragments: sensitive ? [] : [
      ...(contentDataText ? [{
        id: `documents.blocks:${row.namespace_id}:${row.id}:content-data`,
        title: "content data",
        body: contentDataText,
        snippet: contentDataText.slice(0, 180),
        sortOrder: -1,
        metadata: { redactedValues: true },
      }] : []),
      ...blocks.slice(0, 50).map((block, index) => {
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
    ],
    actions: [
      { id: "open", kind: "open", label: "Open document", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy document reference", requiresApproval: false },
    ],
  };
}
export function notesPageSearchDocument(row: NotesPageRow, blockRows: NotesPageBlockRow[]): SearchDocumentInput | null {
  if (row.archived_at) return null;
  const tags = parseJsonArray(row.tags_json).filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  const properties = parseJsonRecord(row.properties_json);
  const sensitive = ["sensitive", "secret", "restricted"].includes(row.sensitivity.toLowerCase());
  const blocks = blockRows
    .filter((block) => block.page_id === row.id)
    .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at));
  const blockTexts = blocks.map((block) => block.text || textFromStructuredContent(parseJsonRecord(block.content_json))).filter(Boolean);
  const propertiesText = redactedStructuredText(properties);
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
    fragments: sensitive ? [] : [
      ...(propertiesText ? [{
        id: `notes.pages:${row.id}:properties`,
        title: "properties",
        body: propertiesText,
        snippet: propertiesText.slice(0, 180),
        sortOrder: -1,
        metadata: { redactedValues: true },
      }] : []),
      ...blocks.slice(0, 50).map((block) => {
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
    ],
    actions: [
      { id: "open", kind: "open", label: "Open note", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy note reference", requiresApproval: false },
    ],
  };
}
export function knowledgeEntitySearchDocument(row: KnowledgeEntityRow): SearchDocumentInput {
  const properties = parseJsonRecord(row.properties_json);
  const provenance = parseJsonRecord(row.provenance_json);
  const sensitive = isSensitiveKnowledge(row.sensitivity);
  const propertiesText = redactedStructuredText(properties);
  const provenanceText = redactedStructuredText(provenance);
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
        metadata: { redactedValues: true },
      }] : []),
      ...(provenanceText ? [{
        id: `knowledge.graph:entity:${row.id}:provenance`,
        title: "provenance",
        body: provenanceText,
        snippet: provenanceText.slice(0, 180),
        sortOrder: 2,
        metadata: { redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open entity", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy entity reference", requiresApproval: false },
    ],
  };
}
export function knowledgeFactSearchDocument(row: KnowledgeFactRow): SearchDocumentInput {
  const scope = parseJsonRecord(row.scope_json);
  const provenance = parseJsonRecord(row.provenance_json);
  const objectValue = parseJsonValue(row.object_value_json);
  const objectText = stringifySearchValue(objectValue);
  const scopeText = redactedStructuredText(scope);
  const provenanceText = redactedStructuredText(provenance);
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
        metadata: { redactedValues: true },
      }] : []),
      ...(provenanceText ? [{
        id: `knowledge.graph:fact:${row.id}:provenance`,
        title: "provenance",
        body: provenanceText,
        snippet: provenanceText.slice(0, 180),
        sortOrder: 2,
        metadata: { redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open fact", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy fact reference", requiresApproval: false },
    ],
  };
}
export function signalVerticalSearchDocument(row: SignalsVerticalRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
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
    fragments: sensitive ? [] : [
      ...(row.description ? [{
        id: `signals.observations:vertical:${row.id}:description`,
        title: "description",
        body: row.description,
        snippet: row.description.slice(0, 180),
        sortOrder: 0,
      }] : []),
      ...(metadataText ? [{
        id: `signals.observations:vertical:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open signal vertical", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy signal reference", requiresApproval: false },
    ],
  };
}
export function signalVariableSearchDocument(row: SignalsVariableRow, vertical?: SignalsVerticalRow): SearchDocumentInput {
  const definition = parseJsonRecord(row.definition_json);
  const unit = parseJsonValue(row.unit_json);
  const unitText = signalUnitLabel(unit);
  const definitionText = redactedStructuredText(definition);
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
      metadata: { redactedValues: true },
    }],
    actions: [
      { id: "open", kind: "open", label: "Open signal variable", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy signal reference", requiresApproval: false },
    ],
  };
}
export function signalObservationSearchDocument(row: SignalsObservationRow, vertical?: SignalsVerticalRow, variable?: SignalsVariableRow): SearchDocumentInput {
  const value = parseJsonValue(row.value_json);
  const source = parseJsonRecord(row.source_json);
  const valueText = stringifySearchValue(value);
  const sourceText = redactedStructuredText(source);
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
        metadata: { redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open signal observation", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy signal reference", requiresApproval: false },
    ],
  };
}
export function calendarEventSearchDocument(row: CalendarEventRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
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
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open calendar event", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy event reference", requiresApproval: false },
    ],
  };
}
export function temporalCalendarEventSearchDocument(row: TemporalCalendarEventRow): SearchDocumentInput {
  const payload = parseJsonRecord(row.payload);
  const description = stringValue(payload.description);
  const location = stringValue(payload.location);
  const timezone = stringValue(payload.timezone);
  const endsAt = stringValue(payload.endsAt);
  const startsAt = row.starts_at || stringValue(payload.startsAt);
  const metadataText = textFromStructuredContent({
    description,
    location,
    timezone,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    agentId: row.agent_id,
  });
  const body = [row.title, description, location, startsAt, endsAt, timezone, row.workspace_id, row.project_id, row.agent_id, row.source_provider].filter(Boolean).join("\n");
  return {
    id: `calendar.events:${row.id}`,
    source: "calendar.events",
    domain: "calendar",
    type: "event",
    resourceId: row.id,
    title: row.title || row.id,
    subtitle: [startsAt, row.workspace_id].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(description ?? metadataText ?? "") ?? startsAt,
    body,
    updatedAt: row.updated_at,
    metadata: {
      eventId: row.id,
      startsAt,
      endsAt,
      status: row.status,
      source: row.source_provider || "clawjs-time",
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      agentId: row.agent_id,
      location,
      timezone,
      hasPage: false,
      metadataKeys: Object.keys(payload).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      calendar: 1,
      upcoming: startsAt && Date.parse(startsAt) >= Date.now() ? 0.2 : 0,
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
export function financeRecordSearchDocument(row: DatabaseRecordRow): SearchDocumentInput {
  const payload = parseJsonRecord(row.data_json);
  const metadata = isPlainRecord(payload.metadata) ? payload.metadata : {};
  const metadataText = redactedStructuredText(metadata);
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
      legalOutputLabels: FINANCE_SEARCH_LEGAL_OUTPUT_LABELS,
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
export function financeRecordTableSearchDocument(row: FinanceRecordTableRow, pageBody?: string): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.kind,
    row.account_id,
    row.currency,
    row.occurred_at,
    row.merchant,
    row.category,
    row.amount,
    pageBody,
    metadataText,
  ].filter((value) => value !== null && value !== undefined && String(value).trim()).join("\n");
  return {
    id: `finance.records:finance_records:${row.id}`,
    source: "finance.records",
    domain: "finance",
    type: row.kind || "finance_record",
    resourceId: `finance_records:${row.id}`,
    title: `${row.kind || "finance"} ${row.id}`,
    subtitle: [row.currency, row.occurred_at].filter(Boolean).join(" / "),
    snippet: "[redacted]",
    body,
    updatedAt: row.updated_at,
    metadata: {
      recordId: row.id,
      table: "finance_records",
      kind: row.kind,
      accountId: row.account_id ?? null,
      currency: row.currency,
      category: row.category ?? null,
      occurredAt: row.occurred_at,
      sensitive: true,
      legalOutputLabels: FINANCE_SEARCH_LEGAL_OUTPUT_LABELS,
      metadataKeys: Object.keys(metadata).sort(),
      hasLinkedPage: !!row.page_id,
    },
    permissions: { canOpen: true, canPreview: false, redacted: true },
    rankingHints: {
      fastPath: 1,
      finance: 1,
      transaction: row.kind === "transaction" ? 0.2 : 0,
    },
    fragments: [],
    actions: [
      { id: "open", kind: "open", label: "Open finance record", requiresApproval: true, risk: "read", grant: "search.finance.open" },
      { id: "copy-reference", kind: "copy", label: "Copy finance reference", requiresApproval: false },
    ],
  };
}
export function runtimeJobSearchDocument(row: RuntimeJobRow): SearchDocumentInput {
  const payload = parseJsonRecord(row.payload_json);
  const payloadText = redactedStructuredText(payload);
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
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open runtime job", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy runtime job reference", requiresApproval: false },
    ],
  };
}
export function runtimeEventSearchDocument(row: RuntimeEventRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
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
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open runtime event", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy runtime event reference", requiresApproval: false },
    ],
  };
}
export function operationalEventSearchDocument(row: OperationalEventRow, sidecar: typeof OPERATIONAL_SEARCH_SIDECARS[number]): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
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
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open operational event", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy operational event reference", requiresApproval: false },
    ],
  };
}
export function skillRegistrySearchDocument(row: SkillRegistryRow): SearchDocumentInput | null {
  if (!row.slug) return null;
  const scope = parseJsonRecord(row.scope_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const secretRefs = parseJsonArray(row.secret_refs_json);
  const metadataText = redactedStructuredText(metadata);
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
    fragments: [
      ...(row.body ? [{
        id: `skills.registry:${row.slug}:body`,
        title: "body",
        body: row.body,
        snippet: row.body.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "body" },
      }] : []),
      ...(metadataText ? [{
        id: `skills.registry:${row.slug}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata", redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open skill", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy skill reference", requiresApproval: false },
    ],
  };
}
export function providerRoutingSearchDocument(row: ProviderRoutingRow): SearchDocumentInput {
  const policy = parseJsonRecord(row.policy_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const policyText = redactedStructuredText(policy);
  const metadataText = redactedStructuredText(metadata);
  const resourceId = `routing:${row.feature}:${row.capability}`;
  const body = [
    row.feature,
    row.capability,
    row.provider,
    row.model,
    policyText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `providers.routing:${resourceId}`,
    source: "providers.routing",
    domain: "providers",
    type: "routing_rule",
    resourceId,
    title: `${row.feature} ${row.capability}`,
    subtitle: [row.provider, row.model].filter(Boolean).join(" / "),
    snippet: [row.provider, row.model].filter(Boolean).join(" / ") || row.capability,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "routing",
      routeId: row.id,
      feature: row.feature,
      capability: row.capability,
      provider: row.provider,
      model: row.model ?? null,
      hasAccountRef: !!row.account_ref,
      policyKey: Object.keys(policy).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      providerRouting: 1,
      hasAccountRef: row.account_ref ? 0.1 : 0,
    },
    fragments: [
      ...(policyText ? [{
        id: `providers.routing:${resourceId}:policy`,
        title: "policy",
        body: policyText,
        snippet: policyText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "policy" },
      }] : []),
      ...(metadataText ? [{
        id: `providers.routing:${resourceId}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open provider route", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy provider route reference", requiresApproval: false },
    ],
  };
}
export function providerSettingSearchDocument(row: ProviderSettingRow): SearchDocumentInput {
  const policy = parseJsonRecord(row.policy_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const policyText = redactedStructuredText(policy);
  const metadataText = redactedStructuredText(metadata);
  const resourceId = `setting:${row.provider}`;
  const body = [
    row.provider,
    row.enabled === 1 ? "enabled" : "disabled",
    policyText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `providers.routing:${resourceId}`,
    source: "providers.routing",
    domain: "providers",
    type: "provider_setting",
    resourceId,
    title: row.provider,
    subtitle: row.enabled === 1 ? "enabled" : "disabled",
    snippet: firstMeaningfulLine(policyText || metadataText || "") ?? (row.enabled === 1 ? "enabled" : "disabled"),
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "setting",
      settingId: row.id,
      provider: row.provider,
      enabled: row.enabled === 1,
      policyKey: Object.keys(policy).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      providerSetting: 1,
      enabled: row.enabled === 1 ? 0.2 : -0.1,
    },
    fragments: [
      ...(policyText ? [{
        id: `providers.routing:${resourceId}:policy`,
        title: "policy",
        body: policyText,
        snippet: policyText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "policy" },
      }] : []),
      ...(metadataText ? [{
        id: `providers.routing:${resourceId}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open provider setting", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy provider setting reference", requiresApproval: false },
    ],
  };
}
export function snippetLibrarySearchDocument(row: SnippetLibraryRow): SearchDocumentInput {
  const scope = parseJsonRecord(row.scope_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const skillRefs = parseJsonArray(row.skill_refs_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const metadataText = redactedStructuredText(metadata);
  const scopeText = redactedStructuredText(scope);
  const scopeKind = typeof scope.kind === "string" ? scope.kind : undefined;
  const body = [
    row.title,
    row.slug,
    row.kind,
    row.shortcut,
    row.body,
    skillRefs.join(" "),
    scopeText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `snippets.library:${row.slug}`,
    source: "snippets.library",
    domain: "snippets",
    type: row.kind || "snippet",
    resourceId: row.slug,
    title: row.title || row.slug,
    subtitle: [row.kind, row.shortcut, scopeKind].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.body) ?? row.shortcut ?? row.slug,
    body,
    updatedAt: row.updated_at,
    metadata: {
      snippetId: row.id,
      slug: row.slug,
      kind: row.kind,
      shortcut: row.shortcut ?? null,
      scopeKind: scopeKind ?? null,
      skillRef: skillRefs,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      snippet: 1,
      shortcut: row.shortcut ? 0.3 : 0,
    },
    fragments: [
      ...(row.body ? [{
        id: `snippets.library:${row.slug}:body`,
        title: "body",
        body: row.body,
        snippet: row.body.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "body" },
      }] : []),
      ...(scopeText ? [{
        id: `snippets.library:${row.slug}:scope`,
        title: "scope",
        body: scopeText,
        snippet: scopeText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "scope" },
      }] : []),
      ...(metadataText ? [{
        id: `snippets.library:${row.slug}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 2,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open snippet", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy snippet reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogAgentSearchDocument(row: AgentCatalogAgentRow): SearchDocumentInput {
  const config = parseJsonRecord(row.config_json);
  const configText = redactedStructuredText(config);
  const configSnippet = firstMeaningfulLine(stringValue(config.instructionsFreeText) ?? configText ?? "");
  const body = [
    row.name,
    row.kind,
    row.status,
    row.agency_mode,
    row.role,
    row.title,
    row.description,
    row.owner_kind,
    row.owner_id,
    row.workspace_id,
    row.project_id,
    row.runtime,
    row.model,
    row.autonomy_profile,
    row.export_path,
    configText,
  ].filter(Boolean).join("\n");
  const resourceId = `agent:${row.id}`;
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "agent",
    resourceId,
    title: row.name || row.id,
    subtitle: [row.role, row.runtime, row.model].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.description || row.title || row.role) ?? row.id,
    body,
    ...(row.export_path ? { path: row.export_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      kind: "agent",
      agentId: row.id,
      status: row.status,
      agencyMode: row.agency_mode,
      role: row.role,
      runtime: row.runtime ?? null,
      model: row.model ?? null,
      autonomyProfile: row.autonomy_profile,
      builtin: row.builtin === 1,
      hasProtectedRef: !!row.secret_ref,
      configKey: Object.keys(config).sort(),
      exportPath: row.export_path ?? null,
      retired: !!row.retired_at,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      agent: 1,
      active: row.status === "active" ? 0.2 : 0,
      builtin: row.builtin === 1 ? 0.1 : 0,
    },
    fragments: [
      ...(row.description ? [{
        id: `agents.catalog:${resourceId}:description`,
        title: "description",
        body: row.description,
        snippet: row.description.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "description" },
      }] : []),
      ...(configText ? [{
        id: `agents.catalog:${resourceId}:configuration`,
        title: "configuration",
        body: configText,
        snippet: configSnippet ?? configText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "configuration" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open agent", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy agent reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogPersonalitySearchDocument(row: AgentCatalogPersonalityRow): SearchDocumentInput {
  const resourceId = `personality:${row.id}`;
  const body = [row.name, row.description, row.prompt, `version ${row.version}`].filter(Boolean).join("\n");
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "personality",
    resourceId,
    title: row.name || row.id,
    subtitle: `personality / v${row.version}`,
    snippet: firstMeaningfulLine(row.description || row.prompt) ?? row.id,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "personality",
      personalityId: row.id,
      version: row.version,
      hasProtectedRef: false,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      personality: 1,
    },
    fragments: row.prompt ? [{
      id: `agents.catalog:${resourceId}:prompt`,
      title: "prompt",
      body: row.prompt,
      snippet: row.prompt.slice(0, 180),
      sortOrder: 0,
      metadata: { kind: "prompt" },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open personality", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy personality reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogSkillCollectionSearchDocument(row: AgentCatalogSkillCollectionRow): SearchDocumentInput {
  const skills = parseJsonArray(row.skills_json).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const metadata = parseJsonRecord(row.metadata_json);
  const includedTags = Array.isArray(metadata.includedTags)
    ? metadata.includedTags.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const resourceId = `skill_collection:${row.id}`;
  const body = [row.name, row.description, skills.join(" "), includedTags.join(" "), row.export_path].filter(Boolean).join("\n");
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "skill_collection",
    resourceId,
    title: row.name || row.id,
    subtitle: includedTags.length ? `tags: ${includedTags.join(", ")}` : "skill collection",
    snippet: firstMeaningfulLine(row.description ?? "") ?? (includedTags.join(", ") || row.id),
    body,
    ...(row.export_path ? { path: row.export_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      kind: "skill_collection",
      collectionId: row.id,
      skillCount: skills.length,
      includedTags,
      metadataKey: Object.keys(metadata).sort(),
      hasProtectedRef: false,
      exportPath: row.export_path ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      skillCollection: 1,
    },
    actions: [
      { id: "open", kind: "open", label: "Open skill collection", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy skill collection reference", requiresApproval: false },
    ],
  };
}
export function agentCatalogConnectionSearchDocument(row: AgentCatalogConnectionRow): SearchDocumentInput {
  const config = parseJsonRecord(row.config_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const configText = redactedStructuredText(config);
  const metadataText = redactedStructuredText(metadata);
  const resourceId = `connection:${row.id}`;
  const body = [
    row.label,
    row.provider,
    scopes.join(" "),
    typeof metadata.lastSyncAt === "string" ? metadata.lastSyncAt : undefined,
    configText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `agents.catalog:${resourceId}`,
    source: "agents.catalog",
    domain: "agents",
    type: "connection",
    resourceId,
    title: row.label || row.id,
    subtitle: row.provider,
    snippet: scopes.length ? scopes.join(", ") : row.provider,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: "connection",
      connectionId: row.id,
      provider: row.provider,
      scopes,
      hasProtectedRef: !!row.secret_ref,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      connection: 1,
      hasProtectedRef: row.secret_ref ? 0.1 : 0,
    },
    fragments: [
      ...(scopes.length ? [{
        id: `agents.catalog:${resourceId}:scopes`,
        title: "scopes",
        body: scopes.join("\n"),
        snippet: scopes.join(", "),
        sortOrder: 0,
        metadata: { kind: "scopes" },
      }] : []),
      ...(configText ? [{
        id: `agents.catalog:${resourceId}:configuration`,
        title: "configuration",
        body: configText,
        snippet: configText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "configuration" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open connection", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy connection reference", requiresApproval: false },
    ],
  };
}
export function marketplaceChoiceSearchDocument(row: MarketplaceChoiceRow): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.kind,
    row.target,
    row.choice,
    row.status,
    row.rationale,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `marketplace.choices:${row.id}`,
    source: "marketplace.choices",
    domain: "marketplace",
    type: row.kind || "choice",
    resourceId: row.id,
    title: `${row.target}: ${row.choice}`,
    subtitle: [row.kind, row.status].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.rationale || metadataText || "") ?? row.choice,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      target: row.target,
      choice: row.choice,
      status: row.status,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      marketplaceChoice: 1,
      active: row.status === "active" ? 0.2 : 0,
    },
    fragments: [
      ...(row.rationale ? [{
        id: `marketplace.choices:${row.id}:rationale`,
        title: "rationale",
        body: row.rationale,
        snippet: row.rationale.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "rationale" },
      }] : []),
      ...(metadataText ? [{
        id: `marketplace.choices:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open marketplace choice", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy marketplace choice reference", requiresApproval: false },
    ],
  };
}
export function contentItemSearchDocument(row: ContentItemRow, pageBody?: string): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.title,
    row.kind,
    row.status,
    row.brand_id,
    row.campaign_id,
    pageBody,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `content.items:${row.id}`,
    source: "content.items",
    domain: "content",
    type: row.kind || "entry",
    resourceId: row.id,
    title: row.title || row.id,
    subtitle: [row.kind, row.status, row.brand_id, row.campaign_id].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(pageBody || metadataText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      brandId: row.brand_id ?? null,
      campaignId: row.campaign_id ?? null,
      pageId: row.page_id ?? null,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      content: 1,
      published: row.status === "published" ? 0.2 : 0,
    },
    fragments: [
      ...(pageBody ? [{
        id: `content.items:${row.id}:page`,
        title: "page",
        body: pageBody,
        snippet: pageBody.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "page", pageId: row.page_id },
      }] : []),
      ...(metadataText ? [{
        id: `content.items:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open content item", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy content reference", requiresApproval: false },
    ],
  };
}
export function businessRecordSearchDocument(row: BusinessRecordRow, pageBody?: string): SearchDocumentInput {
  const metadata = parseJsonRecord(row.metadata_json);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.name,
    row.kind,
    row.status,
    pageBody,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `business.records:${row.id}`,
    source: "business.records",
    domain: "business",
    type: row.kind || "record",
    resourceId: row.id,
    title: row.name || row.id,
    subtitle: [row.kind, row.status].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(pageBody || metadataText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      pageId: row.page_id ?? null,
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      businessRecord: 1,
      active: row.status === "active" ? 0.2 : 0,
    },
    fragments: [
      ...(pageBody ? [{
        id: `business.records:${row.id}:page`,
        title: "page",
        body: pageBody,
        snippet: pageBody.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "page", pageId: row.page_id },
      }] : []),
      ...(metadataText ? [{
        id: `business.records:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open business record", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy business reference", requiresApproval: false },
    ],
  };
}
export function socialPostSearchDocument(row: SocialPostRow, pageBody?: string): SearchDocumentInput {
  const channel = parseJsonRecord(row.channel_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const channelText = redactedStructuredText(channel);
  const metadataText = redactedStructuredText(metadata);
  const channelName = stringValue(channel.name) ?? stringValue(channel.id) ?? stringValue(channel.kind) ?? stringValue(channel.provider);
  const body = [
    row.title,
    row.status,
    channelName,
    channelText,
    row.scheduled_at,
    row.published_at,
    pageBody,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `social.posts:${row.id}`,
    source: "social.posts",
    domain: "social",
    type: row.published_at ? "publication" : row.status || "post",
    resourceId: row.id,
    title: row.title || row.id,
    subtitle: [row.status, channelName, row.scheduled_at].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(pageBody || metadataText || channelText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      status: row.status,
      channel: channelName ?? null,
      scheduled: !!row.scheduled_at,
      published: !!row.published_at,
      scheduledAt: row.scheduled_at ?? null,
      publishedAt: row.published_at ?? null,
      pageId: row.page_id ?? null,
      channelKey: Object.keys(channel).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      socialPost: 1,
      scheduled: row.scheduled_at ? 0.1 : 0,
      published: row.published_at ? 0.2 : 0,
    },
    fragments: [
      ...(pageBody ? [{
        id: `social.posts:${row.id}:page`,
        title: "page",
        body: pageBody,
        snippet: pageBody.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "page", pageId: row.page_id },
      }] : []),
      ...(channelText ? [{
        id: `social.posts:${row.id}:channel`,
        title: "channel",
        body: channelText,
        snippet: channelText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "channel" },
      }] : []),
      ...(metadataText ? [{
        id: `social.posts:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 2,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open social post", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy social post reference", requiresApproval: false },
    ],
  };
}
export function iotConfigSearchDocument(row: IotConfigRow): SearchDocumentInput {
  const config = parseJsonRecord(row.config_json);
  const metadata = parseJsonRecord(row.metadata_json);
  const configText = redactedStructuredText(config);
  const metadataText = redactedStructuredText(metadata);
  const body = [
    row.name,
    row.kind,
    row.status,
    row.parent_id,
    configText,
    metadataText,
  ].filter(Boolean).join("\n");
  return {
    id: `iot.config:${row.id}`,
    source: "iot.config",
    domain: "iot",
    type: row.kind || "config",
    resourceId: row.id,
    title: row.name || row.id,
    subtitle: [row.kind, row.status, row.enabled === 1 ? "enabled" : "disabled"].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(metadataText || configText || "") ?? row.status,
    body,
    updatedAt: row.updated_at,
    metadata: {
      kind: row.kind,
      status: row.status,
      parentId: row.parent_id ?? null,
      enabled: row.enabled === 1,
      hasProtectedRef: !!row.secret_ref,
      configKey: Object.keys(config).sort(),
      metadataKey: Object.keys(metadata).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      iotConfig: 1,
      enabled: row.enabled === 1 ? 0.2 : -0.1,
      hasProtectedRef: row.secret_ref ? 0.1 : 0,
    },
    fragments: [
      ...(configText ? [{
        id: `iot.config:${row.id}:config`,
        title: "config",
        body: configText,
        snippet: configText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "config" },
      }] : []),
      ...(metadataText ? [{
        id: `iot.config:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "metadata" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open IoT config", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy IoT config reference", requiresApproval: false },
    ],
  };
}
export function connectorCatalogSearchDocument(row: ConnectorOperationRow, capabilitiesById: Map<string, ConnectorCapabilityRow>): SearchDocumentInput | null {
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
  const metadataText = redactedStructuredText(metadata);
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
    metadataText,
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
    fragments: [
      ...(metadataText ? [{
        id: `connectors.catalog:${row.id}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: -1,
        metadata: { kind: "metadata", redactedValues: true },
      }] : []),
      ...capabilities.slice(0, 20).map((capability, index) => ({
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
    ],
    actions: [
      { id: "open", kind: "open", label: "Open connector operation", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy connector reference", requiresApproval: false },
      { id: "execute", kind: "custom", label: "Plan connector operation", requiresApproval, risk: costRisk === "none" || costRisk === "free" ? "system" : "cost", grant: "search.connectors.execute" },
    ],
  };
}
export function mcpServerSearchDocument(server: JsonRecord & { id: string }, configPath: string, updatedAt: string): SearchDocumentInput {
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
export function appCatalogSearchDocument(row: AppCatalogRow): SearchDocumentInput {
  const manifest = parseJsonRecord(row.manifest_json);
  const permissions = parseJsonRecord(row.permissions_json);
  const manifestText = redactedStructuredText(manifest);
  const permissionsText = redactedStructuredText(permissions);
  const permissionsKeys = Object.keys(permissions).sort();
  const body = [
    row.name,
    row.slug,
    row.description,
    row.root_path ? path.basename(row.root_path) : undefined,
    manifestText,
    permissionsText,
    permissionsKeys.join(" "),
  ].filter(Boolean).join("\n");
  return {
    id: `apps.catalog:${row.id}`,
    source: "apps.catalog",
    domain: "apps",
    type: "app",
    resourceId: row.id,
    title: row.name || row.slug || row.id,
    subtitle: [row.slug, row.pinned === 1 ? "pinned" : ""].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(row.description || manifestText || "") ?? row.slug,
    body,
    ...(row.root_path ? { path: row.root_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      appId: row.id,
      slug: row.slug,
      pinned: row.pinned === 1,
      rootBasename: row.root_path ? path.basename(row.root_path) : null,
      lastOpenedAt: row.last_opened_at,
      createdByChatId: row.created_by_chat_id,
      manifestKeys: Object.keys(manifest).sort(),
      permissionKey: permissionsKeys,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      app: 1,
      pinned: row.pinned === 1 ? 0.4 : 0,
    },
    fragments: [
      ...(manifestText ? [{
        id: `apps.catalog:${row.id}:manifest`,
        title: "manifest",
        body: manifestText,
        snippet: manifestText.slice(0, 180),
        sortOrder: 0,
        metadata: { redactedValues: true },
      }] : []),
      ...(permissionsText ? [{
        id: `apps.catalog:${row.id}:permissions`,
        title: "permissions",
        body: permissionsText,
        snippet: permissionsText.slice(0, 180),
        sortOrder: 1,
        metadata: { redactedValues: true },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open app", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy app reference", requiresApproval: false },
    ],
  };
}
export function designResourceSearchDocument(row: DesignResourceRow): SearchDocumentInput {
  const manifest = parseJsonRecord(row.manifest_json);
  const manifestText = redactedStructuredText(manifest);
  const body = [
    row.name,
    row.kind,
    row.id,
    row.root_path ? path.basename(row.root_path) : undefined,
    manifestText,
  ].filter(Boolean).join("\n");
  return {
    id: `design.resources:${row.id}`,
    source: "design.resources",
    domain: "design",
    type: row.kind || "resource",
    resourceId: row.id,
    title: row.name || row.id,
    subtitle: [row.kind, row.builtin === 1 ? "built-in" : ""].filter(Boolean).join(" / "),
    snippet: firstMeaningfulLine(manifestText || "") ?? row.kind,
    body,
    ...(row.root_path ? { path: row.root_path } : {}),
    updatedAt: row.updated_at,
    metadata: {
      resourceId: row.id,
      kind: row.kind,
      builtin: row.builtin === 1,
      rootBasename: row.root_path ? path.basename(row.root_path) : null,
      manifestKeys: Object.keys(manifest).sort(),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      design: 1,
      builtin: row.builtin === 1 ? 0.2 : 0,
    },
    fragments: manifestText ? [{
      id: `design.resources:${row.id}:manifest`,
      title: "manifest",
      body: manifestText,
      snippet: manifestText.slice(0, 180),
      sortOrder: 0,
      metadata: { redactedValues: true },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open design resource", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy design reference", requiresApproval: false },
    ],
  };
}
export function connectorCapabilitiesById(db: Database.Database): Map<string, ConnectorCapabilityRow> {
  if (!hasTable(db, "connector_capabilities")) return new Map();
  const rows = db.prepare(`
    SELECT id, domain, action, facet, summary
    FROM connector_capabilities
  `).all() as ConnectorCapabilityRow[];
  return new Map(rows.map((row) => [row.id, row]));
}
export interface DatabaseRecordRow {
  namespace_id: string;
  collection_name: string;
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}
export interface FinanceRecordTableRow {
  id: string;
  kind: string;
  account_id: string | null;
  amount: number | null;
  currency: string | null;
  occurred_at: string | null;
  merchant: string | null;
  category: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface NotesPageRow {
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
export interface NotesPageBlockRow {
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
export interface KnowledgeEntityRow {
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
export interface KnowledgeFactRow {
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
export interface SignalsVerticalRow {
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
export interface SignalsVariableRow {
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
export interface SignalsObservationRow {
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
export interface CalendarEventRow {
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
export interface TemporalCalendarEventRow {
  id: string;
  title: string;
  status: string;
  workspace_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  source_provider: string | null;
  starts_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  payload: string;
}
export interface RuntimeJobRow {
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
export interface RuntimeEventRow {
  id: string;
  job_id: string | null;
  kind: string;
  level: string;
  message: string;
  created_at: string;
  metadata_json: string;
}
export interface OperationalEventRow {
  id: string;
  kind: string;
  level: string;
  message: string;
  created_at: string;
  metadata_json: string;
}
export interface AppCatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  root_path: string | null;
  manifest_json: string;
  permissions_json: string;
  pinned: number;
  last_opened_at: string | null;
  created_by_chat_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface DesignResourceRow {
  id: string;
  kind: string;
  name: string;
  root_path: string | null;
  manifest_json: string;
  builtin: number;
  created_at: string;
  updated_at: string;
}
export interface SkillRegistryRow {
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
export interface ProviderRoutingRow {
  id: string;
  feature: string;
  capability: string;
  provider: string;
  model: string | null;
  account_ref: string | null;
  policy_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ProviderSettingRow {
  id: string;
  provider: string;
  enabled: number;
  policy_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface SnippetLibraryRow {
  id: string;
  slug: string;
  kind: string;
  title: string;
  body: string;
  shortcut: string | null;
  scope_json: string;
  skill_refs_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogAgentRow {
  id: string;
  kind: string;
  name: string;
  status: string;
  agency_mode: string;
  role: string;
  title: string | null;
  description: string | null;
  owner_kind: string | null;
  owner_id: string | null;
  workspace_id: string | null;
  project_id: string | null;
  runtime: string | null;
  model: string | null;
  autonomy_profile: string;
  builtin: number;
  secret_ref: string | null;
  config_json: string;
  export_path: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogPersonalityRow {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  version: number;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogSkillCollectionRow {
  id: string;
  name: string;
  description: string | null;
  skills_json: string;
  metadata_json: string;
  export_path: string | null;
  created_at: string;
  updated_at: string;
}
export interface AgentCatalogConnectionRow {
  id: string;
  provider: string;
  label: string;
  secret_ref: string | null;
  config_json: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface MarketplaceChoiceRow {
  id: string;
  kind: string;
  target: string;
  choice: string;
  status: string;
  rationale: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ContentItemRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  brand_id: string | null;
  campaign_id: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface SocialPostRow {
  id: string;
  title: string;
  status: string;
  channel_json: string;
  scheduled_at: string | null;
  published_at: string | null;
  page_id: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface IotConfigRow {
  id: string;
  kind: string;
  name: string;
  parent_id: string | null;
  status: string;
  config_json: string;
  secret_ref: string | null;
  enabled: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ConnectorOperationRow {
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
export interface ConnectorCapabilityRow {
  id: string;
  domain: string;
  action: string;
  facet: string;
  summary: string;
}
export function titleForDatabaseRecord(row: DatabaseRecordRow, payload: Record<string, unknown>): string {
  const fullName = [payload.firstName, payload.lastName]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();
  if (fullName) return fullName;
  const value = payload.title ?? payload.name ?? payload.displayName ?? payload.subject ?? payload.label ?? payload.email;
  return typeof value === "string" && value.trim() ? value.trim() : `${row.collection_name}:${row.id}`;
}
export function searchableRecordFields(payload: Record<string, unknown>): Array<[string, unknown]> {
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

export function isSearchableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function stringifySearchValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()).sort()
    : [];
}

export function sortedRecordKeys(value: unknown): string[] {
  return isPlainRecord(value) ? Object.keys(value).sort() : [];
}

export function safeSearchUrlHost(value: string): string | undefined {
  try {
    return new URL(value).host || undefined;
  } catch {
    return undefined;
  }
}

export function textFromStructuredContent(value: unknown): string | undefined {
  const parts: string[] = [];
  collectStructuredText(value, parts, 0);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

export function collectStructuredText(value: unknown, parts: string[], depth: number): void {
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

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pageBodyForSearch(db: Database.Database, pageId: string | null): string | undefined {
  if (!pageId || !hasTable(db, "page_blocks")) return undefined;
  const rows = db.prepare(`
    SELECT text
    FROM page_blocks
    WHERE page_id = ?
    ORDER BY sort_order, created_at
  `).all(pageId) as Array<{ text: string }>;
  const body = rows.map((row) => row.text).filter(Boolean).join("\n\n").trim();
  return body || undefined;
}

export function firstTextValue(payload: Record<string, unknown>): string | undefined {
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

export function isSensitiveRecord(payload: Record<string, unknown>): boolean {
  const metadata = isPlainRecord(payload.metadata) ? payload.metadata : {};
  const sensitivity = String(payload.sensitivity ?? metadata.sensitivity ?? payload.visibility ?? metadata.visibility ?? payload.privacy ?? metadata.privacy ?? "").toLowerCase();
  return ["sensitive", "private", "secret", "restricted"].includes(sensitivity);
}

export interface ConversationSessionRow {
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

export interface ConversationMessageRow {
  id: string;
  role: string;
  text: string;
  turn_index: number;
  created_at: string | null;
  metadata_json: string | null;
}

export function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function parseJsonValue(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseKnowledgeGraphResourceId(resourceId: string): { kind: "entity" | "fact"; id: string } | null {
  const separator = resourceId.indexOf(":");
  if (separator <= 0 || separator === resourceId.length - 1) return null;
  const kind = resourceId.slice(0, separator);
  if (kind !== "entity" && kind !== "fact") return null;
  return { kind, id: resourceId.slice(separator + 1) };
}

export function parseSignalsObservationsResourceId(resourceId: string): { kind: "vertical" | "variable" | "observation"; id: string } | null {
  const separator = resourceId.indexOf(":");
  if (separator <= 0 || separator === resourceId.length - 1) return null;
  const kind = resourceId.slice(0, separator);
  if (kind !== "vertical" && kind !== "variable" && kind !== "observation") return null;
  return { kind, id: resourceId.slice(separator + 1) };
}

export function signalUnitLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isPlainRecord(value)) {
    return stringValue(value.id)
      ?? stringValue(value.symbol)
      ?? stringValue(value.label)
      ?? stringValue(value.name);
  }
  return undefined;
}

export function financeRecordKind(collectionName: string, payload: Record<string, unknown>): string {
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

export function isSensitiveKnowledge(sensitivity: string): boolean {
  return ["sensitive", "private", "secret", "restricted"].includes(sensitivity.toLowerCase());
}

export function parseListFlag(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return entries.length ? entries : undefined;
}

export function parseSearchFiltersFlag(value: string | undefined): Record<string, unknown> | undefined {
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

export function parseSearchStrategyFlag(value: string | undefined): "lexical" | "semantic" | "hybrid" | undefined {
  return value === "semantic" || value === "hybrid" || value === "lexical" ? value : undefined;
}

export function parseSearchAgentBudget(flags: Record<string, string>): SearchQueryInput["agentBudget"] | undefined {
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

export function parseOptionalBoundedInteger(value: string | undefined, min: number, max: number): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function parseSearchIndexJobOperation(value: string | undefined): "upsert" | "delete" | "backfill" | "rebuild" | "embed" | undefined {
  return value === "upsert" || value === "delete" || value === "backfill" || value === "rebuild" || value === "embed" ? value : undefined;
}

export function parseSearchChangedOperation(value: string | undefined): "upsert" | "delete" | undefined {
  return value === "upsert" || value === "delete" ? value : undefined;
}

export function parseSearchIndexJobStatus(value: string | undefined): "queued" | "leased" | "done" | "failed" | undefined {
  return value === "queued" || value === "leased" || value === "done" || value === "failed" ? value : undefined;
}

export function parseSearchJobPayloadFlag(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--payload must be a JSON object");
  return parsed as Record<string, unknown>;
}

export function formatSearchJobLine(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const job = item as { id?: string; source?: string; shard?: string; operation?: string; status?: string; attempts?: number };
  return `${job.id ?? ""}\t${job.source ?? ""}\t${job.shard ?? ""}\t${job.operation ?? ""}\t${job.status ?? ""}\tattempts=${job.attempts ?? 0}`;
}

export function formatSearchShardLine(item: unknown): string {
  if (!item || typeof item !== "object") return String(item);
  const shard = item as { source?: string; shard?: string; domain?: string; state?: string; documentCount?: number; fragmentCount?: number };
  return `${shard.source ?? ""}\t${shard.shard ?? ""}\t${shard.domain ?? ""}\t${shard.state ?? ""}\tdocuments=${shard.documentCount ?? 0}\tfragments=${shard.fragmentCount ?? 0}`;
}

export function parseSearchEmbeddingFlag(value: string | undefined, model: string | undefined): { model: string; vector: number[] } | undefined {
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

export function localTextEmbeddingForQuery(query: string, strategy: SearchQueryInput["strategy"], flags: Record<string, string>): { model: string; vector: number[] } | undefined {
  const model = flags["embedding-model"] ?? flags.model;
  const requested = model !== undefined || flags["local-embedding"] === "true";
  if (!requested || strategy === "lexical") return undefined;
  return createLocalTextEmbedding(query, { model: localSearchEmbeddingModel(model) });
}

export function searchQueryRequiresAudit(query: string, results: SearchResult[], filters: Record<string, unknown> | undefined): boolean {
  if (results.some((result) => result.permissions?.redacted)) return true;
  if (filters?.redacted === true || filters?.canPreview === false) return true;
  return /\b(secret|private|restricted|sensitive|token|password|credential)\b/i.test(query);
}

export function mergeQueryOutputWithLocalDiscovery(output: SearchQueryOutput, localResults: ClawCliSearchResult[], limit: number): SearchQueryOutput {
  if (localResults.length === 0) return output;
  const merged = new Map<string, SearchResult>();
  for (const result of output.results) merged.set(`${result.source}:${result.id}`, result);
  for (const result of localResults) {
    const searchResult = localDiscoveryToSearchResult(result);
    const key = `${searchResult.source}:${searchResult.id}`;
    const previous = merged.get(key);
    if (!previous || searchResult.score > previous.score) merged.set(key, searchResult);
  }
  return {
    ...output,
    results: [...merged.values()]
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
      .slice(0, limit),
  };
}

export function localDiscoveryToSearchResult(result: ClawCliSearchResult): SearchResult {
  return {
    id: `local:${result.path}`,
    source: "local.files",
    domain: "files",
    type: result.type,
    title: result.name,
    subtitle: result.canonicalName,
    snippet: result.summary,
    score: result.score,
    updatedAt: "1970-01-01T00:00:00.000Z",
    resourceId: result.path,
    path: result.path,
    fragments: [{
      id: `local:${result.path}:match`,
      title: "Local file",
      snippet: result.summary,
      score: result.score,
    }],
    actions: [],
    permissions: {
      canOpen: true,
      canPreview: true,
      redacted: false,
    },
    metadata: {
      canonicalName: result.canonicalName,
      relativePath: result.path,
    },
  };
}

export function parseFilterValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.includes("|")) return value.split("|").map((entry) => parseFilterValue(entry.trim()));
  return value;
}

export type SearchRepositoryRoot = Pick<ClawRepositoryRoot, "repo" | "rootDir">;

export function searchRegisteredRepositoryFiles(query: string, repositories: SearchRepositoryRoot[]): ClawCliSearchResult[] {
  return repositories.flatMap((repository) => searchRegisteredRepositoryLocalFiles(query, repository));
}

export function searchRegisteredLocalFiles(query: string, cwd: string): ClawCliSearchResult[] {
  return searchRegisteredRepositoryFiles(query, [{ repo: "clawjs", rootDir: cwd }]);
}

export function searchRegisteredRepositoryLocalFiles(query: string, repository: SearchRepositoryRoot): ClawCliSearchResult[] {
  const cwd = repository.rootDir;
  const paths = new Map<string, { type: ClawCliSearchResult["type"]; canonicalName: string }>();
  if (repository.repo === "clawjs") {
    for (const entry of clawCliCommandRegistry.commands) {
      for (const doc of entry.docs) paths.set(doc, { type: doc.includes("/adr/") ? "adr" : "doc", canonicalName: entry.target ?? entry.name });
      for (const adr of entry.adrs) paths.set(adr, { type: "adr", canonicalName: entry.target ?? entry.name });
      for (const test of entry.tests) paths.set(test, { type: "test", canonicalName: entry.target ?? entry.name });
      paths.set(entry.source.file, { type: "source", canonicalName: entry.target ?? entry.name });
    }
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
    const match = scoreFileContent(query, `${meta.canonicalName}\n${relativePath}\n${content}`);
    if (!match) continue;
    results.push({
      type: meta.type,
      name: relativePath,
      canonicalName: meta.canonicalName,
      score: match.score,
      summary: match.summary,
      path: relativePath,
      repo: repository.repo,
    });
  }
  return results;
}

export function discoverabilitySearchFiles(cwd: string): Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> {
  const registryPath = path.resolve(cwd, "docs/discoverability.registry.json");
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as {
      artifacts?: Array<{
        id?: string;
        kind?: string;
        canonicalName?: string;
        canonicalSource?: string;
        searchQueries?: Array<{ expectPath?: string }>;
      }>;
    };
    const entries: Array<{ path: string; type: ClawCliSearchResult["type"]; canonicalName: string }> = [];
    for (const artifact of registry.artifacts ?? []) {
      const type: ClawCliSearchResult["type"] = artifact.kind === "adr" || artifact.canonicalSource?.includes("/adr/") ? "adr"
        : artifact.kind === "skill" || artifact.canonicalSource?.includes("/skills/") ? "doc"
          : "doc";
      const canonicalName = artifact.canonicalName ?? artifact.id ?? "discoverability";
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

export function isSafeSearchFile(cwd: string, absolutePath: string): boolean {
  const relativePath = path.relative(cwd, absolutePath);
  return !!relativePath
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
    && !relativePath.split(path.sep).some((segment) => ["node_modules", "dist", ".git", ".tmp", "build", ".next"].includes(segment));
}

export function scoreFileContent(query: string, content: string): { score: number; summary: string } | null {
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

export function mergeSearchResults(results: ClawCliSearchResult[], limit: number): ClawCliSearchResult[] {
  const byKey = new Map<string, ClawCliSearchResult>();
  for (const result of results) {
    const key = `${result.repo ?? ""}:${result.type}:${result.name}:${result.canonicalName ?? ""}`;
    const previous = byKey.get(key);
    if (!previous || result.score > previous.score) byKey.set(key, result);
  }
  return [...byKey.values()]
    .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type) || left.name.localeCompare(right.name))
    .slice(0, limit);
}
