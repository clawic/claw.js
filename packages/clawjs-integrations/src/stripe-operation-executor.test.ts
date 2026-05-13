import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildStripeOperationRequest,
  STRIPE_EXTRA_ACTION_SPECS,
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
      action("stripe.action.list-products", "List Products", [
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.get-product", "Get Product", [
        { name: "productId", type: "string", optional: false },
      ]),
      action("stripe.action.create-product", "Create Product", [
        { name: "name", type: "string", optional: false },
      ]),
      action("stripe.action.update-product", "Update Product", [
        { name: "productId", type: "string", optional: false },
        { name: "name", type: "string", optional: true },
      ]),
      action("stripe.action.delete-product", "Delete Product", [
        { name: "productId", type: "string", optional: false },
      ]),
      action("stripe.action.search-products", "Search Products", [
        { name: "query", type: "string", optional: false },
      ]),
      action("stripe.action.list-prices", "List Prices", [
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.get-price", "Get Price", [
        { name: "priceId", type: "string", optional: false },
      ]),
      action("stripe.action.create-price", "Create Price", [
        { name: "currency", type: "string", optional: false },
        { name: "productId", type: "string", optional: false },
        { name: "unitAmount", type: "integer", optional: false },
      ]),
      action("stripe.action.update-price", "Update Price", [
        { name: "priceId", type: "string", optional: false },
        { name: "nickname", type: "string", optional: true },
      ]),
      action("stripe.action.search-prices", "Search Prices", [
        { name: "query", type: "string", optional: false },
      ]),
      action("stripe.action.list-subscriptions", "List Subscriptions", [
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.get-subscription", "Get Subscription", [
        { name: "subscriptionId", type: "string", optional: false },
      ]),
      action("stripe.action.create-subscription", "Create Subscription", [
        { name: "customerId", type: "string", optional: false },
        { name: "items", type: "array", optional: false, default: [{ price: "price_sample" }] },
      ]),
      action("stripe.action.update-subscription", "Update Subscription", [
        { name: "subscriptionId", type: "string", optional: false },
        { name: "items", type: "array", optional: true, default: [{ id: "si_sample", price: "price_sample" }] },
      ]),
      action("stripe.action.cancel-subscription", "Cancel Subscription", [
        { name: "subscriptionId", type: "string", optional: false },
      ]),
      action("stripe.action.resume-subscription", "Resume Subscription", [
        { name: "subscriptionId", type: "string", optional: false },
      ]),
      action("stripe.action.search-subscriptions", "Search Subscriptions", [
        { name: "query", type: "string", optional: false },
      ]),
      action("stripe.action.list-checkout-sessions", "List Checkout Sessions", [
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.get-checkout-session", "Get Checkout Session", [
        { name: "sessionId", type: "string", optional: false },
      ]),
      action("stripe.action.create-checkout-session", "Create Checkout Session", [
        { name: "mode", type: "string", optional: false, default: "payment" },
        { name: "successUrl", type: "string", optional: false, default: "https://example.invalid/success" },
        { name: "lineItems", type: "array", optional: true, default: [{ price: "price_sample", quantity: 1 }] },
      ]),
      action("stripe.action.expire-checkout-session", "Expire Checkout Session", [
        { name: "sessionId", type: "string", optional: false },
      ]),
      action("stripe.action.list-checkout-session-line-items", "List Checkout Session Line Items", [
        { name: "sessionId", type: "string", optional: false },
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.list-refunds", "List Refunds", [
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.get-refund", "Get Refund", [
        { name: "refundId", type: "string", optional: false },
      ]),
      action("stripe.action.create-refund", "Create Refund", [
        { name: "paymentIntentId", type: "string", optional: false },
        { name: "amount", type: "integer", optional: true },
      ]),
      action("stripe.action.update-refund", "Update Refund", [
        { name: "refundId", type: "string", optional: false },
        { name: "metadata", type: "object", optional: true, default: { order_id: "sample" } },
      ]),
      action("stripe.action.list-charges", "List Charges", [
        { name: "limit", type: "integer", optional: true, default: 10, min: 1 },
      ]),
      action("stripe.action.get-charge", "Get Charge", [
        { name: "chargeId", type: "string", optional: false },
      ]),
      action("stripe.action.capture-charge", "Capture Charge", [
        { name: "chargeId", type: "string", optional: false },
        { name: "amount", type: "integer", optional: true },
      ]),
      ...STRIPE_EXTRA_ACTION_SPECS.map((spec) => action(`stripe.action.${spec.slug}`, titleize(spec.slug), spec.fields)),
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

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.confirm-payment-intent"), {
      paymentIntentId: "pi_sample",
      payment_method: "pm_sample",
      return_url: "https://example.invalid/return",
    }), {
      method: "POST",
      endpoint: "payment_intents/pi_sample/confirm",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        payment_method: "pm_sample",
        return_url: "https://example.invalid/return",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object", "status"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-setup-intent"), {
      customer: "cus_sample",
      payment_method: "pm_sample",
      usage: "off_session",
      confirm: false,
    }), {
      method: "POST",
      endpoint: "setup_intents",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        customer: "cus_sample",
        payment_method: "pm_sample",
        usage: "off_session",
        confirm: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object", "status"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.pay-invoice"), {
      invoiceId: "in_sample",
      payment_method: "pm_sample",
    }), {
      method: "POST",
      endpoint: "invoices/in_sample/pay",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        payment_method: "pm_sample",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-file"), {
      file: "sample-file",
      purpose: "business_logo",
      file_link_data: { create: true },
    }), {
      method: "POST",
      endpoint: "files",
      auth,
      headers,
      query: {},
      bodyEncoding: "multipart",
      body: {
        file: "sample-file",
        purpose: "business_logo",
        file_link_data: { create: true },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-file-link"), {
      file: "file_sample",
      expires_at: 1893456000,
      metadata: { order_id: "sample" },
    }), {
      method: "POST",
      endpoint: "file_links",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        file: "file_sample",
        expires_at: 1893456000,
        metadata: { order_id: "sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-token"), {
      cvc_update: { cvc: "123" },
    }), {
      method: "POST",
      endpoint: "tokens",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        cvc_update: { cvc: "123" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-plan"), {
      currency: "usd",
      interval: "month",
      amount: 1200,
      product: "prod_sample",
      nickname: "Sample plan",
      metadata: { order_id: "sample" },
    }), {
      method: "POST",
      endpoint: "plans",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        currency: "usd",
        interval: "month",
        amount: 1200,
        product: "prod_sample",
        nickname: "Sample plan",
        metadata: { order_id: "sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-shipping-rate"), {
      display_name: "Sample shipping",
      fixed_amount: { amount: 500, currency: "usd" },
      tax_behavior: "exclusive",
      tax_code: "txcd_sample",
      metadata: { order_id: "sample" },
    }), {
      method: "POST",
      endpoint: "shipping_rates",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        display_name: "Sample shipping",
        fixed_amount: { amount: 500, currency: "usd" },
        tax_behavior: "exclusive",
        tax_code: "txcd_sample",
        metadata: { order_id: "sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-application-fee-refund"), {
      applicationFeeId: "fee_sample",
      amount: 500,
      metadata: { order_id: "sample" },
    }), {
      method: "POST",
      endpoint: "application_fees/fee_sample/refunds",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        amount: 500,
        metadata: { order_id: "sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-topup"), {
      amount: 1200,
      currency: "usd",
      description: "Sample topup",
      metadata: { order_id: "sample" },
      source: "src_sample",
      statement_descriptor: "Sample",
      transfer_group: "group_sample",
    }), {
      method: "POST",
      endpoint: "topups",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        amount: 1200,
        currency: "usd",
        description: "Sample topup",
        metadata: { order_id: "sample" },
        source: "src_sample",
        statement_descriptor: "Sample",
        transfer_group: "group_sample",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-payment-link"), {
      line_items: [{ price: "price_sample", quantity: 1 }],
      metadata: { order_id: "sample" },
      allow_promotion_codes: true,
      submit_type: "pay",
    }), {
      method: "POST",
      endpoint: "payment_links",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        line_items: [{ price: "price_sample", quantity: 1 }],
        metadata: { order_id: "sample" },
        allow_promotion_codes: true,
        submit_type: "pay",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-billing-portal-configuration"), {
      features: { customer_update: { enabled: true } },
      default_return_url: "https://example.invalid/return",
      metadata: { order_id: "sample" },
      name: "Sample portal",
    }), {
      method: "POST",
      endpoint: "billing_portal/configurations",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        features: { customer_update: { enabled: true } },
        default_return_url: "https://example.invalid/return",
        metadata: { order_id: "sample" },
        name: "Sample portal",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-credit-note"), {
      invoice: "in_sample",
      amount: 500,
      memo: "Sample credit",
      metadata: { order_id: "sample" },
      reason: "order_change",
    }), {
      method: "POST",
      endpoint: "credit_notes",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        invoice: "in_sample",
        amount: 500,
        memo: "Sample credit",
        metadata: { order_id: "sample" },
        reason: "order_change",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.preview-credit-note"), {
      invoice: "in_sample",
      amount: 500,
      memo: "Sample credit",
      reason: "order_change",
    }), {
      method: "GET",
      endpoint: "credit_notes/preview",
      auth,
      headers,
      query: {
        invoice: "in_sample",
        amount: 500,
        memo: "Sample credit",
        reason: "order_change",
      },
      bodyEncoding: undefined,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-quote"), {
      customer: "cus_sample",
      line_items: [{ price: "price_sample", quantity: 1 }],
      description: "Sample quote",
      metadata: { order_id: "sample" },
    }), {
      method: "POST",
      endpoint: "quotes",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        customer: "cus_sample",
        line_items: [{ price: "price_sample", quantity: 1 }],
        description: "Sample quote",
        metadata: { order_id: "sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.download-quote-pdf"), {
      quote: "qt_sample",
    }), {
      method: "GET",
      endpoint: "quotes/qt_sample/pdf",
      auth,
      headers,
      query: {},
      bodyEncoding: undefined,
      responseBodyEncoding: "base64",
      body: {},
      responseSchema: {
        type: "string",
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.create-subscription-schedule"), {
      customer: "cus_sample",
      start_date: 1893456000,
      phases: [{ items: [{ price: "price_sample", quantity: 1 }] }],
      end_behavior: "release",
      metadata: { order_id: "sample" },
    }), {
      method: "POST",
      endpoint: "subscription_schedules",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        customer: "cus_sample",
        start_date: 1893456000,
        phases: [{ items: [{ price: "price_sample", quantity: 1 }] }],
        end_behavior: "release",
        metadata: { order_id: "sample" },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "object", "status"],
      },
    });

    assert.deepEqual(buildStripeOperationRequest(operation("stripe.action.cancel-subscription-schedule"), {
      schedule: "sub_sched_sample",
      invoice_now: false,
      prorate: true,
    }), {
      method: "POST",
      endpoint: "subscription_schedules/sub_sched_sample/cancel",
      auth,
      headers,
      query: {},
      bodyEncoding: "form",
      body: {
        invoice_now: false,
        prorate: true,
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
    assert.equal(coverage.summary.implemented, STRIPE_CATALOG.apps[0]?.operations.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(STRIPE_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      STRIPE_CATALOG.apps[0]?.operations.map((item) => item.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = STRIPE_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function action(id: string, name: string, fields: Array<{
  name: string;
  type: string;
  optional: boolean;
  default?: unknown;
  min?: number;
  max?: number;
}>) {
  return {
    id,
    appId: "stripe",
    kind: "action" as const,
    name,
    fields,
    authFieldNames: ["stripeSecretKey"],
  };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}
