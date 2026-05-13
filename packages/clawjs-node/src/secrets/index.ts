import os from "os";
import path from "path";

import type { CommandRunner } from "../runtime/contracts.ts";
import { buildSecretsRunnerEnv, resolveSecretsBackend, resolveSecretsCommandSpec } from "./command.ts";

export const DEFAULT_CLAW_SECRETS_APP_PATH = path.join(os.homedir(), "Applications", "Claw Secrets.app");

export interface SecretProxyMetadata {
  name: string;
  kind?: string;
  typeId?: string;
  notes?: string;
  structuredFields?: Record<string, string>;
  allowedHosts: string[];
  allowedHeaderNames: string[];
  readOnly: boolean;
  allowInURL: boolean;
  allowInRequestBody: boolean;
  allowInsecureTransport: boolean;
  allowLocalNetwork: boolean;
  requiresVPN?: boolean;
  leaseModes?: string[];
  exportable?: boolean;
  maskedFingerprint?: string;
  version?: number;
  updatedAt?: string;
  raw: Record<string, unknown>;
}

export interface SecretDoctorResult {
  ok: boolean;
  output: string;
}

export interface SecretTypeFieldDescriptor {
  id: string;
  label: string;
  kind: "string" | "password" | "url";
  required: boolean;
  secret?: boolean;
  description?: string;
  placeholder?: string;
}

export interface SecretTypedActionDescriptor {
  id: string;
  label: string;
  description: string;
  capability: string;
  method: "GET" | "POST";
  allowed?: boolean;
}

export interface SecretTypeDescriptor {
  typeId: string;
  label: string;
  description: string;
  kind: string;
  defaultAllowedHosts: string[];
  defaultAllowedHeaderNames: string[];
  defaultAllowInURL: boolean;
  defaultAllowInRequestBody: boolean;
  defaultAllowLocalNetwork: boolean;
  defaultReadOnly: boolean;
  defaultLeaseModes: string[];
  defaultCapabilities: string[];
  fields: SecretTypeFieldDescriptor[];
  actions: SecretTypedActionDescriptor[];
}

export interface SecretCapabilityStatus {
  capability: string;
  allowed: boolean;
}

export interface SecretLeaseRecord {
  id: string;
  secretName: string;
  capability: string;
  mode: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string | null;
  revokedAt?: string | null;
}

export interface SecretBrokerHttpInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SecretBrokerHttpResult {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyBase64?: string;
  ok: boolean;
}

export interface EnsureSecretReferenceInput {
  name: string;
  kind?: string;
  notes?: string;
  allowedHosts: string[];
  allowedHeaderNames?: string[];
  readOnly?: boolean;
  allowInURL?: boolean;
  allowInRequestBody?: boolean;
  allowInsecureTransport?: boolean;
  allowLocalNetwork?: boolean;
}

export interface EnsureSecretReferenceResult {
  status: "configured" | "missing" | "update_required";
  secretName: string;
  requirement: Required<EnsureSecretReferenceInput>;
  existing: SecretProxyMetadata | null;
  missingHosts: string[];
  missingHeaderNames: string[];
  mismatched: Array<"kind" | "readOnly" | "allowInURL" | "allowInRequestBody" | "allowInsecureTransport" | "allowLocalNetwork">;
  instructions: {
    openAppPath: string;
    summary: string;
  };
}

export interface EnsureTelegramBotSecretReferenceInput {
  name: string;
  apiBaseUrl?: string;
  notes?: string;
  readOnly?: boolean;
}

function normalizeArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function buildRunnerEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return buildSecretsRunnerEnv(env);
}

function normalizeSecretMetadata(raw: Record<string, unknown>): SecretProxyMetadata {
  return {
    name: typeof raw.name === "string"
      ? raw.name
      : typeof raw.secretName === "string"
        ? raw.secretName
        : "",
    kind: typeof raw.kind === "string" ? raw.kind : undefined,
    typeId: typeof raw.typeId === "string" ? raw.typeId : undefined,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    structuredFields: raw.structuredFields && typeof raw.structuredFields === "object" && !Array.isArray(raw.structuredFields)
      ? Object.fromEntries(
        Object.entries(raw.structuredFields as Record<string, unknown>)
          .filter(([, value]) => typeof value === "string")
          .map(([key, value]) => [key, String(value)]),
      )
      : undefined,
    allowedHosts: normalizeArray(raw.allowedHosts),
    allowedHeaderNames: normalizeArray(raw.allowedHeaderNames),
    readOnly: raw.readOnly === true,
    allowInURL: raw.allowInURL === true,
    allowInRequestBody: raw.allowInRequestBody === true,
    allowInsecureTransport: raw.allowInsecureTransport === true,
    allowLocalNetwork: raw.allowLocalNetwork === true,
    requiresVPN: typeof raw.requiresVPN === "boolean" ? raw.requiresVPN : undefined,
    leaseModes: normalizeArray(raw.leaseModes),
    exportable: raw.exportable === true,
    maskedFingerprint: typeof raw.maskedFingerprint === "string" ? raw.maskedFingerprint : undefined,
    version: typeof raw.version === "number" ? raw.version : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    raw,
  };
}

function resolveSecretsConfig(env?: NodeJS.ProcessEnv): { baseUrl: string; token: string; tenantId: string } {
  const mergedEnv = buildRunnerEnv(env);
  const baseUrl = mergedEnv.CLAW_SECRETS_BASE_URL?.trim();
  const token = mergedEnv.CLAW_SECRETS_TOKEN?.trim();
  const tenantId = mergedEnv.CLAW_SECRETS_TENANT_ID?.trim();
  if (!baseUrl || !token || !tenantId) {
    throw new Error("CLAW_SECRETS_BASE_URL, CLAW_SECRETS_TOKEN, and CLAW_SECRETS_TENANT_ID are required for the secrets backend.");
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
    tenantId,
  };
}

async function runProxyJsonCommand<TResult>(
  runner: CommandRunner,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<TResult> {
  const spec = resolveSecretsCommandSpec(env);
  const result = await runner.exec(spec.command, [...spec.argsPrefix, ...args], {
    env: spec.env,
    timeoutMs: 15_000,
  });
  return JSON.parse(result.stdout || "null") as TResult;
}

async function runSecretsJsonRequest<TResult>(
  env: NodeJS.ProcessEnv | undefined,
  input: {
    pathname: string;
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<TResult> {
  const secrets = resolveSecretsConfig(env);
  const response = await fetch(`${secrets.baseUrl}${input.pathname}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secrets.token}`,
      ...(input.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Secrets request failed with ${response.status}`);
  }
  return (text ? JSON.parse(text) : null) as TResult;
}

function usesSecretsBackend(env?: NodeJS.ProcessEnv): boolean {
  return resolveSecretsBackend(env) === "secrets";
}

export async function listSecrets(
  runner: CommandRunner,
  options: { search?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<SecretProxyMetadata[]> {
  if (usesSecretsBackend(options.env)) {
    const { tenantId } = resolveSecretsConfig(options.env);
    const query = options.search?.trim() ? `?search=${encodeURIComponent(options.search.trim())}` : "";
    const payload = await runSecretsJsonRequest<{ secrets: Array<Record<string, unknown>> }>(options.env, {
      pathname: `/v1/tenants/${tenantId}/secrets${query}`,
    });
    return payload.secrets.map(normalizeSecretMetadata);
  }
  const args = ["list-secrets"];
  if (options.search?.trim()) {
    args.push("--search", options.search.trim());
  }
  const payload = await runProxyJsonCommand<unknown[]>(runner, args, options.env);
  return Array.isArray(payload)
    ? payload
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map(normalizeSecretMetadata)
    : [];
}

export async function describeSecret(
  runner: CommandRunner,
  options: { name: string; env?: NodeJS.ProcessEnv },
): Promise<SecretProxyMetadata | null> {
  if (usesSecretsBackend(options.env)) {
    const { tenantId } = resolveSecretsConfig(options.env);
    try {
      const payload = await runSecretsJsonRequest<{ secret: Record<string, unknown> }>(options.env, {
        pathname: `/v1/tenants/${tenantId}/secrets/${encodeURIComponent(options.name.trim())}`,
      });
      return normalizeSecretMetadata(payload.secret);
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message) === false && /Not found/.test(error.message) === false) {
        throw error;
      }
      return null;
    }
  }
  const payload = await runProxyJsonCommand<unknown[]>(
    runner,
    ["describe-secret", "--name", options.name.trim()],
    options.env,
  );
  if (!Array.isArray(payload) || payload.length === 0 || !payload[0] || typeof payload[0] !== "object") {
    return null;
  }
  return normalizeSecretMetadata(payload[0] as Record<string, unknown>);
}

export async function listSecretTypes(
  _runner: CommandRunner,
  options: { search?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<SecretTypeDescriptor[]> {
  const query = options.search?.trim() ? `?search=${encodeURIComponent(options.search.trim())}` : "";
  const payload = await runSecretsJsonRequest<{ types: SecretTypeDescriptor[] }>(options.env, {
    pathname: `/v1/secret-types${query}`,
  });
  return payload.types;
}

export async function getSecretCapabilities(
  _runner: CommandRunner,
  options: { name: string; env?: NodeJS.ProcessEnv },
): Promise<{ secret: SecretProxyMetadata; capabilities: SecretCapabilityStatus[] }> {
  const { tenantId } = resolveSecretsConfig(options.env);
  const payload = await runSecretsJsonRequest<{ secret: Record<string, unknown>; capabilities: SecretCapabilityStatus[] }>(options.env, {
    pathname: `/v1/tenants/${tenantId}/secrets/${encodeURIComponent(options.name.trim())}/capabilities`,
  });
  return {
    secret: normalizeSecretMetadata(payload.secret),
    capabilities: payload.capabilities,
  };
}

export async function listSecretActions(
  _runner: CommandRunner,
  options: { name: string; env?: NodeJS.ProcessEnv },
): Promise<{ secret: SecretProxyMetadata; actions: SecretTypedActionDescriptor[] }> {
  const { tenantId } = resolveSecretsConfig(options.env);
  const payload = await runSecretsJsonRequest<{ secret: Record<string, unknown>; actions: SecretTypedActionDescriptor[] }>(options.env, {
    pathname: `/v1/tenants/${tenantId}/secrets/${encodeURIComponent(options.name.trim())}/actions`,
  });
  return {
    secret: normalizeSecretMetadata(payload.secret),
    actions: payload.actions,
  };
}

export async function brokerSecretHttp(
  _runner: CommandRunner,
  input: SecretBrokerHttpInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<SecretBrokerHttpResult> {
  const { tenantId } = resolveSecretsConfig(options.env);
  return await runSecretsJsonRequest<SecretBrokerHttpResult>(options.env, {
    pathname: `/v1/tenants/${tenantId}/broker/http`,
    method: "POST",
    body: input,
  });
}

export async function runSecretAction(
  _runner: CommandRunner,
  options: { name: string; actionId: string; env?: NodeJS.ProcessEnv },
): Promise<{ action: SecretTypedActionDescriptor; result: SecretBrokerHttpResult }> {
  const { tenantId } = resolveSecretsConfig(options.env);
  return await runSecretsJsonRequest<{ action: SecretTypedActionDescriptor; result: SecretBrokerHttpResult }>(options.env, {
    pathname: `/v1/tenants/${tenantId}/secrets/${encodeURIComponent(options.name.trim())}/actions/${encodeURIComponent(options.actionId)}`,
    method: "POST",
  });
}

export async function listSecretLeases(
  _runner: CommandRunner,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<SecretLeaseRecord[]> {
  const { tenantId } = resolveSecretsConfig(options.env);
  const payload = await runSecretsJsonRequest<{ leases: SecretLeaseRecord[] }>(options.env, {
    pathname: `/v1/tenants/${tenantId}/leases`,
  });
  return payload.leases;
}

export async function doctorKeychain(
  runner: CommandRunner,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<SecretDoctorResult> {
  if (usesSecretsBackend(options.env)) {
    try {
      const payload = await runSecretsJsonRequest<{ ok: boolean; service: string; host: string; port: number }>(options.env, {
        pathname: "/v1/health",
      });
      return {
        ok: payload.ok === true,
        output: `${payload.service} healthy on ${payload.host}:${payload.port}`,
      };
    } catch (error) {
      return {
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }
  try {
    const spec = resolveSecretsCommandSpec(options.env);
    const result = await runner.exec(spec.command, [...spec.argsPrefix, "doctor-keychain"], {
      env: spec.env,
      timeoutMs: 10_000,
    });
    return {
      ok: true,
      output: (result.stdout || result.stderr || "").trim(),
    };
  } catch (error) {
    const detail = (error as { result?: { stdout?: string; stderr?: string } }).result;
    return {
      ok: false,
      output: (detail?.stderr || detail?.stdout || (error instanceof Error ? error.message : String(error))).trim(),
    };
  }
}

function normalizeRequirement(input: EnsureSecretReferenceInput): Required<EnsureSecretReferenceInput> {
  return {
    name: input.name.trim(),
    kind: input.kind?.trim() || "",
    notes: input.notes?.trim() || "",
    allowedHosts: [...new Set(input.allowedHosts.map((value) => value.trim()).filter(Boolean))],
    allowedHeaderNames: [...new Set((input.allowedHeaderNames ?? []).map((value) => value.trim()).filter(Boolean))],
    readOnly: input.readOnly ?? false,
    allowInURL: input.allowInURL ?? false,
    allowInRequestBody: input.allowInRequestBody ?? false,
    allowInsecureTransport: input.allowInsecureTransport ?? false,
    allowLocalNetwork: input.allowLocalNetwork ?? false,
  };
}

function summarizeEnsureResult(
  status: EnsureSecretReferenceResult["status"],
  secretName: string,
  missingHosts: string[],
  missingHeaderNames: string[],
  mismatched: EnsureSecretReferenceResult["mismatched"],
): string {
  if (status === "configured") {
    return `Secret ${secretName} already matches the required metadata.`;
  }
  if (status === "missing") {
    return `Secret ${secretName} does not exist in Secrets yet.`;
  }
  const parts: string[] = [];
  if (missingHosts.length > 0) parts.push(`missing hosts: ${missingHosts.join(", ")}`);
  if (missingHeaderNames.length > 0) parts.push(`missing headers: ${missingHeaderNames.join(", ")}`);
  if (mismatched.length > 0) parts.push(`mismatched flags: ${mismatched.join(", ")}`);
  return `Secret ${secretName} exists but needs an update (${parts.join("; ")}).`;
}

export async function ensureSecretReference(
  runner: CommandRunner,
  input: EnsureSecretReferenceInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<EnsureSecretReferenceResult> {
  const requirement = normalizeRequirement(input);
  const existing = await describeSecret(runner, {
    name: requirement.name,
    env: options.env,
  });

  const missingHosts = existing
    ? requirement.allowedHosts.filter((host) => !existing.allowedHosts.includes(host))
    : [...requirement.allowedHosts];
  const missingHeaderNames = existing
    ? requirement.allowedHeaderNames.filter((header) => !existing.allowedHeaderNames.includes(header))
    : [...requirement.allowedHeaderNames];
  const mismatched: EnsureSecretReferenceResult["mismatched"] = [];

  if (existing) {
    if (requirement.kind && existing.kind && existing.kind !== requirement.kind) {
      mismatched.push("kind");
    }
    if (existing.readOnly !== requirement.readOnly) mismatched.push("readOnly");
    if (existing.allowInURL !== requirement.allowInURL) mismatched.push("allowInURL");
    if (existing.allowInRequestBody !== requirement.allowInRequestBody) mismatched.push("allowInRequestBody");
    if (existing.allowInsecureTransport !== requirement.allowInsecureTransport) mismatched.push("allowInsecureTransport");
    if (existing.allowLocalNetwork !== requirement.allowLocalNetwork) mismatched.push("allowLocalNetwork");
  }

  const status: EnsureSecretReferenceResult["status"] = !existing
    ? "missing"
    : missingHosts.length > 0 || missingHeaderNames.length > 0 || mismatched.length > 0
      ? "update_required"
      : "configured";

  return {
    status,
    secretName: requirement.name,
    requirement,
    existing,
    missingHosts,
    missingHeaderNames,
    mismatched,
    instructions: {
      openAppPath: DEFAULT_CLAW_SECRETS_APP_PATH,
      summary: summarizeEnsureResult(status, requirement.name, missingHosts, missingHeaderNames, mismatched),
    },
  };
}

export async function ensureHttpSecretReference(
  runner: CommandRunner,
  input: EnsureSecretReferenceInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<EnsureSecretReferenceResult> {
  return ensureSecretReference(runner, input, options);
}

function resolveTelegramHost(apiBaseUrl?: string): string {
  const url = new URL((apiBaseUrl?.trim() || "https://api.telegram.org").replace(/\/+$/, ""));
  return url.host;
}

export async function ensureTelegramBotSecretReference(
  runner: CommandRunner,
  input: EnsureTelegramBotSecretReferenceInput,
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<EnsureSecretReferenceResult> {
  return ensureSecretReference(runner, {
    name: input.name,
    notes: input.notes ?? "Telegram bot token for ClawJS.",
    allowedHosts: [resolveTelegramHost(input.apiBaseUrl)],
    allowedHeaderNames: [],
    readOnly: input.readOnly ?? false,
    allowInURL: true,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false,
  }, options);
}
