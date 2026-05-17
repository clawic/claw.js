import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const AIRTABLE_SOURCE_SLUGS = [
  "record-created",
  "record-updated",
  "record-deleted",
  "comment-created",
  "comment-updated",
  "comment-deleted",
  "webhook-payload",
] as const;

type AirtableSourceOperation = typeof AIRTABLE_SOURCE_SLUGS[number];

const AIRTABLE_SOURCE_SET = new Set<string>(AIRTABLE_SOURCE_SLUGS);

export function isAirtableSourceOperationSupported(operationId: string): boolean {
  return airtableSourceOperation(operationId) !== null;
}

export function buildAirtableSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = airtableSourceOperation(operation.id);
  if (!sourceOperation) throw new Error(`Unsupported Airtable source operation: ${operation.id}`);
  return {
    delivery: "webhook",
    dedupe: "eventId",
    hooks: [],
    eventsPath: "events",
  };
}

function airtableSourceOperation(operationId: string): AirtableSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug && AIRTABLE_SOURCE_SET.has(slug)) return slug as AirtableSourceOperation;
  if (slug === "record" || slug === "record-change") return "record-updated";
  if (slug === "record-create") return "record-created";
  if (slug === "record-delete") return "record-deleted";
  if (slug === "comment" || slug === "comment-change") return "comment-updated";
  if (slug === "comment-create") return "comment-created";
  if (slug === "comment-delete") return "comment-deleted";
  if (slug === "payload") return "webhook-payload";
  return null;
}
