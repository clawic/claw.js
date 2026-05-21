import fs from "node:fs";
import path from "node:path";

import type { SearchFileInventoryEntry, SearchIndexJob, SearchStore } from "@clawjs/search";

export interface IncrementalFileSourceTickInput {
  store: SearchStore;
  source: string;
  root: string;
  cursorShard?: string;
  limits: {
    maxFiles: number;
    maxDepth: number;
    maxBytes: number;
  };
  ignoreDirectory?: (name: string, absolutePath: string) => boolean;
  fileInfo: (input: { absolutePath: string; relativePath: string; extension: string; stat: fs.Stats }) => IncrementalFileSourceInfo;
  onUpsert: (input: IncrementalFileSourceChange) => IncrementalFileSourceEffect | void;
  onDelete: (input: IncrementalFileSourceDelete) => IncrementalFileSourceEffect | void;
}

export interface IncrementalFileSourceInfo {
  indexable: boolean;
  kind: string;
  reason?: string;
}

export interface IncrementalFileSourceChange {
  source: string;
  root: string;
  absolutePath: string;
  relativePath: string;
  extension: string;
  kind: string;
  stat: fs.Stats;
  previous: SearchFileInventoryEntry | null;
}

export interface IncrementalFileSourceDelete {
  source: string;
  root: string;
  relativePath: string;
  reason: string;
  previous: SearchFileInventoryEntry | null;
}

export interface IncrementalFileSourceEffect {
  indexed?: number;
  jobs?: SearchIndexJob[];
}

export interface IncrementalFileSourceTickResult {
  source: string;
  root: string;
  generation: number;
  scanned: number;
  indexed: number;
  scheduledUpserts: number;
  scheduledDeletes: number;
  jobs: SearchIndexJob[];
  pending: boolean;
  frontierRemaining: number;
  budgetExhausted: boolean;
  state: "ready" | "empty";
}

interface FrontierItem {
  relativePath: string;
  offset: number;
}

interface IncrementalCursorMetadata {
  root?: unknown;
  generation?: unknown;
  pending?: unknown;
  pendingDeletes?: unknown;
  frontier?: unknown;
}

export function runIncrementalFileSourceTick(input: IncrementalFileSourceTickInput): IncrementalFileSourceTickResult {
  const root = path.resolve(input.root);
  const cursorShard = input.cursorShard ?? "default";
  const cursor = input.store.getCursor(input.source, cursorShard);
  const cursorMetadata = (cursor?.metadata ?? {}) as IncrementalCursorMetadata;
  const continuesPreviousScan = cursorMetadata.root === root && cursorMetadata.pending === true;
  const generation = continuesPreviousScan && typeof cursorMetadata.generation === "number"
    ? cursorMetadata.generation
    : (typeof cursorMetadata.generation === "number" ? cursorMetadata.generation + 1 : 1);
  const frontier = continuesPreviousScan
    ? normalizeFrontier(cursorMetadata.frontier)
    : [{ relativePath: ".", offset: 0 }];
  let pendingDeletes = continuesPreviousScan && cursorMetadata.pendingDeletes === true;
  let scanned = 0;
  let indexed = 0;
  let scheduledUpserts = 0;
  let scheduledDeletes = 0;
  const jobs: SearchIndexJob[] = [];
  let budgetExhausted = false;

  if (!pendingDeletes) {
    while (frontier.length > 0) {
      const current = frontier.shift() as FrontierItem;
      const absoluteDirectory = current.relativePath === "." ? root : path.join(root, current.relativePath);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
      } catch {
        continue;
      }
      for (let index = current.offset; index < entries.length; index += 1) {
        const entry = entries[index] as fs.Dirent;
        const absolutePath = path.join(absoluteDirectory, entry.name);
        const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
        if (entry.isDirectory()) {
          if (!input.ignoreDirectory?.(entry.name, absolutePath) && !isPastMaxDepth(relativePath, input.limits.maxDepth)) {
            frontier.push({ relativePath, offset: 0 });
          }
          continue;
        }
        if (!entry.isFile()) continue;
        if (scanned >= input.limits.maxFiles) {
          frontier.unshift({ relativePath: current.relativePath, offset: index });
          budgetExhausted = true;
          break;
        }
        scanned += 1;
        processFile(input, root, generation, absolutePath, relativePath, (effect, operation) => {
          indexed += effect.indexed ?? 0;
          if (effect.jobs?.length) jobs.push(...effect.jobs);
          if (operation === "upsert") scheduledUpserts += effect.jobs?.length ?? 0;
          if (operation === "delete") scheduledDeletes += effect.jobs?.length ?? 0;
        });
      }
      if (budgetExhausted) break;
    }
  }

  if (frontier.length === 0) {
    const remainingDeleteBudget = Math.max(0, input.limits.maxFiles - scanned);
    if (remainingDeleteBudget === 0) {
      pendingDeletes = true;
      budgetExhausted = true;
    } else {
      const staleEntries = input.store.staleFileInventoryEntries({
        source: input.source,
        root,
        generation,
        limit: remainingDeleteBudget,
      });
      for (const stale of staleEntries) {
        const effect = input.onDelete({
          source: input.source,
          root,
          relativePath: stale.relativePath,
          reason: "file missing during incremental Search scan",
          previous: stale,
        }) ?? {};
        indexed += effect.indexed ?? 0;
        if (effect.jobs?.length) {
          scheduledDeletes += effect.jobs.length;
          jobs.push(...effect.jobs);
        }
        input.store.markFileInventoryDeleted({
          source: input.source,
          root,
          relativePath: stale.relativePath,
          generation,
        });
      }
      pendingDeletes = staleEntries.length >= remainingDeleteBudget;
      budgetExhausted = budgetExhausted || pendingDeletes;
    }
  }

  const pending = frontier.length > 0 || pendingDeletes;
  input.store.setCursor({
    source: input.source,
    shard: cursorShard,
    cursor: `root:${stableRootId(root)}:generation:${generation}:scanned:${scanned}`,
    watermark: new Date().toISOString(),
    metadata: {
      root,
      generation,
      pending,
      pendingDeletes,
      frontier: frontier.slice(0, 2048),
      maxFiles: input.limits.maxFiles,
      maxDepth: input.limits.maxDepth,
      maxBytes: input.limits.maxBytes,
    },
  });
  return {
    source: input.source,
    root,
    generation,
    scanned,
    indexed,
    scheduledUpserts,
    scheduledDeletes,
    jobs,
    pending,
    frontierRemaining: frontier.length,
    budgetExhausted,
    state: jobs.length || indexed > 0 ? "ready" : "empty",
  };
}

function processFile(
  input: IncrementalFileSourceTickInput,
  root: string,
  generation: number,
  absolutePath: string,
  relativePath: string,
  recordEffect: (effect: IncrementalFileSourceEffect, operation: "upsert" | "delete") => void,
): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return;
  }
  if (!stat.isFile()) return;
  const extension = path.extname(absolutePath).toLowerCase();
  const info = stat.size > 0
    ? input.fileInfo({ absolutePath, relativePath, extension, stat })
    : { indexable: false, kind: "empty", reason: "empty file" };
  const previous = input.store.fileInventoryEntry(input.source, root, relativePath);
  const entry = input.store.upsertFileInventoryEntry({
    source: input.source,
    root,
    relativePath,
    dev: stat.dev,
    ino: stat.ino,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    extension,
    kind: info.kind,
    lastSeenGeneration: generation,
    state: info.indexable ? "active" : "skipped",
  });
  if (!info.indexable) {
    if (previous?.state === "active") {
      const effect = input.onDelete({
        source: input.source,
        root,
        relativePath,
        reason: info.reason ?? "file skipped during incremental Search scan",
        previous,
      }) ?? {};
      recordEffect(effect, "delete");
    }
    return;
  }
  if (!fileInventoryChanged(previous, entry)) return;
  const effect = input.onUpsert({
    source: input.source,
    root,
    absolutePath,
    relativePath,
    extension,
    kind: info.kind,
    stat,
    previous,
  }) ?? {};
  recordEffect(effect, "upsert");
}

function fileInventoryChanged(previous: SearchFileInventoryEntry | null, current: SearchFileInventoryEntry): boolean {
  if (!previous || previous.state !== "active") return true;
  if (previous.size !== current.size || previous.mtimeMs !== current.mtimeMs) return true;
  if (previous.dev && current.dev && previous.dev !== current.dev) return true;
  if (previous.ino && current.ino && previous.ino !== current.ino) return true;
  return false;
}

function normalizeFrontier(value: unknown): FrontierItem[] {
  if (!Array.isArray(value)) return [{ relativePath: ".", offset: 0 }];
  return value.flatMap((item): FrontierItem[] => {
    if (typeof item === "string") return [{ relativePath: item || ".", offset: 0 }];
    if (!item || typeof item !== "object") return [];
    const record = item as { relativePath?: unknown; path?: unknown; offset?: unknown };
    const relativePath = typeof record.relativePath === "string"
      ? record.relativePath
      : typeof record.path === "string"
        ? record.path
        : ".";
    const offset = typeof record.offset === "number" && Number.isFinite(record.offset)
      ? Math.max(0, Math.floor(record.offset))
      : 0;
    return [{ relativePath: relativePath || ".", offset }];
  });
}

function isPastMaxDepth(relativePath: string, maxDepth: number): boolean {
  if (relativePath === ".") return false;
  return relativePath.split(path.posix.sep).filter(Boolean).length > maxDepth;
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

function stableRootId(root: string): string {
  let hash = 0;
  for (let index = 0; index < root.length; index += 1) hash = ((hash << 5) - hash + root.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}
