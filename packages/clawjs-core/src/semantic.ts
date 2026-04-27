import { z } from "zod";

export const semanticRiskLevelSchema = z.enum(["low", "medium", "high"]);

export const semanticObjectKindSchema = z.enum([
  "task",
  "file",
  "run",
  "repository",
  "secret",
  "message",
  "service",
  "document",
  "event",
  "payment",
  "person",
  "device",
  "artifact",
  "unknown",
]);

export const semanticActionKindSchema = z.enum([
  "read",
  "inspect",
  "summarize",
  "create",
  "modify",
  "delete",
  "move",
  "send",
  "execute",
  "approve",
  "cancel",
  "publish",
  "share",
  "reserve",
  "buy",
  "validate",
  "propose",
]);

export const semanticEffectKindSchema = z.enum([
  "read",
  "write",
  "execute",
  "network",
  "financial",
  "legal",
  "reputation",
  "notification",
  "publication",
  "permission",
  "cost",
  "none",
]);

export const permissionRequirementSchema = z.object({
  id: z.string().min(1),
  capability: z.string().min(1),
  scope: z.string().min(1),
  duration: z.string().min(1).optional(),
  costLimit: z.string().min(1).optional(),
  risk: semanticRiskLevelSchema,
  requiresHumanApproval: z.boolean().default(false),
});

export const intentSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  requestedBy: z.string().min(1).optional(),
  constraints: z.array(z.string().min(1)).default([]),
});

export const semanticObjectSchema = z.object({
  id: z.string().min(1),
  kind: semanticObjectKindSchema,
  label: z.string().min(1),
  ref: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const effectPreviewSchema = z.object({
  id: z.string().min(1),
  kind: semanticEffectKindSchema,
  description: z.string().min(1),
  objectIds: z.array(z.string().min(1)).default([]),
  reversible: z.boolean().default(false),
  risk: semanticRiskLevelSchema,
});

export const semanticActionSchema = z.object({
  id: z.string().min(1),
  type: semanticActionKindSchema,
  label: z.string().min(1),
  objectIds: z.array(z.string().min(1)).default([]),
  effectIds: z.array(z.string().min(1)).default([]),
  permissionIds: z.array(z.string().min(1)).default([]),
  risk: semanticRiskLevelSchema,
  requiresHumanApproval: z.boolean().default(false),
});

export const actionReceiptSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
  status: z.enum(["planned", "succeeded", "failed", "cancelled", "skipped"]),
  actor: z.string().min(1),
  permissionId: z.string().min(1).optional(),
  result: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

export const semanticPlanSchema = z.object({
  schemaVersion: z.literal(1),
  intent: intentSchema,
  objects: z.array(semanticObjectSchema).default([]),
  actions: z.array(semanticActionSchema).default([]),
  effects: z.array(effectPreviewSchema).default([]),
  permissions: z.array(permissionRequirementSchema).default([]),
  receipts: z.array(actionReceiptSchema).default([]),
  provenance: z.array(z.string().min(1)).default([]),
});

export type SemanticRiskLevel = z.infer<typeof semanticRiskLevelSchema>;
export type SemanticObjectKind = z.infer<typeof semanticObjectKindSchema>;
export type SemanticActionKind = z.infer<typeof semanticActionKindSchema>;
export type SemanticEffectKind = z.infer<typeof semanticEffectKindSchema>;
export type PermissionRequirement = z.infer<typeof permissionRequirementSchema>;
export type Intent = z.infer<typeof intentSchema>;
export type SemanticObject = z.infer<typeof semanticObjectSchema>;
export type EffectPreview = z.infer<typeof effectPreviewSchema>;
export type SemanticAction = z.infer<typeof semanticActionSchema>;
export type ActionReceipt = z.infer<typeof actionReceiptSchema>;
export type SemanticPlan = z.infer<typeof semanticPlanSchema>;
