import fs from "node:fs";
import path from "node:path";

import type { SearchIndexJob, SearchStore } from "@clawjs/search";

import { CLI_EXIT_FAILURE, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import type { SearchEventScheduleResult } from "./cli-search-events.ts";
import { isIgnoredCodeSearchDirectory, languageForCodeSearchExtension } from "./cli-search-code-symbols-source.ts";

interface SearchChangedFileEntry {
  absolutePath: string;
  relativePath: string;
  signature: string;
}

interface SearchChangedScanDependencies {
  boundedNumberFlag: (value: string | undefined, fallback: number, min: number, max: number) => number;
  expandSearchPath: (value: string) => string;
  openStore: (flags: Record<string, string>) => SearchStore;
  registerSources: (store: SearchStore, flags: Record<string, string>) => void;
  scheduleChangedEvent: (input: {
    source: string;
    operation: "upsert" | "delete";
    cwd: string;
    flags: Record<string, string>;
    positionals: string[];
  }) => SearchEventScheduleResult;
  stableSearchId: (value: string) => string;
}

export function scanSearchChangedSourceFiles(input: {
  source: string;
  cwd: string;
  flags: Record<string, string>;
} & SearchChangedScanDependencies): {
  action: "scan";
  source: string;
  root: string;
  scanned: number;
  scheduledUpserts: number;
  scheduledDeletes: number;
  jobs: SearchIndexJob[];
  state: "ready" | "empty";
} {
  if (!["code.symbols", "local.files", "web.ingested", "external.cache"].includes(input.source)) {
    throw new CliHandledError("search_changes_scan_unsupported", "search changes scan supports code.symbols, local.files, web.ingested, and external.cache.", CLI_EXIT_USAGE);
  }
  const root = resolveSearchChangedScanRoot(input.source, input.flags, input.cwd, input.expandSearchPath);
  if (!fs.existsSync(root)) {
    throw new CliHandledError("search_changes_scan_root_missing", `Search changes scan root does not exist: ${root}`, CLI_EXIT_USAGE);
  }
  const maxFiles = input.boundedNumberFlag(input.flags.limit ?? input.flags["scan-limit"] ?? input.flags["code-limit"] ?? input.flags["file-limit"] ?? input.flags["web-limit"] ?? input.flags["external-limit"], 500, 1, 20000);
  const maxDepth = input.boundedNumberFlag(input.flags["max-depth"] ?? input.flags["scan-max-depth"] ?? input.flags["code-max-depth"] ?? input.flags["file-max-depth"] ?? input.flags["web-max-depth"] ?? input.flags["external-max-depth"], 8, 1, 32);
  const maxBytes = input.boundedNumberFlag(input.flags["max-bytes"] ?? input.flags["scan-max-bytes"] ?? input.flags["code-max-bytes"] ?? input.flags["file-max-bytes"] ?? input.flags["web-max-bytes"] ?? input.flags["external-max-bytes"], 256 * 1024, 1024, 2 * 1024 * 1024);
  const files = discoverSearchChangedSourceFiles(input.source, root, { maxFiles, maxDepth, maxBytes });
  const currentEntries = new Map(files.map((file) => [file.relativePath, file]));
  const store = input.openStore(input.flags);
  try {
    input.registerSources(store, input.flags);
    const previousEntries = readSearchChangedSnapshot(store, input.source, root);
    const jobs: SearchIndexJob[] = [];
    for (const file of currentEntries.values()) {
      const previous = previousEntries.get(file.relativePath);
      if (previous?.signature === file.signature) continue;
      const scheduled = input.scheduleChangedEvent({
        source: input.source,
        operation: "upsert",
        cwd: input.cwd,
        flags: input.flags,
        positionals: ["search", "changes", "scan", "upsert", input.source, file.absolutePath],
      });
      if (!scheduled.ok) throw new CliHandledError("search_changes_scan_schedule_failed", scheduled.error ?? "Search changes scan could not schedule upsert.", CLI_EXIT_FAILURE);
      if (scheduled.job) jobs.push(scheduled.job);
    }
    for (const previous of previousEntries.values()) {
      if (currentEntries.has(previous.relativePath)) continue;
      const scheduled = input.scheduleChangedEvent({
        source: input.source,
        operation: "delete",
        cwd: input.cwd,
        flags: input.flags,
        positionals: ["search", "changes", "scan", "delete", input.source, path.join(root, previous.relativePath)],
      });
      if (!scheduled.ok) throw new CliHandledError("search_changes_scan_schedule_failed", scheduled.error ?? "Search changes scan could not schedule delete.", CLI_EXIT_FAILURE);
      if (scheduled.job) jobs.push(scheduled.job);
    }
    store.setCursor({
      source: input.source,
      shard: "changes",
      cursor: `root:${input.stableSearchId(root)}:files:${files.length}`,
      watermark: new Date().toISOString(),
      metadata: { root, maxFiles, maxDepth, maxBytes, entries: files.map((file) => ({ relativePath: file.relativePath, signature: file.signature })) },
    });
    return {
      action: "scan",
      source: input.source,
      root,
      scanned: files.length,
      scheduledUpserts: jobs.filter((job) => job.operation === "upsert").length,
      scheduledDeletes: jobs.filter((job) => job.operation === "delete").length,
      jobs,
      state: jobs.length ? "ready" : "empty",
    };
  } finally {
    store.close();
  }
}

function resolveSearchChangedScanRoot(source: string, flags: Record<string, string>, cwd: string, expandSearchPath: (value: string) => string): string {
  const explicit = flags.root;
  if (source === "code.symbols") return path.resolve(cwd, expandSearchPath(explicit ?? flags["code-root"] ?? flags.workspace ?? cwd));
  if (source === "local.files") return path.resolve(cwd, expandSearchPath(explicit ?? flags["file-root"] ?? flags["local-files-root"] ?? flags.workspace ?? cwd));
  if (source === "web.ingested") return path.resolve(cwd, expandSearchPath(explicit ?? flags["web-root"] ?? flags["web-cache-root"] ?? flags.workspace ?? cwd));
  if (source === "external.cache") return path.resolve(cwd, expandSearchPath(explicit ?? flags["external-root"] ?? flags["external-cache-root"] ?? flags.workspace ?? cwd));
  return path.resolve(cwd, expandSearchPath(explicit ?? flags.workspace ?? cwd));
}

function discoverSearchChangedSourceFiles(source: string, root: string, limits: { maxFiles: number; maxDepth: number; maxBytes: number }): SearchChangedFileEntry[] {
  const files: SearchChangedFileEntry[] = [];
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
        if (!isIgnoredSearchChangedDirectory(entry.name)) visit(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (!searchChangedSourceAcceptsExtension(source, extension)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (!stat.isFile() || stat.size <= 0) continue;
      if ((source === "code.symbols" || source === "web.ingested" || source === "external.cache") && stat.size > limits.maxBytes) continue;
      const relativePath = normalizeSearchChangedRelativePath(path.relative(root, absolutePath));
      files.push({ absolutePath, relativePath, signature: `${Math.trunc(stat.mtimeMs)}:${stat.size}` });
    }
  };
  visit(root, 0);
  return files;
}

function readSearchChangedSnapshot(store: SearchStore, source: string, root: string): Map<string, SearchChangedFileEntry> {
  const cursor = store.getCursor(source, "changes");
  if (cursor?.metadata.root !== root || !Array.isArray(cursor.metadata.entries)) return new Map();
  const entries = new Map<string, SearchChangedFileEntry>();
  for (const entry of cursor.metadata.entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { relativePath?: unknown; signature?: unknown };
    if (typeof record.relativePath !== "string" || typeof record.signature !== "string") continue;
    entries.set(record.relativePath, { relativePath: record.relativePath, signature: record.signature, absolutePath: path.join(root, record.relativePath) });
  }
  return entries;
}

function searchChangedSourceAcceptsExtension(source: string, extension: string): boolean {
  if (source === "code.symbols") return languageForCodeSearchExtension(extension) !== null;
  if (source === "web.ingested") return [".html", ".htm", ".json", ".md", ".txt"].includes(extension);
  if (source === "external.cache") return [".json", ".jsonl", ".md", ".txt"].includes(extension);
  return true;
}

function isIgnoredSearchChangedDirectory(name: string): boolean {
  return isIgnoredCodeSearchDirectory(name) || name === ".Spotlight-V100" || name === ".TemporaryItems" || name === ".Trashes";
}

function normalizeSearchChangedRelativePath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}
