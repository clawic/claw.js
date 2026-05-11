// Skills v2 — unified skill model (personality / procedure / snippet / role).
// Source-of-truth file format: SKILL.md (YAML frontmatter + markdown body).
// Standard: agentskills.io. Extension namespace: metadata.clawjs.*

import type { SoulModules } from "../types.ts";

export type SkillKind = "personality" | "procedure" | "snippet" | "role";
export type SkillScopeKind = "global" | "project" | "tag" | "chat";
export type SkillSyncMode = "symlink" | "copy";

export interface SkillScope {
  kind: SkillScopeKind;
  projectIds?: string[];
  tagFilters?: string[];
  chatId?: string;
}

export interface SkillParam {
  key: string;
  label: string;
  type: "string" | "enum" | "number" | "bool" | "secretRef";
  options?: string[];
  default?: unknown;
  required?: boolean;
  prompt?: string;
}

export interface SkillInstanceRef {
  ofTemplate: string;
  params: Record<string, unknown>;
  frozen: boolean;
}

export interface SkillCapsule {
  text: string;
  priority: number;
  readWhen?: string[];
}

/**
 * Soul module data when kind === "personality". Mirrors SoulSpec.modules
 * but kept loose here to avoid coupling skills-v2 to legacy soul shape.
 */
export interface SkillSoulModules {
  presetId?: string;
  modules?: Partial<SoulModules>;
}

export interface SkillPreset {
  slug: string;
  label: string;
  params: Record<string, unknown>;
}

export interface SkillRequiredEnvVar {
  name: string;
  prompt?: string;
  help?: string;
  required_for?: string;
}

export type SkillProvenance = "authored" | "distilled" | "imported";

export interface SkillLineage {
  fromSessionId?: string;
  fromTaskId?: string;
  distilledAt?: string;
  distilledBy?: string;
}

export interface SkillFrontmatter {
  // Standard agentskills.io fields
  name: string;
  description: string;
  version?: string;
  author?: string;
  platforms?: string[];

  required_environment_variables?: SkillRequiredEnvVar[];
  fallback_for_toolsets?: string[];
  requires_toolsets?: string[];
  requires_mcp_servers?: string[];

  // Clawjs extensions, all under metadata.clawjs.*
  metadata: {
    clawjs: SkillClawjsMetadata;
  };

  // Pass-through for any unknown frontmatter keys (forward-compat).
  [extraKey: string]: unknown;
}

export interface SkillClawjsMetadata {
  schemaVersion: 1;
  kind: SkillKind;
  scope?: SkillScope;
  tags?: string[];
  syncTo?: string[];
  syncMode?: SkillSyncMode;
  params?: SkillParam[];
  instance?: SkillInstanceRef;
  capsule?: SkillCapsule;
  soul?: SkillSoulModules;
  presets?: SkillPreset[];
  builtin?: boolean;
  importedFrom?: string;
  // Composite skill children (kind: role) — list of slugs to compose.
  children?: string[];
  // Projection target (legacy library compatibility): "soul" | "identity" | etc.
  projection?: string;
  // Authorship provenance. Defaults to "authored" when absent.
  // "distilled" means the skill was auto-created by runtime/ from a session.
  // "imported" means the skill came from agentskills.io / SOUL.md import.
  provenance?: SkillProvenance;
  // 0..1 confidence score, mainly meaningful for distilled skills.
  confidence?: number;
  // Lineage for distilled skills: where the skill came from and when.
  lineage?: SkillLineage;
  // Maintained by runtime/, used by skill picker UI and self-refinement.
  usageCount?: number;
  lastUsedAt?: string;
}

/** Active skill assignment per scope, persisted in ~/.clawjs/state.json. */
export interface SkillAssignment {
  slug: string;
  scope: SkillScope;
  priority: number;
  params?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SkillSpec {
  schemaVersion: 1;
  slug: string;
  name: string;
  description: string;
  version: string;
  kind: SkillKind;
  /** Markdown body (rendered if frozen instance, or template body otherwise). */
  body: string;
  frontmatter: SkillFrontmatter;
  /** Absolute path to SKILL.md. */
  filePath: string;
  /** Optional inferred fields. */
  scope?: SkillScope;
  tags?: string[];
}

export interface SkillCreateInput {
  slug?: string;
  name?: string;
  description?: string;
  kind: SkillKind;
  version?: string;
  body?: string;
  scope?: SkillScope;
  tags?: string[];
  syncTo?: string[];
  syncMode?: SkillSyncMode;
  params?: SkillParam[];
  capsule?: SkillCapsule;
  soul?: SkillSoulModules;
  presets?: SkillPreset[];
  builtin?: boolean;
  importedFrom?: string;
  children?: string[];
  projection?: string;
  /** Pass-through extra frontmatter values. */
  extra?: Record<string, unknown>;
}

export interface SkillUpdate {
  name?: string;
  description?: string;
  version?: string;
  body?: string;
  scope?: SkillScope;
  tags?: string[];
  syncTo?: string[];
  syncMode?: SkillSyncMode;
  params?: SkillParam[];
  capsule?: SkillCapsule | null;
  soul?: SkillSoulModules;
  presets?: SkillPreset[];
  children?: string[];
  projection?: string;
}

export interface SkillListFilter {
  kinds?: SkillKind[];
  scope?: SkillScopeKind;
  tags?: string[];
  builtin?: boolean;
}

export interface SkillSyncTarget {
  id: string;
  home: string;
  mode?: SkillSyncMode;
}

export interface SkillSyncReport {
  synced: Array<{ slug: string; target: string; mode: SkillSyncMode }>;
  removed: Array<{ slug: string; target: string }>;
  warnings: string[];
}

export interface SkillImportReport {
  imported: Array<{ slug: string; from: string; kind: SkillKind }>;
  skipped: Array<{ path: string; reason: string }>;
  warnings: string[];
}

export interface SkillResolveContext {
  projectId?: string;
  chatId?: string;
  tags?: string[];
}

/** Top-level Clawjs config persisted in ~/.clawjs/config.yaml. */
export interface ClawjsSkillsConfig {
  external_dirs?: string[];
  sync_targets?: SkillSyncTarget[];
}
