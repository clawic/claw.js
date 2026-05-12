import {
  findConnectorOperation,
  type ConnectorCatalogError,
} from "./catalog.ts";
import type {
  ConnectorCatalog,
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  ConnectorOperationInput,
  IntegrationJson,
} from "./types.js";

export type ConnectorSecretResolver = (secretRef: string) => Promise<string | null> | string | null;

export interface ConnectorExecutionContext {
  operation: ConnectorOperationDefinition;
  values: Record<string, IntegrationJson>;
  secrets: Record<string, string>;
}

export interface ConnectorExecutor {
  execute(ctx: ConnectorExecutionContext): Promise<Record<string, IntegrationJson>>;
}

export interface RunConnectorOperationOptions {
  catalog: ConnectorCatalog;
  operationId: string;
  input?: ConnectorOperationInput;
  dryRun?: boolean;
  resolveSecret?: ConnectorSecretResolver;
  executor?: ConnectorExecutor;
}

export interface ConnectorOperationDryRun {
  status: "dry_run";
  operationId: string;
  appId: string;
  kind: "action" | "source";
  missingFields: string[];
  missingSecrets: string[];
  invalidFields: string[];
  values: Record<string, IntegrationJson>;
  secretRefs: Record<string, string>;
}

export interface ConnectorOperationRunResult {
  status: "executed";
  operationId: string;
  appId: string;
  output: Record<string, IntegrationJson>;
}

export async function runConnectorOperation(
  options: RunConnectorOperationOptions,
): Promise<ConnectorOperationDryRun | ConnectorOperationRunResult> {
  const found = findConnectorOperation(options.catalog, options.operationId);
  if (!found) {
    throw new Error(`Unknown connector operation: ${options.operationId}`);
  }

  const input = options.input ?? {};
  const values = buildValues(found.operation.fields, input.values ?? {});
  const secretRefs = input.secretRefs ?? {};
  const missingFields = requiredFieldNames(found.operation.fields)
    .filter((fieldName) => values[fieldName] == null || values[fieldName] === "");
  const missingSecrets = found.operation.authFieldNames
    .filter((fieldName) => !secretRefs[fieldName]);
  const invalidFields = invalidFieldNames(found.operation.fields, values, input.values ?? {});

  if (options.dryRun !== false) {
    return {
      status: "dry_run",
      operationId: found.operation.id,
      appId: found.app.id,
      kind: found.operation.kind,
      missingFields,
      missingSecrets,
      invalidFields,
      values: redactSecretValues(found.operation.fields, values),
      secretRefs,
    };
  }

  if (missingFields.length > 0 || missingSecrets.length > 0 || invalidFields.length > 0) {
    throw new Error(`Connector operation is missing or invalid input: ${[...missingFields, ...missingSecrets, ...invalidFields].join(", ")}`);
  }
  if (!options.executor) {
    throw new Error("Connector operation execution requires an explicit executor.");
  }

  const secrets: Record<string, string> = {};
  for (const fieldName of found.operation.authFieldNames) {
    const ref = secretRefs[fieldName];
    if (!ref) continue;
    const value = await options.resolveSecret?.(ref);
    if (!value) {
      throw new Error(`Unable to resolve secret: ${fieldName}`);
    }
    secrets[fieldName] = value;
  }

  const output = await options.executor.execute({
    operation: found.operation,
    values,
    secrets,
  });
  return {
    status: "executed",
    operationId: found.operation.id,
    appId: found.app.id,
    output,
  };
}

function buildValues(
  fields: ConnectorFieldDefinition[],
  input: Record<string, IntegrationJson>,
): Record<string, IntegrationJson> {
  const values: Record<string, IntegrationJson> = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field.name)) {
      values[field.name] = input[field.name] ?? null;
    } else if (Object.prototype.hasOwnProperty.call(field, "default")) {
      values[field.name] = field.default ?? null;
    }
  }
  return values;
}

function requiredFieldNames(fields: ConnectorFieldDefinition[]): string[] {
  return fields.filter((field) => !field.optional && !field.secret && !field.managed).map((field) => field.name);
}

function invalidFieldNames(
  fields: ConnectorFieldDefinition[],
  values: Record<string, IntegrationJson>,
  input: Record<string, IntegrationJson>,
): string[] {
  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(input, field.name))
    .filter((field) => Object.prototype.hasOwnProperty.call(values, field.name))
    .filter((field) => !isValidFieldValue(field, values[field.name]))
    .map((field) => field.name);
}

function isValidFieldValue(field: ConnectorFieldDefinition, value: IntegrationJson): boolean {
  if (value == null || value === "") return true;
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

function redactSecretValues(
  fields: ConnectorFieldDefinition[],
  values: Record<string, IntegrationJson>,
): Record<string, IntegrationJson> {
  const secretFields = new Set(fields.filter((field) => field.secret).map((field) => field.name));
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, secretFields.has(key) ? "[secret]" : value]),
  );
}

export type { ConnectorCatalogError };
