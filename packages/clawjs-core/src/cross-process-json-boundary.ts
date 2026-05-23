import { z } from "zod";

import {
  AGENT_ASSIGNMENT_KINDS,
  AGENT_ASSIGNMENT_STATUSES,
} from "./agents-v1-types.ts";
import {
  clawCommandRequestSchema,
} from "./host-contracts.ts";
import {
  macActionPlanSchema,
  macActionReceiptSchema,
  macActionRequestSchema,
  macPermissionStateSchema,
} from "./mac-control-plane.ts";
import { clawProjectManifestSchema } from "./project-manifest.ts";
import { syncResourceManifestSchema } from "./remote-sync-schemas.ts";

export const clawCrossProcessJsonContractLimits = {
  "claw.protocol.hostCommand.v1": 64 * 1024,
  "claw.mac.actionRequest.v1": 128 * 1024,
  "claw.mac.actionPlan.v1": 128 * 1024,
  "claw.mac.actionReceipt.v1": 128 * 1024,
  "claw.mac.permissionState.v1": 64 * 1024,
  "claw.workspace.manifest": 256 * 1024,
  "claw.api.sync.manifests": 256 * 1024,
  "claw.schema.commandIntents.v1": 512 * 1024,
  "claw.agent_assignment.runtime.v1": 128 * 1024,
  "claw.mcp.agents.v1": 256 * 1024,
} as const;

export type ClawCrossProcessJsonContractId = keyof typeof clawCrossProcessJsonContractLimits;

export type ClawCrossProcessJsonErrorCode =
  | "json_contract_payload_oversized"
  | "json_contract_truncated"
  | "json_contract_malformed"
  | "json_contract_unknown_fields"
  | "json_contract_schema_invalid";

export interface ParseCrossProcessJsonContractOptions {
  contractId: string;
  maxBytes: number;
  allowedTopLevelKeys?: readonly string[];
}

export type CrossProcessJsonParseResult<T> =
  | {
    ok: true;
    contractId: string;
    byteLength: number;
    value: T;
  }
  | {
    ok: false;
    contractId: string;
    byteLength: number;
    error: {
      code: ClawCrossProcessJsonErrorCode;
      message: string;
      maxBytes?: number;
      fields?: string[];
      issues?: Array<{ path: string; message: string; code: string }>;
    };
  };

const textEncoder = new TextEncoder();

function normalizeJsonInput(input: string | Uint8Array): string {
  return typeof input === "string" ? input : new TextDecoder("utf8", { fatal: false }).decode(input);
}

function jsonByteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function isJsonTruncationError(error: unknown, text: string): boolean {
  const trimmed = text.trim();
  const looksCutOff = (trimmed.startsWith("{") && !/[}\]]$/.test(trimmed))
    || (trimmed.startsWith("[") && !/[\]}]$/.test(trimmed));
  return error instanceof SyntaxError
    && (looksCutOff || /unexpected end|unterminated|end of json input|after property value in json|after array element in json/i.test(error.message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function zodIssues(error: z.ZodError): Array<{ path: string; message: string; code: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

const clawCommandIntentEntrySchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  phrase: z.string().min(1),
  normalizedPhrase: z.string().min(1),
  language: z.string().min(1),
  purpose: z.string().min(1),
  status: z.enum(["covered", "candidate_alias", "gap", "future", "blocked", "external_pending"]),
  source: z.enum(["registry", "ledger"]),
  mappedCommand: z.string().min(1).optional(),
  relatedCommands: z.array(z.string().min(1)),
  risk: z.array(z.enum(["local_read", "local_write", "destructive", "cost", "native_permission", "secret", "physical_world", "external_service"])),
  evidence: z.array(z.string().min(1)),
  nextSteps: z.array(z.string().min(1)),
  reportTarget: z.string().min(1),
  createdAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1).optional(),
}).strict();

const clawCommandIntentLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  intents: z.array(clawCommandIntentEntrySchema),
  updatedAt: z.string().min(1),
}).strict();

const agentAssignmentRouteSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  kind: z.enum(AGENT_ASSIGNMENT_KINDS),
  status: z.enum(AGENT_ASSIGNMENT_STATUSES),
  channel: z.string().min(1).optional(),
  endpointRef: z.string().min(1).optional(),
  privacyPolicy: z.enum(["off", "hashed", "raw_with_retention"]).optional(),
  telemetryRetentionDays: z.number().int().positive().optional(),
  externalDisclosure: z.enum(["transparent_agent", "custom_agent_wording"]).optional(),
  startsAt: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
  scopeType: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  respondOnlyDefault: z.boolean().optional(),
}).strict();

const agentAssignmentRouteRequestSchema = z.object({
  assignment: agentAssignmentRouteSchema.nullable().optional(),
  kind: z.enum(AGENT_ASSIGNMENT_KINDS),
  channel: z.string().min(1).optional(),
  endpointRef: z.string().min(1).optional(),
  now: z.string().min(1).optional(),
}).strict();

const agentAssignmentRuntimeHandoffSchema = z.object({
  schemaVersion: z.literal(1),
  route: agentAssignmentRouteRequestSchema,
}).strict();

const agentResourceActionSchema = z.enum([
  "read",
  "write",
  "create",
  "update",
  "delete",
  "execute",
  "invoke",
  "lease_secret",
  "approve",
  "*",
]);

const agentResourceGrantSchema = z.object({
  id: z.string().min(1).optional(),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  action: agentResourceActionSchema,
  scopeType: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  effect: z.enum(["allow", "deny"]).optional(),
  expiresAt: z.string().min(1).optional(),
}).strict();

const agentAccessRequestSchema = z.object({
  resourceType: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  action: agentResourceActionSchema,
  scopeType: z.string().min(1).optional(),
  scopeId: z.string().min(1).optional(),
  regulatedSafety: z.record(z.unknown()).optional(),
}).strict();

const agentEffectiveAccessInputSchema = z.object({
  requested: agentAccessRequestSchema,
  agentGrants: z.array(agentResourceGrantSchema).optional(),
  assignmentGrants: z.array(agentResourceGrantSchema).optional(),
  executionProfileGrants: z.array(agentResourceGrantSchema).optional(),
  connectorGrants: z.array(agentResourceGrantSchema).optional(),
  hostGrants: z.array(agentResourceGrantSchema).optional(),
  runScopeGrants: z.array(agentResourceGrantSchema).optional(),
  now: z.string().min(1).optional(),
}).strict();

const mcpAgentAssignmentPolicySchema = z.object({
  schemaVersion: z.literal(1),
  route: agentAssignmentRouteRequestSchema,
  access: agentEffectiveAccessInputSchema,
}).strict();

export function parseCrossProcessJsonContract<T>(
  input: string | Uint8Array,
  schema: z.ZodType<T>,
  options: ParseCrossProcessJsonContractOptions,
): CrossProcessJsonParseResult<T> {
  const text = normalizeJsonInput(input);
  const byteLength = jsonByteLength(text);
  if (byteLength > options.maxBytes) {
    return {
      ok: false,
      contractId: options.contractId,
      byteLength,
      error: {
        code: "json_contract_payload_oversized",
        message: `${options.contractId} JSON payload exceeds ${options.maxBytes} bytes`,
        maxBytes: options.maxBytes,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      contractId: options.contractId,
      byteLength,
      error: {
        code: isJsonTruncationError(error, text) ? "json_contract_truncated" : "json_contract_malformed",
        message: error instanceof Error ? error.message : `${options.contractId} JSON payload is malformed`,
      },
    };
  }

  if (options.allowedTopLevelKeys && isRecord(parsed)) {
    const allowed = new Set(options.allowedTopLevelKeys);
    const fields = Object.keys(parsed).filter((key) => !allowed.has(key));
    if (fields.length > 0) {
      return {
        ok: false,
        contractId: options.contractId,
        byteLength,
        error: {
          code: "json_contract_unknown_fields",
          message: `${options.contractId} JSON payload contains unsupported top-level fields`,
          fields,
        },
      };
    }
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      contractId: options.contractId,
      byteLength,
      error: {
        code: "json_contract_schema_invalid",
        message: `${options.contractId} JSON payload failed schema validation`,
        issues: zodIssues(result.error),
      },
    };
  }

  return {
    ok: true,
    contractId: options.contractId,
    byteLength,
    value: result.data,
  };
}

export function parseClawHostCommandRequestJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, clawCommandRequestSchema, {
    contractId: "claw.protocol.hostCommand.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.protocol.hostCommand.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "requestId",
      "domain",
      "resource",
      "action",
      "arguments",
      "clientContext",
      "validationMode",
    ],
  });
}

export function parseMacActionRequestJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, macActionRequestSchema, {
    contractId: "claw.mac.actionRequest.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.actionRequest.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "requestId",
      "capabilityId",
      "actor",
      "host",
      "target",
      "arguments",
      "dryRun",
      "reason",
    ],
  });
}

export function parseMacActionPlanJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, macActionPlanSchema, {
    contractId: "claw.mac.actionPlan.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.actionPlan.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "planId",
      "requestId",
      "capabilityId",
      "risk",
      "coverageState",
      "actor",
      "host",
      "resolvedTarget",
      "permissionRequirements",
      "requiredApprovals",
      "rollback",
      "willMutate",
      "executable",
      "blockedReasons",
      "relatedSurfaces",
    ],
  });
}

export function parseMacActionReceiptJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, macActionReceiptSchema, {
    contractId: "claw.mac.actionReceipt.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.actionReceipt.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "id",
      "requestId",
      "planId",
      "capabilityId",
      "actor",
      "host",
      "result",
      "risk",
      "permissionSnapshotRefs",
      "beforeRef",
      "afterRef",
      "auditId",
      "revert",
      "secretRefs",
      "redaction",
      "createdAt",
    ],
  });
}

export function parseMacPermissionStateJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, macPermissionStateSchema, {
    contractId: "claw.mac.permissionState.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.mac.permissionState.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "permissionId",
      "host",
      "osState",
      "frameworkGrant",
      "requestedBefore",
      "canRequest",
      "requiresRestart",
      "source",
      "guidance",
      "firstUsedAt",
      "lastCheckedAt",
      "lastRequestedAt",
      "lastRequestResult",
      "revocationDetectedAt",
    ],
  });
}

export function parseClawProjectManifestJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, clawProjectManifestSchema, {
    contractId: "claw.workspace.manifest",
    maxBytes: clawCrossProcessJsonContractLimits["claw.workspace.manifest"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "manifestKind",
      "projectId",
      "type",
      "name",
      "title",
      "primaryFolder",
      "folderRefs",
      "workspaceBinding",
      "attachment",
      "runtime",
      "directories",
      "resources",
      "createdAt",
      "updatedAt",
    ],
  });
}

export function parseSyncResourceManifestJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, syncResourceManifestSchema, {
    contractId: "claw.api.sync.manifests",
    maxBytes: clawCrossProcessJsonContractLimits["claw.api.sync.manifests"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "resourceId",
      "kind",
      "ownerNodeId",
      "authority",
      "residency",
      "driver",
      "conflictPolicy",
      "cachePolicy",
      "allowedPeerNodeIds",
      "routeIds",
      "secretPolicy",
    ],
  });
}

export function parseClawCommandIntentLedgerJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, clawCommandIntentLedgerSchema, {
    contractId: "claw.schema.commandIntents.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.schema.commandIntents.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "intents",
      "updatedAt",
    ],
  });
}

export function parseAgentAssignmentRuntimeHandoffJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, agentAssignmentRuntimeHandoffSchema, {
    contractId: "claw.agent_assignment.runtime.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.agent_assignment.runtime.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "route",
    ],
  });
}

export function parseMcpAgentAssignmentPolicyJson(input: string | Uint8Array) {
  return parseCrossProcessJsonContract(input, mcpAgentAssignmentPolicySchema, {
    contractId: "claw.mcp.agents.v1",
    maxBytes: clawCrossProcessJsonContractLimits["claw.mcp.agents.v1"],
    allowedTopLevelKeys: [
      "schemaVersion",
      "route",
      "access",
    ],
  });
}
