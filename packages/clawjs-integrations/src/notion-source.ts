import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export type NotionSourceOperation =
  | "page-event"
  | "data-source-event"
  | "comment-event"
  | "file-upload-event"
  | "view-event";

export function isNotionSourceOperationSupported(operationId: string): boolean {
  return notionSourceOperation(operationId) !== null;
}

export function buildNotionSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = notionSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported Notion source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "id",
    hooks: [],
  };
}

function notionSourceOperation(operationId: string): NotionSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "page-event" || slug === "page-updated") return "page-event";
  if (slug === "data-source-event" || slug === "database-event") return "data-source-event";
  if (slug === "comment-event" || slug === "comment-created") return "comment-event";
  if (slug === "file-upload-event") return "file-upload-event";
  if (slug === "view-event") return "view-event";
  return null;
}
