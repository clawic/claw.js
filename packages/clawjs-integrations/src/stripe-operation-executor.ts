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
  | "create-payment-intent";

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
  }
}

function listPlan(
  endpoint: "customers" | "payment_intents",
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

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ""),
  ) as Record<string, IntegrationJson>;
}
