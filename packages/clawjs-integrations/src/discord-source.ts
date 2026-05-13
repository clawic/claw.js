import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export type DiscordSourceOperation =
  | "event"
  | "message-create"
  | "message-update"
  | "message-delete"
  | "guild-emojis-update"
  | "guild-member-add"
  | "guild-member-remove"
  | "guild-scheduled-event-create"
  | "guild-scheduled-event-update"
  | "guild-scheduled-event-delete"
  | "interaction-create"
  | "thread-create"
  | "reaction-add";

const DISCORD_SOURCE_OPERATIONS = new Set<DiscordSourceOperation>([
  "event",
  "message-create",
  "message-update",
  "message-delete",
  "guild-emojis-update",
  "guild-member-add",
  "guild-member-remove",
  "guild-scheduled-event-create",
  "guild-scheduled-event-update",
  "guild-scheduled-event-delete",
  "interaction-create",
  "thread-create",
  "reaction-add",
]);

export function isDiscordSourceOperationSupported(operationId: string): boolean {
  return discordSourceOperation(operationId) !== null;
}

export function buildDiscordSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = discordSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported Discord source operation: ${operation.id}`);
  }
  return {
    delivery: "webhook",
    dedupe: "id",
    hooks: [],
  };
}

function discordSourceOperation(operationId: string): DiscordSourceOperation | null {
  const slug = operationId.split(".").at(-1);
  if (DISCORD_SOURCE_OPERATIONS.has(slug as DiscordSourceOperation)) return slug as DiscordSourceOperation;
  if (slug === "new-message" || slug === "message") return "message-create";
  if (slug === "member-add") return "guild-member-add";
  if (slug === "member-remove") return "guild-member-remove";
  if (slug === "interaction") return "interaction-create";
  if (slug === "reaction") return "reaction-add";
  return null;
}
