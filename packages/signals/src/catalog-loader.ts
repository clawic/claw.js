import fs from "node:fs";

import { VALUE_TYPES, type CatalogEntry, type ValueType } from "@clawjs/signals-core";

export interface CatalogJsonEntry {
  id: string;
  label: string;
  unit: { id: string; label: string; group?: string };
  valueType: ValueType;
  validRange?: { min?: number; max?: number };
  enumValues?: string[];
  category?: string;
  healthkitTypeId?: string;
  description?: string;
}

export interface CatalogJson {
  domain: string;
  version: string;
  entries: CatalogJsonEntry[];
}

export function loadCatalogJson(path: string): CatalogJson {
  const raw = fs.readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as CatalogJson;
  if (!parsed.domain || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid catalog.json at ${path}`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeValidRange(value: unknown): CatalogEntry["validRange"] {
  if (!isRecord(value)) return undefined;
  const min = finiteNumber(value.min);
  const max = finiteNumber(value.max);
  return min === undefined && max === undefined ? undefined : { min, max };
}

function normalizeEnumValues(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length > 0 ? values : undefined;
}

function catalogEntryFromJson(
  domain: string,
  entry: unknown,
  now: number,
): CatalogEntry | null {
  if (!isRecord(entry)) return null;
  const id = nonEmptyString(entry.id);
  const label = nonEmptyString(entry.label);
  const unit = isRecord(entry.unit) ? entry.unit : null;
  const unitId = unit ? nonEmptyString(unit.id) : null;
  const unitLabel = unit ? nonEmptyString(unit.label) : null;
  const valueType =
    typeof entry.valueType === "string" && (VALUE_TYPES as readonly string[]).includes(entry.valueType)
      ? (entry.valueType as ValueType)
      : null;
  if (!id || !label || !unitId || !unitLabel || !valueType) return null;

  return {
    id,
    domain,
    label,
    unit: {
      id: unitId,
      label: unitLabel,
      ...(typeof unit?.group === "string" && unit.group.length > 0 ? { group: unit.group } : {}),
    },
    valueType,
    validRange: normalizeValidRange(entry.validRange),
    enumValues: normalizeEnumValues(entry.enumValues),
    category: nonEmptyString(entry.category) ?? undefined,
    healthkitTypeId: nonEmptyString(entry.healthkitTypeId) ?? undefined,
    description: nonEmptyString(entry.description) ?? undefined,
    origin: "system",
    hidden: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function catalogJsonToEntries(json: CatalogJson): CatalogEntry[] {
  const now = Date.now();
  const domain = nonEmptyString(json.domain);
  if (!domain || !Array.isArray(json.entries)) return [];
  return json.entries
    .map((entry) => catalogEntryFromJson(domain, entry, now))
    .filter((entry): entry is CatalogEntry => entry !== null);
}
