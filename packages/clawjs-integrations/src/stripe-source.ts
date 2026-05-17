import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

type StripeSourceOperation = "event";

export function isStripeSourceOperationSupported(operationId: string): boolean {
  return stripeSourceOperation(operationId) !== null;
}

export function buildStripeSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = stripeSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported Stripe source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "id",
    hooks: [],
  };
}

function stripeSourceOperation(operationId: string): StripeSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "event" || slug === "new-event") return "event";
  return null;
}
