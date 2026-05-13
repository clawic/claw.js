import fs from "node:fs";

import type { CatalogEntry, ValueType } from "@clawjs/signals-core";

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

export function catalogJsonToEntries(json: CatalogJson): CatalogEntry[] {
  const now = Date.now();
  return json.entries.map((entry) => ({
    id: entry.id,
    domain: json.domain,
    label: entry.label,
    unit: entry.unit,
    valueType: entry.valueType,
    validRange: entry.validRange,
    enumValues: entry.enumValues,
    category: entry.category,
    healthkitTypeId: entry.healthkitTypeId,
    description: entry.description,
    origin: "system",
    hidden: false,
    createdAt: now,
    updatedAt: now,
  }));
}
