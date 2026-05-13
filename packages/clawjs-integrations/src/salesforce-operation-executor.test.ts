import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildSalesforceOperationRequest,
  isSalesforceActionOperationSupported,
  SALESFORCE_ACTION_SLUGS,
  SALESFORCE_STANDARD_OBJECTS,
} from "./salesforce-operation-executor.ts";
import type { ConnectorOperationDefinition } from "./types.ts";

const OBJECT_SINGULARS = new Set(SALESFORCE_STANDARD_OBJECTS.map((object) => object.singular));
const OBJECT_ACTIONS = new Set(["query", "get", "create", "update", "delete", "upsert"]);
const SALESFORCE_ACTIONS = SALESFORCE_ACTION_SLUGS.map((slug) => action(slug, fieldsForOperation(slug)));

const SALESFORCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "salesforce",
    name: "Salesforce",
    authFieldNames: ["salesforceAccessToken"],
    fields: [{
      name: "salesforceAccessToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: SALESFORCE_ACTIONS,
  }],
});

const auth = [{ type: "secret" as const, field: "salesforceAccessToken", placement: "bearer" as const }];
const headers = { accept: "application/json" };

describe("salesforce operation runtime", () => {
  it("builds Salesforce REST, composite, bulk, and analytics request plans", () => {
    assert.equal(isSalesforceActionOperationSupported("salesforce.action.create-account"), true);
    assert.equal(isSalesforceActionOperationSupported("salesforce.action.create-query-job"), true);
    assert.equal(isSalesforceActionOperationSupported("salesforce.action.fly-to-moon"), false);

    assert.deepEqual(buildSalesforceOperationRequest(operation("salesforce.action.query"), {
      query: "SELECT Id, Name FROM Account LIMIT 10",
    }), {
      method: "GET",
      endpoint: "services/data/v66.0/query",
      auth,
      headers,
      query: {
        q: "SELECT Id, Name FROM Account LIMIT 10",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["records"],
      },
      pagination: {
        mode: "next_url",
        itemsPath: "records",
        nextUrlPath: "nextRecordsUrl",
        pageSize: 2000,
        maxPages: 1,
      },
    });

    assert.deepEqual(buildSalesforceOperationRequest(operation("salesforce.action.create-account"), {
      fields: {
        Name: "Acme",
      },
    }), {
      method: "POST",
      endpoint: "services/data/v66.0/sobjects/Account",
      auth,
      headers,
      query: {},
      body: {
        Name: "Acme",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "success"],
      },
    });

    assert.deepEqual(buildSalesforceOperationRequest(operation("salesforce.action.composite-batch"), {
      batchRequests: [{
        method: "GET",
        url: "v66.0/limits",
      }],
      haltOnError: true,
    }), {
      method: "POST",
      endpoint: "services/data/v66.0/composite/batch",
      auth,
      headers,
      query: {},
      body: {
        haltOnError: true,
        batchRequests: [{
          method: "GET",
          url: "v66.0/limits",
        }],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["results"],
      },
    });

    assert.deepEqual(buildSalesforceOperationRequest(operation("salesforce.action.upload-ingest-job-data"), {
      jobId: "750xx000000001",
      csv: "Name\nAcme",
    }), {
      method: "PUT",
      endpoint: "services/data/v66.0/jobs/ingest/750xx000000001/batches",
      auth,
      headers: {
        accept: "application/json",
        "content-type": "text/csv",
      },
      body: {},
      bodyValue: "Name\nAcme",
      bodyEncoding: "text",
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildSalesforceOperationRequest(operation("salesforce.action.run-report-sync"), {
      reportId: "00Oxx000000001",
      includeDetails: false,
    }), {
      method: "POST",
      endpoint: "services/data/v66.0/analytics/reports/00Oxx000000001",
      auth,
      headers,
      query: {},
      body: {
        includeDetails: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["reportMetadata", "factMap"],
      },
    });
  });

  it("covers Salesforce operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(SALESFORCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, SALESFORCE_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(SALESFORCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      SALESFORCE_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string): ConnectorOperationDefinition {
  const found = SALESFORCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function action(slug: string, fields: ConnectorOperationDefinition["fields"]): ConnectorOperationDefinition {
  return {
    id: `salesforce.action.${slug}`,
    appId: "salesforce",
    kind: "action",
    name: titleize(slug),
    fields,
    authFieldNames: ["salesforceAccessToken"],
  };
}

function fieldsForOperation(slug: string): ConnectorOperationDefinition["fields"] {
  const objectAction = standardObjectAction(slug);
  if (objectAction) return objectFields(objectAction.action);
  if (slug === "list-api-versions" || slug === "get-api-resources" || slug === "get-limits" || slug === "list-tabs" || slug === "list-themes" || slug === "describe-global" || slug === "list-sobjects" || slug === "list-reports" || slug === "list-dashboards") return [];
  if (slug === "get-record-counts") return [arrayField("sObjects", ["Account", "Contact"])];
  if (slug === "list-app-menu-items") return [optionalStringField("menuType", "AppSwitcher")];
  if (slug === "list-recent-items") return [integerField("limit", true, { default: 25, min: 1, max: 200 })];
  if (slug === "describe-sobject" || slug === "get-sobject-layouts" || slug === "get-sobject-compact-layouts") return [stringField("objectType", "Account")];
  if (slug === "query" || slug === "query-all" || slug === "tooling-query" || slug === "tooling-query-all") return [stringField("query", "SELECT Id, Name FROM Account LIMIT 10")];
  if (slug === "query-more") return [stringField("nextRecordsUrl", "/services/data/v66.0/query/01gxx000000001-2000")];
  if (slug === "search" || slug === "parameterized-search") return [stringField("search", "FIND {Acme}")];
  if (slug === "create-record") return [stringField("objectType", "Account"), objectField("fields", { Name: "Acme" })];
  if (slug === "get-record" || slug === "delete-record") return [stringField("objectType", "Account"), stringField("recordId", "001xx000000001")];
  if (slug === "update-record") return [stringField("objectType", "Account"), stringField("recordId", "001xx000000001"), objectField("fields", { Name: "Acme" })];
  if (slug === "upsert-record" || slug === "get-record-by-external-id") return [stringField("objectType", "Account"), stringField("externalIdField", "External_Id__c"), stringField("externalId", "external-1"), objectField("fields", { Name: "Acme" })];
  if (slug === "get-deleted-records" || slug === "get-updated-records") return [stringField("objectType", "Account"), stringField("start", "2026-05-01T00:00:00+00:00"), stringField("end", "2026-05-02T00:00:00+00:00")];
  if (slug === "get-blob-field") return [stringField("objectType", "Attachment"), stringField("recordId", "00Pxx000000001"), stringField("fieldName", "Body")];
  if (slug === "read-records" || slug === "delete-records") return [stringField("objectType", "Account"), arrayField("ids", ["001xx000000001"])];
  if (slug === "create-records" || slug === "update-records" || slug === "composite-tree") return [stringField("objectType", "Account"), arrayField("records", [{ attributes: { type: "Account" }, Name: "Acme" }])];
  if (slug === "upsert-records") return [stringField("objectType", "Account"), stringField("externalIdField", "External_Id__c"), arrayField("records", [{ attributes: { type: "Account" }, External_Id__c: "external-1", Name: "Acme" }])];
  if (slug === "composite") return [arrayField("compositeRequest", [{ method: "GET", url: "/services/data/v66.0/limits", referenceId: "limits" }])];
  if (slug === "composite-batch") return [arrayField("batchRequests", [{ method: "GET", url: "v66.0/limits" }])];
  if (slug === "composite-graph") return [arrayField("graphs", [{ graphId: "graph1", compositeRequest: [{ method: "GET", url: "/services/data/v66.0/limits", referenceId: "limits" }] }])];
  if (slug === "list-ingest-jobs" || slug === "list-query-jobs") return [];
  if (slug === "create-ingest-job") return [stringField("objectType", "Account"), optionalStringField("operation", "insert")];
  if (slug === "upload-ingest-job-data") return [stringField("jobId", "750xx000000001"), stringField("csv", "Name\nAcme")];
  if (slug.startsWith("get-ingest-") || slug === "get-ingest-job" || slug === "close-ingest-job" || slug === "abort-ingest-job" || slug === "get-query-job" || slug === "get-query-job-results" || slug === "abort-query-job" || slug === "delete-query-job") return [stringField("jobId", "750xx000000001")];
  if (slug === "create-query-job") return [stringField("query", "SELECT Id, Name FROM Account")];
  if (slug === "describe-report" || slug === "run-report-sync" || slug === "run-report-async") return [stringField("reportId", "00Oxx000000001")];
  if (slug === "get-report-instance" || slug === "delete-report-instance") return [stringField("reportId", "00Oxx000000001"), stringField("instanceId", "0LGxx000000001")];
  if (slug === "get-dashboard" || slug === "refresh-dashboard") return [stringField("dashboardId", "01Zxx000000001")];
  if (slug === "tooling-create-record") return [stringField("objectType", "ApexClass"), objectField("fields", { Name: "SampleClass", Body: "public class SampleClass {}" })];
  if (slug === "tooling-get-record" || slug === "tooling-delete-record") return [stringField("objectType", "ApexClass"), stringField("recordId", "01pxx000000001")];
  if (slug === "tooling-update-record") return [stringField("objectType", "ApexClass"), stringField("recordId", "01pxx000000001"), objectField("fields", { Body: "public class SampleClass {}" })];
  if (slug === "tooling-execute-anonymous") return [stringField("apex", "System.debug('sample');")];
  if (slug === "tooling-run-tests-sync") return [arrayField("tests", [{ className: "SampleTest" }])];
  if (slug === "list-chatter-feeds") return [optionalStringField("feedType", "news")];
  if (slug === "get-chatter-feed") return [stringField("feedType", "news")];
  if (slug === "post-feed-item") return [stringField("subjectId", "005xx000000001"), stringField("text", "Sample update")];
  if (slug === "get-feed-element" || slug === "delete-feed-element" || slug === "add-feed-comment" || slug === "like-feed-element") return [stringField("feedElementId", "0D5xx000000001"), stringField("text", "Sample comment", true)];
  if (slug === "delete-feed-comment") return [stringField("commentId", "0D7xx000000001")];
  if (slug === "unlike-feed-element") return [stringField("likeId", "0D8xx000000001")];
  if (slug === "get-event-schema") return [stringField("schemaId", "4d0xx000000001")];
  return [];
}

function standardObjectAction(slug: string): { action: string } | null {
  const [action, ...rest] = slug.split("-");
  if (!OBJECT_ACTIONS.has(action) || !OBJECT_SINGULARS.has(rest.join("-"))) return null;
  return { action };
}

function objectFields(actionName: string): ConnectorOperationDefinition["fields"] {
  if (actionName === "query") return [arrayField("fields", ["Id", "Name"]), integerField("limit", true, { default: 100, min: 1, max: 2000 })];
  if (actionName === "get" || actionName === "delete") return [stringField("recordId", "001xx000000001")];
  if (actionName === "create") return [objectField("fields", { Name: "Acme" })];
  if (actionName === "update") return [stringField("recordId", "001xx000000001"), objectField("fields", { Name: "Acme" })];
  return [stringField("externalIdField", "External_Id__c"), stringField("externalId", "external-1"), objectField("fields", { Name: "Acme" })];
}

function stringField(name: string, defaultValue = "sample", optional = false) {
  return { name, type: "string", optional, default: defaultValue };
}

function optionalStringField(name: string, defaultValue = "sample") {
  return stringField(name, defaultValue, true);
}

function integerField(name: string, optional: boolean, options: { default: number; min?: number; max?: number }) {
  return { name, type: "integer", optional, ...options };
}

function objectField(name: string, defaultValue: Record<string, unknown>) {
  return { name, type: "object", optional: false, default: defaultValue };
}

function arrayField(name: string, defaultValue: unknown[]) {
  return { name, type: "array", optional: false, default: defaultValue };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
