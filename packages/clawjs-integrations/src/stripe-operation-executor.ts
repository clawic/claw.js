import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type StripeRuntimeOperation =
  | "list-customers"
  | "get-customer"
  | "create-customer"
  | "list-payment-intents"
  | "get-payment-intent"
  | "create-payment-intent"
  | "list-products"
  | "get-product"
  | "create-product"
  | "update-product"
  | "delete-product"
  | "search-products"
  | "list-prices"
  | "get-price"
  | "create-price"
  | "update-price"
  | "search-prices"
  | "list-subscriptions"
  | "get-subscription"
  | "create-subscription"
  | "update-subscription"
  | "cancel-subscription"
  | "resume-subscription"
  | "search-subscriptions"
  | "list-checkout-sessions"
  | "get-checkout-session"
  | "create-checkout-session"
  | "expire-checkout-session"
  | "list-checkout-session-line-items"
  | "list-refunds"
  | "get-refund"
  | "create-refund"
  | "update-refund"
  | "list-charges"
  | "get-charge"
  | "capture-charge";

export function isStripeActionOperationSupported(operationId: string): boolean {
  return stripeRuntimeOperation(operationId) !== null;
}

export function buildStripeOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = stripeRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported Stripe operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const headers = { accept: "application/json" };

  switch (runtimeOperation) {
    case "list-customers":
      return listPlan("customers", values, auth, headers);
    case "get-customer":
      return {
        method: "GET",
        endpoint: `customers/${pathSegment(requiredString(firstValue(values.customerId, values.customer), "customerId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "create-customer":
      return {
        method: "POST",
        endpoint: "customers",
        auth,
        headers,
        bodyEncoding: "form",
        body: removeEmptyValues({
          email: values.email,
          name: values.name,
          description: values.description,
          phone: values.phone,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object"],
        },
      };
    case "list-payment-intents":
      return listPlan("payment_intents", values, auth, headers);
    case "get-payment-intent":
      return {
        method: "GET",
        endpoint: `payment_intents/${pathSegment(requiredString(firstValue(values.paymentIntentId, values.payment_intent), "paymentIntentId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "create-payment-intent":
      return {
        method: "POST",
        endpoint: "payment_intents",
        auth,
        headers,
        bodyEncoding: "form",
        body: removeEmptyValues({
          amount: requiredInteger(values.amount, "amount"),
          currency: requiredString(values.currency, "currency").toLowerCase(),
          customer: values.customerId ?? values.customer,
          description: values.description,
          confirm: values.confirm,
          receipt_email: values.receiptEmail ?? values.receipt_email,
        }),
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "list-products":
      return listPlan("products", values, auth, headers);
    case "get-product":
      return retrievePlan("products", firstValue(values.productId, values.product), "productId", auth, headers);
    case "create-product":
      return postFormPlan("products", removeEmptyValues({
        name: requiredString(values.name, "name"),
        description: values.description,
        active: values.active,
        default_price_data: values.defaultPriceData ?? values.default_price_data,
        images: values.images,
        metadata: values.metadata,
        tax_code: values.taxCode ?? values.tax_code,
        url: values.url,
      }), auth, headers, ["id", "object"]);
    case "update-product":
      return postFormPlan(`products/${pathSegment(requiredString(firstValue(values.productId, values.product), "productId"))}`, removeEmptyValues({
        name: values.name,
        description: values.description,
        active: values.active,
        default_price: values.defaultPrice ?? values.default_price,
        images: values.images,
        metadata: values.metadata,
        tax_code: values.taxCode ?? values.tax_code,
        url: values.url,
      }), auth, headers, ["id", "object"]);
    case "delete-product":
      return {
        method: "DELETE",
        endpoint: `products/${pathSegment(requiredString(firstValue(values.productId, values.product), "productId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "deleted"],
        },
      };
    case "search-products":
      return searchPlan("products/search", values, auth, headers);
    case "list-prices":
      return listPlan("prices", values, auth, headers);
    case "get-price":
      return retrievePlan("prices", firstValue(values.priceId, values.price), "priceId", auth, headers);
    case "create-price":
      return postFormPlan("prices", removeEmptyValues({
        currency: requiredString(values.currency, "currency").toLowerCase(),
        product: requiredString(firstValue(values.productId, values.product), "productId"),
        unit_amount: values.unitAmount ?? values.unit_amount,
        unit_amount_decimal: values.unitAmountDecimal ?? values.unit_amount_decimal,
        recurring: values.recurring,
        billing_scheme: values.billingScheme ?? values.billing_scheme,
        nickname: values.nickname,
        tax_behavior: values.taxBehavior ?? values.tax_behavior,
        lookup_key: values.lookupKey ?? values.lookup_key,
        metadata: values.metadata,
      }), auth, headers, ["id", "object"]);
    case "update-price":
      return postFormPlan(`prices/${pathSegment(requiredString(firstValue(values.priceId, values.price), "priceId"))}`, removeEmptyValues({
        active: values.active,
        nickname: values.nickname,
        lookup_key: values.lookupKey ?? values.lookup_key,
        metadata: values.metadata,
        tax_behavior: values.taxBehavior ?? values.tax_behavior,
      }), auth, headers, ["id", "object"]);
    case "search-prices":
      return searchPlan("prices/search", values, auth, headers);
    case "list-subscriptions":
      return listPlan("subscriptions", values, auth, headers);
    case "get-subscription":
      return retrievePlan("subscriptions", firstValue(values.subscriptionId, values.subscription), "subscriptionId", auth, headers);
    case "create-subscription":
      return postFormPlan("subscriptions", removeEmptyValues({
        customer: requiredString(firstValue(values.customerId, values.customer), "customerId"),
        items: requiredJson(values.items, "items"),
        collection_method: values.collectionMethod ?? values.collection_method,
        description: values.description,
        metadata: values.metadata,
        payment_behavior: values.paymentBehavior ?? values.payment_behavior,
        trial_end: values.trialEnd ?? values.trial_end,
        trial_period_days: values.trialPeriodDays ?? values.trial_period_days,
      }), auth, headers, ["id", "object", "status"]);
    case "update-subscription":
      return postFormPlan(`subscriptions/${pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"))}`, removeEmptyValues({
        items: values.items,
        metadata: values.metadata,
        pause_collection: values.pauseCollection ?? values.pause_collection,
        proration_behavior: values.prorationBehavior ?? values.proration_behavior,
        trial_end: values.trialEnd ?? values.trial_end,
      }), auth, headers, ["id", "object", "status"]);
    case "cancel-subscription":
      return {
        method: "DELETE",
        endpoint: `subscriptions/${pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"))}`,
        auth,
        headers,
        body: {},
        responseSchema: {
          type: "object",
          requiredPaths: ["id", "object", "status"],
        },
      };
    case "resume-subscription":
      return postFormPlan(`subscriptions/${pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"))}/resume`, removeEmptyValues({
        billing_cycle_anchor: values.billingCycleAnchor ?? values.billing_cycle_anchor,
        proration_behavior: values.prorationBehavior ?? values.proration_behavior,
      }), auth, headers, ["id", "object", "status"]);
    case "search-subscriptions":
      return searchPlan("subscriptions/search", values, auth, headers);
    case "list-checkout-sessions":
      return listPlan("checkout/sessions", values, auth, headers);
    case "get-checkout-session":
      return retrievePlan("checkout/sessions", firstValue(values.sessionId, values.checkoutSessionId, values.session), "sessionId", auth, headers, ["id", "object", "mode"]);
    case "create-checkout-session":
      return postFormPlan("checkout/sessions", removeEmptyValues({
        mode: requiredString(values.mode, "mode"),
        success_url: requiredString(firstValue(values.successUrl, values.success_url), "successUrl"),
        cancel_url: values.cancelUrl ?? values.cancel_url,
        line_items: values.lineItems ?? values.line_items,
        customer: values.customerId ?? values.customer,
        client_reference_id: values.clientReferenceId ?? values.client_reference_id,
        metadata: values.metadata,
        payment_intent_data: values.paymentIntentData ?? values.payment_intent_data,
        subscription_data: values.subscriptionData ?? values.subscription_data,
      }), auth, headers, ["id", "object", "mode"]);
    case "expire-checkout-session":
      return postFormPlan(`checkout/sessions/${pathSegment(requiredString(firstValue(values.sessionId, values.checkoutSessionId, values.session), "sessionId"))}/expire`, {}, auth, headers, ["id", "object", "mode"]);
    case "list-checkout-session-line-items":
      return listPlan(`checkout/sessions/${pathSegment(requiredString(firstValue(values.sessionId, values.checkoutSessionId, values.session), "sessionId"))}/line_items`, values, auth, headers);
    case "list-refunds":
      return listPlan("refunds", values, auth, headers);
    case "get-refund":
      return retrievePlan("refunds", firstValue(values.refundId, values.refund), "refundId", auth, headers);
    case "create-refund":
      return postFormPlan("refunds", removeEmptyValues({
        charge: values.chargeId ?? values.charge,
        payment_intent: values.paymentIntentId ?? values.payment_intent,
        amount: values.amount,
        reason: values.reason,
        metadata: values.metadata,
      }), auth, headers, ["id", "object", "status"]);
    case "update-refund":
      return postFormPlan(`refunds/${pathSegment(requiredString(firstValue(values.refundId, values.refund), "refundId"))}`, removeEmptyValues({
        metadata: values.metadata,
      }), auth, headers, ["id", "object", "status"]);
    case "list-charges":
      return listPlan("charges", values, auth, headers);
    case "get-charge":
      return retrievePlan("charges", firstValue(values.chargeId, values.charge), "chargeId", auth, headers);
    case "capture-charge":
      return postFormPlan(`charges/${pathSegment(requiredString(firstValue(values.chargeId, values.charge), "chargeId"))}/capture`, removeEmptyValues({
        amount: values.amount,
        receipt_email: values.receiptEmail ?? values.receipt_email,
        statement_descriptor: values.statementDescriptor ?? values.statement_descriptor,
      }), auth, headers, ["id", "object", "status"]);
  }
}

function listPlan(
  endpoint: string,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: removeEmptyValues({
      limit: values.limit ?? 10,
      starting_after: values.startingAfter ?? values.starting_after,
      ending_before: values.endingBefore ?? values.ending_before,
      customer: values.customerId ?? values.customer,
      active: values.active,
      product: values.productId ?? values.product,
      price: values.priceId ?? values.price,
      subscription: values.subscriptionId ?? values.subscription,
      payment_intent: values.paymentIntentId ?? values.payment_intent,
      status: values.status,
    }),
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths: ["object", "data"],
    },
  };
}

function retrievePlan(
  endpoint: string,
  id: IntegrationJson,
  name: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  requiredPaths: string[] = ["id", "object"],
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint: `${endpoint}/${pathSegment(requiredString(id, name))}`,
    auth,
    headers,
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths,
    },
  };
}

function postFormPlan(
  endpoint: string,
  body: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  requiredPaths: string[],
): ConnectorRuntimeRequestPlan {
  return {
    method: "POST",
    endpoint,
    auth,
    headers,
    bodyEncoding: "form",
    body,
    responseSchema: {
      type: "object",
      requiredPaths,
    },
  };
}

function searchPlan(
  endpoint: string,
  values: Record<string, IntegrationJson>,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: removeEmptyValues({
      query: requiredString(values.query, "query"),
      limit: values.limit ?? 10,
      page: values.page,
    }),
    body: {},
    responseSchema: {
      type: "object",
      requiredPaths: ["object", "data"],
    },
  };
}

function stripeRuntimeOperation(operationId: string): StripeRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "list-customers") return "list-customers";
  if (slug === "get-customer" || slug === "retrieve-customer") return "get-customer";
  if (slug === "create-customer") return "create-customer";
  if (slug === "list-payment-intents") return "list-payment-intents";
  if (slug === "get-payment-intent" || slug === "retrieve-payment-intent") return "get-payment-intent";
  if (slug === "create-payment-intent") return "create-payment-intent";
  if (slug === "list-products") return "list-products";
  if (slug === "get-product" || slug === "retrieve-product") return "get-product";
  if (slug === "create-product") return "create-product";
  if (slug === "update-product") return "update-product";
  if (slug === "delete-product") return "delete-product";
  if (slug === "search-products") return "search-products";
  if (slug === "list-prices") return "list-prices";
  if (slug === "get-price" || slug === "retrieve-price") return "get-price";
  if (slug === "create-price") return "create-price";
  if (slug === "update-price") return "update-price";
  if (slug === "search-prices") return "search-prices";
  if (slug === "list-subscriptions") return "list-subscriptions";
  if (slug === "get-subscription" || slug === "retrieve-subscription") return "get-subscription";
  if (slug === "create-subscription") return "create-subscription";
  if (slug === "update-subscription") return "update-subscription";
  if (slug === "cancel-subscription") return "cancel-subscription";
  if (slug === "resume-subscription") return "resume-subscription";
  if (slug === "search-subscriptions") return "search-subscriptions";
  if (slug === "list-checkout-sessions") return "list-checkout-sessions";
  if (slug === "get-checkout-session" || slug === "retrieve-checkout-session") return "get-checkout-session";
  if (slug === "create-checkout-session") return "create-checkout-session";
  if (slug === "expire-checkout-session") return "expire-checkout-session";
  if (slug === "list-checkout-session-line-items") return "list-checkout-session-line-items";
  if (slug === "list-refunds") return "list-refunds";
  if (slug === "get-refund" || slug === "retrieve-refund") return "get-refund";
  if (slug === "create-refund") return "create-refund";
  if (slug === "update-refund") return "update-refund";
  if (slug === "list-charges") return "list-charges";
  if (slug === "get-charge" || slug === "retrieve-charge") return "get-charge";
  if (slug === "capture-charge") return "capture-charge";
  return null;
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`Stripe ${name} is required`);
}

function requiredInteger(value: IntegrationJson, name: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  throw new Error(`Stripe ${name} must be an integer`);
}

function requiredJson(value: IntegrationJson | undefined, name: string): IntegrationJson {
  if (value == null || value === "") throw new Error(`Stripe ${name} is required`);
  return value;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
