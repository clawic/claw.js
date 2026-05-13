import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildConnectorOperationRuntimePlan,
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";
import {
  buildSalesforceSourcePlan,
  isSalesforceSourceOperationSupported,
  SALESFORCE_SOURCE_SLUGS,
} from "./salesforce-source.ts";

const SALESFORCE_SOURCES = SALESFORCE_SOURCE_SLUGS.map((slug) => source(`salesforce.source.${slug}`, titleize(slug)));

const SALESFORCE_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "salesforce",
    name: "Salesforce",
    authFieldNames: [],
    fields: [],
    operations: SALESFORCE_SOURCES,
  }],
});

describe("salesforce event sources", () => {
  it("builds Salesforce event source plans", () => {
    assert.equal(isSalesforceSourceOperationSupported("salesforce.source.account-change-event"), true);
    assert.equal(isSalesforceSourceOperationSupported("salesforce.source.fly-to-moon"), false);
    assert.deepEqual(buildSalesforceSourcePlan(operation("salesforce.source.account-change-event")), {
      delivery: "webhook",
      dedupe: "replayId",
      hooks: [],
      eventsPath: "events",
    });
  });

  it("exposes registered Salesforce event source plans", () => {
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation("salesforce.source.platform-event")).sourcePlan, {
      delivery: "webhook",
      dedupe: "replayId",
      hooks: [],
      eventsPath: "events",
    });
  });

  it("extracts Salesforce event payload arrays", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("salesforce.source.change-data-capture"),
      payload: {
        events: [{
          replayId: "101",
          event: { type: "ChangeEvent" },
          payload: { ChangeEventHeader: { entityName: "Account" } },
        }],
      },
    });
    assert.deepEqual(result.events, [{
      replayId: "101",
      event: { type: "ChangeEvent" },
      payload: { ChangeEventHeader: { entityName: "Account" } },
    }]);
  });

  it("covers Salesforce event sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(SALESFORCE_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, SALESFORCE_SOURCES.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(SALESFORCE_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      SALESFORCE_SOURCES.map((sourceOperation) => sourceOperation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = SALESFORCE_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "salesforce",
    kind: "source" as const,
    name,
    fields: [],
    authFieldNames: [],
    runtime: {
      hasRun: false,
      hasHooks: false,
      hasAdditionalProps: false,
      hasMethods: false,
      dedupe: "replayId",
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
