import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export const HUBSPOT_CRM_OBJECTS = [
  "contacts",
  "companies",
  "deals",
  "tickets",
  "products",
  "line-items",
  "quotes",
  "calls",
  "meetings",
  "notes",
  "emails",
  "tasks",
] as const;

export const HUBSPOT_ACTION_SLUGS = [
  ...HUBSPOT_CRM_OBJECTS.flatMap((object) => [
    `list-${object}`,
    `get-${object}`,
    `search-${object}`,
    `create-${object}`,
    `update-${object}`,
    `archive-${object}`,
  ]),
  "batch-read-records",
  "batch-create-records",
  "batch-update-records",
  "batch-archive-records",
  "get-association-labels",
  "associate-records",
  "remove-association",
  "batch-read-associations",
  "batch-create-associations",
  "batch-archive-associations",
  "list-properties",
  "get-property",
  "create-property",
  "update-property",
  "archive-property",
  "list-owners",
  "get-owner",
  "list-pipelines",
  "get-pipeline",
  "create-pipeline",
  "update-pipeline",
  "archive-pipeline",
  "create-pipeline-stage",
  "update-pipeline-stage",
  "archive-pipeline-stage",
  "list-files",
  "get-file",
  "upload-file",
  "archive-file",
  "list-folders",
  "get-folder",
  "create-folder",
  "archive-folder",
  "list-forms",
  "get-form",
  "list-form-submissions",
  "list-marketing-emails",
  "get-marketing-email",
  "create-marketing-email",
  "update-marketing-email",
  "archive-marketing-email",
  "publish-marketing-email",
  "unpublish-marketing-email",
  "list-event-types",
  "list-event-occurrences",
  "list-webhook-subscriptions",
  "create-webhook-subscription",
  "update-webhook-subscription",
  "delete-webhook-subscription",
] as const;

export type HubSpotRuntimeOperation = typeof HUBSPOT_ACTION_SLUGS[number];

const HUBSPOT_OPERATION_SET = new Set<string>(HUBSPOT_ACTION_SLUGS);
const CRM_OBJECT_SET = new Set<string>(HUBSPOT_CRM_OBJECTS);

export function isHubSpotActionOperationSupported(operationId: string): boolean {
  return hubSpotRuntimeOperation(operationId) !== null;
}

export function buildHubSpotOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = hubSpotRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported HubSpot operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const headers = { accept: "application/json" };

  const crm = crmObjectOperation(runtimeOperation);
  if (crm) return crmObjectPlan(crm.action, crm.object, values, auth, headers);

  switch (runtimeOperation) {
    case "batch-read-records":
      return jsonPlan("POST", `crm/v3/objects/${objectType(values)}/batch/read`, auth, headers, {
        properties: optionalJsonArray(values.properties),
        propertiesWithHistory: optionalJsonArray(values.propertiesWithHistory ?? values.properties_with_history),
        idProperty: optionalString(values.idProperty ?? values.id_property),
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema(["results"]));
    case "batch-create-records":
      return jsonPlan("POST", `crm/v3/objects/${objectType(values)}/batch/create`, auth, headers, {
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema(["results"]));
    case "batch-update-records":
      return jsonPlan("POST", `crm/v3/objects/${objectType(values)}/batch/update`, auth, headers, {
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema(["results"]));
    case "batch-archive-records":
      return jsonPlan("POST", `crm/v3/objects/${objectType(values)}/batch/archive`, auth, headers, {
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema());
    case "get-association-labels":
      return getPlan(`crm/v4/associations/${associationObject(values.fromObjectType, "fromObjectType")}/${associationObject(values.toObjectType, "toObjectType")}/labels`, auth, headers, objectSchema(["results"]));
    case "associate-records":
      return jsonPlan("PUT", `crm/v3/objects/${associationObject(values.fromObjectType, "fromObjectType")}/${recordId(values.fromRecordId, "fromRecordId")}/associations/${associationObject(values.toObjectType, "toObjectType")}/${recordId(values.toRecordId, "toRecordId")}/${recordId(values.associationTypeId, "associationTypeId")}`, auth, headers, {}, objectSchema());
    case "remove-association":
      return jsonPlan("DELETE", `crm/v3/objects/${associationObject(values.fromObjectType, "fromObjectType")}/${recordId(values.fromRecordId, "fromRecordId")}/associations/${associationObject(values.toObjectType, "toObjectType")}/${recordId(values.toRecordId, "toRecordId")}/${recordId(values.associationTypeId, "associationTypeId")}`, auth, headers, {}, objectSchema());
    case "batch-read-associations":
      return jsonPlan("POST", `crm/v3/associations/${associationObject(values.fromObjectType, "fromObjectType")}/${associationObject(values.toObjectType, "toObjectType")}/batch/read`, auth, headers, {
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema(["results"]));
    case "batch-create-associations":
      return jsonPlan("POST", `crm/v3/associations/${associationObject(values.fromObjectType, "fromObjectType")}/${associationObject(values.toObjectType, "toObjectType")}/batch/create`, auth, headers, {
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema(["results"]));
    case "batch-archive-associations":
      return jsonPlan("POST", `crm/v3/associations/${associationObject(values.fromObjectType, "fromObjectType")}/${associationObject(values.toObjectType, "toObjectType")}/batch/archive`, auth, headers, {
        inputs: requiredJsonArray(values.inputs, "inputs"),
      }, objectSchema());
    case "list-properties":
      return getPlan(`crm/v3/properties/${objectType(values)}`, auth, headers, objectSchema(["results"]), pagingQuery(values));
    case "get-property":
      return getPlan(`crm/v3/properties/${objectType(values)}/${pathSegment(requiredString(values.propertyName, "propertyName"))}`, auth, headers, objectSchema(["name", "type"]));
    case "create-property":
      return jsonPlan("POST", `crm/v3/properties/${objectType(values)}`, auth, headers, propertyBody(values, true), objectSchema(["name", "type"]));
    case "update-property":
      return jsonPlan("PATCH", `crm/v3/properties/${objectType(values)}/${pathSegment(requiredString(values.propertyName, "propertyName"))}`, auth, headers, propertyBody(values, false), objectSchema(["name", "type"]));
    case "archive-property":
      return jsonPlan("DELETE", `crm/v3/properties/${objectType(values)}/${pathSegment(requiredString(values.propertyName, "propertyName"))}`, auth, headers, {}, objectSchema());
    case "list-owners":
      return cursorGetPlan("crm/v3/owners", auth, headers, values, objectSchema(["results"]), {
        email: optionalString(values.email),
        archived: values.archived,
      });
    case "get-owner":
      return getPlan(`crm/v3/owners/${recordId(values.ownerId, "ownerId")}`, auth, headers, objectSchema(["id", "email"]));
    case "list-pipelines":
      return getPlan(`crm/v3/pipelines/${objectType(values)}`, auth, headers, objectSchema(["results"]));
    case "get-pipeline":
      return getPlan(`crm/v3/pipelines/${objectType(values)}/${pathSegment(requiredString(values.pipelineId, "pipelineId"))}`, auth, headers, objectSchema(["id", "label"]));
    case "create-pipeline":
      return jsonPlan("POST", `crm/v3/pipelines/${objectType(values)}`, auth, headers, pipelineBody(values, true), objectSchema(["id", "label"]));
    case "update-pipeline":
      return jsonPlan("PUT", `crm/v3/pipelines/${objectType(values)}/${pathSegment(requiredString(values.pipelineId, "pipelineId"))}`, auth, headers, pipelineBody(values, false), objectSchema(["id", "label"]));
    case "archive-pipeline":
      return jsonPlan("DELETE", `crm/v3/pipelines/${objectType(values)}/${pathSegment(requiredString(values.pipelineId, "pipelineId"))}`, auth, headers, {}, objectSchema());
    case "create-pipeline-stage":
      return jsonPlan("POST", `crm/v3/pipelines/${objectType(values)}/${pathSegment(requiredString(values.pipelineId, "pipelineId"))}/stages`, auth, headers, pipelineStageBody(values, true), objectSchema(["id", "label"]));
    case "update-pipeline-stage":
      return jsonPlan("PATCH", `crm/v3/pipelines/${objectType(values)}/${pathSegment(requiredString(values.pipelineId, "pipelineId"))}/stages/${pathSegment(requiredString(values.stageId, "stageId"))}`, auth, headers, pipelineStageBody(values, false), objectSchema(["id", "label"]));
    case "archive-pipeline-stage":
      return jsonPlan("DELETE", `crm/v3/pipelines/${objectType(values)}/${pathSegment(requiredString(values.pipelineId, "pipelineId"))}/stages/${pathSegment(requiredString(values.stageId, "stageId"))}`, auth, headers, {}, objectSchema());
    case "list-files":
      return cursorGetPlan("files/v3/files", auth, headers, values, objectSchema(["results"]), {
        parentFolderId: values.parentFolderId ?? values.parent_folder_id,
        path: optionalString(values.path),
      });
    case "get-file":
      return getPlan(`files/v3/files/${recordId(values.fileId, "fileId")}`, auth, headers, objectSchema(["id", "name"]));
    case "upload-file":
      return {
        method: "POST",
        endpoint: "files/v3/files",
        auth,
        headers,
        query: {},
        bodyEncoding: "multipart",
        body: removeEmptyValues({
          file: requiredString(values.file, "file"),
          fileName: values.fileName ?? values.file_name,
          folderId: values.folderId ?? values.folder_id,
          folderPath: values.folderPath ?? values.folder_path,
          options: values.options ?? { access: "PRIVATE" },
        }),
        responseSchema: objectSchema(["id", "name"]),
      };
    case "archive-file":
      return jsonPlan("DELETE", `files/v3/files/${recordId(values.fileId, "fileId")}`, auth, headers, {}, objectSchema());
    case "list-folders":
      return cursorGetPlan("files/v3/folders", auth, headers, values, objectSchema(["results"]));
    case "get-folder":
      return getPlan(`files/v3/folders/${recordId(values.folderId, "folderId")}`, auth, headers, objectSchema(["id", "name"]));
    case "create-folder":
      return jsonPlan("POST", "files/v3/folders", auth, headers, removeEmptyValues({
        name: requiredString(values.name, "name"),
        parentFolderId: values.parentFolderId ?? values.parent_folder_id,
        path: optionalString(values.path),
      }), objectSchema(["id", "name"]));
    case "archive-folder":
      return jsonPlan("DELETE", `files/v3/folders/${recordId(values.folderId, "folderId")}`, auth, headers, {}, objectSchema());
    case "list-forms":
      return cursorGetPlan("marketing/v3/forms", auth, headers, values, objectSchema(["results"]));
    case "get-form":
      return getPlan(`marketing/v3/forms/${pathSegment(requiredString(values.formId, "formId"))}`, auth, headers, objectSchema(["id", "name"]));
    case "list-form-submissions":
      return cursorGetPlan(`form-integrations/v1/submissions/forms/${pathSegment(requiredString(values.formId, "formId"))}`, auth, headers, values, objectSchema(["results"]));
    case "list-marketing-emails":
      return cursorGetPlan("marketing/v3/marketing-emails", auth, headers, values, objectSchema(["results"]));
    case "get-marketing-email":
      return getPlan(`marketing/v3/marketing-emails/${recordId(values.emailId, "emailId")}`, auth, headers, objectSchema(["id", "name"]));
    case "create-marketing-email":
      return jsonPlan("POST", "marketing/v3/marketing-emails", auth, headers, marketingEmailBody(values, true), objectSchema(["id", "name"]));
    case "update-marketing-email":
      return jsonPlan("PATCH", `marketing/v3/marketing-emails/${recordId(values.emailId, "emailId")}`, auth, headers, marketingEmailBody(values, false), objectSchema(["id", "name"]));
    case "archive-marketing-email":
      return jsonPlan("DELETE", `marketing/v3/marketing-emails/${recordId(values.emailId, "emailId")}`, auth, headers, {}, objectSchema());
    case "publish-marketing-email":
      return jsonPlan("POST", `marketing/v3/marketing-emails/${recordId(values.emailId, "emailId")}/publish`, auth, headers, {}, objectSchema(["id", "name"]));
    case "unpublish-marketing-email":
      return jsonPlan("POST", `marketing/v3/marketing-emails/${recordId(values.emailId, "emailId")}/unpublish`, auth, headers, {}, objectSchema(["id", "name"]));
    case "list-event-types":
      return cursorGetPlan("events/event-occurrences/2026-03/event-types", auth, headers, values, objectSchema(["results"]));
    case "list-event-occurrences":
      return cursorGetPlan("events/event-occurrences/2026-03", auth, headers, values, objectSchema(["results"]), {
        eventType: optionalString(values.eventType ?? values.event_type),
        objectType: optionalString(values.objectType ?? values.object_type),
        objectId: optionalString(values.objectId ?? values.object_id),
      });
    case "list-webhook-subscriptions":
      return getPlan(`webhooks/2026-3/${recordId(values.appId, "appId")}/subscriptions`, auth, headers, objectSchema(["results"]));
    case "create-webhook-subscription":
      return jsonPlan("POST", `webhooks/2026-3/${recordId(values.appId, "appId")}/subscriptions`, auth, headers, webhookSubscriptionBody(values, true), objectSchema(["id", "subscriptionType"]));
    case "update-webhook-subscription":
      return jsonPlan("PATCH", `webhooks/2026-3/${recordId(values.appId, "appId")}/subscriptions/${recordId(values.subscriptionId, "subscriptionId")}`, auth, headers, webhookSubscriptionBody(values, false), objectSchema(["id", "subscriptionType"]));
    case "delete-webhook-subscription":
      return jsonPlan("DELETE", `webhooks/2026-3/${recordId(values.appId, "appId")}/subscriptions/${recordId(values.subscriptionId, "subscriptionId")}`, auth, headers, {}, objectSchema());
  }
  throw new Error(`Unsupported HubSpot operation: ${operation.id}`);
}

function hubSpotRuntimeOperation(operationId: string): HubSpotRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug && HUBSPOT_OPERATION_SET.has(slug)) return slug as HubSpotRuntimeOperation;
  return null;
}

function crmObjectOperation(slug: HubSpotRuntimeOperation): { action: string; object: string } | null {
  for (const action of ["list", "get", "search", "create", "update", "archive"]) {
    const prefix = `${action}-`;
    if (!slug.startsWith(prefix)) continue;
    const object = slug.slice(prefix.length);
    if (CRM_OBJECT_SET.has(object)) return { action, object };
  }
  return null;
}

function crmObjectPlan(
  action: string,
  object: string,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  const apiObject = apiObjectType(object);
  switch (action) {
    case "list":
      return cursorGetPlan(`crm/v3/objects/${apiObject}`, auth, headers, values, objectSchema(["results"]), objectQuery(values));
    case "get":
      return getPlan(`crm/v3/objects/${apiObject}/${recordId(values.recordId ?? values[recordFieldName(object)], "recordId")}`, auth, headers, objectSchema(["id", "properties"]), objectQuery(values));
    case "search":
      return jsonPlan("POST", `crm/v3/objects/${apiObject}/search`, auth, headers, searchBody(values), objectSchema(["results"]));
    case "create":
      return jsonPlan("POST", `crm/v3/objects/${apiObject}`, auth, headers, recordBody(values, true), objectSchema(["id", "properties"]));
    case "update":
      return jsonPlan("PATCH", `crm/v3/objects/${apiObject}/${recordId(values.recordId ?? values[recordFieldName(object)], "recordId")}`, auth, headers, recordBody(values, false), objectSchema(["id", "properties"]));
    case "archive":
      return jsonPlan("DELETE", `crm/v3/objects/${apiObject}/${recordId(values.recordId ?? values[recordFieldName(object)], "recordId")}`, auth, headers, {}, objectSchema());
  }
  throw new Error(`Unsupported HubSpot CRM object action: ${action}`);
}

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  responseSchema: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>,
  query: Record<string, IntegrationJson | undefined> = {},
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: removeEmptyValues(query),
    body: {},
    responseSchema,
  };
}

function cursorGetPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
  responseSchema: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>,
  extraQuery: Record<string, IntegrationJson | undefined> = {},
): ConnectorRuntimeRequestPlan {
  const limit = numberValue(values.limit) ?? 100;
  return {
    ...getPlan(endpoint, auth, headers, responseSchema, removeEmptyValues({
      ...extraQuery,
      ...pagingQuery(values),
      limit,
    })),
    pagination: {
      mode: "cursor",
      itemsPath: "results",
      nextCursorPath: "paging.next.after",
      cursorParam: "after",
      limitParam: "limit",
      pageSize: limit,
      maxPages: numberValue(values.maxPages) ?? 1,
    },
  };
}

function jsonPlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined>,
  responseSchema: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>,
): ConnectorRuntimeRequestPlan {
  return {
    method,
    endpoint,
    auth,
    headers,
    body: removeEmptyValues(body),
    responseSchema,
  };
}

function objectSchema(requiredPaths: string[] = []): NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]> {
  return {
    type: "object",
    ...(requiredPaths.length > 0 ? { requiredPaths } : {}),
  };
}

function objectQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    ...pagingQuery(values),
    properties: values.properties,
    propertiesWithHistory: values.propertiesWithHistory ?? values.properties_with_history,
    associations: values.associations,
    archived: values.archived,
    idProperty: values.idProperty ?? values.id_property,
  });
}

function searchBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    query: optionalString(values.query),
    filterGroups: values.filterGroups ?? values.filter_groups,
    sorts: values.sorts,
    properties: values.properties,
    limit: numberValue(values.limit) ?? 100,
    after: optionalString(values.after),
  });
}

function recordBody(values: Record<string, IntegrationJson>, requireProperties: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    properties: requireProperties ? requiredJsonObject(values.properties, "properties") : optionalJsonObject(values.properties),
    associations: optionalJsonArray(values.associations),
  });
}

function propertyBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireCore ? requiredString(values.name, "name") : optionalString(values.name),
    label: requireCore ? requiredString(values.label, "label") : optionalString(values.label),
    type: requireCore ? requiredString(values.type, "type") : optionalString(values.type),
    fieldType: requireCore ? requiredString(values.fieldType ?? values.field_type, "fieldType") : optionalString(values.fieldType ?? values.field_type),
    groupName: optionalString(values.groupName ?? values.group_name),
    description: optionalString(values.description),
    options: optionalJsonArray(values.options),
    displayOrder: values.displayOrder ?? values.display_order,
    hasUniqueValue: values.hasUniqueValue ?? values.has_unique_value,
    hidden: values.hidden,
    formField: values.formField ?? values.form_field,
  });
}

function pipelineBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    label: requireCore ? requiredString(values.label, "label") : optionalString(values.label),
    displayOrder: values.displayOrder ?? values.display_order,
    stages: optionalJsonArray(values.stages),
  });
}

function pipelineStageBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    label: requireCore ? requiredString(values.label, "label") : optionalString(values.label),
    displayOrder: values.displayOrder ?? values.display_order,
    metadata: optionalJsonObject(values.metadata),
  });
}

function marketingEmailBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireCore ? requiredString(values.name, "name") : optionalString(values.name),
    subject: optionalString(values.subject),
    fromName: optionalString(values.fromName ?? values.from_name),
    fromEmail: optionalString(values.fromEmail ?? values.from_email),
    htmlTitle: optionalString(values.htmlTitle ?? values.html_title),
    language: optionalString(values.language),
    folderIdV2: values.folderIdV2 ?? values.folder_id_v2,
    content: optionalJsonObject(values.content),
  });
}

function webhookSubscriptionBody(values: Record<string, IntegrationJson>, requireCore: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    subscriptionType: requireCore ? requiredString(values.subscriptionType ?? values.subscription_type, "subscriptionType") : optionalString(values.subscriptionType ?? values.subscription_type),
    propertyName: optionalString(values.propertyName ?? values.property_name),
    active: values.active,
  });
}

function pagingQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson | undefined> {
  return removeEmptyValues({
    limit: values.limit,
    after: values.after,
  });
}

function objectType(values: Record<string, IntegrationJson>): string {
  return apiObjectType(requiredString(values.objectType, "objectType"));
}

function apiObjectType(value: string): string {
  if (value === "line-items") return "line_items";
  return value;
}

function associationObject(value: IntegrationJson, name: string): string {
  return apiObjectType(requiredString(value, name));
}

function recordFieldName(object: string): string {
  const singular = object.endsWith("ies")
    ? `${object.slice(0, -3)}y`
    : object.endsWith("s")
      ? object.slice(0, -1)
      : object;
  return `${singular.replaceAll("-", "")}Id`;
}

function recordId(value: IntegrationJson, name: string): string {
  return pathSegment(requiredString(value, name));
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function requiredString(value: IntegrationJson | undefined, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`HubSpot ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson | undefined): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: IntegrationJson | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalJsonArray(value: IntegrationJson | undefined): IntegrationJson[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function requiredJsonArray(value: IntegrationJson | undefined, name: string): IntegrationJson[] {
  const parsed = optionalJsonArray(value);
  if (!parsed) throw new Error(`HubSpot ${name} is required`);
  return parsed;
}

function optionalJsonObject(value: IntegrationJson | undefined): Record<string, IntegrationJson> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, IntegrationJson>
    : undefined;
}

function requiredJsonObject(value: IntegrationJson | undefined, name: string): Record<string, IntegrationJson> {
  const parsed = optionalJsonObject(value);
  if (!parsed) throw new Error(`HubSpot ${name} is required`);
  return parsed;
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  ) as Record<string, IntegrationJson>;
}
