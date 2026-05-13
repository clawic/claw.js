import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildAirtableSourcePlan,
  AIRTABLE_SOURCE_SLUGS,
  isAirtableSourceOperationSupported,
} from "./airtable-source.ts";
import {
  buildConnectorOperationRuntimePlan,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";

const AIRTABLE_SOURCES = AIRTABLE_SOURCE_SLUGS.map((slug) => source(`airtable.source.${slug}`, titleize(slug)));

const AIRTABLE_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "airtable",
    name: "Airtable",
    authFieldNames: [],
    fields: [],
    operations: AIRTABLE_SOURCES,
  }],
});

describe("airtable event sources", () => {
  it("builds Airtable event source plans", () => {
    assert.equal(isAirtableSourceOperationSupported("airtable.source.record-created"), true);
    assert.equal(isAirtableSourceOperationSupported("airtable.source.fly-to-moon"), false);
    assert.deepEqual(buildAirtableSourcePlan(operation("airtable.source.record-created")), {
      delivery: "webhook",
      dedupe: "eventId",
      hooks: [],
      eventsPath: "events",
    });
  });

  it("exposes registered Airtable event source plans", () => {
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation("airtable.source.webhook-payload")).sourcePlan, {
      delivery: "webhook",
      dedupe: "eventId",
      hooks: [],
      eventsPath: "events",
    });
  });

  it("extracts Airtable webhook payload arrays", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("airtable.source.record-updated"),
      payload: {
        events: [{
          eventId: "evt-123",
          baseId: "appBase123",
          tableId: "tblTable123",
          recordId: "recRecord123",
        }],
      },
    });
    assert.deepEqual(result.events, [{
      eventId: "evt-123",
      baseId: "appBase123",
      tableId: "tblTable123",
      recordId: "recRecord123",
    }]);
  });

  it("covers Airtable event sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(AIRTABLE_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, AIRTABLE_SOURCES.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(AIRTABLE_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      AIRTABLE_SOURCES.map((sourceOperation) => sourceOperation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = AIRTABLE_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "airtable",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe: "eventId",
    },
    source: {
      delivery: "webhook" as const,
      usesTimer: false,
      usesHttp: true,
      usesServiceDb: false,
    },
  };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
