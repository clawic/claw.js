import { type SearchDocumentInput } from "@clawjs/search";
import { ELN_SEARCH_COLLECTIONS, OPERATIONAL_SEARCH_SIDECARS, WORK_SEARCH_COLLECTIONS } from "./cli-search-command-constants.ts";
import { redactExternalCachePayload, redactedStructuredText } from "./cli-search-web-external-source.ts";
import type {
  CalendarEventRow,
  ConversationMessageRow,
  ConversationSessionRow,
  DatabaseRecordRow,
  FinanceRecordTableRow,
  KnowledgeEntityRow,
  KnowledgeFactRow,
  NotesPageBlockRow,
  NotesPageRow,
  OperationalEventRow,
  RuntimeEventRow,
  RuntimeJobRow,
  SignalsObservationRow,
  SignalsVariableRow,
  SignalsVerticalRow,
  TemporalCalendarEventRow,
} from "./cli-search-document-rows.ts";
import {
  firstMeaningfulLine,
  firstTextValue,
  financeRecordKind,
  isSensitiveKnowledge,
  isSensitiveRecord,
  parseJsonArray,
  parseJsonRecord,
  signalUnitLabel,
  sortedRecordKeys,
  stringArray,
  stringMetadata,
  stringifySearchValue,
  textFromStructuredContent,
  searchableRecordFields,
} from "./cli-search-document-utils.ts";

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
