export interface MCPToolArgumentValidationResult {
  ok: boolean;
  errors: string[];
}

type JsonSchema = Record<string, unknown>;

export function validateMCPToolArguments(inputSchema: Record<string, unknown> | null, args: unknown): MCPToolArgumentValidationResult {
  if (!inputSchema) return { ok: true, errors: [] };
  const errors: string[] = [];
  validateSchema(inputSchema, args, "arguments", errors);
  return { ok: errors.length === 0, errors };
}

function validateSchema(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  if (schema.not && typeof schema.not === "object" && !Array.isArray(schema.not) && matchesSchema(schema.not as JsonSchema, value)) {
    errors.push(`${path} matches disallowed schema`);
    return;
  }

  const expectedType = schema.type;
  if (typeof expectedType === "string" && !matchesType(expectedType, value)) {
    errors.push(`${path} must be ${expectedType}`);
    return;
  }

  const enumValues = schema.enum;
  if (Array.isArray(enumValues) && !enumValues.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path} must be one of: ${enumValues.map(String).join(", ")}`);
  }

  if ((schema.type === "object" || schema.properties || schema.required || schema.additionalProperties === false) && isPlainObject(value)) {
    validateObjectSchema(schema, value, path, errors);
  }

  if ((schema.type === "array" || schema.items) && Array.isArray(value)) {
    validateArraySchema(schema, value, path, errors);
  }

  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) {
    errors.push(`${path} must be >= ${schema.minimum}`);
  }

  if (typeof value === "string" && typeof schema.pattern === "string") {
    try {
      if (!new RegExp(schema.pattern).test(value)) errors.push(`${path} must match pattern ${schema.pattern}`);
    } catch {
      errors.push(`${path} has invalid schema pattern`);
    }
  }
}

function validateArraySchema(schema: JsonSchema, value: unknown[], path: string, errors: string[]): void {
  const itemsSchema = schema.items;
  if (!itemsSchema || typeof itemsSchema !== "object" || Array.isArray(itemsSchema)) return;
  value.forEach((item, index) => {
    validateSchema(itemsSchema as JsonSchema, item, `${path}[${index}]`, errors);
  });
}

function validateObjectSchema(schema: JsonSchema, value: Record<string, unknown>, path: string, errors: string[]): void {
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.filter((entry): entry is string => typeof entry === "string") : [];

  for (const propertyName of required) {
    if (!(propertyName in value)) errors.push(`${path} missing required property: ${propertyName}`);
  }

  for (const [propertyName, propertyValue] of Object.entries(value)) {
    const propertySchema = properties[propertyName];
    if (!propertySchema || typeof propertySchema !== "object" || Array.isArray(propertySchema)) {
      if (schema.additionalProperties === false) errors.push(`${path} unexpected property: ${propertyName}`);
      continue;
    }
    validateSchema(propertySchema as JsonSchema, propertyValue, `${path}.${propertyName}`, errors);
  }
}

function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    return anyOf.some((candidate) => isPlainObject(candidate) && matchesSchema(candidate, value));
  }
  const errors: string[] = [];
  validateSchema(schema, value, "value", errors);
  return errors.length === 0;
}

function matchesType(type: string, value: unknown): boolean {
  if (type === "object") return isPlainObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
