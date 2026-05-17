import fs from "node:fs";
import path from "node:path";

import { SearchStore, type SearchDocumentInput } from "@clawjs/search";

export function ensureImagesDerivedSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const workspaceRoot = path.resolve(flags.workspace ?? cwd);
  const imageRoot = path.resolve(flags["image-library"] ?? flags["image-library-root"] ?? workspaceRoot);
  const imageRecords = readWorkspaceCollectionRecords(imageRoot, "images");
  const imageIds = new Set(imageRecords.map((record) => stringField(record, "id")).filter((id): id is string => !!id));
  const mediaRecords = readWorkspaceCollectionRecords(workspaceRoot, "media")
    .filter((record) => isImageMediaRecord(record))
    .filter((record) => !(stringField(record, "sourceType") === "image" && imageIds.has(stringField(record, "sourceId") ?? "")));
  let indexed = 0;
  for (const record of imageRecords) {
    const document = imageRecordSearchDocument(record, imageRoot);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  for (const record of mediaRecords) {
    const document = imageMediaSearchDocument(record, workspaceRoot);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "images.derived",
    cursor: `images:${imageRecords.length}:media:${mediaRecords.length}`,
    metadata: { imageRoot, workspaceRoot, collections: ["images", "media"] },
  });
  store.setSourceState("images.derived", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureMediaAssetsSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const workspaceRoot = path.resolve(flags.workspace ?? cwd);
  const mediaRecords = readWorkspaceCollectionRecords(workspaceRoot, "media");
  let indexed = 0;
  for (const record of mediaRecords) {
    const document = mediaAssetSearchDocument(record, workspaceRoot);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "media.assets",
    cursor: `media:${indexed}`,
    metadata: { workspaceRoot, collections: ["media"] },
  });
  store.setSourceState("media.assets", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

function readWorkspaceCollectionRecords(root: string, collection: string): Array<Record<string, unknown>> {
  const dir = path.join(root, ".claw", "data", "collections", collection);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8")) as unknown;
        return isPlainRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter((record): record is Record<string, unknown> => record !== null);
}

function imageRecordSearchDocument(record: Record<string, unknown>, imageRoot: string): SearchDocumentInput | null {
  const id = stringField(record, "id");
  if (!id) return null;
  const title = stringField(record, "title") ?? id;
  const prompt = stringField(record, "prompt");
  const revisedPrompt = stringField(record, "revisedPrompt");
  const outputRelativePath = stringField(record, "outputRelativePath");
  const tags = stringArrayField(record, "tags");
  const collections = stringArrayField(record, "collections");
  const derivedText = imageDerivedTextFields(record);
  const pathValue = outputRelativePath ? path.join(imageRoot, ".claw", "data", "assets", outputRelativePath) : undefined;
  const body = [
    title,
    prompt,
    revisedPrompt,
    stringField(record, "negativePrompt"),
    stringField(record, "imageType"),
    stringField(record, "provenance"),
    stringField(record, "operation"),
    stringField(record, "project"),
    stringField(record, "topic"),
    stringField(record, "provider"),
    stringField(record, "model"),
    stringField(record, "backendLabel"),
    ...tags,
    ...collections,
    derivedText.ocrText,
    derivedText.altText,
    derivedText.caption,
    ...derivedText.labels,
    ...derivedText.objects,
    textFromStructuredContent(record.metadata),
  ].filter(Boolean).join("\n");
  return {
    id: `images.derived:image:${id}`,
    source: "images.derived",
    domain: "images",
    type: "image",
    resourceId: id,
    title,
    subtitle: [stringField(record, "imageType"), stringField(record, "operation"), stringField(record, "status")].filter(Boolean).join(" / "),
    snippet: revisedPrompt ?? prompt ?? title,
    body,
    ...(pathValue ? { path: pathValue } : {}),
    ...(stringField(record, "updatedAt") ? { updatedAt: stringField(record, "updatedAt") } : {}),
    metadata: {
      imageId: id,
      imageType: stringField(record, "imageType") ?? null,
      provenance: stringField(record, "provenance") ?? null,
      operation: stringField(record, "operation") ?? null,
      status: stringField(record, "status") ?? null,
      project: stringField(record, "project") ?? null,
      workspaceId: stringField(record, "workspaceId") ?? null,
      agentId: stringField(record, "agentId") ?? null,
      topic: stringField(record, "topic") ?? null,
      provider: stringField(record, "provider") ?? null,
      model: stringField(record, "model") ?? null,
      tag: tags,
      collection: collections,
      outputFormat: stringField(record, "outputFormat") ?? null,
      outputMimeType: stringField(record, "outputMimeType") ?? null,
      outputWidth: numberField(record, "outputWidth"),
      outputHeight: numberField(record, "outputHeight"),
      outputSize: numberField(record, "outputSize"),
      ocrTextIndexed: !!derivedText.ocrText,
      visionLabel: derivedText.labels,
      visionObject: derivedText.objects,
      altText: derivedText.altText ?? null,
      caption: derivedText.caption ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      image: 1,
      generated: stringField(record, "operation") === "create" ? 0.2 : 0,
    },
    fragments: [
      ...(prompt ? [{
        id: `images.derived:image:${id}:prompt`,
        title: "prompt",
        body: prompt,
        snippet: prompt.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "prompt" },
      }] : []),
      ...(revisedPrompt ? [{
        id: `images.derived:image:${id}:revised`,
        title: "revised prompt",
        body: revisedPrompt,
        snippet: revisedPrompt.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "revisedPrompt" },
      }] : []),
      ...(derivedText.ocrText ? [{
        id: `images.derived:image:${id}:ocr`,
        title: "ocr text",
        body: derivedText.ocrText,
        snippet: derivedText.ocrText.slice(0, 180),
        sortOrder: 2,
        metadata: { kind: "ocrText" },
      }] : []),
      ...(derivedText.caption ? [{
        id: `images.derived:image:${id}:caption`,
        title: "caption",
        body: derivedText.caption,
        snippet: derivedText.caption.slice(0, 180),
        sortOrder: 3,
        metadata: { kind: "caption" },
      }] : []),
      ...(derivedText.labels.length ? [{
        id: `images.derived:image:${id}:vision-labels`,
        title: "vision labels",
        body: derivedText.labels.join("\n"),
        snippet: derivedText.labels.join(", ").slice(0, 180),
        sortOrder: 4,
        metadata: { kind: "visionLabels" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open image", requiresApproval: true, risk: "read", grant: "search.images.open" },
      { id: "copy-reference", kind: "copy", label: "Copy image reference", requiresApproval: false },
    ],
  };
}

function imageMediaSearchDocument(record: Record<string, unknown>, workspaceRoot: string): SearchDocumentInput | null {
  const mediaId = stringField(record, "mediaId");
  if (!mediaId) return null;
  const name = stringField(record, "name") ?? mediaId;
  const sourceText = stringField(record, "sourceText");
  const external = isPlainRecord(record.external) ? record.external : {};
  const storage = isPlainRecord(record.storage) ? record.storage : {};
  const storageKey = stringField(storage, "key");
  const derivedText = imageDerivedTextFields(record);
  const body = [
    name,
    stringField(record, "mimeType"),
    stringField(record, "kind"),
    sourceText,
    stringField(record, "origin"),
    stringField(record, "direction"),
    stringField(record, "agentId"),
    stringField(record, "sessionId"),
    stringField(external, "value"),
    derivedText.ocrText,
    derivedText.altText,
    derivedText.caption,
    ...derivedText.labels,
    ...derivedText.objects,
    textFromStructuredContent(record.metadata),
  ].filter(Boolean).join("\n");
  return {
    id: `images.derived:media:${mediaId}`,
    source: "images.derived",
    domain: "images",
    type: "image",
    resourceId: mediaId,
    title: name,
    subtitle: [stringField(record, "origin"), stringField(record, "direction"), stringField(record, "mimeType")].filter(Boolean).join(" / "),
    snippet: sourceText ?? name,
    body,
    ...(storageKey ? { path: path.join(workspaceRoot, ".claw", "storage", storageKey) } : {}),
    ...(stringField(record, "updatedAt") ?? stringField(record, "createdAt") ? { updatedAt: stringField(record, "updatedAt") ?? stringField(record, "createdAt") } : {}),
    metadata: {
      mediaId,
      imageType: "media",
      provenance: stringField(record, "origin") ?? null,
      operation: stringField(record, "direction") ?? null,
      project: stringField(record, "projectId") ?? null,
      workspaceId: stringField(record, "workspaceId") ?? null,
      agentId: stringField(record, "agentId") ?? null,
      sessionId: stringField(record, "sessionId") ?? null,
      provider: isPlainRecord(record.channel) ? stringField(record.channel, "provider") ?? null : null,
      mimeType: stringField(record, "mimeType") ?? null,
      sizeBytes: numberField(record, "sizeBytes"),
      sourceType: stringField(record, "sourceType") ?? null,
      sourceId: stringField(record, "sourceId") ?? null,
      ocrTextIndexed: !!derivedText.ocrText,
      visionLabel: derivedText.labels,
      visionObject: derivedText.objects,
      altText: derivedText.altText ?? null,
      caption: derivedText.caption ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: { fastPath: 1, image: 0.8, media: 1 },
    fragments: [
      ...(sourceText ? [{
        id: `images.derived:media:${mediaId}:source-text`,
        title: "source text",
        body: sourceText,
        snippet: sourceText.slice(0, 180),
        sortOrder: 0,
        metadata: { kind: "sourceText" },
      }] : []),
      ...(derivedText.ocrText ? [{
        id: `images.derived:media:${mediaId}:ocr`,
        title: "ocr text",
        body: derivedText.ocrText,
        snippet: derivedText.ocrText.slice(0, 180),
        sortOrder: 1,
        metadata: { kind: "ocrText" },
      }] : []),
      ...(derivedText.labels.length ? [{
        id: `images.derived:media:${mediaId}:vision-labels`,
        title: "vision labels",
        body: derivedText.labels.join("\n"),
        snippet: derivedText.labels.join(", ").slice(0, 180),
        sortOrder: 2,
        metadata: { kind: "visionLabels" },
      }] : []),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open image media", requiresApproval: true, risk: "read", grant: "search.images.open" },
      { id: "copy-reference", kind: "copy", label: "Copy media reference", requiresApproval: false },
    ],
  };
}

function mediaAssetSearchDocument(record: Record<string, unknown>, workspaceRoot: string): SearchDocumentInput | null {
  const mediaId = stringField(record, "mediaId");
  if (!mediaId) return null;
  const kind = stringField(record, "kind") ?? "asset";
  const name = stringField(record, "name") ?? mediaId;
  const sourceText = stringField(record, "sourceText");
  const channel = isPlainRecord(record.channel) ? record.channel : {};
  const external = isPlainRecord(record.external) ? record.external : {};
  const storage = isPlainRecord(record.storage) ? record.storage : {};
  const storageKey = stringField(storage, "key");
  const provider = stringField(channel, "provider");
  const body = [
    name,
    kind,
    stringField(record, "mimeType"),
    sourceText,
    stringField(record, "origin"),
    stringField(record, "direction"),
    stringField(record, "workspaceId"),
    stringField(record, "projectId"),
    stringField(record, "agentId"),
    stringField(record, "sessionId"),
    stringField(record, "messageId"),
    provider,
    stringField(channel, "targetId"),
    stringField(channel, "threadId"),
    stringField(external, "value"),
    textFromStructuredContent(record.metadata),
  ].filter(Boolean).join("\n");
  return {
    id: `media.assets:${mediaId}`,
    source: "media.assets",
    domain: "media",
    type: kind,
    resourceId: mediaId,
    title: name,
    subtitle: [kind, stringField(record, "origin"), stringField(record, "direction"), stringField(record, "mimeType")].filter(Boolean).join(" / "),
    snippet: sourceText ?? name,
    body,
    ...(storageKey ? { path: path.join(workspaceRoot, ".claw", "storage", storageKey) } : {}),
    ...(stringField(record, "updatedAt") ?? stringField(record, "createdAt") ? { updatedAt: stringField(record, "updatedAt") ?? stringField(record, "createdAt") } : {}),
    metadata: {
      mediaId,
      kind,
      origin: stringField(record, "origin") ?? null,
      direction: stringField(record, "direction") ?? null,
      project: stringField(record, "projectId") ?? null,
      workspaceId: stringField(record, "workspaceId") ?? null,
      agentId: stringField(record, "agentId") ?? null,
      sessionId: stringField(record, "sessionId") ?? null,
      messageId: stringField(record, "messageId") ?? null,
      provider: provider ?? null,
      targetId: stringField(channel, "targetId") ?? null,
      threadId: stringField(channel, "threadId") ?? null,
      mimeType: stringField(record, "mimeType") ?? null,
      sizeBytes: numberField(record, "sizeBytes"),
      sourceType: stringField(record, "sourceType") ?? null,
      sourceId: stringField(record, "sourceId") ?? null,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      media: 1,
      image: kind === "image" ? 0.2 : 0,
    },
    fragments: sourceText ? [{
      id: `media.assets:${mediaId}:source-text`,
      title: "source text",
      body: sourceText,
      snippet: sourceText.slice(0, 180),
      sortOrder: 0,
      metadata: { kind: "sourceText" },
    }] : [],
    actions: [
      { id: "open", kind: "open", label: "Open media", requiresApproval: true, risk: "read", grant: "search.media.open" },
      { id: "copy-reference", kind: "copy", label: "Copy media reference", requiresApproval: false },
    ],
  };
}

function imageDerivedTextFields(record: Record<string, unknown>): {
  ocrText?: string;
  altText?: string;
  caption?: string;
  labels: string[];
  objects: string[];
} {
  const metadata = isPlainRecord(record.metadata) ? record.metadata : {};
  const vision = isPlainRecord(record.vision) ? record.vision : isPlainRecord(metadata.vision) ? metadata.vision : {};
  const ocr = isPlainRecord(record.ocr) ? record.ocr : isPlainRecord(metadata.ocr) ? metadata.ocr : {};
  const ocrText = firstStringField([record, metadata, ocr, vision], ["ocrText", "detectedText", "recognizedText", "text"]);
  const altText = firstStringField([record, metadata, vision], ["altText", "alt", "accessibilityLabel"]);
  const caption = firstStringField([record, metadata, vision], ["caption", "description", "summary"]);
  const labels = uniqueStrings([
    ...stringListFromValue(record.labels),
    ...stringListFromValue(record.visionLabels),
    ...stringListFromValue(metadata.labels),
    ...stringListFromValue(metadata.visionLabels),
    ...stringListFromValue(vision.labels),
    ...stringListFromValue(vision.tags),
  ]);
  const objects = uniqueStrings([
    ...stringListFromValue(record.objects),
    ...stringListFromValue(record.detectedObjects),
    ...stringListFromValue(metadata.objects),
    ...stringListFromValue(metadata.detectedObjects),
    ...stringListFromValue(vision.objects),
    ...stringListFromValue(vision.detectedObjects),
  ]);
  return {
    ...(ocrText ? { ocrText } : {}),
    ...(altText ? { altText } : {}),
    ...(caption ? { caption } : {}),
    labels,
    objects,
  };
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

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()) : [];
}

function firstStringField(records: Array<Record<string, unknown>>, keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = stringField(record, key);
      if (value) return value;
    }
  }
  return undefined;
}

function stringListFromValue(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    if (!isPlainRecord(entry)) return [];
    const value = firstStringField([entry], ["name", "label", "text", "title", "class"]);
    return value ? [value] : [];
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isImageMediaRecord(record: Record<string, unknown>): boolean {
  const kind = stringField(record, "kind");
  const mimeType = stringField(record, "mimeType");
  return kind === "image" || kind === "animation" || !!mimeType?.toLowerCase().startsWith("image/");
}
