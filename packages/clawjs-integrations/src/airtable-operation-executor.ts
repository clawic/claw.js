import {
  AIRTABLE_METADATA_ACTION_SPECS,
} from "./airtable-metadata-actions.ts";
import type {
  AirtableOperationSpec,
} from "./airtable-operation-core.ts";
import {
  AIRTABLE_RECORD_ACTION_SPECS,
} from "./airtable-record-actions.ts";
import {
  AIRTABLE_WEBHOOK_ACTION_SPECS,
} from "./airtable-webhook-actions.ts";
import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const AIRTABLE_ACTION_SPECS = [
  ...AIRTABLE_RECORD_ACTION_SPECS,
  ...AIRTABLE_METADATA_ACTION_SPECS,
  ...AIRTABLE_WEBHOOK_ACTION_SPECS,
] as const satisfies readonly AirtableOperationSpec[];

export const AIRTABLE_ACTION_SLUGS = AIRTABLE_ACTION_SPECS.map((spec) => spec.slug);
export type AirtableRuntimeOperation = typeof AIRTABLE_ACTION_SLUGS[number];

const AIRTABLE_SPEC_BY_SLUG = new Map(AIRTABLE_ACTION_SPECS.map((spec) => [spec.slug, spec]));

export function isAirtableActionOperationSupported(operationId: string): boolean {
  return airtableOperationSpec(operationId) !== null;
}

export function buildAirtableOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const spec = airtableOperationSpec(operation.id);
  if (!spec) throw new Error(`Unsupported Airtable operation: ${operation.id}`);
  return {
    method: spec.method,
    endpoint: interpolateEndpoint(spec.endpoint, values),
    auth: operation.authFieldNames.map((field) => ({ type: "secret" as const, field, placement: "bearer" as const })),
    headers: { accept: "application/json" },
    query: valuesForKeys(values, spec.query ?? []),
    ...(spec.querySerialization ? { querySerialization: spec.querySerialization } : {}),
    body: valuesForKeys(values, spec.body ?? []),
    responseSchema: {
      type: spec.responseType ?? "object",
      ...(spec.requiredPaths ? { requiredPaths: spec.requiredPaths } : {}),
    },
    ...(spec.pagination ? { pagination: spec.pagination } : {}),
  };
}

function airtableOperationSpec(operationId: string): AirtableOperationSpec | null {
  const slug = operationId.split(".").at(-1);
  return slug ? AIRTABLE_SPEC_BY_SLUG.get(slug) ?? null : null;
}

function interpolateEndpoint(endpoint: string, values: Record<string, IntegrationJson>): string {
  return endpoint.replaceAll(/\{([^}]+)\}/g, (_, key: string) => encodeURIComponent(requiredString(values[key], key)));
}

function valuesForKeys(values: Record<string, IntegrationJson>, keys: readonly string[]): Record<string, IntegrationJson> {
  return Object.fromEntries(keys.flatMap((key) => {
    const value = values[key];
    return value === undefined || value === null || value === "" ? [] : [[key, value]];
  }));
}

function requiredString(value: IntegrationJson | undefined, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`Airtable operation requires ${field}`);
}
