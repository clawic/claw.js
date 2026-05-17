// Plugin framework interfaces. The Secrets hosts five orthogonal
// declarative registries that any plugin can extend:
//
//   1. Type Registry          — typeId (vendor.resource) declarations.
//   2. Executor Registry      — domain-aware action executors.
//   3. SessionStrategy        — refresh flows for short-lived tokens.
//   4. PermissionModel        — collection-level CRUD allowlists.
//   5. BrandSync              — pull lists of resources from a vendor.
//
// A plugin manifest aggregates contributions from all five registries.

import type { SecretRow } from "../server/db.ts";
import type { LockableSecret } from "../server/lockable-secret.ts";
import type { ClawSecretsCapability } from "../server/capabilities.ts";

// ---------- Field declaration ----------

interface FieldDeclaration {
  name: string;
  label?: string;
  kind: "text" | "password" | "url" | "email" | "number" | "otp" | "note" | "reference";
  placement: "header" | "query" | "body" | "env" | "none";
  isSecret: boolean;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}

// ---------- 1. SecretType ----------

interface GovernanceDefaults {
  allowedHosts?: string[];
  allowedHeaders?: string[];
  allowInUrl?: boolean;
  allowInBody?: boolean;
  allowInEnv?: boolean;
  allowInsecureTransport?: boolean;
  allowLocalNetwork?: boolean;
  approvalMode?: "auto" | "window" | "every-use";
  redactionLabel?: string;
}

export interface SecretTypeDeclaration {
  typeId: string;
  label: string;
  description?: string;
  vendor?: string;
  iconHint?: string;
  fields: FieldDeclaration[];
  governanceDefaults?: GovernanceDefaults;
  executorIds?: string[];
  sessionStrategyId?: string;
  permissionModelId?: string;
  brandSyncId?: string;
}

// ---------- 2. Executor ----------

interface ExecutorContext {
  secret: SecretRow;
  /** @deprecated Legacy plugin executors must not be exposed as a public execution path. Use broker handles. */
  resolvedFields: Record<string, string>;
  itemKey: LockableSecret;
  args: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

export interface ExecutorOutput {
  ok: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  detail?: string;
  data?: Record<string, unknown>;
}

export interface ExecutorPlugin {
  id: string;
  label: string;
  description?: string;
  capabilities: ClawSecretsCapability[];
  validate?(ctx: ExecutorContext): { ok: true } | { ok: false; reason: string };
  execute(ctx: ExecutorContext): Promise<ExecutorOutput>;
  redact?(output: ExecutorOutput, secrets: Record<string, string>): ExecutorOutput;
}

// ---------- 3. Session strategy ----------

export interface SessionToken {
  token: string;
  expiresAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}

interface SessionStrategyContext {
  secret: SecretRow;
  /** @deprecated Legacy session strategies must run only behind broker/session governance. */
  resolvedFields: Record<string, string>;
  cachedToken?: SessionToken;
}

export interface SessionStrategy {
  id: string;
  label: string;
  cacheKey(secret: SecretRow): string;
  isExpired(token: SessionToken, nowMs?: number): boolean;
  refresh(ctx: SessionStrategyContext): Promise<SessionToken>;
  retryOn401: boolean;
}

// ---------- 4. Permission model ----------

interface PermissionAction {
  id: string;
  label: string;
  isMutation?: boolean;
}

interface PermissionResource {
  type: string;
  id: string;
  metadata?: Record<string, unknown>;
}

export interface PermissionModel {
  id: string;
  label: string;
  resourceType: string;
  actions: PermissionAction[];
  validate(input: {
    secret: SecretRow;
    action: string;
    resource: { type: string; id: string };
    storedAllowlist: PermissionResource[];
    storedAuthorizations: { kind: string; scope: Record<string, unknown> }[];
  }): { ok: true } | { ok: false; reason: string };
}

// ---------- 5. Brand sync ----------

interface BrandSyncContext {
  secret: SecretRow;
  /** @deprecated Legacy brand syncs must not be exposed as a public execution path. */
  resolvedFields: Record<string, string>;
}

export interface SyncedResource {
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
}

export interface BrandSync {
  id: string;
  label: string;
  autoSyncIntervalMinutes?: number;
  sync(ctx: BrandSyncContext): Promise<SyncedResource[]>;
}

// ---------- Plugin manifest ----------

export interface PluginManifest {
  id: string;
  version: string;
  label?: string;
  description?: string;
  types?: SecretTypeDeclaration[];
  executors?: ExecutorPlugin[];
  sessionStrategies?: SessionStrategy[];
  permissionModels?: PermissionModel[];
  brandSyncs?: BrandSync[];
}

export function definePlugin(manifest: PluginManifest): PluginManifest {
  return manifest;
}
