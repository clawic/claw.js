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
  buildGoogleSourcePlan,
  GOOGLE_SOURCE_SLUGS,
  isGoogleSourceOperationSupported,
} from "./google-source.ts";

const GOOGLE_SOURCES = GOOGLE_SOURCE_SLUGS.map((slug) => source(`google.source.${slug}`, titleize(slug)));

const GOOGLE_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "google",
    name: "Google",
    authFieldNames: [],
    fields: [],
    operations: GOOGLE_SOURCES,
  }],
});

describe("google event sources", () => {
  it("builds Google event source plans", () => {
    assert.equal(isGoogleSourceOperationSupported("google.source.drive-change"), true);
    assert.equal(isGoogleSourceOperationSupported("google.source.fly-to-moon"), false);
    assert.deepEqual(buildGoogleSourcePlan(operation("google.source.drive-change")), {
      delivery: "webhook",
      dedupe: "eventId",
      hooks: [],
      eventsPath: "events",
    });
  });

  it("exposes registered Google event source plans", () => {
    assert.deepEqual(buildConnectorOperationRuntimePlan(operation("google.source.gmail-message")).sourcePlan, {
      delivery: "webhook",
      dedupe: "eventId",
      hooks: [],
      eventsPath: "events",
    });
  });

  it("extracts Google event payload arrays", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation("google.source.calendar-event"),
      payload: {
        events: [{
          eventId: "evt-123",
          resourceId: "calendar-resource",
          kind: "calendar#event",
        }],
      },
    });
    assert.deepEqual(result.events, [{
      eventId: "evt-123",
      resourceId: "calendar-resource",
      kind: "calendar#event",
    }]);
  });

  it("covers Google event sources with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(GOOGLE_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, GOOGLE_SOURCES.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(GOOGLE_SOURCE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      GOOGLE_SOURCES.map((sourceOperation) => sourceOperation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = GOOGLE_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function source(id: string, name: string) {
  return {
    id,
    appId: "google",
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
