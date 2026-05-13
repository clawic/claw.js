import type {
  ConnectorRuntimeRequestPlan,
} from "./runtime-registry.ts";
import type {
  ConnectorOperationDefinition,
  IntegrationJson,
} from "./types.ts";

export type DiscordRuntimeOperation =
  | "get-current-user"
  | "get-user"
  | "list-current-user-guilds"
  | "get-guild"
  | "get-guild-preview"
  | "list-guild-channels"
  | "create-guild-channel"
  | "list-guild-emojis"
  | "get-guild-emoji"
  | "create-guild-emoji"
  | "update-guild-emoji"
  | "delete-guild-emoji"
  | "get-channel"
  | "update-channel"
  | "delete-channel"
  | "list-messages"
  | "get-message"
  | "send-message"
  | "edit-message"
  | "delete-message"
  | "bulk-delete-messages"
  | "crosspost-message"
  | "list-pinned-messages"
  | "pin-message"
  | "unpin-message"
  | "create-reaction"
  | "delete-own-reaction"
  | "delete-user-reaction"
  | "list-reactions"
  | "start-thread-from-message"
  | "start-thread-without-message"
  | "list-active-threads"
  | "join-thread"
  | "leave-thread"
  | "add-thread-member"
  | "remove-thread-member"
  | "get-thread-member"
  | "list-thread-members"
  | "list-guild-members"
  | "get-guild-member"
  | "search-guild-members"
  | "modify-guild-member"
  | "remove-guild-member"
  | "list-guild-roles"
  | "create-guild-role"
  | "update-guild-role"
  | "delete-guild-role"
  | "add-guild-member-role"
  | "remove-guild-member-role"
  | "list-guild-bans"
  | "get-guild-ban"
  | "create-guild-ban"
  | "remove-guild-ban"
  | "list-auto-moderation-rules"
  | "get-auto-moderation-rule"
  | "create-auto-moderation-rule"
  | "update-auto-moderation-rule"
  | "delete-auto-moderation-rule"
  | "list-guild-invites"
  | "list-guild-scheduled-events"
  | "create-guild-scheduled-event"
  | "get-guild-scheduled-event"
  | "update-guild-scheduled-event"
  | "delete-guild-scheduled-event"
  | "list-guild-scheduled-event-users"
  | "create-stage-instance"
  | "get-stage-instance"
  | "update-stage-instance"
  | "delete-stage-instance"
  | "get-invite"
  | "delete-invite"
  | "list-channel-webhooks"
  | "list-guild-webhooks"
  | "create-webhook"
  | "get-webhook"
  | "update-webhook"
  | "delete-webhook"
  | "execute-webhook"
  | "get-webhook-message"
  | "edit-webhook-message"
  | "delete-webhook-message"
  | "list-global-application-commands"
  | "create-global-application-command"
  | "get-global-application-command"
  | "update-global-application-command"
  | "delete-global-application-command"
  | "list-application-emojis"
  | "get-application-emoji"
  | "create-application-emoji"
  | "update-application-emoji"
  | "delete-application-emoji"
  | "list-guild-application-commands"
  | "create-guild-application-command"
  | "get-guild-application-command"
  | "update-guild-application-command"
  | "delete-guild-application-command";

export function isDiscordActionOperationSupported(operationId: string): boolean {
  return discordRuntimeOperation(operationId) !== null;
}

export function buildDiscordOperationRequest(
  operation: ConnectorOperationDefinition,
  values: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const runtimeOperation = discordRuntimeOperation(operation.id);
  if (!runtimeOperation) {
    throw new Error(`Unsupported Discord operation: ${operation.id}`);
  }
  const auth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
    prefix: "Bot",
  }));
  const headers = { accept: "application/json" };

  switch (runtimeOperation) {
    case "get-current-user":
      return getPlan("users/@me", auth, headers, { type: "object", requiredPaths: ["id", "username"] });
    case "get-user":
      return getPlan(`users/${pathSegment(requiredString(firstValue(values.userId, values.user), "userId"))}`, auth, headers, { type: "object", requiredPaths: ["id", "username"] });
    case "list-current-user-guilds":
      return pagedGetPlan("users/@me/guilds", auth, headers, values, { type: "array" });
    case "get-guild":
      return getPlan(`guilds/${guildId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] }, removeEmptyValues({
        with_counts: values.withCounts,
      }));
    case "get-guild-preview":
      return getPlan(`guilds/${guildId(values)}/preview`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "get-channel":
      return getPlan(`channels/${channelId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "type"] });
    case "list-guild-channels":
      return getPlan(`guilds/${guildId(values)}/channels`, auth, headers, { type: "array" });
    case "create-guild-channel":
      return bodyPlan("POST", `guilds/${guildId(values)}/channels`, auth, headers, channelBody(values), { type: "object", requiredPaths: ["id", "type", "name"] });
    case "list-guild-emojis":
      return getPlan(`guilds/${guildId(values)}/emojis`, auth, headers, { type: "array" });
    case "get-guild-emoji":
      return getPlan(`guilds/${guildId(values)}/emojis/${emojiId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "create-guild-emoji":
      return bodyPlan("POST", `guilds/${guildId(values)}/emojis`, auth, headers, emojiBody(values, true, true), { type: "object", requiredPaths: ["id", "name"] });
    case "update-guild-emoji":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/emojis/${emojiId(values)}`, auth, headers, emojiBody(values, false, true), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-guild-emoji":
      return deletePlan(`guilds/${guildId(values)}/emojis/${emojiId(values)}`, auth, headers, { type: "object" });
    case "update-channel":
      return bodyPlan("PATCH", `channels/${channelId(values)}`, auth, headers, channelBody(values), { type: "object", requiredPaths: ["id", "type"] });
    case "delete-channel":
      return deletePlan(`channels/${channelId(values)}`, auth, headers, { type: "object", requiredPaths: ["id"] });
    case "list-messages":
      return getPlan(`channels/${channelId(values)}/messages`, auth, headers, { type: "array" }, removeEmptyValues({
        around: optionalString(values.around),
        before: optionalString(values.before),
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "get-message":
      return getPlan(`channels/${channelId(values)}/messages/${messageId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "send-message":
      return bodyPlan("POST", `channels/${channelId(values)}/messages`, auth, headers, messageBody(values, true), { type: "object", requiredPaths: ["id", "channel_id"] });
    case "edit-message":
      return bodyPlan("PATCH", `channels/${channelId(values)}/messages/${messageId(values)}`, auth, headers, messageBody(values, false), { type: "object", requiredPaths: ["id", "channel_id"] });
    case "delete-message":
      return deletePlan(`channels/${channelId(values)}/messages/${messageId(values)}`, auth, headers, { type: "object" });
    case "bulk-delete-messages":
      return bodyPlan("POST", `channels/${channelId(values)}/messages/bulk-delete`, auth, headers, {
        messages: requiredJsonArray(values.messages, "messages"),
      }, { type: "object" });
    case "crosspost-message":
      return bodyPlan("POST", `channels/${channelId(values)}/messages/${messageId(values)}/crosspost`, auth, headers, {}, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "list-pinned-messages":
      return getPlan(`channels/${channelId(values)}/pins`, auth, headers, { type: "array" });
    case "pin-message":
      return putPlan(`channels/${channelId(values)}/pins/${messageId(values)}`, auth, headers, { type: "object" });
    case "unpin-message":
      return deletePlan(`channels/${channelId(values)}/pins/${messageId(values)}`, auth, headers, { type: "object" });
    case "create-reaction":
      return putPlan(`channels/${channelId(values)}/messages/${messageId(values)}/reactions/${pathSegment(requiredString(values.emoji, "emoji"))}/@me`, auth, headers, { type: "object" });
    case "delete-own-reaction":
      return deletePlan(`channels/${channelId(values)}/messages/${messageId(values)}/reactions/${pathSegment(requiredString(values.emoji, "emoji"))}/@me`, auth, headers, { type: "object" });
    case "delete-user-reaction":
      return deletePlan(`channels/${channelId(values)}/messages/${messageId(values)}/reactions/${pathSegment(requiredString(values.emoji, "emoji"))}/${userId(values)}`, auth, headers, { type: "object" });
    case "list-reactions":
      return getPlan(`channels/${channelId(values)}/messages/${messageId(values)}/reactions/${pathSegment(requiredString(values.emoji, "emoji"))}`, auth, headers, { type: "array" }, removeEmptyValues({
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
        type: optionalNumber(values.type),
      }));
    case "start-thread-from-message":
      return bodyPlan("POST", `channels/${channelId(values)}/messages/${messageId(values)}/threads`, auth, headers, threadBody(values), { type: "object", requiredPaths: ["id", "type", "name"] });
    case "start-thread-without-message":
      return bodyPlan("POST", `channels/${channelId(values)}/threads`, auth, headers, threadBody(values), { type: "object", requiredPaths: ["id", "type", "name"] });
    case "list-active-threads":
      return getPlan(`guilds/${guildId(values)}/threads/active`, auth, headers, { type: "object", requiredPaths: ["threads"] });
    case "join-thread":
      return putPlan(`channels/${channelId(values)}/thread-members/@me`, auth, headers, { type: "object" });
    case "leave-thread":
      return deletePlan(`channels/${channelId(values)}/thread-members/@me`, auth, headers, { type: "object" });
    case "add-thread-member":
      return putPlan(`channels/${channelId(values)}/thread-members/${userId(values)}`, auth, headers, { type: "object" });
    case "remove-thread-member":
      return deletePlan(`channels/${channelId(values)}/thread-members/${userId(values)}`, auth, headers, { type: "object" });
    case "get-thread-member":
      return getPlan(`channels/${channelId(values)}/thread-members/${userId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "user_id"] }, removeEmptyValues({ with_member: values.withMember }));
    case "list-thread-members":
      return getPlan(`channels/${channelId(values)}/thread-members`, auth, headers, { type: "array" }, removeEmptyValues({
        with_member: values.withMember,
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "list-guild-members":
      return getPlan(`guilds/${guildId(values)}/members`, auth, headers, { type: "array" }, removeEmptyValues({
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "get-guild-member":
      return getPlan(`guilds/${guildId(values)}/members/${userId(values)}`, auth, headers, { type: "object", requiredPaths: ["user"] });
    case "search-guild-members":
      return getPlan(`guilds/${guildId(values)}/members/search`, auth, headers, { type: "array" }, removeEmptyValues({
        query: requiredString(values.query, "query"),
        limit: optionalNumber(values.limit),
      }));
    case "modify-guild-member":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/members/${userId(values)}`, auth, headers, memberBody(values), { type: "object", requiredPaths: ["user"] });
    case "remove-guild-member":
      return deletePlan(`guilds/${guildId(values)}/members/${userId(values)}`, auth, headers, { type: "object" });
    case "list-guild-roles":
      return getPlan(`guilds/${guildId(values)}/roles`, auth, headers, { type: "array" });
    case "create-guild-role":
      return bodyPlan("POST", `guilds/${guildId(values)}/roles`, auth, headers, roleBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "update-guild-role":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/roles/${roleId(values)}`, auth, headers, roleBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-guild-role":
      return deletePlan(`guilds/${guildId(values)}/roles/${roleId(values)}`, auth, headers, { type: "object" });
    case "add-guild-member-role":
      return putPlan(`guilds/${guildId(values)}/members/${userId(values)}/roles/${roleId(values)}`, auth, headers, { type: "object" });
    case "remove-guild-member-role":
      return deletePlan(`guilds/${guildId(values)}/members/${userId(values)}/roles/${roleId(values)}`, auth, headers, { type: "object" });
    case "list-guild-bans":
      return getPlan(`guilds/${guildId(values)}/bans`, auth, headers, { type: "array" }, removeEmptyValues({
        before: optionalString(values.before),
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "get-guild-ban":
      return getPlan(`guilds/${guildId(values)}/bans/${userId(values)}`, auth, headers, { type: "object", requiredPaths: ["user"] });
    case "create-guild-ban":
      return putPlan(`guilds/${guildId(values)}/bans/${userId(values)}`, auth, headers, { type: "object" }, removeEmptyValues({
        delete_message_seconds: optionalNumber(values.deleteMessageSeconds),
      }));
    case "remove-guild-ban":
      return deletePlan(`guilds/${guildId(values)}/bans/${userId(values)}`, auth, headers, { type: "object" });
    case "list-auto-moderation-rules":
      return getPlan(`guilds/${guildId(values)}/auto-moderation/rules`, auth, headers, { type: "array" });
    case "get-auto-moderation-rule":
      return getPlan(`guilds/${guildId(values)}/auto-moderation/rules/${autoModerationRuleId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "guild_id", "name"] });
    case "create-auto-moderation-rule":
      return bodyPlan("POST", `guilds/${guildId(values)}/auto-moderation/rules`, auth, auditHeaders(headers, values), autoModerationRuleBody(values, true), { type: "object", requiredPaths: ["id", "guild_id", "name"] });
    case "update-auto-moderation-rule":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/auto-moderation/rules/${autoModerationRuleId(values)}`, auth, auditHeaders(headers, values), autoModerationRuleBody(values, false), { type: "object", requiredPaths: ["id", "guild_id", "name"] });
    case "delete-auto-moderation-rule":
      return deletePlan(`guilds/${guildId(values)}/auto-moderation/rules/${autoModerationRuleId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "list-guild-invites":
      return getPlan(`guilds/${guildId(values)}/invites`, auth, headers, { type: "array" });
    case "list-guild-scheduled-events":
      return getPlan(`guilds/${guildId(values)}/scheduled-events`, auth, headers, { type: "array" }, removeEmptyValues({
        with_user_count: values.withUserCount,
      }));
    case "create-guild-scheduled-event":
      return bodyPlan("POST", `guilds/${guildId(values)}/scheduled-events`, auth, headers, scheduledEventBody(values, true), { type: "object", requiredPaths: ["id", "guild_id", "name"] });
    case "get-guild-scheduled-event":
      return getPlan(`guilds/${guildId(values)}/scheduled-events/${guildScheduledEventId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "guild_id", "name"] }, removeEmptyValues({
        with_user_count: values.withUserCount,
      }));
    case "update-guild-scheduled-event":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/scheduled-events/${guildScheduledEventId(values)}`, auth, headers, scheduledEventBody(values, false), { type: "object", requiredPaths: ["id", "guild_id", "name"] });
    case "delete-guild-scheduled-event":
      return deletePlan(`guilds/${guildId(values)}/scheduled-events/${guildScheduledEventId(values)}`, auth, headers, { type: "object" });
    case "list-guild-scheduled-event-users":
      return getPlan(`guilds/${guildId(values)}/scheduled-events/${guildScheduledEventId(values)}/users`, auth, headers, { type: "array" }, removeEmptyValues({
        limit: optionalNumber(values.limit),
        with_member: values.withMember,
        before: optionalString(values.before),
        after: optionalString(values.after),
      }));
    case "create-stage-instance":
      return bodyPlan("POST", "stage-instances", auth, headers, stageInstanceBody(values, true), { type: "object", requiredPaths: ["id", "channel_id", "topic"] });
    case "get-stage-instance":
      return getPlan(`stage-instances/${channelId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "channel_id", "topic"] });
    case "update-stage-instance":
      return bodyPlan("PATCH", `stage-instances/${channelId(values)}`, auth, auditHeaders(headers, values), stageInstanceBody(values, false), { type: "object", requiredPaths: ["id", "channel_id", "topic"] });
    case "delete-stage-instance":
      return deletePlan(`stage-instances/${channelId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "get-invite":
      return getPlan(`invites/${pathSegment(requiredString(values.inviteCode, "inviteCode"))}`, auth, headers, { type: "object", requiredPaths: ["code"] }, removeEmptyValues({
        with_counts: values.withCounts,
        with_expiration: values.withExpiration,
        guild_scheduled_event_id: optionalString(values.guildScheduledEventId),
      }));
    case "delete-invite":
      return deletePlan(`invites/${pathSegment(requiredString(values.inviteCode, "inviteCode"))}`, auth, headers, { type: "object", requiredPaths: ["code"] });
    case "list-channel-webhooks":
      return getPlan(`channels/${channelId(values)}/webhooks`, auth, headers, { type: "array" });
    case "list-guild-webhooks":
      return getPlan(`guilds/${guildId(values)}/webhooks`, auth, headers, { type: "array" });
    case "create-webhook":
      return bodyPlan("POST", `channels/${channelId(values)}/webhooks`, auth, headers, webhookBody(values), { type: "object", requiredPaths: ["id", "token"] });
    case "get-webhook":
      return getPlan(`webhooks/${webhookId(values)}`, auth, headers, { type: "object", requiredPaths: ["id"] });
    case "update-webhook":
      return bodyPlan("PATCH", `webhooks/${webhookId(values)}`, auth, headers, webhookBody(values), { type: "object", requiredPaths: ["id"] });
    case "delete-webhook":
      return deletePlan(`webhooks/${webhookId(values)}`, auth, headers, { type: "object" });
    case "execute-webhook":
      return bodyPlan("POST", `webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}`, [], headers, messageBody(values, true), { type: "object" }, removeEmptyValues({ wait: values.wait, thread_id: optionalString(values.threadId) }));
    case "get-webhook-message":
      return getPlan(`webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}/messages/${messageId(values)}`, [], headers, { type: "object", requiredPaths: ["id"] }, removeEmptyValues({ thread_id: optionalString(values.threadId) }));
    case "edit-webhook-message":
      return bodyPlan("PATCH", `webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}/messages/${messageId(values)}`, [], headers, messageBody(values, false), { type: "object", requiredPaths: ["id"] }, removeEmptyValues({ thread_id: optionalString(values.threadId) }));
    case "delete-webhook-message":
      return deletePlan(`webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}/messages/${messageId(values)}`, [], headers, { type: "object" }, removeEmptyValues({ thread_id: optionalString(values.threadId) }));
    case "list-global-application-commands":
      return getPlan(`applications/${applicationId(values)}/commands`, auth, headers, { type: "array" }, removeEmptyValues({ with_localizations: values.withLocalizations }));
    case "create-global-application-command":
      return bodyPlan("POST", `applications/${applicationId(values)}/commands`, auth, headers, applicationCommandBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "get-global-application-command":
      return getPlan(`applications/${applicationId(values)}/commands/${commandId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "update-global-application-command":
      return bodyPlan("PATCH", `applications/${applicationId(values)}/commands/${commandId(values)}`, auth, headers, applicationCommandBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-global-application-command":
      return deletePlan(`applications/${applicationId(values)}/commands/${commandId(values)}`, auth, headers, { type: "object" });
    case "list-application-emojis":
      return getPlan(`applications/${applicationId(values)}/emojis`, auth, headers, { type: "object", requiredPaths: ["items"] });
    case "get-application-emoji":
      return getPlan(`applications/${applicationId(values)}/emojis/${emojiId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "create-application-emoji":
      return bodyPlan("POST", `applications/${applicationId(values)}/emojis`, auth, headers, emojiBody(values, true, false), { type: "object", requiredPaths: ["id", "name"] });
    case "update-application-emoji":
      return bodyPlan("PATCH", `applications/${applicationId(values)}/emojis/${emojiId(values)}`, auth, headers, emojiBody(values, false, false), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-application-emoji":
      return deletePlan(`applications/${applicationId(values)}/emojis/${emojiId(values)}`, auth, headers, { type: "object" });
    case "list-guild-application-commands":
      return getPlan(`applications/${applicationId(values)}/guilds/${guildId(values)}/commands`, auth, headers, { type: "array" }, removeEmptyValues({ with_localizations: values.withLocalizations }));
    case "create-guild-application-command":
      return bodyPlan("POST", `applications/${applicationId(values)}/guilds/${guildId(values)}/commands`, auth, headers, applicationCommandBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "get-guild-application-command":
      return getPlan(`applications/${applicationId(values)}/guilds/${guildId(values)}/commands/${commandId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "update-guild-application-command":
      return bodyPlan("PATCH", `applications/${applicationId(values)}/guilds/${guildId(values)}/commands/${commandId(values)}`, auth, headers, applicationCommandBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-guild-application-command":
      return deletePlan(`applications/${applicationId(values)}/guilds/${guildId(values)}/commands/${commandId(values)}`, auth, headers, { type: "object" });
  }
}

function discordRuntimeOperation(operationId: string): DiscordRuntimeOperation | null {
  const slug = operationId.split(".").at(-1);
  if (DISCORD_OPERATIONS.has(slug as DiscordRuntimeOperation)) return slug as DiscordRuntimeOperation;
  if (slug === "get-channel" || slug === "channel-info") return "get-channel";
  if (slug === "list-guild-channels" || slug === "list-channels") return "list-guild-channels";
  if (slug === "send-message" || slug === "send-channel-message") return "send-message";
  return null;
}

const DISCORD_OPERATIONS = new Set<DiscordRuntimeOperation>([
  "get-current-user",
  "get-user",
  "list-current-user-guilds",
  "get-guild",
  "get-guild-preview",
  "list-guild-channels",
  "create-guild-channel",
  "list-guild-emojis",
  "get-guild-emoji",
  "create-guild-emoji",
  "update-guild-emoji",
  "delete-guild-emoji",
  "get-channel",
  "update-channel",
  "delete-channel",
  "list-messages",
  "get-message",
  "send-message",
  "edit-message",
  "delete-message",
  "bulk-delete-messages",
  "crosspost-message",
  "list-pinned-messages",
  "pin-message",
  "unpin-message",
  "create-reaction",
  "delete-own-reaction",
  "delete-user-reaction",
  "list-reactions",
  "start-thread-from-message",
  "start-thread-without-message",
  "list-active-threads",
  "join-thread",
  "leave-thread",
  "add-thread-member",
  "remove-thread-member",
  "get-thread-member",
  "list-thread-members",
  "list-guild-members",
  "get-guild-member",
  "search-guild-members",
  "modify-guild-member",
  "remove-guild-member",
  "list-guild-roles",
  "create-guild-role",
  "update-guild-role",
  "delete-guild-role",
  "add-guild-member-role",
  "remove-guild-member-role",
  "list-guild-bans",
  "get-guild-ban",
  "create-guild-ban",
  "remove-guild-ban",
  "list-auto-moderation-rules",
  "get-auto-moderation-rule",
  "create-auto-moderation-rule",
  "update-auto-moderation-rule",
  "delete-auto-moderation-rule",
  "list-guild-invites",
  "list-guild-scheduled-events",
  "create-guild-scheduled-event",
  "get-guild-scheduled-event",
  "update-guild-scheduled-event",
  "delete-guild-scheduled-event",
  "list-guild-scheduled-event-users",
  "create-stage-instance",
  "get-stage-instance",
  "update-stage-instance",
  "delete-stage-instance",
  "get-invite",
  "delete-invite",
  "list-channel-webhooks",
  "list-guild-webhooks",
  "create-webhook",
  "get-webhook",
  "update-webhook",
  "delete-webhook",
  "execute-webhook",
  "get-webhook-message",
  "edit-webhook-message",
  "delete-webhook-message",
  "list-global-application-commands",
  "create-global-application-command",
  "get-global-application-command",
  "update-global-application-command",
  "delete-global-application-command",
  "list-application-emojis",
  "get-application-emoji",
  "create-application-emoji",
  "update-application-emoji",
  "delete-application-emoji",
  "list-guild-application-commands",
  "create-guild-application-command",
  "get-guild-application-command",
  "update-guild-application-command",
  "delete-guild-application-command",
]);

type ResponseSchema = NonNullable<ConnectorRuntimeRequestPlan["responseSchema"]>;

function getPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  responseSchema: ResponseSchema,
  query?: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  return {
    method: "GET",
    endpoint,
    auth,
    headers,
    query: query ?? {},
    body: {},
    responseSchema,
  };
}

function pagedGetPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
  responseSchema: ResponseSchema,
): ConnectorRuntimeRequestPlan {
  const limit = optionalNumber(values.limit);
  return {
    ...getPlan(endpoint, auth, headers, responseSchema, removeEmptyValues({
      before: optionalString(values.before),
      after: optionalString(values.after),
      limit,
    })),
    pagination: {
      mode: "cursor",
      itemsPath: "",
      nextCursorPath: "id",
      cursorParam: "after",
      limitParam: "limit",
      pageSize: typeof limit === "number" ? limit : 100,
      maxPages: 1,
    },
  };
}

function bodyPlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  body: Record<string, IntegrationJson>,
  responseSchema: ResponseSchema,
  query?: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  return {
    method,
    endpoint,
    auth,
    headers,
    ...(query ? { query } : {}),
    body,
    responseSchema,
  };
}

function putPlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  responseSchema: ResponseSchema,
  query?: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  return bodyPlan("PUT", endpoint, auth, headers, {}, responseSchema, query);
}

function deletePlan(
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  responseSchema: ResponseSchema,
  query?: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  return bodyPlan("DELETE", endpoint, auth, headers, {}, responseSchema, query);
}

function channelBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: optionalString(values.name),
    type: optionalNumber(values.type),
    topic: optionalString(values.topic),
    bitrate: optionalNumber(values.bitrate),
    user_limit: optionalNumber(values.userLimit),
    rate_limit_per_user: optionalNumber(values.rateLimitPerUser),
    position: optionalNumber(values.position),
    parent_id: optionalString(values.parentId),
    nsfw: values.nsfw,
    permission_overwrites: optionalJsonArray(values.permissionOverwrites),
  });
}

function emojiBody(
  values: Record<string, IntegrationJson>,
  requireCreateFields: boolean,
  includeRoles: boolean,
): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name),
    image: requireCreateFields ? requiredString(values.image, "image") : optionalString(values.image),
    ...(includeRoles ? { roles: optionalJsonArray(values.roles) } : {}),
  });
}

function messageBody(values: Record<string, IntegrationJson>, requireContent: boolean): Record<string, IntegrationJson> {
  const content = firstValue(values.content, values.text);
  return removeEmptyValues({
    content: requireContent ? requiredString(content, "content") : optionalString(content),
    tts: values.tts,
    embeds: optionalJsonArray(values.embeds),
    components: optionalJsonArray(values.components),
    allowed_mentions: optionalJsonObject(values.allowedMentions),
    flags: optionalNumber(values.flags),
    message_reference: messageReference(values),
  });
}

function messageReference(values: Record<string, IntegrationJson>): IntegrationJson | undefined {
  const messageId = optionalString(firstValue(values.messageId, values.replyToMessageId));
  if (!messageId) return undefined;
  return removeEmptyValues({
    message_id: messageId,
    channel_id: optionalString(firstValue(values.referenceChannelId, values.channelId, values.channel)),
    guild_id: optionalString(firstValue(values.guildId, values.guild)),
    fail_if_not_exists: values.failIfNotExists,
  });
}

function threadBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requiredString(values.name, "name"),
    auto_archive_duration: optionalNumber(values.autoArchiveDuration),
    type: optionalNumber(values.type),
    invitable: values.invitable,
    rate_limit_per_user: optionalNumber(values.rateLimitPerUser),
  });
}

function memberBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    nick: optionalString(values.nick),
    roles: optionalJsonArray(values.roles),
    mute: values.mute,
    deaf: values.deaf,
    channel_id: optionalString(values.voiceChannelId),
    communication_disabled_until: optionalString(values.communicationDisabledUntil),
    flags: optionalNumber(values.flags),
  });
}

function roleBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: optionalString(values.name),
    permissions: optionalString(values.permissions),
    color: optionalNumber(values.color),
    hoist: values.hoist,
    icon: optionalString(values.icon),
    unicode_emoji: optionalString(values.unicodeEmoji),
    mentionable: values.mentionable,
  });
}

function webhookBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: optionalString(values.name),
    avatar: optionalString(values.avatar),
    channel_id: optionalString(values.targetChannelId),
  });
}

function applicationCommandBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requiredString(values.name, "name"),
    description: optionalString(values.description),
    type: optionalNumber(values.type),
    options: optionalJsonArray(values.options),
    default_member_permissions: optionalString(values.defaultMemberPermissions),
    dm_permission: values.dmPermission,
    nsfw: values.nsfw,
    integration_types: optionalJsonArray(values.integrationTypes),
    contexts: optionalJsonArray(values.contexts),
  });
}

function scheduledEventBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    channel_id: optionalString(values.channelId),
    entity_metadata: optionalJsonObject(values.entityMetadata),
    name: requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name),
    privacy_level: requireCreateFields ? optionalNumber(values.privacyLevel) ?? 2 : optionalNumber(values.privacyLevel),
    scheduled_start_time: requireCreateFields
      ? requiredString(values.scheduledStartTime, "scheduledStartTime")
      : optionalString(values.scheduledStartTime),
    scheduled_end_time: optionalString(values.scheduledEndTime),
    description: optionalString(values.description),
    entity_type: requireCreateFields ? optionalNumber(values.entityType) ?? 3 : optionalNumber(values.entityType),
    status: optionalNumber(values.status),
    image: optionalString(values.image),
    recurrence_rule: optionalJsonObject(values.recurrenceRule),
  });
}

function autoModerationRuleBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name),
    event_type: requireCreateFields ? optionalNumber(values.eventType) ?? 1 : optionalNumber(values.eventType),
    trigger_type: requireCreateFields ? optionalNumber(values.triggerType) ?? 1 : undefined,
    trigger_metadata: optionalJsonObject(values.triggerMetadata),
    actions: requireCreateFields ? requiredJsonArray(values.actions, "actions") : optionalJsonArray(values.actions),
    enabled: values.enabled,
    exempt_roles: optionalJsonArray(values.exemptRoles),
    exempt_channels: optionalJsonArray(values.exemptChannels),
  });
}

function stageInstanceBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    channel_id: requireCreateFields ? requiredString(values.channelId, "channelId") : undefined,
    topic: requireCreateFields ? requiredString(values.topic, "topic") : optionalString(values.topic),
    privacy_level: requireCreateFields ? optionalNumber(values.privacyLevel) ?? 2 : optionalNumber(values.privacyLevel),
    send_start_notification: values.sendStartNotification,
    guild_scheduled_event_id: optionalString(values.guildScheduledEventId),
  });
}

function guildId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.guildId, values.guild), "guildId"));
}

function channelId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.channelId, values.channel), "channelId"));
}

function messageId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.messageId, values.message), "messageId"));
}

function userId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.userId, values.user), "userId"));
}

function roleId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.roleId, values.role), "roleId"));
}

function webhookId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.webhookId, values.webhook), "webhookId"));
}

function applicationId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.applicationId, values.application), "applicationId"));
}

function commandId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.commandId, values.command), "commandId"));
}

function emojiId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.emojiId, values.emoji), "emojiId"));
}

function guildScheduledEventId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.guildScheduledEventId, values.scheduledEventId, values.eventId), "guildScheduledEventId"));
}

function autoModerationRuleId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.autoModerationRuleId, values.ruleId), "autoModerationRuleId"));
}

function firstValue(...values: IntegrationJson[]): IntegrationJson {
  return values.find((value) => value != null && value !== "") ?? null;
}

function requiredString(value: IntegrationJson, name: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function optionalNumber(value: IntegrationJson): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function optionalJsonArray(value: IntegrationJson): IntegrationJson[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function requiredJsonArray(value: IntegrationJson, name: string): IntegrationJson[] {
  const parsed = optionalJsonArray(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

function optionalJsonObject(value: IntegrationJson): Record<string, IntegrationJson> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, IntegrationJson>
    : undefined;
}

function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

function removeEmptyValues(input: Record<string, IntegrationJson | undefined>): Record<string, IntegrationJson> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  ) as Record<string, IntegrationJson>;
}

function auditHeaders(
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
): Record<string, string> {
  const auditLogReason = optionalString(values.auditLogReason);
  return auditLogReason ? { ...headers, "X-Audit-Log-Reason": auditLogReason } : headers;
}
