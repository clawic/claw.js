import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SearchStore, type SearchDocumentInput } from "@clawjs/search";

import { isIgnoredCodeSearchDirectory } from "./cli-search-code-symbols-source.ts";
import { runIncrementalFileSourceTick } from "./cli-search-incremental-files.ts";

interface WebIngestedCandidate {
  absolutePath: string;
  extension: string;
  size: number;
  updatedAt: string;
}

interface ExternalCacheCandidate {
  absolutePath: string;
  extension: string;
  size: number;
  updatedAt: string;
}

export function ensureWebIngestedSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveWebIngestedRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("web.ingested", "degraded", {
      backlog: 0,
      error: `web cache root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["web-limit"] ?? flags["web-cache-limit"], 500, 1, 20000);
  const maxDepth = boundedNumberFlag(flags["web-max-depth"] ?? flags["web-cache-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["web-max-bytes"] ?? flags["web-cache-max-bytes"], 512 * 1024, 1024, 4 * 1024 * 1024);
  const tick = runIncrementalFileSourceTick({
    store,
    source: "web.ingested",
    root,
    limits: { maxFiles, maxDepth, maxBytes },
    ignoreDirectory: (name) => isIgnoredLocalFilesDirectory(name),
    fileInfo: ({ extension, stat }) => ({
      indexable: [".html", ".htm", ".json", ".md", ".txt"].includes(extension) && stat.size <= maxBytes,
      kind: extension.replace(/^\./, "") || "file",
      reason: "web cache file skipped during incremental Search scan",
    }),
    onUpsert: ({ relativePath }) => ({ indexed: ensureWebIngestedResourceIndexed(store, flags, cwd, relativePath, root) }),
    onDelete: ({ relativePath, reason }) => {
      store.tombstone({ source: "web.ingested", resourceId: relativePath, reason });
      return { indexed: 1 };
    },
  });
  store.setSourceState("web.ingested", "enabled", {
    backlog: tick.pending ? Math.max(1, tick.frontierRemaining) : 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  if (tick.pending) enqueueFileSourceContinuation(store, "web.ingested", root);
  return tick.indexed;
}

export function ensureWebIngestedResourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string, relativePath: string, rootOverride?: string): number {
  const root = path.resolve(rootOverride ?? resolveWebIngestedRoot(flags, cwd));
  const absolutePath = path.resolve(root, relativePath);
  const relativeFromRoot = normalizeRelativePath(path.relative(root, absolutePath));
  if (relativeFromRoot === ".." || relativeFromRoot.startsWith("../") || path.isAbsolute(relativeFromRoot)) {
    store.tombstone({ source: "web.ingested", resourceId: relativePath, reason: "web cache file outside root during Search event refresh" });
    return 1;
  }
  const maxBytes = boundedNumberFlag(flags["web-max-bytes"] ?? flags["web-cache-max-bytes"], 512 * 1024, 1024, 4 * 1024 * 1024);
  const extension = path.extname(absolutePath).toLowerCase();
  if (![".html", ".htm", ".json", ".md", ".txt"].includes(extension)) {
    store.tombstone({ source: "web.ingested", resourceId: relativeFromRoot, reason: "web cache file skipped during Search event refresh" });
    return 1;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    store.tombstone({ source: "web.ingested", resourceId: relativeFromRoot, reason: "web cache file missing during Search event refresh" });
    return 1;
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
    store.tombstone({ source: "web.ingested", resourceId: relativeFromRoot, reason: "web cache file skipped during Search event refresh" });
    return 1;
  }
  const document = webIngestedSearchDocument(root, { absolutePath, extension, size: stat.size, updatedAt: stat.mtime.toISOString() }, maxBytes);
  if (!document) {
    store.tombstone({ source: "web.ingested", resourceId: relativeFromRoot, reason: "web cache file skipped during Search event refresh" });
    return 1;
  }
  store.upsertDocument(document);
  store.markFileInventoryIndexed({
    source: "web.ingested",
    root,
    relativePath: relativeFromRoot,
    checksum: typeof document.metadata?.contentChecksum === "string" ? document.metadata.contentChecksum : null,
  });
  store.setSourceState("web.ingested", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

export function ensureExternalCacheSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveExternalCacheRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("external.cache", "degraded", {
      backlog: 0,
      error: `external cache root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["external-limit"] ?? flags["external-cache-limit"], 500, 1, 20000);
  const maxDepth = boundedNumberFlag(flags["external-max-depth"] ?? flags["external-cache-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["external-max-bytes"] ?? flags["external-cache-max-bytes"], 512 * 1024, 1024, 4 * 1024 * 1024);
  const tick = runIncrementalFileSourceTick({
    store,
    source: "external.cache",
    root,
    limits: { maxFiles, maxDepth, maxBytes },
    ignoreDirectory: (name) => isIgnoredLocalFilesDirectory(name),
    fileInfo: ({ extension, stat }) => ({
      indexable: [".json", ".jsonl", ".md", ".txt"].includes(extension) && stat.size <= maxBytes,
      kind: extension.replace(/^\./, "") || "file",
      reason: "external cache file skipped during incremental Search scan",
    }),
    onUpsert: ({ relativePath }) => ({ indexed: ensureExternalCacheResourceIndexed(store, flags, cwd, relativePath, root) }),
    onDelete: ({ relativePath, reason }) => {
      store.tombstone({ source: "external.cache", resourceId: relativePath, reason });
      return { indexed: 1 };
    },
  });
  store.setSourceState("external.cache", "enabled", {
    backlog: tick.pending ? Math.max(1, tick.frontierRemaining) : 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  if (tick.pending) enqueueFileSourceContinuation(store, "external.cache", root);
  return tick.indexed;
}

export function ensureExternalCacheResourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string, relativePath: string, rootOverride?: string): number {
  const root = path.resolve(rootOverride ?? resolveExternalCacheRoot(flags, cwd));
  const absolutePath = path.resolve(root, relativePath);
  const relativeFromRoot = normalizeRelativePath(path.relative(root, absolutePath));
  if (relativeFromRoot === ".." || relativeFromRoot.startsWith("../") || path.isAbsolute(relativeFromRoot)) {
    store.tombstone({ source: "external.cache", resourceId: relativePath, reason: "external cache file outside root during Search event refresh" });
    return 1;
  }
  const maxBytes = boundedNumberFlag(flags["external-max-bytes"] ?? flags["external-cache-max-bytes"], 512 * 1024, 1024, 4 * 1024 * 1024);
  const extension = path.extname(absolutePath).toLowerCase();
  if (![".json", ".jsonl", ".md", ".txt"].includes(extension)) {
    store.tombstone({ source: "external.cache", resourceId: relativeFromRoot, reason: "external cache file skipped during Search event refresh" });
    return 1;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    store.tombstone({ source: "external.cache", resourceId: relativeFromRoot, reason: "external cache file missing during Search event refresh" });
    return 1;
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
    store.tombstone({ source: "external.cache", resourceId: relativeFromRoot, reason: "external cache file skipped during Search event refresh" });
    return 1;
  }
  const document = externalCacheSearchDocument(root, { absolutePath, extension, size: stat.size, updatedAt: stat.mtime.toISOString() }, maxBytes);
  if (!document) {
    store.tombstone({ source: "external.cache", resourceId: relativeFromRoot, reason: "external cache file skipped during Search event refresh" });
    return 1;
  }
  store.upsertDocument(document);
  store.markFileInventoryIndexed({
    source: "external.cache",
    root,
    relativePath: relativeFromRoot,
    checksum: typeof document.metadata?.contentChecksum === "string" ? document.metadata.contentChecksum : null,
  });
  store.setSourceState("external.cache", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

export function redactExternalCachePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    redacted[key] = /token|secret|password|credential|api[_-]?key/i.test(key) ? "[redacted]" : redactExternalCacheValue(value, 0);
  }
  return redacted;
}

export function redactedStructuredText(payload: Record<string, unknown>): string | undefined {
  const redacted = redactExternalCachePayload(payload);
  return textFromStructuredContent(redacted) ?? (Object.keys(redacted).length ? JSON.stringify(redacted) : undefined);
}

function resolveWebIngestedRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["web-root"] ?? flags["web-cache-root"] ?? flags.workspace ?? cwd);
}

function resolveExternalCacheRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["external-root"] ?? flags["external-cache-root"] ?? flags.workspace ?? cwd);
}

function enqueueFileSourceContinuation(store: SearchStore, source: string, root: string): void {
  store.enqueueIndexJob({
    id: `scan:${source}:${stableSearchId(root)}:continue`,
    source,
    operation: "rebuild",
    resourceId: root,
    payload: { root },
    priority: 20,
  });
}

function boundedNumberFlag(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function discoverWebIngestedFiles(root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): WebIngestedCandidate[] {
  const files: WebIngestedCandidate[] = [];
  const visit = (directory: string, depth: number): void => {
    if (files.length >= limits.maxFiles || depth > limits.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limits.maxFiles) break;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredLocalFilesDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (![".html", ".htm", ".json", ".md", ".txt"].includes(extension)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxBytes) continue;
      files.push({ absolutePath, extension, size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function discoverExternalCacheFiles(root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): ExternalCacheCandidate[] {
  const files: ExternalCacheCandidate[] = [];
  const visit = (directory: string, depth: number): void => {
    if (files.length >= limits.maxFiles || depth > limits.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limits.maxFiles) break;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredLocalFilesDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (![".json", ".jsonl", ".md", ".txt"].includes(extension)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxBytes) continue;
      files.push({ absolutePath, extension, size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function isIgnoredLocalFilesDirectory(name: string): boolean {
  return isIgnoredCodeSearchDirectory(name) || name === ".Spotlight-V100" || name === ".TemporaryItems" || name === ".Trashes";
}

function webIngestedSearchDocument(root: string, file: WebIngestedCandidate, maxBytes: number): SearchDocumentInput | null {
  const raw = readLocalTextFile(file.absolutePath).slice(0, maxBytes);
  if (!raw) return null;
  const contentChecksum = createHash("sha256").update(raw).digest("hex");
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const parsed = parseWebIngestedPayload(raw, file.extension);
  const url = parsed.url ?? urlFromWebCachePath(relativePath);
  const title = parsed.title ?? titleFromWebText(parsed.text) ?? path.basename(file.absolutePath);
  const text = parsed.text || title;
  const host = parsed.host ?? hostFromUrl(url);
  const documentId = `web.ingested:${stableSearchId(`${root}\0${relativePath}`)}`;
  return {
    id: documentId,
    source: "web.ingested",
    domain: "web",
    type: "page",
    resourceId: relativePath,
    title,
    subtitle: url ?? relativePath,
    snippet: parsed.description ?? firstMeaningfulLine(text) ?? relativePath,
    body: [title, parsed.description, url, text].filter(Boolean).join("\n").slice(0, maxBytes),
    path: file.absolutePath,
    updatedAt: parsed.updatedAt ?? file.updatedAt,
    metadata: {
      root,
      relativePath,
      extension: file.extension,
      host,
      url,
      crawlScope: parsed.crawlScope ?? "explicit_cache",
      contentType: parsed.contentType ?? contentTypeForWebCacheExtension(file.extension),
      contentChecksum,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      web: 1,
      explicitCache: 1,
    },
    fragments: textSectionFragments(documentId, text, firstMeaningfulLine(text) ?? title, maxBytes),
    actions: [
      { id: "open", kind: "open", label: "Open cached page", requiresApproval: true, risk: "read", grant: "search.web.open" },
      { id: "copy-reference", kind: "copy", label: "Copy page reference", requiresApproval: false },
    ],
  };
}

function externalCacheSearchDocument(root: string, file: ExternalCacheCandidate, maxBytes: number): SearchDocumentInput | null {
  const raw = readLocalTextFile(file.absolutePath).slice(0, maxBytes);
  if (!raw) return null;
  const contentChecksum = createHash("sha256").update(raw).digest("hex");
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const record = parseExternalCacheRecord(raw, file.extension, relativePath);
  if (!record) return null;
  const title = record.title ?? record.subject ?? record.name ?? record.id ?? path.basename(file.absolutePath);
  const body = [
    title,
    record.summary,
    record.text,
    record.provider,
    record.app,
    record.externalId,
  ].filter(Boolean).join("\n").slice(0, maxBytes);
  const documentId = `external.cache:${stableSearchId(`${root}\0${relativePath}\0${record.id ?? ""}`)}`;
  return {
    id: documentId,
    source: "external.cache",
    domain: "external",
    type: record.type ?? "external_record",
    resourceId: relativePath,
    title,
    subtitle: [record.provider, record.app].filter(Boolean).join("/") || relativePath,
    snippet: record.summary ?? firstMeaningfulLine(record.text ?? body) ?? relativePath,
    body,
    path: file.absolutePath,
    updatedAt: record.updatedAt ?? file.updatedAt,
    metadata: {
      root,
      relativePath,
      provider: record.provider ?? "unknown",
      app: record.app ?? record.provider ?? "unknown",
      syncMode: record.syncMode ?? "cache",
      externalId: record.externalId ?? record.id,
      kind: record.type ?? "external_record",
      contentChecksum,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      external: 1,
      explicitCache: 1,
    },
    fragments: record.text ? textSectionFragments(documentId, record.text, firstMeaningfulLine(record.text) ?? title, maxBytes) : [],
    actions: [
      { id: "open", kind: "open", label: "Open external record", requiresApproval: true, risk: "read", grant: "search.external.open" },
      { id: "copy-reference", kind: "copy", label: "Copy external reference", requiresApproval: false },
    ],
  };
}

function parseExternalCacheRecord(raw: string, extension: string, relativePath: string): {
  id?: string;
  externalId?: string;
  provider?: string;
  app?: string;
  type?: string;
  name?: string;
  title?: string;
  subject?: string;
  summary?: string;
  text?: string;
  updatedAt?: string;
  syncMode?: string;
} | null {
  if (extension === ".json") {
    try {
      return normalizeExternalCachePayload(JSON.parse(raw) as Record<string, unknown>, relativePath);
    } catch {
      return null;
    }
  }
  if (extension === ".jsonl") {
    const first = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (!first) return null;
    try {
      return normalizeExternalCachePayload(JSON.parse(first) as Record<string, unknown>, relativePath);
    } catch {
      return null;
    }
  }
  return {
    id: relativePath,
    provider: path.dirname(relativePath).split(path.posix.sep)[0] || "local",
    type: "external_record",
    title: path.basename(relativePath),
    text: raw,
    syncMode: "cache",
  };
}

function textSectionFragments(documentId: string, text: string, fallbackSnippet: string, maxBytes: number): NonNullable<SearchDocumentInput["fragments"]> {
  const sections = extractTextSections(text);
  if (sections.length > 0) {
    return sections.slice(0, 24).map((section, index) => ({
      id: `${documentId}:section:${index}`,
      title: section.title,
      body: section.body.slice(0, Math.min(maxBytes, 4096)),
      snippet: section.snippet,
      sortOrder: index,
      metadata: { kind: "section", level: section.level, line: section.line },
    }));
  }
  return [{
    id: `${documentId}:content`,
    title: "Content",
    body: text.slice(0, maxBytes),
    snippet: fallbackSnippet,
    sortOrder: 0,
    metadata: { kind: "content" },
  }];
}

function extractTextSections(text: string): Array<{ title: string; level: number; line: number; body: string; snippet: string }> {
  const lines = text.split(/\r?\n/);
  const sections: Array<{ title: string; level: number; line: number; body: string; snippet: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,3})\s+(.+)$/.exec(lines[index]?.trim() ?? "");
    if (!match) continue;
    const bodyLines: string[] = [];
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      if (/^#{1,3}\s+/.test(lines[bodyIndex]?.trim() ?? "")) break;
      const line = lines[bodyIndex]?.trim();
      if (line) bodyLines.push(line);
      if (bodyLines.join("\n").length > 4096) break;
    }
    const body = bodyLines.join("\n");
    sections.push({
      title: match[2]?.trim() ?? "Section",
      level: match[1]?.length ?? 1,
      line: index + 1,
      body,
      snippet: firstMeaningfulLine(body) ?? match[2]?.trim() ?? "Section",
    });
  }
  return sections;
}

function normalizeExternalCachePayload(payload: Record<string, unknown>, relativePath: string): ReturnType<typeof parseExternalCacheRecord> {
  const nested = typeof payload.record === "object" && payload.record !== null ? payload.record as Record<string, unknown> : payload;
  return {
    id: stringValue(nested.id) ?? stringValue(payload.id) ?? relativePath,
    externalId: stringValue(nested.externalId) ?? stringValue(nested.external_id) ?? stringValue(payload.externalId) ?? stringValue(payload.external_id),
    provider: stringValue(nested.provider) ?? stringValue(payload.provider),
    app: stringValue(nested.app) ?? stringValue(payload.app),
    type: stringValue(nested.type) ?? stringValue(nested.kind) ?? "external_record",
    name: stringValue(nested.name),
    title: stringValue(nested.title),
    subject: stringValue(nested.subject),
    summary: stringValue(nested.summary) ?? stringValue(nested.description),
    text: stringValue(nested.text) ?? stringValue(nested.body) ?? stringValue(nested.content) ?? JSON.stringify(redactExternalCachePayload(nested)),
    updatedAt: stringValue(nested.updatedAt) ?? stringValue(nested.updated_at) ?? stringValue(payload.updatedAt) ?? stringValue(payload.updated_at),
    syncMode: stringValue(nested.syncMode) ?? stringValue(nested.sync_mode) ?? stringValue(payload.syncMode) ?? stringValue(payload.sync_mode) ?? "cache",
  };
}

function redactExternalCacheValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redactExternalCacheValue(item, depth + 1));
  if (isPlainRecord(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = /token|secret|password|credential|api[_-]?key/i.test(key) ? "[redacted]" : redactExternalCacheValue(nestedValue, depth + 1);
    }
    return redacted;
  }
  return value;
}

function parseWebIngestedPayload(raw: string, extension: string): {
  url?: string;
  host?: string;
  title?: string;
  description?: string;
  text: string;
  updatedAt?: string;
  crawlScope?: string;
  contentType?: string;
} {
  if (extension === ".json") {
    try {
      const payload = JSON.parse(raw) as Record<string, unknown>;
      const html = stringValue(payload.html);
      const text = stringValue(payload.text) ?? stringValue(payload.content) ?? (html ? textFromHtml(html) : "");
      return {
        url: stringValue(payload.url),
        host: stringValue(payload.host),
        title: stringValue(payload.title),
        description: stringValue(payload.description) ?? stringValue(payload.summary),
        text,
        updatedAt: stringValue(payload.updatedAt) ?? stringValue(payload.updated_at),
        crawlScope: stringValue(payload.crawlScope) ?? stringValue(payload.crawl_scope),
        contentType: stringValue(payload.contentType) ?? stringValue(payload.content_type),
      };
    } catch {
      return { text: raw };
    }
  }
  if (extension === ".html" || extension === ".htm") {
    return {
      title: htmlTitle(raw),
      description: htmlMetaDescription(raw),
      text: textFromHtml(raw),
      contentType: "text/html",
    };
  }
  return { text: raw, contentType: extension === ".md" ? "text/markdown" : "text/plain" };
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
}

function htmlMetaDescription(html: string): string | undefined {
  return html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]?.trim()
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)?.[1]?.trim();
}

function titleFromWebText(text: string): string | undefined {
  const first = firstMeaningfulLine(text);
  return first?.replace(/^#+\s*/, "").slice(0, 120);
}

function urlFromWebCachePath(relativePath: string): string | undefined {
  const withoutExtension = relativePath.replace(/\.(html?|json|md|txt)$/i, "");
  return withoutExtension.startsWith("http:/") || withoutExtension.startsWith("https:/")
    ? withoutExtension.replace(/^https:\//, "https://").replace(/^http:\//, "http://")
    : undefined;
}

function hostFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function contentTypeForWebCacheExtension(extension: string): string {
  if (extension === ".html" || extension === ".htm") return "text/html";
  if (extension === ".json") return "application/json";
  if (extension === ".md") return "text/markdown";
  return "text/plain";
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readLocalTextFile(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.includes("\0") ? "" : content;
  } catch {
    return "";
  }
}

function firstMeaningfulLine(content: string): string | undefined {
  return content.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)?.slice(0, 180);
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function stableSearchId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
