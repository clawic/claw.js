import fs from "node:fs";

import type {
  ConnectorAppDefinition,
  ConnectorCatalog,
  ConnectorCatalogSummary,
  ConnectorComponentKind,
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.js";

export interface ConnectorCatalogSearchOptions {
  query?: string;
  kind?: ConnectorComponentKind;
  appId?: string;
  limit?: number;
}

export interface ConnectorCatalogSearchResult {
  app: ConnectorAppDefinition;
  operation: ConnectorOperationDefinition;
}

export class ConnectorCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorCatalogError";
  }
}

export function loadConnectorCatalogFromFile(filePath: string): ConnectorCatalog {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return normalizeConnectorCatalog(parsed);
}

export function normalizeConnectorCatalog(input: unknown): ConnectorCatalog {
  if (!isRecord(input)) {
    throw new ConnectorCatalogError("Catalog must be an object.");
  }
  const rawApps = Array.isArray(input.apps) ? input.apps : [];
  const apps = rawApps.map(normalizeApp).sort((left, right) => left.name.localeCompare(right.name));
  const appIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const app of apps) {
    if (appIds.has(app.id)) {
      throw new ConnectorCatalogError(`Duplicate app id: ${app.id}`);
    }
    appIds.add(app.id);
    for (const operation of app.operations) {
      if (operation.appId !== app.id) {
        throw new ConnectorCatalogError(`Operation ${operation.id} points at ${operation.appId}, expected ${app.id}`);
      }
      if (operationIds.has(operation.id)) {
        throw new ConnectorCatalogError(`Duplicate operation id: ${operation.id}`);
      }
      operationIds.add(operation.id);
    }
  }
  return {
    version: 1,
    ...(typeof input.generatedAt === "string" ? { generatedAt: input.generatedAt } : {}),
    ...(typeof input.sourceRevision === "string" ? { sourceRevision: input.sourceRevision } : {}),
    apps,
  };
}

export function summarizeConnectorCatalog(catalog: ConnectorCatalog): ConnectorCatalogSummary {
  return catalog.apps.reduce<ConnectorCatalogSummary>(
    (summary, app) => {
      summary.apps += 1;
      summary.fields += app.fields.length;
      summary.authFields += app.authFieldNames.length;
      for (const operation of app.operations) {
        if (operation.kind === "action") summary.actions += 1;
        else summary.sources += 1;
        summary.fields += operation.fields.length;
        summary.authFields += operation.authFieldNames.length;
      }
      return summary;
    },
    { apps: 0, actions: 0, sources: 0, fields: 0, authFields: 0 },
  );
}

export function findConnectorApp(catalog: ConnectorCatalog, appId: string): ConnectorAppDefinition | null {
  return catalog.apps.find((app) => app.id === appId) ?? null;
}

export function findConnectorOperation(catalog: ConnectorCatalog, operationId: string): ConnectorCatalogSearchResult | null {
  for (const app of catalog.apps) {
    const operation = app.operations.find((candidate) => candidate.id === operationId);
    if (operation) return { app, operation };
  }
  return null;
}

export function searchConnectorCatalog(
  catalog: ConnectorCatalog,
  options: ConnectorCatalogSearchOptions = {},
): ConnectorCatalogSearchResult[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const limit = Math.max(0, options.limit ?? Number.POSITIVE_INFINITY);
  const results: ConnectorCatalogSearchResult[] = [];
  for (const app of catalog.apps) {
    if (options.appId && app.id !== options.appId) continue;
    for (const operation of app.operations) {
      if (options.kind && operation.kind !== options.kind) continue;
      if (query && !matchesQuery(app, operation, query)) continue;
      results.push({ app, operation });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function normalizeApp(input: unknown): ConnectorAppDefinition {
  if (!isRecord(input)) {
    throw new ConnectorCatalogError("App entry must be an object.");
  }
  const id = requiredString(input.id, "app.id");
  const fields = normalizeFields(input.fields);
  return {
    id,
    name: stringValue(input.name) ?? id,
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.authType === "string" ? { authType: input.authType } : {}),
    authFieldNames: normalizeStringArray(input.authFieldNames),
    fields,
    operations: (Array.isArray(input.operations) ? input.operations : [])
      .map((operation) => normalizeOperation(operation, id))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function normalizeOperation(input: unknown, appId: string): ConnectorOperationDefinition {
  if (!isRecord(input)) {
    throw new ConnectorCatalogError(`Operation for ${appId} must be an object.`);
  }
  const id = requiredString(input.id, "operation.id");
  const kind = input.kind === "source" ? "source" : "action";
  return {
    id,
    appId: stringValue(input.appId) ?? appId,
    kind,
    ...(typeof input.key === "string" ? { key: input.key } : {}),
    name: stringValue(input.name) ?? id,
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.version === "string" ? { version: input.version } : {}),
    fields: normalizeFields(input.fields),
    authFieldNames: normalizeStringArray(input.authFieldNames),
    ...(typeof input.sourcePath === "string" ? { sourcePath: input.sourcePath } : {}),
  };
}

function normalizeFields(input: unknown): ConnectorFieldDefinition[] {
  if (!Array.isArray(input)) return [];
  return input.map((field) => {
    if (!isRecord(field)) {
      throw new ConnectorCatalogError("Field entry must be an object.");
    }
    const name = requiredString(field.name, "field.name");
    return {
      name,
      type: stringValue(field.type) ?? "string",
      ...(typeof field.label === "string" ? { label: field.label } : {}),
      ...(typeof field.description === "string" ? { description: field.description } : {}),
      optional: field.optional === true,
      ...(isJson(field.default) ? { default: field.default } : {}),
      ...(Array.isArray(field.options) ? { options: field.options.filter(isRecord).map((option) => ({
        ...(typeof option.label === "string" ? { label: option.label } : {}),
        value: option.value as string | number | boolean,
        ...(typeof option.description === "string" ? { description: option.description } : {}),
      })).filter((option) => isOptionValue(option.value)) } : {}),
      ...(field.secret === true ? { secret: true } : {}),
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function matchesQuery(
  app: ConnectorAppDefinition,
  operation: ConnectorOperationDefinition,
  query: string,
): boolean {
  return [
    app.id,
    app.name,
    app.description,
    operation.id,
    operation.name,
    operation.description,
    operation.key,
  ].some((value) => value?.toLowerCase().includes(query));
}

function normalizeStringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((entry): entry is string => typeof entry === "string").sort()
    : [];
}

function stringValue(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function requiredString(input: unknown, name: string): string {
  const value = stringValue(input);
  if (!value) throw new ConnectorCatalogError(`Missing required ${name}.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionValue(value: unknown): value is string | number | boolean {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isJson(value: unknown): value is IntegrationJson {
  if (value === undefined) return false;
  if (value === null) return true;
  if (["boolean", "number", "string"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJson);
  if (isRecord(value)) return Object.values(value).every(isJson);
  return false;
}
