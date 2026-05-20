import { createHash } from "node:crypto";

import type {
  RegistryCategory,
  RegistryCategoryProjection,
  RegistryProjection,
  RegistryProjectionEntry,
  RegistryStatus,
} from "./types.ts";
import { REGISTRY_CATEGORIES, REGISTRY_STATUSES } from "./types.ts";

interface RawRegistry {
  schemaVersion?: number;
  generatedAt?: string;
  categories?: unknown[];
  entries?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

export function normalizeRegistryStatus(value: unknown): RegistryStatus {
  if (value === "dev-only") return "dev_only";
  if (typeof value === "string" && (REGISTRY_STATUSES as readonly string[]).includes(value)) {
    return value as RegistryStatus;
  }
  return "dev_only";
}

function normalizeCategory(value: unknown): RegistryCategory {
  if (typeof value === "string" && (REGISTRY_CATEGORIES as readonly string[]).includes(value)) {
    return value as RegistryCategory;
  }
  return "meta-reflection";
}

function checksum(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function buildSignalsRegistryProjection(input: {
  registry: RawRegistry;
  servicePort: number;
}): RegistryProjection {
  const categories: RegistryCategoryProjection[] = (input.registry.categories ?? [])
    .filter(isRecord)
    .map((category) => ({
      id: normalizeCategory(category.id),
      label: stringValue(category.label, stringValue(category.id)),
    }));
  const entries: RegistryProjectionEntry[] = (input.registry.entries ?? [])
    .filter(isRecord)
    .map((entry) => ({
      id: stringValue(entry.id),
      label: stringValue(entry.label, stringValue(entry.id)),
      category: normalizeCategory(entry.category),
      description: stringValue(entry.description),
      catalogSize: numberValue(entry.catalogSize),
      hasSessions: booleanValue(entry.hasSessions),
      healthkitMapping: booleanValue(entry.healthkitMapping),
      sensitive: booleanValue(entry.sensitive),
      status: normalizeRegistryStatus(entry.status),
      ...(typeof entry.iconHint === "string" && entry.iconHint.length > 0 ? { iconHint: entry.iconHint } : {}),
    }))
    .filter((entry) => entry.id.length > 0);

  return {
    schemaVersion: 1,
    projectionVersion: "signals-registry.v1",
    source: {
      type: "clawjs.tracking-registry",
      path: "tracking-registry.json",
      schemaVersion: numberValue(input.registry.schemaVersion, 1),
      ...(typeof input.registry.generatedAt === "string" ? { generatedAt: input.registry.generatedAt } : {}),
      checksum: checksum(input.registry),
    },
    service: {
      id: "signals",
      port: input.servicePort,
      basePath: "/v1/signals",
      verticalRouteTemplate: "/v1/signals/{verticalId}",
    },
    categories,
    entries,
  };
}
