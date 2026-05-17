import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const HUBSPOT_SOURCE_SLUGS = [
  "event",
  "contact-event",
  "company-event",
  "deal-event",
  "ticket-event",
  "product-event",
  "line-item-event",
  "conversation-event",
] as const;

type HubSpotSourceOperation = typeof HUBSPOT_SOURCE_SLUGS[number];

const HUBSPOT_SOURCE_OPERATIONS = new Set<string>(HUBSPOT_SOURCE_SLUGS);

export function isHubSpotSourceOperationSupported(operationId: string): boolean {
  return hubSpotSourceOperation(operationId) !== null;
}

export function buildHubSpotSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = hubSpotSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported HubSpot source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "eventId",
    hooks: [],
  };
}

function hubSpotSourceOperation(operationId: string): HubSpotSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug && HUBSPOT_SOURCE_OPERATIONS.has(slug)) return slug as HubSpotSourceOperation;
  if (slug === "contact" || slug === "contact-property-change") return "contact-event";
  if (slug === "company" || slug === "company-property-change") return "company-event";
  if (slug === "deal" || slug === "deal-property-change") return "deal-event";
  if (slug === "ticket" || slug === "ticket-property-change") return "ticket-event";
  return null;
}
