import type {
  ConnectorRuntimeAuthBinding,
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

const DEFAULT_API_VERSION = "v66.0";

export const SALESFORCE_STANDARD_OBJECTS = [
  { slug: "accounts", singular: "account", object: "Account" },
  { slug: "contacts", singular: "contact", object: "Contact" },
  { slug: "leads", singular: "lead", object: "Lead" },
  { slug: "opportunities", singular: "opportunity", object: "Opportunity" },
  { slug: "cases", singular: "case", object: "Case" },
  { slug: "campaigns", singular: "campaign", object: "Campaign" },
  { slug: "tasks", singular: "task", object: "Task" },
  { slug: "events", singular: "event", object: "Event" },
  { slug: "users", singular: "user", object: "User" },
  { slug: "products", singular: "product", object: "Product2" },
  { slug: "pricebooks", singular: "pricebook", object: "Pricebook2" },
  { slug: "quotes", singular: "quote", object: "Quote" },
] as const;

const OBJECT_ACTIONS = ["query", "get", "create", "update", "delete", "upsert"] as const;

export const SALESFORCE_ACTION_SLUGS = [
  "list-api-versions",
  "get-api-resources",
  "get-limits",
  "get-record-counts",
  "list-tabs",
  "list-themes",
  "list-app-menu-items",
  "list-recent-items",
  "describe-global",
  "list-sobjects",
  "describe-sobject",
  "get-sobject-layouts",
  "get-sobject-compact-layouts",
  "query",
  "query-all",
  "query-more",
  "search",
  "parameterized-search",
  "create-record",
  "get-record",
  "update-record",
  "delete-record",
  "upsert-record",
  "get-record-by-external-id",
  "get-deleted-records",
  "get-updated-records",
  "get-blob-field",
  "read-records",
  "create-records",
  "update-records",
  "upsert-records",
  "delete-records",
  "composite",
  "composite-batch",
  "composite-graph",
  "composite-tree",
  "list-ingest-jobs",
  "create-ingest-job",
  "get-ingest-job",
  "upload-ingest-job-data",
  "close-ingest-job",
  "abort-ingest-job",
  "get-ingest-successful-results",
  "get-ingest-failed-results",
  "get-ingest-unprocessed-records",
  "list-query-jobs",
  "create-query-job",
  "get-query-job",
  "get-query-job-results",
  "abort-query-job",
  "delete-query-job",
  "list-reports",
  "describe-report",
  "run-report-sync",
  "run-report-async",
  "get-report-instance",
  "delete-report-instance",
  "list-dashboards",
  "get-dashboard",
  "refresh-dashboard",
  "tooling-query",
  "tooling-query-all",
  "tooling-create-record",
  "tooling-get-record",
  "tooling-update-record",
  "tooling-delete-record",
  "tooling-execute-anonymous",
  "tooling-run-tests-sync",
  "list-chatter-feeds",
  "get-chatter-feed",
  "post-feed-item",
  "get-feed-element",
  "delete-feed-element",
  "add-feed-comment",
  "delete-feed-comment",
  "like-feed-element",
  "unlike-feed-element",
  "get-event-schema",
  ...SALESFORCE_STANDARD_OBJECTS.flatMap((object) => OBJECT_ACTIONS.map((action) => `${action}-${object.singular}`)),
] as const;

export type SalesforceRuntimeOperation = typeof SALESFORCE_ACTION_SLUGS[number];

const SALESFORCE_OPERATION_SET = new Set<string>(SALESFORCE_ACTION_SLUGS);
const SALESFORCE_OBJECT_BY_SINGULAR = new Map<string, string>(SALESFORCE_STANDARD_OBJECTS.map((object) => [object.singular, object.object]));

export function isSalesforceActionOperationSupported(operationId: string): boolean {
  return salesforceRuntimeOperation(operationId) !== null;
}

export function buildSalesforceOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = salesforceRuntimeOperation(operation.id);
  if (!runtimeOperation) throw new Error(`Unsupported Salesforce operation: ${operation.id}`);
  const auth = operation.authFieldNames.map((field) => ({ type: "secret" as const, field, placement: "bearer" as const }));
  const headers = { accept: "application/json" };
  const objectShortcut = standardObjectOperation(runtimeOperation);
  if (objectShortcut) {
    return standardObjectPlan(objectShortcut.action, objectShortcut.objectType, values, auth, headers);
  }

  switch (runtimeOperation) {
    case "list-api-versions":
      return getPlan("services/data", auth, headers, {}, arraySchema());
    case "get-api-resources":
      return getPlan(dataPath(values, ""), auth, headers, {}, objectSchema());
    case "get-limits":
      return getPlan(dataPath(values, "limits"), auth, headers, {}, objectSchema());
    case "get-record-counts":
      return getPlan(dataPath(values, "limits/recordCount"), auth, headers, {
        sObjects: optionalCsv(values.sObjects ?? values.objects),
      }, objectSchema(["sObjects"]));
    case "list-tabs":
      return getPlan(dataPath(values, "tabs"), auth, headers, {}, arraySchema());
    case "list-themes":
      return getPlan(dataPath(values, "theme"), auth, headers, {}, objectSchema());
    case "list-app-menu-items":
      return getPlan(dataPath(values, `appMenu/${pathSegment(optionalString(values.menuType) ?? "AppSwitcher")}`), auth, headers, {}, objectSchema());
    case "list-recent-items":
      return getPlan(dataPath(values, "recent"), auth, headers, { limit: values.limit ?? 25 }, arraySchema());
    case "describe-global":
    case "list-sobjects":
      return getPlan(dataPath(values, "sobjects"), auth, headers, {}, objectSchema(["sobjects"]));
    case "describe-sobject":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/describe`), auth, headers, {}, objectSchema(["fields"]));
    case "get-sobject-layouts":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/describe/layouts`), auth, headers, {}, objectSchema(["layouts"]));
    case "get-sobject-compact-layouts":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/describe/compactLayouts`), auth, headers, {}, objectSchema());
    case "query":
      return queryPlan(dataPath(values, "query"), values, auth, headers);
    case "query-all":
      return queryPlan(dataPath(values, "queryAll"), values, auth, headers);
    case "query-more":
      return getPlan(requiredString(values.nextRecordsUrl, "nextRecordsUrl"), auth, headers, {}, objectSchema(["records"]));
    case "search":
      return getPlan(dataPath(values, "search"), auth, headers, { q: requiredString(values.search, "search") }, objectSchema(["searchRecords"]));
    case "parameterized-search":
      return getPlan(dataPath(values, "parameterizedSearch"), auth, headers, removeEmptyValues({
        q: requiredString(values.search, "search"),
        sobjects: optionalCsv(values.sObjects ?? values.objects),
        fields: optionalCsv(values.fields),
        overallLimit: values.overallLimit ?? values.limit,
      }), objectSchema(["searchRecords"]));
    case "create-record":
      return jsonPlan("POST", dataPath(values, `sobjects/${sobject(values)}`), auth, headers, recordBody(values), objectSchema(["id", "success"]));
    case "get-record":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/${recordId(values)}`), auth, headers, recordQuery(values), objectSchema(["Id"]));
    case "update-record":
      return jsonPlan("PATCH", dataPath(values, `sobjects/${sobject(values)}/${recordId(values)}`), auth, headers, recordBody(values), objectSchema());
    case "delete-record":
      return jsonPlan("DELETE", dataPath(values, `sobjects/${sobject(values)}/${recordId(values)}`), auth, headers, {}, objectSchema());
    case "upsert-record":
      return jsonPlan("PATCH", dataPath(values, `sobjects/${sobject(values)}/${externalIdField(values)}/${pathSegment(requiredString(values.externalId, "externalId"))}`), auth, headers, recordBody(values), objectSchema(["id", "success"]));
    case "get-record-by-external-id":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/${externalIdField(values)}/${pathSegment(requiredString(values.externalId, "externalId"))}`), auth, headers, recordQuery(values), objectSchema(["Id"]));
    case "get-deleted-records":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/deleted`), auth, headers, dateRangeQuery(values), objectSchema(["deletedRecords"]));
    case "get-updated-records":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/updated`), auth, headers, dateRangeQuery(values), objectSchema(["ids"]));
    case "get-blob-field":
      return getPlan(dataPath(values, `sobjects/${sobject(values)}/${recordId(values)}/${pathSegment(requiredString(values.fieldName, "fieldName"))}`), auth, headers, {}, objectSchema());
    case "read-records":
      return getPlan(dataPath(values, `composite/sobjects/${sobject(values)}`), auth, headers, {
        ids: optionalCsv(requiredJsonArray(values.ids, "ids")),
        fields: optionalCsv(values.fields),
      }, objectSchema(["results"]));
    case "create-records":
      return jsonPlan("POST", dataPath(values, "composite/sobjects"), auth, headers, recordsBody(values), objectSchema(["hasErrors", "results"]));
    case "update-records":
      return jsonPlan("PATCH", dataPath(values, "composite/sobjects"), auth, headers, recordsBody(values), objectSchema(["hasErrors", "results"]));
    case "upsert-records":
      return jsonPlan("PATCH", dataPath(values, `composite/sobjects/${sobject(values)}/${externalIdField(values)}`), auth, headers, recordsBody(values), objectSchema(["hasErrors", "results"]));
    case "delete-records":
      return jsonPlan("DELETE", dataPath(values, "composite/sobjects"), auth, headers, {}, objectSchema(["hasErrors", "results"]), {
        ids: optionalCsv(requiredJsonArray(values.ids, "ids")),
        allOrNone: values.allOrNone ?? false,
      });
    case "composite":
      return jsonPlan("POST", dataPath(values, "composite"), auth, headers, {
        allOrNone: values.allOrNone ?? false,
        compositeRequest: requiredJsonArray(values.compositeRequest, "compositeRequest"),
      }, objectSchema(["compositeResponse"]));
    case "composite-batch":
      return jsonPlan("POST", dataPath(values, "composite/batch"), auth, headers, {
        haltOnError: values.haltOnError ?? false,
        batchRequests: requiredJsonArray(values.batchRequests, "batchRequests"),
      }, objectSchema(["results"]));
    case "composite-graph":
      return jsonPlan("POST", dataPath(values, "composite/graph"), auth, headers, {
        graphs: requiredJsonArray(values.graphs, "graphs"),
      }, objectSchema(["graphs"]));
    case "composite-tree":
      return jsonPlan("POST", dataPath(values, `composite/tree/${sobject(values)}`), auth, headers, {
        records: requiredJsonArray(values.records, "records"),
      }, objectSchema(["hasErrors", "results"]));
    case "list-ingest-jobs":
      return getPlan(dataPath(values, "jobs/ingest"), auth, headers, { jobType: values.jobType, queryLocator: values.queryLocator }, objectSchema(["records"]));
    case "create-ingest-job":
      return jsonPlan("POST", dataPath(values, "jobs/ingest"), auth, headers, removeEmptyValues({
        object: sobject(values),
        operation: values.operation ?? "insert",
        externalIdFieldName: values.externalIdFieldName,
        contentType: values.contentType ?? "CSV",
        lineEnding: values.lineEnding,
        columnDelimiter: values.columnDelimiter,
      }), objectSchema(["id", "state"]));
    case "get-ingest-job":
      return getPlan(dataPath(values, `jobs/ingest/${jobId(values)}`), auth, headers, {}, objectSchema(["id", "state"]));
    case "upload-ingest-job-data":
      return {
        method: "PUT",
        endpoint: dataPath(values, `jobs/ingest/${jobId(values)}/batches`),
        auth,
        headers: { ...headers, "content-type": "text/csv" },
        body: {},
        bodyValue: requiredString(values.csv, "csv"),
        bodyEncoding: "text",
        responseSchema: objectSchema(),
      };
    case "close-ingest-job":
      return jsonPlan("PATCH", dataPath(values, `jobs/ingest/${jobId(values)}`), auth, headers, { state: "UploadComplete" }, objectSchema(["id", "state"]));
    case "abort-ingest-job":
      return jsonPlan("PATCH", dataPath(values, `jobs/ingest/${jobId(values)}`), auth, headers, { state: "Aborted" }, objectSchema(["id", "state"]));
    case "get-ingest-successful-results":
      return getPlan(dataPath(values, `jobs/ingest/${jobId(values)}/successfulResults`), auth, { accept: "text/csv" }, {}, stringSchema());
    case "get-ingest-failed-results":
      return getPlan(dataPath(values, `jobs/ingest/${jobId(values)}/failedResults`), auth, { accept: "text/csv" }, {}, stringSchema());
    case "get-ingest-unprocessed-records":
      return getPlan(dataPath(values, `jobs/ingest/${jobId(values)}/unprocessedrecords`), auth, { accept: "text/csv" }, {}, stringSchema());
    case "list-query-jobs":
      return getPlan(dataPath(values, "jobs/query"), auth, headers, { queryLocator: values.queryLocator }, objectSchema(["records"]));
    case "create-query-job":
      return jsonPlan("POST", dataPath(values, "jobs/query"), auth, headers, {
        operation: values.operation ?? "query",
        query: requiredString(values.query, "query"),
        contentType: values.contentType ?? "CSV",
        columnDelimiter: values.columnDelimiter,
        lineEnding: values.lineEnding,
      }, objectSchema(["id", "state"]));
    case "get-query-job":
      return getPlan(dataPath(values, `jobs/query/${jobId(values)}`), auth, headers, {}, objectSchema(["id", "state"]));
    case "get-query-job-results":
      return getPlan(dataPath(values, `jobs/query/${jobId(values)}/results`), auth, { accept: "text/csv" }, { locator: values.locator, maxRecords: values.maxRecords }, stringSchema());
    case "abort-query-job":
      return jsonPlan("PATCH", dataPath(values, `jobs/query/${jobId(values)}`), auth, headers, { state: "Aborted" }, objectSchema(["id", "state"]));
    case "delete-query-job":
      return jsonPlan("DELETE", dataPath(values, `jobs/query/${jobId(values)}`), auth, headers, {}, objectSchema());
    case "list-reports":
      return getPlan(dataPath(values, "analytics/reports"), auth, headers, {}, objectSchema(["recentItems"]));
    case "describe-report":
      return getPlan(dataPath(values, `analytics/reports/${reportId(values)}/describe`), auth, headers, {}, objectSchema(["reportMetadata"]));
    case "run-report-sync":
      return jsonPlan("POST", dataPath(values, `analytics/reports/${reportId(values)}`), auth, headers, reportBody(values), objectSchema(["reportMetadata", "factMap"]));
    case "run-report-async":
      return jsonPlan("POST", dataPath(values, `analytics/reports/${reportId(values)}/instances`), auth, headers, reportBody(values), objectSchema(["id", "status"]));
    case "get-report-instance":
      return getPlan(dataPath(values, `analytics/reports/${reportId(values)}/instances/${pathSegment(requiredString(values.instanceId, "instanceId"))}`), auth, headers, {}, objectSchema(["status"]));
    case "delete-report-instance":
      return jsonPlan("DELETE", dataPath(values, `analytics/reports/${reportId(values)}/instances/${pathSegment(requiredString(values.instanceId, "instanceId"))}`), auth, headers, {}, objectSchema());
    case "list-dashboards":
      return getPlan(dataPath(values, "analytics/dashboards"), auth, headers, {}, objectSchema(["dashboards"]));
    case "get-dashboard":
      return getPlan(dataPath(values, `analytics/dashboards/${dashboardId(values)}`), auth, headers, {}, objectSchema(["dashboardMetadata"]));
    case "refresh-dashboard":
      return jsonPlan("PUT", dataPath(values, `analytics/dashboards/${dashboardId(values)}`), auth, headers, {}, objectSchema());
    case "tooling-query":
      return queryPlan(dataPath(values, "tooling/query"), values, auth, headers);
    case "tooling-query-all":
      return queryPlan(dataPath(values, "tooling/queryAll"), values, auth, headers);
    case "tooling-create-record":
      return jsonPlan("POST", dataPath(values, `tooling/sobjects/${toolingObject(values)}`), auth, headers, recordBody(values), objectSchema(["id", "success"]));
    case "tooling-get-record":
      return getPlan(dataPath(values, `tooling/sobjects/${toolingObject(values)}/${recordId(values)}`), auth, headers, recordQuery(values), objectSchema(["Id"]));
    case "tooling-update-record":
      return jsonPlan("PATCH", dataPath(values, `tooling/sobjects/${toolingObject(values)}/${recordId(values)}`), auth, headers, recordBody(values), objectSchema());
    case "tooling-delete-record":
      return jsonPlan("DELETE", dataPath(values, `tooling/sobjects/${toolingObject(values)}/${recordId(values)}`), auth, headers, {}, objectSchema());
    case "tooling-execute-anonymous":
      return getPlan(dataPath(values, "tooling/executeAnonymous"), auth, headers, { anonymousBody: requiredString(values.apex, "apex") }, objectSchema(["compiled", "success"]));
    case "tooling-run-tests-sync":
      return jsonPlan("POST", dataPath(values, "tooling/runTestsSynchronous"), auth, headers, {
        tests: requiredJsonArray(values.tests, "tests"),
      }, objectSchema(["summary"]));
    case "list-chatter-feeds":
      return getPlan(dataPath(values, `chatter/feeds/${pathSegment(optionalString(values.feedType) ?? "news")}/feed-elements`), auth, headers, { pageSize: values.pageSize ?? values.limit }, objectSchema(["elements"]));
    case "get-chatter-feed":
      return getPlan(dataPath(values, `chatter/feeds/${pathSegment(requiredString(values.feedType, "feedType"))}`), auth, headers, {}, objectSchema());
    case "post-feed-item":
      return jsonPlan("POST", dataPath(values, `chatter/feed-elements`), auth, headers, feedItemBody(values), objectSchema(["id"]));
    case "get-feed-element":
      return getPlan(dataPath(values, `chatter/feed-elements/${pathSegment(requiredString(values.feedElementId, "feedElementId"))}`), auth, headers, {}, objectSchema(["id"]));
    case "delete-feed-element":
      return jsonPlan("DELETE", dataPath(values, `chatter/feed-elements/${pathSegment(requiredString(values.feedElementId, "feedElementId"))}`), auth, headers, {}, objectSchema());
    case "add-feed-comment":
      return jsonPlan("POST", dataPath(values, `chatter/feed-elements/${pathSegment(requiredString(values.feedElementId, "feedElementId"))}/capabilities/comments/items`), auth, headers, commentBody(values), objectSchema(["id"]));
    case "delete-feed-comment":
      return jsonPlan("DELETE", dataPath(values, `chatter/comments/${pathSegment(requiredString(values.commentId, "commentId"))}`), auth, headers, {}, objectSchema());
    case "like-feed-element":
      return jsonPlan("POST", dataPath(values, `chatter/feed-elements/${pathSegment(requiredString(values.feedElementId, "feedElementId"))}/capabilities/chatterLikes/items`), auth, headers, {}, objectSchema(["id"]));
    case "unlike-feed-element":
      return jsonPlan("DELETE", dataPath(values, `chatter/likes/${pathSegment(requiredString(values.likeId, "likeId"))}`), auth, headers, {}, objectSchema());
    case "get-event-schema":
      return getPlan(dataPath(values, `event/eventSchema/${pathSegment(requiredString(values.schemaId, "schemaId"))}`), auth, headers, {}, objectSchema());
  }
  throw new Error(`Unsupported Salesforce operation: ${operation.id}`);
}

function standardObjectPlan(
  action: string,
  objectType: string,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeAuthBinding[],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  if (action === "query") return queryPlan(dataPath(values, "query"), { ...values, query: values.query ?? defaultObjectQuery(objectType, values) }, auth, headers);
  if (action === "get") return getPlan(dataPath(values, `sobjects/${objectType}/${recordId(values)}`), auth, headers, recordQuery(values), objectSchema(["Id"]));
  if (action === "create") return jsonPlan("POST", dataPath(values, `sobjects/${objectType}`), auth, headers, recordBody(values), objectSchema(["id", "success"]));
  if (action === "update") return jsonPlan("PATCH", dataPath(values, `sobjects/${objectType}/${recordId(values)}`), auth, headers, recordBody(values), objectSchema());
  if (action === "delete") return jsonPlan("DELETE", dataPath(values, `sobjects/${objectType}/${recordId(values)}`), auth, headers, {}, objectSchema());
  return jsonPlan("PATCH", dataPath(values, `sobjects/${objectType}/${externalIdField(values)}/${pathSegment(requiredString(values.externalId, "externalId"))}`), auth, headers, recordBody(values), objectSchema(["id", "success"]));
}

function queryPlan(endpoint: string, values: Record<string, IntegrationJson>, auth: ConnectorRuntimeAuthBinding[], headers: Record<string, string>): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: { q: requiredString(values.query, "query") },
    body: {},
    responseSchema: objectSchema(["records"]),
    pagination: {
      mode: "next_url",
      itemsPath: "records",
      nextUrlPath: "nextRecordsUrl",
      pageSize: 2000,
      maxPages: 1,
    },
  };
}

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeAuthBinding[],
  headers: Record<string, string>,
  query: Record<string, IntegrationJson | undefined>,
  responseSchema: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]> = objectSchema(),
): ConnectorRuntimeRequestPlan {
  return { method: "GET", endpoint, auth, headers, query: removeEmptyValues(query), body: {}, responseSchema };
}

function jsonPlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeAuthBinding[],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson | undefined>,
  responseSchema: NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]> = objectSchema(),
  query: Record<string, IntegrationJson | undefined> = {},
): ConnectorRuntimeRequestPlan {
  return { method, endpoint, auth, headers, query: removeEmptyValues(query), body: removeEmptyValues(body), responseSchema };
}

function dataPath(values: Record<string, IntegrationJson>, suffix: string): string {
  const version = apiVersion(values);
  return suffix ? `services/data/${version}/${suffix}` : `services/data/${version}`;
}

function apiVersion(values: Record<string, IntegrationJson>): string {
  const version = optionalString(values.apiVersion) ?? DEFAULT_API_VERSION;
  return version.startsWith("v") ? version : `v${version}`;
}

function salesforceRuntimeOperation(operationId: string): SalesforceRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  return slug && SALESFORCE_OPERATION_SET.has(slug) ? slug as SalesforceRuntimeOperation : null;
}

function standardObjectOperation(slug: string): { action: string; objectType: string } | null {
  for (const action of OBJECT_ACTIONS) {
    const prefix = `${action}-`;
    if (!slug.startsWith(prefix)) continue;
    const objectType = SALESFORCE_OBJECT_BY_SINGULAR.get(slug.slice(prefix.length));
    if (objectType) return { action, objectType };
  }
  return null;
}

function sobject(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.objectType ?? values.sobject ?? values.sObject, "objectType"));
}

function toolingObject(values: Record<string, IntegrationJson>): string {
  return pathSegment(optionalString(values.toolingObjectType) ?? requiredString(values.objectType, "objectType"));
}

function recordId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.recordId ?? values.id, "recordId"));
}

function jobId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.jobId, "jobId"));
}

function reportId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.reportId, "reportId"));
}

function dashboardId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(values.dashboardId, "dashboardId"));
}

function externalIdField(values: Record<string, IntegrationJson>): string {
  return pathSegment(optionalString(values.externalIdField ?? values.externalIdFieldName) ?? "External_Id__c");
}

function recordBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  const body = values.fields ?? values.record ?? values.properties;
  if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, IntegrationJson>;
  return { Name: optionalString(values.name) ?? "Sample" };
}

function recordsBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    allOrNone: values.allOrNone ?? false,
    records: requiredJsonArray(values.records, "records"),
  };
}

function recordQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    fields: optionalCsv(values.fields),
  });
}

function dateRangeQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    start: requiredString(values.start, "start"),
    end: requiredString(values.end, "end"),
  };
}

function defaultObjectQuery(objectType: string, values: Record<string, IntegrationJson>): string {
  const fields = optionalCsv(values.fields) ?? "Id,Name";
  const limit = values.limit ?? 100;
  return `SELECT ${fields} FROM ${objectType} LIMIT ${limit}`;
}

function reportBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    reportMetadata: values.reportMetadata,
    includeDetails: values.includeDetails ?? true,
  });
}

function feedItemBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    subjectId: requiredString(values.subjectId, "subjectId"),
    body: {
      messageSegments: [{
        type: "Text",
        text: requiredString(values.text, "text"),
      }],
    },
    feedElementType: values.feedElementType ?? "FeedItem",
  });
}

function commentBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    body: {
      messageSegments: [{
        type: "Text",
        text: requiredString(values.text, "text"),
      }],
    },
  };
}

function objectSchema(requiredPaths?: string[]) {
  return { type: "object" as const, ...(requiredPaths ? { requiredPaths } : {}) };
}

function arraySchema(requiredPaths?: string[]) {
  return { type: "array" as const, ...(requiredPaths ? { requiredPaths } : {}) };
}

function stringSchema() {
  return { type: "string" as const };
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function requiredString(value: IntegrationJson | undefined, field: string): string {
  const candidate = optionalString(value);
  if (candidate) return candidate;
  throw new Error(`Salesforce operation requires ${field}`);
}

function optionalString(value: IntegrationJson | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredJsonArray(value: IntegrationJson | undefined, field: string): IntegrationJson[] {
  if (Array.isArray(value)) return value;
  throw new Error(`Salesforce operation requires ${field}`);
}

function optionalCsv(value: IntegrationJson | undefined): string | undefined {
  if (Array.isArray(value)) return value.map(String).join(",");
  return optionalString(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")) as Record<string, IntegrationJson>;
}
