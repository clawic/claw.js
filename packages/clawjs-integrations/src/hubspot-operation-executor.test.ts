import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildHubSpotOperationRequest,
  HUBSPOT_ACTION_SLUGS,
  HUBSPOT_CRM_OBJECTS,
  isHubSpotActionOperationSupported,
} from "./hubspot-operation-executor.ts";
import type { ConnectorOperationDefinition } from "./types.ts";

const HUBSPOT_CRM_OBJECT_SET = new Set<string>(HUBSPOT_CRM_OBJECTS);
const HUBSPOT_ACTIONS = HUBSPOT_ACTION_SLUGS.map((slug) => operationDefinition(slug, fieldsForOperation(slug)));

const HUBSPOT_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "hubspot",
    name: "HubSpot",
    authFieldNames: ["hubspotAccessToken"],
    fields: [{
      name: "hubspotAccessToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: HUBSPOT_ACTIONS,
  }],
});

const auth = [{ type: "secret" as const, field: "hubspotAccessToken", placement: "bearer" as const }];
const headers = { accept: "application/json" };

describe("hubspot operation runtime", () => {
  it("builds HubSpot CRM, association, and marketing request plans", () => {
    assert.equal(isHubSpotActionOperationSupported("hubspot.action.create-contacts"), true);
    assert.equal(isHubSpotActionOperationSupported("hubspot.action.batch-read-associations"), true);
    assert.equal(isHubSpotActionOperationSupported("hubspot.action.fly-to-moon"), false);

    assert.deepEqual(buildHubSpotOperationRequest(operation("list-contacts"), {
      limit: 50,
      after: "100",
      properties: ["email", "firstname"],
    }), {
      method: "GET",
      endpoint: "crm/v3/objects/contacts",
      auth,
      headers,
      query: {
        limit: 50,
        after: "100",
        properties: ["email", "firstname"],
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["results"],
      },
      pagination: {
        mode: "cursor",
        itemsPath: "results",
        nextCursorPath: "paging.next.after",
        cursorParam: "after",
        limitParam: "limit",
        pageSize: 50,
        maxPages: 1,
      },
    });

    assert.deepEqual(buildHubSpotOperationRequest(operation("create-deals"), {
      properties: {
        dealname: "Implementation",
        dealstage: "appointmentscheduled",
        pipeline: "default",
      },
    }), {
      method: "POST",
      endpoint: "crm/v3/objects/deals",
      auth,
      headers,
      body: {
        properties: {
          dealname: "Implementation",
          dealstage: "appointmentscheduled",
          pipeline: "default",
        },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "properties"],
      },
    });

    assert.deepEqual(buildHubSpotOperationRequest(operation("associate-records"), {
      fromObjectType: "contacts",
      fromRecordId: "101",
      toObjectType: "companies",
      toRecordId: "202",
      associationTypeId: "1",
    }), {
      method: "PUT",
      endpoint: "crm/v3/objects/contacts/101/associations/companies/202/1",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildHubSpotOperationRequest(operation("create-marketing-email"), {
      name: "Launch",
      subject: "Launch update",
      fromName: "Team",
      fromEmail: "team@example.invalid",
    }), {
      method: "POST",
      endpoint: "marketing/v3/marketing-emails",
      auth,
      headers,
      body: {
        name: "Launch",
        subject: "Launch update",
        fromName: "Team",
        fromEmail: "team@example.invalid",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });
  });

  it("covers HubSpot operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(HUBSPOT_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, HUBSPOT_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(HUBSPOT_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      HUBSPOT_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(slug: string): ConnectorOperationDefinition {
  const operationId = `hubspot.action.${slug}`;
  const found = HUBSPOT_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function operationDefinition(slug: string, fields: ConnectorOperationDefinition["fields"]) {
  return {
    id: `hubspot.action.${slug}`,
    appId: "hubspot",
    kind: "action" as const,
    name: titleize(slug),
    fields,
    authFieldNames: ["hubspotAccessToken"],
  };
}

function fieldsForOperation(slug: string): ConnectorOperationDefinition["fields"] {
  const crm = crmAction(slug);
  if (crm) return crmFields(crm.action);
  if (slug.startsWith("batch-") && slug.endsWith("-records")) return [stringField("objectType"), arrayField("inputs", [{ id: "101" }])];
  if (slug === "get-association-labels") return [stringField("fromObjectType"), stringField("toObjectType")];
  if (slug === "associate-records" || slug === "remove-association") {
    return [stringField("fromObjectType"), stringField("fromRecordId"), stringField("toObjectType"), stringField("toRecordId"), stringField("associationTypeId")];
  }
  if (slug.startsWith("batch-") && slug.endsWith("-associations")) return [stringField("fromObjectType"), stringField("toObjectType"), arrayField("inputs", [{ from: { id: "101" }, to: { id: "202" }, type: "contact_to_company" }])];
  if (slug === "list-properties") return [stringField("objectType"), ...pagingFields()];
  if (slug === "get-property" || slug === "archive-property") return [stringField("objectType"), stringField("propertyName")];
  if (slug === "create-property") return [stringField("objectType"), stringField("name"), stringField("label"), stringField("type"), stringField("fieldType")];
  if (slug === "update-property") return [stringField("objectType"), stringField("propertyName"), optionalStringField("label", "Sample")];
  if (slug === "list-owners") return pagingFields();
  if (slug === "get-owner") return [stringField("ownerId")];
  if (slug === "list-pipelines") return [stringField("objectType")];
  if (slug === "get-pipeline" || slug === "archive-pipeline") return [stringField("objectType"), stringField("pipelineId")];
  if (slug === "create-pipeline") return [stringField("objectType"), stringField("label")];
  if (slug === "update-pipeline") return [stringField("objectType"), stringField("pipelineId"), optionalStringField("label", "Sample")];
  if (slug === "create-pipeline-stage") return [stringField("objectType"), stringField("pipelineId"), stringField("label")];
  if (slug === "update-pipeline-stage") return [stringField("objectType"), stringField("pipelineId"), stringField("stageId"), optionalStringField("label", "Sample")];
  if (slug === "archive-pipeline-stage") return [stringField("objectType"), stringField("pipelineId"), stringField("stageId")];
  if (slug === "list-files" || slug === "list-folders" || slug === "list-forms" || slug === "list-marketing-emails" || slug === "list-event-types") return pagingFields();
  if (slug === "get-file" || slug === "archive-file") return [stringField("fileId")];
  if (slug === "upload-file") return [stringField("file"), optionalStringField("fileName", "sample.txt"), objectField("options", { access: "PRIVATE" })];
  if (slug === "get-folder" || slug === "archive-folder") return [stringField("folderId")];
  if (slug === "create-folder") return [stringField("name")];
  if (slug === "get-form" || slug === "list-form-submissions") return [stringField("formId"), ...pagingFields()];
  if (slug === "get-marketing-email" || slug === "archive-marketing-email" || slug === "publish-marketing-email" || slug === "unpublish-marketing-email") return [stringField("emailId")];
  if (slug === "create-marketing-email") return [stringField("name")];
  if (slug === "update-marketing-email") return [stringField("emailId"), optionalStringField("name", "Sample")];
  if (slug === "list-event-occurrences") return [optionalStringField("eventType", "sample.event"), optionalStringField("objectType", "contacts"), ...pagingFields()];
  if (slug === "list-webhook-subscriptions") return [stringField("appId")];
  if (slug === "create-webhook-subscription") return [stringField("appId"), stringField("subscriptionType")];
  if (slug === "update-webhook-subscription") return [stringField("appId"), stringField("subscriptionId"), optionalStringField("subscriptionType", "contact.creation")];
  if (slug === "delete-webhook-subscription") return [stringField("appId"), stringField("subscriptionId")];
  return [];
}

function crmFields(action: string): ConnectorOperationDefinition["fields"] {
  if (action === "list") return [arrayField("properties", ["email"]), ...pagingFields()];
  if (action === "get" || action === "archive") return [stringField("recordId")];
  if (action === "search") return [optionalStringField("query", "sample"), arrayField("properties", ["email"]), ...pagingFields()];
  if (action === "create") return [objectField("properties", { name: "sample" })];
  if (action === "update") return [stringField("recordId"), objectField("properties", { name: "sample" })];
  return [];
}

function crmAction(slug: string): { action: string; object: string } | null {
  for (const action of ["list", "get", "search", "create", "update", "archive"]) {
    const prefix = `${action}-`;
    if (!slug.startsWith(prefix)) continue;
    const object = slug.slice(prefix.length);
    if (HUBSPOT_CRM_OBJECT_SET.has(object)) return { action, object };
  }
  return null;
}

function pagingFields(): ConnectorOperationDefinition["fields"] {
  return [
    integerField("limit", 100, true, 100),
    optionalStringField("after", "100"),
  ];
}

function stringField(name: string): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "string", optional: false };
}

function optionalStringField(name: string, defaultValue: string): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "string", optional: true, default: defaultValue };
}

function integerField(name: string, min = 1, optional = false, max?: number): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "integer", optional, min, ...(optional ? { default: min } : {}), ...(max ? { max } : {}) };
}

function arrayField(name: string, defaultValue: unknown[]): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "array", optional: false, default: defaultValue as never };
}

function objectField(name: string, defaultValue: Record<string, unknown>): ConnectorOperationDefinition["fields"][number] {
  return { name, type: "object", optional: false, default: defaultValue as never };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
