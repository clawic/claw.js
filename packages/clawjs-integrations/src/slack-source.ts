import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export type SlackSourceOperation =
  | "event"
  | "message"
  | "app-mention"
  | "reaction-added"
  | "file-shared";

export function isSlackSourceOperationSupported(operationId: string): boolean {
  return slackSourceOperation(operationId) !== null;
}

export function buildSlackSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = slackSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported Slack source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "event_id",
    hooks: [],
    eventsPath: "event",
  };
}

function slackSourceOperation(operationId: string): SlackSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (slug === "event" || slug === "event-callback") return "event";
  if (slug === "message" || slug === "new-message") return "message";
  if (slug === "app-mention") return "app-mention";
  if (slug === "reaction-added") return "reaction-added";
  if (slug === "file-shared") return "file-shared";
  return null;
}
