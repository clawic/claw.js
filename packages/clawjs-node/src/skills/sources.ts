/**
 * Skill source adapters are the v1 import/search bridge from external skill
 * catalogs into the unified SKILL.md model.
 */
import fs from "fs";
import path from "path";

import type {
  SkillCatalogEntry,
  SkillInstallResult,
  SkillSearchResult,
  SkillSourceCapabilities,
  SkillSourceDescriptor,
} from "@clawjs/core";

import type { CommandRunner } from "../runtime/contracts.ts";
import { BUILTIN_PROCEDURE_SKILLS } from "../skills-v2/builtins.ts";

export type SkillSourceStatus = SkillSourceDescriptor["status"];
export type SkillSourceId = "workspace" | "clawhub" | "clawic" | "skills.sh";

export interface SkillSourceContext {
  runner: CommandRunner;
  workspaceDir: string;
  env?: NodeJS.ProcessEnv;
}

export interface SkillSourceSearchOptions {
  limit?: number;
}

export interface SkillSourceSearchResponse {
  entries: SkillCatalogEntry[];
  warnings?: string[];
}

export interface SkillSourceInstallResponse extends SkillInstallResult {}

export interface SkillSourceAdapter {
  id: SkillSourceId;
  label: string;
  capabilities: SkillSourceCapabilities;
  status(context: SkillSourceContext): Promise<SkillSourceDescriptor>;
  search?(query: string, options: SkillSourceSearchOptions, context: SkillSourceContext): Promise<SkillSourceSearchResponse>;
  resolveExact?(ref: string, context: SkillSourceContext): Promise<SkillCatalogEntry | null>;
  install(ref: string, context: SkillSourceContext): Promise<SkillSourceInstallResponse>;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isSimpleSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value.trim());
}

function isRepoLikeRef(value: string): boolean {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(value.trim());
}

/**
 * Parse a single clawhub search output line.
 * Format: "slug  Label  (score)" or "slug  Label"
 */
function parseClawhubLine(line: string): SkillCatalogEntry | null {
  const trimmed = line.replace(/\s*\(\d+[\d.]*\)\s*$/, "").trim(); // strip trailing (score)
  if (!trimmed) return null;
  const parts = trimmed.split(/\s{2,}/); // split by 2+ spaces
  const slug = parts[0]?.trim();
  if (!slug) return null;
  const label = parts[1]?.trim() || titleizeSlug(slug);
  return { source: "clawhub", slug, label, installRef: slug };
}

/**
 * Parse clawic text output where each skill is two lines:
 * Line 1: "slug    Label"
 * Line 2: "description"
 */
function parseClawicTextOutput(stdout: string): SkillCatalogEntry[] {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
  const entries: SkillCatalogEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const headerLine = lines[i].trim();
    const parts = headerLine.split(/\s{2,}/);
    const slug = parts[0]?.trim();
    if (!slug) { i++; continue; }
    const label = parts[1]?.trim() || titleizeSlug(slug);
    let summary: string | undefined;
    // Next line is description if it doesn't look like a header (slug  Label pattern)
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim();
      const nextParts = nextLine.split(/\s{2,}/);
      if (nextParts.length >= 2 && /^[a-z0-9][\w-]*$/i.test(nextParts[0])) {
        // Next line is a new entry header, no description for this one
      } else {
        summary = nextLine;
        i++;
      }
    }
    entries.push({
      source: "clawic",
      slug,
      label,
      ...(summary ? { summary } : {}),
      installRef: slug,
    });
    i++;
  }
  return entries;
}

function titleizeSlug(value: string): string {
  return value
    .trim()
    .replace(/^[./]+/, "")
    .replace(/\.[^.]+$/, "")
    .split(/[\/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeCatalogEntry(source: SkillSourceId, raw: Record<string, unknown>): SkillCatalogEntry | null {
  const slug = String(raw.slug ?? raw.id ?? raw.name ?? raw.ref ?? "").trim();
  if (!slug) return null;
  const label = String(raw.label ?? raw.title ?? raw.name ?? slug).trim() || slug;
  const summary = typeof raw.summary === "string"
    ? raw.summary
    : typeof raw.description === "string"
      ? raw.description
      : undefined;
  const homepage = typeof raw.homepage === "string"
    ? raw.homepage
    : typeof raw.url === "string"
      ? raw.url
      : undefined;
  const installRef = String(raw.installRef ?? raw.ref ?? slug).trim() || slug;
  return {
    source,
    slug,
    label,
    ...(summary ? { summary } : {}),
    installRef,
    ...(homepage ? { homepage } : {}),
  };
}

function parseJsonEntries(source: SkillSourceId, stdout: string): SkillCatalogEntry[] | null {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => (entry && typeof entry === "object" ? normalizeCatalogEntry(source, entry as Record<string, unknown>) : null))
        .filter((entry): entry is SkillCatalogEntry => !!entry);
    }
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const candidate = Array.isArray(record.results)
        ? record.results
        : Array.isArray(record.skills)
          ? record.skills
          : null;
      if (candidate) {
        return candidate
          .map((entry) => (entry && typeof entry === "object" ? normalizeCatalogEntry(source, entry as Record<string, unknown>) : null))
          .filter((entry): entry is SkillCatalogEntry => !!entry);
      }
      const single = normalizeCatalogEntry(source, record);
      return single ? [single] : [];
    }
  } catch {
    return null;
  }
  return [];
}

async function commandAvailable(
  runner: CommandRunner,
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<boolean> {
  try {
    await runner.exec(command, args, { env, timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function resolveWorkspaceSkillPath(workspaceDir: string, slug: string): string | null {
  const normalized = slug.trim().split("/").pop()?.trim() ?? "";
  if (!normalized) return null;
  const candidate = path.join(workspaceDir, "skills", normalized);
  return fs.existsSync(candidate) ? candidate : null;
}

function commandLimitArg(limit: number | undefined): string | undefined {
  return typeof limit === "number" && Number.isSafeInteger(limit) && limit > 0 ? String(limit) : undefined;
}

// ── Built-in skill catalog ────────────────────────────────────────────
// Provides a searchable catalog that works without any external CLI.
//
// Single source of truth lives in `skills-v2/builtins.ts`
// (`BUILTIN_PROCEDURE_SKILLS`); this catalog view keeps source search
// aligned with the unified built-in procedure definitions.
const BUILTIN_CATALOG = BUILTIN_PROCEDURE_SKILLS;

function searchBuiltinCatalog(query: string, limit?: number): SkillCatalogEntry[] {
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  const scored = BUILTIN_CATALOG
    .map((entry) => {
      const haystack = `${entry.slug} ${entry.label} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (entry.slug.toLowerCase().includes(term)) score += 3;
        else if (entry.label.toLowerCase().includes(term)) score += 3;
        else if (entry.tags.some((tag) => tag.includes(term))) score += 2;
        else if (haystack.includes(term)) score += 1;
      }
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const capped = typeof limit === "number" && Number.isFinite(limit) ? scored.slice(0, Math.max(1, limit)) : scored;

  return capped.map(({ entry }) => ({
    source: "workspace" as const,
    slug: entry.slug,
    label: entry.label,
    summary: entry.summary,
    installRef: entry.slug,
  }));
}

function readWorkspaceSkillEntries(workspaceDir: string): SkillCatalogEntry[] {
  const skillsDir = path.join(workspaceDir, "skills");
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skillJsonPath = path.join(skillsDir, entry.name, "skill.json");
        let label = titleizeSlug(entry.name);
        let summary: string | undefined;
        try {
          const raw = JSON.parse(fs.readFileSync(skillJsonPath, "utf-8")) as Record<string, unknown>;
          if (typeof raw.name === "string") label = raw.name;
          if (typeof raw.description === "string") summary = raw.description;
        } catch {
          // skill.json missing or invalid — use defaults
        }
        return {
          source: "workspace" as const,
          slug: entry.name,
          label,
          ...(summary ? { summary } : {}),
          installRef: entry.name,
        };
      });
  } catch {
    return [];
  }
}

const workspaceSource: SkillSourceAdapter = {
  id: "workspace",
  label: "Workspace",
  capabilities: {
    search: true,
    install: true,
    resolveExact: true,
  },
  async status() {
    return {
      id: "workspace",
      label: "Workspace",
      status: "ready",
      capabilities: this.capabilities,
      summary: "Search the built-in skill catalog and local workspace skills.",
    };
  },
  async search(query, options, context) {
    const lowerQuery = query.toLowerCase().trim();
    const localEntries = readWorkspaceSkillEntries(context.workspaceDir);
    const localMatches = localEntries.filter((entry) => {
      const haystack = `${entry.slug} ${entry.label} ${entry.summary ?? ""}`.toLowerCase();
      return lowerQuery.split(/\s+/).some((term) => haystack.includes(term));
    });
    const catalogMatches = searchBuiltinCatalog(query, options.limit);
    const seen = new Set<string>();
    const combined: SkillCatalogEntry[] = [];
    for (const entry of [...localMatches, ...catalogMatches]) {
      if (!seen.has(entry.slug)) {
        seen.add(entry.slug);
        combined.push(entry);
      }
    }
    const limit = typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, options.limit)
      : combined.length;
    return { entries: combined.slice(0, limit) };
  },
  async resolveExact(ref, context) {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    // Check local workspace first
    const localEntries = readWorkspaceSkillEntries(context.workspaceDir);
    const local = localEntries.find((entry) => entry.slug === trimmed);
    if (local) return local;
    // Check built-in catalog
    const builtin = BUILTIN_CATALOG.find((entry) => entry.slug === trimmed);
    if (builtin) {
      return {
        source: "workspace",
        slug: builtin.slug,
        label: builtin.label,
        summary: builtin.summary,
        installRef: builtin.slug,
      };
    }
    return null;
  },
  async install(ref, context) {
    const trimmed = ref.trim();
    const skillDir = path.join(context.workspaceDir, "skills", trimmed);
    const alreadyExists = fs.existsSync(skillDir);
    if (!alreadyExists) {
      fs.mkdirSync(skillDir, { recursive: true });
      const builtin = BUILTIN_CATALOG.find((entry) => entry.slug === trimmed);
      const skillJson = {
        id: trimmed,
        name: builtin?.label ?? titleizeSlug(trimmed),
        version: "0.1.0",
        description: builtin?.summary ?? `Skill: ${titleizeSlug(trimmed)}`,
        entrypoint: "./dist/index.js",
      };
      fs.writeFileSync(path.join(skillDir, "skill.json"), JSON.stringify(skillJson, null, 2) + "\n");
    }
    return {
      source: "workspace",
      slug: trimmed,
      label: titleizeSlug(trimmed),
      installRef: trimmed,
      runtimeVisibility: "runtime" as const,
      installedPaths: [skillDir],
    };
  },
};

const clawhubSource: SkillSourceAdapter = {
  id: "clawhub",
  label: "ClawHub",
  capabilities: {
    search: true,
    install: true,
    resolveExact: true,
  },
  async status(context) {
    const ready = await commandAvailable(context.runner, "npx", ["--help"], context.env);
    return {
      id: "clawhub",
      label: "ClawHub",
      status: ready ? "ready" : "unsupported",
      capabilities: this.capabilities,
      summary: ready ? "Search and install skills from the ClawHub registry." : "The `npx` command is not available.",
    };
  },
  async search(query, options, context) {
    const args = ["--yes", "clawhub", "search", query];
    const limit = commandLimitArg(options.limit);
    if (limit) args.push("--limit", limit);
    const result = await context.runner.exec("npx", args, {
      cwd: context.workspaceDir,
      env: context.env,
      timeoutMs: 30_000,
    });
    // Try JSON first (future-proof)
    const parsed = parseJsonEntries("clawhub", result.stdout);
    if (parsed) {
      return { entries: parsed };
    }
    // Parse text format: "slug  Label  (score)" per line
    const entries = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseClawhubLine(line))
      .filter((entry): entry is SkillCatalogEntry => !!entry);
    return { entries };
  },
  async resolveExact(ref) {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    return {
      source: "clawhub",
      slug: trimmed,
      label: titleizeSlug(trimmed),
      installRef: trimmed,
    };
  },
  async install(ref, context) {
    const trimmed = ref.trim();
    await context.runner.exec("npx", ["--yes", "clawhub", "install", trimmed], {
      cwd: context.workspaceDir,
      env: context.env,
      timeoutMs: 120_000,
    });
    const installedPath = resolveWorkspaceSkillPath(context.workspaceDir, trimmed);
    return {
      source: "clawhub",
      slug: trimmed,
      label: titleizeSlug(trimmed),
      installRef: trimmed,
      runtimeVisibility: installedPath ? "runtime" : "unknown",
      ...(installedPath ? { installedPaths: [installedPath] } : {}),
    };
  },
};

const clawicSource: SkillSourceAdapter = {
  id: "clawic",
  label: "Clawic",
  capabilities: {
    search: true,
    install: true,
    resolveExact: true,
  },
  async status(context) {
    const ready = await commandAvailable(context.runner, "npx", ["--help"], context.env);
    return {
      id: "clawic",
      label: "Clawic",
      status: ready ? "ready" : "unsupported",
      capabilities: this.capabilities,
      summary: ready ? "Discover and install Clawic skills from remote repositories." : "The `npx` command is not available.",
    };
  },
  async search(query, options, context) {
    const args = ["--yes", "clawic", "search", query];
    const limit = commandLimitArg(options.limit);
    if (limit) args.push("--limit", limit);
    const result = await context.runner.exec("npx", args, {
      cwd: context.workspaceDir,
      env: context.env,
      timeoutMs: 30_000,
    });
    // Try JSON first (future-proof)
    const parsed = parseJsonEntries("clawic", result.stdout);
    if (parsed) {
      return { entries: parsed };
    }
    // Parse text format: line 1 = "slug    Label", line 2 = "description"
    const entries = parseClawicTextOutput(result.stdout);
    return { entries };
  },
  async resolveExact(ref, context) {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    try {
      const result = await context.runner.exec("npx", ["--yes", "clawic", "show", trimmed], {
        cwd: context.workspaceDir,
        env: context.env,
        timeoutMs: 20_000,
      });
      const parsed = parseJsonEntries("clawic", result.stdout);
      if (parsed && parsed.length > 0) return parsed[0];
    } catch {
      // fall through to basic resolution
    }
    return {
      source: "clawic",
      slug: trimmed,
      label: titleizeSlug(trimmed),
      installRef: trimmed,
    };
  },
  async install(ref, context) {
    const trimmed = ref.trim();
    await context.runner.exec("npx", ["--yes", "clawic", "install", trimmed], {
      cwd: context.workspaceDir,
      env: context.env,
      timeoutMs: 120_000,
    });
    const installedPath = resolveWorkspaceSkillPath(context.workspaceDir, trimmed);
    return {
      source: "clawic",
      slug: trimmed,
      label: titleizeSlug(trimmed),
      installRef: trimmed,
      runtimeVisibility: installedPath ? "runtime" : "unknown",
      ...(installedPath ? { installedPaths: [installedPath] } : {}),
    };
  },
};

const skillsShSource: SkillSourceAdapter = {
  id: "skills.sh",
  label: "skills.sh",
  capabilities: {
    search: false,
    install: true,
    resolveExact: true,
  },
  async status(context) {
    const ready = await commandAvailable(context.runner, "npx", ["--help"], context.env);
    return {
      id: "skills.sh",
      label: "skills.sh",
      status: ready ? "ready" : "unsupported",
      capabilities: this.capabilities,
      summary: ready ? "Install and resolve exact refs through `npx skills add`." : "The `npx` command is not available.",
      warnings: ready ? ["General text search is not supported for skills.sh in v1."] : undefined,
    };
  },
  async resolveExact(ref) {
    const trimmed = ref.trim();
    if (!trimmed) return null;
    if (!isUrl(trimmed) && !isRepoLikeRef(trimmed)) {
      return null;
    }
    return {
      source: "skills.sh",
      slug: trimmed,
      label: titleizeSlug(trimmed.split("/").pop() ?? trimmed),
      installRef: trimmed,
    };
  },
  async install(ref, context) {
    const trimmed = ref.trim();
    await context.runner.exec("npx", ["--yes", "skills", "add", trimmed], {
      cwd: context.workspaceDir,
      env: context.env,
      timeoutMs: 120_000,
    });
    const installedPath = isUrl(trimmed) ? null : resolveWorkspaceSkillPath(context.workspaceDir, trimmed);
    return {
      source: "skills.sh",
      slug: trimmed,
      label: titleizeSlug(trimmed.split("/").pop() ?? trimmed),
      installRef: trimmed,
      runtimeVisibility: installedPath ? "runtime" : "external",
      ...(installedPath ? { installedPaths: [installedPath] } : {}),
    };
  },
};

const SOURCES: SkillSourceAdapter[] = [workspaceSource, clawhubSource, clawicSource, skillsShSource];

export function listSkillSources(): SkillSourceAdapter[] {
  return SOURCES;
}

export function getSkillSource(id: string): SkillSourceAdapter {
  const source = SOURCES.find((entry) => entry.id === id);
  if (!source) {
    throw new Error(`Unsupported skill source: ${id}`);
  }
  return source;
}

export function resolveSkillSourceFromRef(ref: string): SkillSourceAdapter | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("workspace:")) return workspaceSource;
  if (trimmed.startsWith("clawhub:")) return clawhubSource;
  if (trimmed.startsWith("clawic:")) return clawicSource;
  if (trimmed.startsWith("skills.sh:")) return skillsShSource;
  if (isUrl(trimmed)) return skillsShSource;
  if (isSimpleSlug(trimmed)) return workspaceSource;
  return null;
}

export function normalizeInstallRef(ref: string): string {
  const trimmed = ref.trim();
  if (trimmed.startsWith("workspace:")) return trimmed.slice("workspace:".length).trim();
  if (trimmed.startsWith("clawhub:")) return trimmed.slice("clawhub:".length).trim();
  if (trimmed.startsWith("clawic:")) return trimmed.slice("clawic:".length).trim();
  if (trimmed.startsWith("skills.sh:")) return trimmed.slice("skills.sh:".length).trim();
  return trimmed;
}
