import fs from "fs";
import os from "os";
import path from "path";

import {
  skillFrontmatterSchema,
  skillsStateSchema,
  type ClawjsSkillsConfig,
  type SkillAssignment,
  type SkillCreateInput,
  type SkillFrontmatter,
  type SkillKind,
  type SkillListFilter,
  type SkillResolveContext,
  type SkillScope,
  type SkillSpec,
  type SkillSyncTarget,
  type SkillUpdate,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { buildSkillMd, stringifyYaml } from "./yaml.ts";
import { splitFrontmatter } from "./yaml-parse.ts";

export const SKILLS_HOME_DIR = ".claw";
export const SKILLS_DIR = "skills";
export const SKILLS_V2_STATE_FILE = "state.json";
export const SKILLS_CONFIG_FILE = "config.yaml";
export const SKILLS_INSTANCES_KIND = "_instances";

const SKILL_KINDS: readonly SkillKind[] = ["personality", "procedure", "snippet", "role"];

export interface SkillsStoreOptions {
  /** Override the central skills root (defaults to ~/.claw). */
  homeDir?: string;
  filesystem?: NodeFileSystemHost;
  env?: NodeJS.ProcessEnv;
}

interface SkillsState {
  schemaVersion: 1;
  assignments: SkillAssignment[];
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function expandHome(value: string): string {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function resolveSkillsHome(options: SkillsStoreOptions = {}): string {
  const configured = options.homeDir?.trim()
    || options.env?.CLAWJS_HOME?.trim()
    || process.env.CLAWJS_HOME?.trim();
  if (configured) return expandHome(configured);
  return path.join(os.homedir(), SKILLS_HOME_DIR);
}

export function normalizeSlug(value: string, fallback = "skill"): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function inferDirName(slug: string): string {
  return slug.split("/").pop() || slug;
}

function titleFromSlug(slug: string): string {
  return slug.split(/[._/\-]+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || slug;
}

function unique(values: string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const out = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return out.length > 0 ? out : undefined;
}

function isInstanceKind(kindFolder: string): boolean {
  return kindFolder === SKILLS_INSTANCES_KIND;
}

export class SkillsStore {
  readonly homeDir: string;
  readonly skillsDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: SkillsStoreOptions = {}) {
    this.homeDir = resolveSkillsHome(options);
    this.skillsDir = path.join(this.homeDir, SKILLS_DIR);
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  statePath(): string { return path.join(this.homeDir, SKILLS_V2_STATE_FILE); }
  configPath(): string { return path.join(this.homeDir, SKILLS_CONFIG_FILE); }

  private kindRoot(kind: SkillKind): string {
    return path.join(this.skillsDir, kind);
  }

  private skillDirFor(spec: SkillSpec): string {
    if (spec.frontmatter.metadata.clawjs.instance) {
      return path.join(this.skillsDir, SKILLS_INSTANCES_KIND, inferDirName(spec.slug));
    }
    if (spec.frontmatter.metadata.clawjs.builtin) {
      return path.join(this.kindRoot(spec.kind), "_builtin", inferDirName(spec.slug));
    }
    return path.join(this.kindRoot(spec.kind), inferDirName(spec.slug));
  }

  /** Returns absolute path to SKILL.md given (kind, slug) and instance flag. */
  resolveSkillFile(kind: SkillKind, slug: string, opts: { builtin?: boolean; instance?: boolean } = {}): string {
    const dir = inferDirName(slug);
    if (opts.instance) return path.join(this.skillsDir, SKILLS_INSTANCES_KIND, dir, "SKILL.md");
    if (opts.builtin) return path.join(this.kindRoot(kind), "_builtin", dir, "SKILL.md");
    return path.join(this.kindRoot(kind), dir, "SKILL.md");
  }

  ensureLayout(): void {
    this.filesystem.ensureDir(this.homeDir);
    this.filesystem.ensureDir(this.skillsDir);
    for (const kind of SKILL_KINDS) {
      this.filesystem.ensureDir(this.kindRoot(kind));
    }
    this.filesystem.ensureDir(path.join(this.skillsDir, SKILLS_INSTANCES_KIND));
  }

  // ─── Read API ─────────────────────────────────────────────────────────

  list(filter: SkillListFilter = {}): SkillSpec[] {
    this.ensureLayout();
    const skills: SkillSpec[] = [];
    const allKinds: Array<{ kind: SkillKind; root: string }> = SKILL_KINDS.map((kind) => ({ kind, root: this.kindRoot(kind) }));
    allKinds.push({ kind: "procedure", root: path.join(this.skillsDir, SKILLS_INSTANCES_KIND) });

    for (const { kind, root } of allKinds) {
      if (!fs.existsSync(root)) continue;
      this.walkKind(root, kind === "procedure" && root.endsWith(SKILLS_INSTANCES_KIND), skills);
    }

    return skills.filter((spec) => this.matchesFilter(spec, filter));
  }

  private walkKind(root: string, isInstance: boolean, out: SkillSpec[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const entryPath = path.join(root, entry.name);
      if (entry.name === "_builtin") {
        this.walkKind(entryPath, isInstance, out);
        continue;
      }
      const skillMd = path.join(entryPath, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      try {
        const spec = this.readSkillFile(skillMd);
        if (spec) out.push(spec);
      } catch {
        // tolerate broken SKILL.md, skip
      }
    }
  }

  private matchesFilter(spec: SkillSpec, filter: SkillListFilter): boolean {
    if (filter.kinds && !filter.kinds.includes(spec.kind)) return false;
    if (filter.builtin !== undefined && Boolean(spec.frontmatter.metadata.clawjs.builtin) !== filter.builtin) return false;
    if (filter.scope) {
      const sc = spec.frontmatter.metadata.clawjs.scope;
      const kind = sc?.kind ?? "global";
      if (kind !== filter.scope) return false;
    }
    if (filter.tags && filter.tags.length > 0) {
      const tags = new Set((spec.frontmatter.metadata.clawjs.tags ?? []).map((t) => t.toLowerCase()));
      const wanted = filter.tags.map((t) => t.toLowerCase());
      if (!wanted.every((t) => tags.has(t))) return false;
    }
    return true;
  }

  get(slug: string): SkillSpec | null {
    const normalized = normalizeSlug(slug);
    const matches = this.list().filter((spec) => spec.slug === normalized);
    return matches[0] ?? null;
  }

  search(query: string, opts: { kinds?: SkillKind[]; tags?: string[] } = {}): SkillSpec[] {
    const q = query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const all = this.list({ kinds: opts.kinds, tags: opts.tags });
    if (tokens.length === 0) return all;
    return all
      .map((spec) => {
        const haystack = [
          spec.slug,
          spec.name,
          spec.description,
          ...(spec.frontmatter.metadata.clawjs.tags ?? []),
          spec.body.slice(0, 4000),
        ].join(" ").toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (spec.slug.toLowerCase().includes(t)) score += 4;
          else if (spec.name.toLowerCase().includes(t)) score += 3;
          else if ((spec.frontmatter.metadata.clawjs.tags ?? []).some((tag) => tag.toLowerCase().includes(t))) score += 2;
          else if (haystack.includes(t)) score += 1;
        }
        return { spec, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ spec }) => spec);
  }

  /** Read and validate a single SKILL.md by absolute path. */
  readSkillFile(filePath: string): SkillSpec | null {
    const raw = fs.readFileSync(filePath, "utf8");
    const { frontmatter, body } = splitFrontmatter(raw);
    if (!frontmatter) return null;
    const parsed = skillFrontmatterSchema.safeParse(frontmatter);
    if (!parsed.success) {
      throw new Error(`Invalid SKILL.md frontmatter at ${filePath}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    const fm = parsed.data as SkillFrontmatter;
    const slug = normalizeSlug(String(fm.name));
    return {
      schemaVersion: 1,
      slug,
      name: fm.name,
      description: fm.description,
      version: fm.version || "0.1.0",
      kind: fm.metadata.clawjs.kind,
      body,
      frontmatter: fm,
      filePath,
      scope: fm.metadata.clawjs.scope,
      tags: fm.metadata.clawjs.tags,
    };
  }

  // ─── Write API ────────────────────────────────────────────────────────

  create(input: SkillCreateInput): SkillSpec {
    this.ensureLayout();
    const slug = normalizeSlug(input.slug ?? input.name ?? input.kind, input.kind);
    const existing = this.get(slug);
    if (existing) {
      throw new Error(`Skill already exists: ${slug}`);
    }
    const dir = inferDirName(slug);
    const targetDir = input.builtin
      ? path.join(this.kindRoot(input.kind), "_builtin", dir)
      : path.join(this.kindRoot(input.kind), dir);
    const filePath = path.join(targetDir, "SKILL.md");
    const frontmatter = this.buildFrontmatter(slug, input);
    const body = input.body?.trim() || `# ${input.name?.trim() || titleFromSlug(slug)}\n\n${input.description?.trim() || ""}`.trimEnd();
    this.filesystem.ensureDir(targetDir);
    this.filesystem.writeTextAtomic(filePath, buildSkillMd(frontmatter, body));
    const spec = this.readSkillFile(filePath);
    if (!spec) throw new Error(`Failed to read newly created skill: ${slug}`);
    return spec;
  }

  update(slug: string, patch: SkillUpdate): SkillSpec {
    const existing = this.get(slug);
    if (!existing) throw new Error(`Skill not found: ${slug}`);
    const fm: SkillFrontmatter = JSON.parse(JSON.stringify(existing.frontmatter));
    if (patch.name !== undefined) fm.name = patch.name;
    if (patch.description !== undefined) fm.description = patch.description;
    if (patch.version !== undefined) fm.version = patch.version;
    const meta = fm.metadata.clawjs;
    if (patch.scope !== undefined) meta.scope = patch.scope;
    if (patch.tags !== undefined) meta.tags = unique(patch.tags);
    if (patch.syncTo !== undefined) meta.syncTo = unique(patch.syncTo);
    if (patch.syncMode !== undefined) meta.syncMode = patch.syncMode;
    if (patch.params !== undefined) meta.params = patch.params;
    if (patch.capsule !== undefined) {
      if (patch.capsule === null) delete meta.capsule;
      else meta.capsule = patch.capsule;
    }
    if (patch.soul !== undefined) meta.soul = patch.soul;
    if (patch.presets !== undefined) meta.presets = patch.presets;
    if (patch.children !== undefined) meta.children = patch.children;
    if (patch.projection !== undefined) meta.projection = patch.projection;
    const body = patch.body !== undefined ? patch.body : existing.body;
    this.filesystem.writeTextAtomic(existing.filePath, buildSkillMd(fm, body));
    const updated = this.readSkillFile(existing.filePath);
    if (!updated) throw new Error(`Failed to read updated skill: ${slug}`);
    return updated;
  }

  remove(slug: string): boolean {
    const existing = this.get(slug);
    if (!existing) return false;
    const dir = path.dirname(existing.filePath);
    this.filesystem.remove(dir);
    return true;
  }

  // ─── Activation state ─────────────────────────────────────────────────

  readState(): SkillsState {
    if (!this.filesystem.exists(this.statePath())) {
      return { schemaVersion: 1, assignments: [], updatedAt: nowIso() };
    }
    try {
      const parsed = skillsStateSchema.safeParse(JSON.parse(this.filesystem.readText(this.statePath())));
      if (parsed.success) return parsed.data as SkillsState;
    } catch {
      // ignore
    }
    return { schemaVersion: 1, assignments: [], updatedAt: nowIso() };
  }

  writeState(state: SkillsState): SkillsState {
    this.filesystem.ensureDir(this.homeDir);
    const next: SkillsState = {
      ...state,
      schemaVersion: 1,
      assignments: [...state.assignments].sort((a, b) =>
        `${a.scope.kind}:${a.slug}`.localeCompare(`${b.scope.kind}:${b.slug}`)),
      updatedAt: nowIso(),
    };
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath()), () => {
      this.filesystem.writeTextAtomic(this.statePath(), `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  activate(slug: string, scope: SkillScope, opts: { priority?: number; params?: Record<string, unknown> } = {}): SkillAssignment {
    const existing = this.get(slug);
    if (!existing) throw new Error(`Skill not found: ${slug}`);
    const state = this.readState();
    const now = nowIso();
    const filtered = state.assignments.filter((a) => !(a.slug === slug && sameScope(a.scope, scope)));
    const priority = opts.priority ?? defaultPriority(scope.kind);
    const assignment: SkillAssignment = {
      slug,
      scope,
      priority,
      ...(opts.params ? { params: opts.params } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.writeState({ ...state, assignments: [...filtered, assignment] });
    return assignment;
  }

  deactivate(slug: string, scope: SkillScope): boolean {
    const state = this.readState();
    const before = state.assignments.length;
    const next = state.assignments.filter((a) => !(a.slug === slug && sameScope(a.scope, scope)));
    if (next.length === before) return false;
    this.writeState({ ...state, assignments: next });
    return true;
  }

  resolveActive(ctx: SkillResolveContext = {}): SkillSpec[] {
    const state = this.readState();
    const matched = state.assignments.filter((a) => assignmentMatches(a, ctx));
    matched.sort((a, b) => {
      const order = scopeOrder(b.scope.kind) - scopeOrder(a.scope.kind);
      if (order !== 0) return order;
      return b.priority - a.priority;
    });
    const seen = new Set<string>();
    const out: SkillSpec[] = [];
    for (const a of matched) {
      if (seen.has(a.slug)) continue;
      seen.add(a.slug);
      const spec = this.get(a.slug);
      if (spec) out.push(spec);
    }
    return out;
  }

  // ─── Instances ────────────────────────────────────────────────────────

  instantiate(templateSlug: string, params: Record<string, unknown>, opts: { saveAs?: string; freeze?: boolean } = {}): SkillSpec {
    const template = this.get(templateSlug);
    if (!template) throw new Error(`Template skill not found: ${templateSlug}`);
    const slug = normalizeSlug(opts.saveAs || `${templateSlug}-instance-${Date.now()}`);
    const dir = inferDirName(slug);
    const targetDir = path.join(this.skillsDir, SKILLS_INSTANCES_KIND, dir);
    const filePath = path.join(targetDir, "SKILL.md");
    const frozen = Boolean(opts.freeze);
    const body = frozen ? renderTemplateBody(template.body, params) : "";
    const fm: SkillFrontmatter = {
      name: slug,
      description: opts.saveAs ? `Instance of ${templateSlug}` : `Transient instance of ${templateSlug}`,
      version: "0.1.0",
      metadata: {
        clawjs: {
          schemaVersion: 1,
          kind: template.kind,
          instance: { ofTemplate: templateSlug, params, frozen },
          ...(template.frontmatter.metadata.clawjs.tags ? { tags: template.frontmatter.metadata.clawjs.tags } : {}),
        },
      },
    };
    this.filesystem.ensureDir(targetDir);
    this.filesystem.writeTextAtomic(filePath, buildSkillMd(fm, body));
    const spec = this.readSkillFile(filePath);
    if (!spec) throw new Error(`Failed to read newly created instance: ${slug}`);
    return spec;
  }

  freeze(instanceSlug: string): SkillSpec {
    const inst = this.get(instanceSlug);
    if (!inst) throw new Error(`Instance not found: ${instanceSlug}`);
    const ref = inst.frontmatter.metadata.clawjs.instance;
    if (!ref) throw new Error(`Skill is not an instance: ${instanceSlug}`);
    const template = this.get(ref.ofTemplate);
    if (!template) throw new Error(`Template not found for instance: ${ref.ofTemplate}`);
    const body = renderTemplateBody(template.body, ref.params);
    const fm: SkillFrontmatter = JSON.parse(JSON.stringify(inst.frontmatter));
    if (fm.metadata.clawjs.instance) {
      fm.metadata.clawjs.instance = { ...fm.metadata.clawjs.instance, frozen: true };
    }
    this.filesystem.writeTextAtomic(inst.filePath, buildSkillMd(fm, body));
    const updated = this.readSkillFile(inst.filePath);
    if (!updated) throw new Error(`Failed to read frozen instance: ${instanceSlug}`);
    return updated;
  }

  // ─── Config ───────────────────────────────────────────────────────────

  readConfig(): ClawjsSkillsConfig {
    if (!this.filesystem.exists(this.configPath())) return {};
    try {
      const { frontmatter } = splitFrontmatter(`---\n${this.filesystem.readText(this.configPath())}\n---\n`);
      if (frontmatter && typeof frontmatter.skills === "object" && frontmatter.skills) {
        return frontmatter.skills as ClawjsSkillsConfig;
      }
    } catch {
      // ignore
    }
    return {};
  }

  writeConfig(config: ClawjsSkillsConfig): void {
    this.filesystem.ensureDir(this.homeDir);
    const yaml = stringifyYaml({ skills: config });
    this.filesystem.writeTextAtomic(this.configPath(), yaml);
  }

  syncTargets(): SkillSyncTarget[] {
    return this.readConfig().sync_targets ?? [];
  }

  registerSyncTarget(target: SkillSyncTarget): SkillSyncTarget {
    const config = this.readConfig();
    const existing = (config.sync_targets ?? []).filter((t) => t.id !== target.id);
    const next: SkillSyncTarget = { ...target, home: expandHome(target.home) };
    config.sync_targets = [...existing, next];
    this.writeConfig(config);
    return next;
  }

  externalDirs(defaults: string[]): string[] {
    const config = this.readConfig();
    const candidates = config.external_dirs ?? defaults;
    return candidates.map(expandHome);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private buildFrontmatter(slug: string, input: SkillCreateInput): SkillFrontmatter {
    const name = input.name?.trim() || titleFromSlug(slug);
    const description = input.description?.trim() || `Skill: ${name}`;
    const meta: SkillFrontmatter["metadata"]["clawjs"] = {
      schemaVersion: 1,
      kind: input.kind,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.tags && input.tags.length ? { tags: unique(input.tags) } : {}),
      ...(input.syncTo && input.syncTo.length ? { syncTo: unique(input.syncTo) } : {}),
      ...(input.syncMode ? { syncMode: input.syncMode } : {}),
      ...(input.params ? { params: input.params } : {}),
      ...(input.capsule ? { capsule: input.capsule } : {}),
      ...(input.soul ? { soul: input.soul } : {}),
      ...(input.presets ? { presets: input.presets } : {}),
      ...(input.builtin ? { builtin: true } : {}),
      ...(input.importedFrom ? { importedFrom: input.importedFrom } : {}),
      ...(input.children ? { children: input.children } : {}),
      ...(input.projection ? { projection: input.projection } : {}),
    };
    const fm: SkillFrontmatter = {
      name: slug,
      description,
      version: input.version || "0.1.0",
      metadata: { clawjs: meta },
      ...(input.extra ?? {}),
    };
    // Use the human-friendly name if provided; SKILL.md `name` is the slug
    // by convention, while a friendly title can be carried inside body.
    if (input.name) fm.name = slug;
    if (name && name !== slug) fm.metadata = { ...fm.metadata, clawjs: { ...meta } };
    return fm;
  }
}

export function createSkillsStore(options: SkillsStoreOptions = {}): SkillsStore {
  return new SkillsStore(options);
}

function defaultPriority(kind: SkillScope["kind"]): number {
  switch (kind) {
    case "chat": return 30;
    case "project": return 20;
    case "tag": return 15;
    case "global":
    default: return 10;
  }
}

function scopeOrder(kind: SkillScope["kind"]): number {
  switch (kind) {
    case "chat": return 3;
    case "project": return 2;
    case "tag": return 1;
    case "global":
    default: return 0;
  }
}

function sameScope(a: SkillScope, b: SkillScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "project") return JSON.stringify(a.projectIds ?? []) === JSON.stringify(b.projectIds ?? []);
  if (a.kind === "chat") return (a.chatId ?? "") === (b.chatId ?? "");
  if (a.kind === "tag") return JSON.stringify(a.tagFilters ?? []) === JSON.stringify(b.tagFilters ?? []);
  return true;
}

function assignmentMatches(a: SkillAssignment, ctx: SkillResolveContext): boolean {
  switch (a.scope.kind) {
    case "global": return true;
    case "project": {
      if (!ctx.projectId) return false;
      return (a.scope.projectIds ?? []).includes(ctx.projectId);
    }
    case "chat": {
      if (!ctx.chatId) return false;
      return (a.scope.chatId ?? "") === ctx.chatId;
    }
    case "tag": {
      const want = new Set((ctx.tags ?? []).map((t) => t.toLowerCase()));
      const need = (a.scope.tagFilters ?? []).map((t) => t.toLowerCase());
      return need.length > 0 && need.every((t) => want.has(t));
    }
  }
}

function renderTemplateBody(body: string, params: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const v = params[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}
