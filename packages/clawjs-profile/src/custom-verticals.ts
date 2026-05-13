// Custom data-driven verticals.
//
// The Profile owner can declare their own vertical by writing a tiny JSON
// schema: a list of fields, their types, optional validators, and per-level
// audience defaults. The Profile daemon validates incoming content for that
// vertical against the schema and renders a generic form.
//
// This is the escape hatch for use cases the built-in core verticals
// (post / item / meetup / want / ...) and the plugin verticals
// (real-estate / vehicle / dating) don't cover. Examples a user might author:
//   - `marketplace-book-club/v1` (book swap with reading-progress overlay)
//   - `marketplace-language-exchange/v1`
//   - `marketplace-tools-lending/v1`

import type { CborValue } from "@clawjs/marketplace/cbor";

import type { Block, AudienceLevel, BlockArchetype } from "./types.ts";

// ---- schema types ----

export type CustomFieldType =
  | "string"
  | "text"           // long text / markdown
  | "number"
  | "integer"
  | "boolean"
  | "datetime"       // ISO-8601 string
  | "geo_zone"       // 4-char geohash
  | "enum"
  | "tags"
  | "photo_blobs";

export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  /** For `enum`: list of accepted values. */
  options?: string[];
  /** For `number`/`integer`: optional range. */
  min?: number;
  max?: number;
  /** For `string`/`text`: optional max length (defaults: 256/8192). */
  maxLength?: number;
  /** Audience levels that may see this field. Defaults to ['public']. */
  visibility?: AudienceLevel[];
  /** Whether this field participates in the discoveryKey. */
  match?: boolean;
}

export interface CustomVerticalSchema {
  id: string;                   // `<slug>/v1`
  label: string;
  archetype: BlockArchetype;
  fields: CustomField[];
}

// ---- validation ----

const SLUG_RE = /^[a-z][a-z0-9-]{0,40}\/v\d+$/;
const FIELD_ID_RE = /^[a-z][a-z0-9_]{0,40}$/;

export function validateSchema(schema: CustomVerticalSchema): void {
  if (!SLUG_RE.test(schema.id)) {
    throw new Error(`custom-verticals: bad id "${schema.id}" (must match <slug>/v<int>)`);
  }
  if (!schema.label) throw new Error("custom-verticals: label required");
  if (schema.archetype !== "tracked" && schema.archetype !== "standalone") {
    throw new Error(`custom-verticals: archetype must be 'tracked' or 'standalone'`);
  }
  const seen = new Set<string>();
  for (const f of schema.fields) {
    if (!FIELD_ID_RE.test(f.id)) throw new Error(`custom-verticals: bad field id "${f.id}"`);
    if (seen.has(f.id)) throw new Error(`custom-verticals: duplicate field "${f.id}"`);
    seen.add(f.id);
    if (f.type === "enum" && (!f.options || f.options.length === 0)) {
      throw new Error(`custom-verticals: enum field "${f.id}" requires options`);
    }
  }
}

export function parseSchema(json: string): CustomVerticalSchema {
  const schema = JSON.parse(json) as CustomVerticalSchema;
  validateSchema(schema);
  return schema;
}

export function serializeSchema(schema: CustomVerticalSchema): string {
  validateSchema(schema);
  return JSON.stringify(schema);
}

// ---- content validation ----

export interface ValidationError { field: string; reason: string }

export function validateContent(
  schema: CustomVerticalSchema,
  content: Record<string, CborValue>,
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const f of schema.fields) {
    const value = content[f.id];
    if (value === undefined || value === null) {
      if (f.required) errors.push({ field: f.id, reason: "required" });
      continue;
    }
    switch (f.type) {
      case "string":
      case "text": {
        if (typeof value !== "string") { errors.push({ field: f.id, reason: "expected string" }); break; }
        const max = f.maxLength ?? (f.type === "text" ? 8192 : 256);
        if (value.length > max) errors.push({ field: f.id, reason: `> ${max} chars` });
        break;
      }
      case "number":
      case "integer": {
        if (typeof value !== "number") { errors.push({ field: f.id, reason: "expected number" }); break; }
        if (f.type === "integer" && !Number.isInteger(value)) errors.push({ field: f.id, reason: "not integer" });
        if (f.min !== undefined && value < f.min) errors.push({ field: f.id, reason: `< ${f.min}` });
        if (f.max !== undefined && value > f.max) errors.push({ field: f.id, reason: `> ${f.max}` });
        break;
      }
      case "boolean":
        if (typeof value !== "boolean") errors.push({ field: f.id, reason: "expected boolean" });
        break;
      case "datetime":
        if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
          errors.push({ field: f.id, reason: "expected ISO-8601 datetime" });
        }
        break;
      case "geo_zone":
        if (typeof value !== "string" || value.length !== 4) {
          errors.push({ field: f.id, reason: "expected 4-char geohash" });
        }
        break;
      case "enum":
        if (typeof value !== "string" || !f.options!.includes(value)) {
          errors.push({ field: f.id, reason: `not in [${(f.options ?? []).join("|")}]` });
        }
        break;
      case "tags":
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
          errors.push({ field: f.id, reason: "expected string[]" });
        }
        break;
      case "photo_blobs":
        if (!Array.isArray(value)) errors.push({ field: f.id, reason: "expected blob[]" });
        break;
    }
  }
  return errors;
}

/** Convert the schema's per-field visibility hints into Block.fieldsPerLevel. */
export function fieldsPerLevelFromSchema(schema: CustomVerticalSchema): Block["fieldsPerLevel"] {
  const out: Block["fieldsPerLevel"] = {};
  for (const f of schema.fields) out[f.id] = f.visibility ?? ["public"];
  return out;
}

/** Compute the list of `match` fields that should feed the discoveryKey. */
export function matchFields(schema: CustomVerticalSchema): string[] {
  return schema.fields.filter((f) => f.match).map((f) => f.id);
}
