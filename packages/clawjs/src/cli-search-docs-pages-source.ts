import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { LOCAL_TEXT_EMBEDDING_MODEL, createLocalTextEmbedding, type SearchDocumentInput, type SearchStore } from "@clawjs/search";

export function ensureDocsPagesSourceIndexed(store: SearchStore, cwd: string): number {
  const files = discoverDocsPageFiles(cwd);
  let indexed = 0;
  let watermark = "";
  for (const filePath of files) {
    const document = docsPageSearchDocument(cwd, filePath);
    if (!document) continue;
    upsertDocsPageSearchDocument(store, document);
    indexed += 1;
    const updatedAt = document.updatedAt ?? "";
    if (updatedAt > watermark) watermark = updatedAt;
  }
  store.setCursor({
    source: "docs.pages",
    cursor: `docs:${indexed}`,
    watermark: watermark || new Date(0).toISOString(),
    metadata: {
      root: "public-docs",
      files: indexed,
    },
  });
  store.setSourceState("docs.pages", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return indexed;
}

export function ensureDocsPageResourceIndexed(store: SearchStore, cwd: string, resourceId: string): number {
  const relativePath = normalizeRelativePath(resourceId);
  const absolutePath = path.resolve(cwd, relativePath);
  const relativeFromWorkspace = normalizeRelativePath(path.relative(cwd, absolutePath));
  if (!isDocsMarkdownResource(relativeFromWorkspace) || path.isAbsolute(relativeFromWorkspace) || relativeFromWorkspace.startsWith("../") || relativeFromWorkspace === "..") {
    store.tombstone({ source: "docs.pages", resourceId: relativePath, reason: "docs page outside public docs scope during Search event refresh" });
    return 1;
  }
  const document = fs.existsSync(absolutePath) ? docsPageSearchDocument(cwd, absolutePath) : null;
  if (!document) {
    store.tombstone({ source: "docs.pages", resourceId: relativePath, reason: "docs page missing during Search event refresh" });
    store.setSourceState("docs.pages", "enabled", {
      backlog: 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return 1;
  }
  upsertDocsPageSearchDocument(store, document);
  store.setSourceState("docs.pages", "enabled", {
    backlog: 0,
    error: null,
    lastIndexedAt: new Date().toISOString(),
  });
  return 1;
}

function upsertDocsPageSearchDocument(store: SearchStore, document: SearchDocumentInput): void {
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

function discoverDocsPageFiles(cwd: string): string[] {
  const files: string[] = [];
  for (const relativePath of ROOT_DOCS_PAGE_FILES) {
    const filePath = path.join(cwd, relativePath);
    if (fs.existsSync(filePath)) files.push(filePath);
  }
  const root = path.join(cwd, "docs");
  if (!fs.existsSync(root)) return files;
  const visit = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!isIgnoredDocsDirectory(entry.name)) visit(absolutePath);
        continue;
      }
      if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") files.push(absolutePath);
    }
  };
  visit(root);
  return files;
}

function docsPageSearchDocument(cwd: string, filePath: string): SearchDocumentInput | null {
  let stat: fs.Stats;
  let content: string;
  try {
    stat = fs.statSync(filePath);
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  if (!stat.isFile() || content.includes("\0")) return null;
  const relativePath = normalizeRelativePath(path.relative(cwd, filePath));
  if (!isDocsMarkdownResource(relativePath)) return null;
  const frontmatter = extractMarkdownFrontmatter(content);
  const headings = extractMarkdownHeadings(frontmatter.content, frontmatter.lineOffset);
  const kind = relativePath.startsWith("docs/adr/") ? "adr" : "doc";
  const pathParts = relativePath.split("/");
  const category = kind === "adr" ? "adr" : relativePath.startsWith("docs/") ? pathParts.length > 2 ? pathParts[1] ?? "docs" : "docs" : "root";
  const title = frontmatter.fields.title ?? headings[0]?.title ?? path.basename(filePath, ".md");
  const snippet = frontmatter.fields.description ?? firstMeaningfulMarkdownLine(frontmatter.content) ?? relativePath;
  const documentId = `docs.pages:${stableSearchId(relativePath)}`;
  return {
    id: documentId,
    source: "docs.pages",
    domain: "docs",
    type: kind,
    resourceId: relativePath,
    title,
    subtitle: relativePath,
    snippet,
    body: [
      frontmatter.fields.title,
      frontmatter.fields.description,
      frontmatter.content,
    ].filter(Boolean).join("\n").slice(0, 96 * 1024),
    path: filePath,
    updatedAt: stat.mtime.toISOString(),
    metadata: {
      kind,
      category,
      path: relativePath,
      relativePath,
      headingCount: headings.length,
      ...(frontmatter.fields.title ? { frontmatterTitle: frontmatter.fields.title } : {}),
      ...(frontmatter.fields.description ? { frontmatterDescription: frontmatter.fields.description } : {}),
    },
    permissions: { canOpen: true, canPreview: true, redacted: false },
    rankingHints: {
      docs: 1,
      adr: kind === "adr" ? 1 : 0,
      technical: 0.5,
    },
    fragments: headings.slice(0, 24).map((heading, index) => ({
      id: `${documentId}:section:${index}`,
      title: heading.title,
      body: heading.body,
      snippet: heading.snippet,
      sortOrder: index,
      metadata: {
        kind: "section",
        level: heading.level,
        line: heading.line,
      },
    })),
    actions: [
      { id: "open", kind: "open", label: "Open doc", requiresApproval: false, risk: "read" },
      { id: "copy-reference", kind: "copy", label: "Copy doc reference", requiresApproval: false },
    ],
  };
}

function extractMarkdownHeadings(content: string, lineOffset = 0): MarkdownHeading[] {
  const lines = content.split(/\r?\n/);
  const headings: MarkdownHeading[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,3})\s+(.+)$/.exec(lines[index]?.trim() ?? "");
    if (!match) continue;
    const bodyLines: string[] = [];
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      if (/^#{1,3}\s+/.test(lines[bodyIndex]?.trim() ?? "")) break;
      const line = lines[bodyIndex]?.trim();
      if (line) bodyLines.push(line);
      if (bodyLines.join("\n").length > 4000) break;
    }
    const body = bodyLines.join("\n").slice(0, 4096);
    headings.push({
      title: match[2]?.trim() ?? "Section",
      level: match[1]?.length ?? 1,
      line: index + 1 + lineOffset,
      body,
      snippet: firstMeaningfulMarkdownLine(body) ?? match[2]?.trim() ?? "Section",
    });
  }
  return headings;
}

function extractMarkdownFrontmatter(content: string): MarkdownFrontmatter {
  const lines = content.split(/\r?\n/);
  if ((lines[0]?.trim() ?? "") !== "---") return { fields: {}, content, lineOffset: 0 };
  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closeIndex <= 0) return { fields: {}, content, lineOffset: 0 };
  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, closeIndex)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const key = match[1]?.trim();
    const value = stripYamlScalarQuotes(match[2]?.trim() ?? "");
    if (key && value) fields[key] = value;
  }
  return {
    fields,
    content: lines.slice(closeIndex + 1).join("\n"),
    lineOffset: closeIndex + 1,
  };
}

function stripYamlScalarQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function firstMeaningfulMarkdownLine(content: string): string | null {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---" || trimmed.startsWith("```")) continue;
    return trimmed.replace(/^[*-]\s+/, "").slice(0, 240);
  }
  return null;
}

function isDocsMarkdownResource(relativePath: string): boolean {
  return (relativePath.startsWith("docs/") || ROOT_DOCS_PAGE_FILES.has(relativePath)) && path.extname(relativePath).toLowerCase() === ".md";
}

function isIgnoredDocsDirectory(name: string): boolean {
  return [".git", ".next", ".nuxt", ".turbo", ".cache", ".build", "build", "dist", "node_modules"].includes(name);
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/").replace(/^\.\/+/, "");
}

function stableSearchId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
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

interface MarkdownHeading {
  title: string;
  level: number;
  line: number;
  body: string;
  snippet: string;
}

interface MarkdownFrontmatter {
  fields: Record<string, string>;
  content: string;
  lineOffset: number;
}
