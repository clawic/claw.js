import { normalizeConnectorCatalog } from "./catalog.ts";
import type {
  ConnectorRuntimeAuthPlacement,
  ConnectorRuntimeFixture,
  ConnectorRuntimeImplementation,
  ConnectorRuntimePaginationPlan,
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
  components?: {
    pathItems?: Record<string, OpenApiPathItem | undefined>;
    securitySchemes?: Record<string, OpenApiSecurityScheme | undefined>;
  };
  security?: OpenApiSecurityRequirement[];
  servers?: OpenApiServer[];
  paths?: Record<string, OpenApiPathItem | undefined>;
  webhooks?: Record<string, OpenApiPathItem | undefined>;
}

interface OpenApiServer {
  url?: unknown;
  variables?: Record<string, { default?: unknown } | undefined>;
}

type OpenApiSecurityRequirement = Record<string, unknown[]>;

interface OpenApiSecurityScheme {
  $ref?: unknown;
  type?: unknown;
  in?: unknown;
  name?: unknown;
  scheme?: unknown;
  description?: unknown;
}

type OpenApiPathItem = Partial<Record<OpenApiHttpMethod, OpenApiOperation>> & {
  $ref?: unknown;
  parameters?: OpenApiParameter[];
};

interface OpenApiOperation {
  $ref?: unknown;
  operationId?: unknown;
  summary?: unknown;
  description?: unknown;
  security?: OpenApiSecurityRequirement[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  responses?: Record<string, OpenApiResponse | undefined>;
}

interface OpenApiParameter {
  $ref?: unknown;
  name?: unknown;
  in?: unknown;
  required?: unknown;
  description?: unknown;
  schema?: OpenApiSchema;
}

interface OpenApiRequestBody {
  $ref?: unknown;
  required?: unknown;
  content?: Record<string, { schema?: OpenApiSchema } | undefined>;
}

interface OpenApiResponse {
  $ref?: unknown;
  content?: Record<string, { schema?: OpenApiSchema } | undefined>;
}

interface OpenApiSchema {
  $ref?: unknown;
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
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
  bodyEncoding?: "form";
  auth: OpenApiConnectorAuthBinding[];
  pagination?: ConnectorRuntimePaginationPlan;
  responseSchema: ConnectorRuntimeOutputSchema;
}

interface OpenApiConnectorAuthBinding {
  fieldName: string;
  placement: ConnectorRuntimeAuthPlacement;
  name?: string;
  prefix?: string;
  description?: string;
}

interface OpenApiConnectorSourceMetadata {
  id: string;
  eventsPath?: string;
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
  const actions = collectOpenApiOperations(openapi, options);
  const sources = collectOpenApiWebhookSources(openapi, options);
  const fields = authFieldsForOperations(actions);
  return normalizeConnectorCatalog({
    version: 1,
    apps: [{
      id: options.appId,
      name: options.appName ?? stringValue(openapi.info?.title) ?? options.appId,
      ...optionalString("description", options.description ?? stringValue(openapi.info?.description)),
      ...optionalString("packageVersion", stringValue(openapi.info?.version)),
      authFieldNames: fields.map((field) => field.name),
      fields,
      operations: [
        ...actions.map((operation) => operation.definition),
        ...sources.map((source) => source.definition),
      ],
    }],
  });
}

export function createOpenApiConnectorRuntimeImplementations(
  document: unknown,
  options: OpenApiConnectorRuntimeOptions,
): ConnectorRuntimeImplementation[] {
  const openapi = asOpenApiDocument(document);
  const implementations: ConnectorRuntimeImplementation[] = [];
  const actions = collectOpenApiOperations(openapi, options);
  if (actions.length > 0) {
    implementations.push(createOpenApiConnectorRuntimeImplementation(document, options));
  }
  const sources = collectOpenApiWebhookSources(openapi, options);
  if (sources.length > 0) {
    implementations.push(createOpenApiWebhookRuntimeImplementation(options, sources));
  }
  return implementations;
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

function createOpenApiWebhookRuntimeImplementation(
  options: OpenApiConnectorRuntimeOptions,
  sources: Array<{ definition: ConnectorOperationDefinition; metadata: OpenApiConnectorSourceMetadata }>,
): ConnectorRuntimeImplementation {
  const metadataById = new Map(sources.map((source) => [source.definition.id, source.metadata]));
  return {
    appId: options.appId,
    kind: "source",
    executorId: `${options.executorId ?? `${options.appId}.openapi`}.webhook`,
    offlineValidated: options.offlineValidated ?? true,
    evidence: options.evidence,
    fixtures: options.fixtures,
    planKinds: ["source"],
    supports: (operation) => operation.appId === options.appId && metadataById.has(operation.id),
    buildPlan: (operation) => {
      const metadata = metadataById.get(operation.id);
      if (!metadata) {
        throw new Error(`OpenAPI webhook runtime does not support operation: ${operation.id}`);
      }
      return {
        sourcePlan: {
          delivery: "webhook",
          hooks: [],
          ...(metadata.eventsPath ? { eventsPath: metadata.eventsPath } : {}),
        },
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
    auth: metadata.auth.map((binding) => ({
      type: "secret",
      field: binding.fieldName,
      placement: binding.placement,
      ...(binding.name ? { name: binding.name } : {}),
      ...(binding.prefix ? { prefix: binding.prefix } : {}),
    })),
    headers,
    ...(Object.keys(query).length > 0 ? { query } : {}),
    body,
    ...(metadata.bodyEncoding ? { bodyEncoding: metadata.bodyEncoding } : {}),
    ...(metadata.pagination ? { pagination: metadata.pagination } : {}),
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
    const resolvedPathItem = resolveOpenApiPathItem(document, pathItem);
    if (!resolvedPathItem) return [];
    return HTTP_METHODS.flatMap((method) => {
      const operation = resolveOpenApiOperation(document, resolvedPathItem[method]);
      if (!operation) return [];
      const usedFieldNames = new Set<string>();
      const parameters = [...(resolvedPathItem.parameters ?? []), ...(operation.parameters ?? [])]
        .map((parameter) => openApiParameterBinding(document, parameter, usedFieldNames))
        .filter((parameter): parameter is OpenApiConnectorParameterBinding & { field: ConnectorFieldDefinition } => Boolean(parameter));
      const bodyFields = openApiBodyBindings(document, operation.requestBody, usedFieldNames);
      const id = `${options.appId}.action.${operationSlug(method, path, stringValue(operation.operationId))}`;
      const auth = openApiAuthBindings(document, operation, options);
      const metadata: OpenApiConnectorOperationMetadata = {
        id,
        method: method.toUpperCase(),
        path,
        parameters: parameters.map(({ field: _field, ...parameter }) => parameter),
        bodyFields: bodyFields.map(({ field: _field, ...field }) => field),
        ...optionalBodyEncoding(requestBodyEncoding(document, operation.requestBody)),
        auth,
        ...optionalPagination(inferOpenApiPagination(document, method, operation, parameters)),
        responseSchema: responseSchemaForOperation(document, operation),
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
          authFieldNames: auth.map((binding) => binding.fieldName),
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

function collectOpenApiWebhookSources(
  document: OpenApiDocument,
  options: OpenApiConnectorRuntimeOptions,
): Array<{ definition: ConnectorOperationDefinition; metadata: OpenApiConnectorSourceMetadata }> {
  return Object.entries(document.webhooks ?? {}).flatMap(([name, pathItem]) => {
    const resolvedPathItem = resolveOpenApiPathItem(document, pathItem);
    const operation = resolveOpenApiOperation(document, resolvedPathItem?.post ?? resolvedPathItem?.put ?? resolvedPathItem?.patch);
    if (!operation) return [];
    const slug = operationSlug("webhook", name, stringValue(operation.operationId) ?? name);
    const id = `${options.appId}.source.${slug}`;
    const eventsPath = requestBodyEventsPath(document, operation.requestBody);
    return [{
      metadata: {
        id,
        ...(eventsPath ? { eventsPath } : {}),
      },
      definition: {
        id,
        appId: options.appId,
        kind: "source",
        key: slug,
        name: stringValue(operation.summary) ?? titleize(stringValue(operation.operationId) ?? name),
        ...optionalString("description", stringValue(operation.description)),
        fields: [],
        authFieldNames: [],
        runtime: {
          hasRun: true,
          hasHooks: false,
          hookNames: [],
          hasAdditionalProps: false,
          hasMethods: false,
          methodNames: [],
        },
        source: {
          delivery: "webhook",
          usesTimer: false,
          usesHttp: true,
          usesServiceDb: false,
        },
        ...optionalSampleEventMetadata(requestBodySchema(document, operation.requestBody)),
      },
    }];
  });
}

function requestBodyEventsPath(document: OpenApiDocument, requestBody: OpenApiRequestBody | undefined): string | undefined {
  const schema = requestBodySchema(document, requestBody);
  if (!schema) return undefined;
  if (stringValue(schema.type) === "array") return undefined;
  for (const name of ["data", "events", "items", "records"]) {
    if (stringValue(schemaProperty(document, schema, name)?.type) === "array") return name;
  }
  return schemaProperties(document, schema).find(([, property]) => stringValue(property?.type) === "array")?.[0];
}

function requestBodySchema(document: OpenApiDocument, requestBody: OpenApiRequestBody | undefined): OpenApiSchema | undefined {
  return requestBodyContent(document, requestBody)?.schema;
}

function optionalSampleEventMetadata(schema: OpenApiSchema | undefined): Pick<ConnectorOperationDefinition, "sampleEvent"> | Record<string, never> {
  if (!schema) return {};
  return {
    sampleEvent: {
      shape: sampleEventShape(schema),
      keys: Object.keys(schema.properties ?? {}).sort((left, right) => left.localeCompare(right)),
    },
  };
}

function sampleEventShape(schema: OpenApiSchema): "object" | "array" | "string" | "unknown" {
  const type = stringValue(schema.type);
  if (type === "object" || type === "array" || type === "string") return type;
  return "unknown";
}

function authFieldsForOperations(
  operations: Array<{ definition: ConnectorOperationDefinition; metadata: OpenApiConnectorOperationMetadata }>,
): ConnectorFieldDefinition[] {
  const fields = new Map<string, ConnectorFieldDefinition>();
  for (const operation of operations) {
    for (const binding of operation.metadata.auth) {
      fields.set(binding.fieldName, {
        name: binding.fieldName,
        type: "string",
        optional: false,
        secret: true,
        ...optionalString("description", binding.description),
      });
    }
  }
  return [...fields.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function openApiAuthBindings(
  document: OpenApiDocument,
  operation: OpenApiOperation,
  options: OpenApiConnectorRuntimeOptions,
): OpenApiConnectorAuthBinding[] {
  if (options.authFieldName) {
    return [{
      fieldName: options.authFieldName,
      placement: options.authPlacement ?? "bearer",
      ...(options.authHeaderName ? { name: options.authHeaderName } : {}),
      ...(options.authPrefix ? { prefix: options.authPrefix } : {}),
    }];
  }
  const requirements = operation.security ?? document.security ?? [];
  const referenced = requirements.flatMap((requirement) => Object.keys(requirement));
  const schemeNames = referenced.length > 0 ? referenced : Object.keys(document.components?.securitySchemes ?? {});
  return schemeNames.flatMap((schemeName) => {
    const scheme = resolveOpenApiSecurityScheme(document, document.components?.securitySchemes?.[schemeName]);
    if (!scheme) return [];
    const binding = authBindingForSecurityScheme(schemeName, scheme);
    return binding ? [binding] : [];
  });
}

function authBindingForSecurityScheme(
  schemeName: string,
  scheme: OpenApiSecurityScheme,
): OpenApiConnectorAuthBinding | null {
  const type = stringValue(scheme.type);
  if (type === "http" && stringValue(scheme.scheme)?.toLowerCase() === "bearer") {
    return {
      fieldName: fieldName(schemeName),
      placement: "bearer",
      description: stringValue(scheme.description),
    };
  }
  if (type === "http" && stringValue(scheme.scheme)?.toLowerCase() === "basic") {
    return {
      fieldName: fieldName(schemeName),
      placement: "header",
      name: "authorization",
      prefix: "Basic ",
      description: stringValue(scheme.description),
    };
  }
  if (type === "oauth2" || type === "openIdConnect") {
    return {
      fieldName: fieldName(schemeName),
      placement: "bearer",
      description: stringValue(scheme.description),
    };
  }
  if (type === "apiKey") {
    const location = stringValue(scheme.in);
    const name = stringValue(scheme.name);
    if (location === "header" && name) {
      return {
        fieldName: fieldName(schemeName),
        placement: "header",
        name,
        description: stringValue(scheme.description),
      };
    }
    if (location === "query" && name) {
      return {
        fieldName: fieldName(schemeName),
        placement: "query",
        name,
        description: stringValue(scheme.description),
      };
    }
    if (location === "cookie" && name) {
      return {
        fieldName: fieldName(schemeName),
        placement: "cookie",
        name,
        description: stringValue(scheme.description),
      };
    }
  }
  return null;
}

function inferOpenApiPagination(
  document: OpenApiDocument,
  method: OpenApiHttpMethod,
  operation: OpenApiOperation,
  parameters: Array<OpenApiConnectorParameterBinding & { field: ConnectorFieldDefinition }>,
): ConnectorRuntimePaginationPlan | undefined {
  if (method !== "get") return undefined;
  const queryParameters = parameters.filter((parameter) => parameter.location === "query");
  const parameterBySourceName = new Map(queryParameters.map((parameter) => [parameter.sourceName, parameter]));
  const itemsPath = responseItemsPath(document, operation);
  if (!itemsPath) return undefined;

  const limit = firstParameter(parameterBySourceName, ["limit", "page_size", "per_page"]);
  const offset = firstParameter(parameterBySourceName, ["offset", "skip"]);
  if (limit && offset) {
    return {
      mode: "offset",
      itemsPath,
      limitParam: limit.sourceName,
      offsetParam: offset.sourceName,
    };
  }

  const cursor = firstParameter(parameterBySourceName, ["cursor", "starting_after", "page_token"]);
  const nextCursorPath = responseCursorPath(document, operation);
  if (cursor && nextCursorPath) {
    return {
      mode: "cursor",
      itemsPath,
      cursorParam: cursor.sourceName,
      nextCursorPath,
      ...(limit ? { limitParam: limit.sourceName } : {}),
    };
  }

  const nextUrlPath = responseNextUrlPath(document, operation);
  if (nextUrlPath) {
    return {
      mode: "next_url",
      itemsPath,
      nextUrlPath,
    };
  }

  return undefined;
}

function optionalPagination(value: ConnectorRuntimePaginationPlan | undefined): {
  pagination: ConnectorRuntimePaginationPlan;
} | Record<string, never> {
  return value ? { pagination: value } : {};
}

function optionalBodyEncoding(value: "form" | undefined): Pick<OpenApiConnectorOperationMetadata, "bodyEncoding"> | Record<string, never> {
  return value ? { bodyEncoding: value } : {};
}

function responseItemsPath(document: OpenApiDocument, operation: OpenApiOperation): string | undefined {
  const schema = responseBodySchema(document, operation);
  if (!schema) return undefined;
  if (stringValue(schema.type) === "array") return undefined;
  for (const name of ["data", "items", "results", "records"]) {
    if (stringValue(schemaProperty(document, schema, name)?.type) === "array") return name;
  }
  return schemaProperties(document, schema).find(([, property]) => stringValue(property?.type) === "array")?.[0];
}

function responseCursorPath(document: OpenApiDocument, operation: OpenApiOperation): string | undefined {
  const schema = responseBodySchema(document, operation);
  for (const name of ["next_cursor", "nextCursor", "next_page_token", "nextPageToken"]) {
    if (schemaProperty(document, schema, name)) return name;
  }
  if (schemaProperty(document, schemaProperty(document, schema, "paging"), "next")) return "paging.next";
  if (schemaProperty(document, schemaProperty(document, schema, "page_info"), "end_cursor")) return "page_info.end_cursor";
  return undefined;
}

function responseNextUrlPath(document: OpenApiDocument, operation: OpenApiOperation): string | undefined {
  const schema = responseBodySchema(document, operation);
  for (const name of ["next_url", "nextUrl", "next"]) {
    if (schemaProperty(document, schema, name)) return name;
  }
  if (schemaProperty(document, schemaProperty(document, schema, "links"), "next")) return "links.next";
  return undefined;
}

function firstParameter(
  parameters: Map<string, OpenApiConnectorParameterBinding & { field: ConnectorFieldDefinition }>,
  names: readonly string[],
): OpenApiConnectorParameterBinding | undefined {
  for (const name of names) {
    const parameter = parameters.get(name);
    if (parameter) return parameter;
  }
  return undefined;
}

function openApiParameterBinding(
  document: OpenApiDocument,
  parameter: OpenApiParameter,
  usedFieldNames: Set<string>,
): (OpenApiConnectorParameterBinding & { field: ConnectorFieldDefinition }) | null {
  const resolved = resolveOpenApiParameter(document, parameter);
  if (!resolved) return null;
  const sourceName = stringValue(resolved.name);
  const location = parameterLocation(resolved.in);
  if (!sourceName || !location) return null;
  const fieldName = uniqueFieldName(sourceName, location, usedFieldNames);
  return {
    fieldName,
    sourceName,
    location,
    field: {
      ...fieldFromSchema(document, fieldName, resolved.schema),
      ...optionalString("description", stringValue(resolved.description)),
      optional: location === "path" ? false : resolved.required !== true,
    },
  };
}

function openApiBodyBindings(
  document: OpenApiDocument,
  requestBody: OpenApiRequestBody | undefined,
  usedFieldNames: Set<string>,
): Array<OpenApiConnectorBodyBinding & { field: ConnectorFieldDefinition }> {
  const schema = requestBodySchema(document, requestBody);
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
        ...fieldFromSchema(document, fieldName, propertySchema),
        optional: !required.has(sourceName),
      },
    }];
  });
}

function fieldFromSchema(document: OpenApiDocument, name: string, schema: OpenApiSchema | undefined): Omit<ConnectorFieldDefinition, "optional"> {
  const resolved = resolveOpenApiSchema(document, schema);
  return {
    name,
    type: connectorFieldType(resolved),
    ...optionalString("description", stringValue(resolved?.description)),
    ...optionalJson("default", integrationJsonValue(resolved?.default)),
    ...enumOptions(resolved?.enum),
    ...optionalNumber("min", numberValue(resolved?.minimum)),
    ...optionalNumber("max", numberValue(resolved?.maximum)),
  };
}

function responseSchemaForOperation(document: OpenApiDocument, operation: OpenApiOperation): ConnectorRuntimeOutputSchema {
  const schema = responseBodySchema(document, operation);
  return {
    type: connectorRuntimeType(schema),
    requiredPaths: requiredPathsForSchema(document, schema),
  };
}

function responseBodySchema(document: OpenApiDocument, operation: OpenApiOperation): OpenApiSchema | undefined {
  const response = resolveOpenApiResponse(document, Object.entries(operation.responses ?? {})
    .find(([status]) => status.startsWith("2"))?.[1]);
  return jsonContentSchema(document, response?.content);
}

function requiredPathsForSchema(
  document: OpenApiDocument,
  schema: OpenApiSchema | undefined,
  prefix = "",
  seen = new Set<OpenApiSchema>(),
): string[] {
  const resolved = resolveOpenApiSchema(document, schema);
  if (!resolved || seen.has(resolved)) return [];
  seen.add(resolved);
  return stringArray(resolved.required).flatMap((name) => {
    if (!name.trim()) return [];
    const path = prefix ? `${prefix}.${name}` : name;
    const child = schemaProperty(document, resolved, name);
    return [
      path,
      ...requiredPathsForSchema(document, child, path, seen),
    ];
  });
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

function jsonContentSchema(document: OpenApiDocument, content: OpenApiRequestBody["content"] | undefined): OpenApiSchema | undefined {
  return resolveOpenApiSchema(document, content?.["application/json"]?.schema ?? content?.["application/x-www-form-urlencoded"]?.schema);
}

function requestBodyEncoding(document: OpenApiDocument, requestBody: OpenApiRequestBody | undefined): "form" | undefined {
  return requestBodyContent(document, requestBody)?.encoding;
}

function requestBodyContent(
  document: OpenApiDocument,
  requestBody: OpenApiRequestBody | undefined,
): { schema: OpenApiSchema | undefined; encoding?: "form" } | undefined {
  const content = resolveOpenApiRequestBody(document, requestBody)?.content;
  if (!content) return undefined;
  const jsonSchema = resolveOpenApiSchema(document, content["application/json"]?.schema);
  if (jsonSchema) return { schema: jsonSchema };
  const formSchema = resolveOpenApiSchema(document, content["application/x-www-form-urlencoded"]?.schema);
  if (formSchema) return { schema: formSchema, encoding: "form" };
  return undefined;
}

function schemaProperty(document: OpenApiDocument, schema: OpenApiSchema | undefined, name: string): OpenApiSchema | undefined {
  return resolveOpenApiSchema(document, schema?.properties?.[name]);
}

function schemaProperties(document: OpenApiDocument, schema: OpenApiSchema): Array<[string, OpenApiSchema | undefined]> {
  return Object.entries(schema.properties ?? {}).map(([name, property]) => [name, resolveOpenApiSchema(document, property)]);
}

function parameterLocation(value: unknown): OpenApiParameterLocation | null {
  return value === "path" || value === "query" || value === "header" ? value : null;
}

function resolveOpenApiOperation(document: OpenApiDocument, value: OpenApiOperation | undefined): OpenApiOperation | undefined {
  return resolveOpenApiRef(document, value) as OpenApiOperation | undefined;
}

function resolveOpenApiPathItem(document: OpenApiDocument, value: OpenApiPathItem | undefined): OpenApiPathItem | undefined {
  return resolveOpenApiRef(document, value) as OpenApiPathItem | undefined;
}

function resolveOpenApiParameter(document: OpenApiDocument, value: OpenApiParameter | undefined): OpenApiParameter | undefined {
  return resolveOpenApiRef(document, value) as OpenApiParameter | undefined;
}

function resolveOpenApiRequestBody(document: OpenApiDocument, value: OpenApiRequestBody | undefined): OpenApiRequestBody | undefined {
  return resolveOpenApiRef(document, value) as OpenApiRequestBody | undefined;
}

function resolveOpenApiResponse(document: OpenApiDocument, value: OpenApiResponse | undefined): OpenApiResponse | undefined {
  return resolveOpenApiRef(document, value) as OpenApiResponse | undefined;
}

function resolveOpenApiSchema(document: OpenApiDocument, value: OpenApiSchema | undefined): OpenApiSchema | undefined {
  return mergeOpenApiComposedSchema(document, resolveOpenApiRef(document, value) as OpenApiSchema | undefined);
}

function resolveOpenApiSecurityScheme(
  document: OpenApiDocument,
  value: OpenApiSecurityScheme | undefined,
): OpenApiSecurityScheme | undefined {
  return resolveOpenApiRef(document, value) as OpenApiSecurityScheme | undefined;
}

function resolveOpenApiRef(document: OpenApiDocument, value: unknown, seen = new Set<string>()): unknown {
  if (!value || typeof value !== "object") return value;
  const ref = stringValue((value as { $ref?: unknown }).$ref);
  if (!ref) return value;
  if (!ref.startsWith("#/")) {
    throw new Error(`OpenAPI runtime only supports local refs: ${ref}`);
  }
  if (seen.has(ref)) {
    throw new Error(`OpenAPI runtime detected a circular ref: ${ref}`);
  }
  seen.add(ref);
  return resolveOpenApiRef(document, valueAtJsonPointer(document, ref), seen);
}

function mergeOpenApiComposedSchema(document: OpenApiDocument, schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
  return mergeOpenApiAlternatives(document, mergeOpenApiAllOf(document, schema));
}

function mergeOpenApiAllOf(document: OpenApiDocument, schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
  if (!schema?.allOf?.length) return schema;
  const parts = schema.allOf
    .map((part) => resolveOpenApiSchema(document, part))
    .filter((part): part is OpenApiSchema => Boolean(part));
  const properties = Object.assign({}, ...parts.map((part) => part.properties ?? {}), schema.properties ?? {});
  const required = uniqueStrings([
    ...parts.flatMap((part) => stringArray(part.required)),
    ...stringArray(schema.required),
  ]);
  const merged: OpenApiSchema = {
    ...Object.assign({}, ...parts),
    ...schema,
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(required.length > 0 ? { required } : {}),
  };
  delete merged.allOf;
  return merged;
}

function mergeOpenApiAlternatives(document: OpenApiDocument, schema: OpenApiSchema | undefined): OpenApiSchema | undefined {
  const alternatives = schema?.oneOf ?? schema?.anyOf;
  if (!schema || !alternatives?.length) return schema;
  const parts = alternatives
    .map((part) => resolveOpenApiSchema(document, part))
    .filter((part): part is OpenApiSchema => Boolean(part));
  const properties = Object.assign({}, ...parts.map((part) => part.properties ?? {}), schema.properties ?? {});
  const required = intersectRequiredProperties(parts, stringArray(schema.required));
  const merged: OpenApiSchema = {
    ...schema,
    ...(Object.keys(properties).length > 0 ? { properties, type: stringValue(schema.type) ?? "object" } : {}),
    ...(required.length > 0 ? { required } : {}),
  };
  delete merged.oneOf;
  delete merged.anyOf;
  return merged;
}

function intersectRequiredProperties(parts: OpenApiSchema[], fallback: string[]): string[] {
  if (fallback.length > 0 || parts.length === 0) return fallback;
  const [first, ...rest] = parts.map((part) => new Set(stringArray(part.required)));
  return [...(first ?? new Set<string>())].filter((name) => rest.every((set) => set.has(name)));
}

function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  return pointer
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
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
  return document.servers?.map(serverUrl).find((url): url is string => Boolean(url));
}

function serverUrl(server: OpenApiServer): string | undefined {
  const url = stringValue(server.url);
  if (!url) return undefined;
  return url.replace(/{([^}]+)}/g, (match, name: string) => (
    stringValue(server.variables?.[name]?.default) ?? match
  ));
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
