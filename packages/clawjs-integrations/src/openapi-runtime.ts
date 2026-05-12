import { normalizeConnectorCatalog } from "./catalog.ts";
import type {
  ConnectorRuntimeAuthPlacement,
  ConnectorRuntimeFixture,
  ConnectorRuntimeImplementation,
  ConnectorRuntimeRequestPlan,
  ConnectorRuntimeOutputSchema,
} from "./runtime-registry.ts";
import type {
  ConnectorCatalog,
  ConnectorFieldDefinition,
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

type OpenApiHttpMethod = "get" | "post" | "put" | "patch" | "delete";
type OpenApiParameterLocation = "path" | "query" | "header";

interface OpenApiDocument {
  info?: {
    title?: unknown;
    description?: unknown;
    version?: unknown;
  };
  servers?: Array<{ url?: unknown }>;
  paths?: Record<string, OpenApiPathItem | undefined>;
}

type OpenApiPathItem = Partial<Record<OpenApiHttpMethod, OpenApiOperation>> & {
  parameters?: OpenApiParameter[];
};

interface OpenApiOperation {
  operationId?: unknown;
  summary?: unknown;
  description?: unknown;
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse | undefined>;
}

interface OpenApiParameter {
  name?: unknown;
  in?: unknown;
  required?: unknown;
  description?: unknown;
  schema?: OpenApiSchema;
}

interface OpenApiRequestBody {
  required?: unknown;
  content?: Record<string, { schema?: OpenApiSchema } | undefined>;
}

interface OpenApiResponse {
  content?: Record<string, { schema?: OpenApiSchema } | undefined>;
}

interface OpenApiSchema {
  type?: unknown;
  format?: unknown;
  description?: unknown;
  default?: unknown;
  enum?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  required?: unknown;
  properties?: Record<string, OpenApiSchema | undefined>;
  items?: OpenApiSchema;
}

interface OpenApiConnectorOperationMetadata {
  id: string;
  method: string;
  path: string;
  parameters: OpenApiConnectorParameterBinding[];
  bodyFields: OpenApiConnectorBodyBinding[];
  responseSchema: ConnectorRuntimeOutputSchema;
}

interface OpenApiConnectorParameterBinding {
  fieldName: string;
  sourceName: string;
  location: OpenApiParameterLocation;
}

interface OpenApiConnectorBodyBinding {
  fieldName: string;
  sourceName: string;
}

export interface OpenApiConnectorRuntimeOptions {
  appId: string;
  appName?: string;
  description?: string;
  authFieldName?: string;
  authPlacement?: ConnectorRuntimeAuthPlacement;
  authHeaderName?: string;
  authPrefix?: string;
  baseUrl?: string;
  executorId?: string;
  evidence: string[];
  fixtures: ConnectorRuntimeFixture[];
  offlineValidated?: boolean;
}

const HTTP_METHODS: readonly OpenApiHttpMethod[] = ["get", "post", "put", "patch", "delete"];

export function buildOpenApiConnectorCatalog(
  document: unknown,
  options: OpenApiConnectorRuntimeOptions,
): ConnectorCatalog {
  const openapi = asOpenApiDocument(document);
  const operations = collectOpenApiOperations(openapi, options);
  const fields = options.authFieldName
    ? [{ name: options.authFieldName, type: "string", optional: false, secret: true }]
    : [];
  return normalizeConnectorCatalog({
    version: 1,
    apps: [{
      id: options.appId,
      name: options.appName ?? stringValue(openapi.info?.title) ?? options.appId,
      ...optionalString("description", options.description ?? stringValue(openapi.info?.description)),
      ...optionalString("packageVersion", stringValue(openapi.info?.version)),
      authFieldNames: options.authFieldName ? [options.authFieldName] : [],
      fields,
      operations: operations.map((operation) => operation.definition),
    }],
  });
}

export function createOpenApiConnectorRuntimeImplementation(
  document: unknown,
  options: OpenApiConnectorRuntimeOptions,
): ConnectorRuntimeImplementation {
  const openapi = asOpenApiDocument(document);
  const operations = collectOpenApiOperations(openapi, options);
  const metadataById = new Map(operations.map((operation) => [operation.definition.id, operation.metadata]));
  return {
    appId: options.appId,
    kind: "action",
    executorId: options.executorId ?? `${options.appId}.openapi.http`,
    baseUrl: options.baseUrl ?? firstServerUrl(openapi) ?? "https://api.example.invalid/",
    offlineValidated: options.offlineValidated ?? true,
    evidence: options.evidence,
    fixtures: options.fixtures,
    planKinds: ["request"],
    supports: (operation) => operation.appId === options.appId && metadataById.has(operation.id),
    buildPlan: (operation, values) => {
      const metadata = metadataById.get(operation.id);
      if (!metadata) {
        throw new Error(`OpenAPI runtime does not support operation: ${operation.id}`);
      }
      return {
        requestPlan: buildOpenApiRequestPlan(metadata, values, options),
      };
    },
  };
}

function buildOpenApiRequestPlan(
  metadata: OpenApiConnectorOperationMetadata,
  values: Record<string, IntegrationJson>,
  options: OpenApiConnectorRuntimeOptions,
): ConnectorRuntimeRequestPlan {
  const headers: Record<string, string> = { accept: "application/json" };
  const query: Record<string, IntegrationJson> = {};
  const body: Record<string, IntegrationJson> = {};
  let endpoint = metadata.path;
  for (const parameter of metadata.parameters) {
    const value = values[parameter.fieldName];
    if (value == null || value === "") continue;
    if (parameter.location === "path") {
      endpoint = replaceOpenApiPathParameter(endpoint, parameter.sourceName, value);
    } else if (parameter.location === "query") query[parameter.sourceName] = value;
    else if (parameter.location === "header") headers[parameter.sourceName] = String(value);
  }
  for (const field of metadata.bodyFields) {
    const value = values[field.fieldName];
    if (value == null || value === "") continue;
    body[field.sourceName] = value;
  }
  return {
    method: metadata.method,
    endpoint,
    auth: options.authFieldName ? [{
      type: "secret",
      field: options.authFieldName,
      placement: options.authPlacement ?? "bearer",
      ...(options.authHeaderName ? { name: options.authHeaderName } : {}),
      ...(options.authPrefix ? { prefix: options.authPrefix } : {}),
    }] : [],
    headers,
    ...(Object.keys(query).length > 0 ? { query } : {}),
    body,
    responseSchema: metadata.responseSchema,
  };
}

function replaceOpenApiPathParameter(endpoint: string, sourceName: string, value: IntegrationJson): string {
  return endpoint.replaceAll(`{${sourceName}}`, encodeURIComponent(String(value)));
}

function collectOpenApiOperations(
  document: OpenApiDocument,
  options: OpenApiConnectorRuntimeOptions,
): Array<{ definition: ConnectorOperationDefinition; metadata: OpenApiConnectorOperationMetadata }> {
  return Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) => {
    if (!pathItem) return [];
    return HTTP_METHODS.flatMap((method) => {
      const operation = pathItem[method];
      if (!operation) return [];
      const usedFieldNames = new Set<string>();
      const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]
        .map((parameter) => openApiParameterBinding(parameter, usedFieldNames))
        .filter((parameter): parameter is OpenApiConnectorParameterBinding & { field: ConnectorFieldDefinition } => Boolean(parameter));
      const bodyFields = openApiBodyBindings(operation.requestBody, usedFieldNames);
      const id = `${options.appId}.action.${operationSlug(method, path, stringValue(operation.operationId))}`;
      const metadata: OpenApiConnectorOperationMetadata = {
        id,
        method: method.toUpperCase(),
        path,
        parameters: parameters.map(({ field: _field, ...parameter }) => parameter),
        bodyFields: bodyFields.map(({ field: _field, ...field }) => field),
        responseSchema: responseSchemaForOperation(operation),
      };
      return [{
        metadata,
        definition: {
          id,
          appId: options.appId,
          kind: "action",
          key: operationSlug(method, path, stringValue(operation.operationId)),
          name: stringValue(operation.summary) ?? titleize(stringValue(operation.operationId) ?? `${method} ${path}`),
          ...optionalString("description", stringValue(operation.description)),
          fields: [
            ...parameters.map((parameter) => parameter.field),
            ...bodyFields.map((field) => field.field),
          ],
          authFieldNames: options.authFieldName ? [options.authFieldName] : [],
          runtime: {
            hasRun: true,
            hasHooks: false,
            hasAdditionalProps: false,
            hasMethods: true,
            methodNames: ["request"],
          },
        },
      }];
    });
  });
}

function openApiParameterBinding(
  parameter: OpenApiParameter,
  usedFieldNames: Set<string>,
): (OpenApiConnectorParameterBinding & { field: ConnectorFieldDefinition }) | null {
  const sourceName = stringValue(parameter.name);
  const location = parameterLocation(parameter.in);
  if (!sourceName || !location) return null;
  const fieldName = uniqueFieldName(sourceName, location, usedFieldNames);
  return {
    fieldName,
    sourceName,
    location,
    field: {
      ...fieldFromSchema(fieldName, parameter.schema),
      ...optionalString("description", stringValue(parameter.description)),
      optional: location === "path" ? false : parameter.required !== true,
    },
  };
}

function openApiBodyBindings(
  requestBody: OpenApiRequestBody | undefined,
  usedFieldNames: Set<string>,
): Array<OpenApiConnectorBodyBinding & { field: ConnectorFieldDefinition }> {
  const schema = jsonContentSchema(requestBody?.content);
  if (!schema) return [];
  const properties = schema.properties ?? {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  return Object.entries(properties).flatMap(([sourceName, propertySchema]) => {
    if (!propertySchema) return [];
    const fieldName = uniqueFieldName(sourceName, "body", usedFieldNames);
    return [{
      fieldName,
      sourceName,
      field: {
        ...fieldFromSchema(fieldName, propertySchema),
        optional: !required.has(sourceName),
      },
    }];
  });
}

function fieldFromSchema(name: string, schema: OpenApiSchema | undefined): Omit<ConnectorFieldDefinition, "optional"> {
  return {
    name,
    type: connectorFieldType(schema),
    ...optionalString("description", stringValue(schema?.description)),
    ...optionalJson("default", integrationJsonValue(schema?.default)),
    ...enumOptions(schema?.enum),
    ...optionalNumber("min", numberValue(schema?.minimum)),
    ...optionalNumber("max", numberValue(schema?.maximum)),
  };
}

function responseSchemaForOperation(operation: OpenApiOperation): ConnectorRuntimeOutputSchema {
  const response = Object.entries(operation.responses ?? {})
    .find(([status]) => status.startsWith("2"))?.[1];
  const schema = jsonContentSchema(response?.content);
  return {
    type: connectorRuntimeType(schema),
    requiredPaths: requiredPathsForSchema(schema),
  };
}

function requiredPathsForSchema(schema: OpenApiSchema | undefined): string[] {
  if (!schema || !Array.isArray(schema.required)) return [];
  return schema.required.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function connectorRuntimeType(schema: OpenApiSchema | undefined): ConnectorRuntimeOutputSchema["type"] {
  const type = stringValue(schema?.type);
  if (type === "array" || type === "string" || type === "number" || type === "boolean" || type === "null") return type;
  return "object";
}

function connectorFieldType(schema: OpenApiSchema | undefined): string {
  const type = stringValue(schema?.type);
  if (type === "integer" || type === "number" || type === "boolean" || type === "array" || type === "object") return type;
  return "string";
}

function jsonContentSchema(content: OpenApiRequestBody["content"] | undefined): OpenApiSchema | undefined {
  return content?.["application/json"]?.schema ?? content?.["application/x-www-form-urlencoded"]?.schema;
}

function parameterLocation(value: unknown): OpenApiParameterLocation | null {
  return value === "path" || value === "query" || value === "header" ? value : null;
}

function uniqueFieldName(
  sourceName: string,
  location: string,
  usedFieldNames: Set<string>,
): string {
  const base = fieldName(sourceName);
  const candidate = usedFieldNames.has(base) ? fieldName(`${location}_${sourceName}`) : base;
  let name = candidate;
  let index = 2;
  while (usedFieldNames.has(name)) {
    name = `${candidate}_${index}`;
    index += 1;
  }
  usedFieldNames.add(name);
  return name;
}

function fieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "value";
}

function operationSlug(method: string, path: string, operationId: string | undefined): string {
  const source = operationId ?? `${method}-${path}`;
  const slug = source
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || method;
}

function titleize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function firstServerUrl(document: OpenApiDocument): string | undefined {
  return document.servers?.map((server) => stringValue(server.url)).find((url): url is string => Boolean(url));
}

function enumOptions(value: unknown): Pick<ConnectorFieldDefinition, "options"> | Record<string, never> {
  if (!Array.isArray(value)) return {};
  const options = value
    .map((entry) => integrationJsonValue(entry))
    .filter((entry): entry is string | number | boolean => (
      typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
    ))
    .map((entry) => ({ value: entry }));
  return options.length > 0 ? { options } : {};
}

function optionalString(key: string, value: string | undefined): Record<string, string> {
  return value ? { [key]: value } : {};
}

function optionalNumber(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

function optionalJson(key: string, value: IntegrationJson | undefined): Record<string, IntegrationJson> {
  return value === undefined ? {} : { [key]: value };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function integrationJsonValue(value: unknown): IntegrationJson | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.map(integrationJsonValue);
    return items.every((item) => item !== undefined) ? items as IntegrationJson[] : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, integrationJsonValue(entry)] as const);
    if (entries.every(([, entry]) => entry !== undefined)) {
      return Object.fromEntries(entries) as Record<string, IntegrationJson>;
    }
  }
  return undefined;
}

function asOpenApiDocument(document: unknown): OpenApiDocument {
  if (!document || typeof document !== "object") {
    throw new Error("OpenAPI connector runtime requires a document object.");
  }
  return document as OpenApiDocument;
}
