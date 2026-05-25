import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { isMacCareFilesystemNoiseDirectoryName } from "@clawjs/core";
import { LOCAL_TEXT_EMBEDDING_MODEL, createLocalTextEmbedding, type SearchDocumentInput, type SearchStore } from "@clawjs/search";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

export function resolveCodeSearchRoot(flags: Record<string, string>, cwd: string): string {
  return path.resolve(flags["code-root"] ?? flags.workspace ?? cwd);
}

export function discoverCodeSearchFiles(root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): CodeFileCandidate[] {
  const files: CodeFileCandidate[] = [];
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
        if (!isIgnoredCodeSearchDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const language = languageForCodeSearchExtension(extension);
      if (!language) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0 || stat.size > limits.maxBytes) continue;
      files.push({ absolutePath, extension, language, updatedAt: stat.mtime.toISOString() });
    }
  };
  visit(root, 0);
  return files;
}

export function ensureCodeSymbolResourceIndexed(store: SearchStore, flags: Record<string, string>, cwd: string, relativePath: string, rootOverride?: string): number {
  const root = rootOverride ? path.resolve(rootOverride) : resolveCodeSearchRoot(flags, cwd);
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(root, normalizedRelativePath);
  const relativeFromRoot = normalizeRelativePath(path.relative(root, absolutePath));
  if (relativeFromRoot.startsWith("../") || relativeFromRoot === ".." || path.isAbsolute(relativeFromRoot)) {
    store.tombstone({ source: "code.symbols", resourceId: normalizedRelativePath, reason: "code symbol path outside root during Search event refresh" });
    return 1;
  }
  const extension = path.extname(absolutePath).toLowerCase();
  const language = languageForCodeSearchExtension(extension);
  if (!language) {
    store.tombstone({ source: "code.symbols", resourceId: normalizedRelativePath, reason: "unsupported code symbol file during Search event refresh" });
    return 1;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    store.tombstone({ source: "code.symbols", resourceId: normalizedRelativePath, reason: "code symbol file missing during Search event refresh" });
    return 1;
  }
  if (!stat.isFile() || stat.size <= 0) {
    store.tombstone({ source: "code.symbols", resourceId: normalizedRelativePath, reason: "code symbol file not indexable during Search event refresh" });
    return 1;
  }
  const maxBytes = boundedNumberFlag(flags["code-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  if (stat.size > maxBytes) {
    store.tombstone({ source: "code.symbols", resourceId: normalizedRelativePath, reason: "code symbol file exceeds Search event byte limit" });
    return 1;
  }
  const document = codeFileSearchDocument(root, {
    absolutePath,
    extension,
    language,
    updatedAt: stat.mtime.toISOString(),
  });
  if (!document) {
    store.tombstone({ source: "code.symbols", resourceId: normalizedRelativePath, reason: "code symbol file could not be indexed during Search event refresh" });
    return 1;
  }
  upsertCodeFileSearchDocument(store, document);
  store.markFileInventoryIndexed({
    source: "code.symbols",
    root,
    relativePath: relativeFromRoot,
    checksum: typeof document.metadata?.contentChecksum === "string" ? document.metadata.contentChecksum : null,
  });
  store.setSourceState("code.symbols", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

export function upsertCodeFileSearchDocument(store: SearchStore, document: SearchDocumentInput): void {
  store.upsertDocument(document);
  const embedding = createLocalTextEmbedding([
    document.title,
    document.subtitle,
    document.snippet,
    document.body,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("\n"));
  store.upsertVector({
    documentId: document.id,
    model: LOCAL_TEXT_EMBEDDING_MODEL,
    embedding: embedding.vector,
    updatedAt: document.updatedAt,
  });
}

export function codeFileSearchDocument(root: string, file: CodeFileCandidate): SearchDocumentInput | null {
  let content: string;
  try {
    content = fs.readFileSync(file.absolutePath, "utf8");
  } catch {
    return null;
  }
  if (content.includes("\0")) return null;
  const contentChecksum = createHash("sha256").update(content).digest("hex");
  const relativePath = normalizeRelativePath(path.relative(root, file.absolutePath));
  const title = path.basename(file.absolutePath);
  const symbols = extractCodeSearchSymbols(content, file.language);
  const snippet = symbols[0]?.snippet ?? firstMeaningfulLine(content) ?? relativePath;
  const documentId = `code.symbols:${stableSearchId(`${root}\0${relativePath}`)}`;
  return {
    id: documentId,
    source: "code.symbols",
    domain: "code",
    type: file.language === "markdown" ? "doc" : "file",
    resourceId: relativePath,
    title,
    subtitle: relativePath,
    snippet,
    body: content.slice(0, 128 * 1024),
    path: file.absolutePath,
    updatedAt: file.updatedAt,
    metadata: {
      root,
      relativePath,
      extension: file.extension,
      language: file.language,
      symbolCount: symbols.length,
      contentChecksum,
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      fastPath: 1,
      code: file.language === "markdown" ? 0.6 : 1,
      symbolCount: Math.min(symbols.length, 20) / 20,
    },
    fragments: symbols.slice(0, 25).map((symbol, index) => ({
      id: `${documentId}:symbol:${index}`,
      title: symbol.title,
      body: symbol.body,
      snippet: symbol.snippet,
      sortOrder: index,
      metadata: { kind: symbol.kind, line: symbol.line },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open file", requiresApproval: true, risk: "read", grant: "search.code.open" },
      { id: "copy-reference", kind: "copy", label: "Copy file reference", requiresApproval: false },
    ],
  };
}

export function languageForCodeSearchExtension(extension: string): string | null {
  return ({
    ".cjs": "javascript",
    ".css": "css",
    ".go": "go",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".md": "markdown",
    ".mdx": "markdown",
    ".mjs": "javascript",
    ".py": "python",
    ".rs": "rust",
    ".scss": "scss",
    ".swift": "swift",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".yaml": "yaml",
    ".yml": "yaml",
  } as Record<string, string | undefined>)[extension] ?? null;
}

export function isIgnoredCodeSearchDirectory(name: string): boolean {
  return [
    ".git",
    ".hg",
    ".svn",
    ".codex",
    ".claw",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    ".dart_tool",
    ".build",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "vendor",
  ].includes(name) || isMacCareFilesystemNoiseDirectoryName(name);
}

function boundedNumberFlag(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const raw = value.trim();
  if (!/^\d+$/.test(raw)) throw invalidCodeSymbolLimit(value, min, max);
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw invalidCodeSymbolLimit(value, min, max);
  return number;
}

function invalidCodeSymbolLimit(value: string, min: number, max: number): CliHandledError {
  return new CliHandledError("invalid_code_symbol_limit", `--code-max-bytes must be a decimal integer between ${min} and ${max}, got ${value}.`, CLI_EXIT_USAGE, {
    location: "cli.search.codeSymbols.maxBytes",
    suggestion: `Pass a whole decimal byte limit such as --code-max-bytes ${Math.min(Math.max(256 * 1024, min), max)}.`,
    safeNextStep: "Rerun the Search code symbols indexing command with a valid --code-max-bytes value.",
    details: { flag: "code-max-bytes", value, min, max },
  });
}

function extractCodeSearchSymbols(content: string, language: string): CodeSearchSymbol[] {
  const symbols: CodeSearchSymbol[] = [];
  const lines = content.split(/\r?\n/);
  const patterns = symbolPatternsForLanguage(language);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    for (const pattern of patterns) {
      const match = pattern.regex.exec(trimmed);
      if (!match) continue;
      const name = match[1] ?? trimmed.replace(/^#+\s*/, "").slice(0, 80);
      symbols.push({
        kind: pattern.kind,
        title: `${pattern.kind} ${name}`.trim(),
        body: trimmed,
        snippet: trimmed.slice(0, 180),
        line: index + 1,
      });
      return;
    }
  });
  return symbols;
}

function symbolPatternsForLanguage(language: string): Array<{ kind: string; regex: RegExp }> {
  if (language === "markdown") return [{ kind: "heading", regex: /^#{1,6}\s+(.+)$/ }];
  if (language === "swift") return [
    { kind: "type", regex: /^(?:public\s+|private\s+|internal\s+|final\s+|open\s+)*(?:struct|class|enum|protocol|actor|extension)\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^(?:public\s+|private\s+|internal\s+|static\s+|mutating\s+|override\s+)*func\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  if (language === "python") return [
    { kind: "type", regex: /^class\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  if (language === "rust") return [
    { kind: "type", regex: /^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  if (language === "go") return [
    { kind: "type", regex: /^type\s+([A-Za-z_][A-Za-z0-9_]*)/ },
    { kind: "function", regex: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)/ },
  ];
  return [
    { kind: "function", regex: /^(?:export\s+)?default\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
    { kind: "type", regex: /^(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
    { kind: "function", regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)/ },
    { kind: "function", regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=>/ },
    { kind: "method", regex: /^(?!(?:if|for|while|switch|catch|return)\b)(?:(?:public|private|protected|static|async|override|readonly)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*(?::[^={]+)?\s*\{?$/ },
    { kind: "constant", regex: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=/ },
    { kind: "test", regex: /^(?:test|it|describe)\s*\(\s*["'`]([^"'`]+)["'`]/ },
  ];
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

interface CodeFileCandidate {
  absolutePath: string;
  extension: string;
  language: string;
  updatedAt: string;
}

interface CodeSearchSymbol {
  kind: string;
  title: string;
  body: string;
  snippet: string;
  line: number;
}
