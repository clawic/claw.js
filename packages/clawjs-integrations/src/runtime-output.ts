import type { ConnectorRuntimeOutputSchema } from "./runtime-registry.ts";
import type { IntegrationJson } from "./types.ts";

export function validateConnectorRuntimeOutput(
  output: IntegrationJson,
  schema: ConnectorRuntimeOutputSchema,
): string[] {
  const errors: string[] = [];
  if (jsonType(output) !== schema.type) {
    errors.push(`output type ${jsonType(output)} expected ${schema.type}`);
  }
  for (const path of schema.requiredPaths ?? []) {
    if (valueAtPath(output, path) === undefined) {
      errors.push(`output missing required path ${path}`);
    }
  }
  return errors;
}

function jsonType(value: IntegrationJson): ConnectorRuntimeOutputSchema["type"] {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  return "object";
}

function valueAtPath(value: IntegrationJson, path: string): IntegrationJson | undefined {
  let current: IntegrationJson | undefined = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}
