import type {
  ConnectorFieldDefinition,
  IntegrationJson,
} from "./types.ts";

export function buildConnectorValues(
  fields: ConnectorFieldDefinition[],
  input: Record<string, IntegrationJson>,
  options: { includeManaged?: boolean } = {},
): Record<string, IntegrationJson> {
  const values: Record<string, IntegrationJson> = {};
  for (const field of fields) {
    if (field.managed && options.includeManaged !== true) continue;
    if (Object.prototype.hasOwnProperty.call(input, field.name)) {
      values[field.name] = input[field.name] ?? null;
    } else if (Object.prototype.hasOwnProperty.call(field, "default")) {
      values[field.name] = integrationJsonOrNull(field.default);
    }
  }
  return values;
}

export function requiredConnectorFieldNames(fields: ConnectorFieldDefinition[]): string[] {
  return fields.filter((field) => !field.optional && !field.secret && !field.managed).map((field) => field.name);
}

export function invalidConnectorFieldNames(
  fields: ConnectorFieldDefinition[],
  values: Record<string, IntegrationJson>,
  input: Record<string, IntegrationJson>,
): string[] {
  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(input, field.name))
    .filter((field) => Object.prototype.hasOwnProperty.call(values, field.name))
    .filter((field) => !isValidConnectorFieldValue(field, values[field.name]))
    .map((field) => field.name);
}

export function redactConnectorSecretValues(
  fields: ConnectorFieldDefinition[],
  values: Record<string, IntegrationJson>,
): Record<string, IntegrationJson> {
  const secretFields = new Set(fields.filter((field) => field.secret).map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, secretFields.has(key) ? "[secret]" : value]),
  );
}

function isValidConnectorFieldValue(field: ConnectorFieldDefinition, value: IntegrationJson): boolean {
  if (value == null || value === "") return true;
  if (!isValidConnectorFieldType(field.type, value)) return false;
  if (field.options?.length) {
    const allowed = new Set(field.options.map((option) => JSON.stringify(option.value)));
    if (!allowed.has(JSON.stringify(value))) return false;
  }
  if (typeof value === "number") {
    if (typeof field.min === "number" && value < field.min) return false;
    if (typeof field.max === "number" && value > field.max) return false;
  }
  return true;
}

function isValidConnectorFieldType(type: string, value: IntegrationJson): boolean {
  switch (type) {
    case "string":
    case "dir":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return Boolean(value && typeof value === "object" && !Array.isArray(value));
    default:
      return true;
  }
}

function integrationJsonOrNull(value: unknown): IntegrationJson {
  return isIntegrationJson(value) ? value : null;
}

function isIntegrationJson(value: unknown): value is IntegrationJson {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isIntegrationJson);
  if (value && typeof value === "object") {
    return Object.values(value).every(isIntegrationJson);
  }
  return false;
}
