import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export const SLACK_SOURCE_OPERATION_SLUGS = [
  "event",
  "message",
  "app-mention",
  "reaction-added",
  "reaction-removed",
  "file-shared",
  "file-created",
  "file-deleted",
  "member-joined-channel",
  "member-left-channel",
  "channel-created",
  "channel-archive",
  "channel-unarchive",
  "app-home-opened",
  "team-join",
  "tokens-revoked",
] as const;

export type SlackSourceOperation = typeof SLACK_SOURCE_OPERATION_SLUGS[number];

const SLACK_SOURCE_OPERATION_SET = new Set<string>(SLACK_SOURCE_OPERATION_SLUGS);
const SLACK_SOURCE_ALIASES: Record<string, SlackSourceOperation> = {
  "event-callback": "event",
  "new-message": "message",
};

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
  const resolved = slug ? SLACK_SOURCE_ALIASES[slug] ?? slug : null;
  if (resolved && SLACK_SOURCE_OPERATION_SET.has(resolved)) return resolved as SlackSourceOperation;
  return null;
}
