import path from "path";

import {
  guidanceStateSchema,
  type ActorKind,
  type GuidanceHint,
  type GuidanceInput,
  type GuidanceMatchInput,
  type GuidanceMatchResult,
  type GuidanceRecord,
  type GuidanceState,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { expandHome, resolveClawGlobalSurfacePath } from "../surface-paths.ts";

export const GUIDANCE_STATE_FILE = "guidance.json";

export interface GuidanceStoreOptions {
  rootDir?: string;
  filesystem?: NodeFileSystemHost;
  env?: NodeJS.ProcessEnv;
}

export function resolveGuidanceRoot(options: GuidanceStoreOptions = {}): string {
  const configured = options.rootDir?.trim()
    || options.env?.CLAW_GUIDANCE_DIR?.trim()
    || process.env.CLAW_GUIDANCE_DIR?.trim();
  if (configured) return expandHome(configured);
  return resolveClawGlobalSurfacePath("claw.global.guidance", options.env);
}

export class LocalGuidanceStore {
  readonly rootDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: GuidanceStoreOptions = {}) {
    this.rootDir = resolveGuidanceRoot(options);
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  statePath(): string {
    return path.join(this.rootDir, GUIDANCE_STATE_FILE);
  }

  readState(): GuidanceState {
    if (!this.filesystem.exists(this.statePath())) {
      return { schemaVersion: 1, records: [], updatedAt: nowIso() };
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(this.filesystem.readText(this.statePath())) as unknown;
    } catch (error) {
      throw new Error(`Invalid guidance state JSON at ${this.statePath()}: ${(error as Error).message}`);
    }
    const parsed = guidanceStateSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(`Invalid guidance state record at ${this.statePath()}: ${parsed.error.message}`);
    }
    return parsed.data as GuidanceState;
  }

  writeState(state: GuidanceState): GuidanceState {
    const next: GuidanceState = {
      schemaVersion: 1,
      records: [...state.records].sort((left, right) => left.id.localeCompare(right.id)),
      updatedAt: nowIso(),
    };
    this.filesystem.ensureDir(this.rootDir);
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath()), () => {
      this.filesystem.writeTextAtomic(this.statePath(), `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  status() {
    const state = this.readState();
    return {
      rootDir: this.rootDir,
      records: state.records.length,
      active: state.records.filter((record) => record.status === "active").length,
      archived: state.records.filter((record) => record.status === "archived").length,
      updatedAt: state.updatedAt,
    };
  }

  list(options: { status?: GuidanceRecord["status"] } = {}): GuidanceRecord[] {
    return this.readState().records
      .filter((record) => !options.status || record.status === options.status)
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }

  get(id: string): GuidanceRecord | null {
    return this.readState().records.find((record) => record.id === normalizeGuidanceId(id)) ?? null;
  }

  create(input: GuidanceInput): GuidanceRecord {
    const state = this.readState();
    const now = nowIso();
    const id = normalizeGuidanceId(input.id ?? input.title);
    const current = state.records.find((record) => record.id === id);
    const record: GuidanceRecord = {
      schemaVersion: 1,
      id,
      status: "active",
      title: input.title,
      capsule: input.capsule,
      ...(input.details ? { details: input.details } : {}),
      severity: input.severity ?? current?.severity ?? "notice",
      priority: input.priority ?? current?.priority ?? 100,
      applyWhen: input.applyWhen ?? current?.applyWhen ?? {},
      resourceIds: unique(input.resourceIds ?? current?.resourceIds ?? []),
      commands: unique(input.commands ?? current?.commands ?? [`claw guidance show ${id}`]),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    this.writeState({
      ...state,
      records: [...state.records.filter((entry) => entry.id !== id), record],
    });
    return record;
  }

  archive(id: string): GuidanceRecord {
    const state = this.readState();
    const record = state.records.find((entry) => entry.id === normalizeGuidanceId(id));
    if (!record) throw new Error(`Guidance not found: ${id}`);
    const next: GuidanceRecord = {
      ...record,
      status: "archived",
      updatedAt: nowIso(),
      archivedAt: nowIso(),
    };
    this.writeState({ ...state, records: state.records.map((entry) => entry.id === record.id ? next : entry) });
    return next;
  }

  match(input: GuidanceMatchInput): GuidanceMatchResult {
    const hints = this.list({ status: "active" })
      .map((record) => matchRecord(record, input))
      .filter((hint): hint is GuidanceHint => Boolean(hint))
      .slice(0, Math.max(0, input.limit ?? 5));
    return { input, hints };
  }
}

export function createLocalGuidanceStore(options: GuidanceStoreOptions = {}): LocalGuidanceStore {
  return new LocalGuidanceStore(options);
}

function matchRecord(record: GuidanceRecord, input: GuidanceMatchInput): GuidanceHint | null {
  const reasons: string[] = [];
  const conditions = record.applyWhen ?? {};
  if (conditions.commands?.length && !matchOne(input.command, conditions.commands)) return null;
  if (conditions.commands?.length) reasons.push("command match");
  if (conditions.flags?.length && !intersects(input.flags, conditions.flags)) return null;
  if (conditions.flags?.length) reasons.push("flag match");
  if (conditions.argIncludes?.length && !containsAny(input.args, conditions.argIncludes)) return null;
  if (conditions.argIncludes?.length) reasons.push("argument match");
  if (conditions.cwdPrefixes?.length && !prefixMatches(input.cwd, conditions.cwdPrefixes)) return null;
  if (conditions.cwdPrefixes?.length) reasons.push("cwd match");
  if (conditions.domains?.length && !matchOne(input.domain, conditions.domains)) return null;
  if (conditions.services?.length && !matchOne(input.service, conditions.services)) return null;
  if (conditions.hostnames?.length && !matchOne(input.hostname, conditions.hostnames)) return null;
  if (conditions.urls?.length && !containsOne(input.url, conditions.urls)) return null;
  if (conditions.secretRefs?.length && !matchOne(input.secretRef, conditions.secretRefs)) return null;
  if (conditions.resourceIds?.length && !intersects(input.resourceIds, conditions.resourceIds)) return null;
  if (conditions.projects?.length && !matchOne(input.project, conditions.projects)) return null;
  if (conditions.workspaces?.length && !matchOne(input.workspace, conditions.workspaces)) return null;
  if (conditions.agents?.length && !matchOne(input.agent, conditions.agents)) return null;
  if (conditions.actorKinds?.length && !matchOne(input.actorKind, conditions.actorKinds as ActorKind[])) return null;
  if (conditions.riskClasses?.length && !matchOne(input.riskClass, conditions.riskClasses)) return null;
  return {
    id: record.id,
    severity: record.severity,
    capsule: record.capsule,
    reason: reasons[0] ?? "default match",
    resourceIds: record.resourceIds,
    commands: record.commands.length ? record.commands : [`claw guidance show ${record.id}`],
  };
}

export function normalizeGuidanceId(value: string, fallback = "guidance"): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || fallback;
}

function matchOne<T extends string>(value: T | undefined, candidates: T[] | readonly T[]): boolean {
  return Boolean(value && candidates.some((candidate) => candidate.toLowerCase() === value.toLowerCase()));
}

function containsOne(value: string | undefined, candidates: string[]): boolean {
  return Boolean(value && candidates.some((candidate) => value.toLowerCase().includes(candidate.toLowerCase())));
}

function containsAny(values: string[] | undefined, candidates: string[]): boolean {
  return Boolean(values?.some((value) => containsOne(value, candidates)));
}

function intersects(values: string[] | undefined, candidates: string[]): boolean {
  return Boolean(values?.some((value) => matchOne(value, candidates)));
}

function prefixMatches(value: string | undefined, prefixes: string[]): boolean {
  if (!value) return false;
  const normalized = path.resolve(value);
  return prefixes.some((prefix) => normalized === path.resolve(expandHome(prefix)) || normalized.startsWith(`${path.resolve(expandHome(prefix))}${path.sep}`));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function nowIso(): string {
  return new Date().toISOString();
}
