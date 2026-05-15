// Zod schemas for skills-v2 runtime validation. Lenient by design: SKILL.md
// authored by humans or other tools may carry unknown fields. We validate the
// *structural* shape and pass through unknowns at the top level.

import { z } from "zod";

export const skillKindSchema = z.enum(["personality", "procedure", "snippet", "role"]);
export const skillScopeKindSchema = z.enum(["global", "project", "tag", "session"]);
export const skillSyncModeSchema = z.enum(["symlink", "copy"]);

export const skillScopeSchema = z.object({
  kind: skillScopeKindSchema,
  projectIds: z.array(z.string().min(1)).optional(),
  tagFilters: z.array(z.string().min(1)).optional(),
  sessionId: z.string().min(1).optional(),
});

export const skillParamSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["string", "enum", "number", "bool", "secretRef"]),
  options: z.array(z.string()).optional(),
  default: z.unknown().optional(),
  required: z.boolean().optional(),
  prompt: z.string().optional(),
});

export const skillInstanceRefSchema = z.object({
  ofTemplate: z.string().min(1),
  params: z.record(z.unknown()),
  frozen: z.boolean(),
});

export const skillCapsuleSchema = z.object({
  text: z.string().min(1).max(300),
  priority: z.number().int(),
  readWhen: z.array(z.string().min(1)).optional(),
});

export const skillSoulModulesSchema = z.object({
  presetId: z.string().min(1).optional(),
  modules: z.record(z.unknown()).optional(),
});

export const skillPresetSchema = z.object({
  slug: z.string().min(1),
  label: z.string().min(1),
  params: z.record(z.unknown()),
});

export const skillRequiredEnvVarSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().optional(),
  help: z.string().optional(),
  required_for: z.string().optional(),
});

export const skillProvenanceSchema = z.enum(["authored", "distilled", "imported"]);

export const skillLineageSchema = z.object({
  fromSessionId: z.string().min(1).optional(),
  fromTaskId: z.string().min(1).optional(),
  distilledAt: z.string().min(1).optional(),
  distilledBy: z.string().min(1).optional(),
});

export const skillClawjsMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  kind: skillKindSchema,
  scope: skillScopeSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  syncTo: z.array(z.string().min(1)).optional(),
  syncMode: skillSyncModeSchema.optional(),
  params: z.array(skillParamSchema).optional(),
  instance: skillInstanceRefSchema.optional(),
  capsule: skillCapsuleSchema.optional(),
  soul: skillSoulModulesSchema.optional(),
  presets: z.array(skillPresetSchema).optional(),
  builtin: z.boolean().optional(),
  importedFrom: z.string().min(1).optional(),
  children: z.array(z.string().min(1)).optional(),
  projection: z.string().min(1).optional(),
  provenance: skillProvenanceSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  lineage: skillLineageSchema.optional(),
  usageCount: z.number().int().nonnegative().optional(),
  lastUsedAt: z.string().min(1).optional(),
}).passthrough();

export const skillFrontmatterSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().optional(),
  author: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  required_environment_variables: z.array(skillRequiredEnvVarSchema).optional(),
  fallback_for_toolsets: z.array(z.string()).optional(),
  requires_toolsets: z.array(z.string()).optional(),
  requires_mcp_servers: z.array(z.string()).optional(),
  metadata: z.object({
    clawjs: skillClawjsMetadataSchema,
  }).passthrough(),
}).passthrough();

export const skillSyncTargetSchema = z.object({
  id: z.string().min(1),
  home: z.string().min(1),
  mode: skillSyncModeSchema.optional(),
});

export const skillAssignmentSchema = z.object({
  slug: z.string().min(1),
  scope: skillScopeSchema,
  priority: z.number().int(),
  params: z.record(z.unknown()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const skillsStateSchema = z.object({
  schemaVersion: z.literal(1),
  assignments: z.array(skillAssignmentSchema),
  updatedAt: z.string().min(1),
});

export const clawjsSkillsConfigSchema = z.object({
  external_dirs: z.array(z.string().min(1)).optional(),
  sync_targets: z.array(skillSyncTargetSchema).optional(),
});
