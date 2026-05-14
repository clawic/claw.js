import type {
  ConnectorRuntimeSourcePlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
} from "./types.ts";

export type DiscordSourceOperation =
  | "event"
  | "application-authorized"
  | "application-deauthorized"
  | "entitlement-create"
  | "entitlement-update"
  | "entitlement-delete"
  | "lobby-message-create"
  | "lobby-message-update"
  | "lobby-message-delete"
  | "game-direct-message-create"
  | "game-direct-message-update"
  | "game-direct-message-delete"
  | "channel-create"
  | "channel-update"
  | "channel-delete"
  | "channel-pins-update"
  | "message-create"
  | "message-update"
  | "message-delete"
  | "message-delete-bulk"
  | "message-reaction-remove"
  | "message-reaction-remove-all"
  | "message-reaction-remove-emoji"
  | "typing-start"
  | "message-poll-vote-add"
  | "message-poll-vote-remove"
  | "guild-audit-log-entry-create"
  | "auto-moderation-rule-create"
  | "auto-moderation-rule-update"
  | "auto-moderation-rule-delete"
  | "auto-moderation-action-execution"
  | "guild-emojis-update"
  | "guild-stickers-update"
  | "guild-member-add"
  | "guild-member-remove"
  | "guild-scheduled-event-create"
  | "guild-scheduled-event-update"
  | "guild-scheduled-event-delete"
  | "guild-soundboard-sound-create"
  | "guild-soundboard-sound-update"
  | "guild-soundboard-sound-delete"
  | "guild-soundboard-sounds-update"
  | "soundboard-sounds"
  | "voice-channel-effect-send"
  | "stage-instance-create"
  | "stage-instance-update"
  | "stage-instance-delete"
  | "interaction-create"
  | "thread-create"
  | "thread-update"
  | "thread-delete"
  | "thread-list-sync"
  | "thread-member-update"
  | "thread-members-update"
  | "reaction-add";

const DISCORD_SOURCE_OPERATIONS = new Set<DiscordSourceOperation>([
  "event",
  "application-authorized",
  "application-deauthorized",
  "entitlement-create",
  "entitlement-update",
  "entitlement-delete",
  "lobby-message-create",
  "lobby-message-update",
  "lobby-message-delete",
  "game-direct-message-create",
  "game-direct-message-update",
  "game-direct-message-delete",
  "channel-create",
  "channel-update",
  "channel-delete",
  "channel-pins-update",
  "message-create",
  "message-update",
  "message-delete",
  "message-delete-bulk",
  "message-reaction-remove",
  "message-reaction-remove-all",
  "message-reaction-remove-emoji",
  "typing-start",
  "message-poll-vote-add",
  "message-poll-vote-remove",
  "guild-audit-log-entry-create",
  "auto-moderation-rule-create",
  "auto-moderation-rule-update",
  "auto-moderation-rule-delete",
  "auto-moderation-action-execution",
  "guild-emojis-update",
  "guild-stickers-update",
  "guild-member-add",
  "guild-member-remove",
  "guild-scheduled-event-create",
  "guild-scheduled-event-update",
  "guild-scheduled-event-delete",
  "guild-soundboard-sound-create",
  "guild-soundboard-sound-update",
  "guild-soundboard-sound-delete",
  "guild-soundboard-sounds-update",
  "soundboard-sounds",
  "voice-channel-effect-send",
  "stage-instance-create",
  "stage-instance-update",
  "stage-instance-delete",
  "interaction-create",
  "thread-create",
  "thread-update",
  "thread-delete",
  "thread-list-sync",
  "thread-member-update",
  "thread-members-update",
  "reaction-add",
]);

const DISCORD_APPLICATION_WEBHOOK_EVENT_OPERATIONS = new Set<DiscordSourceOperation>([
  "application-authorized",
  "application-deauthorized",
  "entitlement-create",
  "entitlement-update",
  "entitlement-delete",
  "lobby-message-create",
  "lobby-message-update",
  "lobby-message-delete",
  "game-direct-message-create",
  "game-direct-message-update",
  "game-direct-message-delete",
]);

export function isDiscordSourceOperationSupported(operationId: string): boolean {
  return discordSourceOperation(operationId) !== null;
}

export function buildDiscordSourcePlan(operation: ConnectorOperationDefinition): ConnectorRuntimeSourcePlan {
  const sourceOperation = discordSourceOperation(operation.id);
  if (!sourceOperation) {
    throw new Error(`Unsupported Discord source operation: ${operation.id}`);
  }
  if (DISCORD_APPLICATION_WEBHOOK_EVENT_OPERATIONS.has(sourceOperation)) {
    return {
      delivery: "webhook",
      dedupe: "timestamp",
      hooks: [],
      eventsPath: "event",
    };
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
