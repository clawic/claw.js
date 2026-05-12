import { z } from "zod";

export const clawContractVersionV1 = 1;

export const clawDomainSchema = z.enum([
  "agents",
  "skills",
  "design",
  "sessions",
  "projects",
  "memory",
  "files",
  "productivity",
  "calendar",
  "contacts",
  "reminders",
  "mail",
  "notes",
  "messages",
  "browser",
  "terminal",
  "voice",
  "models",
  "services",
  "database",
  "integrations",
  "system",
  "secrets",
  "mini_apps",
]);

export const clawHostKindSchema = z.enum(["standalone", "embedded", "third_party"]);
export const clawHostTransportSchema = z.enum(["xpc", "unix_socket", "http", "stdio"]);
export const clawRiskLevelSchema = z.enum(["read", "write", "destructive", "cost", "system"]);
export const clawValidationModeSchema = z.enum(["fixture", "dry_run", "host_isolated", "host_real"]);
export const clawApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired", "revoked"]);
export const clawGrantStatusSchema = z.enum(["active", "revoked", "expired"]);

export const clawHostEndpointSchema = z.object({
  transport: clawHostTransportSchema,
  address: z.string().min(1),
  tokenRef: z.string().min(1).optional(),
});

export const clawCapabilitySchema = z.object({
  id: z.string().min(1),
  domain: clawDomainSchema,
  actions: z.array(z.string().min(1)),
  riskLevel: clawRiskLevelSchema,
  brokerRequired: z.boolean().default(false),
  destructive: z.boolean().default(false),
  costSensitive: z.boolean().default(false),
  requiresOSPermission: z.boolean().default(false),
  osPermissionState: z.enum(["not_requested", "denied", "authorized", "not_applicable", "unknown"]).default("unknown"),
});

export const clawHostDescriptorSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  displayName: z.string().min(1),
  kind: clawHostKindSchema,
  bundleId: z.string().min(1).optional(),
  executablePath: z.string().min(1).optional(),
  appSupportDir: z.string().min(1).optional(),
  endpoint: clawHostEndpointSchema.optional(),
  capabilities: z.array(clawCapabilitySchema).default([]),
  registeredAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const clawClientContextSchema = z.object({
  pid: z.number().int().optional(),
  bundleId: z.string().min(1).optional(),
  executablePath: z.string().min(1).optional(),
  signingIdentity: z.string().min(1).optional(),
  tty: z.boolean().optional(),
});

export const clawCommandRequestSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  requestId: z.string().min(1),
  domain: clawDomainSchema,
  resource: z.string().min(1),
  action: z.string().min(1),
  arguments: z.record(z.unknown()).default({}),
  clientContext: clawClientContextSchema.default({}),
  validationMode: clawValidationModeSchema.default("host_real"),
});

export const clawCommandErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});

export const clawCommandResponseSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  requestId: z.string().min(1),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: clawCommandErrorSchema.optional(),
  meta: z.object({
    hostId: z.string().min(1).optional(),
    capabilityId: z.string().min(1).optional(),
    riskLevel: clawRiskLevelSchema.default("read"),
    validationMode: clawValidationModeSchema.default("host_real"),
    durationMs: z.number().int().nonnegative().default(0),
  }).default({}),
});

export const clawGrantSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  hostId: z.string().min(1),
  capabilityId: z.string().min(1),
  domain: clawDomainSchema,
  action: z.string().min(1),
  status: clawGrantStatusSchema,
  reason: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1).nullable().optional(),
  revokedAt: z.string().min(1).nullable().optional(),
});

export const clawApprovalSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  hostId: z.string().min(1),
  requestId: z.string().min(1),
  capabilityId: z.string().min(1),
  status: clawApprovalStatusSchema,
  riskLevel: clawRiskLevelSchema,
  reason: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  decidedAt: z.string().min(1).nullable().optional(),
});

export const clawAuditEventSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  hostId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  capabilityId: z.string().min(1).optional(),
  domain: clawDomainSchema.optional(),
  action: z.string().min(1).optional(),
  riskLevel: clawRiskLevelSchema.optional(),
  result: z.enum(["ok", "denied", "error", "dry_run"]),
  message: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});

export const clawHostRegistrySchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  activeHostId: z.string().min(1).nullable().default(null),
  hosts: z.array(clawHostDescriptorSchema).default([]),
  updatedAt: z.string().min(1),
});

export const clawContractSchemasV1 = {
  commandRequest: clawCommandRequestSchema,
  commandResponse: clawCommandResponseSchema,
  commandError: clawCommandErrorSchema,
  hostDescriptor: clawHostDescriptorSchema,
  hostRegistry: clawHostRegistrySchema,
  capability: clawCapabilitySchema,
  grant: clawGrantSchema,
  approval: clawApprovalSchema,
  auditEvent: clawAuditEventSchema,
};

export type ClawDomain = z.infer<typeof clawDomainSchema>;
export type ClawHostDescriptor = z.infer<typeof clawHostDescriptorSchema>;
export type ClawHostRegistry = z.infer<typeof clawHostRegistrySchema>;
export type ClawCapability = z.infer<typeof clawCapabilitySchema>;
export type ClawCommandRequest = z.infer<typeof clawCommandRequestSchema>;
export type ClawCommandResponse = z.infer<typeof clawCommandResponseSchema>;
export type ClawGrant = z.infer<typeof clawGrantSchema>;
export type ClawApproval = z.infer<typeof clawApprovalSchema>;
export type ClawAuditEvent = z.infer<typeof clawAuditEventSchema>;
