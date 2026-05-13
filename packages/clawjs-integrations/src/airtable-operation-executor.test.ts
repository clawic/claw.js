import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildAirtableOperationRequest,
  AIRTABLE_ACTION_SPECS,
  isAirtableActionOperationSupported,
} from "./airtable-operation-executor.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import type { ConnectorOperationDefinition } from "./types.ts";

const AIRTABLE_ACTIONS = AIRTABLE_ACTION_SPECS.map((spec) => ({
  id: `airtable.action.${spec.slug}`,
  appId: "airtable",
  kind: "action" as const,
  name: titleize(spec.slug),
  fields: spec.fields,
  authFieldNames: ["airtableAccessToken"],
}));

const AIRTABLE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "airtable",
    name: "Airtable",
    authFieldNames: ["airtableAccessToken"],
    fields: [{
      name: "airtableAccessToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: AIRTABLE_ACTIONS,
  }],
});

const auth = [{ type: "secret" as const, field: "airtableAccessToken", placement: "bearer" as const }];
const headers = { accept: "application/json" };

describe("airtable operation runtime", () => {
  it("builds Airtable records, metadata, comments, and webhooks plans", () => {
    assert.equal(isAirtableActionOperationSupported("airtable.action.list-records"), true);
    assert.equal(isAirtableActionOperationSupported("airtable.action.create-base"), true);
    assert.equal(isAirtableActionOperationSupported("airtable.action.fly-to-moon"), false);

    assert.deepEqual(buildAirtableOperationRequest(operation("airtable.action.list-records"), {
      baseId: "appBase123",
      tableIdOrName: "tblTable123",
      pageSize: 25,
      offset: "itrOffset123",
      view: "Grid view",
      fields: ["Name"],
      filterByFormula: "{Status} = 'Open'",
      sort: [{ field: "Name", direction: "asc" }],
      cellFormat: "json",
      timeZone: "UTC",
      userLocale: "en-us",
      returnFieldsByFieldId: false,
    }), {
      method: "GET",
      endpoint: "v0/appBase123/tblTable123",
      auth,
      headers,
      query: {
        pageSize: 25,
        offset: "itrOffset123",
        view: "Grid view",
        fields: ["Name"],
        filterByFormula: "{Status} = 'Open'",
        sort: [{ field: "Name", direction: "asc" }],
        cellFormat: "json",
        timeZone: "UTC",
        userLocale: "en-us",
        returnFieldsByFieldId: false,
      },
      querySerialization: {
        fields: { style: "form", explode: true },
        records: { style: "form", explode: true },
        sort: { style: "form", explode: true },
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["records"],
      },
      pagination: {
        mode: "cursor",
        itemsPath: "records",
        nextCursorPath: "offset",
        cursorParam: "offset",
        limitParam: "pageSize",
        pageSize: 100,
        maxPages: 1,
      },
    });

    assert.deepEqual(buildAirtableOperationRequest(operation("airtable.action.create-record"), {
      baseId: "appBase123",
      tableIdOrName: "tblTable123",
      fields: { Name: "Sample" },
      typecast: false,
      returnFieldsByFieldId: false,
    }), {
      method: "POST",
      endpoint: "v0/appBase123/tblTable123",
      auth,
      headers,
      query: {},
      body: {
        fields: { Name: "Sample" },
        typecast: false,
        returnFieldsByFieldId: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "fields"],
      },
    });

    assert.deepEqual(buildAirtableOperationRequest(operation("airtable.action.create-base"), {
      name: "Sample Base",
      workspaceId: "wspWorkspace123",
      tables: [{
        name: "Tasks",
        fields: [{ name: "Name", type: "singleLineText" }],
      }],
    }), {
      method: "POST",
      endpoint: "v0/meta/bases",
      auth,
      headers,
      query: {},
      body: {
        name: "Sample Base",
        workspaceId: "wspWorkspace123",
        tables: [{
          name: "Tasks",
          fields: [{ name: "Name", type: "singleLineText" }],
        }],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name", "tables"],
      },
    });

    assert.deepEqual(buildAirtableOperationRequest(operation("airtable.action.create-webhook"), {
      baseId: "appBase123",
      notificationUrl: "https://example.invalid/airtable/webhook",
      specification: { options: { filters: { dataTypes: ["tableData"] } } },
    }), {
      method: "POST",
      endpoint: "v0/bases/appBase123/webhooks",
      auth,
      headers,
      query: {},
      body: {
        notificationUrl: "https://example.invalid/airtable/webhook",
        specification: { options: { filters: { dataTypes: ["tableData"] } } },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "macSecretBase64", "expirationTime"],
      },
    });
  });

  it("covers Airtable actions with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(AIRTABLE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, AIRTABLE_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(AIRTABLE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      AIRTABLE_ACTIONS.map((action) => action.id).sort(),
    );
  });
});

function operation(operationId: string): ConnectorOperationDefinition {
  const found = AIRTABLE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
