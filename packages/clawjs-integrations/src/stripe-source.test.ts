import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  handleConnectorRuntimeWebhook,
} from "./runtime-webhook.ts";
import {
  buildStripeSourcePlan,
} from "./stripe-source.ts";

const STRIPE_SOURCE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "stripe",
    name: "Stripe",
    authFieldNames: [],
    fields: [],
    operations: [{
      id: "stripe.source.event",
      appId: "stripe",
      kind: "source",
      name: "Event",
      fields: [],
      authFieldNames: [],
      runtime: {
        hasRun: false,
        hasHooks: false,
        hasAdditionalProps: false,
        hasMethods: false,
        dedupe: "id",
      },
      source: {
        delivery: "webhook",
        usesTimer: false,
        usesHttp: true,
        usesServiceDb: false,
      },
    }],
  }],
});

describe("stripe webhook sources", () => {
  it("builds Stripe webhook source plans", () => {
    assert.deepEqual(buildStripeSourcePlan(operation()), {
      delivery: "webhook",
      dedupe: "id",
      hooks: [],
    });
  });

  it("extracts Stripe webhook payloads as source events", () => {
    const result = handleConnectorRuntimeWebhook({
      operation: operation(),
      payload: {
        id: "evt_sample",
        object: "event",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_sample",
            object: "checkout.session",
          },
        },
      },
    });
    assert.deepEqual(result.events, [{
      id: "evt_sample",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_sample",
          object: "checkout.session",
        },
      },
    }]);
  });

  it("covers Stripe webhook events with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(STRIPE_SOURCE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 1);

    const offline = await verifyConnectorRuntimeOfflineExecutions(STRIPE_SOURCE_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId), [
      "stripe.source.event",
    ]);
  });
});

function operation() {
  const found = STRIPE_SOURCE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === "stripe.source.event");
  assert.ok(found);
  return found;
}
