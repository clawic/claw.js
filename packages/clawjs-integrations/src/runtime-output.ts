import type {
  ConnectorRuntimeJsonType,
  ConnectorRuntimeOutputSchema,
  ConnectorRuntimeOutputSchemaVariant,
} from "./runtime-registry.ts";
import type { IntegrationJson } from "./types.ts";

export function validateConnectorRuntimeOutput(
  output: IntegrationJson,
  schema: ConnectorRuntimeOutputSchema,
): string[] {
  const variants = outputSchemaVariants(schema);
  if (variants.length === 0) return ["output schema requires type or oneOf"];
  if (variants.length === 1) return validateOutputVariant(output, variants[0]);
  const errorsByVariant = variants.map((variant) => validateOutputVariant(output, variant));
  if (errorsByVariant.some((errors) => errors.length === 0)) return [];
  return [`output did not match any schema: ${errorsByVariant.map((errors) => errors.join(", ")).join("; ")}`];
}

function outputSchemaVariants(schema: ConnectorRuntimeOutputSchema): ConnectorRuntimeOutputSchemaVariant[] {
  if (schema.oneOf?.length) return schema.oneOf;
  if (!schema.type) return [];
  return [{ type: schema.type, requiredPaths: schema.requiredPaths }];
}

function validateOutputVariant(
  output: IntegrationJson,
  schema: ConnectorRuntimeOutputSchemaVariant,
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

function jsonType(value: IntegrationJson): ConnectorRuntimeJsonType {
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
