import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { SearchStore, type SearchDocumentInput } from "@clawjs/search";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import { redactedStructuredText } from "./cli-search-web-external-source.ts";

export function ensureSlidesDecksSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveSlidesDecksRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("slides.decks", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxDecks = boundedNumberFlag(flags["slides-limit"] ?? flags["slide-deck-limit"], 500, 1, 10000);
  const files = fs.readdirSync(root)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(root, entry))
    .sort()
    .slice(0, maxDecks);
  let indexed = 0;
  for (const file of files) {
    const document = slideDeckSearchDocument(file);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "slides.decks",
    cursor: `root:${stableSearchId(root)}:decks:${indexed}`,
    metadata: { root, maxDecks },
  });
  store.setSourceState("slides.decks", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureSlidesDeckResourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string, deckId: string, workspaceRoot?: string): number {
  const root = workspaceRoot ? resolveSlidesDecksRoot({ ...flags, workspace: workspaceRoot }, cwd) : resolveSlidesDecksRoot(flags, cwd);
  const filePath = path.join(root, `${deckId}.json`);
  const document = fs.existsSync(filePath) ? slideDeckSearchDocument(filePath) : null;
  if (!document) {
    store.tombstone({ source: "slides.decks", resourceId: deckId, reason: "slide deck missing during Search event refresh" });
    store.setSourceState("slides.decks", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  }
  store.upsertDocument(document);
  store.setSourceState("slides.decks", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

export function ensureSheetsWorkbooksSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveSheetsWorkbooksRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("sheets.workbooks", "enabled", {
      backlog: 0,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxWorkbooks = boundedNumberFlag(flags["sheets-limit"] ?? flags["workbook-limit"], 500, 1, 10000);
  const files = fs.readdirSync(root)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(root, entry))
    .sort()
    .slice(0, maxWorkbooks);
  let indexed = 0;
  for (const file of files) {
    const document = sheetsWorkbookSearchDocument(file);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "sheets.workbooks",
    cursor: `root:${stableSearchId(root)}:workbooks:${indexed}`,
    metadata: { root, maxWorkbooks },
  });
  store.setSourceState("sheets.workbooks", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureSheetsWorkbookResourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string, workbookId: string, workspaceRoot?: string): number {
  const root = workspaceRoot ? resolveSheetsWorkbooksRoot({ ...flags, workspace: workspaceRoot }, cwd) : resolveSheetsWorkbooksRoot(flags, cwd);
  const filePath = path.join(root, `${workbookId}.json`);
  const document = fs.existsSync(filePath) ? sheetsWorkbookSearchDocument(filePath) : null;
  if (!document) {
    store.tombstone({ source: "sheets.workbooks", resourceId: workbookId, reason: "workbook missing during Search event refresh" });
    store.setSourceState("sheets.workbooks", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  }
  store.upsertDocument(document);
  store.setSourceState("sheets.workbooks", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function resolveSlidesDecksRoot(flags: Record<string, string>, cwd: string): string {
  const workspaceRoot = path.resolve(flags.workspace ?? cwd);
  const configured = flags["slides-root"] ?? flags["slides-decks-root"] ?? flags["slide-decks-root"];
  if (configured) return path.resolve(configured);
  return resolveClawPersistentSurfacePath("claw.workspace.slides", workspaceRoot, "decks");
}

function resolveSheetsWorkbooksRoot(flags: Record<string, string>, cwd: string): string {
  const workspaceRoot = path.resolve(flags.workspace ?? cwd);
  const configured = flags["sheets-root"] ?? flags["sheets-workbooks-root"] ?? flags["workbooks-root"];
  if (configured) return path.resolve(configured);
  return resolveClawPersistentSurfacePath("claw.workspace.sheets", workspaceRoot, "workbooks");
}

function slideDeckSearchDocument(filePath: string): SearchDocumentInput | null {
  const raw = readLocalTextFile(filePath);
  if (!raw) return null;
  const deck = parseJsonRecord(raw) as SlideDeckSearchManifest;
  const deckId = stringValue(deck.id) ?? path.basename(filePath, ".json");
  const title = stringValue(deck.title) ?? `Slide deck ${deckId}`;
  const theme = stringValue(deck.theme);
  const author = isPlainRecord(deck.author) ? deck.author : {};
  const outputs = Array.isArray(deck.outputs) ? deck.outputs.filter(isPlainRecord) : [];
  const slides = Array.isArray(deck.slides) ? deck.slides.filter(isPlainRecord) : [];
  const slideTexts = slides.map(slideTextForSearch).filter((text) => text.length > 0);
  const metadataText = manifestRedactedText(deck.metadata);
  const outputFormats = outputs.map((output) => stringValue(output.format)).filter((format): format is string => !!format);
  const layouts = Array.from(new Set(slides.map((slide) => stringValue(slide.layout) ?? "slide")));
  const updatedAt = stringValue(deck.updatedAt) ?? fileUpdatedAt(filePath);
  const body = [
    title,
    theme,
    stringValue(author.name),
    stringValue(author.agentId),
    metadataText,
    ...slideTexts,
  ].filter(Boolean).join("\n");
  return {
    id: `slides.decks:${stableSearchId(filePath)}`,
    source: "slides.decks",
    domain: "slides",
    type: "deck",
    resourceId: deckId,
    title,
    subtitle: [theme, `${slides.length} slides`].filter(Boolean).join(" - "),
    snippet: firstMeaningfulLine(slideTexts.join("\n")) ?? title,
    body,
    path: filePath,
    updatedAt,
    metadata: {
      deckId,
      theme,
      slideCount: slides.length,
      layout: layouts,
      authorAgentId: stringValue(author.agentId),
      authorName: stringValue(author.name),
      outputFormat: Array.from(new Set(outputFormats)),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      slides: 1,
      slideCount: Math.min(slides.length, 50) / 50,
    },
    fragments: [
      ...(metadataText ? [{
        id: `slides.decks:${stableSearchId(filePath)}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: -1,
        metadata: { kind: "metadata", redactedValues: true },
      }] : []),
      ...slides.slice(0, 80).map((slide, index) => {
        const slideId = stringValue(slide.id) ?? `slide-${index + 1}`;
        const text = slideTextForSearch(slide);
        return {
          id: `slides.decks:${stableSearchId(filePath)}:slide:${slideId}`,
          title: stringValue(slide.heading) ?? stringValue(slide.title) ?? `Slide ${index + 1}`,
          body: text,
          snippet: firstMeaningfulLine(text) ?? stringValue(slide.layout) ?? "slide",
          sortOrder: index,
          metadata: {
            slideId,
            slideIndex: index,
            layout: stringValue(slide.layout) ?? "slide",
          },
        };
      }),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open slide deck", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy slide deck reference", requiresApproval: false },
    ],
  };
}

function sheetsWorkbookSearchDocument(filePath: string): SearchDocumentInput | null {
  const raw = readLocalTextFile(filePath);
  if (!raw) return null;
  const workbook = parseJsonRecord(raw) as SheetsWorkbookSearchManifest;
  const workbookId = stringValue(workbook.id) ?? path.basename(filePath, ".json");
  const title = stringValue(workbook.title) ?? stringValue(workbook.name) ?? `Workbook ${workbookId}`;
  const author = isPlainRecord(workbook.author) ? workbook.author : {};
  const outputs = Array.isArray(workbook.outputs) ? workbook.outputs.filter(isPlainRecord) : [];
  const sheetsValue = Array.isArray(workbook.sheets) ? workbook.sheets : Array.isArray(workbook.worksheets) ? workbook.worksheets : [];
  const sheets = sheetsValue.filter(isPlainRecord);
  const sheetTexts = sheets.map(sheetTextForSearch).filter((text) => text.length > 0);
  const metadataText = manifestRedactedText(workbook.metadata);
  const outputFormats = outputs.map((output) => stringValue(output.format)).filter((format): format is string => !!format);
  const sheetNames = sheets.map((sheet, index) => stringValue(sheet.name) ?? stringValue(sheet.title) ?? `Sheet ${index + 1}`);
  const updatedAt = stringValue(workbook.updatedAt) ?? fileUpdatedAt(filePath);
  const body = [
    title,
    stringValue(author.name),
    stringValue(author.agentId),
    metadataText,
    ...sheetTexts,
  ].filter(Boolean).join("\n");
  return {
    id: `sheets.workbooks:${stableSearchId(filePath)}`,
    source: "sheets.workbooks",
    domain: "sheets",
    type: "workbook",
    resourceId: workbookId,
    title,
    subtitle: `${sheets.length} sheets`,
    snippet: firstMeaningfulLine(sheetTexts.join("\n")) ?? title,
    body,
    path: filePath,
    updatedAt,
    metadata: {
      workbookId,
      sheetCount: sheets.length,
      sheetName: sheetNames,
      authorAgentId: stringValue(author.agentId),
      authorName: stringValue(author.name),
      outputFormat: Array.from(new Set(outputFormats)),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      sheets: 1,
      sheetCount: Math.min(sheets.length, 50) / 50,
    },
    fragments: [
      ...(metadataText ? [{
        id: `sheets.workbooks:${stableSearchId(filePath)}:metadata`,
        title: "metadata",
        body: metadataText,
        snippet: metadataText.slice(0, 180),
        sortOrder: -1,
        metadata: { kind: "metadata", redactedValues: true },
      }] : []),
      ...sheets.slice(0, 80).map((sheet, index) => {
        const sheetId = stringValue(sheet.id) ?? `sheet-${index + 1}`;
        const sheetName = stringValue(sheet.name) ?? stringValue(sheet.title) ?? `Sheet ${index + 1}`;
        const text = sheetTextForSearch(sheet);
        return {
          id: `sheets.workbooks:${stableSearchId(filePath)}:sheet:${sheetId}`,
          title: sheetName,
          body: text,
          snippet: firstMeaningfulLine(text) ?? sheetName,
          sortOrder: index,
          metadata: {
            sheetId,
            sheetIndex: index,
            sheetName,
          },
        };
      }),
    ],
    actions: [
      { id: "open", kind: "open", label: "Open workbook", requiresApproval: false },
      { id: "copy-reference", kind: "copy", label: "Copy workbook reference", requiresApproval: false },
    ],
  };
}

function slideTextForSearch(slide: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["title", "heading", "subtitle", "body", "quote", "attribution", "left", "right", "notes"]) {
    const value = stringValue(slide[key]);
    if (value) parts.push(value);
  }
  for (const key of ["bullets", "steps", "metrics", "rows", "image"]) {
    const text = manifestStructuredText(slide[key]);
    if (text) parts.push(text);
  }
  return parts.join("\n").trim();
}

function sheetTextForSearch(sheet: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["name", "title", "description", "notes"]) {
    const value = stringValue(sheet[key]);
    if (value) parts.push(value);
  }
  for (const key of ["columns", "rows", "cells", "tables", "charts", "metadata"]) {
    const text = manifestStructuredText(sheet[key]);
    if (text) parts.push(text);
  }
  return parts.join("\n").trim();
}

function manifestStructuredText(value: unknown): string | undefined {
  const safeValue = redactManifestStructuredValue(value, 0);
  const direct = textFromStructuredContent(safeValue);
  if (direct) return direct;
  const parts: string[] = [];
  collectManifestStructuredText(safeValue, parts, 0);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text || undefined;
}

function manifestRedactedText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return isPlainRecord(value) ? redactedStructuredText(value) : redactedStructuredText({ value });
}

function collectManifestStructuredText(value: unknown, parts: string[], depth: number): void {
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
    for (const item of value) collectManifestStructuredText(item, parts, depth + 1);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (["src", "path", "url"].includes(key)) continue;
    collectManifestStructuredText(nested, parts, depth + 1);
  }
}

function redactManifestStructuredValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redactManifestStructuredValue(item, depth + 1));
  if (!isPlainRecord(value)) return value;
  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (["src", "path", "url"].includes(key)) continue;
    redacted[key] = /token|secret|password|credential|api[_-]?key/i.test(key) ? "[redacted]" : redactManifestStructuredValue(nested, depth + 1);
  }
  return redacted;
}

function boundedNumberFlag(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readLocalTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseJsonRecord(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPlainRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textFromStructuredContent(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const text = value.map((item) => textFromStructuredContent(item)).filter(Boolean).join(" ");
    return text || undefined;
  }
  if (!isPlainRecord(value)) return undefined;
  const parts = Object.entries(value)
    .filter(([key]) => !["path", "url", "src"].includes(key))
    .map(([, nested]) => textFromStructuredContent(nested))
    .filter(Boolean);
  return parts.join(" ") || undefined;
}

function firstMeaningfulLine(text: string): string | undefined {
  return text.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.slice(0, 240);
}

function stableSearchId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function fileUpdatedAt(filePath: string): string {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

interface SlideDeckSearchManifest {
  id?: unknown;
  title?: unknown;
  theme?: unknown;
  author?: unknown;
  slides?: unknown;
  metadata?: unknown;
  outputs?: unknown;
  updatedAt?: unknown;
}

interface SheetsWorkbookSearchManifest {
  id?: unknown;
  title?: unknown;
  name?: unknown;
  author?: unknown;
  sheets?: unknown;
  worksheets?: unknown;
  metadata?: unknown;
  outputs?: unknown;
  updatedAt?: unknown;
}
