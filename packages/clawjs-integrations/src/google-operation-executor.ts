import { GOOGLE_CALENDAR_ACTION_SPECS } from "./google-calendar-actions.ts";
import { GOOGLE_DRIVE_ACTION_SPECS } from "./google-drive-actions.ts";
import { GOOGLE_GMAIL_ACTION_SPECS } from "./google-gmail-actions.ts";
import type {
  GoogleOperationSpec,
} from "./google-operation-core.ts";
import { GOOGLE_PRODUCTIVITY_ACTION_SPECS } from "./google-productivity-actions.ts";
import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const GOOGLE_ACTION_SPECS = [
  ...GOOGLE_DRIVE_ACTION_SPECS,
  ...GOOGLE_GMAIL_ACTION_SPECS,
  ...GOOGLE_CALENDAR_ACTION_SPECS,
  ...GOOGLE_PRODUCTIVITY_ACTION_SPECS,
] as const satisfies readonly GoogleOperationSpec[];

export const GOOGLE_ACTION_SLUGS = GOOGLE_ACTION_SPECS.map((spec) => spec.slug);
export type GoogleRuntimeOperation = typeof GOOGLE_ACTION_SLUGS[number];

const GOOGLE_SPEC_BY_SLUG = new Map(GOOGLE_ACTION_SPECS.map((spec) => [spec.slug, spec]));

export function isGoogleActionOperationSupported(operationId: string): boolean {
  return googleOperationSpec(operationId) !== null;
}

export function buildGoogleOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const spec = googleOperationSpec(operation.id);
  if (!spec) throw new Error(`Unsupported Google operation: ${operation.id}`);
  return {
    method: spec.method,
    endpoint: interpolateEndpoint(spec.endpoint, values),
    auth: operation.authFieldNames.map((field) => ({ type: "secret" as const, field, placement: "bearer" as const })),
    headers: { accept: spec.responseType === "string" ? "text/plain" : "application/json" },
    query: valuesForKeys(values, spec.query ?? []),
    body: valuesForKeys(values, spec.body ?? []),
    responseSchema: {
      type: spec.responseType ?? "object",
      ...(spec.requiredPaths ? { requiredPaths: spec.requiredPaths } : {}),
    },
    ...(spec.pagination ? { pagination: spec.pagination } : {}),
  };
}

function googleOperationSpec(operationId: string): GoogleOperationSpec | null {
  const slug = operationId.split(".").at(-1);
  return slug ? GOOGLE_SPEC_BY_SLUG.get(slug) ?? null : null;
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
  throw new Error(`Google operation requires ${field}`);
}
