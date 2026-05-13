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
  buildHubSpotSourcePlan,
  HUBSPOT_SOURCE_SLUGS,
  isHubSpotSourceOperationSupported,
} from "./hubspot-source.ts";

const HUBSPOT_SOURCES = HUBSPOT_SOURCE_SLUGS.map((slug) => source(`hubspot.source.${slug}`, titleize(slug)));

const HUBSPOT_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "hubspot",
    name: "HubSpot",
    authFieldNames: [],
    fields: [],
    operations: HUBSPOT_SOURCES,
  }],
});

describe("hubspot webhook sources", () => {
  it("builds HubSpot webhook source plans", () => {
    assert.equal(isHubSpotSourceOperationSupported("hubspot.source.contact-property-change"), true);
    assert.equal(isHubSpotSourceOperationSupported("hubspot.source.fly-to-moon"), false);
    assert.deepEqual(buildHubSpotSourcePlan(operation("hubspot.source.contact-event")), {
      delivery: "webhook",
      dedupe: "eventId",
      hooks: [],
    });
  });

  it("exposes registered HubSpot webhook source plans", () => {
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation("hubspot.source.deal-event")).sourcePlan, {
      delivery: "webhook",
      dedupe: "eventId",
      hooks: [],
    });
  });

  it("extracts HubSpot webhook payload arrays", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("hubspot.source.contact-event"),
      payload: [{
        eventId: "101",
        subscriptionType: "contact.creation",
        objectId: 202,
      }],
    });
    assert.deepEqual(result.events, [{
      eventId: "101",
      subscriptionType: "contact.creation",
      objectId: 202,
    }]);
  });

  it("covers HubSpot webhook sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(HUBSPOT_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, HUBSPOT_SOURCES.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(HUBSPOT_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      HUBSPOT_SOURCES.map((sourceOperation) => sourceOperation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = HUBSPOT_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "hubspot",
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
