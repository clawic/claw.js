import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildStripeOperationRequest,
} from "./stripe-operation-executor.ts";

const STRIPE_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "stripe",
    name: "Stripe",
    authFieldNames: ["stripeSecretKey"],
    fields: [{
      name: "stripeSecretKey",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: [
      {
        id: "stripe.action.list-customers",
        appId: "stripe",
        kind: "action",
        name: "List Customers",
        fields: [
          { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["stripeSecretKey"],
      },
      {
        id: "stripe.action.get-customer",
        appId: "stripe",
        kind: "action",
        name: "Get Customer",
        fields: [
          { name: "customerId", type: "string", optional: false },
        ],
        authFieldNames: ["stripeSecretKey"],
      },
      {
        id: "stripe.action.create-customer",
        appId: "stripe",
        kind: "action",
        name: "Create Customer",
        fields: [
          { name: "email", type: "string", optional: true },
          { name: "name", type: "string", optional: true },
        ],
        authFieldNames: ["stripeSecretKey"],
      },
      {
        id: "stripe.action.list-payment-intents",
        appId: "stripe",
        kind: "action",
        name: "List Payment Intents",
        fields: [
          { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
        ],
        authFieldNames: ["stripeSecretKey"],
      },
      {
        id: "stripe.action.get-payment-intent",
        appId: "stripe",
        kind: "action",
        name: "Get Payment Intent",
        fields: [
          { name: "paymentIntentId", type: "string", optional: false },
        ],
        authFieldNames: ["stripeSecretKey"],
      },
      {
        id: "stripe.action.create-payment-intent",
        appId: "stripe",
        kind: "action",
        name: "Create Payment Intent",
        fields: [
          { name: "amount", type: "integer", optional: false },
          { name: "currency", type: "string", optional: false },
          { name: "customerId", type: "string", optional: true },
        ],
        authFieldNames: ["stripeSecretKey"],
      },
    ],
  }],
});

describe("stripe operation runtime", () => {
  it("builds Stripe customer and payment intent request plans", () => {
    const auth = [{ type: "secret" as const, field: "stripeSecretKey", placement: "bearer" as const }];
    const headers = { accept: "application/json" };

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.list-customers"), { limit: 3 }), {
      method: "GET",
      endpoint: "customers",
      auth,
      headers,
      query: { limit: 3 },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["object", "data"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.get-customer"), { customerId: "cus_sample" }), {
      method: "GET",
      endpoint: "customers/cus_sample",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-customer"), {
      email: "person@example.invalid",
      name: "Sample Person",
    }), {
      method: "POST",
      endpoint: "customers",
      auth,
      headers,
      bodyEncoding: "form",
      body: {
        email: "person@example.invalid",
        name: "Sample Person",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.list-payment-intents"), {
      limit: 2,
      customerId: "cus_sample",
    }), {
      method: "GET",
      endpoint: "payment_intents",
      auth,
      headers,
      query: {
        limit: 2,
        customer: "cus_sample",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["object", "data"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.get-payment-intent"), { paymentIntentId: "pi_sample" }), {
      method: "GET",
      endpoint: "payment_intents/pi_sample",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object", "status"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-payment-intent"), {
      amount: 1200,
      currency: "USD",
      customerId: "cus_sample",
      confirm: false,
    }), {
      method: "POST",
      endpoint: "payment_intents",
      auth,
      headers,
      bodyEncoding: "form",
      body: {
        amount: 1200,
        currency: "usd",
        customer: "cus_sample",
        confirm: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object", "status"],
      },
    });
  });

  it("covers Stripe payment operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(STRIPE_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, 6);

    const offline = await verifyConnectorRuntimeOfflineExecutions(STRIPE_CATALOG);
    assert.deepEqual(offline.results.map((result) => result.operationId).sort(), [
      "stripe.action.create-customer",
      "stripe.action.create-payment-intent",
      "stripe.action.get-customer",
      "stripe.action.get-payment-intent",
      "stripe.action.list-customers",
      "stripe.action.list-payment-intents",
    ]);
  });
});

function operation(operationId: string) {
  const found = STRIPE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
