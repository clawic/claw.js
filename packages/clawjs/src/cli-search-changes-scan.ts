import fs from "node:fs";
import path from "node:path";

import type { SearchIndexJob, SearchStore } from "@clawjs/search";

import { CLI_EXIT_FAILURE, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import type { SearchEventScheduleResult } from "./cli-search-events.ts";
import { isIgnoredCodeSearchDirectory, languageForCodeSearchExtension } from "./cli-search-code-symbols-source.ts";
import { runIncrementalFileSourceTick } from "./cli-search-incremental-files.ts";

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
  pending: boolean;
  frontierRemaining: number;
  generation: number;
  budgetExhausted: boolean;
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
  const store = input.openStore(input.flags);
  try {
    input.registerSources(store, input.flags);
    const tick = runIncrementalFileSourceTick({
      store,
      source: input.source,
      root,
      // Keep the change-scan checkpoint on shard: "changes" for Search inspectability.
      cursorShard: "changes",
      limits: { maxFiles, maxDepth, maxBytes },
      ignoreDirectory: (name) => isIgnoredSearchChangedDirectory(name),
      fileInfo: ({ extension, stat }) => searchChangedSourceFileInfo(input.source, extension, stat.size, maxBytes),
      onUpsert: ({ absolutePath }) => {
        const scheduled = input.scheduleChangedEvent({
          source: input.source,
          operation: "upsert",
          cwd: input.cwd,
          flags: { ...input.flags, root, path: absolutePath },
          positionals: ["search", "changes", "scan", "upsert", input.source, absolutePath],
        });
        if (!scheduled.ok) throw new CliHandledError("search_changes_scan_schedule_failed", scheduled.error ?? "Search changes scan could not schedule upsert.", CLI_EXIT_FAILURE);
        return scheduled.job ? { jobs: [scheduled.job] } : {};
      },
      onDelete: ({ relativePath }) => {
        const absolutePath = path.join(root, relativePath);
        const scheduled = input.scheduleChangedEvent({
          source: input.source,
          operation: "delete",
          cwd: input.cwd,
          flags: { ...input.flags, root, path: absolutePath },
          positionals: ["search", "changes", "scan", "delete", input.source, absolutePath],
        });
        if (!scheduled.ok) throw new CliHandledError("search_changes_scan_schedule_failed", scheduled.error ?? "Search changes scan could not schedule delete.", CLI_EXIT_FAILURE);
        return scheduled.job ? { jobs: [scheduled.job] } : {};
      },
    });
    store.setSourceState(input.source, "enabled", {
      backlog: tick.pending ? Math.max(1, tick.frontierRemaining) : 0,
      error: null,
      lastIndexedAt: new Date().toISOString(),
    });
    return {
      action: "scan",
      source: input.source,
      root,
      scanned: tick.scanned,
      scheduledUpserts: tick.scheduledUpserts,
      scheduledDeletes: tick.scheduledDeletes,
      jobs: tick.jobs,
      pending: tick.pending,
      frontierRemaining: tick.frontierRemaining,
      generation: tick.generation,
      budgetExhausted: tick.budgetExhausted,
      state: tick.state,
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

function searchChangedSourceFileInfo(source: string, extension: string, size: number, maxBytes: number): { indexable: boolean; kind: string; reason?: string } {
  if (source === "code.symbols") {
    const language = languageForCodeSearchExtension(extension);
    return {
      indexable: language !== null && size <= maxBytes,
      kind: language ?? "unsupported",
      reason: "code symbol file skipped during incremental Search scan",
    };
  }
  if (source === "web.ingested") {
    return {
      indexable: [".html", ".htm", ".json", ".md", ".txt"].includes(extension) && size <= maxBytes,
      kind: extension.replace(/^\./, "") || "file",
      reason: "web cache file skipped during incremental Search scan",
    };
  }
  if (source === "external.cache") {
    return {
      indexable: [".json", ".jsonl", ".md", ".txt"].includes(extension) && size <= maxBytes,
      kind: extension.replace(/^\./, "") || "file",
      reason: "external cache file skipped during incremental Search scan",
    };
  }
  return { indexable: true, kind: extension.replace(/^\./, "") || "file" };
}

function isIgnoredSearchChangedDirectory(name: string): boolean {
  return isIgnoredCodeSearchDirectory(name) || name === ".Spotlight-V100" || name === ".TemporaryItems" || name === ".Trashes";
}
