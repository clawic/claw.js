import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const GOOGLE_SOURCE_SLUGS = [
  "drive-change",
  "gmail-message",
  "calendar-event",
  "calendar-list-change",
  "form-response",
  "task-change",
  "sheets-change",
] as const;

export type GoogleSourceOperation = typeof GOOGLE_SOURCE_SLUGS[number];

const GOOGLE_SOURCE_SET = new Set<string>(GOOGLE_SOURCE_SLUGS);

export function isGoogleSourceOperationSupported(operationId: string): boolean {
  return googleSourceOperation(operationId) !== null;
}

export function buildGoogleSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = googleSourceOperation(operation.id);
  if (!sourceOperation) throw new Error(`Unsupported Google source operation: ${operation.id}`);
  return {
    delivery: "webhook",
    dedupe: "eventId",
    hooks: [],
    eventsPath: "events",
  };
}

function googleSourceOperation(operationId: string): GoogleSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug && GOOGLE_SOURCE_SET.has(slug)) return slug as GoogleSourceOperation;
  if (slug === "drive") return "drive-change";
  if (slug === "gmail") return "gmail-message";
  if (slug === "calendar") return "calendar-event";
  if (slug === "form") return "form-response";
  if (slug === "task") return "task-change";
  if (slug === "sheet") return "sheets-change";
  return null;
}
