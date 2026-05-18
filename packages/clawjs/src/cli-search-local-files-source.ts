import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { SearchDocumentInput, SearchStore } from "@clawjs/search";

import { isIgnoredCodeSearchDirectory, languageForCodeSearchExtension } from "./cli-search-code-symbols-source.ts";

export function ensureLocalFilesSourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string): number {
  const root = resolveLocalFilesSearchRoot(flags, cwd);
  if (!fs.existsSync(root)) {
    store.setSourceState("local.files", "degraded", {
      backlog: 0,
      error: `local files root does not exist: ${root}`,
      lastIndexedAt: new Date().toISOString(),
    });
    return 0;
  }
  const maxFiles = boundedNumberFlag(flags["file-limit"] ?? flags["local-files-limit"], 500, 1, 20000);
  const maxDepth = boundedNumberFlag(flags["file-max-depth"] ?? flags["local-files-max-depth"], 8, 1, 32);
  const maxBytes = boundedNumberFlag(flags["file-max-bytes"] ?? flags["local-files-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const files = discoverLocalSearchFiles(root, { maxFiles, maxDepth });
  let indexed = 0;
  for (const file of files) {
    const document = localFileSearchDocument(root, file, maxBytes);
    if (!document) continue;
    store.upsertDocument(document);
    indexed += 1;
  }
  store.setCursor({
    source: "local.files",
    cursor: `root:${stableSearchId(root)}:files:${indexed}`,
    metadata: { root, maxFiles, maxDepth, maxBytes },
  });
  store.setSourceState("local.files", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureLocalFileResourceIndexed(
  store: SearchStore,
  flags: Record<string, string>,
  cwd: string,
  relativePath: string,
  rootOverride?: string,
): number {
  const root = path.resolve(rootOverride ?? resolveLocalFilesSearchRoot(flags, cwd));
  const absolutePath = path.resolve(root, relativePath);
  const relativeFromRoot = normalizeRelativePath(path.relative(root, absolutePath));
  if (relativeFromRoot === ".." || relativeFromRoot.startsWith("../") || path.isAbsolute(relativeFromRoot)) {
    store.tombstone({ source: "local.files", resourceId: relativePath, reason: "local file outside root during Search event refresh" });
    return 1;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    store.tombstone({ source: "local.files", resourceId: relativeFromRoot, reason: "local file missing during Search event refresh" });
    return 1;
  }
  if (!stat.isFile() || stat.size <= 0) {
    store.tombstone({ source: "local.files", resourceId: relativeFromRoot, reason: "local file skipped during Search event refresh" });
    return 1;
  }
  const maxBytes = boundedNumberFlag(flags["file-max-bytes"] ?? flags["local-files-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const extension = path.extname(absolutePath).toLowerCase();
  const document = localFileSearchDocument(root, {
    absolutePath,
    extension,
    kind: localFileKind(extension),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  }, maxBytes);
  if (!document) {
    store.tombstone({ source: "local.files", resourceId: relativeFromRoot, reason: "local file skipped during Search event refresh" });
    return 1;
  }
  store.upsertDocument(document);
  store.setSourceState("local.files", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function resolveLocalFilesSearchRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["file-root"] ?? flags["local-files-root"] ?? flags.workspace ?? cwd);
}

function discoverLocalSearchFiles(root: string, limits: { maxFiles: number; maxDepth: number }): LocalFileCandidate[] {
  const files: LocalFileCandidate[] = [];
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
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0) continue;
      const extension = path.extname(entry.name).toLowerCase();
      files.push({ absolutePath, extension, kind: localFileKind(extension), size: stat.size, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

function isIgnoredLocalFilesDirectory(name: string): boolean {
  return isIgnoredCodeSearchDirectory(name) || name === ".Spotlight-V100" || name === ".TemporaryItems" || name === ".Trashes";
}

function localFileKind(extension: string): string {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".svg"].includes(extension)) return "image";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac"].includes(extension)) return "audio";
  if ([".mp4", ".mov", ".m4v", ".webm"].includes(extension)) return "video";
  if ([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pages", ".numbers", ".key"].includes(extension)) return "document";
  if (localFileTextExtension(extension)) return "text";
  return "file";
}

function localFileTextExtension(extension: string): boolean {
  return [
    ".csv",
    ".html",
    ".json",
    ".log",
    ".md",
    ".mdx",
    ".rtf",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
  ].includes(extension) || languageForCodeSearchExtension(extension) !== null;
}

function localFileSearchDocument(root: string, file: LocalFileCandidate, maxBytes: number): SearchDocumentInput | null {
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const title = path.basename(file.absolutePath);
  const canReadContent = localFileTextExtension(file.extension) && file.size <= maxBytes;
  const content = canReadContent ? readLocalTextFile(file.absolutePath) : "";
  const snippet = firstMeaningfulLine(content) ?? relativePath;
  const documentId = `local.files:${stableSearchId(`${root}\0${relativePath}`)}`;
  return {
    id: documentId,
    source: "local.files",
    domain: "files",
    type: "file",
    resourceId: relativePath,
    title,
    subtitle: relativePath,
    snippet,
    body: [
      title,
      relativePath,
      file.extension,
      content,
    ].filter(Boolean).join("\n").slice(0, maxBytes),
    path: file.absolutePath,
    updatedAt: file.updatedAt,
    metadata: {
      root,
      relativePath,
      extension: file.extension,
      kind: file.kind,
      size: file.size,
      indexedContent: Boolean(content),
    },
    permissions: { canOpen: true, canPreview: Boolean(content), redacted: false },
    rankingHints: {
      localFile: 1,
      fastPath: file.kind === "text" || file.kind === "document" ? 0.5 : 0.2,
    },
    fragments: localFileSearchFragments(documentId, content, file.extension, maxBytes),
    actions: [
      { id: "open", kind: "open", label: "Open file", requiresApproval: true, risk: "read", grant: "search.files.open" },
      { id: "copy-reference", kind: "copy", label: "Copy file reference", requiresApproval: false },
    ],
  };
}

function localFileSearchFragments(documentId: string, content: string, extension: string, maxBytes: number): NonNullable<SearchDocumentInput["fragments"]> {
  if (!content) return [];
  if (extension === ".md" || extension === ".mdx") {
    const sections = extractMarkdownSections(content);
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
  }
  const snippet = firstMeaningfulLine(content) ?? "Content";
  return [{
    id: `${documentId}:content`,
    title: "Content",
    body: content.slice(0, maxBytes),
    snippet,
    sortOrder: 0,
    metadata: { kind: "content" },
  }];
}

function extractMarkdownSections(content: string): LocalMarkdownSection[] {
  const lines = content.split(/\r?\n/);
  const sections: LocalMarkdownSection[] = [];
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

function boundedNumberFlag(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = value ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
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

interface LocalFileCandidate {
  absolutePath: string;
  extension: string;
  kind: string;
  size: number;
  updatedAt: string;
}

interface LocalMarkdownSection {
  title: string;
  level: number;
  line: number;
  body: string;
  snippet: string;
}
