import type Database from "better-sqlite3";

import {
  getConnectorGovernedContextProviderSchema,
  type ConnectorContextDefaultRule,
  type ConnectorContextFieldSchema,
  type ConnectorContextPolicy,
  type ConnectorContextRecordField,
  type ConnectorContextScope,
  type ConnectorContextScopeKind,
  type ConnectorContextSensitivity,
  type ConnectorGovernedContextRecord,
  type ConnectorGovernedState,
} from "@clawjs/core";

import {
  ensureV1MainSchema,
  normalizeDbRow,
  nowIso,
  openMainDataStore,
  parseJson,
} from "./v1-data-core.ts";
import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

type StoreHandle = ReturnType<typeof openMainDataStore>;

export interface ConnectorContextStore {
  sqlite: Database.Database;
  close: () => void;
  listRecords: (input?: { providerId?: string; kind?: string; state?: ConnectorGovernedState }) => ConnectorGovernedContextRecord[];
  getRecord: (id: string) => ConnectorGovernedContextRecord | null;
  upsertRecord: (input: ConnectorContextUpsertInput) => ConnectorGovernedContextRecord;
  linkSecret: (input: { id: string; field: string; secretRef: string; actorId?: string; operationId?: string }) => ConnectorGovernedContextRecord;
  setState: (input: { id: string; state: ConnectorGovernedState; reason?: string; actorId?: string }) => ConnectorGovernedContextRecord;
  listDefaults: (input?: { providerId?: string }) => ConnectorContextDefaultRule[];
  setDefault: (input: ConnectorContextDefaultUpsertInput) => ConnectorContextDefaultRule;
  audit: (input: ConnectorContextAuditInput) => void;
}

export interface ConnectorContextUpsertInput {
  id?: string;
  providerId: string;
  kind: string;
  displayName?: string;
  state?: ConnectorGovernedState;
  parentId?: string;
  resourceId?: string;
  principalId?: string;
  externalId?: string;
  scopes?: ConnectorContextScope[];
  fields?: Record<string, unknown>;
  fieldPolicies?: Record<string, ConnectorContextPolicy>;
  guidance?: { summary: string; instructions?: string[] };
  policy?: ConnectorContextPolicy;
  desired?: Record<string, unknown>;
  observed?: Record<string, unknown>;
  source?: "manual" | "imported" | "provider_readonly" | "fixture";
  verification?: Record<string, unknown>;
  actorId?: string;
}

export interface ConnectorContextDefaultUpsertInput {
  id?: string;
  scope: ConnectorContextScope;
  providerId?: string;
  operationIds?: string[];
  contextRef: string;
  priority?: number;
  condition?: string;
}

export interface ConnectorContextAuditInput {
  eventType: "context.upsert" | "context.state" | "context.link_secret" | "context.default" | "context.explain" | "context.export";
  providerId: string;
  operationId?: string;
  requestId?: string;
  actorId?: string;
  contextRecordId?: string;
  decision: "allow" | "deny" | "plan" | "recorded";
  reasonCodes?: string[];
  contextRefs?: string[];
  secretRefs?: string[];
  appliedRules?: string[];
  metadata?: Record<string, unknown>;
}

type ContextRecordRow = {
  id: string;
  provider_id: string;
  kind: string;
  display_name: string;
  state: ConnectorGovernedState;
  parent_id: string | null;
  resource_id: string | null;
  principal_id: string | null;
  external_id: string | null;
  scopes_json: string;
  fields_json: string;
  guidance_json: string;
  policy_json: string;
  desired_json: string;
  observed_json: string;
  source_json: string;
  verification_json: string;
  source: ConnectorGovernedContextRecord["source"];
  updated_at: string;
};

type DefaultRow = {
  id: string;
  scope_kind: ConnectorContextScopeKind;
  scope_id: string | null;
  provider_id: string | null;
  operation_ids_json: string;
  context_ref: string;
  priority: number;
  condition: string | null;
};

export function openConnectorContextStore(env: NodeJS.ProcessEnv = process.env): ConnectorContextStore {
  const handle: StoreHandle = openMainDataStore(env);
  const sqlite = handle.sqlite;
  ensureConnectorContextStoreSchema(sqlite, env);
  return {
    sqlite,
    close: () => handle.close(),
    listRecords: (input = {}) => listRecords(sqlite, input),
    getRecord: (id) => getRecord(sqlite, id),
    upsertRecord: (input) => upsertRecord(sqlite, input),
    linkSecret: (input) => linkSecret(sqlite, input),
    setState: (input) => setState(sqlite, input),
    listDefaults: (input = {}) => listDefaults(sqlite, input),
    setDefault: (input) => setDefault(sqlite, input),
    audit: (input) => recordAudit(sqlite, input),
  };
}

export function ensureConnectorContextStoreSchema(sqlite: Database.Database, env: NodeJS.ProcessEnv = process.env): void {
  ensureV1MainSchema(sqlite, env);
}

function listRecords(sqlite: Database.Database, input: { providerId?: string; kind?: string; state?: ConnectorGovernedState }): ConnectorGovernedContextRecord[] {
  const where: string[] = [];
  const params: string[] = [];
  if (input.providerId) {
    where.push("provider_id = ?");
    params.push(input.providerId);
  }
  if (input.kind) {
    where.push("kind = ?");
    params.push(input.kind);
  }
  if (input.state) {
    where.push("state = ?");
    params.push(input.state);
  }
  const sql = `SELECT * FROM connector_context_records${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY provider_id, kind, display_name`;
  return (sqlite.prepare(sql).all(...params) as ContextRecordRow[]).map(recordFromRow);
}

function getRecord(sqlite: Database.Database, id: string): ConnectorGovernedContextRecord | null {
  const row = sqlite.prepare("SELECT * FROM connector_context_records WHERE id = ?").get(id) as ContextRecordRow | undefined;
  return row ? recordFromRow(row) : null;
}

function upsertRecord(sqlite: Database.Database, input: ConnectorContextUpsertInput): ConnectorGovernedContextRecord {
  const providerSchema = getConnectorGovernedContextProviderSchema(input.providerId);
  if (!providerSchema) throw new CliHandledError("unknown_provider", `Unknown connector provider: ${input.providerId}`, CLI_EXIT_USAGE);
  const state = parseState(input.state ?? "active");
  const id = input.id || contextId(input.providerId, input.kind, input.displayName || input.externalId || "default");
  const existing = getRecord(sqlite, id);
  const fields = {
    ...(existing?.fields ?? {}),
    ...normalizeFields(input.fields ?? {}, providerSchema.fields, input.fieldPolicies ?? {}),
  };
  const displayName = input.displayName || existing?.displayName || id;
  const now = nowIso();

  sqlite.prepare(`
    INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
    VALUES (?, ?, 'third_party', 1, '{}', ?, ?)
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at
  `).run(input.providerId, providerSchema.displayName, now, now);

  sqlite.prepare(`
    INSERT INTO connector_context_records (
      id, provider_id, kind, display_name, state, parent_id, resource_id, principal_id, external_id,
      scopes_json, fields_json, guidance_json, policy_json, desired_json, observed_json, source_json,
      verification_json, source, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider_id = excluded.provider_id,
      kind = excluded.kind,
      display_name = excluded.display_name,
      state = excluded.state,
      parent_id = excluded.parent_id,
      resource_id = excluded.resource_id,
      principal_id = excluded.principal_id,
      external_id = excluded.external_id,
      scopes_json = excluded.scopes_json,
      fields_json = excluded.fields_json,
      guidance_json = excluded.guidance_json,
      policy_json = excluded.policy_json,
      desired_json = excluded.desired_json,
      observed_json = excluded.observed_json,
      source_json = excluded.source_json,
      verification_json = excluded.verification_json,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(
    id,
    input.providerId,
    input.kind,
    displayName,
    state,
    input.parentId ?? existing?.parentId ?? null,
    input.resourceId ?? existing?.resourceId ?? null,
    input.principalId ?? existing?.principalId ?? null,
    input.externalId ?? existing?.externalId ?? null,
    JSON.stringify(input.scopes ?? existing?.scopes ?? []),
    JSON.stringify(fields),
    JSON.stringify(input.guidance ?? existing?.guidance ?? {}),
    JSON.stringify(input.policy ?? existing?.policy ?? {}),
    JSON.stringify(input.desired ?? parseRecordJson(existing, "desired") ?? {}),
    JSON.stringify(input.observed ?? parseRecordJson(existing, "observed") ?? {}),
    JSON.stringify(input.source ? { source: input.source } : parseRecordJson(existing, "source") ?? {}),
    JSON.stringify(input.verification ?? parseRecordJson(existing, "verification") ?? {}),
    input.source ?? existing?.source ?? "manual",
    existing ? (existing.updatedAt ?? now) : now,
    now,
  );
  const record = getRecord(sqlite, id)!;
  recordAudit(sqlite, {
    eventType: "context.upsert",
    providerId: input.providerId,
    actorId: input.actorId,
    contextRecordId: id,
    decision: "recorded",
    contextRefs: [id],
    secretRefs: secretRefsFromRecord(record),
    metadata: { kind: input.kind, fields: Object.keys(input.fields ?? {}) },
  });
  return record;
}

function linkSecret(sqlite: Database.Database, input: { id: string; field: string; secretRef: string; actorId?: string; operationId?: string }): ConnectorGovernedContextRecord {
  const existing = getRecord(sqlite, input.id);
  if (!existing) throw new CliHandledError("context_not_found", `Connector context not found: ${input.id}`, CLI_EXIT_USAGE);
  validateSecretRef(input.secretRef);
  const providerSchema = getConnectorGovernedContextProviderSchema(existing.providerId);
  const fieldSchema = providerSchema?.fields.find((field) => field.name === input.field);
  const nextFields = {
    ...existing.fields,
    [input.field]: {
      ...(existing.fields[input.field] ?? {}),
      sensitivity: "secret_ref" as const,
      secretRef: input.secretRef,
      guidance: fieldSchema?.guidance,
    },
  };
  sqlite.prepare("UPDATE connector_context_records SET fields_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(nextFields), nowIso(), input.id);
  const record = getRecord(sqlite, input.id)!;
  recordAudit(sqlite, {
    eventType: "context.link_secret",
    providerId: record.providerId,
    operationId: input.operationId,
    actorId: input.actorId,
    contextRecordId: input.id,
    decision: "recorded",
    contextRefs: [input.id],
    secretRefs: [input.secretRef],
    metadata: { field: input.field, fieldSensitivity: fieldSchema?.sensitivity ?? "secret_ref" },
  });
  return record;
}

function setState(sqlite: Database.Database, input: { id: string; state: ConnectorGovernedState; reason?: string; actorId?: string }): ConnectorGovernedContextRecord {
  const existing = getRecord(sqlite, input.id);
  if (!existing) throw new CliHandledError("context_not_found", `Connector context not found: ${input.id}`, CLI_EXIT_USAGE);
  const state = parseState(input.state);
  sqlite.prepare("UPDATE connector_context_records SET state = ?, updated_at = ? WHERE id = ?").run(state, nowIso(), input.id);
  const record = getRecord(sqlite, input.id)!;
  recordAudit(sqlite, {
    eventType: "context.state",
    providerId: record.providerId,
    actorId: input.actorId,
    contextRecordId: input.id,
    decision: "recorded",
    contextRefs: [input.id],
    secretRefs: secretRefsFromRecord(record),
    metadata: { state, reason: input.reason ?? null },
  });
  return record;
}

function listDefaults(sqlite: Database.Database, input: { providerId?: string }): ConnectorContextDefaultRule[] {
  const rows = input.providerId
    ? sqlite.prepare("SELECT * FROM connector_context_defaults WHERE provider_id = ? ORDER BY priority DESC, id").all(input.providerId) as DefaultRow[]
    : sqlite.prepare("SELECT * FROM connector_context_defaults ORDER BY provider_id, priority DESC, id").all() as DefaultRow[];
  return rows.map(defaultFromRow);
}

function setDefault(sqlite: Database.Database, input: ConnectorContextDefaultUpsertInput): ConnectorContextDefaultRule {
  const record = getRecord(sqlite, input.contextRef);
  if (!record) throw new CliHandledError("context_not_found", `Connector context not found: ${input.contextRef}`, CLI_EXIT_USAGE);
  const id = input.id || contextId(input.providerId ?? record.providerId, "default", `${input.scope.kind}-${input.scope.id ?? "any"}-${input.contextRef}`);
  const now = nowIso();
  sqlite.prepare(`
    INSERT INTO connector_context_defaults (id, scope_kind, scope_id, provider_id, operation_ids_json, context_ref, priority, condition, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      scope_kind = excluded.scope_kind,
      scope_id = excluded.scope_id,
      provider_id = excluded.provider_id,
      operation_ids_json = excluded.operation_ids_json,
      context_ref = excluded.context_ref,
      priority = excluded.priority,
      condition = excluded.condition,
      updated_at = excluded.updated_at
  `).run(id, input.scope.kind, input.scope.id ?? null, input.providerId ?? record.providerId, JSON.stringify(input.operationIds ?? []), input.contextRef, input.priority ?? 100, input.condition ?? null, now, now);
  const rule = defaultFromRow(sqlite.prepare("SELECT * FROM connector_context_defaults WHERE id = ?").get(id) as DefaultRow);
  recordAudit(sqlite, {
    eventType: "context.default",
    providerId: rule.providerId ?? record.providerId,
    contextRecordId: rule.contextRef,
    decision: "recorded",
    contextRefs: [rule.contextRef],
    metadata: { defaultId: rule.id, scope: rule.scope },
  });
  return rule;
}

function recordAudit(sqlite: Database.Database, input: ConnectorContextAuditInput): void {
  const createdAt = nowIso();
  const id = contextId(input.providerId, input.eventType, `${input.contextRecordId ?? input.operationId ?? "event"}-${createdAt}`);
  const schema = getConnectorGovernedContextProviderSchema(input.providerId);
  sqlite.prepare(`
    INSERT INTO connector_providers (id, display_name, trust_tier, enabled, metadata_json, created_at, updated_at)
    VALUES (?, ?, 'third_party', 1, '{}', ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(input.providerId, schema?.displayName ?? input.providerId, createdAt, createdAt);
  sqlite.prepare(`
    INSERT INTO connector_context_audit_events (
      id, event_type, request_id, actor_id, provider_id, operation_id, context_record_id, decision,
      reason_codes_json, context_refs_json, secret_refs_json, applied_rules_json, metadata_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.eventType,
    input.requestId ?? null,
    input.actorId ?? null,
    input.providerId,
    input.operationId ?? null,
    input.contextRecordId ?? null,
    input.decision,
    JSON.stringify(input.reasonCodes ?? []),
    JSON.stringify(input.contextRefs ?? []),
    JSON.stringify(input.secretRefs ?? []),
    JSON.stringify(input.appliedRules ?? []),
    JSON.stringify(input.metadata ?? {}),
    createdAt,
  );
}

function recordFromRow(row: ContextRecordRow): ConnectorGovernedContextRecord {
  const guidance = parseJson(row.guidance_json, {});
  const policy = parseJson(row.policy_json, {});
  const desired = parseJson(row.desired_json, {});
  const observed = parseJson(row.observed_json, {});
  const verification = parseJson(row.verification_json, {});
  return {
    id: row.id,
    providerId: row.provider_id,
    kind: row.kind,
    displayName: row.display_name,
    state: row.state,
    ...(row.parent_id ? { parentId: row.parent_id } : {}),
    ...(row.resource_id ? { resourceId: row.resource_id } : {}),
    ...(row.principal_id ? { principalId: row.principal_id } : {}),
    ...(row.external_id ? { externalId: row.external_id } : {}),
    scopes: parseJson(row.scopes_json, []),
    fields: parseJson(row.fields_json, {}),
    ...(isNonEmptyObject(guidance) ? { guidance: guidance as unknown as ConnectorGovernedContextRecord["guidance"] } : {}),
    ...(isNonEmptyObject(policy) ? { policy: policy as unknown as ConnectorGovernedContextRecord["policy"] } : {}),
    ...(isNonEmptyObject(desired) ? { desired } : {}),
    ...(isNonEmptyObject(observed) ? { observed } : {}),
    ...(isNonEmptyObject(verification) ? { verification } : {}),
    source: row.source,
    updatedAt: row.updated_at,
  };
}

function defaultFromRow(row: DefaultRow): ConnectorContextDefaultRule {
  return {
    id: row.id,
    scope: { kind: row.scope_kind, ...(row.scope_id ? { id: row.scope_id } : {}) },
    ...(row.provider_id ? { providerId: row.provider_id } : {}),
    operationIds: parseJson(row.operation_ids_json, []),
    contextRef: row.context_ref,
    priority: row.priority,
    ...(row.condition ? { condition: row.condition } : {}),
  };
}

function normalizeFields(
  fields: Record<string, unknown>,
  fieldSchemas: ConnectorContextFieldSchema[],
  fieldPolicies: Record<string, ConnectorContextPolicy>,
): Record<string, ConnectorContextRecordField> {
  const schemaByName = new Map(fieldSchemas.map((schema) => [schema.name, schema]));
  const out: Record<string, ConnectorContextRecordField> = {};
  for (const [name, value] of Object.entries(fields)) {
    const schema = schemaByName.get(name);
    const sensitivity = schema?.sensitivity ?? inferSensitivity(name);
    if (sensitivity === "secret_ref") {
      throw new CliHandledError("secret_material_rejected", `${name} is secret_ref. Use link-secret --field ${name} --secret-ref secret://... instead of --set.`, CLI_EXIT_USAGE);
    }
    out[name] = {
      value: value as string | number | boolean | null,
      sensitivity,
      ...(schema?.guidance ? { guidance: schema.guidance } : {}),
      ...(fieldPolicies[name] ? { policy: fieldPolicies[name] } : schema?.policy ? { policy: schema.policy } : {}),
    };
  }
  return out;
}

function parseState(value: string): ConnectorGovernedState {
  if (value === "active" || value === "paused" || value === "blocked" || value === "retired") return value;
  throw new CliHandledError("invalid_context_state", `Use one of: active, paused, blocked, retired.`, CLI_EXIT_USAGE);
}

function inferSensitivity(name: string): ConnectorContextSensitivity {
  if (name.endsWith("_ref") || name.includes("secret") || name.includes("token") || name.includes("key")) return "secret_ref";
  if (name === "environment" || name === "api_version" || name === "track" || name === "binary_kind") return "public";
  return "private";
}

function validateSecretRef(value: string): void {
  if (!/^(secret|vault):\/\//.test(value)) {
    throw new CliHandledError("invalid_secret_ref", "Secret references must use a secret:// or vault:// reference, not plaintext.", CLI_EXIT_USAGE);
  }
}

function secretRefsFromRecord(record: ConnectorGovernedContextRecord): string[] {
  return Object.values(record.fields).flatMap((field) => field.secretRef ? [field.secretRef] : []);
}

function parseRecordJson(record: ConnectorGovernedContextRecord | null | undefined, key: "desired" | "observed" | "source" | "verification"): Record<string, unknown> | undefined {
  if (!record) return undefined;
  if (key === "source") return record.source ? { source: record.source } : undefined;
  return record[key];
}

function contextId(providerId: string, kind: string, label: string): string {
  return `${providerId}_${kind}_${label}`.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

export function normalizedConnectorContextRows(sqlite: Database.Database): unknown[] {
  return sqlite.prepare("SELECT * FROM connector_context_records ORDER BY provider_id, kind, id").all().map(normalizeDbRow);
}
