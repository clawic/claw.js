import fs from "fs";
import os from "os";
import path from "path";

import {
  libraryAssetSchema,
  libraryStateSchema,
  type LibraryAsset,
  type LibraryAssignment,
  type LibraryInstructionProjectionTarget,
  type LibraryMissingSecret,
  type LibraryRequiredSecret,
  type LibraryResolveResult,
  type LibraryResolvedAsset,
  type SkillContextCapsule,
  type SkillContextCapsuleEntry,
  type SkillContextResolveResult,
  type LibraryState,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

export const LIBRARY_STATE_FILE = "library.json";

export interface LibraryStoreOptions {
  rootDir?: string;
  filesystem?: NodeFileSystemHost;
  env?: NodeJS.ProcessEnv;
}

export interface LibraryAssetInput {
  id?: string;
  kind: LibraryAsset["kind"];
  title?: string;
  description?: string;
  tags?: string[];
  version?: string;
  source?: LibraryAsset["source"];
  context?: LibraryAsset["context"];
  projection?: LibraryAsset["projection"];
  requiredSecrets?: LibraryRequiredSecret[];
  autoApplyTags?: string[];
  bundleAssetIds?: string[];
  content?: string;
}

export interface LibraryAssetUpdate {
  title?: string;
  description?: string | null;
  tags?: string[];
  version?: string;
  source?: LibraryAsset["source"] | null;
  context?: LibraryAsset["context"] | null;
  projection?: LibraryAsset["projection"] | null;
  requiredSecrets?: LibraryRequiredSecret[];
  autoApplyTags?: string[] | null;
  bundleAssetIds?: string[];
  content?: string;
}

export interface LibraryAssignInput {
  assetId: string;
  scope: LibraryAssignment["scope"];
  targetId: string;
  mode?: LibraryAssignment["mode"];
}

export interface LibraryResolveInput {
  agentId?: string;
  workspaceId?: string;
  tags?: string[];
  availableSecrets?: string[];
}

export const SKILL_CONTEXT_CAPSULE_MAX_CHARS = 300;
export const DEFAULT_CLAW_OPERATOR_SKILL_ID = "clawjs-operator";
export const DEFAULT_CLAW_OPERATOR_CAPSULE: SkillContextCapsuleEntry = {
  assetId: DEFAULT_CLAW_OPERATOR_SKILL_ID,
  title: "ClawJS Operator",
  capsule: "Use ClawJS as the operating layer: create/update tasks for actionable work; save durable findings as notes; search workspace context before asking; use secrets by reference only.",
  priority: 0,
  readWhen: ["planning work", "saving learnings", "using workspace tools"],
  assignmentOrder: -1,
  includedBy: ["default"],
};

export function resolveLibraryRoot(options: LibraryStoreOptions = {}): string {
  const configured = options.rootDir?.trim()
    || options.env?.CLAW_LIBRARY_DIR?.trim()
    || process.env.CLAW_LIBRARY_DIR?.trim();
  if (configured) return resolveHomePath(configured);
  return path.join(os.homedir(), ".claw", "library");
}

export function normalizeLibraryId(value: string, fallback = "asset"): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || fallback;
}

function resolveHomePath(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueStrings(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function cleanReadWhen(values: unknown): string[] | undefined {
  const raw = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(",")
      : [];
  const cleaned = uniqueStrings(raw.map((value) => String(value)));
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeSkillContextCapsule(input: unknown): SkillContextCapsule | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const capsule = typeof record.capsule === "string" ? record.capsule.trim() : "";
  if (!capsule || capsule.length > SKILL_CONTEXT_CAPSULE_MAX_CHARS) return null;
  const rawPriority = record.priority;
  const priority = typeof rawPriority === "number" && Number.isFinite(rawPriority)
    ? Math.trunc(rawPriority)
    : typeof rawPriority === "string" && rawPriority.trim() && Number.isFinite(Number(rawPriority))
      ? Math.trunc(Number(rawPriority))
      : 100;
  const readWhen = cleanReadWhen(record.readWhen ?? record["read-when"]);
  return {
    capsule,
    priority,
    ...(readWhen ? { readWhen } : {}),
  };
}

function assertSkillContextCapsule(input: SkillContextCapsule): SkillContextCapsule {
  const normalized = normalizeSkillContextCapsule(input);
  if (!normalized) {
    throw new Error(`Skill context capsule must be 1-${SKILL_CONTEXT_CAPSULE_MAX_CHARS} characters.`);
  }
  return normalized;
}

function parseJsonFile(filePath: string, filesystem: NodeFileSystemHost): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(filesystem.readText(filePath)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readSkillJsonContext(skillDir: string, filesystem: NodeFileSystemHost): SkillContextCapsule | null {
  const parsed = parseJsonFile(path.join(skillDir, "skill.json"), filesystem);
  return normalizeSkillContextCapsule(parsed?.context);
}

function parseSkillFrontmatterContext(raw: string): SkillContextCapsule | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  let inContext = false;
  const context: Record<string, unknown> = {};
  for (const line of lines) {
    if (/^\s*clawjs-context\s*:\s*$/.test(line)) {
      inContext = true;
      continue;
    }
    if (inContext && /^\S/.test(line)) inContext = false;
    if (!inContext) continue;
    const entry = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!entry) continue;
    const key = entry[1] === "read-when" ? "readWhen" : entry[1];
    const value = entry[2].trim().replace(/^["']|["']$/g, "");
    context[key] = key === "priority" ? Number(value) : value;
  }
  return normalizeSkillContextCapsule(context);
}

function readSkillFrontmatterContext(skillDir: string, filesystem: NodeFileSystemHost): SkillContextCapsule | null {
  try {
    return parseSkillFrontmatterContext(filesystem.readText(path.join(skillDir, "SKILL.md")));
  } catch {
    return null;
  }
}

function resolveSkillSourceDir(asset: LibraryAsset, libraryRoot: string): string | null {
  const sourcePath = asset.source?.path?.trim();
  if (!sourcePath) return null;
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(libraryRoot, sourcePath);
}

function renderSkillCapsules(capsules: SkillContextCapsuleEntry[]): string {
  if (capsules.length === 0) return "";
  const lines = [
    "ClawJS skill capsules:",
    "Use these compact rules automatically. Read the skill only when more detail is needed.",
  ];
  for (const entry of capsules) {
    const readWhen = entry.readWhen?.length ? ` Read when: ${entry.readWhen.join(", ")}.` : "";
    const location = entry.sourcePath ? ` Skill: ${entry.sourcePath}.` : "";
    lines.push(`- ${entry.assetId}: ${entry.capsule}${readWhen}${location}`);
  }
  return lines.join("\n");
}

function titleFromId(id: string): string {
  return id
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || id;
}

function projectionTargetFile(target: LibraryInstructionProjectionTarget): string {
  switch (target) {
    case "soul":
      return "SOUL.md";
    case "identity":
      return "IDENTITY.md";
    case "agents":
      return "AGENTS.md";
    case "tools":
      return "TOOLS.md";
    case "heartbeat":
      return "HEARTBEAT.md";
    case "user":
      return "USER.md";
  }
}

export function libraryProjectionTargetFile(target: LibraryInstructionProjectionTarget): string {
  return projectionTargetFile(target);
}

/**
 * @deprecated LocalLibraryStore is a compatibility shim. Skills, instructions,
 * and bundles are unified under skills-v2 (kind: procedure | snippet | role).
 * Capsules → `metadata.claw.capsule`. Projections → resolved at compile time.
 * Bundles → composite skills with kind=role and `metadata.claw.children`.
 * Use `claw.skills.create / compile / activate` for new code.
 */
export class LocalLibraryStore {
  readonly rootDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: LibraryStoreOptions = {}) {
    this.rootDir = resolveLibraryRoot(options);
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  statePath(): string {
    return path.join(this.rootDir, LIBRARY_STATE_FILE);
  }

  contentPath(assetId: string): string {
    return path.join(this.rootDir, "assets", `${normalizeLibraryId(assetId)}.md`);
  }

  readState(): LibraryState {
    try {
      const parsed = libraryStateSchema.safeParse(JSON.parse(this.filesystem.readText(this.statePath())));
      if (parsed.success) return parsed.data as LibraryState;
    } catch {
      // Fall through to an empty state.
    }
    return {
      schemaVersion: 1,
      assets: [],
      assignments: [],
      updatedAt: nowIso(),
    };
  }

  writeState(state: LibraryState): LibraryState {
    const next = {
      ...state,
      schemaVersion: 1,
      updatedAt: nowIso(),
      assets: [...state.assets].sort((left, right) => left.id.localeCompare(right.id)),
      assignments: [...state.assignments].sort((left, right) =>
        `${left.scope}:${left.targetId}:${left.assetId}:${left.mode}`.localeCompare(`${right.scope}:${right.targetId}:${right.assetId}:${right.mode}`)),
    };
    this.filesystem.ensureDir(this.rootDir);
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath()), () => {
      this.filesystem.writeTextAtomic(this.statePath(), `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(): LibraryAsset[] {
    return this.readState().assets;
  }

  get(id: string): LibraryAsset | null {
    const assetId = normalizeLibraryId(id);
    return this.readState().assets.find((asset) => asset.id === assetId) ?? null;
  }

  readContent(asset: LibraryAsset | string): string | null {
    const target = typeof asset === "string" ? this.get(asset) : asset;
    if (!target?.contentPath) return null;
    const absolutePath = path.join(this.rootDir, target.contentPath);
    return this.filesystem.exists(absolutePath) ? this.filesystem.readText(absolutePath) : null;
  }

  create(input: LibraryAssetInput): LibraryAsset {
    const state = this.readState();
    const id = normalizeLibraryId(input.id ?? input.title ?? input.source?.installRef ?? input.source?.path ?? input.kind, input.kind);
    if (state.assets.some((asset) => asset.id === id)) {
      throw new Error(`Library asset already exists: ${id}`);
    }
    const createdAt = nowIso();
    const contentPath = input.kind === "instruction" || typeof input.content === "string"
      ? path.relative(this.rootDir, this.contentPath(id))
      : undefined;
    const asset = libraryAssetSchema.parse({
      id,
      kind: input.kind,
      title: input.title?.trim() || titleFromId(id),
      description: input.description?.trim() || undefined,
      tags: uniqueStrings(input.tags),
      version: input.version?.trim() || "0.1.0",
      source: input.source,
      context: input.context ? assertSkillContextCapsule(input.context) : undefined,
      projection: input.projection,
      requiredSecrets: input.requiredSecrets ?? [],
      autoApplyTags: input.autoApplyTags && input.autoApplyTags.length > 0 ? uniqueStrings(input.autoApplyTags) : undefined,
      bundleAssetIds: input.bundleAssetIds && input.bundleAssetIds.length > 0
        ? uniqueStrings(input.bundleAssetIds.map((entry) => normalizeLibraryId(entry)))
        : undefined,
      contentPath,
      createdAt,
      updatedAt: createdAt,
    }) as LibraryAsset;

    if (typeof input.content === "string" && contentPath) {
      this.filesystem.writeTextAtomic(path.join(this.rootDir, contentPath), input.content);
    }

    this.writeState({
      ...state,
      assets: [...state.assets, asset],
    });
    return asset;
  }

  update(id: string, patch: LibraryAssetUpdate): LibraryAsset {
    const state = this.readState();
    const assetId = normalizeLibraryId(id);
    const index = state.assets.findIndex((asset) => asset.id === assetId);
    if (index === -1) throw new Error(`Library asset not found: ${assetId}`);
    const current = state.assets[index];
    const contentPath = typeof patch.content === "string"
      ? current.contentPath ?? path.relative(this.rootDir, this.contentPath(assetId))
      : current.contentPath;
    const next = libraryAssetSchema.parse({
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? undefined } : {}),
      ...(patch.tags !== undefined ? { tags: uniqueStrings(patch.tags) } : {}),
      ...(patch.version !== undefined ? { version: patch.version } : {}),
      ...(patch.source !== undefined ? { source: patch.source ?? undefined } : {}),
      ...(patch.context !== undefined ? { context: patch.context ? assertSkillContextCapsule(patch.context) : undefined } : {}),
      ...(patch.projection !== undefined ? { projection: patch.projection ?? undefined } : {}),
      ...(patch.requiredSecrets !== undefined ? { requiredSecrets: patch.requiredSecrets } : {}),
      ...(patch.autoApplyTags !== undefined ? { autoApplyTags: patch.autoApplyTags ? uniqueStrings(patch.autoApplyTags) : undefined } : {}),
      ...(patch.bundleAssetIds !== undefined ? { bundleAssetIds: patch.bundleAssetIds.map((entry) => normalizeLibraryId(entry)) } : {}),
      contentPath,
      updatedAt: nowIso(),
    }) as LibraryAsset;

    if (typeof patch.content === "string" && contentPath) {
      this.filesystem.writeTextAtomic(path.join(this.rootDir, contentPath), patch.content);
    }

    const assets = [...state.assets];
    assets[index] = next;
    this.writeState({ ...state, assets });
    return next;
  }

  remove(id: string): boolean {
    const state = this.readState();
    const assetId = normalizeLibraryId(id);
    const asset = state.assets.find((entry) => entry.id === assetId);
    if (!asset) return false;
    if (asset.contentPath) {
      this.filesystem.remove(path.join(this.rootDir, asset.contentPath));
    }
    this.writeState({
      ...state,
      assets: state.assets.filter((entry) => entry.id !== assetId),
      assignments: state.assignments.filter((entry) => entry.assetId !== assetId),
    });
    return true;
  }

  importSkill(ref: string, options: { id?: string; title?: string; source?: string; path?: string; tags?: string[]; context?: SkillContextCapsule } = {}): LibraryAsset {
    const trimmedRef = ref.trim();
    if (!trimmedRef && !options.path?.trim()) throw new Error("Skill ref or path is required.");
    const id = normalizeLibraryId(options.id ?? trimmedRef.split("/").pop() ?? options.path ?? "skill", "skill");
    return this.create({
      id,
      kind: "skill",
      title: options.title,
      tags: options.tags,
      context: options.context,
      source: {
        ...(options.source ? { source: options.source } : {}),
        ...(trimmedRef ? { installRef: trimmedRef } : {}),
        ...(options.path ? { path: options.path } : {}),
      },
    });
  }

  createInstruction(input: Omit<LibraryAssetInput, "kind"> & { content: string; projection: NonNullable<LibraryAssetInput["projection"]> }): LibraryAsset {
    return this.create({ ...input, kind: "instruction" });
  }

  createBundle(input: Omit<LibraryAssetInput, "kind"> & { bundleAssetIds: string[] }): LibraryAsset {
    return this.create({ ...input, kind: "bundle" });
  }

  assign(input: LibraryAssignInput): LibraryAssignment {
    const assetId = normalizeLibraryId(input.assetId);
    if (!this.get(assetId)) throw new Error(`Library asset not found: ${assetId}`);
    const state = this.readState();
    const now = nowIso();
    const nextOrder = state.assignments.reduce((max, assignment) => Math.max(max, assignment.order ?? -1), -1) + 1;
    const next: LibraryAssignment = {
      assetId,
      scope: input.scope,
      targetId: input.targetId.trim(),
      mode: input.mode ?? "include",
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    };
    const assignments = state.assignments.filter((assignment) =>
      !(assignment.assetId === next.assetId && assignment.scope === next.scope && assignment.targetId === next.targetId && assignment.mode === next.mode));
    this.writeState({ ...state, assignments: [...assignments, next] });
    return next;
  }

  unassign(input: LibraryAssignInput): boolean {
    const assetId = normalizeLibraryId(input.assetId);
    const state = this.readState();
    const before = state.assignments.length;
    this.writeState({
      ...state,
      assignments: state.assignments.filter((assignment) =>
        !(assignment.assetId === assetId
          && assignment.scope === input.scope
          && assignment.targetId === input.targetId.trim()
          && assignment.mode === (input.mode ?? "include"))),
    });
    return before !== this.readState().assignments.length;
  }

  resolve(input: LibraryResolveInput = {}): LibraryResolveResult {
    const state = this.readState();
    const targetTags = uniqueStrings(input.tags);
    const includedById = new Map<string, Set<LibraryResolvedAsset["includedBy"][number]>>();
    const orderById = new Map<string, number>();
    const excluded = new Set<string>();

    for (const assignment of state.assignments) {
      const matchesAgent = input.agentId && assignment.scope === "agent" && assignment.targetId === input.agentId;
      const matchesWorkspace = input.workspaceId && assignment.scope === "workspace" && assignment.targetId === input.workspaceId;
      if (!matchesAgent && !matchesWorkspace) continue;
      if (assignment.mode === "exclude") {
        excluded.add(assignment.assetId);
        continue;
      }
      if (!includedById.has(assignment.assetId)) includedById.set(assignment.assetId, new Set());
      includedById.get(assignment.assetId)!.add("explicit");
      orderById.set(assignment.assetId, Math.min(orderById.get(assignment.assetId) ?? Number.MAX_SAFE_INTEGER, assignment.order ?? Number.MAX_SAFE_INTEGER));
    }

    for (const asset of state.assets) {
      const requiredTags = asset.autoApplyTags ?? [];
      if (requiredTags.length === 0) continue;
      if (requiredTags.every((tag) => targetTags.includes(tag))) {
        if (!includedById.has(asset.id)) includedById.set(asset.id, new Set());
        includedById.get(asset.id)!.add("tag");
        orderById.set(asset.id, Math.min(orderById.get(asset.id) ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER));
      }
    }

    const byId = new Map(state.assets.map((asset) => [asset.id, asset]));
    const visitBundle = (assetId: string, stack: string[] = []) => {
      if (stack.includes(assetId)) return;
      const asset = byId.get(assetId);
      if (!asset || asset.kind !== "bundle") return;
      const parentOrder = orderById.get(assetId) ?? Number.MAX_SAFE_INTEGER;
      for (const childId of asset.bundleAssetIds ?? []) {
        const normalizedChild = normalizeLibraryId(childId);
        if (!includedById.has(normalizedChild)) includedById.set(normalizedChild, new Set());
        includedById.get(normalizedChild)!.add("bundle");
        orderById.set(normalizedChild, Math.min(orderById.get(normalizedChild) ?? Number.MAX_SAFE_INTEGER, parentOrder));
        visitBundle(normalizedChild, [...stack, assetId]);
      }
    };

    for (const assetId of [...includedById.keys()]) {
      visitBundle(assetId);
    }

    const availableSecrets = new Set((input.availableSecrets ?? []).map((entry) => entry.trim()).filter(Boolean));
    const missingSecrets: LibraryMissingSecret[] = [];
    const assets: LibraryResolvedAsset[] = [];

    for (const [assetId, includedBy] of [...includedById.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (excluded.has(assetId)) continue;
      const asset = byId.get(assetId);
      if (!asset) continue;
      for (const secret of asset.requiredSecrets) {
        if (!availableSecrets.has(secret.name)) {
          missingSecrets.push({ assetId: asset.id, name: secret.name, label: secret.label });
        }
      }
      assets.push({
        ...asset,
        includedBy: [...includedBy].sort(),
        assignmentOrder: orderById.get(asset.id) ?? Number.MAX_SAFE_INTEGER,
      });
    }

    return {
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      tags: targetTags,
      assets,
      missingSecrets,
    };
  }

  resolveSkillCapsules(input: LibraryResolveInput & { includeDefault?: boolean } = {}): SkillContextResolveResult {
    const resolved = this.resolve(input);
    const capsules: SkillContextCapsuleEntry[] = [];
    const warnings: string[] = [];

    if (input.includeDefault !== false) {
      capsules.push(DEFAULT_CLAW_OPERATOR_CAPSULE);
    }

    for (const asset of resolved.assets) {
      if (asset.kind !== "skill") continue;
      const sourceDir = resolveSkillSourceDir(asset, this.rootDir);
      const skillJsonContext = sourceDir ? readSkillJsonContext(sourceDir, this.filesystem) : null;
      const frontmatterContext = sourceDir ? readSkillFrontmatterContext(sourceDir, this.filesystem) : null;
      const context = asset.context ?? skillJsonContext ?? frontmatterContext;
      if (!context) continue;
      if (context.capsule.length > SKILL_CONTEXT_CAPSULE_MAX_CHARS) {
        warnings.push(`Skill capsule too long: ${asset.id}`);
        continue;
      }
      capsules.push({
        assetId: asset.id,
        title: asset.title,
        sourcePath: sourceDir ? path.join(sourceDir, "SKILL.md") : undefined,
        capsule: context.capsule,
        priority: context.priority,
        ...(context.readWhen ? { readWhen: context.readWhen } : {}),
        assignmentOrder: asset.assignmentOrder ?? Number.MAX_SAFE_INTEGER,
        includedBy: asset.includedBy,
      });
    }

    capsules.sort((left, right) =>
      left.priority - right.priority
      || left.assignmentOrder - right.assignmentOrder
      || left.assetId.localeCompare(right.assetId));

    return {
      capsules,
      prompt: renderSkillCapsules(capsules),
      warnings,
    };
  }
}

export function createLocalLibraryStore(options: LibraryStoreOptions = {}): LocalLibraryStore {
  return new LocalLibraryStore(options);
}
