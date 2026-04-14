import type {
  VaultSecretCapabilityStatus,
  VaultSecretMetadata,
  VaultSecretTypeDescriptor,
  VaultTypedActionDescriptor,
  VaultCapability,
} from "../shared/types.ts";
import type { VaultActor, VaultClaims } from "./auth.ts";
import type { VaultDatabase } from "./db.ts";
import { isAllowed } from "./policy.ts";

export const VAULT_SECRET_TYPES: VaultSecretTypeDescriptor[] = [
  {
    typeId: "generic.api_key",
    label: "Generic API key",
    description: "Single opaque token injected into HTTP headers.",
    kind: "api_key",
    defaultAllowedHosts: [],
    defaultAllowedHeaderNames: ["Authorization", "X-API-Key"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: true,
    defaultLeaseModes: ["process"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
    fields: [],
    actions: [],
  },
  {
    typeId: "generic.bearer_token",
    label: "Generic bearer token",
    description: "HTTP bearer token for brokered API calls.",
    kind: "token",
    defaultAllowedHosts: [],
    defaultAllowedHeaderNames: ["Authorization"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: true,
    defaultLeaseModes: ["process"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
    fields: [],
    actions: [],
  },
  {
    typeId: "generic.basic_auth",
    label: "Basic auth credential",
    description: "Username in metadata, password encrypted as the secret value.",
    kind: "basic_auth",
    defaultAllowedHosts: [],
    defaultAllowedHeaderNames: ["Authorization"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: true,
    defaultLeaseModes: ["process"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
    fields: [{
      id: "username",
      label: "Username",
      kind: "string",
      required: true,
      placeholder: "service-account",
    }],
    actions: [],
  },
  {
    typeId: "generic.oauth_client",
    label: "OAuth client",
    description: "Client id in metadata, client secret encrypted as the secret value.",
    kind: "oauth_client",
    defaultAllowedHosts: [],
    defaultAllowedHeaderNames: ["Authorization"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: true,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: false,
    defaultLeaseModes: ["process", "browser"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process", "lease.browser"],
    fields: [{
      id: "clientId",
      label: "Client ID",
      kind: "string",
      required: true,
      placeholder: "client-id",
    }],
    actions: [],
  },
  {
    typeId: "npm.token",
    label: "NPM token",
    description: "Token for npm registry brokered checks.",
    kind: "npm_token",
    defaultAllowedHosts: ["registry.npmjs.org"],
    defaultAllowedHeaderNames: ["Authorization"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: true,
    defaultLeaseModes: ["process"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
    fields: [{
      id: "baseUrl",
      label: "Override base URL",
      kind: "url",
      required: false,
      description: "Optional sandbox or local stub base URL.",
      placeholder: "https://registry.npmjs.org",
    }],
    actions: [{
      id: "npm.whoami",
      label: "Who am I",
      description: "Call the npm registry identity endpoint.",
      capability: "broker.http",
      method: "GET",
    }],
  },
  {
    typeId: "telegram.bot_token",
    label: "Telegram bot token",
    description: "Bot token for Telegram Bot API brokered calls.",
    kind: "telegram_bot_token",
    defaultAllowedHosts: ["api.telegram.org"],
    defaultAllowedHeaderNames: [],
    defaultAllowInURL: true,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: false,
    defaultLeaseModes: ["process", "browser"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process", "lease.browser"],
    fields: [{
      id: "baseUrl",
      label: "Override base URL",
      kind: "url",
      required: false,
      description: "Optional sandbox or local stub base URL.",
      placeholder: "https://api.telegram.org",
    }],
    actions: [{
      id: "telegram.getMe",
      label: "Get bot profile",
      description: "Call Telegram getMe through the broker.",
      capability: "broker.http",
      method: "GET",
    }],
  },
  {
    typeId: "slack.bot_token",
    label: "Slack bot token",
    description: "Slack Bot token for brokered Slack API calls.",
    kind: "slack_bot_token",
    defaultAllowedHosts: ["slack.com"],
    defaultAllowedHeaderNames: ["Authorization"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: false,
    defaultLeaseModes: ["process"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
    fields: [{
      id: "baseUrl",
      label: "Override base URL",
      kind: "url",
      required: false,
      description: "Optional sandbox or local stub base URL.",
      placeholder: "https://slack.com",
    }],
    actions: [{
      id: "slack.authTest",
      label: "Auth test",
      description: "Call Slack auth.test through the broker.",
      capability: "broker.http",
      method: "POST",
    }],
  },
  {
    typeId: "revenuecat.api_key",
    label: "RevenueCat API key",
    description: "RevenueCat secret API key for brokered API calls.",
    kind: "revenuecat_api_key",
    defaultAllowedHosts: ["api.revenuecat.com"],
    defaultAllowedHeaderNames: ["Authorization", "X-Platform"],
    defaultAllowInURL: false,
    defaultAllowInRequestBody: false,
    defaultAllowLocalNetwork: false,
    defaultReadOnly: true,
    defaultLeaseModes: ["process"],
    defaultCapabilities: ["metadata.read", "broker.http", "lease.process"],
    fields: [{
      id: "baseUrl",
      label: "Override base URL",
      kind: "url",
      required: false,
      description: "Optional sandbox or local stub base URL.",
      placeholder: "https://api.revenuecat.com",
    }],
    actions: [{
      id: "revenuecat.projects.list",
      label: "List projects",
      description: "Call RevenueCat list projects through the broker.",
      capability: "broker.http",
      method: "GET",
    }],
  },
];

const secretTypesById = new Map(VAULT_SECRET_TYPES.map((entry) => [entry.typeId, entry]));

export function listSecretTypes(search?: string): VaultSecretTypeDescriptor[] {
  const query = search?.trim().toLowerCase();
  if (!query) return VAULT_SECRET_TYPES;
  return VAULT_SECRET_TYPES.filter((entry) => (
    entry.typeId.toLowerCase().includes(query)
    || entry.label.toLowerCase().includes(query)
    || entry.description.toLowerCase().includes(query)
  ));
}

export function getSecretType(typeId?: string | null): VaultSecretTypeDescriptor | null {
  if (!typeId?.trim()) return null;
  return secretTypesById.get(typeId.trim()) ?? null;
}

export function normalizeStructuredFields(
  descriptor: VaultSecretTypeDescriptor | null,
  input: unknown,
): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  if (!descriptor) {
    return Object.fromEntries(
      Object.entries(raw)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .map(([key, value]) => [key, String(value).trim()]),
    );
  }
  const normalized: Record<string, string> = {};
  for (const field of descriptor.fields) {
    const value = raw[field.id];
    if (typeof value === "string" && value.trim().length > 0) {
      normalized[field.id] = value.trim();
    }
  }
  return normalized;
}

export function validateTypedSecretInput(input: {
  secretName: string;
  secretValue: string;
  typeId?: string | null;
  structuredFields?: Record<string, string>;
}) {
  const descriptor = getSecretType(input.typeId);
  if (!descriptor) return { descriptor: null };
  for (const field of descriptor.fields) {
    if (field.required && !(input.structuredFields?.[field.id]?.trim())) {
      throw new Error(`Structured field ${field.id} is required for ${descriptor.typeId}.`);
    }
  }
  if (!input.secretValue.trim()) {
    throw new Error(`secretValue is required for ${descriptor.typeId}.`);
  }
  return { descriptor };
}

function actorMatchesCurrentUserRole(actor: VaultActor | VaultClaims, capability: VaultCapability): boolean {
  return "kind" in actor && actor.kind === "user" && capability !== "broker.http";
}

export function resolveSecretCapabilities(
  db: VaultDatabase,
  actor: VaultActor | VaultClaims,
  tenantId: string,
  metadata: VaultSecretMetadata,
): VaultSecretCapabilityStatus[] {
  const policies = db.listPolicies(tenantId);
  const supported = new Set<VaultCapability>(["metadata.read", "secret.rotate", "broker.http", "lease.process", "lease.browser", "audit.read"]);
  const descriptor = getSecretType(metadata.typeId);
  for (const capability of descriptor?.defaultCapabilities ?? []) {
    supported.add(capability);
  }
  return [...supported].map((capability) => {
    const allowed = actorMatchesCurrentUserRole(actor, capability)
      ? true
      : isAllowed(policies, actor, metadata.secretName, capability);
    return { capability, allowed };
  });
}

export function listSecretActions(metadata: VaultSecretMetadata): VaultTypedActionDescriptor[] {
  return getSecretType(metadata.typeId)?.actions ?? [];
}

export function buildTypedActionBrokerRequest(
  metadata: VaultSecretMetadata,
  secretValue: string,
  actionId: string,
): {
  action: VaultTypedActionDescriptor;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
} {
  const type = getSecretType(metadata.typeId);
  const action = type?.actions.find((entry) => entry.id === actionId);
  if (!type || !action) {
    throw new Error(`Unsupported action ${actionId} for ${metadata.typeId ?? "generic secret"}.`);
  }
  const baseUrl = metadata.structuredFields?.baseUrl?.trim().replace(/\/+$/, "");

  if (type.typeId === "npm.token" && actionId === "npm.whoami") {
    return {
      action,
      method: "GET",
      url: `${baseUrl || "https://registry.npmjs.org"}/-/whoami`,
      headers: { Authorization: `Bearer {{${metadata.secretName}}}` },
    };
  }
  if (type.typeId === "telegram.bot_token" && actionId === "telegram.getMe") {
    return {
      action,
      method: "GET",
      url: `${baseUrl || "https://api.telegram.org"}/bot{{${metadata.secretName}}}/getMe`,
      headers: {},
    };
  }
  if (type.typeId === "slack.bot_token" && actionId === "slack.authTest") {
    return {
      action,
      method: "POST",
      url: `${baseUrl || "https://slack.com"}/api/auth.test`,
      headers: { Authorization: `Bearer {{${metadata.secretName}}}` },
    };
  }
  if (type.typeId === "revenuecat.api_key" && actionId === "revenuecat.projects.list") {
    return {
      action,
      method: "GET",
      url: `${baseUrl || "https://api.revenuecat.com"}/v2/projects`,
      headers: {
        Authorization: `Bearer {{${metadata.secretName}}}`,
        "X-Platform": "clawjs-vault",
      },
    };
  }

  if (type.typeId === "generic.basic_auth") {
    const username = metadata.structuredFields?.username ?? "";
    const basicToken = Buffer.from(`${username}:${secretValue}`).toString("base64");
    return {
      action,
      method: action.method,
      url: "",
      headers: { Authorization: `Basic ${basicToken}` },
    };
  }

  throw new Error(`Unsupported action ${actionId} for ${metadata.typeId}.`);
}
