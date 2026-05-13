import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const SALESFORCE_SOURCE_SLUGS = [
  "platform-event",
  "change-data-capture",
  "account-change-event",
  "contact-change-event",
  "lead-change-event",
  "opportunity-change-event",
  "case-change-event",
  "user-change-event",
  "generic-streaming-event",
  "real-time-event-monitoring",
] as const;

export type SalesforceSourceOperation = typeof SALESFORCE_SOURCE_SLUGS[number];

const SALESFORCE_SOURCE_OPERATIONS = new Set<string>(SALESFORCE_SOURCE_SLUGS);

export function isSalesforceSourceOperationSupported(operationId: string): boolean {
  return salesforceSourceOperation(operationId) !== null;
}

export function buildSalesforceSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = salesforceSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported Salesforce source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "replayId",
    hooks: [],
    eventsPath: "events",
  };
}

function salesforceSourceOperation(operationId: string): SalesforceSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug && SALESFORCE_SOURCE_OPERATIONS.has(slug)) return slug as SalesforceSourceOperation;
  if (slug === "account") return "account-change-event";
  if (slug === "contact") return "contact-change-event";
  if (slug === "lead") return "lead-change-event";
  if (slug === "opportunity") return "opportunity-change-event";
  if (slug === "case") return "case-change-event";
  return null;
}
