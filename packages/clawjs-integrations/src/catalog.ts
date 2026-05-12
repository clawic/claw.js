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
  if (input.version !== 1) {
    throw new ConnectorCatalogError(`Unsupported catalog version: ${String(input.version ?? "<missing>")}`);
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
      if (app.packageVersion) summary.versionedApps += 1;
      summary.fields += app.fields.length;
      summary.authFields += app.authFieldNames.length;
      summary.managedFields += app.fields.filter((field) => field.managed).length;
      summary.defaults += app.fields.filter((field) => Object.prototype.hasOwnProperty.call(field, "default")).length;
      summary.options += app.fields.filter((field) => field.options?.length).length;
      summary.hiddenFields += app.fields.filter((field) => field.hidden === true).length;
      summary.disabledFields += app.fields.filter((field) => field.disabled === true).length;
      summary.reloadFields += app.fields.filter((field) => field.reloadProps === true).length;
      summary.boundedFields += app.fields.filter((field) => field.min !== undefined || field.max !== undefined).length;
      summary.placeholderFields += app.fields.filter((field) => field.placeholder).length;
      summary.queryFields += app.fields.filter((field) => field.useQuery === true).length;
      summary.labelFields += app.fields.filter((field) => field.withLabel === true).length;
      summary.alertFields += app.fields.filter(isAlertField).length;
      summary.readAccessFields += app.fields.filter((field) => field.accessMode === "read").length;
      summary.writeAccessFields += app.fields.filter((field) => field.accessMode === "write").length;
      summary.syncedFields += app.fields.filter((field) => field.sync === true).length;
      summary.customResponseFields += app.fields.filter((field) => field.customResponse === true).length;
      summary.propDefinitionFields += app.fields.filter((field) => field.propDefinition).length;
      summary.contextualPropFields += app.fields.filter((field) => field.propDefinition?.contextKeys.length).length;
      summary.dynamicOptionFields += app.fields.filter((field) => field.dynamicOptions).length;
      for (const operation of app.operations) {
        if (operation.kind === "action") summary.actions += 1;
        else summary.sources += 1;
        summary.fields += operation.fields.length;
        summary.authFields += operation.authFieldNames.length;
        summary.managedFields += operation.fields.filter((field) => field.managed).length;
        summary.defaults += operation.fields.filter((field) => Object.prototype.hasOwnProperty.call(field, "default")).length;
        summary.options += operation.fields.filter((field) => field.options?.length).length;
        summary.hiddenFields += operation.fields.filter((field) => field.hidden === true).length;
        summary.disabledFields += operation.fields.filter((field) => field.disabled === true).length;
        summary.reloadFields += operation.fields.filter((field) => field.reloadProps === true).length;
        summary.boundedFields += operation.fields.filter((field) => field.min !== undefined || field.max !== undefined).length;
        summary.placeholderFields += operation.fields.filter((field) => field.placeholder).length;
        summary.queryFields += operation.fields.filter((field) => field.useQuery === true).length;
        summary.labelFields += operation.fields.filter((field) => field.withLabel === true).length;
        summary.alertFields += operation.fields.filter(isAlertField).length;
        summary.readAccessFields += operation.fields.filter((field) => field.accessMode === "read").length;
        summary.writeAccessFields += operation.fields.filter((field) => field.accessMode === "write").length;
        summary.syncedFields += operation.fields.filter((field) => field.sync === true).length;
        summary.customResponseFields += operation.fields.filter((field) => field.customResponse === true).length;
        summary.propDefinitionFields += operation.fields.filter((field) => field.propDefinition).length;
        summary.contextualPropFields += operation.fields.filter((field) => field.propDefinition?.contextKeys.length).length;
        summary.dynamicOptionFields += operation.fields.filter((field) => field.dynamicOptions).length;
        if (operation.annotations) summary.annotatedOperations += 1;
        if (operation.annotations?.destructiveHint === true) summary.destructiveOperations += 1;
        if (operation.annotations?.readOnlyHint === true) summary.readOnlyOperations += 1;
        if (operation.annotations?.openWorldHint === true) summary.openWorldOperations += 1;
        if (operation.runtime?.hasRun === true) summary.runnableOperations += 1;
        if (operation.kind === "source" && operation.runtime?.hasHooks === true) summary.hookSources += 1;
        if (operation.kind === "source" && operation.runtime?.dedupe) summary.dedupedSources += 1;
        if (operation.source?.delivery === "polling") summary.pollingSources += 1;
        if (operation.source?.delivery === "webhook") summary.webhookSources += 1;
        if (operation.source?.delivery === "hybrid") summary.hybridSources += 1;
        if (operation.source?.usesServiceDb === true) summary.statefulSources += 1;
        if (operation.kind === "source" && operation.sampleEvent) summary.sampleEventSources += 1;
        if (operation.kind === "source" && operation.eventSummary) {
          summary.eventSummarySources += 1;
          summary.eventSummaryTemplates += operation.eventSummary.templates.length;
        }
        if (operation.runtime?.hasAdditionalProps === true) summary.dynamicPropOperations += 1;
        summary.dynamicPropFields += operation.runtime?.additionalProps?.fieldNames.length ?? 0;
        if (operation.runtime?.hasMethods === true) summary.methodOperations += 1;
      }
      return summary;
    },
    {
      apps: 0,
      versionedApps: 0,
      actions: 0,
      sources: 0,
      fields: 0,
      authFields: 0,
      managedFields: 0,
      defaults: 0,
      options: 0,
      hiddenFields: 0,
      disabledFields: 0,
      reloadFields: 0,
      boundedFields: 0,
      placeholderFields: 0,
      queryFields: 0,
      labelFields: 0,
      alertFields: 0,
      readAccessFields: 0,
      writeAccessFields: 0,
      syncedFields: 0,
      customResponseFields: 0,
      propDefinitionFields: 0,
      contextualPropFields: 0,
      annotatedOperations: 0,
      destructiveOperations: 0,
      readOnlyOperations: 0,
      openWorldOperations: 0,
      runnableOperations: 0,
      hookSources: 0,
      dedupedSources: 0,
      pollingSources: 0,
      webhookSources: 0,
      hybridSources: 0,
      statefulSources: 0,
      sampleEventSources: 0,
      eventSummarySources: 0,
      eventSummaryTemplates: 0,
      dynamicPropOperations: 0,
      dynamicPropFields: 0,
      dynamicOptionFields: 0,
      methodOperations: 0,
    },
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
    ...(typeof input.packageVersion === "string" ? { packageVersion: input.packageVersion } : {}),
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
  if (input.kind !== "action" && input.kind !== "source") {
    throw new ConnectorCatalogError(`Unsupported operation kind for ${id}: ${String(input.kind ?? "<missing>")}`);
  }
  return {
    id,
    appId: stringValue(input.appId) ?? appId,
    kind: input.kind,
    ...(typeof input.key === "string" ? { key: input.key } : {}),
    name: stringValue(input.name) ?? id,
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.version === "string" ? { version: input.version } : {}),
    fields: normalizeFields(input.fields),
    authFieldNames: normalizeStringArray(input.authFieldNames),
    ...optionalAnnotations(input.annotations),
    ...optionalRuntime(input.runtime),
    ...optionalSource(input.source),
    ...optionalSampleEvent(input.sampleEvent),
    ...optionalEventSummary(input.eventSummary),
    ...optionalUnsupportedRealRuntimeReason(input.unsupported_real_runtime_reason),
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
    const type = stringValue(field.type) ?? "string";
    const accessMode: ConnectorFieldDefinition["accessMode"] =
      field.accessMode === "read" || field.accessMode === "write" ? field.accessMode : undefined;
    return {
      name,
      type,
      ...(typeof field.label === "string" ? { label: field.label } : {}),
      ...(typeof field.description === "string" ? { description: field.description } : {}),
      ...(typeof field.alertType === "string" && field.alertType.trim() ? { alertType: field.alertType.trim() } : {}),
      ...(typeof field.content === "string" && field.content.trim() ? { content: field.content.trim() } : {}),
      optional: field.optional === true,
      ...(isJson(field.default) ? { default: field.default } : {}),
      ...(Array.isArray(field.options) ? { options: field.options.filter(isRecord).map((option) => ({
        ...(typeof option.label === "string" ? { label: option.label } : {}),
        value: option.value as string | number | boolean,
        ...(typeof option.description === "string" ? { description: option.description } : {}),
      })).filter((option) => isOptionValue(option.value)) } : {}),
      ...optionalPropDefinition(field.propDefinition),
      ...optionalDynamicOptions(field.dynamicOptions),
      ...(field.hidden === true ? { hidden: true } : {}),
      ...(field.disabled === true ? { disabled: true } : {}),
      ...(field.reloadProps === true ? { reloadProps: true } : {}),
      ...(typeof field.min === "number" && Number.isFinite(field.min) ? { min: field.min } : {}),
      ...(typeof field.max === "number" && Number.isFinite(field.max) ? { max: field.max } : {}),
      ...(typeof field.placeholder === "string" && field.placeholder.trim() ? { placeholder: field.placeholder.trim() } : {}),
      ...(field.useQuery === true ? { useQuery: true } : {}),
      ...(field.withLabel === true ? { withLabel: true } : {}),
      ...(accessMode ? { accessMode } : {}),
      ...(field.sync === true ? { sync: true } : {}),
      ...(field.customResponse === true ? { customResponse: true } : {}),
      ...(field.secret === true ? { secret: true } : {}),
      ...(field.managed === true || type.startsWith("$.") ? { managed: true } : {}),
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function isAlertField(field: ConnectorFieldDefinition): boolean {
  return field.type === "alert" || Boolean(field.alertType) || Boolean(field.content);
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

function optionalAnnotations(input: unknown) {
  if (!isRecord(input)) return {};
  const annotations = {
    ...(typeof input.destructiveHint === "boolean" ? { destructiveHint: input.destructiveHint } : {}),
    ...(typeof input.readOnlyHint === "boolean" ? { readOnlyHint: input.readOnlyHint } : {}),
    ...(typeof input.openWorldHint === "boolean" ? { openWorldHint: input.openWorldHint } : {}),
  };
  return Object.keys(annotations).length ? { annotations } : {};
}

function optionalDynamicOptions(input: unknown) {
  if (!isRecord(input)) return {};
  return {
    dynamicOptions: {
      paginated: input.paginated === true,
      usesPreviousContext: input.usesPreviousContext === true,
      contextKeys: normalizeStringArray(input.contextKeys),
    },
  };
}

function optionalPropDefinition(input: unknown) {
  if (!isRecord(input)) return {};
  const fieldName = stringValue(input.fieldName);
  if (!fieldName) return {};
  return {
    propDefinition: {
      fieldName,
      contextKeys: normalizeStringArray(input.contextKeys),
      dependsOn: normalizeStringArray(input.dependsOn),
    },
  };
}

function optionalAdditionalProps(input: unknown) {
  if (!isRecord(input)) return {};
  const mode: "object" | "function" = input.mode === "object" ? "object" : "function";
  return {
    additionalProps: {
      mode,
      fieldNames: normalizeStringArray(input.fieldNames),
      contextKeys: normalizeStringArray(input.contextKeys),
      usesPreviousProps: input.usesPreviousProps === true,
      usesThis: input.usesThis === true,
    },
  };
}

function optionalRuntime(input: unknown) {
  if (!isRecord(input)) return {};
  return {
    runtime: {
      hasRun: input.hasRun === true,
      hasHooks: input.hasHooks === true,
      hookNames: normalizeStringArray(input.hookNames),
      hasAdditionalProps: input.hasAdditionalProps === true,
      ...optionalAdditionalProps(input.additionalProps),
      hasMethods: input.hasMethods === true,
      methodNames: normalizeStringArray(input.methodNames),
      ...(typeof input.dedupe === "string" && input.dedupe.trim() ? { dedupe: input.dedupe.trim() } : {}),
    },
  };
}

function optionalSource(input: unknown) {
  if (!isRecord(input)) return {};
  const delivery = ["polling", "webhook", "hybrid", "manual"].includes(String(input.delivery))
    ? input.delivery as "polling" | "webhook" | "hybrid" | "manual"
    : "manual";
  return {
    source: {
      delivery,
      usesTimer: input.usesTimer === true,
      usesHttp: input.usesHttp === true,
      usesServiceDb: input.usesServiceDb === true,
    },
  };
}

function optionalSampleEvent(input: unknown) {
  if (!isRecord(input)) return {};
  const shape = ["object", "array", "string", "unknown"].includes(String(input.shape))
    ? input.shape as "object" | "array" | "string" | "unknown"
    : "unknown";
  return {
    sampleEvent: {
      shape,
      keys: normalizeStringArray(input.keys),
    },
  };
}

function optionalEventSummary(input: unknown) {
  if (!isRecord(input)) return {};
  const count = typeof input.count === "number" && Number.isFinite(input.count) && input.count > 0
    ? Math.floor(input.count)
    : 0;
  if (!count) return {};
  return {
    eventSummary: {
      count,
      templates: normalizeStringArray(input.templates),
      dynamic: input.dynamic === true,
    },
  };
}

function optionalUnsupportedRealRuntimeReason(input: unknown) {
  if (!isRecord(input)) return {};
  const code = stringValue(input.code);
  const message = stringValue(input.message);
  if (!code || !message) return {};
  return {
    unsupported_real_runtime_reason: {
      code,
      message,
      evidence: normalizeStringArray(input.evidence),
    },
  };
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
