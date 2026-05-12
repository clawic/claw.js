import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";
import { PRODUCTIVITY_COLLECTION_DEFINITIONS, BUILTIN_COLLECTIONS, BUILTIN_COLLECTIONS_BY_NAME } from "@clawjs/core";

import { generateOpaqueToken, hashSecret } from "./auth.ts";
import type {
  CollectionDefinition,
  CollectionRule,
  DatabaseOperation,
  FieldDefinition,
  FileAsset,
  IndexDefinition,
  NamespaceRecord,
  RecordEnvelope,
  ScopedTokenRecord,
} from "./types.ts";

interface CollectionRow {
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

interface RecordRow {
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface TokenRow {
  id: string;
  label: string;
  namespace_id: string;
  collection_name: string | null;
  operations_json: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface FileRow {
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

const SYSTEM_FIELDS = ["id", "createdAt", "updatedAt"] as const;
const VALID_OPERATIONS = new Set<DatabaseOperation>([
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

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}

function assertCollectionName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error("Collection names must match ^[a-z][a-z0-9_]*$.");
  }
}

function assertNamespaceId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(value)) {
    throw new Error("Namespace ids must contain only lowercase letters, numbers, dashes, and underscores.");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeField(field: FieldDefinition): FieldDefinition {
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

function normalizeIndex(index: IndexDefinition): IndexDefinition {
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

function validateFields(fields: FieldDefinition[]): FieldDefinition[] {
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

function serializeCollection(row: CollectionRow): CollectionDefinition {
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

function serializeRecord(row: RecordRow): RecordEnvelope {
  const data = parseJson<Record<string, unknown>>(row.data_json, {});
  return {
    id: row.id,
    ...data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeToken(row: TokenRow): ScopedTokenRecord {
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

function serializeFile(row: FileRow): FileAsset {
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

const CURRENCY_REGEX = /^[A-Z]{3}$/;
const COUNTRY_REGEX = /^[A-Z]{2}$/;
const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const ISBN10_REGEX = /^(?:\d{9}[\dXx])$/;
const ISBN13_REGEX = /^\d{13}$/;
const EAN13_REGEX = /^\d{13}$/;
const UPC12_REGEX = /^\d{12}$/;

function checkTextConstraints(field: FieldDefinition, value: string): void {
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

function checkNumericConstraints(field: FieldDefinition, value: number): void {
  if (typeof field.min === "number" && value < field.min) {
    throw new Error(`Field ${field.name} must be >= ${field.min}.`);
  }
  if (typeof field.max === "number" && value > field.max) {
    throw new Error(`Field ${field.name} must be <= ${field.max}.`);
  }
}

function validateFieldValue(field: FieldDefinition, value: unknown): void {
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

function validateRecordRules(collection: CollectionDefinition, payload: Record<string, unknown>): void {
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

function builtInCollections(): Array<{
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
        // models it under `~/.clawjs/agents/<id>/`. The filesystem
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
      // on the filesystem under `~/.clawjs/personalities/<id>/`;
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
      // against the frontmatter of `~/.clawjs/skills/<id>/SKILL.md`.
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
      // stored encrypted at `~/.clawjs/connections/<id>/auth.encrypted`,
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
      // filesystem mirror is `~/.clawjs/agents/<id>/audit.log`
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
    // ── Wiki app collections ───────────────────────────────────────────
    // Mirrors the wiki app's data model for cross-app data sync.
    {
      name: "wiki_pages",
      displayName: "Wiki Pages",
      coreFieldNames: ["title", "slug", "spaceId"],
      fields: [
        { name: "title", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        { name: "body", type: "text", required: true },
        { name: "spaceId", type: "text", required: true },
        { name: "parentPageId", type: "text" },
        { name: "tags", type: "json" },
        { name: "status", type: "select", options: ["draft", "published", "archived"] },
      ],
      indexes: [{ name: "wiki_pages_slug_idx", fields: ["slug"] }],
    },
    {
      name: "wiki_comments",
      displayName: "Wiki Comments",
      coreFieldNames: ["pageId", "body"],
      fields: [
        { name: "pageId", type: "text", required: true },
        { name: "parentCommentId", type: "text" },
        { name: "body", type: "text", required: true },
        { name: "authorAgentId", type: "text" },
        { name: "authorUserId", type: "text" },
        { name: "upvotes", type: "number" },
      ],
      indexes: [{ name: "wiki_comments_page_idx", fields: ["pageId"] }],
    },
    {
      name: "wiki_links",
      displayName: "Wiki Links",
      coreFieldNames: ["sourcePageId", "targetPageId", "linkType"],
      fields: [
        { name: "sourcePageId", type: "text", required: true },
        { name: "targetPageId", type: "text", required: true },
        { name: "linkType", type: "select", required: true, options: ["related", "depends-on", "supersedes", "wikilink"] },
        { name: "label", type: "text" },
      ],
      indexes: [
        { name: "wiki_links_source_idx", fields: ["sourcePageId"] },
        { name: "wiki_links_target_idx", fields: ["targetPageId"] },
      ],
    },
    {
      name: "wiki_revisions",
      displayName: "Wiki Revisions",
      coreFieldNames: ["pageId", "revisionNumber"],
      fields: [
        { name: "pageId", type: "text", required: true },
        { name: "revisionNumber", type: "number", required: true },
        { name: "title", type: "text" },
        { name: "body", type: "text", required: true },
        { name: "editedByAgentId", type: "text" },
        { name: "editedByUserId", type: "text" },
        { name: "changeSummary", type: "text" },
      ],
      indexes: [{ name: "wiki_revisions_page_idx", fields: ["pageId"] }],
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

function mergeBuiltinFields(current: FieldDefinition[], next: FieldDefinition[]): FieldDefinition[] {
  const byName = new Map(current.map((field) => [field.name, field]));
  for (const field of next) {
    if (!byName.has(field.name)) {
      byName.set(field.name, field);
    }
  }
  return [...byName.values()];
}

function mergeBuiltinIndexes(current: IndexDefinition[], next: IndexDefinition[]): IndexDefinition[] {
  const byName = new Map(current.map((index) => [index.name, index]));
  for (const index of next) {
    if (!byName.has(index.name)) {
      byName.set(index.name, index);
    }
  }
  return [...byName.values()];
}

export class DatabaseServiceStore {
  readonly sqlite: Database.Database;

  constructor(
    dbPath: string,
    private readonly filesDir: string,
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(filesDir, { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS namespaces (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collections (
        namespace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        fields_json TEXT NOT NULL,
        indexes_json TEXT NOT NULL,
        builtin INTEGER NOT NULL DEFAULT 0,
        protected INTEGER NOT NULL DEFAULT 0,
        core_fields_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_id, name),
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS records (
        namespace_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_id, collection_name, id),
        FOREIGN KEY (namespace_id, collection_name) REFERENCES collections(namespace_id, name) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        namespace_id TEXT NOT NULL,
        collection_name TEXT,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        collection_name TEXT,
        record_id TEXT,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS service_meta (
        meta_key TEXT PRIMARY KEY,
        meta_value TEXT NOT NULL
      );
    `);
  }

  private seed(): void {
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run("admin-main", "admin@database.local", hashSecret("database-admin"), now);
    if (this.listNamespaces().length === 0) {
      this.createNamespace({ id: "main", displayName: "Main" });
    }
    // Ensure builtin collections exist on every namespace, so newly added
    // builtins (e.g. the company app collections) are migrated into existing
    // databases without requiring a manual reset.
    for (const namespace of this.listNamespaces()) {
      this.ensureBuiltinCollections(namespace.id);
    }
  }

  ensureBuiltinCollections(namespaceId: string): void {
    for (const builtIn of builtInCollections()) {
      const current = this.getCollection(namespaceId, builtIn.name);
      if (!current) {
        this.createCollection(namespaceId, {
          name: builtIn.name,
          displayName: builtIn.displayName,
          fields: builtIn.fields,
          indexes: builtIn.indexes,
          builtin: true,
          protected: true,
          coreFieldNames: builtIn.coreFieldNames,
        });
        continue;
      }
      this.syncBuiltinCollection(namespaceId, current, builtIn);
    }
  }

  private syncBuiltinCollection(
    namespaceId: string,
    current: CollectionDefinition,
    builtIn: {
      name: string;
      displayName: string;
      coreFieldNames: string[];
      fields: FieldDefinition[];
      indexes: IndexDefinition[];
    },
  ): void {
    const mergedFields = validateFields(mergeBuiltinFields(current.fields, builtIn.fields));
    const mergedIndexes = mergeBuiltinIndexes(current.indexes, builtIn.indexes).map(normalizeIndex);
    const mergedCoreFieldNames = [...new Set([...current.coreFieldNames, ...builtIn.coreFieldNames])];

    const needsUpdate =
      current.displayName !== builtIn.displayName ||
      !current.builtin ||
      !current.protected ||
      mergedFields.length !== current.fields.length ||
      mergedIndexes.length !== current.indexes.length ||
      mergedCoreFieldNames.length !== current.coreFieldNames.length;

    if (!needsUpdate) return;

    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE collections
      SET display_name = ?, fields_json = ?, indexes_json = ?, builtin = 1, protected = 1, core_fields_json = ?, updated_at = ?
      WHERE namespace_id = ? AND name = ?
    `).run(
      builtIn.displayName,
      JSON.stringify(mergedFields),
      JSON.stringify(mergedIndexes),
      JSON.stringify(mergedCoreFieldNames),
      now,
      namespaceId,
      builtIn.name,
    );
  }

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email, password_hash
      FROM admins
      WHERE email = ?
    `).get(email) as { id: string; email: string; password_hash: string } | undefined;
    if (!row) return null;
    return row.password_hash === hashSecret(password) ? { id: row.id, email: row.email } : null;
  }

  findAdminByEmail(email: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email
      FROM admins
      WHERE email = ?
    `).get(email) as { id: string; email: string } | undefined;
    return row ? { id: row.id, email: row.email } : null;
  }

  createAdmin(input: { email: string; password: string }): { id: string; email: string } {
    const id = `admin-${randomUUID().slice(0, 8)}`;
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, input.email, hashSecret(input.password), now);
    return { id, email: input.email };
  }

  listNamespaces(): NamespaceRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, display_name, created_at, updated_at
      FROM namespaces
      ORDER BY id ASC
    `).all() as Array<{ id: string; display_name: string; created_at: string; updated_at: string }>).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getNamespace(namespaceId: string): NamespaceRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, display_name, created_at, updated_at
      FROM namespaces
      WHERE id = ?
    `).get(namespaceId) as { id: string; display_name: string; created_at: string; updated_at: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  ensureNamespace(input: { id: string; displayName?: string }): NamespaceRecord {
    return this.getNamespace(input.id) ?? this.createNamespace({
      id: input.id,
      displayName: input.displayName ?? input.id,
    });
  }

  createNamespace(input: { id?: string; displayName: string }): NamespaceRecord {
    const id = input.id ? slugify(input.id) : slugify(input.displayName);
    assertNamespaceId(id);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO namespaces (id, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, input.displayName.trim() || id, now, now);
    for (const builtIn of builtInCollections()) {
      this.createCollection(id, {
        name: builtIn.name,
        displayName: builtIn.displayName,
        fields: builtIn.fields,
        indexes: builtIn.indexes,
        builtin: true,
        protected: true,
        coreFieldNames: builtIn.coreFieldNames,
      });
    }
    return this.getNamespace(id)!;
  }

  private readCollectionRow(namespaceId: string, name: string): CollectionRow | undefined {
    return this.sqlite.prepare(`
      SELECT namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      FROM collections
      WHERE namespace_id = ? AND name = ?
    `).get(namespaceId, name) as CollectionRow | undefined;
  }

  getCollection(namespaceId: string, name: string): CollectionDefinition | null {
    const row = this.readCollectionRow(namespaceId, name);
    return row ? serializeCollection(row) : null;
  }

  ensureCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
    builtin?: boolean;
    protected?: boolean;
    coreFieldNames?: string[];
  }): CollectionDefinition {
    return this.getCollection(namespaceId, input.name) ?? this.createCollection(namespaceId, input);
  }

  listCollections(namespaceId: string): CollectionDefinition[] {
    return (this.sqlite.prepare(`
      SELECT namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      FROM collections
      WHERE namespace_id = ?
      ORDER BY builtin DESC, name ASC
    `).all(namespaceId) as CollectionRow[]).map(serializeCollection);
  }

  createCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
    builtin?: boolean;
    protected?: boolean;
    coreFieldNames?: string[];
  }): CollectionDefinition {
    if (!this.getNamespace(namespaceId)) {
      throw new Error(`Namespace ${namespaceId} does not exist.`);
    }
    assertCollectionName(input.name);
    const fields = validateFields(input.fields);
    const indexes = (input.indexes ?? []).map(normalizeIndex);
    const coreFieldNames = [...new Set((input.coreFieldNames ?? []).map((entry) => entry.trim()).filter(Boolean))];
    for (const fieldName of coreFieldNames) {
      if (!SYSTEM_FIELDS.includes(fieldName as typeof SYSTEM_FIELDS[number]) && !fields.some((field) => field.name === fieldName)) {
        throw new Error(`Protected core field ${fieldName} is missing from collection ${input.name}.`);
      }
    }
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO collections (
        namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      namespaceId,
      input.name,
      input.displayName?.trim() || input.name,
      JSON.stringify(fields),
      JSON.stringify(indexes),
      input.builtin ? 1 : 0,
      input.protected ? 1 : 0,
      JSON.stringify(coreFieldNames),
      now,
      now,
    );
    return this.getCollection(namespaceId, input.name)!;
  }

  updateCollection(namespaceId: string, name: string, input: {
    displayName?: string;
    fields?: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): CollectionDefinition {
    const current = this.getCollection(namespaceId, name);
    if (!current) throw new Error(`Collection ${name} does not exist.`);
    const fields = input.fields ? validateFields(input.fields) : current.fields;
    for (const fieldName of current.coreFieldNames) {
      if (!SYSTEM_FIELDS.includes(fieldName as typeof SYSTEM_FIELDS[number]) && !fields.some((field) => field.name === fieldName)) {
        throw new Error(`Protected collection ${name} cannot remove core field ${fieldName}.`);
      }
    }
    const indexes = input.indexes ? input.indexes.map(normalizeIndex) : current.indexes;
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE collections
      SET display_name = ?, fields_json = ?, indexes_json = ?, updated_at = ?
      WHERE namespace_id = ? AND name = ?
    `).run(
      input.displayName?.trim() || current.displayName,
      JSON.stringify(fields),
      JSON.stringify(indexes),
      now,
      namespaceId,
      name,
    );
    return this.getCollection(namespaceId, name)!;
  }

  deleteCollection(namespaceId: string, name: string): boolean {
    const current = this.getCollection(namespaceId, name);
    if (!current) return false;
    if (current.protected) {
      throw new Error(`Collection ${name} is protected and cannot be deleted.`);
    }
    return this.sqlite.prepare(`
      DELETE FROM collections
      WHERE namespace_id = ? AND name = ?
    `).run(namespaceId, name).changes > 0;
  }

  private validateRecordPayload(collection: CollectionDefinition, payload: Record<string, unknown>, mode: "create" | "update"): Record<string, unknown> {
    const allowed = new Set(collection.fields.map((field) => field.name));
    for (const key of Object.keys(payload)) {
      if (SYSTEM_FIELDS.includes(key as typeof SYSTEM_FIELDS[number])) {
        throw new Error(`System field ${key} cannot be mutated.`);
      }
      if (!allowed.has(key)) {
        throw new Error(`Unknown field ${key} for collection ${collection.name}.`);
      }
    }
    for (const field of collection.fields) {
      const value = payload[field.name];
      if (mode === "create" || value !== undefined) {
        validateFieldValue(field, value);
      }
    }
    const builtinDef = BUILTIN_COLLECTIONS_BY_NAME.get(collection.name);
    const effectiveCollection: CollectionDefinition = builtinDef?.rules
      ? { ...collection, rules: builtinDef.rules as CollectionRule[] }
      : collection;
    validateRecordRules(effectiveCollection, payload);
    return payload;
  }

  listRecords(namespaceId: string, collectionName: string, options: {
    filter?: Record<string, unknown>;
    sort?: string;
    limit?: number;
    offset?: number;
  } = {}): { total: number; items: RecordEnvelope[] } {
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    let items = (this.sqlite.prepare(`
      SELECT id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ?
    `).all(namespaceId, collectionName) as RecordRow[]).map(serializeRecord);

    if (options.filter && isPlainObject(options.filter)) {
      items = items.filter((item) => Object.entries(options.filter ?? {}).every(([key, value]) => item[key] === value));
    }

    if (options.sort) {
      const desc = options.sort.startsWith("-");
      const key = desc ? options.sort.slice(1) : options.sort;
      items.sort((left, right) => {
        const a = left[key];
        const b = right[key];
        if (a === b) return 0;
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        return `${a}`.localeCompare(`${b}`) * (desc ? -1 : 1);
      });
    } else {
      items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    const total = items.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    items = items.slice(offset, offset + limit);
    return { total, items };
  }

  getRecord(namespaceId: string, collectionName: string, id: string): RecordEnvelope | null {
    const row = this.sqlite.prepare(`
      SELECT id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).get(namespaceId, collectionName, id) as RecordRow | undefined;
    return row ? serializeRecord(row) : null;
  }

  createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): RecordEnvelope {
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const normalized = this.validateRecordPayload(collection, payload, "create");
    const id = randomUUID();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(namespaceId, collectionName, id, JSON.stringify(normalized), now, now);
    return this.getRecord(namespaceId, collectionName, id)!;
  }

  putRecord(input: {
    namespaceId: string;
    collectionName: string;
    recordId: string;
    payload: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }): RecordEnvelope {
    const collection = this.getCollection(input.namespaceId, input.collectionName);
    if (!collection) throw new Error(`Collection ${input.collectionName} does not exist.`);
    const normalized = this.validateRecordPayload(collection, input.payload, "update");
    const createdAt = input.createdAt ?? nowIso();
    const updatedAt = input.updatedAt ?? createdAt;
    this.sqlite.prepare(`
      INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(namespace_id, collection_name, id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).run(
      input.namespaceId,
      input.collectionName,
      input.recordId,
      JSON.stringify(normalized),
      createdAt,
      updatedAt,
    );
    return this.getRecord(input.namespaceId, input.collectionName, input.recordId)!;
  }

  updateRecord(namespaceId: string, collectionName: string, id: string, payload: Record<string, unknown>): RecordEnvelope {
    const current = this.getRecord(namespaceId, collectionName, id);
    if (!current) throw new Error(`Record ${id} does not exist.`);
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const merged = {
      ...Object.fromEntries(Object.entries(current).filter(([key]) => !SYSTEM_FIELDS.includes(key as typeof SYSTEM_FIELDS[number]))),
      ...payload,
    };
    const normalized = this.validateRecordPayload(collection, merged, "update");
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE records
      SET data_json = ?, updated_at = ?
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).run(JSON.stringify(normalized), now, namespaceId, collectionName, id);
    return this.getRecord(namespaceId, collectionName, id)!;
  }

  deleteRecord(namespaceId: string, collectionName: string, id: string): boolean {
    return this.sqlite.prepare(`
      DELETE FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).run(namespaceId, collectionName, id).changes > 0;
  }

  getMeta(key: string): string | null {
    const row = this.sqlite.prepare(`
      SELECT meta_value
      FROM service_meta
      WHERE meta_key = ?
    `).get(key) as { meta_value: string } | undefined;
    return row?.meta_value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.sqlite.prepare(`
      INSERT INTO service_meta (meta_key, meta_value)
      VALUES (?, ?)
      ON CONFLICT(meta_key) DO UPDATE SET meta_value = excluded.meta_value
    `).run(key, value);
  }

  createScopedToken(input: {
    label: string;
    namespaceId: string;
    collectionName?: string | null;
    operations: DatabaseOperation[];
  }): { record: ScopedTokenRecord; token: string } {
    if (!this.getNamespace(input.namespaceId)) {
      throw new Error(`Namespace ${input.namespaceId} does not exist.`);
    }
    if (input.collectionName && !this.getCollection(input.namespaceId, input.collectionName)) {
      throw new Error(`Collection ${input.collectionName} does not exist.`);
    }
    const operations = [...new Set(input.operations)];
    if (operations.length === 0) {
      throw new Error("Scoped tokens require at least one operation.");
    }
    for (const operation of operations) {
      if (!VALID_OPERATIONS.has(operation)) {
        throw new Error(`Unknown operation ${operation}.`);
      }
    }
    const id = randomUUID();
    const token = generateOpaqueToken("dbtk");
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO scoped_tokens (
        id, label, token_hash, namespace_id, collection_name, operations_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.label.trim() || "token",
      hashSecret(token),
      input.namespaceId,
      input.collectionName ?? null,
      JSON.stringify(operations),
      now,
    );
    return {
      record: this.getScopedToken(id)!,
      token,
    };
  }

  listScopedTokens(namespaceId: string): ScopedTokenRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE namespace_id = ?
      ORDER BY created_at DESC
    `).all(namespaceId) as TokenRow[]).map(serializeToken);
  }

  getScopedToken(id: string): ScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE id = ?
    `).get(id) as TokenRow | undefined;
    return row ? serializeToken(row) : null;
  }

  revokeScopedToken(namespaceId: string, tokenId: string): boolean {
    return this.sqlite.prepare(`
      UPDATE scoped_tokens
      SET revoked_at = ?
      WHERE namespace_id = ? AND id = ? AND revoked_at IS NULL
    `).run(nowIso(), namespaceId, tokenId).changes > 0;
  }

  authenticateScopedToken(rawToken: string): ScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE token_hash = ?
    `).get(hashSecret(rawToken)) as TokenRow | undefined;
    if (!row || row.revoked_at) return null;
    this.sqlite.prepare(`
      UPDATE scoped_tokens
      SET last_used_at = ?
      WHERE id = ?
    `).run(nowIso(), row.id);
    return serializeToken({
      ...row,
      last_used_at: nowIso(),
    });
  }

  saveFile(input: {
    namespaceId: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
    collectionName?: string | null;
    recordId?: string | null;
  }): FileAsset {
    if (!this.getNamespace(input.namespaceId)) {
      throw new Error(`Namespace ${input.namespaceId} does not exist.`);
    }
    if (input.collectionName && !this.getCollection(input.namespaceId, input.collectionName)) {
      throw new Error(`Collection ${input.collectionName} does not exist.`);
    }
    if (input.collectionName && input.recordId && !this.getRecord(input.namespaceId, input.collectionName, input.recordId)) {
      throw new Error(`Record ${input.recordId} does not exist.`);
    }
    const id = randomUUID();
    const storedFileName = `${id}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const relativePath = path.join(input.namespaceId, storedFileName);
    const absolutePath = path.join(this.filesDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, input.bytes);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO files (
        id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.namespaceId,
      input.collectionName ?? null,
      input.recordId ?? null,
      input.filename,
      input.contentType || "application/octet-stream",
      input.bytes.byteLength,
      relativePath,
      now,
    );
    return this.getFile(id)!;
  }

  listFiles(namespaceId: string): FileAsset[] {
    return (this.sqlite.prepare(`
      SELECT id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      FROM files
      WHERE namespace_id = ?
      ORDER BY created_at DESC
    `).all(namespaceId) as FileRow[]).map(serializeFile);
  }

  getFile(id: string): (FileAsset & { storagePath: string }) | null {
    const row = this.sqlite.prepare(`
      SELECT id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      FROM files
      WHERE id = ?
    `).get(id) as FileRow | undefined;
    if (!row) return null;
    return {
      ...serializeFile(row),
      storagePath: path.join(this.filesDir, row.storage_path),
    };
  }

  deleteFile(id: string): boolean {
    const file = this.getFile(id);
    if (!file) return false;
    if (fs.existsSync(file.storagePath)) {
      fs.unlinkSync(file.storagePath);
    }
    return this.sqlite.prepare(`
      DELETE FROM files
      WHERE id = ?
    `).run(id).changes > 0;
  }
}
