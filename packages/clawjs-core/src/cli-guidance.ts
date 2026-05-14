import { z } from "zod";

export const actorKindSchema = z.enum(["human", "agent", "automation", "unknown"]);
export const actorTrustSourceSchema = z.enum(["signed-host", "agent-runtime", "untrusted", "unknown"]);

export type ActorKind = z.infer<typeof actorKindSchema>;
export type ActorTrustSource = z.infer<typeof actorTrustSourceSchema>;

export const actorAssertionSchema = z.object({
  schemaVersion: z.literal(1),
  actorKind: actorKindSchema.exclude(["unknown"]),
  actorId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  hostId: z.string().min(1),
  issuedAt: z.string().min(1),
  expiresAt: z.string().min(1),
  scope: z.array(z.string().min(1)).default([]),
  trustSource: actorTrustSourceSchema.exclude(["untrusted", "unknown"]),
  issuer: z.string().min(1).optional(),
  keyId: z.string().min(1).optional(),
  signature: z.string().min(1),
});

export type ActorAssertion = z.infer<typeof actorAssertionSchema>;

export interface ActorContext {
  actorKind: ActorKind;
  actorId?: string;
  sessionId?: string;
  runId?: string;
  hostId?: string;
  issuedAt?: string;
  expiresAt?: string;
  scope: string[];
  trustSource: ActorTrustSource;
  verified: boolean;
  reason?: string;
}

export interface ActorAssertionVerificationResult {
  ok: boolean;
  actor: ActorContext;
  reason?: string;
}

export const guidanceSeveritySchema = z.enum(["info", "notice", "warning", "critical"]);
export const guidanceStatusSchema = z.enum(["active", "archived"]);
export const guidanceRiskClassSchema = z.enum([
  "read",
  "write",
  "destructive",
  "cost",
  "native-permission",
  "secret",
]);

export type GuidanceSeverity = z.infer<typeof guidanceSeveritySchema>;
export type GuidanceStatus = z.infer<typeof guidanceStatusSchema>;
export type GuidanceRiskClass = z.infer<typeof guidanceRiskClassSchema>;

export const guidanceMatchConditionSchema = z.object({
  commands: z.array(z.string().min(1)).optional(),
  flags: z.array(z.string().min(1)).optional(),
  argIncludes: z.array(z.string().min(1)).optional(),
  cwdPrefixes: z.array(z.string().min(1)).optional(),
  domains: z.array(z.string().min(1)).optional(),
  services: z.array(z.string().min(1)).optional(),
  hostnames: z.array(z.string().min(1)).optional(),
  urls: z.array(z.string().min(1)).optional(),
  secretRefs: z.array(z.string().min(1)).optional(),
  resourceIds: z.array(z.string().min(1)).optional(),
  projects: z.array(z.string().min(1)).optional(),
  workspaces: z.array(z.string().min(1)).optional(),
  agents: z.array(z.string().min(1)).optional(),
  actorKinds: z.array(actorKindSchema).optional(),
  riskClasses: z.array(guidanceRiskClassSchema).optional(),
}).strict();

export type GuidanceMatchCondition = z.infer<typeof guidanceMatchConditionSchema>;

export const guidanceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  status: guidanceStatusSchema,
  title: z.string().min(1),
  capsule: z.string().min(1).max(240),
  details: z.string().min(1).optional(),
  severity: guidanceSeveritySchema.default("notice"),
  priority: z.number().int().default(100),
  applyWhen: guidanceMatchConditionSchema.default({}),
  resourceIds: z.array(z.string().min(1)).default([]),
  commands: z.array(z.string().min(1)).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
});

export type GuidanceRecord = z.infer<typeof guidanceRecordSchema>;

export const guidanceStateSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(guidanceRecordSchema),
  updatedAt: z.string().min(1),
});

export type GuidanceState = z.infer<typeof guidanceStateSchema>;

export interface GuidanceInput {
  id?: string;
  title: string;
  capsule: string;
  details?: string;
  severity?: GuidanceSeverity;
  priority?: number;
  applyWhen?: GuidanceMatchCondition;
  resourceIds?: string[];
  commands?: string[];
}

export interface GuidanceMatchInput {
  command?: string;
  flags?: string[];
  args?: string[];
  cwd?: string;
  domain?: string;
  service?: string;
  hostname?: string;
  url?: string;
  secretRef?: string;
  resourceIds?: string[];
  project?: string;
  workspace?: string;
  agent?: string;
  actorKind?: ActorKind;
  riskClass?: GuidanceRiskClass;
  limit?: number;
}

export interface GuidanceHint {
  id: string;
  severity: GuidanceSeverity;
  capsule: string;
  reason: string;
  resourceIds: string[];
  commands: string[];
}

export interface GuidanceMatchResult {
  input: GuidanceMatchInput;
  hints: GuidanceHint[];
}

export const resourceKindSchema = z.enum([
  "file",
  "directory",
  "project",
  "workspace",
  "server",
  "secret-ref",
  "document",
  "instruction",
  "other",
]);
export const resourceStatusSchema = z.enum(["active", "missing", "moved", "stale"]);

export type ResourceKind = z.infer<typeof resourceKindSchema>;
export type ResourceStatus = z.infer<typeof resourceStatusSchema>;

export const resourceLocatorSchema = z.object({
  kind: z.enum(["path", "url", "hostname", "secret-ref", "opaque"]),
  value: z.string().min(1),
}).strict();

export type ResourceLocator = z.infer<typeof resourceLocatorSchema>;

export const resourceRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^res_[a-z0-9]+$/),
  kind: resourceKindSchema,
  status: resourceStatusSchema,
  locator: resourceLocatorSchema,
  scope: z.object({
    workspaceId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
  }).default({}),
  label: z.string().min(1).optional(),
  fingerprint: z.string().min(1).optional(),
  bookmark: z.string().min(1).optional(),
  fileIdentity: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  lastSeenAt: z.string().min(1).optional(),
  missingSince: z.string().min(1).optional(),
});

export type ResourceRecord = z.infer<typeof resourceRecordSchema>;

export const resourceRegistryStateSchema = z.object({
  schemaVersion: z.literal(1),
  resources: z.array(resourceRecordSchema),
  updatedAt: z.string().min(1),
});

export type ResourceRegistryState = z.infer<typeof resourceRegistryStateSchema>;

export interface ResourceRegisterInput {
  id?: string;
  kind?: ResourceKind;
  locator: ResourceLocator;
  scope?: ResourceRecord["scope"];
  label?: string;
  fingerprint?: string;
  bookmark?: string;
  fileIdentity?: string;
}
