import { clawContractVersionV1 } from "./host-contracts.ts";

type JsonSchema = Record<string, unknown>;

const stringSchema = { type: "string", minLength: 1 };
const booleanSchema = { type: "boolean" };

const domainEnum = [
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
];

export const clawJsonSchemasV1 = {
  commandRequest: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.claw.dev/v1/command-request.schema.json",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "requestId", "domain", "resource", "action"],
    properties: {
      schemaVersion: { const: clawContractVersionV1 },
      requestId: stringSchema,
      domain: { type: "string", enum: domainEnum },
      resource: stringSchema,
      action: stringSchema,
      arguments: { type: "object" },
      clientContext: {
        type: "object",
        additionalProperties: false,
        properties: {
          pid: { type: "integer" },
          bundleId: stringSchema,
          executablePath: stringSchema,
          signingIdentity: stringSchema,
          tty: booleanSchema,
        },
      },
      validationMode: { type: "string", enum: ["fixture", "dry_run", "host_isolated", "host_real"] },
    },
  },
  commandResponse: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.claw.dev/v1/command-response.schema.json",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "requestId", "ok"],
    properties: {
      schemaVersion: { const: clawContractVersionV1 },
      requestId: stringSchema,
      ok: booleanSchema,
      data: true,
      error: { $ref: "https://schemas.claw.dev/v1/command-error.schema.json" },
      meta: {
        type: "object",
        properties: {
          hostId: stringSchema,
          capabilityId: stringSchema,
          riskLevel: { type: "string", enum: ["read", "write", "destructive", "cost", "system"] },
          validationMode: { type: "string", enum: ["fixture", "dry_run", "host_isolated", "host_real"] },
          durationMs: { type: "integer", minimum: 0 },
        },
      },
    },
  },
  commandError: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.claw.dev/v1/command-error.schema.json",
    type: "object",
    additionalProperties: false,
    required: ["code", "message"],
    properties: {
      code: stringSchema,
      message: stringSchema,
      details: { type: "object" },
    },
  },
  capability: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.claw.dev/v1/capability.schema.json",
    type: "object",
    required: ["id", "domain", "actions", "riskLevel"],
    properties: {
      id: stringSchema,
      domain: { type: "string", enum: domainEnum },
      actions: { type: "array", items: stringSchema },
      riskLevel: { type: "string", enum: ["read", "write", "destructive", "cost", "system"] },
      brokerRequired: booleanSchema,
      destructive: booleanSchema,
      costSensitive: booleanSchema,
      requiresOSPermission: booleanSchema,
      osPermissionState: { type: "string", enum: ["not_requested", "denied", "authorized", "not_applicable", "unknown"] },
    },
  },
  hostDescriptor: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://schemas.claw.dev/v1/host-descriptor.schema.json",
    type: "object",
    required: ["schemaVersion", "id", "displayName", "kind", "registeredAt", "updatedAt"],
    properties: {
      schemaVersion: { const: clawContractVersionV1 },
      id: stringSchema,
      displayName: stringSchema,
      kind: { type: "string", enum: ["standalone", "embedded", "third_party"] },
      bundleId: stringSchema,
      executablePath: stringSchema,
      appSupportDir: stringSchema,
      endpoint: {
        type: "object",
        required: ["transport", "address"],
        properties: {
          transport: { type: "string", enum: ["xpc", "unix_socket", "http", "stdio"] },
          address: stringSchema,
          tokenRef: stringSchema,
        },
      },
      capabilities: { type: "array", items: { $ref: "https://schemas.claw.dev/v1/capability.schema.json" } },
      registeredAt: stringSchema,
      updatedAt: stringSchema,
    },
  },
} satisfies Record<string, JsonSchema>;
