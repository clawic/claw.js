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
  | "modify-current-user"
  | "list-current-user-guilds"
  | "get-current-user-guild-member"
  | "leave-guild"
  | "create-dm"
  | "create-group-dm"
  | "get-current-user-connections"
  | "get-current-user-application-role-connection"
  | "update-current-user-application-role-connection"
  | "get-gateway"
  | "get-gateway-bot"
  | "get-current-bot-application-information"
  | "get-current-authorization-information"
  | "get-guild"
  | "get-guild-preview"
  | "modify-guild"
  | "get-guild-voice-regions"
  | "list-guild-channels"
  | "create-guild-channel"
  | "modify-guild-channel-positions"
  | "get-guild-template"
  | "list-guild-templates"
  | "create-guild-template"
  | "sync-guild-template"
  | "update-guild-template"
  | "delete-guild-template"
  | "send-soundboard-sound"
  | "list-default-soundboard-sounds"
  | "list-guild-soundboard-sounds"
  | "get-guild-soundboard-sound"
  | "create-guild-soundboard-sound"
  | "update-guild-soundboard-sound"
  | "delete-guild-soundboard-sound"
  | "get-current-application"
  | "edit-current-application"
  | "get-application-activity-instance"
  | "get-application-role-connection-metadata"
  | "update-application-role-connection-metadata"
  | "list-entitlements"
  | "get-entitlement"
  | "consume-entitlement"
  | "create-test-entitlement"
  | "delete-test-entitlement"
  | "list-skus"
  | "list-sku-subscriptions"
  | "get-sku-subscription"
  | "get-guild-audit-log"
  | "list-guild-emojis"
  | "get-guild-emoji"
  | "create-guild-emoji"
  | "update-guild-emoji"
  | "delete-guild-emoji"
  | "get-sticker"
  | "list-sticker-packs"
  | "get-sticker-pack"
  | "list-guild-stickers"
  | "get-guild-sticker"
  | "create-guild-sticker"
  | "update-guild-sticker"
  | "delete-guild-sticker"
  | "list-voice-regions"
  | "get-current-user-voice-state"
  | "get-user-voice-state"
  | "modify-current-user-voice-state"
  | "modify-user-voice-state"
  | "create-lobby"
  | "get-lobby"
  | "modify-lobby"
  | "delete-lobby"
  | "add-lobby-member"
  | "bulk-update-lobby-members"
  | "remove-lobby-member"
  | "leave-lobby"
  | "link-channel-to-lobby"
  | "unlink-channel-from-lobby"
  | "update-lobby-message-moderation-metadata"
  | "get-channel"
  | "update-channel"
  | "set-voice-channel-status"
  | "delete-channel"
  | "edit-channel-permissions"
  | "delete-channel-permission"
  | "follow-announcement-channel"
  | "trigger-typing-indicator"
  | "group-dm-add-recipient"
  | "group-dm-remove-recipient"
  | "list-messages"
  | "search-guild-messages"
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
  | "delete-all-reactions"
  | "delete-all-reactions-for-emoji"
  | "get-answer-voters"
  | "end-poll"
  | "start-thread-from-message"
  | "start-thread-without-message"
  | "start-thread-in-forum-or-media-channel"
  | "list-active-threads"
  | "list-public-archived-threads"
  | "list-private-archived-threads"
  | "list-joined-private-archived-threads"
  | "join-thread"
  | "leave-thread"
  | "add-thread-member"
  | "remove-thread-member"
  | "get-thread-member"
  | "list-thread-members"
  | "add-guild-member"
  | "list-guild-members"
  | "get-guild-member"
  | "search-guild-members"
  | "modify-guild-member"
  | "modify-current-member"
  | "modify-current-user-nick"
  | "remove-guild-member"
  | "list-guild-roles"
  | "get-guild-role"
  | "get-guild-role-member-counts"
  | "create-guild-role"
  | "modify-guild-role-positions"
  | "update-guild-role"
  | "delete-guild-role"
  | "add-guild-member-role"
  | "remove-guild-member-role"
  | "list-guild-bans"
  | "get-guild-ban"
  | "create-guild-ban"
  | "remove-guild-ban"
  | "bulk-ban-guild-users"
  | "get-guild-prune-count"
  | "begin-guild-prune"
  | "get-guild-integrations"
  | "delete-guild-integration"
  | "get-guild-widget-settings"
  | "modify-guild-widget"
  | "get-guild-widget"
  | "get-guild-widget-image"
  | "get-guild-vanity-url"
  | "get-guild-welcome-screen"
  | "modify-guild-welcome-screen"
  | "get-guild-onboarding"
  | "modify-guild-onboarding"
  | "modify-guild-incident-actions"
  | "list-auto-moderation-rules"
  | "get-auto-moderation-rule"
  | "create-auto-moderation-rule"
  | "update-auto-moderation-rule"
  | "delete-auto-moderation-rule"
  | "list-guild-invites"
  | "list-channel-invites"
  | "create-channel-invite"
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
  | "get-invite-target-users"
  | "update-invite-target-users"
  | "get-invite-target-users-job-status"
  | "list-channel-webhooks"
  | "list-guild-webhooks"
  | "create-webhook"
  | "get-webhook"
  | "update-webhook"
  | "delete-webhook"
  | "get-webhook-with-token"
  | "update-webhook-with-token"
  | "delete-webhook-with-token"
  | "execute-webhook"
  | "execute-slack-compatible-webhook"
  | "execute-github-compatible-webhook"
  | "get-webhook-message"
  | "edit-webhook-message"
  | "delete-webhook-message"
  | "create-interaction-response"
  | "get-original-interaction-response"
  | "edit-original-interaction-response"
  | "delete-original-interaction-response"
  | "create-followup-message"
  | "get-followup-message"
  | "edit-followup-message"
  | "delete-followup-message"
  | "list-global-application-commands"
  | "create-global-application-command"
  | "get-global-application-command"
  | "update-global-application-command"
  | "delete-global-application-command"
  | "bulk-overwrite-global-application-commands"
  | "list-application-emojis"
  | "get-application-emoji"
  | "create-application-emoji"
  | "update-application-emoji"
  | "delete-application-emoji"
  | "list-guild-application-commands"
  | "create-guild-application-command"
  | "get-guild-application-command"
  | "update-guild-application-command"
  | "delete-guild-application-command"
  | "bulk-overwrite-guild-application-commands"
  | "get-guild-application-command-permissions"
  | "get-application-command-permissions"
  | "edit-application-command-permissions";

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
  const bearerAuth = operation.authFieldNames.map((field) => ({
    type: "secret" as const,
    field,
    placement: "bearer" as const,
  }));
  const headers = { accept: "application/json" };

  switch (runtimeOperation) {
    case "get-current-user":
      return getPlan("users/@me", auth, headers, { type: "object", requiredPaths: ["id", "username"] });
    case "get-user":
      return getPlan(`users/${pathSegment(requiredString(firstValue(values.userId, values.user), "userId"))}`, auth, headers, { type: "object", requiredPaths: ["id", "username"] });
    case "modify-current-user":
      return bodyPlan("PATCH", "users/@me", auth, headers, currentUserBody(values), { type: "object", requiredPaths: ["id", "username"] });
    case "list-current-user-guilds":
      return pagedGetPlan("users/@me/guilds", auth, headers, values, { type: "array" });
    case "get-current-user-guild-member":
      return getPlan(`users/@me/guilds/${guildId(values)}/member`, bearerAuth, headers, { type: "object", requiredPaths: ["user", "roles"] });
    case "leave-guild":
      return deletePlan(`users/@me/guilds/${guildId(values)}`, bearerAuth, headers, { type: "object" });
    case "create-dm":
      return bodyPlan("POST", "users/@me/channels", auth, headers, directMessageBody(values), { type: "object", requiredPaths: ["id", "type"] });
    case "create-group-dm":
      return bodyPlan("POST", "users/@me/channels", bearerAuth, headers, groupDmBody(values), { type: "object", requiredPaths: ["id", "type", "recipients"] });
    case "get-current-user-connections":
      return getPlan("users/@me/connections", bearerAuth, headers, { type: "array" });
    case "get-current-user-application-role-connection":
      return getPlan(`users/@me/applications/${applicationId(values)}/role-connection`, bearerAuth, headers, { type: "object", requiredPaths: ["metadata"] });
    case "update-current-user-application-role-connection":
      return bodyPlan("PUT", `users/@me/applications/${applicationId(values)}/role-connection`, bearerAuth, headers, userApplicationRoleConnectionBody(values), { type: "object", requiredPaths: ["metadata"] });
    case "get-gateway":
      return getPlan("gateway", [], headers, { type: "object", requiredPaths: ["url"] });
    case "get-gateway-bot":
      return getPlan("gateway/bot", auth, headers, { type: "object", requiredPaths: ["url", "shards", "session_start_limit"] });
    case "get-current-bot-application-information":
      return getPlan("oauth2/applications/@me", auth, headers, { type: "object", requiredPaths: ["id", "name", "description", "verify_key"] });
    case "get-current-authorization-information":
      return getPlan("oauth2/@me", bearerAuth, headers, { type: "object", requiredPaths: ["application", "scopes", "expires"] });
    case "get-guild":
      return getPlan(`guilds/${guildId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] }, removeEmptyValues({
        with_counts: values.withCounts,
      }));
    case "get-guild-preview":
      return getPlan(`guilds/${guildId(values)}/preview`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "modify-guild":
      return bodyPlan("PATCH", `guilds/${guildId(values)}`, auth, auditHeaders(headers, values), guildBody(values), { type: "object", requiredPaths: ["id", "name"] });
    case "get-guild-voice-regions":
      return getPlan(`guilds/${guildId(values)}/regions`, auth, headers, { type: "array" });
    case "get-channel":
      return getPlan(`channels/${channelId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "type"] });
    case "list-guild-channels":
      return getPlan(`guilds/${guildId(values)}/channels`, auth, headers, { type: "array" });
    case "create-guild-channel":
      return bodyPlan("POST", `guilds/${guildId(values)}/channels`, auth, headers, channelBody(values), { type: "object", requiredPaths: ["id", "type", "name"] });
    case "modify-guild-channel-positions":
      return {
        method: "PATCH",
        endpoint: `guilds/${guildId(values)}/channels`,
        auth,
        headers: auditHeaders(headers, values),
        body: {},
        bodyValue: requiredJsonArray(values.positions, "positions"),
        responseSchema: { type: "object" },
      };
    case "get-guild-template":
      return getPlan(`guilds/templates/${templateCode(values)}`, auth, headers, { type: "object", requiredPaths: ["code", "name", "source_guild_id"] });
    case "list-guild-templates":
      return getPlan(`guilds/${guildId(values)}/templates`, auth, headers, { type: "array" });
    case "create-guild-template":
      return bodyPlan("POST", `guilds/${guildId(values)}/templates`, auth, headers, guildTemplateBody(values, true), { type: "object", requiredPaths: ["code", "name", "source_guild_id"] });
    case "sync-guild-template":
      return putPlan(`guilds/${guildId(values)}/templates/${templateCode(values)}`, auth, headers, { type: "object", requiredPaths: ["code", "name", "source_guild_id"] });
    case "update-guild-template":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/templates/${templateCode(values)}`, auth, headers, guildTemplateBody(values, false), { type: "object", requiredPaths: ["code", "name", "source_guild_id"] });
    case "delete-guild-template":
      return deletePlan(`guilds/${guildId(values)}/templates/${templateCode(values)}`, auth, headers, { type: "object", requiredPaths: ["code", "name", "source_guild_id"] });
    case "send-soundboard-sound":
      return bodyPlan("POST", `channels/${channelId(values)}/send-soundboard-sound`, auth, headers, sendSoundboardSoundBody(values), { type: "object" });
    case "list-default-soundboard-sounds":
      return getPlan("soundboard-default-sounds", auth, headers, { type: "array" });
    case "list-guild-soundboard-sounds":
      return getPlan(`guilds/${guildId(values)}/soundboard-sounds`, auth, headers, { type: "object", requiredPaths: ["items"] });
    case "get-guild-soundboard-sound":
      return getPlan(`guilds/${guildId(values)}/soundboard-sounds/${soundboardSoundId(values)}`, auth, headers, { type: "object", requiredPaths: ["sound_id", "name"] });
    case "create-guild-soundboard-sound":
      return bodyPlan("POST", `guilds/${guildId(values)}/soundboard-sounds`, auth, auditHeaders(headers, values), soundboardSoundBody(values, true), { type: "object", requiredPaths: ["sound_id", "name"] });
    case "update-guild-soundboard-sound":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/soundboard-sounds/${soundboardSoundId(values)}`, auth, auditHeaders(headers, values), soundboardSoundBody(values, false), { type: "object", requiredPaths: ["sound_id", "name"] });
    case "delete-guild-soundboard-sound":
      return deletePlan(`guilds/${guildId(values)}/soundboard-sounds/${soundboardSoundId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "get-current-application":
      return getPlan("applications/@me", auth, headers, { type: "object", requiredPaths: ["id", "name", "description", "verify_key"] });
    case "edit-current-application":
      return bodyPlan("PATCH", "applications/@me", auth, headers, currentApplicationBody(values), { type: "object", requiredPaths: ["id", "name", "description", "verify_key"] });
    case "get-application-activity-instance":
      return getPlan(`applications/${applicationId(values)}/activity-instances/${instanceId(values)}`, auth, headers, { type: "object", requiredPaths: ["application_id", "instance_id", "launch_id", "location", "users"] });
    case "get-application-role-connection-metadata":
      return getPlan(`applications/${applicationId(values)}/role-connections/metadata`, auth, headers, { type: "array" });
    case "update-application-role-connection-metadata":
      return {
        method: "PUT",
        endpoint: `applications/${applicationId(values)}/role-connections/metadata`,
        auth,
        headers,
        body: {},
        bodyValue: requiredJsonArray(firstValue(values.records, values.metadataRecords), "records"),
        responseSchema: { type: "array" },
      };
    case "list-entitlements":
      return getPlan(`applications/${applicationId(values)}/entitlements`, auth, headers, { type: "array" }, removeEmptyValues({
        user_id: optionalString(values.userId),
        sku_ids: optionalCommaDelimited(values.skuIds),
        before: optionalString(values.before),
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
        guild_id: optionalString(values.guildId),
        exclude_ended: values.excludeEnded,
        exclude_deleted: values.excludeDeleted,
      }));
    case "get-entitlement":
      return getPlan(`applications/${applicationId(values)}/entitlements/${entitlementId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "sku_id", "application_id"] });
    case "consume-entitlement":
      return bodyPlan("POST", `applications/${applicationId(values)}/entitlements/${entitlementId(values)}/consume`, auth, headers, {}, { type: "object" });
    case "create-test-entitlement":
      return bodyPlan("POST", `applications/${applicationId(values)}/entitlements`, auth, headers, testEntitlementBody(values), { type: "object", requiredPaths: ["id", "sku_id"] });
    case "delete-test-entitlement":
      return deletePlan(`applications/${applicationId(values)}/entitlements/${entitlementId(values)}`, auth, headers, { type: "object" });
    case "list-skus":
      return getPlan(`applications/${applicationId(values)}/skus`, auth, headers, { type: "array" });
    case "list-sku-subscriptions":
      return getPlan(`skus/${skuId(values)}/subscriptions`, auth, headers, { type: "array" }, removeEmptyValues({
        before: optionalString(values.before),
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
        user_id: requiredString(values.userId, "userId"),
      }));
    case "get-sku-subscription":
      return getPlan(`skus/${skuId(values)}/subscriptions/${subscriptionId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "user_id", "sku_ids"] });
    case "get-guild-audit-log":
      return getPlan(`guilds/${guildId(values)}/audit-logs`, auth, headers, { type: "object", requiredPaths: ["audit_log_entries"] }, removeEmptyValues({
        user_id: optionalString(values.userId),
        action_type: optionalNumber(values.actionType),
        before: optionalString(values.before),
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "list-guild-emojis":
      return getPlan(`guilds/${guildId(values)}/emojis`, auth, headers, { type: "array" });
    case "get-guild-emoji":
      return getPlan(`guilds/${guildId(values)}/emojis/${emojiId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "create-guild-emoji":
      return bodyPlan("POST", `guilds/${guildId(values)}/emojis`, auth, auditHeaders(headers, values), emojiBody(values, true, true), { type: "object", requiredPaths: ["id", "name"] });
    case "update-guild-emoji":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/emojis/${emojiId(values)}`, auth, auditHeaders(headers, values), emojiBody(values, false, true), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-guild-emoji":
      return deletePlan(`guilds/${guildId(values)}/emojis/${emojiId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "get-sticker":
      return getPlan(`stickers/${stickerId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "list-sticker-packs":
      return getPlan("sticker-packs", auth, headers, { type: "object", requiredPaths: ["sticker_packs"] });
    case "get-sticker-pack":
      return getPlan(`sticker-packs/${stickerPackId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "stickers", "name"] });
    case "list-guild-stickers":
      return getPlan(`guilds/${guildId(values)}/stickers`, auth, headers, { type: "array" });
    case "get-guild-sticker":
      return getPlan(`guilds/${guildId(values)}/stickers/${stickerId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "create-guild-sticker":
      return {
        method: "POST",
        endpoint: `guilds/${guildId(values)}/stickers`,
        auth,
        headers: auditHeaders(headers, values),
        bodyEncoding: "multipart",
        body: stickerBody(values, true),
        responseSchema: { type: "object", requiredPaths: ["id", "name"] },
      };
    case "update-guild-sticker":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/stickers/${stickerId(values)}`, auth, auditHeaders(headers, values), stickerBody(values, false), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-guild-sticker":
      return deletePlan(`guilds/${guildId(values)}/stickers/${stickerId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "list-voice-regions":
      return getPlan("voice/regions", auth, headers, { type: "array" });
    case "get-current-user-voice-state":
      return getPlan(`guilds/${guildId(values)}/voice-states/@me`, auth, headers, { type: "object", requiredPaths: ["user_id", "session_id"] });
    case "get-user-voice-state":
      return getPlan(`guilds/${guildId(values)}/voice-states/${userId(values)}`, auth, headers, { type: "object", requiredPaths: ["user_id", "session_id"] });
    case "modify-current-user-voice-state":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/voice-states/@me`, auth, headers, voiceStateBody(values, true), { type: "object" });
    case "modify-user-voice-state":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/voice-states/${userId(values)}`, auth, headers, voiceStateBody(values, false), { type: "object" });
    case "create-lobby":
      return bodyPlan("POST", "lobbies", auth, headers, lobbyBody(values), { type: "object", requiredPaths: ["id", "application_id", "members"] });
    case "get-lobby":
      return getPlan(`lobbies/${lobbyId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "application_id", "members"] });
    case "modify-lobby":
      return bodyPlan("PATCH", `lobbies/${lobbyId(values)}`, auth, headers, lobbyBody(values), { type: "object", requiredPaths: ["id", "application_id", "members"] });
    case "delete-lobby":
      return deletePlan(`lobbies/${lobbyId(values)}`, auth, headers, { type: "object" });
    case "add-lobby-member":
      return bodyPlan("PUT", `lobbies/${lobbyId(values)}/members/${userId(values)}`, auth, headers, lobbyMemberBody(values), { type: "object", requiredPaths: ["id"] });
    case "bulk-update-lobby-members":
      return {
        method: "PUT",
        endpoint: `lobbies/${lobbyId(values)}/members`,
        auth,
        headers,
        body: {},
        bodyValue: requiredJsonArray(values.members, "members"),
        responseSchema: { type: "array" },
      };
    case "remove-lobby-member":
      return deletePlan(`lobbies/${lobbyId(values)}/members/${userId(values)}`, auth, headers, { type: "object" });
    case "leave-lobby":
      return deletePlan(`lobbies/${lobbyId(values)}/members/@me`, bearerAuth, headers, { type: "object" });
    case "link-channel-to-lobby":
      return bodyPlan("PATCH", `lobbies/${lobbyId(values)}/channel-linking`, bearerAuth, headers, lobbyChannelLinkBody(values), { type: "object", requiredPaths: ["id", "application_id", "members", "linked_channel"] });
    case "unlink-channel-from-lobby":
      return bodyPlan("PATCH", `lobbies/${lobbyId(values)}/channel-linking`, bearerAuth, headers, {}, { type: "object", requiredPaths: ["id", "application_id", "members"] });
    case "update-lobby-message-moderation-metadata":
      return bodyPlan("PUT", `lobbies/${lobbyId(values)}/messages/${messageId(values)}/moderation-metadata`, auth, headers, lobbyMessageModerationMetadataBody(values), { type: "object" });
    case "update-channel":
      return bodyPlan("PATCH", `channels/${channelId(values)}`, auth, headers, channelBody(values), { type: "object", requiredPaths: ["id", "type"] });
    case "set-voice-channel-status":
      return bodyPlan("PUT", `channels/${channelId(values)}/voice-status`, auth, auditHeaders(headers, values), voiceChannelStatusBody(values), { type: "object" });
    case "delete-channel":
      return deletePlan(`channels/${channelId(values)}`, auth, headers, { type: "object", requiredPaths: ["id"] });
    case "edit-channel-permissions":
      return bodyPlan("PUT", `channels/${channelId(values)}/permissions/${overwriteId(values)}`, auth, auditHeaders(headers, values), channelPermissionBody(values), { type: "object" });
    case "delete-channel-permission":
      return deletePlan(`channels/${channelId(values)}/permissions/${overwriteId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "follow-announcement-channel":
      return bodyPlan("POST", `channels/${channelId(values)}/followers`, auth, auditHeaders(headers, values), followAnnouncementChannelBody(values), { type: "object", requiredPaths: ["channel_id", "webhook_id"] });
    case "trigger-typing-indicator":
      return bodyPlan("POST", `channels/${channelId(values)}/typing`, auth, headers, {}, { type: "object" });
    case "group-dm-add-recipient":
      return bodyPlan("PUT", `channels/${channelId(values)}/recipients/${userId(values)}`, auth, headers, groupDmRecipientBody(values), { type: "object" });
    case "group-dm-remove-recipient":
      return deletePlan(`channels/${channelId(values)}/recipients/${userId(values)}`, auth, headers, { type: "object" });
    case "list-messages":
      return getPlan(`channels/${channelId(values)}/messages`, auth, headers, { type: "array" }, removeEmptyValues({
        around: optionalString(values.around),
        before: optionalString(values.before),
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "search-guild-messages":
      return getPlan(`guilds/${guildId(values)}/messages/search`, auth, headers, { type: "object", requiredPaths: ["doing_deep_historical_index", "total_results", "messages"] }, searchGuildMessagesQuery(values));
    case "get-message":
      return getPlan(`channels/${channelId(values)}/messages/${messageId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "send-message":
      return messagePlan("POST", `channels/${channelId(values)}/messages`, auth, headers, values, true, true, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "edit-message":
      return messagePlan("PATCH", `channels/${channelId(values)}/messages/${messageId(values)}`, auth, headers, values, false, false, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "delete-message":
      return deletePlan(`channels/${channelId(values)}/messages/${messageId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "bulk-delete-messages":
      return bodyPlan("POST", `channels/${channelId(values)}/messages/bulk-delete`, auth, auditHeaders(headers, values), {
        messages: requiredJsonArray(values.messages, "messages"),
      }, { type: "object" });
    case "crosspost-message":
      return bodyPlan("POST", `channels/${channelId(values)}/messages/${messageId(values)}/crosspost`, auth, headers, {}, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "list-pinned-messages":
      return getPlan(`channels/${channelId(values)}/messages/pins`, auth, headers, { type: "object", requiredPaths: ["items", "has_more"] }, removeEmptyValues({
        before: optionalString(values.before),
        limit: optionalNumber(values.limit),
      }));
    case "pin-message":
      return putPlan(`channels/${channelId(values)}/messages/pins/${messageId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "unpin-message":
      return deletePlan(`channels/${channelId(values)}/messages/pins/${messageId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
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
    case "delete-all-reactions":
      return deletePlan(`channels/${channelId(values)}/messages/${messageId(values)}/reactions`, auth, headers, { type: "object" });
    case "delete-all-reactions-for-emoji":
      return deletePlan(`channels/${channelId(values)}/messages/${messageId(values)}/reactions/${pathSegment(requiredString(values.emoji, "emoji"))}`, auth, headers, { type: "object" });
    case "get-answer-voters":
      return getPlan(`channels/${channelId(values)}/polls/${messageId(values)}/answers/${answerId(values)}`, auth, headers, { type: "object", requiredPaths: ["users"] }, removeEmptyValues({
        after: optionalString(values.after),
        limit: optionalNumber(values.limit),
      }));
    case "end-poll":
      return bodyPlan("POST", `channels/${channelId(values)}/polls/${messageId(values)}/expire`, auth, headers, {}, { type: "object", requiredPaths: ["id", "channel_id"] });
    case "start-thread-from-message":
      return bodyPlan("POST", `channels/${channelId(values)}/messages/${messageId(values)}/threads`, auth, headers, threadBody(values), { type: "object", requiredPaths: ["id", "type", "name"] });
    case "start-thread-without-message":
      return bodyPlan("POST", `channels/${channelId(values)}/threads`, auth, headers, threadBody(values), { type: "object", requiredPaths: ["id", "type", "name"] });
    case "start-thread-in-forum-or-media-channel":
      return bodyPlan("POST", `channels/${channelId(values)}/threads`, auth, auditHeaders(headers, values), forumThreadBody(values), { type: "object", requiredPaths: ["id", "type", "name", "message"] });
    case "list-active-threads":
      return getPlan(`guilds/${guildId(values)}/threads/active`, auth, headers, { type: "object", requiredPaths: ["threads"] });
    case "list-public-archived-threads":
      return getPlan(`channels/${channelId(values)}/threads/archived/public`, auth, headers, { type: "object", requiredPaths: ["threads", "members", "has_more"] }, archivedThreadQuery(values));
    case "list-private-archived-threads":
      return getPlan(`channels/${channelId(values)}/threads/archived/private`, auth, headers, { type: "object", requiredPaths: ["threads", "members", "has_more"] }, archivedThreadQuery(values));
    case "list-joined-private-archived-threads":
      return getPlan(`channels/${channelId(values)}/users/@me/threads/archived/private`, auth, headers, { type: "object", requiredPaths: ["threads", "members", "has_more"] }, archivedThreadQuery(values));
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
    case "add-guild-member":
      return bodyPlan("PUT", `guilds/${guildId(values)}/members/${userId(values)}`, auth, headers, addGuildMemberBody(values), { type: "object", requiredPaths: ["user"] });
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
      return bodyPlan("PATCH", `guilds/${guildId(values)}/members/${userId(values)}`, auth, auditHeaders(headers, values), memberBody(values), { type: "object", requiredPaths: ["user"] });
    case "modify-current-member":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/members/@me`, auth, auditHeaders(headers, values), currentMemberBody(values), { type: "object", requiredPaths: ["user"] });
    case "modify-current-user-nick":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/members/@me/nick`, auth, auditHeaders(headers, values), currentUserNickBody(values), { type: "object", requiredPaths: ["nick"] });
    case "remove-guild-member":
      return deletePlan(`guilds/${guildId(values)}/members/${userId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "list-guild-roles":
      return getPlan(`guilds/${guildId(values)}/roles`, auth, headers, { type: "array" });
    case "get-guild-role":
      return getPlan(`guilds/${guildId(values)}/roles/${roleId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "name"] });
    case "get-guild-role-member-counts":
      return getPlan(`guilds/${guildId(values)}/roles/member-counts`, auth, headers, { type: "object" });
    case "create-guild-role":
      return bodyPlan("POST", `guilds/${guildId(values)}/roles`, auth, auditHeaders(headers, values), roleBody(values, false), { type: "object", requiredPaths: ["id", "name"] });
    case "modify-guild-role-positions":
      return {
        method: "PATCH",
        endpoint: `guilds/${guildId(values)}/roles`,
        auth,
        headers: auditHeaders(headers, values),
        body: {},
        bodyValue: requiredJsonArray(values.positions, "positions"),
        responseSchema: { type: "array" },
      };
    case "update-guild-role":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/roles/${roleId(values)}`, auth, auditHeaders(headers, values), roleBody(values, true), { type: "object", requiredPaths: ["id", "name"] });
    case "delete-guild-role":
      return deletePlan(`guilds/${guildId(values)}/roles/${roleId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "add-guild-member-role":
      return putPlan(`guilds/${guildId(values)}/members/${userId(values)}/roles/${roleId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "remove-guild-member-role":
      return deletePlan(`guilds/${guildId(values)}/members/${userId(values)}/roles/${roleId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
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
    case "bulk-ban-guild-users":
      return bodyPlan("POST", `guilds/${guildId(values)}/bulk-ban`, auth, auditHeaders(headers, values), bulkGuildBanBody(values), { type: "object", requiredPaths: ["banned_users", "failed_users"] });
    case "get-guild-prune-count":
      return getPlan(`guilds/${guildId(values)}/prune`, auth, headers, { type: "object", requiredPaths: ["pruned"] }, guildPruneQuery(values));
    case "begin-guild-prune":
      return bodyPlan("POST", `guilds/${guildId(values)}/prune`, auth, auditHeaders(headers, values), beginGuildPruneBody(values), { type: "object", requiredPaths: ["pruned"] });
    case "get-guild-integrations":
      return getPlan(`guilds/${guildId(values)}/integrations`, auth, headers, { type: "array" });
    case "delete-guild-integration":
      return deletePlan(`guilds/${guildId(values)}/integrations/${integrationId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "get-guild-widget-settings":
      return getPlan(`guilds/${guildId(values)}/widget`, auth, headers, { type: "object", requiredPaths: ["enabled", "channel_id"] });
    case "modify-guild-widget":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/widget`, auth, auditHeaders(headers, values), guildWidgetBody(values), { type: "object", requiredPaths: ["enabled", "channel_id"] });
    case "get-guild-widget":
      return getPlan(`guilds/${guildId(values)}/widget.json`, auth, headers, { type: "object", requiredPaths: ["id", "name", "channels", "members", "presence_count"] });
    case "get-guild-widget-image":
      return {
        ...getPlan(`guilds/${guildId(values)}/widget.png`, [], { accept: "image/png" }, { type: "string" }, removeEmptyValues({
          style: optionalString(values.style),
        })),
        responseBodyEncoding: "base64",
      };
    case "get-guild-vanity-url":
      return getPlan(`guilds/${guildId(values)}/vanity-url`, auth, headers, { type: "object", requiredPaths: ["code", "uses"] });
    case "get-guild-welcome-screen":
      return getPlan(`guilds/${guildId(values)}/welcome-screen`, auth, headers, { type: "object", requiredPaths: ["welcome_channels", "description"] });
    case "modify-guild-welcome-screen":
      return bodyPlan("PATCH", `guilds/${guildId(values)}/welcome-screen`, auth, auditHeaders(headers, values), welcomeScreenBody(values), { type: "object", requiredPaths: ["welcome_channels", "description"] });
    case "get-guild-onboarding":
      return getPlan(`guilds/${guildId(values)}/onboarding`, auth, headers, { type: "object", requiredPaths: ["guild_id", "prompts", "default_channel_ids", "enabled", "mode"] });
    case "modify-guild-onboarding":
      return bodyPlan("PUT", `guilds/${guildId(values)}/onboarding`, auth, auditHeaders(headers, values), guildOnboardingBody(values), { type: "object", requiredPaths: ["guild_id", "prompts", "default_channel_ids", "enabled", "mode"] });
    case "modify-guild-incident-actions":
      return bodyPlan("PUT", `guilds/${guildId(values)}/incident-actions`, auth, headers, incidentActionsBody(values), { type: "object", requiredPaths: ["invites_disabled_until", "dms_disabled_until"] });
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
    case "list-channel-invites":
      return getPlan(`channels/${channelId(values)}/invites`, auth, headers, { type: "array" });
    case "create-channel-invite": {
      const plan = bodyPlan("POST", `channels/${channelId(values)}/invites`, auth, auditHeaders(headers, values), channelInviteBody(values), { type: "object", requiredPaths: ["code"] });
      return values.targetUsersFile == null ? plan : { ...plan, bodyEncoding: "multipart" };
    }
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
      return bodyPlan("POST", "stage-instances", auth, auditHeaders(headers, values), stageInstanceBody(values, true), { type: "object", requiredPaths: ["id", "channel_id", "topic"] });
    case "get-stage-instance":
      return getPlan(`stage-instances/${channelId(values)}`, auth, headers, { type: "object", requiredPaths: ["id", "channel_id", "topic"] });
    case "update-stage-instance":
      return bodyPlan("PATCH", `stage-instances/${channelId(values)}`, auth, auditHeaders(headers, values), stageInstanceBody(values, false), { type: "object", requiredPaths: ["id", "channel_id", "topic"] });
    case "delete-stage-instance":
      return deletePlan(`stage-instances/${channelId(values)}`, auth, auditHeaders(headers, values), { type: "object" });
    case "get-invite":
      return getPlan(`invites/${inviteCode(values)}`, auth, headers, { type: "object", requiredPaths: ["code"] }, removeEmptyValues({
        with_counts: values.withCounts,
        with_expiration: values.withExpiration,
        guild_scheduled_event_id: optionalString(values.guildScheduledEventId),
      }));
    case "delete-invite":
      return deletePlan(`invites/${inviteCode(values)}`, auth, headers, { type: "object", requiredPaths: ["code"] });
    case "get-invite-target-users":
      return {
        ...getPlan(`invites/${inviteCode(values)}/target-users`, auth, { accept: "text/csv" }, { type: "string" }),
        responseBodyEncoding: "text",
      };
    case "update-invite-target-users":
      return {
        method: "PUT",
        endpoint: `invites/${inviteCode(values)}/target-users`,
        auth,
        headers,
        body: {
          target_users_file: requiredString(firstValue(values.targetUsersFile, values.csv), "targetUsersFile"),
        },
        bodyEncoding: "multipart",
        responseSchema: { type: "null" },
      };
    case "get-invite-target-users-job-status":
      return getPlan(`invites/${inviteCode(values)}/target-users/job-status`, auth, headers, { type: "object", requiredPaths: ["status", "total_users", "processed_users", "created_at"] });
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
    case "get-webhook-with-token":
      return getPlan(`webhooks/${webhookId(values)}/${webhookToken(values)}`, [], headers, { type: "object", requiredPaths: ["id"] });
    case "update-webhook-with-token":
      return bodyPlan("PATCH", `webhooks/${webhookId(values)}/${webhookToken(values)}`, [], headers, webhookTokenBody(values), { type: "object", requiredPaths: ["id"] });
    case "delete-webhook-with-token":
      return deletePlan(`webhooks/${webhookId(values)}/${webhookToken(values)}`, [], headers, { type: "null" });
    case "execute-webhook":
      return webhookMessagePlan("POST", `webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}`, [], headers, values, true, { type: "object" }, removeEmptyValues({ wait: values.wait, thread_id: optionalString(values.threadId), with_components: values.withComponents }));
    case "execute-slack-compatible-webhook":
      return bodyPlan("POST", `webhooks/${webhookId(values)}/${webhookToken(values)}/slack`, [], headers, webhookServicePayload(values), { type: "object" }, webhookServiceQuery(values));
    case "execute-github-compatible-webhook":
      return bodyPlan("POST", `webhooks/${webhookId(values)}/${webhookToken(values)}/github`, [], headers, webhookServicePayload(values), { type: "object" }, webhookServiceQuery(values));
    case "get-webhook-message":
      return getPlan(`webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}/messages/${messageId(values)}`, [], headers, { type: "object", requiredPaths: ["id"] }, removeEmptyValues({ thread_id: optionalString(values.threadId) }));
    case "edit-webhook-message":
      return webhookMessagePlan("PATCH", `webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}/messages/${messageId(values)}`, [], headers, values, false, { type: "object", requiredPaths: ["id"] }, removeEmptyValues({ thread_id: optionalString(values.threadId), with_components: values.withComponents }));
    case "delete-webhook-message":
      return deletePlan(`webhooks/${webhookId(values)}/${pathSegment(requiredString(values.webhookToken, "webhookToken"))}/messages/${messageId(values)}`, [], headers, { type: "object" }, removeEmptyValues({ thread_id: optionalString(values.threadId) }));
    case "create-interaction-response":
      return bodyPlan("POST", `interactions/${interactionId(values)}/${interactionToken(values)}/callback`, [], headers, interactionResponseBody(values), { type: "object", requiredPaths: ["interaction"] }, removeEmptyValues({ with_response: values.withResponse }));
    case "get-original-interaction-response":
      return getPlan(`webhooks/${applicationId(values)}/${interactionToken(values)}/messages/@original`, [], headers, { type: "object", requiredPaths: ["id"] });
    case "edit-original-interaction-response":
      return webhookMessagePlan("PATCH", `webhooks/${applicationId(values)}/${interactionToken(values)}/messages/@original`, [], headers, values, false, { type: "object", requiredPaths: ["id"] });
    case "delete-original-interaction-response":
      return deletePlan(`webhooks/${applicationId(values)}/${interactionToken(values)}/messages/@original`, [], headers, { type: "object" });
    case "create-followup-message":
      return webhookMessagePlan("POST", `webhooks/${applicationId(values)}/${interactionToken(values)}`, [], headers, values, true, { type: "object", requiredPaths: ["id"] });
    case "get-followup-message":
      return getPlan(`webhooks/${applicationId(values)}/${interactionToken(values)}/messages/${messageId(values)}`, [], headers, { type: "object", requiredPaths: ["id"] });
    case "edit-followup-message":
      return webhookMessagePlan("PATCH", `webhooks/${applicationId(values)}/${interactionToken(values)}/messages/${messageId(values)}`, [], headers, values, false, { type: "object", requiredPaths: ["id"] });
    case "delete-followup-message":
      return deletePlan(`webhooks/${applicationId(values)}/${interactionToken(values)}/messages/${messageId(values)}`, [], headers, { type: "object" });
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
    case "bulk-overwrite-global-application-commands":
      return {
        method: "PUT",
        endpoint: `applications/${applicationId(values)}/commands`,
        auth,
        headers,
        body: {},
        bodyValue: requiredJsonArray(values.commands, "commands"),
        responseSchema: { type: "array" },
      };
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
    case "bulk-overwrite-guild-application-commands":
      return {
        method: "PUT",
        endpoint: `applications/${applicationId(values)}/guilds/${guildId(values)}/commands`,
        auth,
        headers,
        body: {},
        bodyValue: requiredJsonArray(values.commands, "commands"),
        responseSchema: { type: "array" },
      };
    case "get-guild-application-command-permissions":
      return getPlan(`applications/${applicationId(values)}/guilds/${guildId(values)}/commands/permissions`, bearerAuth, headers, { type: "array" });
    case "get-application-command-permissions":
      return getPlan(`applications/${applicationId(values)}/guilds/${guildId(values)}/commands/${commandId(values)}/permissions`, bearerAuth, headers, { type: "object", requiredPaths: ["id", "application_id", "guild_id", "permissions"] });
    case "edit-application-command-permissions":
      return bodyPlan("PUT", `applications/${applicationId(values)}/guilds/${guildId(values)}/commands/${commandId(values)}/permissions`, bearerAuth, headers, commandPermissionsBody(values), { type: "object", requiredPaths: ["id", "application_id", "guild_id", "permissions"] });
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
  "modify-current-user",
  "list-current-user-guilds",
  "get-current-user-guild-member",
  "leave-guild",
  "create-dm",
  "create-group-dm",
  "get-current-user-connections",
  "get-current-user-application-role-connection",
  "update-current-user-application-role-connection",
  "get-gateway",
  "get-gateway-bot",
  "get-current-bot-application-information",
  "get-current-authorization-information",
  "get-guild",
  "get-guild-preview",
  "modify-guild",
  "get-guild-voice-regions",
  "list-guild-channels",
  "create-guild-channel",
  "modify-guild-channel-positions",
  "get-guild-template",
  "list-guild-templates",
  "create-guild-template",
  "sync-guild-template",
  "update-guild-template",
  "delete-guild-template",
  "send-soundboard-sound",
  "list-default-soundboard-sounds",
  "list-guild-soundboard-sounds",
  "get-guild-soundboard-sound",
  "create-guild-soundboard-sound",
  "update-guild-soundboard-sound",
  "delete-guild-soundboard-sound",
  "get-current-application",
  "edit-current-application",
  "get-application-activity-instance",
  "get-application-role-connection-metadata",
  "update-application-role-connection-metadata",
  "list-entitlements",
  "get-entitlement",
  "consume-entitlement",
  "create-test-entitlement",
  "delete-test-entitlement",
  "list-skus",
  "list-sku-subscriptions",
  "get-sku-subscription",
  "get-guild-audit-log",
  "list-guild-emojis",
  "get-guild-emoji",
  "create-guild-emoji",
  "update-guild-emoji",
  "delete-guild-emoji",
  "get-sticker",
  "list-sticker-packs",
  "get-sticker-pack",
  "list-guild-stickers",
  "get-guild-sticker",
  "create-guild-sticker",
  "update-guild-sticker",
  "delete-guild-sticker",
  "list-voice-regions",
  "get-current-user-voice-state",
  "get-user-voice-state",
  "modify-current-user-voice-state",
  "modify-user-voice-state",
  "create-lobby",
  "get-lobby",
  "modify-lobby",
  "delete-lobby",
  "add-lobby-member",
  "bulk-update-lobby-members",
  "remove-lobby-member",
  "leave-lobby",
  "link-channel-to-lobby",
  "unlink-channel-from-lobby",
  "update-lobby-message-moderation-metadata",
  "get-channel",
  "update-channel",
  "set-voice-channel-status",
  "delete-channel",
  "edit-channel-permissions",
  "delete-channel-permission",
  "follow-announcement-channel",
  "trigger-typing-indicator",
  "group-dm-add-recipient",
  "group-dm-remove-recipient",
  "list-messages",
  "search-guild-messages",
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
  "delete-all-reactions",
  "delete-all-reactions-for-emoji",
  "get-answer-voters",
  "end-poll",
  "start-thread-from-message",
  "start-thread-without-message",
  "start-thread-in-forum-or-media-channel",
  "list-active-threads",
  "list-public-archived-threads",
  "list-private-archived-threads",
  "list-joined-private-archived-threads",
  "join-thread",
  "leave-thread",
  "add-thread-member",
  "remove-thread-member",
  "get-thread-member",
  "list-thread-members",
  "add-guild-member",
  "list-guild-members",
  "get-guild-member",
  "search-guild-members",
  "modify-guild-member",
  "modify-current-member",
  "modify-current-user-nick",
  "remove-guild-member",
  "list-guild-roles",
  "get-guild-role",
  "get-guild-role-member-counts",
  "create-guild-role",
  "modify-guild-role-positions",
  "update-guild-role",
  "delete-guild-role",
  "add-guild-member-role",
  "remove-guild-member-role",
  "list-guild-bans",
  "get-guild-ban",
  "create-guild-ban",
  "remove-guild-ban",
  "bulk-ban-guild-users",
  "get-guild-prune-count",
  "begin-guild-prune",
  "get-guild-integrations",
  "delete-guild-integration",
  "get-guild-widget-settings",
  "modify-guild-widget",
  "get-guild-widget",
  "get-guild-widget-image",
  "get-guild-vanity-url",
  "get-guild-welcome-screen",
  "modify-guild-welcome-screen",
  "get-guild-onboarding",
  "modify-guild-onboarding",
  "modify-guild-incident-actions",
  "list-auto-moderation-rules",
  "get-auto-moderation-rule",
  "create-auto-moderation-rule",
  "update-auto-moderation-rule",
  "delete-auto-moderation-rule",
  "list-guild-invites",
  "list-channel-invites",
  "create-channel-invite",
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
  "get-invite-target-users",
  "update-invite-target-users",
  "get-invite-target-users-job-status",
  "list-channel-webhooks",
  "list-guild-webhooks",
  "create-webhook",
  "get-webhook",
  "update-webhook",
  "delete-webhook",
  "get-webhook-with-token",
  "update-webhook-with-token",
  "delete-webhook-with-token",
  "execute-webhook",
  "execute-slack-compatible-webhook",
  "execute-github-compatible-webhook",
  "get-webhook-message",
  "edit-webhook-message",
  "delete-webhook-message",
  "create-interaction-response",
  "get-original-interaction-response",
  "edit-original-interaction-response",
  "delete-original-interaction-response",
  "create-followup-message",
  "get-followup-message",
  "edit-followup-message",
  "delete-followup-message",
  "list-global-application-commands",
  "create-global-application-command",
  "get-global-application-command",
  "update-global-application-command",
  "delete-global-application-command",
  "bulk-overwrite-global-application-commands",
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
  "bulk-overwrite-guild-application-commands",
  "get-guild-application-command-permissions",
  "get-application-command-permissions",
  "edit-application-command-permissions",
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

function messagePlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
  requireContent: boolean,
  includeReference: boolean,
  responseSchema: ResponseSchema,
): ConnectorRuntimeRequestPlan {
  const body = messageBody(values, requireContent, includeReference);
  const files = optionalFileArray(values.files);
  if (!files) return bodyPlan(method, endpoint, auth, headers, body, responseSchema);
  return {
    method,
    endpoint,
    auth,
    headers,
    bodyEncoding: "multipart",
    body: messageMultipartBody(body, files),
    responseSchema,
  };
}

function webhookMessagePlan(
  method: string,
  endpoint: string,
  auth: ConnectorRuntimeRequestPlan["auth"],
  headers: Record<string, string>,
  values: Record<string, IntegrationJson>,
  requireContent: boolean,
  responseSchema: ResponseSchema,
  query?: Record<string, IntegrationJson>,
): ConnectorRuntimeRequestPlan {
  const body = webhookMessageBody(values, requireContent);
  const files = optionalFileArray(values.files);
  if (!files) return bodyPlan(method, endpoint, auth, headers, body, responseSchema, query);
  return {
    method,
    endpoint,
    auth,
    headers,
    ...(query ? { query } : {}),
    bodyEncoding: "multipart",
    body: messageMultipartBody(body, files),
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

function guildBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: optionalString(values.name),
    verification_level: optionalNumber(values.verificationLevel),
    default_message_notifications: optionalNumber(values.defaultMessageNotifications),
    explicit_content_filter: optionalNumber(values.explicitContentFilter),
    afk_channel_id: optionalString(values.afkChannelId),
    afk_timeout: optionalNumber(values.afkTimeout),
    icon: optionalString(values.icon),
    owner_id: optionalString(values.ownerId),
    splash: optionalString(values.splash),
    discovery_splash: optionalString(values.discoverySplash),
    banner: optionalString(values.banner),
    system_channel_id: optionalString(values.systemChannelId),
    system_channel_flags: optionalNumber(values.systemChannelFlags),
    rules_channel_id: optionalString(values.rulesChannelId),
    public_updates_channel_id: optionalString(values.publicUpdatesChannelId),
    preferred_locale: optionalString(values.preferredLocale),
    features: optionalJsonArray(values.features),
    description: optionalString(values.description),
    premium_progress_bar_enabled: values.premiumProgressBarEnabled,
    safety_alerts_channel_id: optionalString(values.safetyAlertsChannelId),
  });
}

function voiceChannelStatusBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  if (Object.prototype.hasOwnProperty.call(values, "status") && values.status === null) return { status: null };
  return removeEmptyValues({
    status: optionalString(values.status),
  });
}

function voiceStateBody(values: Record<string, IntegrationJson>, includeRequestToSpeak: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    channel_id: optionalString(values.channelId),
    suppress: values.suppress,
    ...(includeRequestToSpeak ? { request_to_speak_timestamp: optionalString(values.requestToSpeakTimestamp) } : {}),
  });
}

function lobbyBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    metadata: optionalJsonObject(values.metadata),
    members: optionalJsonArray(values.members),
    idle_timeout_seconds: optionalNumber(values.idleTimeoutSeconds),
  });
}

function lobbyMemberBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    metadata: optionalJsonObject(values.metadata),
    flags: optionalNumber(values.flags),
  });
}

function lobbyChannelLinkBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    channel_id: requiredString(values.channelId, "channelId"),
  };
}

function lobbyMessageModerationMetadataBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return requiredJsonObject(values.metadata, "metadata");
}

function channelPermissionBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    allow: optionalString(values.allow),
    deny: optionalString(values.deny),
    type: optionalNumber(values.permissionType),
  });
}

function followAnnouncementChannelBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    webhook_channel_id: requiredString(firstValue(values.webhookChannelId, values.targetChannelId), "webhookChannelId"),
  };
}

function groupDmRecipientBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    access_token: requiredString(values.accessToken, "accessToken"),
    nick: optionalString(values.nick),
  });
}

function guildTemplateBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  const body = removeEmptyValues({
    name: requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name),
  });
  const description = optionalNullableStringField(values, "description");
  if (description !== undefined) body.description = description;
  return body;
}

function sendSoundboardSoundBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    sound_id: requiredString(firstValue(values.soundboardSoundId, values.soundId, values.soundboardSound), "soundboardSoundId"),
    source_guild_id: optionalString(values.sourceGuildId),
  });
}

function soundboardSoundBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  const emojiId = requireCreateFields ? optionalNullableStringField(values, "emojiId") : optionalString(values.emojiId);
  const body: Record<string, IntegrationJson> = removeEmptyValues({
    name: requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name),
    sound: requireCreateFields ? requiredString(values.sound, "sound") : undefined,
  });
  const volume = requireCreateFields ? optionalNullableNumberField(values, "volume") : optionalNumber(values.volume);
  if (volume !== undefined) body.volume = volume;
  if (emojiId !== undefined) body.emoji_id = emojiId;
  const emojiName = requireCreateFields ? optionalNullableStringField(values, "emojiName") : optionalString(values.emojiName);
  if (!emojiId && emojiName !== undefined) body.emoji_name = emojiName;
  return body;
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

function stickerBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name),
    description: requireCreateFields ? requiredString(values.description, "description") : optionalString(values.description),
    tags: requireCreateFields ? requiredString(values.tags, "tags") : optionalString(values.tags),
    file: requireCreateFields ? requiredString(values.file, "file") : undefined,
  });
}

function messageBody(values: Record<string, IntegrationJson>, requireContent: boolean, includeReference: boolean): Record<string, IntegrationJson> {
  const content = firstValue(values.content, values.text);
  return removeEmptyValues({
    content: requireContent ? requiredString(content, "content") : optionalString(content),
    nonce: optionalString(values.nonce),
    tts: values.tts,
    embeds: optionalJsonArray(values.embeds),
    components: optionalJsonArray(values.components),
    allowed_mentions: optionalJsonObject(values.allowedMentions),
    sticker_ids: requireContent ? optionalJsonArray(firstValue(values.stickerIds, values.sticker_ids)) : undefined,
    attachments: optionalJsonArray(values.attachments),
    flags: optionalNumber(values.flags),
    enforce_nonce: requireContent ? values.enforceNonce : undefined,
    poll: requireContent ? optionalJsonObject(values.poll) : undefined,
    shared_client_theme: requireContent ? optionalJsonObject(firstValue(values.sharedClientTheme, values.shared_client_theme)) : undefined,
    message_reference: includeReference ? messageReference(values) : undefined,
  });
}

function messageMultipartBody(body: Record<string, IntegrationJson>, files: IntegrationJson[]): Record<string, IntegrationJson> {
  const formBody: Record<string, IntegrationJson> = {
    payload_json: JSON.stringify(body),
  };
  files.forEach((file, index) => {
    formBody[`files[${index}]`] = file;
  });
  return formBody;
}

function webhookMessageBody(values: Record<string, IntegrationJson>, requireContent: boolean): Record<string, IntegrationJson> {
  const content = firstValue(values.content, values.text);
  return removeEmptyValues({
    content: requireContent ? requiredString(content, "content") : optionalString(content),
    username: requireContent ? optionalString(values.username) : undefined,
    avatar_url: requireContent ? optionalString(firstValue(values.avatarUrl, values.avatar_url)) : undefined,
    tts: values.tts,
    embeds: optionalJsonArray(values.embeds),
    allowed_mentions: optionalJsonObject(values.allowedMentions),
    components: optionalJsonArray(values.components),
    attachments: optionalJsonArray(values.attachments),
    flags: optionalNumber(values.flags),
    thread_name: requireContent ? optionalString(firstValue(values.threadName, values.thread_name)) : undefined,
    applied_tags: requireContent ? optionalJsonArray(firstValue(values.appliedTags, values.applied_tags)) : undefined,
    poll: optionalJsonObject(values.poll),
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

function searchGuildMessagesQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    limit: optionalNumber(values.limit),
    offset: optionalNumber(values.offset),
    max_id: optionalString(firstValue(values.maxId, values.max_id)),
    min_id: optionalString(firstValue(values.minId, values.min_id)),
    slop: optionalNumber(values.slop),
    content: optionalString(values.content),
    channel_id: optionalArrayQuery(firstValue(values.channelIds, values.channel_id)),
    author_type: optionalArrayQuery(firstValue(values.authorTypes, values.author_type)),
    author_id: optionalArrayQuery(firstValue(values.authorIds, values.author_id)),
    mentions: optionalArrayQuery(values.mentions),
    mentions_role_id: optionalArrayQuery(firstValue(values.mentionRoleIds, values.mentions_role_id)),
    mention_everyone: values.mentionEveryone,
    replied_to_user_id: optionalArrayQuery(firstValue(values.repliedToUserIds, values.replied_to_user_id)),
    replied_to_message_id: optionalArrayQuery(firstValue(values.repliedToMessageIds, values.replied_to_message_id)),
    pinned: values.pinned,
    has: optionalArrayQuery(values.has),
    embed_type: optionalArrayQuery(firstValue(values.embedTypes, values.embed_type)),
    embed_provider: optionalArrayQuery(firstValue(values.embedProviders, values.embed_provider)),
    link_hostname: optionalArrayQuery(firstValue(values.linkHostnames, values.link_hostname)),
    attachment_filename: optionalArrayQuery(firstValue(values.attachmentFilenames, values.attachment_filename)),
    attachment_extension: optionalArrayQuery(firstValue(values.attachmentExtensions, values.attachment_extension)),
    sort_by: optionalString(firstValue(values.sortBy, values.sort_by)),
    sort_order: optionalString(firstValue(values.sortOrder, values.sort_order)),
    include_nsfw: values.includeNsfw,
  });
}

function currentUserBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    username: optionalString(values.username),
    avatar: optionalString(values.avatar),
    banner: optionalString(values.banner),
  });
}

function directMessageBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    recipient_id: requiredString(firstValue(values.recipientId, values.userId, values.recipient), "recipientId"),
  };
}

function groupDmBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    access_tokens: requiredJsonArray(values.accessTokens, "accessTokens"),
    nicks: requiredJsonObject(values.nicks, "nicks"),
  };
}

function userApplicationRoleConnectionBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    platform_name: optionalString(values.platformName),
    platform_username: optionalString(values.platformUsername),
    metadata: optionalJsonObject(values.metadata),
  });
}

function interactionResponseBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    type: requiredNumber(firstValue(values.responseType, values.type), "responseType"),
    data: optionalJsonObject(firstValue(values.responseData, values.data)),
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

function forumThreadBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requiredString(values.name, "name"),
    auto_archive_duration: optionalNumber(values.autoArchiveDuration),
    rate_limit_per_user: optionalNumber(values.rateLimitPerUser),
    message: requiredJsonObject(values.message, "message"),
    applied_tags: optionalJsonArray(values.appliedTags),
  });
}

function archivedThreadQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    before: optionalString(values.before),
    limit: optionalNumber(values.limit),
  });
}

function memberBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  const body: Record<string, IntegrationJson> = {};
  const assign = (key: string, value: IntegrationJson | undefined) => {
    if (value !== undefined && value !== "") body[key] = value;
  };
  assign("nick", optionalNullableStringField(values, "nick"));
  assign("roles", optionalNullableJsonArrayField(values, "roles"));
  assign("mute", values.mute);
  assign("deaf", values.deaf);
  assign("channel_id", optionalNullableStringField(values, "voiceChannelId", "channelId"));
  assign("communication_disabled_until", optionalNullableStringField(values, "communicationDisabledUntil"));
  assign("flags", optionalNullableNumberField(values, "flags"));
  return body;
}

function addGuildMemberBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    access_token: requiredString(values.accessToken, "accessToken"),
    nick: optionalString(values.nick),
    roles: optionalJsonArray(values.roles),
    mute: values.mute,
    deaf: values.deaf,
  });
}

function currentMemberBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    nick: optionalString(values.nick),
    avatar: optionalString(values.avatar),
    banner: optionalString(values.banner),
    bio: optionalString(values.bio),
  });
}

function currentUserNickBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    nick: requiredString(values.nick, "nick"),
  };
}

function bulkGuildBanBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    user_ids: requiredJsonArray(values.userIds, "userIds"),
    delete_message_seconds: optionalNumber(values.deleteMessageSeconds),
  });
}

function guildPruneQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    days: optionalNumber(values.days),
    include_roles: optionalCommaDelimited(values.includeRoles),
  });
}

function beginGuildPruneBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    days: optionalNumber(values.days),
    compute_prune_count: values.computePruneCount,
    include_roles: optionalJsonArray(values.includeRoles),
  });
}

function guildWidgetBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    enabled: values.enabled,
    channel_id: optionalString(values.channelId),
  });
}

function welcomeScreenBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    enabled: values.enabled,
    welcome_channels: optionalJsonArray(values.welcomeChannels),
    description: optionalString(values.description),
  });
}

function guildOnboardingBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    prompts: optionalJsonArray(values.prompts),
    default_channel_ids: optionalJsonArray(values.defaultChannelIds),
    enabled: values.enabled,
    mode: optionalNumber(values.mode),
  });
}

function incidentActionsBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  const body: Record<string, IntegrationJson> = {};
  const invitesDisabledUntil = optionalNullableString(values.invitesDisabledUntil);
  const dmsDisabledUntil = optionalNullableString(values.dmsDisabledUntil);
  if (invitesDisabledUntil !== undefined) body.invites_disabled_until = invitesDisabledUntil;
  if (dmsDisabledUntil !== undefined) body.dms_disabled_until = dmsDisabledUntil;
  return body;
}

function roleBody(values: Record<string, IntegrationJson>, preserveNulls: boolean): Record<string, IntegrationJson> {
  if (preserveNulls) {
    const body: Record<string, IntegrationJson> = {};
    const assign = (key: string, value: IntegrationJson | undefined) => {
      if (value !== undefined && value !== "") body[key] = value;
    };
    assign("name", optionalNullableStringField(values, "name"));
    assign("permissions", optionalNullableStringField(values, "permissions"));
    assign("color", optionalNullableNumberField(values, "color"));
    if (Object.prototype.hasOwnProperty.call(values, "colors")) assign("colors", optionalNullableJsonObject(values.colors));
    if (Object.prototype.hasOwnProperty.call(values, "hoist")) assign("hoist", values.hoist);
    assign("icon", optionalNullableStringField(values, "icon"));
    assign("unicode_emoji", optionalNullableStringField(values, "unicodeEmoji"));
    if (Object.prototype.hasOwnProperty.call(values, "mentionable")) assign("mentionable", values.mentionable);
    return body;
  }
  return removeEmptyValues({
    name: optionalString(values.name),
    permissions: optionalString(values.permissions),
    color: optionalNumber(values.color),
    colors: optionalJsonObject(values.colors),
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

function webhookTokenBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: optionalString(values.name),
    avatar: optionalString(values.avatar),
  });
}

function webhookServicePayload(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return requiredJsonObject(firstValue(values.payload, values.body), "payload");
}

function webhookServiceQuery(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    wait: values.wait,
    thread_id: optionalString(values.threadId),
  });
}

function channelInviteBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    max_age: optionalNumber(values.maxAge),
    max_uses: optionalNumber(values.maxUses),
    temporary: values.temporary,
    unique: values.unique,
    target_type: optionalNumber(values.targetType),
    target_user_id: optionalString(values.targetUserId),
    target_application_id: optionalString(values.targetApplicationId),
    target_users_file: optionalString(values.targetUsersFile),
    role_ids: optionalJsonArray(values.roleIds),
  });
}

function applicationCommandBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    name: requiredString(values.name, "name"),
    name_localizations: optionalJsonObject(values.nameLocalizations),
    description: optionalString(values.description),
    description_localizations: optionalJsonObject(values.descriptionLocalizations),
    type: optionalNumber(values.type),
    options: optionalJsonArray(values.options),
    default_member_permissions: optionalString(values.defaultMemberPermissions),
    dm_permission: values.dmPermission,
    default_permission: values.defaultPermission,
    nsfw: values.nsfw,
    integration_types: optionalJsonArray(values.integrationTypes),
    contexts: optionalJsonArray(values.contexts),
    handler: optionalNumber(values.handler),
  });
}

function commandPermissionsBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    permissions: requiredJsonArray(values.permissions, "permissions"),
  };
}

function currentApplicationBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return removeEmptyValues({
    custom_install_url: optionalString(values.customInstallUrl),
    description: optionalString(values.description),
    role_connections_verification_url: optionalString(values.roleConnectionsVerificationUrl),
    install_params: optionalJsonObject(values.installParams),
    integration_types_config: optionalJsonObject(values.integrationTypesConfig),
    flags: optionalNumber(values.flags),
    icon: optionalString(values.icon),
    cover_image: optionalString(values.coverImage),
    interactions_endpoint_url: optionalString(values.interactionsEndpointUrl),
    tags: optionalJsonArray(values.tags),
    event_webhooks_url: optionalString(values.eventWebhooksUrl),
    event_webhooks_status: optionalNumber(values.eventWebhooksStatus),
    event_webhooks_types: optionalJsonArray(values.eventWebhooksTypes),
  });
}

function testEntitlementBody(values: Record<string, IntegrationJson>): Record<string, IntegrationJson> {
  return {
    sku_id: requiredString(firstValue(values.skuId, values.sku), "skuId"),
    owner_id: requiredString(firstValue(values.ownerId, values.userId, values.guildId), "ownerId"),
    owner_type: requiredNumber(values.ownerType, "ownerType"),
  };
}

function scheduledEventBody(values: Record<string, IntegrationJson>, requireCreateFields: boolean): Record<string, IntegrationJson> {
  const body: Record<string, IntegrationJson> = {};
  const assign = (key: string, value: IntegrationJson | undefined) => {
    if (value !== undefined && value !== "") body[key] = value;
  };
  assign("channel_id", requireCreateFields ? optionalString(values.channelId) : optionalNullableString(values.channelId));
  assign("entity_metadata", requireCreateFields ? optionalJsonObject(values.entityMetadata) : optionalNullableJsonObject(values.entityMetadata));
  assign("name", requireCreateFields ? requiredString(values.name, "name") : optionalString(values.name));
  assign("privacy_level", requireCreateFields ? optionalNumber(values.privacyLevel) ?? 2 : optionalNumber(values.privacyLevel));
  assign(
    "scheduled_start_time",
    requireCreateFields ? requiredString(values.scheduledStartTime, "scheduledStartTime") : optionalString(values.scheduledStartTime),
  );
  assign("scheduled_end_time", optionalString(values.scheduledEndTime));
  assign("description", requireCreateFields ? optionalString(values.description) : optionalNullableString(values.description));
  assign("entity_type", requireCreateFields ? optionalNumber(values.entityType) ?? 3 : optionalNumber(values.entityType));
  assign("status", optionalNumber(values.status));
  assign("image", optionalString(values.image));
  assign("recurrence_rule", requireCreateFields ? optionalJsonObject(values.recurrenceRule) : optionalNullableJsonObject(values.recurrenceRule));
  return body;
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

function overwriteId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.overwriteId, values.permissionOverwriteId, values.targetId), "overwriteId"));
}

function messageId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.messageId, values.message), "messageId"));
}

function answerId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.answerId, values.pollAnswerId), "answerId"));
}

function userId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.userId, values.user), "userId"));
}

function roleId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.roleId, values.role), "roleId"));
}

function integrationId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.integrationId, values.integration), "integrationId"));
}

function webhookId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.webhookId, values.webhook), "webhookId"));
}

function webhookToken(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.webhookToken, values.token), "webhookToken"));
}

function inviteCode(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.inviteCode, values.invite), "inviteCode"));
}

function applicationId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.applicationId, values.application), "applicationId"));
}

function interactionId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.interactionId, values.interaction), "interactionId"));
}

function interactionToken(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.interactionToken, values.token), "interactionToken"));
}

function instanceId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.instanceId, values.instance), "instanceId"));
}

function commandId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.commandId, values.command), "commandId"));
}

function entitlementId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.entitlementId, values.entitlement), "entitlementId"));
}

function skuId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.skuId, values.sku), "skuId"));
}

function subscriptionId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.subscriptionId, values.subscription), "subscriptionId"));
}

function lobbyId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.lobbyId, values.lobby), "lobbyId"));
}

function emojiId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.emojiId, values.emoji), "emojiId"));
}

function stickerId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.stickerId, values.sticker), "stickerId"));
}

function stickerPackId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.stickerPackId, values.stickerPack), "stickerPackId"));
}

function templateCode(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.templateCode, values.template), "templateCode"));
}

function soundboardSoundId(values: Record<string, IntegrationJson>): string {
  return pathSegment(requiredString(firstValue(values.soundboardSoundId, values.soundId, values.soundboardSound), "soundboardSoundId"));
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

function requiredNumber(value: IntegrationJson, name: string): number {
  const parsed = optionalNumber(value);
  if (parsed == null) throw new Error(`Discord ${name} is required`);
  return parsed;
}

function optionalString(value: IntegrationJson): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function optionalNullableString(value: IntegrationJson): string | null | undefined {
  if (value === null) return null;
  return optionalString(value);
}

function optionalNullableStringField(values: Record<string, IntegrationJson>, ...keys: string[]): string | null | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return optionalNullableString(values[key]);
  }
  return undefined;
}

function optionalNumber(value: IntegrationJson): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function optionalNullableNumberField(values: Record<string, IntegrationJson>, key: string): number | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return undefined;
  if (values[key] === null) return null;
  return optionalNumber(values[key]);
}

function optionalJsonArray(value: IntegrationJson): IntegrationJson[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function optionalNullableJsonArrayField(values: Record<string, IntegrationJson>, key: string): IntegrationJson[] | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) return undefined;
  if (values[key] === null) return null;
  return optionalJsonArray(values[key]);
}

function optionalFileArray(value: IntegrationJson): IntegrationJson[] | undefined {
  if (Array.isArray(value) && value.length) return value;
  const file = optionalString(value);
  return file ? [file] : undefined;
}

function optionalArrayQuery(value: IntegrationJson): IntegrationJson | undefined {
  return optionalJsonArray(value) ?? optionalString(value);
}

function optionalCommaDelimited(value: IntegrationJson): string | undefined {
  if (Array.isArray(value)) {
    const entries = value.map((entry) => optionalString(entry)).filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join(",") : undefined;
  }
  return optionalString(value);
}

function requiredJsonArray(value: IntegrationJson, name: string): IntegrationJson[] {
  const parsed = optionalJsonArray(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

function requiredJsonObject(value: IntegrationJson, name: string): Record<string, IntegrationJson> {
  const parsed = optionalJsonObject(value);
  if (!parsed) throw new Error(`Discord ${name} is required`);
  return parsed;
}

function optionalJsonObject(value: IntegrationJson): Record<string, IntegrationJson> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, IntegrationJson>
    : undefined;
}

function optionalNullableJsonObject(value: IntegrationJson): Record<string, IntegrationJson> | null | undefined {
  if (value === null) return null;
  return optionalJsonObject(value);
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
