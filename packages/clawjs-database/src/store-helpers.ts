import { randomUUID } from "node:crypto";

import { PRODUCTIVITY_COLLECTION_DEFINITIONS, BUILTIN_COLLECTIONS } from "@clawjs/core";

import type {
  CollectionDefinition,
  CollectionRule,
  DatabaseOperation,
  FieldDefinition,
  FileAsset,
  IndexDefinition,
  RecordEnvelope,
  ScopedTokenRecord,
} from "./types.ts";

export interface CollectionRow {
  namespace_id: string;
  name: string;
  display_name: string;
  fields_json: string;
  indexes_json: string;
  builtin: number;
  protected: number;
  core_fields_json: string;
  created_at: string;
  updated_at: string;
}

export interface RecordRow {
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}

export interface TokenRow {
  id: string;
  label: string;
  namespace_id: string;
  collection_name: string | null;
  operations_json: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface FileRow {
  id: string;
  namespace_id: string;
  collection_name: string | null;
  record_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

export const SYSTEM_FIELDS = ["id", "createdAt", "updatedAt"] as const;
export const RECORD_PAGE_FIELDS = new Set(["pageId", "notes", "notesBody"]);
export const VALID_OPERATIONS = new Set<DatabaseOperation>([
  "schema:read",
  "schema:write",
  "records:list",
  "records:read",
  "records:create",
  "records:update",
  "records:delete",
  "files:read",
  "files:write",
  "realtime:subscribe",
  "tokens:issue",
  "tokens:revoke",
]);

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function recordPageTitle(collection: CollectionDefinition, payload: Record<string, unknown>): string {
  return stringValue(payload.title) ?? stringValue(payload.name) ?? `${collection.displayName} note`;
}

export function recordPageFieldWasProvided(payload: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(payload, "notesBody")
    || Object.prototype.hasOwnProperty.call(payload, "notes");
}

export function recordPageBody(payload: Record<string, unknown>): string | null {
  const value = Object.prototype.hasOwnProperty.call(payload, "notesBody") ? payload.notesBody : payload.notes;
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") {
    throw new Error("Record notes must be text.");
  }
  return value;
}

export function recordPageId(namespaceId: string, collectionName: string, recordId: string): string {
  return `record-note-${slugify(namespaceId)}-${slugify(collectionName)}-${slugify(recordId)}`;
}

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}

export function assertCollectionName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error("Collection names must match ^[a-z][a-z0-9_]*$.");
  }
}

export function assertNamespaceId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(value)) {
    throw new Error("Namespace ids must contain only lowercase letters, numbers, dashes, and underscores.");
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeField(field: FieldDefinition): FieldDefinition {
  if (!field.name || SYSTEM_FIELDS.includes(field.name as typeof SYSTEM_FIELDS[number])) {
    throw new Error(`Invalid field name ${field.name || "<empty>"}.`);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
    throw new Error(`Field ${field.name} must match ^[a-zA-Z][a-zA-Z0-9_]*$.`);
  }
  return {
    name: field.name,
    type: field.type,
    ...(field.required ? { required: true } : {}),
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.relation ? { relation: { collectionName: field.relation.collectionName } } : {}),
    ...(typeof field.min === "number" ? { min: field.min } : {}),
    ...(typeof field.max === "number" ? { max: field.max } : {}),
    ...(typeof field.minLength === "number" ? { minLength: field.minLength } : {}),
    ...(typeof field.maxLength === "number" ? { maxLength: field.maxLength } : {}),
    ...(field.pattern ? { pattern: field.pattern } : {}),
    ...(field.unique ? { unique: true } : {}),
    ...(typeof field.enumScale === "number" ? { enumScale: field.enumScale } : {}),
    ...(field.barcodeKind ? { barcodeKind: field.barcodeKind } : {}),
    ...(field.durationDisplayUnit ? { durationDisplayUnit: field.durationDisplayUnit } : {}),
  };
}

export function normalizeIndex(index: IndexDefinition): IndexDefinition {
  if (!index.name?.trim()) {
    throw new Error("Index name is required.");
  }
  if (!Array.isArray(index.fields) || index.fields.length === 0) {
    throw new Error(`Index ${index.name} requires at least one field.`);
  }
  return {
    name: index.name.trim(),
    fields: [...new Set(index.fields)],
    ...(index.unique ? { unique: true } : {}),
  };
}

export function validateFields(fields: FieldDefinition[]): FieldDefinition[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("Collections require at least one custom field.");
  }
  const normalized = fields.map(normalizeField);
  const names = new Set<string>();
  for (const field of normalized) {
    if (names.has(field.name)) {
      throw new Error(`Field ${field.name} is duplicated.`);
    }
    names.add(field.name);
    if (field.type === "select" && (!field.options || field.options.length === 0)) {
      throw new Error(`Field ${field.name} requires options.`);
    }
    if (field.type === "relation" && !field.relation?.collectionName) {
      throw new Error(`Field ${field.name} requires relation.collectionName.`);
    }
    if (field.type === "barcode" && !field.barcodeKind) {
      throw new Error(`Field ${field.name} (barcode) requires barcodeKind.`);
    }
    if (field.type === "rating" && typeof field.enumScale === "number" && field.enumScale < 1) {
      throw new Error(`Field ${field.name} (rating) requires enumScale >= 1.`);
    }
  }
  return normalized;
}

export function serializeCollection(row: CollectionRow): CollectionDefinition {
  return {
    namespaceId: row.namespace_id,
    name: row.name,
    displayName: row.display_name,
    fields: parseJson<FieldDefinition[]>(row.fields_json, []),
    indexes: parseJson<IndexDefinition[]>(row.indexes_json, []),
    builtin: Boolean(row.builtin),
    protected: Boolean(row.protected),
    coreFieldNames: parseJson<string[]>(row.core_fields_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeRecord(row: RecordRow): RecordEnvelope {
  const data = parseJson<Record<string, unknown>>(row.data_json, {});
  return {
    id: row.id,
    ...data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeToken(row: TokenRow): ScopedTokenRecord {
  return {
    id: row.id,
    label: row.label,
    namespaceId: row.namespace_id,
    collectionName: row.collection_name,
    operations: parseJson<DatabaseOperation[]>(row.operations_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function serializeFile(row: FileRow): FileAsset {
  return {
    id: row.id,
    namespaceId: row.namespace_id,
    collectionName: row.collection_name,
    recordId: row.record_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    downloadPath: `/v1/files/${row.id}`,
  };
}

export const CURRENCY_REGEX = /^[A-Z]{3}$/;
export const COUNTRY_REGEX = /^[A-Z]{2}$/;
export const E164_REGEX = /^\+[1-9]\d{1,14}$/;
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
export const ISBN10_REGEX = /^(?:\d{9}[\dXx])$/;
export const ISBN13_REGEX = /^\d{13}$/;
export const EAN13_REGEX = /^\d{13}$/;
export const UPC12_REGEX = /^\d{12}$/;

export function checkTextConstraints(field: FieldDefinition, value: string): void {
  if (typeof field.minLength === "number" && value.length < field.minLength) {
    throw new Error(`Field ${field.name} must be at least ${field.minLength} characters.`);
  }
  if (typeof field.maxLength === "number" && value.length > field.maxLength) {
    throw new Error(`Field ${field.name} must be at most ${field.maxLength} characters.`);
  }
  if (field.pattern && !new RegExp(field.pattern).test(value)) {
    throw new Error(`Field ${field.name} does not match required pattern.`);
  }
}

export function checkNumericConstraints(field: FieldDefinition, value: number): void {
  if (typeof field.min === "number" && value < field.min) {
    throw new Error(`Field ${field.name} must be >= ${field.min}.`);
  }
  if (typeof field.max === "number" && value > field.max) {
    throw new Error(`Field ${field.name} must be <= ${field.max}.`);
  }
}

export function validateFieldValue(field: FieldDefinition, value: unknown): void {
  if (value === null || value === undefined) {
    if (field.required) throw new Error(`Field ${field.name} is required.`);
    return;
  }

  switch (field.type) {
    case "text":
    case "markdown":
      if (typeof value !== "string") throw new Error(`Field ${field.name} must be text.`);
      checkTextConstraints(field, value);
      return;
    case "email":
      if (typeof value !== "string" || !value.includes("@")) throw new Error(`Field ${field.name} must be an email.`);
      checkTextConstraints(field, value);
      return;
    case "url":
      if (typeof value !== "string" || !/^https?:\/\//.test(value)) throw new Error(`Field ${field.name} must be a url.`);
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) throw new Error(`Field ${field.name} must be a number.`);
      checkNumericConstraints(field, value);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`Field ${field.name} must be a boolean.`);
      return;
    case "date":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`Field ${field.name} must be an ISO date string.`);
      return;
    case "json":
      if (!isPlainObject(value) && !Array.isArray(value)) throw new Error(`Field ${field.name} must be an object or array.`);
      return;
    case "select":
      if (typeof value !== "string" || !field.options?.includes(value)) throw new Error(`Field ${field.name} must match one of the allowed options.`);
      return;
    case "relation":
      if (typeof value !== "string" || !value.trim()) throw new Error(`Field ${field.name} must be a related record id.`);
      return;
    case "file":
      if (typeof value !== "string" || !value.trim()) throw new Error(`Field ${field.name} must be a file asset id.`);
      return;
    case "money": {
      if (!isPlainObject(value)) throw new Error(`Field ${field.name} must be { amountCents, currency }.`);
      const v = value as Record<string, unknown>;
      if (!Number.isInteger(v.amountCents)) throw new Error(`Field ${field.name}.amountCents must be an integer.`);
      if (typeof v.currency !== "string" || !CURRENCY_REGEX.test(v.currency)) {
        throw new Error(`Field ${field.name}.currency must be ISO 4217 (3 uppercase letters).`);
      }
      return;
    }
    case "currency":
      if (typeof value !== "string" || !CURRENCY_REGEX.test(value)) {
        throw new Error(`Field ${field.name} must be ISO 4217 currency code.`);
      }
      return;
    case "address": {
      if (!isPlainObject(value)) throw new Error(`Field ${field.name} must be an address object.`);
      const v = value as Record<string, unknown>;
      if (v.country !== undefined && (typeof v.country !== "string" || !COUNTRY_REGEX.test(v.country))) {
        throw new Error(`Field ${field.name}.country must be ISO 3166-1 alpha-2.`);
      }
      return;
    }
    case "phone":
      if (typeof value !== "string" || !E164_REGEX.test(value)) {
        throw new Error(`Field ${field.name} must be E.164 phone format (e.g. +14155551234).`);
      }
      return;
    case "geo_point": {
      if (!isPlainObject(value)) throw new Error(`Field ${field.name} must be { lat, lng }.`);
      const v = value as Record<string, unknown>;
      if (typeof v.lat !== "number" || v.lat < -90 || v.lat > 90) throw new Error(`Field ${field.name}.lat out of range.`);
      if (typeof v.lng !== "number" || v.lng < -180 || v.lng > 180) throw new Error(`Field ${field.name}.lng out of range.`);
      return;
    }
    case "rating": {
      if (typeof value !== "number" || Number.isNaN(value)) throw new Error(`Field ${field.name} must be a number.`);
      const scale = field.enumScale ?? 5;
      if (value < 0 || value > scale) throw new Error(`Field ${field.name} must be between 0 and ${scale}.`);
      return;
    }
    case "duration":
      if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
        throw new Error(`Field ${field.name} (duration) must be a non-negative number of seconds.`);
      }
      checkNumericConstraints(field, value);
      return;
    case "percent":
      if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 100) {
        throw new Error(`Field ${field.name} (percent) must be between 0 and 100.`);
      }
      return;
    case "color_hex":
      if (typeof value !== "string" || !HEX_COLOR_REGEX.test(value)) {
        throw new Error(`Field ${field.name} must be a hex color like #RRGGBB.`);
      }
      return;
    case "barcode": {
      if (typeof value !== "string") throw new Error(`Field ${field.name} must be a string.`);
      switch (field.barcodeKind) {
        case "isbn10": if (!ISBN10_REGEX.test(value)) throw new Error(`Field ${field.name} must be ISBN-10.`); break;
        case "isbn13": if (!ISBN13_REGEX.test(value)) throw new Error(`Field ${field.name} must be ISBN-13.`); break;
        case "ean13": if (!EAN13_REGEX.test(value)) throw new Error(`Field ${field.name} must be EAN-13.`); break;
        case "upc12": if (!UPC12_REGEX.test(value)) throw new Error(`Field ${field.name} must be UPC-12.`); break;
        case "qr_text":
        case "generic":
        default: break;
      }
      return;
    }
  }
}

export function validateRecordRules(collection: CollectionDefinition, payload: Record<string, unknown>): void {
  const rules = collection.rules;
  if (!rules || rules.length === 0) return;
  for (const rule of rules) {
    switch (rule.kind) {
      case "compare_dates": {
        const a = payload[rule.left];
        const b = payload[rule.right];
        if (a === undefined || b === undefined || a === null || b === null) continue;
        const av = Date.parse(String(a));
        const bv = Date.parse(String(b));
        if (Number.isNaN(av) || Number.isNaN(bv)) continue;
        const cmp = av === bv ? 0 : av < bv ? -1 : 1;
        const ok = rule.op === "<" ? cmp < 0
          : rule.op === "<=" ? cmp <= 0
          : rule.op === "==" ? cmp === 0
          : rule.op === ">=" ? cmp >= 0
          : cmp > 0;
        if (!ok) throw new Error(rule.message ?? `Rule violated: ${rule.left} ${rule.op} ${rule.right}.`);
        continue;
      }
      case "required_if": {
        if (payload[rule.whenField] === rule.whenEquals && (payload[rule.field] === undefined || payload[rule.field] === null)) {
          throw new Error(rule.message ?? `Field ${rule.field} is required when ${rule.whenField} = ${String(rule.whenEquals)}.`);
        }
        continue;
      }
      case "number_compare": {
        const a = payload[rule.left];
        const b = typeof rule.right === "string" ? payload[rule.right] : rule.right;
        if (typeof a !== "number" || typeof b !== "number") continue;
        const cmp = a === b ? 0 : a < b ? -1 : 1;
        const ok = rule.op === "<" ? cmp < 0
          : rule.op === "<=" ? cmp <= 0
          : rule.op === "==" ? cmp === 0
          : rule.op === ">=" ? cmp >= 0
          : cmp > 0;
        if (!ok) throw new Error(rule.message ?? `Rule violated: ${rule.left} ${rule.op} ${String(rule.right)}.`);
        continue;
      }
      case "regex": {
        const v = payload[rule.field];
        if (typeof v !== "string") continue;
        if (!new RegExp(rule.pattern).test(v)) {
          throw new Error(rule.message ?? `Field ${rule.field} does not match required pattern.`);
        }
        continue;
      }
    }
  }
}

export function builtInCollections(): Array<{
  name: string;
  displayName: string;
  coreFieldNames: string[];
  fields: FieldDefinition[];
  indexes: IndexDefinition[];
}> {
  return [
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((definition) => ({
      name: definition.name,
      displayName: definition.displayName,
      coreFieldNames: [...definition.coreFieldNames],
      fields: definition.fields.map((field) => ({
        name: field.name,
        type: field.type,
        ...(field.required ? { required: true } : {}),
        ...(field.options ? { options: [...field.options] } : {}),
        ...(field.relation ? { relation: { collectionName: field.relation.collectionName } } : {}),
      })),
      indexes: definition.indexes.map((index) => ({
        name: index.name,
        fields: [...index.fields],
        ...(index.unique ? { unique: true } : {}),
      })),
    })),
    // ── Built-in B2C/B2B catalog (registry) ─────────────────────────
    // Modular collections declared under packages/clawjs-core/src/builtins/
    // (one file per collection, grouped by family). Includes the 188
    // B2B-style collections (identity, work, billing, crm, support,
    // analytics, observability, infra, marketing, agents, hr, etc.) plus
    // the B2C catalog that lives in the same registry.
    ...BUILTIN_COLLECTIONS.map((definition) => ({
      name: definition.name,
      displayName: definition.displayName,
      coreFieldNames: definition.fields.filter((f) => f.required).map((f) => f.name),
      fields: definition.fields.map((field) => ({
        name: field.name,
        type: field.type as FieldDefinition["type"],
        ...(field.required ? { required: true } : {}),
        ...(field.options ? { options: [...field.options] } : {}),
        ...(field.relation ? { relation: { collectionName: field.relation.collectionName } } : {}),
        ...(typeof field.min === "number" ? { min: field.min } : {}),
        ...(typeof field.max === "number" ? { max: field.max } : {}),
        ...(typeof field.minLength === "number" ? { minLength: field.minLength } : {}),
        ...(typeof field.maxLength === "number" ? { maxLength: field.maxLength } : {}),
        ...(field.pattern ? { pattern: field.pattern } : {}),
        ...(field.unique ? { unique: true } : {}),
        ...(typeof field.enumScale === "number" ? { enumScale: field.enumScale } : {}),
        ...(field.barcodeKind ? { barcodeKind: field.barcodeKind } : {}),
        ...(field.durationDisplayUnit ? { durationDisplayUnit: field.durationDisplayUnit } : {}),
      })),
      indexes: definition.indexes.map((index) => ({
        name: index.name,
        fields: [...index.fields],
        ...(index.unique ? { unique: true } : {}),
      })),
    })),
    // ── Company app collections ─────────────────────────────────────
    // Models a virtual company where the human (board) hires AI agents
    // into roles and collaborates with them via issues and an inbox.
    {
      name: "companies",
      displayName: "Companies",
      coreFieldNames: ["name", "issuePrefix", "status"],
      fields: [
        { name: "name", type: "text", required: true },
        { name: "issuePrefix", type: "text", required: true },
        { name: "issueCounter", type: "number", required: true },
        { name: "status", type: "select", required: true, options: ["active", "archived"] },
        { name: "description", type: "text" },
        { name: "brandColor", type: "text" },
        { name: "budgetMonthlyCents", type: "number" },
        { name: "spentMonthlyCents", type: "number" },
        { name: "requireBoardApprovalForNewAgents", type: "boolean" },
      ],
      indexes: [{ name: "companies_prefix_unique", fields: ["issuePrefix"], unique: true }],
    },
    {
      name: "portfolios",
      displayName: "Portfolios",
      coreFieldNames: ["companyId", "name", "slug", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["active", "paused", "archived"] },
        { name: "description", type: "text" },
        { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
        { name: "color", type: "text" },
      ],
      indexes: [
        { name: "portfolios_company_idx", fields: ["companyId"] },
        { name: "portfolios_company_slug_unique", fields: ["companyId", "slug"], unique: true },
      ],
    },
    {
      name: "portfolio_items",
      displayName: "Portfolio Items",
      coreFieldNames: ["companyId", "portfolioId", "name", "slug", "itemType", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "portfolioId", type: "relation", required: true, relation: { collectionName: "portfolios" } },
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        {
          name: "itemType",
          type: "select",
          required: true,
          options: ["app", "web", "saas", "client", "brand", "store", "service", "internal", "other"],
        },
        { name: "status", type: "select", required: true, options: ["active", "paused", "at_risk", "archived"] },
        {
          name: "lifecycleStage",
          type: "select",
          required: true,
          options: ["idea", "validating", "building", "launched", "scaling", "sustaining", "sunset"],
        },
        { name: "description", type: "text" },
        { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "healthStatus", type: "select", options: ["green", "yellow", "red", "unknown"] },
        { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
        { name: "targetDate", type: "date" },
        { name: "tags", type: "json" },
        { name: "sourceSystem", type: "text" },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "portfolio_items_company_idx", fields: ["companyId"] },
        { name: "portfolio_items_portfolio_idx", fields: ["portfolioId"] },
        { name: "portfolio_items_company_slug_unique", fields: ["companyId", "slug"], unique: true },
        { name: "portfolio_items_type_idx", fields: ["itemType"] },
        { name: "portfolio_items_health_idx", fields: ["healthStatus"] },
      ],
    },
    {
      name: "company_agents",
      displayName: "Company Agents",
      coreFieldNames: ["companyId", "name", "role", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "name", type: "text", required: true },
        { name: "role", type: "text", required: true },
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["pending_approval", "active", "paused", "fired"] },
        { name: "adapterType", type: "select", required: true, options: ["human", "clawjs_local"] },
        { name: "icon", type: "text" },
        { name: "reportsTo", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "capabilities", type: "text" },
        { name: "adapterConfig", type: "json" },
        { name: "instructionsMarkdown", type: "text" },
        { name: "clawAppId", type: "text" },
        { name: "clawWorkspaceId", type: "text" },
        { name: "clawAgentId", type: "text" },
        { name: "workspaceDir", type: "text" },
        { name: "scopeType", type: "select", options: ["company", "portfolio", "portfolio_item", "project"] },
        { name: "scopeId", type: "text" },
        { name: "autonomyLevel", type: "select", options: ["observe", "suggest", "act_limited", "act_full"] },
        { name: "approvalPolicy", type: "json" },
        { name: "watchDomains", type: "json" },
        // v8 (2026-05): agent identity becomes first-class in the
        // app. The fields below are all nullable so the existing
        // company_agents rows keep working — they describe an agent's
        // composition (personalities, skill subscriptions, secret tags,
        // integrations, delegation policy) the way the macOS UI now
        // models it under `~/.claw/agents/<id>/`. The filesystem
        // version is the source of truth; this table is a cache for
        // SQL joins (e.g. issue.assigneeAgentId → agent.name).
        { name: "runtime", type: "select", options: ["codex", "openclaude", "hermes", "claw", "demo"] },
        { name: "model", type: "text" },
        { name: "avatarKind", type: "select", options: ["logoTint", "customImage"] },
        { name: "avatarTintHex", type: "text" },
        { name: "avatarImagePath", type: "text" },
        { name: "instructionsFreeText", type: "text" },
        { name: "personalityIds", type: "json" },
        { name: "skillAllowlist", type: "json" },
        { name: "skillCollectionIds", type: "json" },
        { name: "secretAllowlist", type: "json" },
        { name: "secretTags", type: "json" },
        { name: "projectIds", type: "json" },
        { name: "integrationBindings", type: "json" },
        { name: "autonomyOverrides", type: "json" },
        { name: "delegationReportsTo", type: "text" },
        { name: "delegationAllowedSubagents", type: "json" },
        { name: "delegationScopeInherits", type: "boolean" },
        { name: "isBuiltin", type: "boolean" },
      ],
      indexes: [{ name: "company_agents_company_idx", fields: ["companyId"] }],
    },
    {
      // Reusable personality fragments. Each row is a markdown prompt
      // snippet plugged into one or more agents via
      // `company_agents.personalityIds`. The macOS app mirrors these
      // on the filesystem under `~/.claw/personalities/<id>/`;
      // ClawJS uses this collection as the SQL index so listings and
      // joins don't have to fan out over the filesystem.
      name: "personalities",
      displayName: "Personalities",
      coreFieldNames: ["id", "name", "version"],
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "promptMarkdown", type: "text" },
        { name: "version", type: "number" },
      ],
      indexes: [{ name: "personalities_id_idx", fields: ["id"] }],
    },
    {
      // Tag-based bundles of skills an agent can subscribe to.
      // Members are resolved at runtime by matching `includedTags`
      // against the frontmatter of `~/.claw/skills/<id>/SKILL.md`.
      name: "skill_collections",
      displayName: "Skill Collections",
      coreFieldNames: ["id", "name"],
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "includedTags", type: "json" },
      ],
      indexes: [{ name: "skill_collections_id_idx", fields: ["id"] }],
    },
    {
      // Auth handles for third-party services (Telegram bots, Slack
      // workspaces, etc.). Bot tokens / OAuth refresh tokens are
      // stored encrypted at `~/.claw/connections/<id>/auth.encrypted`,
      // never in this table.
      name: "connections",
      displayName: "Connections",
      coreFieldNames: ["id", "service", "label"],
      fields: [
        { name: "service", type: "select", required: true,
          options: ["telegram", "slack", "discord", "email", "sms", "webhook", "custom"] },
        { name: "label", type: "text", required: true },
        { name: "scopes", type: "json" },
        { name: "lastSyncAt", type: "date" },
      ],
      indexes: [{ name: "connections_id_idx", fields: ["id"] }],
    },
    {
      // Per-agent binding of a Connection to a specific channel /
      // chat / group. Direction lets a binding be inbound-only
      // (listen + reply to that channel), outbound-only (push status
      // updates) or both. The runtime watcher in `clawjs-integrations`
      // reads this table to know which agent should pick up an
      // inbound message.
      name: "integration_bindings",
      displayName: "Integration Bindings",
      coreFieldNames: ["id", "agentId", "connectionId"],
      fields: [
        { name: "agentId", type: "relation", required: true, relation: { collectionName: "company_agents" } },
        { name: "connectionId", type: "relation", required: true, relation: { collectionName: "connections" } },
        { name: "channelRef", type: "text", required: true },
        { name: "direction", type: "select", options: ["inbound", "outbound", "both"] },
        { name: "label", type: "text" },
      ],
      indexes: [
        { name: "integration_bindings_agent_idx", fields: ["agentId"] },
        { name: "integration_bindings_connection_idx", fields: ["connectionId"] },
      ],
    },
    {
      // Append-only audit trail. One row per delegated invocation,
      // approval prompt, or denied action. The macOS app surfaces
      // this on the agent detail surface ("Audit log" section). The
      // filesystem mirror is `~/.claw/agents/<id>/audit.log`
      // (JSONL); this table is the SQL index.
      name: "agent_audit_log",
      displayName: "Agent Audit Log",
      coreFieldNames: ["id", "actorAgentId", "action", "result"],
      fields: [
        { name: "actorAgentId", type: "relation", required: true, relation: { collectionName: "company_agents" } },
        { name: "subjectAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "action", type: "text", required: true },
        { name: "result", type: "text", required: true },
        { name: "note", type: "text" },
      ],
      indexes: [
        { name: "agent_audit_log_actor_idx", fields: ["actorAgentId"] },
        { name: "agent_audit_log_action_idx", fields: ["action"] },
      ],
    },
    {
      name: "issues",
      displayName: "Issues",
      coreFieldNames: ["companyId", "identifier", "title", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "identifier", type: "text", required: true },
        { name: "issueNumber", type: "number", required: true },
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"] },
        { name: "priority", type: "select", required: true, options: ["low", "medium", "high", "urgent"] },
        { name: "description", type: "text" },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "portfolioId", type: "relation", relation: { collectionName: "portfolios" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "goalId", type: "relation", relation: { collectionName: "goals" } },
        { name: "parentId", type: "relation", relation: { collectionName: "issues" } },
        { name: "assigneeAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "createdByAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "createdByUserId", type: "text" },
        { name: "executionRunId", type: "text" },
        { name: "workType", type: "select", options: ["feature", "bug", "ops", "support", "research", "launch", "maintenance"] },
        { name: "sourceDomain", type: "select", options: ["strategy", "execution", "operations", "feedback"] },
        { name: "releaseId", type: "relation", relation: { collectionName: "company_releases" } },
        { name: "incidentId", type: "relation", relation: { collectionName: "operational_incidents" } },
        { name: "feedbackItemId", type: "relation", relation: { collectionName: "feedback_items" } },
        { name: "autonomous", type: "boolean" },
        { name: "approvalState", type: "select", options: ["not_required", "pending", "approved", "rejected"] },
        { name: "dueAt", type: "date" },
        // Plan extensions:
        { name: "stateId", type: "relation", relation: { collectionName: "workflow_states" } },
        { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
        { name: "resolution", type: "select", options: ["fixed", "wont_fix", "duplicate", "cannot_reproduce", "incomplete", "done"] },
        { name: "resolvedAt", type: "date" },
        { name: "assigneeActorId", type: "relation", relation: { collectionName: "actors" } },
        { name: "creatorActorId", type: "relation", relation: { collectionName: "actors" } },
        { name: "previousIdentifiers", type: "json" },
        { name: "fixVersionId", type: "relation", relation: { collectionName: "versions" } },
        { name: "milestoneId", type: "relation", relation: { collectionName: "milestones" } },
        { name: "cycleId", type: "relation", relation: { collectionName: "cycles" } },
        { name: "estimate", type: "number" },
        { name: "estimateScale", type: "text" },
        { name: "startedAt", type: "date" },
        { name: "completedAt", type: "date" },
        { name: "canceledAt", type: "date" },
        { name: "archivedAt", type: "date" },
        { name: "snoozedUntilAt", type: "date" },
        { name: "trashed", type: "boolean" },
        { name: "trashedAt", type: "date" },
        { name: "editedAt", type: "date" },
        { name: "sortOrder", type: "number" },
        { name: "sourceMetadata", type: "json" },
        { name: "customFieldValues", type: "json" },
        { name: "slaBreachesAt", type: "date" },
        { name: "slaStartedAt", type: "date" },
        { name: "slaDayCount", type: "number" },
        { name: "slaUsesBusinessDays", type: "boolean" },
      ],
      indexes: [
        { name: "issues_company_idx", fields: ["companyId"] },
        { name: "issues_identifier_unique", fields: ["companyId", "identifier"], unique: true },
        { name: "issues_state_idx", fields: ["stateId"] },
        { name: "issues_assignee_actor_idx", fields: ["assigneeActorId"] },
        { name: "issues_cycle_idx", fields: ["cycleId"] },
        { name: "issues_team_idx", fields: ["teamId"] },
      ],
    },
    {
      name: "issue_comments",
      displayName: "Issue Comments",
      coreFieldNames: ["companyId", "issueId", "body"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "issueId", type: "relation", required: true, relation: { collectionName: "issues" } },
        { name: "body", type: "text", required: true },
        { name: "authorAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "authorUserId", type: "text" },
        { name: "createdByRunId", type: "text" },
      ],
      indexes: [{ name: "issue_comments_issue_idx", fields: ["issueId"] }],
    },
    {
      name: "company_approvals",
      displayName: "Approvals",
      coreFieldNames: ["companyId", "type", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "type", type: "select", required: true, options: ["hire_agent", "fire_agent", "budget_change", "policy_change"] },
        { name: "status", type: "select", required: true, options: ["pending", "approved", "rejected"] },
        { name: "payload", type: "json" },
        { name: "requestedByAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "requestedByUserId", type: "text" },
        { name: "decidedAt", type: "date" },
        { name: "decidedByUserId", type: "text" },
        { name: "reason", type: "text" },
      ],
      indexes: [{ name: "company_approvals_company_idx", fields: ["companyId"] }],
    },
    {
      name: "runs",
      displayName: "Runs",
      coreFieldNames: ["companyId", "agentId", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "agentId", type: "relation", required: true, relation: { collectionName: "company_agents" } },
        { name: "status", type: "select", required: true, options: ["queued", "running", "succeeded", "failed", "cancelled"] },
        { name: "issueId", type: "relation", relation: { collectionName: "issues" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "releaseId", type: "relation", relation: { collectionName: "company_releases" } },
        { name: "incidentId", type: "relation", relation: { collectionName: "operational_incidents" } },
        { name: "feedbackItemId", type: "relation", relation: { collectionName: "feedback_items" } },
        { name: "clawSessionId", type: "text" },
        { name: "startedAt", type: "date" },
        { name: "finishedAt", type: "date" },
        { name: "errorMessage", type: "text" },
        { name: "metrics", type: "json" },
        { name: "actionType", type: "text" },
      ],
      indexes: [{ name: "runs_company_idx", fields: ["companyId"] }],
    },
    {
      name: "company_releases",
      displayName: "Releases",
      coreFieldNames: ["companyId", "name", "status", "releaseType"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "name", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["planned", "in_progress", "blocked", "released", "cancelled"] },
        { name: "releaseType", type: "select", required: true, options: ["launch", "update", "experiment", "maintenance", "internal"] },
        { name: "plannedAt", type: "date" },
        { name: "releasedAt", type: "date" },
        { name: "summary", type: "text" },
        { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "notes", type: "text" },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "releases_company_idx", fields: ["companyId"] },
        { name: "releases_item_idx", fields: ["portfolioItemId"] },
      ],
    },
    {
      name: "operational_checks",
      displayName: "Operational Checks",
      coreFieldNames: ["companyId", "name", "domain", "status"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "name", type: "text", required: true },
        {
          name: "domain",
          type: "select",
          required: true,
          options: ["availability", "quality", "delivery", "compliance", "support", "growth", "custom"],
        },
        { name: "status", type: "select", required: true, options: ["ok", "degraded", "failed", "unknown"] },
        { name: "severity", type: "select", required: true, options: ["info", "warning", "critical"] },
        { name: "sourceType", type: "select", required: true, options: ["manual", "import", "monitor", "derived"] },
        { name: "lastObservedAt", type: "date" },
        { name: "detail", type: "text" },
        { name: "metricValue", type: "number" },
        { name: "metricUnit", type: "text" },
        { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "operational_checks_company_idx", fields: ["companyId"] },
        { name: "operational_checks_status_idx", fields: ["status"] },
      ],
    },
    {
      name: "operational_incidents",
      displayName: "Operational Incidents",
      coreFieldNames: ["companyId", "title", "status", "severity", "startedAt"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "checkId", type: "relation", relation: { collectionName: "operational_checks" } },
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["open", "investigating", "mitigated", "resolved", "cancelled"] },
        { name: "severity", type: "select", required: true, options: ["sev1", "sev2", "sev3", "sev4"] },
        { name: "startedAt", type: "date", required: true },
        { name: "resolvedAt", type: "date" },
        { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "summary", type: "text" },
        { name: "resolution", type: "text" },
        { name: "linkedIssueId", type: "relation", relation: { collectionName: "issues" } },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "operational_incidents_company_idx", fields: ["companyId"] },
        { name: "operational_incidents_status_idx", fields: ["status"] },
      ],
    },
    {
      name: "feedback_items",
      displayName: "Feedback Items",
      coreFieldNames: ["companyId", "title", "status", "sourceType", "receivedAt"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "title", type: "text", required: true },
        { name: "body", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["new", "triaged", "planned", "closed", "ignored"] },
        { name: "priority", type: "select", required: true, options: ["low", "medium", "high", "urgent"] },
        {
          name: "sourceType",
          type: "select",
          required: true,
          options: ["review", "support", "interview", "sales", "ops", "internal", "import", "other"],
        },
        { name: "sourceLabel", type: "text" },
        { name: "customerName", type: "text" },
        { name: "customerSegment", type: "text" },
        { name: "sentiment", type: "select", options: ["positive", "neutral", "negative", "mixed"] },
        { name: "receivedAt", type: "date", required: true },
        { name: "ownerAgentId", type: "relation", relation: { collectionName: "company_agents" } },
        { name: "linkedIssueId", type: "relation", relation: { collectionName: "issues" } },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "feedback_items_company_idx", fields: ["companyId"] },
        { name: "feedback_items_status_idx", fields: ["status"] },
      ],
    },
    {
      name: "metric_snapshots",
      displayName: "Metric Snapshots",
      coreFieldNames: ["companyId", "metricKey", "metricLabel", "value", "capturedAt"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "portfolioId", type: "relation", relation: { collectionName: "portfolios" } },
        { name: "portfolioItemId", type: "relation", relation: { collectionName: "portfolio_items" } },
        { name: "projectId", type: "relation", relation: { collectionName: "projects" } },
        { name: "metricKey", type: "text", required: true },
        { name: "metricLabel", type: "text", required: true },
        { name: "value", type: "number", required: true },
        { name: "unit", type: "text" },
        { name: "direction", type: "select", required: true, options: ["up_good", "down_good", "neutral"] },
        { name: "capturedAt", type: "date", required: true },
        { name: "sourceType", type: "select", required: true, options: ["manual", "import", "derived"] },
        { name: "period", type: "text" },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "metric_snapshots_company_idx", fields: ["companyId"] },
        { name: "metric_snapshots_key_idx", fields: ["metricKey"] },
      ],
    },
    {
      name: "import_batches",
      displayName: "Import Batches",
      coreFieldNames: ["companyId", "type", "status", "startedAt"],
      fields: [
        { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
        { name: "type", type: "select", required: true, options: ["feedback", "metrics", "checks", "incidents", "mixed"] },
        { name: "status", type: "select", required: true, options: ["running", "completed", "failed", "cancelled"] },
        { name: "sourceLabel", type: "text" },
        { name: "startedAt", type: "date", required: true },
        { name: "finishedAt", type: "date" },
        { name: "createdByUserId", type: "text" },
        { name: "summary", type: "text" },
        { name: "counts", type: "json" },
        { name: "metadata", type: "json" },
      ],
      indexes: [
        { name: "import_batches_company_idx", fields: ["companyId"] },
        { name: "import_batches_status_idx", fields: ["status"] },
      ],
    },
    // ── Hub app collections ────────────────────────────────────────────
    // Real-time communication platform for agents. Spaces contain
    // channels organised by categories; messages flow through channels.
    {
      name: "hub_spaces",
      displayName: "Hub Spaces",
      coreFieldNames: ["name", "ownerId"],
      fields: [
        { name: "name", type: "text", required: true },
        { name: "description", type: "text" },
        { name: "icon", type: "text" },
        { name: "ownerId", type: "text", required: true },
        { name: "visibility", type: "select", required: true, options: ["public", "private"] },
        { name: "metadata", type: "json" },
      ],
      indexes: [{ name: "hub_spaces_owner_idx", fields: ["ownerId"] }],
    },
    {
      name: "hub_categories",
      displayName: "Hub Categories",
      coreFieldNames: ["spaceId", "name"],
      fields: [
        { name: "spaceId", type: "relation", required: true, relation: { collectionName: "hub_spaces" } },
        { name: "name", type: "text", required: true },
        { name: "position", type: "number", required: true },
      ],
      indexes: [{ name: "hub_categories_space_idx", fields: ["spaceId"] }],
    },
    {
      name: "hub_channels",
      displayName: "Hub Channels",
      coreFieldNames: ["name", "kind"],
      fields: [
        { name: "spaceId", type: "relation", relation: { collectionName: "hub_spaces" } },
        { name: "categoryId", type: "relation", relation: { collectionName: "hub_categories" } },
        { name: "name", type: "text", required: true },
        { name: "topic", type: "text" },
        { name: "kind", type: "select", required: true, options: ["text", "voice", "announcement", "dm"] },
        { name: "visibility", type: "select", required: true, options: ["public", "private"] },
        { name: "position", type: "number" },
        { name: "lastMessageAt", type: "date" },
      ],
      indexes: [
        { name: "hub_channels_space_idx", fields: ["spaceId"] },
        { name: "hub_channels_kind_idx", fields: ["kind"] },
      ],
    },
    {
      name: "hub_messages",
      displayName: "Hub Messages",
      coreFieldNames: ["channelId", "authorId", "content"],
      fields: [
        { name: "channelId", type: "relation", required: true, relation: { collectionName: "hub_channels" } },
        { name: "threadId", type: "relation", relation: { collectionName: "hub_messages" } },
        { name: "authorId", type: "text", required: true },
        { name: "authorKind", type: "select", required: true, options: ["agent", "human"] },
        { name: "content", type: "text", required: true },
        { name: "contentType", type: "select", required: true, options: ["text", "system", "embed", "file"] },
        { name: "editedAt", type: "date" },
        { name: "replyToId", type: "relation", relation: { collectionName: "hub_messages" } },
        { name: "attachments", type: "json" },
        { name: "pinned", type: "boolean" },
      ],
      indexes: [
        { name: "hub_messages_channel_idx", fields: ["channelId"] },
        { name: "hub_messages_thread_idx", fields: ["threadId"] },
        { name: "hub_messages_author_idx", fields: ["authorId"] },
      ],
    },
    {
      name: "hub_members",
      displayName: "Hub Members",
      coreFieldNames: ["spaceId", "agentId", "status"],
      fields: [
        { name: "spaceId", type: "relation", required: true, relation: { collectionName: "hub_spaces" } },
        { name: "agentId", type: "text", required: true },
        { name: "displayName", type: "text" },
        { name: "roles", type: "json" },
        { name: "status", type: "select", required: true, options: ["active", "banned", "left"] },
        { name: "presence", type: "select", options: ["online", "idle", "busy", "offline"] },
        { name: "lastSeenAt", type: "date" },
      ],
      indexes: [
        { name: "hub_members_space_idx", fields: ["spaceId"] },
        { name: "hub_members_agent_idx", fields: ["agentId"] },
        { name: "hub_members_unique", fields: ["spaceId", "agentId"], unique: true },
      ],
    },
    {
      name: "hub_roles",
      displayName: "Hub Roles",
      coreFieldNames: ["spaceId", "name"],
      fields: [
        { name: "spaceId", type: "relation", required: true, relation: { collectionName: "hub_spaces" } },
        { name: "name", type: "text", required: true },
        { name: "color", type: "text" },
        { name: "position", type: "number", required: true },
        { name: "permissions", type: "json", required: true },
        { name: "mentionable", type: "boolean" },
      ],
      indexes: [{ name: "hub_roles_space_idx", fields: ["spaceId"] }],
    },
    {
      name: "hub_reactions",
      displayName: "Hub Reactions",
      coreFieldNames: ["messageId", "agentId", "emoji"],
      fields: [
        { name: "messageId", type: "relation", required: true, relation: { collectionName: "hub_messages" } },
        { name: "agentId", type: "text", required: true },
        { name: "emoji", type: "text", required: true },
      ],
      indexes: [
        { name: "hub_reactions_message_idx", fields: ["messageId"] },
        { name: "hub_reactions_unique", fields: ["messageId", "agentId", "emoji"], unique: true },
      ],
    },
    {
      name: "hub_read_states",
      displayName: "Hub Read States",
      coreFieldNames: ["channelId", "agentId"],
      fields: [
        { name: "channelId", type: "relation", required: true, relation: { collectionName: "hub_channels" } },
        { name: "agentId", type: "text", required: true },
        { name: "lastReadMessageId", type: "relation", relation: { collectionName: "hub_messages" } },
        { name: "lastReadAt", type: "date" },
        { name: "mentionCount", type: "number" },
      ],
      indexes: [
        { name: "hub_read_states_unique", fields: ["channelId", "agentId"], unique: true },
      ],
    },
    {
      name: "hub_dm_participants",
      displayName: "Hub DM Participants",
      coreFieldNames: ["channelId", "agentId"],
      fields: [
        { name: "channelId", type: "relation", required: true, relation: { collectionName: "hub_channels" } },
        { name: "agentId", type: "text", required: true },
      ],
      indexes: [
        { name: "hub_dm_participants_channel_idx", fields: ["channelId"] },
        { name: "hub_dm_participants_agent_idx", fields: ["agentId"] },
        { name: "hub_dm_participants_unique", fields: ["channelId", "agentId"], unique: true },
      ],
    },
    {
      name: "hub_notifications",
      displayName: "Hub Notifications",
      coreFieldNames: ["recipientId", "kind", "read"],
      fields: [
        { name: "recipientId", type: "text", required: true },
        { name: "kind", type: "select", required: true, options: ["mention", "dm", "reply", "system"] },
        { name: "channelId", type: "relation", relation: { collectionName: "hub_channels" } },
        { name: "messageId", type: "relation", relation: { collectionName: "hub_messages" } },
        { name: "spaceId", type: "relation", relation: { collectionName: "hub_spaces" } },
        { name: "read", type: "boolean", required: true },
        { name: "body", type: "text" },
      ],
      indexes: [{ name: "hub_notifications_recipient_idx", fields: ["recipientId"] }],
    },
  ];
}

export function mergeBuiltinFields(current: FieldDefinition[], next: FieldDefinition[]): FieldDefinition[] {
  const byName = new Map(current.map((field) => [field.name, field]));
  for (const field of next) {
    if (!byName.has(field.name)) {
      byName.set(field.name, field);
    }
  }
  return [...byName.values()];
}

export function mergeBuiltinIndexes(current: IndexDefinition[], next: IndexDefinition[]): IndexDefinition[] {
  const byName = new Map(current.map((index) => [index.name, index]));
  for (const index of next) {
    if (!byName.has(index.name)) {
      byName.set(index.name, index);
    }
  }
  return [...byName.values()];
}
