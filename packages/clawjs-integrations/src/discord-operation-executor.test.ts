import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildDiscordOperationRequest,
} from "./discord-operation-executor.ts";

const GUILD_FIELD = field("guildId", "string");
const CHANNEL_FIELD = field("channelId", "string");
const OVERWRITE_FIELD = field("overwriteId", "string");
const MESSAGE_FIELD = field("messageId", "string");
const ANSWER_FIELD = field("answerId", "string");
const USER_FIELD = field("userId", "string");
const ROLE_FIELD = field("roleId", "string");
const INTEGRATION_FIELD = field("integrationId", "string");
const WEBHOOK_FIELD = field("webhookId", "string");
const WEBHOOK_TOKEN_FIELD = field("webhookToken", "string");
const APPLICATION_FIELD = field("applicationId", "string");
const INTERACTION_FIELD = field("interactionId", "string");
const INTERACTION_TOKEN_FIELD = field("interactionToken", "string");
const INSTANCE_FIELD = field("instanceId", "string");
const COMMAND_FIELD = field("commandId", "string");
const ENTITLEMENT_FIELD = field("entitlementId", "string");
const SKU_FIELD = field("skuId", "string");
const SUBSCRIPTION_FIELD = field("subscriptionId", "string");
const TEMPLATE_CODE_FIELD = field("templateCode", "string");
const SOUNDBOARD_SOUND_FIELD = field("soundboardSoundId", "string");
const STICKER_FIELD = field("stickerId", "string");
const STICKER_PACK_FIELD = field("stickerPackId", "string");
const LOBBY_FIELD = field("lobbyId", "string");
const AUTO_MODERATION_RULE_FIELD = field("autoModerationRuleId", "string");
const AUTO_MODERATION_ACTIONS_FIELD = field("actions", "array", false, { default: [{ type: 1, metadata: { custom_message: "sample" } }] });
const AUTO_MODERATION_TRIGGER_METADATA_FIELD = field("triggerMetadata", "object", true, { default: { keyword_filter: ["sample"] } });
const APPLICATION_COMMAND_METADATA_FIELDS = [
  field("nameLocalizations", "object", true, { default: null }),
  field("descriptionLocalizations", "object", true, { default: null }),
  field("defaultMemberPermissions", "string", true, { default: null }),
  field("defaultPermission", "boolean", true, { default: null }),
  field("dmPermission", "boolean", true, { default: null }),
  field("integrationTypes", "array", true, { default: null }),
  field("contexts", "array", true, { default: null }),
  field("type", "integer", true, { default: null }),
  field("nsfw", "boolean", true, { default: null }),
  field("handler", "integer", true, { default: null }),
];
const WEBHOOK_CREATE_MESSAGE_FIELDS = [
  field("content", "string"),
  field("username", "string", true, { default: null }),
  field("avatarUrl", "string", true, { default: null }),
  field("tts", "boolean", true, { default: null }),
  field("embeds", "array", true, { default: null }),
  field("allowedMentions", "object", true, { default: null }),
  field("components", "array", true, { default: null }),
  field("attachments", "array", true, { default: null }),
  field("files", "array", true, { default: null }),
  field("flags", "integer", true, { default: null }),
  field("threadName", "string", true, { default: null }),
  field("appliedTags", "array", true, { default: null }),
  field("poll", "object", true, { default: null }),
];
const WEBHOOK_EDIT_MESSAGE_FIELDS = [
  field("content", "string", true, { default: "sample" }),
  field("embeds", "array", true, { default: null }),
  field("allowedMentions", "object", true, { default: null }),
  field("components", "array", true, { default: null }),
  field("attachments", "array", true, { default: null }),
  field("files", "array", true, { default: null }),
  field("flags", "integer", true, { default: null }),
  field("poll", "object", true, { default: null }),
];
const ROLE_CREATE_FIELDS = [
  field("name", "string", true, { default: "sample" }),
  field("permissions", "string", true, { default: "0" }),
  field("color", "integer", true, { default: 1 }),
  field("colors", "object", true, { default: { primary_color: 1, secondary_color: null, tertiary_color: null } }),
  field("hoist", "boolean", true, { default: false }),
  field("icon", "string", true, { default: "data:image/png;base64,c2FtcGxl" }),
  field("unicodeEmoji", "string", true, { default: "sample" }),
  field("mentionable", "boolean", true, { default: false }),
  field("auditLogReason", "string", true),
];
const ROLE_UPDATE_FIELDS = [
  field("name", "string", true, { default: null }),
  field("permissions", "string", true, { default: null }),
  field("color", "integer", true, { default: null }),
  field("colors", "object", true, { default: null }),
  field("hoist", "boolean", true, { default: null }),
  field("icon", "string", true, { default: null }),
  field("unicodeEmoji", "string", true, { default: null }),
  field("mentionable", "boolean", true, { default: null }),
  field("auditLogReason", "string", true),
];
const CHANNEL_CREATE_FIELDS = [
  GUILD_FIELD,
  field("name", "string"),
  field("type", "integer", true, { default: null }),
  field("topic", "string", true, { default: null }),
  field("bitrate", "integer", true, { default: null }),
  field("userLimit", "integer", true, { default: null }),
  field("rateLimitPerUser", "integer", true, { default: null }),
  field("position", "integer", true, { default: null }),
  field("permissionOverwrites", "array", true, { default: null }),
  field("parentId", "string", true, { default: null }),
  field("nsfw", "boolean", true, { default: null }),
  field("rtcRegion", "string", true, { default: null }),
  field("videoQualityMode", "integer", true, { default: null }),
  field("defaultAutoArchiveDuration", "integer", true, { default: null }),
  field("defaultReactionEmoji", "object", true, { default: null }),
  field("availableTags", "array", true, { default: null }),
  field("defaultSortOrder", "integer", true, { default: null }),
  field("defaultForumLayout", "integer", true, { default: null }),
  field("defaultThreadRateLimitPerUser", "integer", true, { default: null }),
  field("auditLogReason", "string", true),
];
const CHANNEL_UPDATE_FIELDS = [
  CHANNEL_FIELD,
  field("name", "string", true, { default: "sample" }),
  field("icon", "string", true, { default: null }),
  field("type", "integer", true, { default: 5 }),
  field("position", "integer", true, { default: 1 }),
  field("topic", "string", true, { default: null }),
  field("nsfw", "boolean", true, { default: false }),
  field("rateLimitPerUser", "integer", true, { default: 5 }),
  field("bitrate", "integer", true, { default: 64000 }),
  field("userLimit", "integer", true, { default: 25 }),
  field("permissionOverwrites", "array", true, { default: [{ id: "sample", type: 0, allow: "0", deny: null }] }),
  field("parentId", "string", true, { default: null }),
  field("rtcRegion", "string", true, { default: null }),
  field("videoQualityMode", "integer", true, { default: 2 }),
  field("defaultAutoArchiveDuration", "integer", true, { default: 1440 }),
  field("flags", "integer", true, { default: 16 }),
  field("availableTags", "array", true, { default: [{ name: "sample", moderated: false, emoji_id: null, emoji_name: "sample" }] }),
  field("defaultReactionEmoji", "object", true, { default: null }),
  field("defaultThreadRateLimitPerUser", "integer", true, { default: 10 }),
  field("defaultSortOrder", "integer", true, { default: null }),
  field("defaultForumLayout", "integer", true, { default: 2 }),
  field("archived", "boolean", true, { default: false }),
  field("autoArchiveDuration", "integer", true, { default: 1440 }),
  field("locked", "boolean", true, { default: false }),
  field("invitable", "boolean", true, { default: true }),
  field("appliedTags", "array", true, { default: ["sample"] }),
  field("auditLogReason", "string", true),
];

const DISCORD_ACTIONS = [
  action("get-current-user", "Get Current User", []),
  action("get-user", "Get User", [USER_FIELD]),
  action("modify-current-user", "Modify Current User", [field("username", "string", true, { default: "sample" }), field("avatar", "string", true), field("banner", "string", true)]),
  action("list-current-user-guilds", "List Current User Guilds", pagingFields()),
  action("get-current-user-guild-member", "Get Current User Guild Member", [GUILD_FIELD], ["discordBearerToken"]),
  action("leave-guild", "Leave Guild", [GUILD_FIELD], ["discordBearerToken"]),
  action("create-dm", "Create DM", [field("recipientId", "string")]),
  action("create-group-dm", "Create Group DM", [field("accessTokens", "array", false, { default: ["sample"] }), field("nicks", "object", false, { default: { sample: "sample" } })], ["discordBearerToken"]),
  action("get-current-user-connections", "Get Current User Connections", [], ["discordBearerToken"]),
  action("get-current-user-application-role-connection", "Get Current User Application Role Connection", [APPLICATION_FIELD], ["discordBearerToken"]),
  action("update-current-user-application-role-connection", "Update Current User Application Role Connection", [APPLICATION_FIELD, field("platformName", "string", true, { default: "sample" }), field("platformUsername", "string", true, { default: "sample" }), field("metadata", "object", true, { default: { score: "100" } })], ["discordBearerToken"]),
  action("get-gateway", "Get Gateway", [], []),
  action("get-gateway-bot", "Get Gateway Bot", []),
  action("get-current-bot-application-information", "Get Current Bot Application Information", []),
  action("get-current-authorization-information", "Get Current Authorization Information", [], ["discordBearerToken"]),
  action("get-guild", "Get Guild", [GUILD_FIELD, field("withCounts", "boolean", true)]),
  action("get-guild-preview", "Get Guild Preview", [GUILD_FIELD]),
  action("modify-guild", "Modify Guild", [GUILD_FIELD, field("name", "string", true, { default: "sample" }), field("verificationLevel", "integer", true, { default: 1 }), field("defaultMessageNotifications", "integer", true, { default: 1 }), field("explicitContentFilter", "integer", true, { default: 1 }), field("afkChannelId", "string", true, { default: "sample" }), field("afkTimeout", "integer", true, { default: 60 }), field("icon", "string", true, { default: "data:image/png;base64,c2FtcGxl" }), field("ownerId", "string", true, { default: "sample" }), field("splash", "string", true, { default: "data:image/png;base64,c2FtcGxl" }), field("discoverySplash", "string", true, { default: "data:image/png;base64,c2FtcGxl" }), field("banner", "string", true, { default: "data:image/png;base64,c2FtcGxl" }), field("systemChannelId", "string", true, { default: "sample" }), field("systemChannelFlags", "integer", true, { default: 0 }), field("rulesChannelId", "string", true, { default: "sample" }), field("publicUpdatesChannelId", "string", true, { default: "sample" }), field("preferredLocale", "string", true, { default: "en-US" }), field("features", "array", true, { default: ["COMMUNITY"] }), field("description", "string", true, { default: "sample" }), field("premiumProgressBarEnabled", "boolean", true, { default: true }), field("safetyAlertsChannelId", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("get-guild-voice-regions", "Get Guild Voice Regions", [GUILD_FIELD]),
  action("list-guild-channels", "List Guild Channels", [GUILD_FIELD]),
  action("create-guild-channel", "Create Guild Channel", CHANNEL_CREATE_FIELDS),
  action("modify-guild-channel-positions", "Modify Guild Channel Positions", [GUILD_FIELD, field("positions", "array", false, { default: [{ id: "sample", position: 1, lock_permissions: false, parent_id: "sample" }] }), field("auditLogReason", "string", true)]),
  action("get-guild-template", "Get Guild Template", [TEMPLATE_CODE_FIELD]),
  action("list-guild-templates", "List Guild Templates", [GUILD_FIELD]),
  action("create-guild-template", "Create Guild Template", [GUILD_FIELD, field("name", "string"), field("description", "string", true, { default: null })]),
  action("sync-guild-template", "Sync Guild Template", [GUILD_FIELD, TEMPLATE_CODE_FIELD]),
  action("update-guild-template", "Update Guild Template", [GUILD_FIELD, TEMPLATE_CODE_FIELD, field("name", "string", true, { default: "sample" }), field("description", "string", true, { default: null })]),
  action("delete-guild-template", "Delete Guild Template", [GUILD_FIELD, TEMPLATE_CODE_FIELD]),
  action("send-soundboard-sound", "Send Soundboard Sound", [CHANNEL_FIELD, SOUNDBOARD_SOUND_FIELD, field("sourceGuildId", "string", true)]),
  action("list-default-soundboard-sounds", "List Default Soundboard Sounds", []),
  action("list-guild-soundboard-sounds", "List Guild Soundboard Sounds", [GUILD_FIELD]),
  action("get-guild-soundboard-sound", "Get Guild Soundboard Sound", [GUILD_FIELD, SOUNDBOARD_SOUND_FIELD]),
  action("create-guild-soundboard-sound", "Create Guild Soundboard Sound", [GUILD_FIELD, field("name", "string"), field("sound", "string", false, { default: "data:audio/mpeg;base64,c2FtcGxl" }), field("volume", "number", true, { default: null }), field("emojiId", "string", true, { default: null }), field("emojiName", "string", true, { default: null }), field("auditLogReason", "string", true)]),
  action("update-guild-soundboard-sound", "Update Guild Soundboard Sound", [GUILD_FIELD, SOUNDBOARD_SOUND_FIELD, field("name", "string", true, { default: "sample" }), field("volume", "number", true, { default: 1 }), field("emojiId", "string", true), field("emojiName", "string", true), field("auditLogReason", "string", true)]),
  action("delete-guild-soundboard-sound", "Delete Guild Soundboard Sound", [GUILD_FIELD, SOUNDBOARD_SOUND_FIELD, field("auditLogReason", "string", true)]),
  action("get-current-application", "Get Current Application", []),
  action("edit-current-application", "Edit Current Application", [field("customInstallUrl", "string", true), field("description", "string", true, { default: "sample" }), field("roleConnectionsVerificationUrl", "string", true), field("installParams", "object", true), field("integrationTypesConfig", "object", true), field("flags", "integer", true), field("icon", "string", true), field("coverImage", "string", true), field("interactionsEndpointUrl", "string", true), field("tags", "array", true, { default: ["sample"] }), field("eventWebhooksUrl", "string", true), field("eventWebhooksStatus", "integer", true, { default: 1 }), field("eventWebhooksTypes", "array", true)]),
  action("get-application-activity-instance", "Get Application Activity Instance", [APPLICATION_FIELD, INSTANCE_FIELD]),
  action("get-application-role-connection-metadata", "Get Application Role Connection Metadata", [APPLICATION_FIELD]),
  action("update-application-role-connection-metadata", "Update Application Role Connection Metadata", [APPLICATION_FIELD, field("records", "array", false, { default: [{ type: 2, key: "score", name: "Score", description: "Sample score" }] })]),
  action("list-entitlements", "List Entitlements", [APPLICATION_FIELD, field("userId", "string", true), field("skuIds", "array", true, { default: ["sample"] }), field("before", "string", true), field("after", "string", true), field("limit", "integer", true, { default: 1, min: 1, max: 100 }), field("guildId", "string", true), field("excludeEnded", "boolean", true), field("excludeDeleted", "boolean", true)]),
  action("get-entitlement", "Get Entitlement", [APPLICATION_FIELD, ENTITLEMENT_FIELD]),
  action("consume-entitlement", "Consume Entitlement", [APPLICATION_FIELD, ENTITLEMENT_FIELD]),
  action("create-test-entitlement", "Create Test Entitlement", [APPLICATION_FIELD, SKU_FIELD, field("ownerId", "string"), field("ownerType", "integer", false, { default: 1, min: 1, max: 2 })]),
  action("delete-test-entitlement", "Delete Test Entitlement", [APPLICATION_FIELD, ENTITLEMENT_FIELD]),
  action("list-skus", "List SKUs", [APPLICATION_FIELD]),
  action("list-sku-subscriptions", "List SKU Subscriptions", [SKU_FIELD, USER_FIELD, field("before", "string", true), field("after", "string", true), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("get-sku-subscription", "Get SKU Subscription", [SKU_FIELD, SUBSCRIPTION_FIELD]),
  action("get-guild-audit-log", "Get Guild Audit Log", [GUILD_FIELD, USER_FIELD, field("actionType", "integer", true, { default: 1 }), field("before", "string", true), field("after", "string", true), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("list-guild-emojis", "List Guild Emojis", [GUILD_FIELD]),
  action("get-guild-emoji", "Get Guild Emoji", [GUILD_FIELD, field("emojiId", "string")]),
  action("create-guild-emoji", "Create Guild Emoji", [GUILD_FIELD, field("name", "string"), field("image", "string", false, { default: "data:image/png;base64,c2FtcGxl" }), field("roles", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("update-guild-emoji", "Update Guild Emoji", [GUILD_FIELD, field("emojiId", "string"), field("name", "string", true, { default: "sample" }), field("roles", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("delete-guild-emoji", "Delete Guild Emoji", [GUILD_FIELD, field("emojiId", "string"), field("auditLogReason", "string", true)]),
  action("get-sticker", "Get Sticker", [STICKER_FIELD]),
  action("list-sticker-packs", "List Sticker Packs", []),
  action("get-sticker-pack", "Get Sticker Pack", [STICKER_PACK_FIELD]),
  action("list-guild-stickers", "List Guild Stickers", [GUILD_FIELD]),
  action("get-guild-sticker", "Get Guild Sticker", [GUILD_FIELD, STICKER_FIELD]),
  action("create-guild-sticker", "Create Guild Sticker", [GUILD_FIELD, field("name", "string"), field("description", "string"), field("tags", "string"), field("file", "string", false, { default: "sample-file" }), field("auditLogReason", "string", true)]),
  action("update-guild-sticker", "Update Guild Sticker", [GUILD_FIELD, STICKER_FIELD, field("name", "string", true, { default: "sample" }), field("description", "string", true, { default: "sample" }), field("tags", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("delete-guild-sticker", "Delete Guild Sticker", [GUILD_FIELD, STICKER_FIELD, field("auditLogReason", "string", true)]),
  action("list-voice-regions", "List Voice Regions", []),
  action("get-current-user-voice-state", "Get Current User Voice State", [GUILD_FIELD]),
  action("get-user-voice-state", "Get User Voice State", [GUILD_FIELD, USER_FIELD]),
  action("modify-current-user-voice-state", "Modify Current User Voice State", [GUILD_FIELD, CHANNEL_FIELD, field("suppress", "boolean", true), field("requestToSpeakTimestamp", "string", true)]),
  action("modify-user-voice-state", "Modify User Voice State", [GUILD_FIELD, USER_FIELD, CHANNEL_FIELD, field("suppress", "boolean", true)]),
  action("create-lobby", "Create Lobby", [field("metadata", "object", true, { default: { topic: "sample" } }), field("members", "array", true, { default: [{ id: "sample" }] }), field("idleTimeoutSeconds", "integer", true, { default: 5, min: 5, max: 604800 })]),
  action("get-lobby", "Get Lobby", [LOBBY_FIELD]),
  action("modify-lobby", "Modify Lobby", [LOBBY_FIELD, field("metadata", "object", true, { default: { topic: "sample" } }), field("members", "array", true, { default: [{ id: "sample" }] }), field("idleTimeoutSeconds", "integer", true, { default: 5, min: 5, max: 604800 })]),
  action("delete-lobby", "Delete Lobby", [LOBBY_FIELD]),
  action("add-lobby-member", "Add Lobby Member", [LOBBY_FIELD, USER_FIELD, field("metadata", "object", true, { default: { role: "sample" } }), field("flags", "integer", true, { default: 1 })]),
  action("bulk-update-lobby-members", "Bulk Update Lobby Members", [LOBBY_FIELD, field("members", "array", false, { default: [{ id: "sample", metadata: { role: "sample" }, flags: 1, remove_member: false }] })]),
  action("remove-lobby-member", "Remove Lobby Member", [LOBBY_FIELD, USER_FIELD]),
  action("leave-lobby", "Leave Lobby", [LOBBY_FIELD], ["discordBearerToken"]),
  action("link-channel-to-lobby", "Link Channel to Lobby", [LOBBY_FIELD, CHANNEL_FIELD], ["discordBearerToken"]),
  action("unlink-channel-from-lobby", "Unlink Channel from Lobby", [LOBBY_FIELD], ["discordBearerToken"]),
  action("update-lobby-message-moderation-metadata", "Update Lobby Message Moderation Metadata", [LOBBY_FIELD, MESSAGE_FIELD, field("metadata", "object", false, { default: { action: "show" } })]),
  action("get-channel", "Get Channel", [CHANNEL_FIELD]),
  action("update-channel", "Update Channel", CHANNEL_UPDATE_FIELDS),
  action("set-voice-channel-status", "Set Voice Channel Status", [CHANNEL_FIELD, field("status", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("delete-channel", "Delete Channel", [CHANNEL_FIELD, field("auditLogReason", "string", true)]),
  action("edit-channel-permissions", "Edit Channel Permissions", [CHANNEL_FIELD, OVERWRITE_FIELD, field("allow", "string", true, { default: "0" }), field("deny", "string", true, { default: "0" }), field("permissionType", "integer", false, { default: 0, min: 0, max: 1 }), field("auditLogReason", "string", true)]),
  action("delete-channel-permission", "Delete Channel Permission", [CHANNEL_FIELD, OVERWRITE_FIELD, field("auditLogReason", "string", true)]),
  action("follow-announcement-channel", "Follow Announcement Channel", [CHANNEL_FIELD, field("webhookChannelId", "string"), field("auditLogReason", "string", true)]),
  action("trigger-typing-indicator", "Trigger Typing Indicator", [CHANNEL_FIELD]),
  action("group-dm-add-recipient", "Group DM Add Recipient", [CHANNEL_FIELD, USER_FIELD, field("accessToken", "string", false, { default: "sample-access-token" }), field("nick", "string", true, { default: "sample" })]),
  action("group-dm-remove-recipient", "Group DM Remove Recipient", [CHANNEL_FIELD, USER_FIELD]),
  action("list-messages", "List Messages", [CHANNEL_FIELD, field("around", "string", true, { default: null }), field("before", "string", true, { default: null }), field("after", "string", true, { default: null }), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("search-guild-messages", "Search Guild Messages", [
    GUILD_FIELD,
    field("content", "string", true, { default: "sample" }),
    field("limit", "integer", true, { default: 1, min: 1, max: 25 }),
    field("offset", "integer", true, { default: null }),
    field("maxId", "string", true, { default: null }),
    field("minId", "string", true, { default: null }),
    field("slop", "integer", true, { default: null }),
    field("channelIds", "array", true, { default: null }),
    field("authorTypes", "array", true, { default: null }),
    field("authorIds", "array", true, { default: null }),
    field("mentions", "array", true, { default: null }),
    field("mentionRoleIds", "array", true, { default: null }),
    field("mentionEveryone", "boolean", true, { default: null }),
    field("repliedToUserIds", "array", true, { default: null }),
    field("repliedToMessageIds", "array", true, { default: null }),
    field("pinned", "boolean", true, { default: null }),
    field("has", "array", true, { default: null }),
    field("embedTypes", "array", true, { default: null }),
    field("embedProviders", "array", true, { default: null }),
    field("linkHostnames", "array", true, { default: null }),
    field("attachmentFilenames", "array", true, { default: null }),
    field("attachmentExtensions", "array", true, { default: null }),
    field("sortBy", "string", true, { default: null }),
    field("sortOrder", "string", true, { default: null }),
    field("includeNsfw", "boolean", true, { default: null }),
  ]),
  action("get-message", "Get Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("send-message", "Send Message", [
    CHANNEL_FIELD,
    field("content", "string"),
    field("nonce", "string", true, { default: null }),
    field("tts", "boolean", true, { default: null }),
    field("embeds", "array", true, { default: null }),
    field("components", "array", true, { default: null }),
    field("allowedMentions", "object", true, { default: null }),
    field("stickerIds", "array", true, { default: null }),
    field("attachments", "array", true, { default: null }),
    field("files", "array", true, { default: null }),
    field("flags", "integer", true, { default: null }),
    field("enforceNonce", "boolean", true, { default: null }),
    field("poll", "object", true, { default: null }),
    field("sharedClientTheme", "object", true, { default: null }),
    field("messageId", "string", true),
    field("guildId", "string", true),
  ]),
  action("edit-message", "Edit Message", [
    CHANNEL_FIELD,
    MESSAGE_FIELD,
    field("content", "string", true, { default: "sample" }),
    field("embeds", "array", true, { default: null }),
    field("components", "array", true, { default: null }),
    field("allowedMentions", "object", true, { default: null }),
    field("attachments", "array", true, { default: null }),
    field("files", "array", true, { default: null }),
    field("flags", "integer", true, { default: null }),
  ]),
  action("delete-message", "Delete Message", [CHANNEL_FIELD, MESSAGE_FIELD, field("auditLogReason", "string", true)]),
  action("bulk-delete-messages", "Bulk Delete Messages", [CHANNEL_FIELD, field("messages", "array", false, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("crosspost-message", "Crosspost Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("list-pinned-messages", "List Pinned Messages", [CHANNEL_FIELD, field("before", "string", true, { default: null }), field("limit", "integer", true, { default: 1, min: 1, max: 50 })]),
  action("pin-message", "Pin Message", [CHANNEL_FIELD, MESSAGE_FIELD, field("auditLogReason", "string", true)]),
  action("unpin-message", "Unpin Message", [CHANNEL_FIELD, MESSAGE_FIELD, field("auditLogReason", "string", true)]),
  action("create-reaction", "Create Reaction", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("delete-own-reaction", "Delete Own Reaction", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("delete-user-reaction", "Delete User Reaction", [CHANNEL_FIELD, MESSAGE_FIELD, USER_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("list-reactions", "List Reactions", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" }), field("after", "string", true, { default: null }), field("limit", "integer", true, { default: 1, min: 1, max: 100 }), field("type", "integer", true, { default: null, min: 0, max: 1 })]),
  action("delete-all-reactions", "Delete All Reactions", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("delete-all-reactions-for-emoji", "Delete All Reactions For Emoji", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("get-answer-voters", "Get Answer Voters", [CHANNEL_FIELD, MESSAGE_FIELD, ANSWER_FIELD, field("after", "string", true), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("end-poll", "End Poll", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("start-thread-from-message", "Start Thread From Message", [CHANNEL_FIELD, MESSAGE_FIELD, field("name", "string")]),
  action("start-thread-without-message", "Start Thread Without Message", [CHANNEL_FIELD, field("name", "string"), field("type", "integer", true, { default: 11 })]),
  action("start-thread-in-forum-or-media-channel", "Start Thread In Forum Or Media Channel", [CHANNEL_FIELD, field("name", "string"), field("autoArchiveDuration", "integer", true, { default: 60 }), field("rateLimitPerUser", "integer", true, { default: 0 }), field("message", "object", false, { default: { content: "sample" } }), field("appliedTags", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("list-active-threads", "List Active Threads", [GUILD_FIELD]),
  action("list-public-archived-threads", "List Public Archived Threads", [CHANNEL_FIELD, field("before", "string", true, { default: "2026-05-13T10:00:00.000Z" }), field("limit", "integer", true, { default: 1, min: 1 })]),
  action("list-private-archived-threads", "List Private Archived Threads", [CHANNEL_FIELD, field("before", "string", true, { default: "2026-05-13T10:00:00.000Z" }), field("limit", "integer", true, { default: 1, min: 1 })]),
  action("list-joined-private-archived-threads", "List Joined Private Archived Threads", [CHANNEL_FIELD, field("before", "string", true), field("limit", "integer", true, { default: 1, min: 1 })]),
  action("join-thread", "Join Thread", [CHANNEL_FIELD]),
  action("leave-thread", "Leave Thread", [CHANNEL_FIELD]),
  action("add-thread-member", "Add Thread Member", [CHANNEL_FIELD, USER_FIELD]),
  action("remove-thread-member", "Remove Thread Member", [CHANNEL_FIELD, USER_FIELD]),
  action("get-thread-member", "Get Thread Member", [CHANNEL_FIELD, USER_FIELD, field("withMember", "boolean", true)]),
  action("list-thread-members", "List Thread Members", [CHANNEL_FIELD, field("withMember", "boolean", true), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("add-guild-member", "Add Guild Member", [GUILD_FIELD, USER_FIELD, field("accessToken", "string", false, { default: "sample-access-token" }), field("nick", "string", true, { default: "sample" }), field("roles", "array", true, { default: ["sample"] }), field("mute", "boolean", true), field("deaf", "boolean", true)]),
  action("list-guild-members", "List Guild Members", [GUILD_FIELD, field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("get-guild-member", "Get Guild Member", [GUILD_FIELD, USER_FIELD]),
  action("search-guild-members", "Search Guild Members", [GUILD_FIELD, field("query", "string"), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("modify-guild-member", "Modify Guild Member", [GUILD_FIELD, USER_FIELD, field("nick", "string", true, { default: "sample" }), field("roles", "array", true), field("mute", "boolean", true), field("deaf", "boolean", true), field("voiceChannelId", "string", true), field("communicationDisabledUntil", "string", true), field("flags", "integer", true), field("auditLogReason", "string", true)]),
  action("modify-current-member", "Modify Current Member", [GUILD_FIELD, field("nick", "string", true, { default: "sample" }), field("avatar", "string", true, { default: "data:image/png;base64,c2FtcGxl" }), field("banner", "string", true, { default: "data:image/png;base64,c2FtcGxl" }), field("bio", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("modify-current-user-nick", "Modify Current User Nick", [GUILD_FIELD, field("nick", "string"), field("auditLogReason", "string", true)]),
  action("remove-guild-member", "Remove Guild Member", [GUILD_FIELD, USER_FIELD, field("auditLogReason", "string", true)]),
  action("list-guild-roles", "List Guild Roles", [GUILD_FIELD]),
  action("get-guild-role", "Get Guild Role", [GUILD_FIELD, ROLE_FIELD]),
  action("get-guild-role-member-counts", "Get Guild Role Member Counts", [GUILD_FIELD]),
  action("create-guild-role", "Create Guild Role", [GUILD_FIELD, ...ROLE_CREATE_FIELDS]),
  action("modify-guild-role-positions", "Modify Guild Role Positions", [GUILD_FIELD, field("positions", "array", false, { default: [{ id: "sample", position: 1 }] }), field("auditLogReason", "string", true)]),
  action("update-guild-role", "Update Guild Role", [GUILD_FIELD, ROLE_FIELD, ...ROLE_UPDATE_FIELDS]),
  action("delete-guild-role", "Delete Guild Role", [GUILD_FIELD, ROLE_FIELD, field("auditLogReason", "string", true)]),
  action("add-guild-member-role", "Add Guild Member Role", [GUILD_FIELD, USER_FIELD, ROLE_FIELD, field("auditLogReason", "string", true)]),
  action("remove-guild-member-role", "Remove Guild Member Role", [GUILD_FIELD, USER_FIELD, ROLE_FIELD, field("auditLogReason", "string", true)]),
  action("list-guild-bans", "List Guild Bans", [GUILD_FIELD, field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("get-guild-ban", "Get Guild Ban", [GUILD_FIELD, USER_FIELD]),
  action("create-guild-ban", "Create Guild Ban", [GUILD_FIELD, USER_FIELD, field("deleteMessageSeconds", "integer", true, { default: 0, min: 0 })]),
  action("remove-guild-ban", "Remove Guild Ban", [GUILD_FIELD, USER_FIELD]),
  action("bulk-ban-guild-users", "Bulk Ban Guild Users", [GUILD_FIELD, field("userIds", "array", false, { default: ["sample"] }), field("deleteMessageSeconds", "integer", true, { default: 0, min: 0 }), field("auditLogReason", "string", true)]),
  action("get-guild-prune-count", "Get Guild Prune Count", [GUILD_FIELD, field("days", "integer", true, { default: 7, min: 1 }), field("includeRoles", "array", true, { default: ["sample"] })]),
  action("begin-guild-prune", "Begin Guild Prune", [GUILD_FIELD, field("days", "integer", true, { default: 7, min: 1 }), field("computePruneCount", "boolean", true, { default: true }), field("includeRoles", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("get-guild-integrations", "Get Guild Integrations", [GUILD_FIELD]),
  action("delete-guild-integration", "Delete Guild Integration", [GUILD_FIELD, INTEGRATION_FIELD, field("auditLogReason", "string", true)]),
  action("get-guild-widget-settings", "Get Guild Widget Settings", [GUILD_FIELD]),
  action("modify-guild-widget", "Modify Guild Widget", [GUILD_FIELD, field("enabled", "boolean", true, { default: true }), field("channelId", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("get-guild-widget", "Get Guild Widget", [GUILD_FIELD]),
  action("get-guild-vanity-url", "Get Guild Vanity URL", [GUILD_FIELD]),
  action("get-guild-welcome-screen", "Get Guild Welcome Screen", [GUILD_FIELD]),
  action("modify-guild-welcome-screen", "Modify Guild Welcome Screen", [GUILD_FIELD, field("enabled", "boolean", true, { default: true }), field("welcomeChannels", "array", true, { default: [{ channel_id: "sample", description: "sample" }] }), field("description", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("get-guild-onboarding", "Get Guild Onboarding", [GUILD_FIELD]),
  action("modify-guild-onboarding", "Modify Guild Onboarding", [GUILD_FIELD, field("prompts", "array", true, { default: [{ id: "sample", type: 0, options: [], title: "sample", single_select: true, required: false, in_onboarding: true }] }), field("defaultChannelIds", "array", true, { default: ["sample"] }), field("enabled", "boolean", true, { default: true }), field("mode", "integer", true, { default: 0 }), field("auditLogReason", "string", true)]),
  action("modify-guild-incident-actions", "Modify Guild Incident Actions", [GUILD_FIELD, field("invitesDisabledUntil", "string", true, { default: null }), field("dmsDisabledUntil", "string", true, { default: "2026-05-13T14:00:00.000Z" })]),
  action("list-auto-moderation-rules", "List Auto Moderation Rules", [GUILD_FIELD]),
  action("get-auto-moderation-rule", "Get Auto Moderation Rule", [GUILD_FIELD, AUTO_MODERATION_RULE_FIELD]),
  action("create-auto-moderation-rule", "Create Auto Moderation Rule", [GUILD_FIELD, field("name", "string"), field("eventType", "integer", false, { default: 1 }), field("triggerType", "integer", false, { default: 1 }), AUTO_MODERATION_TRIGGER_METADATA_FIELD, AUTO_MODERATION_ACTIONS_FIELD, field("enabled", "boolean", true), field("exemptRoles", "array", true, { default: ["sample"] }), field("exemptChannels", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("update-auto-moderation-rule", "Update Auto Moderation Rule", [GUILD_FIELD, AUTO_MODERATION_RULE_FIELD, field("name", "string", true, { default: "sample" }), field("eventType", "integer", true, { default: 1 }), AUTO_MODERATION_TRIGGER_METADATA_FIELD, field("actions", "array", true, { default: [{ type: 1, metadata: { custom_message: "sample" } }] }), field("enabled", "boolean", true), field("exemptRoles", "array", true, { default: ["sample"] }), field("exemptChannels", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("delete-auto-moderation-rule", "Delete Auto Moderation Rule", [GUILD_FIELD, AUTO_MODERATION_RULE_FIELD, field("auditLogReason", "string", true)]),
  action("list-guild-invites", "List Guild Invites", [GUILD_FIELD]),
  action("list-channel-invites", "List Channel Invites", [CHANNEL_FIELD]),
  action("create-channel-invite", "Create Channel Invite", [CHANNEL_FIELD, field("maxAge", "integer", true, { default: 86400, min: 0, max: 604800 }), field("maxUses", "integer", true, { default: 0, min: 0, max: 100 }), field("temporary", "boolean", true), field("unique", "boolean", true), field("targetType", "integer", true, { default: null }), field("targetUserId", "string", true, { default: null }), field("targetApplicationId", "string", true, { default: null }), field("payloadJson", "string", true, { default: "{\"max_age\":3600}" }), field("roleIds", "array", true, { default: null }), field("auditLogReason", "string", true)]),
  action("list-guild-scheduled-events", "List Guild Scheduled Events", [GUILD_FIELD, field("withUserCount", "boolean", true)]),
  action("create-guild-scheduled-event", "Create Guild Scheduled Event", [
    GUILD_FIELD,
    field("channelId", "string", true, { default: "sample" }),
    field("entityMetadata", "object", true),
    field("name", "string"),
    field("privacyLevel", "integer", false, { default: 2 }),
    field("scheduledStartTime", "string", false, { default: "2026-05-13T10:00:00.000Z" }),
    field("scheduledEndTime", "string", true, { default: "2026-05-13T11:00:00.000Z" }),
    field("entityType", "integer", false, { default: 2 }),
    field("description", "string", true, { default: "sample" }),
    field("image", "string", true, { default: null }),
    field("recurrenceRule", "object", true),
    field("auditLogReason", "string", true),
  ]),
  action("get-guild-scheduled-event", "Get Guild Scheduled Event", [GUILD_FIELD, field("guildScheduledEventId", "string"), field("withUserCount", "boolean", true)]),
  action("update-guild-scheduled-event", "Update Guild Scheduled Event", [
    GUILD_FIELD,
    field("guildScheduledEventId", "string"),
    field("channelId", "string", true, { default: "sample" }),
    field("entityMetadata", "object", true),
    field("name", "string", true, { default: "sample" }),
    field("privacyLevel", "integer", true, { default: 2 }),
    field("scheduledStartTime", "string", true, { default: "2026-05-13T10:00:00.000Z" }),
    field("scheduledEndTime", "string", true, { default: "2026-05-13T11:00:00.000Z" }),
    field("entityType", "integer", true, { default: 2 }),
    field("description", "string", true, { default: "sample" }),
    field("status", "integer", true, { default: 2 }),
    field("image", "string", true, { default: null }),
    field("recurrenceRule", "object", true),
    field("auditLogReason", "string", true),
  ]),
  action("delete-guild-scheduled-event", "Delete Guild Scheduled Event", [GUILD_FIELD, field("guildScheduledEventId", "string")]),
  action("list-guild-scheduled-event-users", "List Guild Scheduled Event Users", [GUILD_FIELD, field("guildScheduledEventId", "string"), field("limit", "integer", true, { default: 1, min: 1, max: 100 }), field("withMember", "boolean", true), field("before", "string", true, { default: null }), field("after", "string", true, { default: null })]),
  action("create-stage-instance", "Create Stage Instance", [CHANNEL_FIELD, field("topic", "string"), field("privacyLevel", "integer", true, { default: 2 }), field("sendStartNotification", "boolean", true), field("guildScheduledEventId", "string", true), field("auditLogReason", "string", true)]),
  action("get-stage-instance", "Get Stage Instance", [CHANNEL_FIELD]),
  action("update-stage-instance", "Update Stage Instance", [CHANNEL_FIELD, field("topic", "string", true, { default: "sample" }), field("privacyLevel", "integer", true, { default: 2 }), field("auditLogReason", "string", true)]),
  action("delete-stage-instance", "Delete Stage Instance", [CHANNEL_FIELD, field("auditLogReason", "string", true)]),
  action("get-invite", "Get Invite", [field("inviteCode", "string"), field("withCounts", "boolean", true), field("withExpiration", "boolean", true), field("guildScheduledEventId", "string", true, { default: null })]),
  action("delete-invite", "Delete Invite", [field("inviteCode", "string")]),
  action("get-invite-target-users", "Get Invite Target Users", [field("inviteCode", "string")]),
  action("update-invite-target-users", "Update Invite Target Users", [field("inviteCode", "string"), field("targetUsersFile", "string", false, { default: "user_id\n123" })]),
  action("get-invite-target-users-job-status", "Get Invite Target Users Job Status", [field("inviteCode", "string")]),
  action("list-channel-webhooks", "List Channel Webhooks", [CHANNEL_FIELD]),
  action("list-guild-webhooks", "List Guild Webhooks", [GUILD_FIELD]),
  action("create-webhook", "Create Webhook", [CHANNEL_FIELD, field("name", "string"), field("avatar", "string", true), field("auditLogReason", "string", true)]),
  action("get-webhook", "Get Webhook", [WEBHOOK_FIELD]),
  action("update-webhook", "Update Webhook", [WEBHOOK_FIELD, field("name", "string", true, { default: "sample" }), field("avatar", "string", true), field("targetChannelId", "string", true), field("auditLogReason", "string", true)]),
  action("delete-webhook", "Delete Webhook", [WEBHOOK_FIELD, field("auditLogReason", "string", true)]),
  action("get-webhook-with-token", "Get Webhook With Token", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []),
  action("update-webhook-with-token", "Update Webhook With Token", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, field("name", "string", true, { default: "sample" }), field("avatar", "string", true)], []),
  action("delete-webhook-with-token", "Delete Webhook With Token", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []),
  action("execute-webhook", "Execute Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, ...WEBHOOK_CREATE_MESSAGE_FIELDS, field("wait", "boolean", true), field("threadId", "string", true, { default: null }), field("withComponents", "boolean", true)], []),
  action("execute-slack-compatible-webhook", "Execute Slack-Compatible Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, field("payload", "object", false, { default: { text: "sample" } }), field("wait", "boolean", true), field("threadId", "string", true)], []),
  action("execute-github-compatible-webhook", "Execute GitHub-Compatible Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, field("payload", "object", false, { default: { ref: "refs/heads/main" } }), field("wait", "boolean", true), field("threadId", "string", true)], []),
  action("get-webhook-message", "Get Webhook Message", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, MESSAGE_FIELD, field("threadId", "string", true)], []),
  action("edit-webhook-message", "Edit Webhook Message", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, MESSAGE_FIELD, ...WEBHOOK_EDIT_MESSAGE_FIELDS, field("threadId", "string", true, { default: null }), field("withComponents", "boolean", true)], []),
  action("delete-webhook-message", "Delete Webhook Message", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, MESSAGE_FIELD, field("threadId", "string", true)], []),
  action("create-interaction-response", "Create Interaction Response", [INTERACTION_FIELD, INTERACTION_TOKEN_FIELD, field("responseType", "integer", false, { default: 4 }), field("responseData", "object", true, { default: { content: "sample" } }), field("withResponse", "boolean", true)], []),
  action("get-original-interaction-response", "Get Original Interaction Response", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD], []),
  action("edit-original-interaction-response", "Edit Original Interaction Response", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD, ...WEBHOOK_EDIT_MESSAGE_FIELDS], []),
  action("delete-original-interaction-response", "Delete Original Interaction Response", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD], []),
  action("create-followup-message", "Create Followup Message", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD, ...WEBHOOK_CREATE_MESSAGE_FIELDS], []),
  action("get-followup-message", "Get Followup Message", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD, MESSAGE_FIELD], []),
  action("edit-followup-message", "Edit Followup Message", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD, MESSAGE_FIELD, ...WEBHOOK_EDIT_MESSAGE_FIELDS], []),
  action("delete-followup-message", "Delete Followup Message", [APPLICATION_FIELD, INTERACTION_TOKEN_FIELD, MESSAGE_FIELD], []),
  action("list-global-application-commands", "List Global Application Commands", [APPLICATION_FIELD]),
  action("create-global-application-command", "Create Global Application Command", [APPLICATION_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" }), ...APPLICATION_COMMAND_METADATA_FIELDS]),
  action("get-global-application-command", "Get Global Application Command", [APPLICATION_FIELD, COMMAND_FIELD]),
  action("update-global-application-command", "Update Global Application Command", [APPLICATION_FIELD, COMMAND_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" }), ...APPLICATION_COMMAND_METADATA_FIELDS]),
  action("delete-global-application-command", "Delete Global Application Command", [APPLICATION_FIELD, COMMAND_FIELD]),
  action("bulk-overwrite-global-application-commands", "Bulk Overwrite Global Application Commands", [APPLICATION_FIELD, field("commands", "array", false, { default: [{ name: "sample", description: "sample", type: 1 }] })]),
  action("list-application-emojis", "List Application Emojis", [APPLICATION_FIELD]),
  action("get-application-emoji", "Get Application Emoji", [APPLICATION_FIELD, field("emojiId", "string")]),
  action("create-application-emoji", "Create Application Emoji", [APPLICATION_FIELD, field("name", "string"), field("image", "string", false, { default: "data:image/png;base64,c2FtcGxl" })]),
  action("update-application-emoji", "Update Application Emoji", [APPLICATION_FIELD, field("emojiId", "string"), field("name", "string", true, { default: "sample" })]),
  action("delete-application-emoji", "Delete Application Emoji", [APPLICATION_FIELD, field("emojiId", "string")]),
  action("list-guild-application-commands", "List Guild Application Commands", [APPLICATION_FIELD, GUILD_FIELD]),
  action("create-guild-application-command", "Create Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" }), ...APPLICATION_COMMAND_METADATA_FIELDS]),
  action("get-guild-application-command", "Get Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD]),
  action("update-guild-application-command", "Update Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" }), ...APPLICATION_COMMAND_METADATA_FIELDS]),
  action("delete-guild-application-command", "Delete Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD]),
  action("bulk-overwrite-guild-application-commands", "Bulk Overwrite Guild Application Commands", [APPLICATION_FIELD, GUILD_FIELD, field("commands", "array", false, { default: [{ name: "sample", description: "sample", type: 1 }] })]),
  action("get-guild-application-command-permissions", "Get Guild Application Command Permissions", [APPLICATION_FIELD, GUILD_FIELD], ["discordBearerToken"]),
  action("get-application-command-permissions", "Get Application Command Permissions", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD], ["discordBearerToken"]),
  action("edit-application-command-permissions", "Edit Application Command Permissions", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD, field("permissions", "array", false, { default: [{ id: "sample", type: 1, permission: true }] })], ["discordBearerToken"]),
];

const DISCORD_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "discord",
    name: "Discord",
    authFieldNames: ["discordBotToken", "discordBearerToken"],
    fields: [{
      name: "discordBotToken",
      type: "app",
      optional: false,
      secret: true,
    }, {
      name: "discordBearerToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: DISCORD_ACTIONS,
  }],
});

describe("discord operation runtime", () => {
  it("builds Discord REST request plans for core resources", () => {
    const headers = { accept: "application/json" };
    const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
    const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-channel"), { channelId: "123" }), {
      method: "GET",
      endpoint: "channels/123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-channel"), {
      channelId: "123",
      name: "Forum updates",
      icon: null,
      type: 5,
      position: 4,
      topic: null,
      nsfw: true,
      rateLimitPerUser: 7,
      bitrate: 64000,
      userLimit: 20,
      permissionOverwrites: [{ id: "role-123", type: 0, allow: "1024", deny: null }],
      parentId: null,
      rtcRegion: null,
      videoQualityMode: 2,
      defaultAutoArchiveDuration: 1440,
      flags: 16,
      availableTags: [{ name: "support", moderated: false, emoji_id: null, emoji_name: "check" }],
      defaultReactionEmoji: null,
      defaultThreadRateLimitPerUser: 10,
      defaultSortOrder: null,
      defaultForumLayout: 2,
      archived: false,
      autoArchiveDuration: 4320,
      locked: false,
      invitable: true,
      appliedTags: ["tag-123"],
      auditLogReason: "update channel",
    }), {
      method: "PATCH",
      endpoint: "channels/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "update channel",
      },
      body: {
        name: "Forum updates",
        type: 5,
        topic: null,
        bitrate: 64000,
        user_limit: 20,
        rate_limit_per_user: 7,
        position: 4,
        permission_overwrites: [{ id: "role-123", type: 0, allow: "1024", deny: null }],
        parent_id: null,
        nsfw: true,
        rtc_region: null,
        video_quality_mode: 2,
        default_auto_archive_duration: 1440,
        default_reaction_emoji: null,
        available_tags: [{ name: "support", moderated: false, emoji_id: null, emoji_name: "check" }],
        default_sort_order: null,
        default_forum_layout: 2,
        default_thread_rate_limit_per_user: 10,
        icon: null,
        flags: 16,
        archived: false,
        auto_archive_duration: 4320,
        locked: false,
        invitable: true,
        applied_tags: ["tag-123"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-channel"), {
      channelId: "123",
      auditLogReason: "remove channel",
    }), {
      method: "DELETE",
      endpoint: "channels/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "remove channel",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-current-user"), {
      username: "Sample Bot",
      avatar: "data:image/png;base64,c2FtcGxl",
      banner: "data:image/png;base64,c2FtcGxl",
    }), {
      method: "PATCH",
      endpoint: "users/@me",
      auth,
      headers,
      body: {
        username: "Sample Bot",
        avatar: "data:image/png;base64,c2FtcGxl",
        banner: "data:image/png;base64,c2FtcGxl",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "username"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-user-guild-member"), {
      guildId: "guild-123",
    }), {
      method: "GET",
      endpoint: "users/@me/guilds/guild-123/member",
      auth: bearerAuth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["user", "roles"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.leave-guild"), {
      guildId: "guild-123",
    }), {
      method: "DELETE",
      endpoint: "users/@me/guilds/guild-123",
      auth: bearerAuth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-dm"), {
      recipientId: "user-123",
    }), {
      method: "POST",
      endpoint: "users/@me/channels",
      auth,
      headers,
      body: {
        recipient_id: "user-123",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-group-dm"), {
      accessTokens: ["access-token-1"],
      nicks: {
        "user-123": "Sam",
      },
    }), {
      method: "POST",
      endpoint: "users/@me/channels",
      auth: bearerAuth,
      headers,
      body: {
        access_tokens: ["access-token-1"],
        nicks: {
          "user-123": "Sam",
        },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type", "recipients"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-user-connections"), {}), {
      method: "GET",
      endpoint: "users/@me/connections",
      auth: bearerAuth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-user-application-role-connection"), {
      applicationId: "app-123",
    }), {
      method: "GET",
      endpoint: "users/@me/applications/app-123/role-connection",
      auth: bearerAuth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["metadata"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-current-user-application-role-connection"), {
      applicationId: "app-123",
      platformName: "ClawJS",
      platformUsername: "sample-user",
      metadata: {
        score: "100",
      },
    }), {
      method: "PUT",
      endpoint: "users/@me/applications/app-123/role-connection",
      auth: bearerAuth,
      headers,
      body: {
        platform_name: "ClawJS",
        platform_username: "sample-user",
        metadata: {
          score: "100",
        },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["metadata"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-gateway"), {}), {
      method: "GET",
      endpoint: "gateway",
      auth: [],
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["url"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-gateway-bot"), {}), {
      method: "GET",
      endpoint: "gateway/bot",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["url", "shards", "session_start_limit"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-bot-application-information"), {}), {
      method: "GET",
      endpoint: "oauth2/applications/@me",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name", "description", "verify_key"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-authorization-information"), {}), {
      method: "GET",
      endpoint: "oauth2/@me",
      auth: bearerAuth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["application", "scopes", "expires"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild"), {
      guildId: "456",
      name: "Guild",
      verificationLevel: 1,
      defaultMessageNotifications: 1,
      explicitContentFilter: 2,
      afkChannelId: "123",
      afkTimeout: 300,
      icon: "data:image/png;base64,c2FtcGxl",
      ownerId: "789",
      splash: "data:image/png;base64,c2FtcGxl",
      discoverySplash: "data:image/png;base64,c2FtcGxl",
      banner: "data:image/png;base64,c2FtcGxl",
      systemChannelId: "234",
      systemChannelFlags: 3,
      rulesChannelId: "345",
      publicUpdatesChannelId: "456",
      preferredLocale: "en-US",
      features: ["COMMUNITY"],
      description: "Community server",
      premiumProgressBarEnabled: true,
      safetyAlertsChannelId: "567",
      auditLogReason: "settings update",
    }), {
      method: "PATCH",
      endpoint: "guilds/456",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "settings update",
      },
      body: {
        name: "Guild",
        verification_level: 1,
        default_message_notifications: 1,
        explicit_content_filter: 2,
        afk_channel_id: "123",
        afk_timeout: 300,
        icon: "data:image/png;base64,c2FtcGxl",
        owner_id: "789",
        splash: "data:image/png;base64,c2FtcGxl",
        discovery_splash: "data:image/png;base64,c2FtcGxl",
        banner: "data:image/png;base64,c2FtcGxl",
        system_channel_id: "234",
        system_channel_flags: 3,
        rules_channel_id: "345",
        public_updates_channel_id: "456",
        preferred_locale: "en-US",
        features: ["COMMUNITY"],
        description: "Community server",
        premium_progress_bar_enabled: true,
        safety_alerts_channel_id: "567",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-voice-regions"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/regions",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-channel"), {
      guildId: "456",
      name: "Announcements",
      type: 15,
      topic: "Launch updates",
      bitrate: 64000,
      userLimit: 25,
      rateLimitPerUser: 5,
      position: 3,
      permissionOverwrites: [{ id: "role-123", type: 0, allow: "1024", deny: null }],
      parentId: null,
      nsfw: true,
      rtcRegion: null,
      videoQualityMode: 2,
      defaultAutoArchiveDuration: 1440,
      defaultReactionEmoji: null,
      availableTags: [{ name: "support", moderated: false, emoji_id: null, emoji_name: "check" }],
      defaultSortOrder: 1,
      defaultForumLayout: 2,
      defaultThreadRateLimitPerUser: 10,
      auditLogReason: "create forum channel",
    }), {
      method: "POST",
      endpoint: "guilds/456/channels",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "create forum channel",
      },
      body: {
        name: "Announcements",
        type: 15,
        topic: "Launch updates",
        bitrate: 64000,
        user_limit: 25,
        rate_limit_per_user: 5,
        position: 3,
        permission_overwrites: [{ id: "role-123", type: 0, allow: "1024", deny: null }],
        parent_id: null,
        nsfw: true,
        rtc_region: null,
        video_quality_mode: 2,
        default_auto_archive_duration: 1440,
        default_reaction_emoji: null,
        available_tags: [{ name: "support", moderated: false, emoji_id: null, emoji_name: "check" }],
        default_sort_order: 1,
        default_forum_layout: 2,
        default_thread_rate_limit_per_user: 10,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-channel-positions"), {
      guildId: "456",
      positions: [{ id: "123", position: 2, lock_permissions: false, parent_id: "789" }],
      auditLogReason: "sort channels",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/channels",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "sort channels",
      },
      body: {},
      bodyValue: [{ id: "123", position: 2, lock_permissions: false, parent_id: "789" }],
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.send-message"), {
      channelId: "123",
      content: "hello",
      nonce: "nonce-123",
      tts: true,
      embeds: [{ title: "Release" }],
      components: [{ type: 1 }],
      allowedMentions: { parse: [] },
      stickerIds: ["sticker-1"],
      attachments: [{ id: "0", filename: "release.txt", description: "notes" }],
      flags: 4096,
      enforceNonce: true,
      poll: {
        question: { text: "Ship it?" },
        answers: [{ poll_media: { text: "Yes" } }],
      },
      sharedClientTheme: {
        colors: ["5865F2"],
        gradient_angle: 0,
        base_mix: 50,
      },
      messageId: "789",
      guildId: "456",
      failIfNotExists: false,
    }), {
      method: "POST",
      endpoint: "channels/123/messages",
      auth,
      headers,
      body: {
        content: "hello",
        nonce: "nonce-123",
        tts: true,
        embeds: [{ title: "Release" }],
        components: [{ type: 1 }],
        allowed_mentions: { parse: [] },
        sticker_ids: ["sticker-1"],
        attachments: [{ id: "0", filename: "release.txt", description: "notes" }],
        flags: 4096,
        enforce_nonce: true,
        poll: {
          question: { text: "Ship it?" },
          answers: [{ poll_media: { text: "Yes" } }],
        },
        shared_client_theme: {
          colors: ["5865F2"],
          gradient_angle: 0,
          base_mix: 50,
        },
        message_reference: {
          message_id: "789",
          channel_id: "123",
          guild_id: "456",
          fail_if_not_exists: false,
        },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-message"), {
      channelId: "123",
      messageId: "456",
      content: "updated",
      embeds: [{ title: "Updated" }],
      components: [{ type: 1 }],
      allowedMentions: { parse: [] },
      attachments: [{ id: "0", filename: "release.txt" }],
      flags: 4,
    }), {
      method: "PATCH",
      endpoint: "channels/123/messages/456",
      auth,
      headers,
      body: {
        content: "updated",
        embeds: [{ title: "Updated" }],
        components: [{ type: 1 }],
        allowed_mentions: { parse: [] },
        attachments: [{ id: "0", filename: "release.txt" }],
        flags: 4,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.send-message"), {
      channelId: "123",
      content: "file upload",
      files: ["hello world"],
      attachments: [{ id: "0", filename: "hello.txt" }],
    }), {
      method: "POST",
      endpoint: "channels/123/messages",
      auth,
      headers,
      bodyEncoding: "multipart",
      body: {
        payload_json: JSON.stringify({
          content: "file upload",
          attachments: [{ id: "0", filename: "hello.txt" }],
        }),
        "files[0]": "hello world",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-message"), {
      channelId: "123",
      messageId: "456",
      content: "replace attachment",
      files: ["updated file"],
      attachments: [{ id: "0", filename: "updated.txt" }],
    }), {
      method: "PATCH",
      endpoint: "channels/123/messages/456",
      auth,
      headers,
      bodyEncoding: "multipart",
      body: {
        payload_json: JSON.stringify({
          content: "replace attachment",
          attachments: [{ id: "0", filename: "updated.txt" }],
        }),
        "files[0]": "updated file",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.search-guild-messages"), {
      guildId: "guild-123",
      content: "release notes",
      channelIds: ["channel-1", "channel-2"],
      authorTypes: ["bot"],
      authorIds: ["user-1"],
      mentions: ["mention-1"],
      mentionRoleIds: ["role-1"],
      mentionEveryone: false,
      repliedToUserIds: ["user-2"],
      repliedToMessageIds: ["message-9"],
      pinned: true,
      has: ["link", "embed"],
      embedTypes: ["article"],
      embedProviders: ["Provider"],
      linkHostnames: ["example.com"],
      attachmentFilenames: ["report.pdf"],
      attachmentExtensions: ["pdf"],
      maxId: "max-1",
      minId: "min-1",
      slop: 3,
      limit: 10,
      offset: 5,
      sortBy: "timestamp",
      sortOrder: "desc",
      includeNsfw: true,
    }), {
      method: "GET",
      endpoint: "guilds/guild-123/messages/search",
      auth,
      headers,
      query: {
        limit: 10,
        offset: 5,
        max_id: "max-1",
        min_id: "min-1",
        slop: 3,
        content: "release notes",
        channel_id: ["channel-1", "channel-2"],
        author_type: ["bot"],
        author_id: ["user-1"],
        mentions: ["mention-1"],
        mentions_role_id: ["role-1"],
        mention_everyone: false,
        replied_to_user_id: ["user-2"],
        replied_to_message_id: ["message-9"],
        pinned: true,
        has: ["link", "embed"],
        embed_type: ["article"],
        embed_provider: ["Provider"],
        link_hostname: ["example.com"],
        attachment_filename: ["report.pdf"],
        attachment_extension: ["pdf"],
        sort_by: "timestamp",
        sort_order: "desc",
        include_nsfw: true,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["doing_deep_historical_index", "total_results", "messages"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-messages"), {
      channelId: "123",
      after: "message-after",
      limit: 25,
    }), {
      method: "GET",
      endpoint: "channels/123/messages",
      auth,
      headers,
      query: {
        after: "message-after",
        limit: 25,
      },
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-message"), {
      channelId: "123",
      messageId: "456",
      auditLogReason: "moderation cleanup",
    }), {
      method: "DELETE",
      endpoint: "channels/123/messages/456",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "moderation cleanup",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.bulk-delete-messages"), {
      channelId: "123",
      messages: ["456", "789"],
      auditLogReason: "bulk moderation cleanup",
    }), {
      method: "POST",
      endpoint: "channels/123/messages/bulk-delete",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "bulk moderation cleanup",
      },
      body: {
        messages: ["456", "789"],
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-reactions"), {
      channelId: "123",
      messageId: "456",
      emoji: "wave:789",
      after: "user-after",
      limit: 50,
      type: 1,
    }), {
      method: "GET",
      endpoint: "channels/123/messages/456/reactions/wave%3A789",
      auth,
      headers,
      query: {
        after: "user-after",
        limit: 50,
        type: 1,
      },
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-pinned-messages"), {
      channelId: "123",
      before: "2026-05-01T00:00:00.000Z",
      limit: 50,
    }), {
      method: "GET",
      endpoint: "channels/123/messages/pins",
      auth,
      headers,
      query: {
        before: "2026-05-01T00:00:00.000Z",
        limit: 50,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["items", "has_more"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.pin-message"), {
      channelId: "123",
      messageId: "456",
      auditLogReason: "pin release note",
    }), {
      method: "PUT",
      endpoint: "channels/123/messages/pins/456",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "pin release note",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.unpin-message"), {
      channelId: "123",
      messageId: "456",
      auditLogReason: "rotate pins",
    }), {
      method: "DELETE",
      endpoint: "channels/123/messages/pins/456",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "rotate pins",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-reaction"), {
      channelId: "123",
      messageId: "456",
      emoji: "wave:789",
    }), {
      method: "PUT",
      endpoint: "channels/123/messages/456/reactions/wave%3A789/@me",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-own-reaction"), {
      channelId: "123",
      messageId: "456",
      emoji: "wave:789",
    }), {
      method: "DELETE",
      endpoint: "channels/123/messages/456/reactions/wave%3A789/@me",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-user-reaction"), {
      channelId: "123",
      messageId: "456",
      userId: "789",
      emoji: "wave:789",
    }), {
      method: "DELETE",
      endpoint: "channels/123/messages/456/reactions/wave%3A789/789",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-all-reactions"), {
      channelId: "123",
      messageId: "456",
    }), {
      method: "DELETE",
      endpoint: "channels/123/messages/456/reactions",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-all-reactions-for-emoji"), {
      channelId: "123",
      messageId: "456",
      emoji: "wave:789",
    }), {
      method: "DELETE",
      endpoint: "channels/123/messages/456/reactions/wave%3A789",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-answer-voters"), {
      channelId: "123",
      messageId: "456",
      answerId: "789",
      after: "user-after",
      limit: 25,
    }), {
      method: "GET",
      endpoint: "channels/123/polls/456/answers/789",
      auth,
      headers,
      query: {
        after: "user-after",
        limit: 25,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["users"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.end-poll"), {
      channelId: "123",
      messageId: "456",
    }), {
      method: "POST",
      endpoint: "channels/123/polls/456/expire",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-voice-regions"), {}), {
      method: "GET",
      endpoint: "voice/regions",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-user-voice-state"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/voice-states/@me",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["user_id", "session_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-user-voice-state"), {
      guildId: "456",
      userId: "123",
    }), {
      method: "GET",
      endpoint: "guilds/456/voice-states/123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["user_id", "session_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-current-user-voice-state"), {
      guildId: "456",
      channelId: "789",
      suppress: false,
      requestToSpeakTimestamp: "2026-05-13T11:00:00.000Z",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/voice-states/@me",
      auth,
      headers,
      body: {
        channel_id: "789",
        suppress: false,
        request_to_speak_timestamp: "2026-05-13T11:00:00.000Z",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-user-voice-state"), {
      guildId: "456",
      userId: "123",
      channelId: "789",
      suppress: true,
      requestToSpeakTimestamp: "ignored",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/voice-states/123",
      auth,
      headers,
      body: {
        channel_id: "789",
        suppress: true,
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-lobby"), {
      metadata: { topic: "coordination" },
      members: [{ id: "123", flags: 1 }],
      idleTimeoutSeconds: 60,
    }), {
      method: "POST",
      endpoint: "lobbies",
      auth,
      headers,
      body: {
        metadata: { topic: "coordination" },
        members: [{ id: "123", flags: 1 }],
        idle_timeout_seconds: 60,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "members"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-lobby"), {
      lobbyId: "lobby-123",
    }), {
      method: "GET",
      endpoint: "lobbies/lobby-123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "members"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-lobby"), {
      lobbyId: "lobby-123",
      metadata: { topic: "updated" },
      members: [{ id: "456" }],
      idleTimeoutSeconds: 120,
    }), {
      method: "PATCH",
      endpoint: "lobbies/lobby-123",
      auth,
      headers,
      body: {
        metadata: { topic: "updated" },
        members: [{ id: "456" }],
        idle_timeout_seconds: 120,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "members"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-lobby"), {
      lobbyId: "lobby-123",
    }), {
      method: "DELETE",
      endpoint: "lobbies/lobby-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.add-lobby-member"), {
      lobbyId: "lobby-123",
      userId: "user-123",
      metadata: { role: "captain" },
      flags: 1,
    }), {
      method: "PUT",
      endpoint: "lobbies/lobby-123/members/user-123",
      auth,
      headers,
      body: {
        metadata: { role: "captain" },
        flags: 1,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.bulk-update-lobby-members"), {
      lobbyId: "lobby-123",
      members: [{ id: "user-123", metadata: { role: "captain" }, flags: 1, remove_member: false }],
    }), {
      method: "PUT",
      endpoint: "lobbies/lobby-123/members",
      auth,
      headers,
      body: {},
      bodyValue: [{ id: "user-123", metadata: { role: "captain" }, flags: 1, remove_member: false }],
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.remove-lobby-member"), {
      lobbyId: "lobby-123",
      userId: "user-123",
    }), {
      method: "DELETE",
      endpoint: "lobbies/lobby-123/members/user-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.leave-lobby"), {
      lobbyId: "lobby-123",
    }), {
      method: "DELETE",
      endpoint: "lobbies/lobby-123/members/@me",
      auth: bearerAuth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.link-channel-to-lobby"), {
      lobbyId: "lobby-123",
      channelId: "channel-123",
    }), {
      method: "PATCH",
      endpoint: "lobbies/lobby-123/channel-linking",
      auth: bearerAuth,
      headers,
      body: {
        channel_id: "channel-123",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "members", "linked_channel"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.unlink-channel-from-lobby"), {
      lobbyId: "lobby-123",
    }), {
      method: "PATCH",
      endpoint: "lobbies/lobby-123/channel-linking",
      auth: bearerAuth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "members"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-lobby-message-moderation-metadata"), {
      lobbyId: "lobby-123",
      messageId: "message-123",
      metadata: {
        action: "replace",
        replacement: "Please keep chat respectful.",
      },
    }), {
      method: "PUT",
      endpoint: "lobbies/lobby-123/messages/message-123/moderation-metadata",
      auth,
      headers,
      body: {
        action: "replace",
        replacement: "Please keep chat respectful.",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.set-voice-channel-status"), {
      channelId: "123",
      status: "Planning",
      auditLogReason: "status update",
    }), {
      method: "PUT",
      endpoint: "channels/123/voice-status",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "status update",
      },
      body: {
        status: "Planning",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-channel-permissions"), {
      channelId: "123",
      overwriteId: "456",
      allow: "1024",
      deny: "0",
      permissionType: 0,
      auditLogReason: "sync overwrites",
    }), {
      method: "PUT",
      endpoint: "channels/123/permissions/456",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "sync overwrites",
      },
      body: {
        allow: "1024",
        deny: "0",
        type: 0,
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-channel-permission"), {
      channelId: "123",
      overwriteId: "456",
      auditLogReason: "remove overwrite",
    }), {
      method: "DELETE",
      endpoint: "channels/123/permissions/456",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "remove overwrite",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.follow-announcement-channel"), {
      channelId: "123",
      webhookChannelId: "789",
      auditLogReason: "mirror announcements",
    }), {
      method: "POST",
      endpoint: "channels/123/followers",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "mirror announcements",
      },
      body: {
        webhook_channel_id: "789",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["channel_id", "webhook_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.trigger-typing-indicator"), {
      channelId: "123",
    }), {
      method: "POST",
      endpoint: "channels/123/typing",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.group-dm-add-recipient"), {
      channelId: "123",
      userId: "456",
      accessToken: "recipient-token",
      nick: "Guest",
    }), {
      method: "PUT",
      endpoint: "channels/123/recipients/456",
      auth,
      headers,
      body: {
        access_token: "recipient-token",
        nick: "Guest",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.group-dm-remove-recipient"), {
      channelId: "123",
      userId: "456",
    }), {
      method: "DELETE",
      endpoint: "channels/123/recipients/456",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.add-guild-member"), {
      guildId: "456",
      userId: "123",
      accessToken: "member-token",
      nick: "Member",
      roles: ["789"],
      mute: false,
      deaf: true,
    }), {
      method: "PUT",
      endpoint: "guilds/456/members/123",
      auth,
      headers,
      body: {
        access_token: "member-token",
        nick: "Member",
        roles: ["789"],
        mute: false,
        deaf: true,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["user"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-member"), {
      guildId: "456",
      userId: "123",
      nick: null,
      roles: ["789"],
      mute: false,
      deaf: true,
      voiceChannelId: null,
      communicationDisabledUntil: null,
      flags: 1,
      auditLogReason: "member moderation",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/members/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "member moderation",
      },
      body: {
        nick: null,
        roles: ["789"],
        mute: false,
        deaf: true,
        channel_id: null,
        communication_disabled_until: null,
        flags: 1,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["user"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-current-member"), {
      guildId: "456",
      nick: "Display",
      avatar: "data:image/png;base64,c2FtcGxl",
      banner: "data:image/png;base64,c2FtcGxl",
      bio: "Working on guild setup",
      auditLogReason: "profile update",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/members/@me",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "profile update",
      },
      body: {
        nick: "Display",
        avatar: "data:image/png;base64,c2FtcGxl",
        banner: "data:image/png;base64,c2FtcGxl",
        bio: "Working on guild setup",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["user"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-current-user-nick"), {
      guildId: "456",
      nick: "Display",
      auditLogReason: "nick update",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/members/@me/nick",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "nick update",
      },
      body: {
        nick: "Display",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["nick"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.remove-guild-member"), {
      guildId: "456",
      userId: "123",
      auditLogReason: "member removal",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/members/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "member removal",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-ban"), {
      guildId: "456",
      userId: "123",
      deleteMessageSeconds: 60,
    }), {
      method: "PUT",
      endpoint: "guilds/456/bans/123",
      auth,
      headers,
      query: {
        delete_message_seconds: 60,
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.remove-guild-ban"), {
      guildId: "456",
      userId: "123",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/bans/123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.bulk-ban-guild-users"), {
      guildId: "456",
      userIds: ["123", "789"],
      deleteMessageSeconds: 60,
      auditLogReason: "raid cleanup",
    }), {
      method: "POST",
      endpoint: "guilds/456/bulk-ban",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "raid cleanup",
      },
      body: {
        user_ids: ["123", "789"],
        delete_message_seconds: 60,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["banned_users", "failed_users"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-prune-count"), {
      guildId: "456",
      days: 14,
      includeRoles: ["123", "789"],
    }), {
      method: "GET",
      endpoint: "guilds/456/prune",
      auth,
      headers,
      query: {
        days: 14,
        include_roles: "123,789",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["pruned"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.begin-guild-prune"), {
      guildId: "456",
      days: 14,
      computePruneCount: false,
      includeRoles: ["123"],
      auditLogReason: "inactive cleanup",
    }), {
      method: "POST",
      endpoint: "guilds/456/prune",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "inactive cleanup",
      },
      body: {
        days: 14,
        compute_prune_count: false,
        include_roles: ["123"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["pruned"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-integrations"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/integrations",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-integration"), {
      guildId: "456",
      integrationId: "integration-123",
      auditLogReason: "retire integration",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/integrations/integration-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "retire integration",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-widget-settings"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/widget",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["enabled", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-widget"), {
      guildId: "456",
      enabled: true,
      channelId: "123",
      auditLogReason: "enable widget",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/widget",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "enable widget",
      },
      body: {
        enabled: true,
        channel_id: "123",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["enabled", "channel_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-widget"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/widget.json",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name", "channels", "members", "presence_count"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("get-guild-widget-image", "Get Guild Widget Image", [
      GUILD_FIELD,
      field("style", "string", true, { default: "shield" }),
    ], []), {
      guildId: "456",
      style: "banner2",
    }), {
      method: "GET",
      endpoint: "guilds/456/widget.png",
      auth: [],
      headers: { accept: "image/png" },
      query: { style: "banner2" },
      body: {},
      responseBodyEncoding: "base64",
      responseSchema: {
        type: "string",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-vanity-url"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/vanity-url",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["code", "uses"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-welcome-screen"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/welcome-screen",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["welcome_channels", "description"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-welcome-screen"), {
      guildId: "456",
      enabled: true,
      welcomeChannels: [{ channel_id: "123", description: "Start here" }],
      description: "Welcome",
      auditLogReason: "refresh welcome screen",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/welcome-screen",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "refresh welcome screen",
      },
      body: {
        enabled: true,
        welcome_channels: [{ channel_id: "123", description: "Start here" }],
        description: "Welcome",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["welcome_channels", "description"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-onboarding"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/onboarding",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["guild_id", "prompts", "default_channel_ids", "enabled", "mode"],
      },
    });

    const onboardingPrompts = [{
      id: "prompt-123",
      type: 0,
      options: [],
      title: "Start",
      single_select: true,
      required: false,
      in_onboarding: true,
    }];
    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-onboarding"), {
      guildId: "456",
      prompts: onboardingPrompts,
      defaultChannelIds: ["channel-123"],
      enabled: true,
      mode: 0,
      auditLogReason: "refresh onboarding",
    }), {
      method: "PUT",
      endpoint: "guilds/456/onboarding",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "refresh onboarding",
      },
      body: {
        prompts: onboardingPrompts,
        default_channel_ids: ["channel-123"],
        enabled: true,
        mode: 0,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["guild_id", "prompts", "default_channel_ids", "enabled", "mode"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-incident-actions"), {
      guildId: "456",
      invitesDisabledUntil: null,
      dmsDisabledUntil: "2026-05-13T14:00:00.000Z",
    }), {
      method: "PUT",
      endpoint: "guilds/456/incident-actions",
      auth,
      headers,
      body: {
        invites_disabled_until: null,
        dms_disabled_until: "2026-05-13T14:00:00.000Z",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["invites_disabled_until", "dms_disabled_until"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-role"), {
      guildId: "456",
      roleId: "123",
    }), {
      method: "GET",
      endpoint: "guilds/456/roles/123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-role-member-counts"), {
      guildId: "456",
    }), {
      method: "GET",
      endpoint: "guilds/456/roles/member-counts",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.modify-guild-role-positions"), {
      guildId: "456",
      positions: [{ id: "123", position: 2 }],
      auditLogReason: "role ordering",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/roles",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "role ordering",
      },
      body: {},
      bodyValue: [{ id: "123", position: 2 }],
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.add-guild-member-role"), {
      guildId: "456",
      userId: "123",
      roleId: "role-123",
      auditLogReason: "grant role",
    }), {
      method: "PUT",
      endpoint: "guilds/456/members/123/roles/role-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "grant role",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.remove-guild-member-role"), {
      guildId: "456",
      userId: "123",
      roleId: "role-123",
      auditLogReason: "revoke role",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/members/123/roles/role-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "revoke role",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-role"), {
      guildId: "456",
      name: "Operators",
      permissions: "0",
      color: 1,
      colors: {
        primary_color: 1,
        secondary_color: null,
        tertiary_color: null,
      },
      hoist: true,
      icon: "data:image/png;base64,c2FtcGxl",
      unicodeEmoji: "sample",
      mentionable: true,
      auditLogReason: "role create",
    }), {
      method: "POST",
      endpoint: "guilds/456/roles",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "role create",
      },
      body: {
        name: "Operators",
        permissions: "0",
        color: 1,
        colors: {
          primary_color: 1,
          secondary_color: null,
          tertiary_color: null,
        },
        hoist: true,
        icon: "data:image/png;base64,c2FtcGxl",
        unicode_emoji: "sample",
        mentionable: true,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-guild-role"), {
      guildId: "456",
      roleId: "role-123",
      name: null,
      permissions: null,
      color: null,
      colors: null,
      hoist: null,
      icon: null,
      unicodeEmoji: null,
      mentionable: false,
      auditLogReason: "role update",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/roles/role-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "role update",
      },
      body: {
        name: null,
        permissions: null,
        color: null,
        colors: null,
        hoist: null,
        icon: null,
        unicode_emoji: null,
        mentionable: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-role"), {
      guildId: "456",
      roleId: "role-123",
      auditLogReason: "role delete",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/roles/role-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "role delete",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-template"), {
      guildId: "456",
      name: "Support Server",
      description: null,
    }), {
      method: "POST",
      endpoint: "guilds/456/templates",
      auth,
      headers,
      body: {
        name: "Support Server",
        description: null,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["code", "name", "source_guild_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.sync-guild-template"), {
      guildId: "456",
      templateCode: "abc123",
    }), {
      method: "PUT",
      endpoint: "guilds/456/templates/abc123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["code", "name", "source_guild_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-guild-template"), {
      guildId: "456",
      templateCode: "abc123",
      name: "Support Server",
      description: null,
    }), {
      method: "PATCH",
      endpoint: "guilds/456/templates/abc123",
      auth,
      headers,
      body: {
        name: "Support Server",
        description: null,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["code", "name", "source_guild_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.send-soundboard-sound"), {
      channelId: "123",
      soundboardSoundId: "sound-123",
      sourceGuildId: "456",
    }), {
      method: "POST",
      endpoint: "channels/123/send-soundboard-sound",
      auth,
      headers,
      body: {
        sound_id: "sound-123",
        source_guild_id: "456",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-soundboard-sound"), {
      guildId: "456",
      name: "Doorbell",
      sound: "data:audio/mpeg;base64,c2FtcGxl",
      volume: null,
      emojiId: null,
      emojiName: null,
      auditLogReason: "sound update",
    }), {
      method: "POST",
      endpoint: "guilds/456/soundboard-sounds",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "sound update",
      },
      body: {
        name: "Doorbell",
        sound: "data:audio/mpeg;base64,c2FtcGxl",
        volume: null,
        emoji_id: null,
        emoji_name: null,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["sound_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-soundboard-sound"), {
      guildId: "456",
      soundboardSoundId: "sound-123",
      auditLogReason: "sound cleanup",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/soundboard-sounds/sound-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "sound cleanup",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-current-application"), {}), {
      method: "GET",
      endpoint: "applications/@me",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name", "description", "verify_key"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-current-application"), {
      customInstallUrl: "https://example.invalid/install",
      description: "Updated app",
      roleConnectionsVerificationUrl: "https://example.invalid/roles",
      installParams: {
        scopes: ["bot"],
        permissions: "0",
      },
      integrationTypesConfig: {
        "0": {
          oauth2_install_params: {
            scopes: ["bot"],
            permissions: "0",
          },
        },
      },
      flags: 0,
      icon: "data:image/png;base64,c2FtcGxl",
      coverImage: "data:image/png;base64,c2FtcGxl",
      interactionsEndpointUrl: "https://example.invalid/interactions",
      tags: ["sample"],
      eventWebhooksUrl: "https://example.invalid/events",
      eventWebhooksStatus: 1,
      eventWebhooksTypes: ["APPLICATION_AUTHORIZED"],
    }), {
      method: "PATCH",
      endpoint: "applications/@me",
      auth,
      headers,
      body: {
        custom_install_url: "https://example.invalid/install",
        description: "Updated app",
        role_connections_verification_url: "https://example.invalid/roles",
        install_params: {
          scopes: ["bot"],
          permissions: "0",
        },
        integration_types_config: {
          "0": {
            oauth2_install_params: {
              scopes: ["bot"],
              permissions: "0",
            },
          },
        },
        flags: 0,
        icon: "data:image/png;base64,c2FtcGxl",
        cover_image: "data:image/png;base64,c2FtcGxl",
        interactions_endpoint_url: "https://example.invalid/interactions",
        tags: ["sample"],
        event_webhooks_url: "https://example.invalid/events",
        event_webhooks_status: 1,
        event_webhooks_types: ["APPLICATION_AUTHORIZED"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name", "description", "verify_key"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-application-activity-instance"), {
      applicationId: "app-123",
      instanceId: "instance-123",
    }), {
      method: "GET",
      endpoint: "applications/app-123/activity-instances/instance-123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["application_id", "instance_id", "launch_id", "location", "users"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-application-role-connection-metadata"), {
      applicationId: "app-123",
      records: [{
        type: 2,
        key: "score",
        name: "Score",
        description: "Sample score",
      }],
    }), {
      method: "PUT",
      endpoint: "applications/app-123/role-connections/metadata",
      auth,
      headers,
      body: {},
      bodyValue: [{
        type: 2,
        key: "score",
        name: "Score",
        description: "Sample score",
      }],
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-entitlements"), {
      applicationId: "app-123",
      userId: "user-123",
      skuIds: ["sku-1", "sku-2"],
      before: "ent-before",
      after: "ent-after",
      limit: 50,
      guildId: "guild-123",
      excludeEnded: true,
      excludeDeleted: false,
    }), {
      method: "GET",
      endpoint: "applications/app-123/entitlements",
      auth,
      headers,
      query: {
        user_id: "user-123",
        sku_ids: "sku-1,sku-2",
        before: "ent-before",
        after: "ent-after",
        limit: 50,
        guild_id: "guild-123",
        exclude_ended: true,
        exclude_deleted: false,
      },
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-entitlement"), {
      applicationId: "app-123",
      entitlementId: "ent-123",
    }), {
      method: "GET",
      endpoint: "applications/app-123/entitlements/ent-123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "sku_id", "application_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.consume-entitlement"), {
      applicationId: "app-123",
      entitlementId: "ent-123",
    }), {
      method: "POST",
      endpoint: "applications/app-123/entitlements/ent-123/consume",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-test-entitlement"), {
      applicationId: "app-123",
      skuId: "sku-123",
      ownerId: "owner-123",
      ownerType: 1,
    }), {
      method: "POST",
      endpoint: "applications/app-123/entitlements",
      auth,
      headers,
      body: {
        sku_id: "sku-123",
        owner_id: "owner-123",
        owner_type: 1,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "sku_id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-test-entitlement"), {
      applicationId: "app-123",
      entitlementId: "ent-123",
    }), {
      method: "DELETE",
      endpoint: "applications/app-123/entitlements/ent-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-skus"), {
      applicationId: "app-123",
    }), {
      method: "GET",
      endpoint: "applications/app-123/skus",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-sku-subscriptions"), {
      skuId: "sku-123",
      userId: "user-123",
      before: "sub-before",
      after: "sub-after",
      limit: 50,
    }), {
      method: "GET",
      endpoint: "skus/sku-123/subscriptions",
      auth,
      headers,
      query: {
        before: "sub-before",
        after: "sub-after",
        limit: 50,
        user_id: "user-123",
      },
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-sku-subscription"), {
      skuId: "sku-123",
      subscriptionId: "sub-123",
    }), {
      method: "GET",
      endpoint: "skus/sku-123/subscriptions/sub-123",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "user_id", "sku_ids"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-audit-log"), {
      guildId: "456",
      userId: "123",
      actionType: 1,
      before: "audit-before",
      after: "audit-after",
      limit: 25,
    }), {
      method: "GET",
      endpoint: "guilds/456/audit-logs",
      auth,
      headers,
      query: {
        user_id: "123",
        action_type: 1,
        before: "audit-before",
        after: "audit-after",
        limit: 25,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["audit_log_entries"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-channel-invites"), {
      channelId: "123",
    }), {
      method: "GET",
      endpoint: "channels/123/invites",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-channel-invite"), {
      channelId: "123",
      maxAge: 3600,
      maxUses: 1,
      temporary: true,
      unique: true,
      targetType: 2,
      targetApplicationId: "app-123",
      targetUsersFile: "user_id\n123",
      payloadJson: "{\"max_age\":3600}",
      roleIds: ["role-123"],
      auditLogReason: "temporary invite",
    }), {
      method: "POST",
      endpoint: "channels/123/invites",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "temporary invite",
      },
      body: {
        max_age: 3600,
        max_uses: 1,
        temporary: true,
        unique: true,
        target_type: 2,
        target_application_id: "app-123",
        target_users_file: "user_id\n123",
        payload_json: "{\"max_age\":3600}",
        role_ids: ["role-123"],
      },
      bodyEncoding: "multipart",
      responseSchema: {
        type: "object",
        requiredPaths: ["code"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-invite"), {
      inviteCode: "abc123",
      withCounts: true,
      guildScheduledEventId: "event-123",
    }), {
      method: "GET",
      endpoint: "invites/abc123",
      auth,
      headers,
      query: {
        with_counts: true,
        guild_scheduled_event_id: "event-123",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["code"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("get-invite-target-users", "Get Invite Target Users", [
      field("inviteCode", "string"),
    ]), {
      inviteCode: "abc123",
    }), {
      method: "GET",
      endpoint: "invites/abc123/target-users",
      auth,
      headers: { accept: "text/csv" },
      query: {},
      body: {},
      responseBodyEncoding: "text",
      responseSchema: {
        type: "string",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("update-invite-target-users", "Update Invite Target Users", [
      field("inviteCode", "string"),
      field("targetUsersFile", "string"),
    ]), {
      inviteCode: "abc123",
      targetUsersFile: "user_id\n123",
    }), {
      method: "PUT",
      endpoint: "invites/abc123/target-users",
      auth,
      headers,
      body: {
        target_users_file: "user_id\n123",
      },
      bodyEncoding: "multipart",
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("get-invite-target-users-job-status", "Get Invite Target Users Job Status", [
      field("inviteCode", "string"),
    ]), {
      inviteCode: "abc123",
    }), {
      method: "GET",
      endpoint: "invites/abc123/target-users/job-status",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["status", "total_users", "processed_users", "created_at"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.start-thread-in-forum-or-media-channel"), {
      channelId: "123",
      name: "Forum thread",
      autoArchiveDuration: 60,
      rateLimitPerUser: 0,
      message: {
        content: "hello",
      },
      appliedTags: ["tag-123"],
      auditLogReason: "new forum thread",
    }), {
      method: "POST",
      endpoint: "channels/123/threads",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "new forum thread",
      },
      body: {
        name: "Forum thread",
        auto_archive_duration: 60,
        rate_limit_per_user: 0,
        message: {
          content: "hello",
        },
        applied_tags: ["tag-123"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type", "name", "message"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-public-archived-threads"), {
      channelId: "123",
      before: "2026-05-13T10:00:00.000Z",
      limit: 25,
    }), {
      method: "GET",
      endpoint: "channels/123/threads/archived/public",
      auth,
      headers,
      query: {
        before: "2026-05-13T10:00:00.000Z",
        limit: 25,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["threads", "members", "has_more"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-joined-private-archived-threads"), {
      channelId: "123",
      before: "thread-before",
      limit: 10,
    }), {
      method: "GET",
      endpoint: "channels/123/users/@me/threads/archived/private",
      auth,
      headers,
      query: {
        before: "thread-before",
        limit: 10,
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["threads", "members", "has_more"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.join-thread"), {
      channelId: "123",
    }), {
      method: "PUT",
      endpoint: "channels/123/thread-members/@me",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.leave-thread"), {
      channelId: "123",
    }), {
      method: "DELETE",
      endpoint: "channels/123/thread-members/@me",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.add-thread-member"), {
      channelId: "123",
      userId: "456",
    }), {
      method: "PUT",
      endpoint: "channels/123/thread-members/456",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.remove-thread-member"), {
      channelId: "123",
      userId: "456",
    }), {
      method: "DELETE",
      endpoint: "channels/123/thread-members/456",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-auto-moderation-rule"), {
      guildId: "456",
      name: "Block spoilers",
      eventType: 1,
      triggerType: 1,
      triggerMetadata: {
        keyword_filter: ["spoiler*"],
      },
      actions: [{
        type: 1,
        metadata: {
          custom_message: "Keep spoilers in the right channel",
        },
      }],
      enabled: true,
      exemptRoles: ["123"],
      exemptChannels: ["789"],
      auditLogReason: "policy update",
    }), {
      method: "POST",
      endpoint: "guilds/456/auto-moderation/rules",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "policy update",
      },
      body: {
        name: "Block spoilers",
        event_type: 1,
        trigger_type: 1,
        trigger_metadata: {
          keyword_filter: ["spoiler*"],
        },
        actions: [{
          type: 1,
          metadata: {
            custom_message: "Keep spoilers in the right channel",
          },
        }],
        enabled: true,
        exempt_roles: ["123"],
        exempt_channels: ["789"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-auto-moderation-rule"), {
      guildId: "456",
      autoModerationRuleId: "rule-123",
      name: "Updated rule",
      eventType: 1,
      enabled: false,
      auditLogReason: "policy update",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/auto-moderation/rules/rule-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "policy update",
      },
      body: {
        name: "Updated rule",
        event_type: 1,
        enabled: false,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-auto-moderation-rule"), {
      guildId: "456",
      autoModerationRuleId: "rule-123",
      auditLogReason: "remove obsolete rule",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/auto-moderation/rules/rule-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "remove obsolete rule",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-emoji"), {
      guildId: "456",
      name: "wave",
      image: "data:image/png;base64,c2FtcGxl",
      roles: ["123"],
      auditLogReason: "emoji rollout",
    }), {
      method: "POST",
      endpoint: "guilds/456/emojis",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "emoji rollout",
      },
      body: {
        name: "wave",
        image: "data:image/png;base64,c2FtcGxl",
        roles: ["123"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-guild-emoji"), {
      guildId: "456",
      emojiId: "emoji-123",
      name: "wave2",
      roles: ["123"],
      auditLogReason: "emoji rename",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/emojis/emoji-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "emoji rename",
      },
      body: {
        name: "wave2",
        roles: ["123"],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-emoji"), {
      guildId: "456",
      emojiId: "emoji-123",
      auditLogReason: "emoji cleanup",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/emojis/emoji-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "emoji cleanup",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-application-emojis"), {
      applicationId: "app-123",
    }), {
      method: "GET",
      endpoint: "applications/app-123/emojis",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["items"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-application-emoji"), {
      applicationId: "app-123",
      emojiId: "emoji-123",
    }), {
      method: "DELETE",
      endpoint: "applications/app-123/emojis/emoji-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-sticker-packs"), {}), {
      method: "GET",
      endpoint: "sticker-packs",
      auth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["sticker_packs"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-sticker"), {
      guildId: "456",
      name: "wave",
      description: "Waves hello",
      tags: "wave,hello",
      file: "sample-file",
      auditLogReason: "asset update",
    }), {
      method: "POST",
      endpoint: "guilds/456/stickers",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "asset update",
      },
      bodyEncoding: "multipart",
      body: {
        name: "wave",
        description: "Waves hello",
        tags: "wave,hello",
        file: "sample-file",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-sticker"), {
      guildId: "456",
      stickerId: "sticker-123",
      auditLogReason: "sticker cleanup",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/stickers/sticker-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "sticker cleanup",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-webhook"), {
      channelId: "123",
      name: "deploys",
      avatar: "data:image/png;base64,c2FtcGxl",
      auditLogReason: "create deploy hook",
    }), {
      method: "POST",
      endpoint: "channels/123/webhooks",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "create deploy hook",
      },
      body: {
        name: "deploys",
        avatar: "data:image/png;base64,c2FtcGxl",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "token"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-webhook"), {
      webhookId: "999",
      name: "release deploys",
      avatar: "data:image/png;base64,c2FtcGxl",
      targetChannelId: "456",
      auditLogReason: "rename deploy hook",
    }), {
      method: "PATCH",
      endpoint: "webhooks/999",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "rename deploy hook",
      },
      body: {
        name: "release deploys",
        avatar: "data:image/png;base64,c2FtcGxl",
        channel_id: "456",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-webhook"), {
      webhookId: "999",
      auditLogReason: "retire deploy hook",
    }), {
      method: "DELETE",
      endpoint: "webhooks/999",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "retire deploy hook",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("get-webhook-with-token", "Get Webhook With Token", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
    }), {
      method: "GET",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("update-webhook-with-token", "Update Webhook With Token", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
      name: "renamed",
      avatar: "data:image/png;base64,c2FtcGxl",
      targetChannelId: "456",
    }), {
      method: "PATCH",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      body: {
        name: "renamed",
        avatar: "data:image/png;base64,c2FtcGxl",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("delete-webhook-with-token", "Delete Webhook With Token", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
    }), {
      method: "DELETE",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.execute-webhook"), {
      webhookId: "999",
      webhookToken: "offline-token",
      content: "hello",
      wait: true,
      withComponents: true,
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      query: {
        wait: true,
        with_components: true,
      },
      body: {
        content: "hello",
      },
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.execute-webhook"), {
      webhookId: "999",
      webhookToken: "offline-token",
      content: "rich webhook",
      username: "Clawix",
      avatarUrl: "https://example.invalid/avatar.png",
      tts: true,
      embeds: [{ title: "Release" }],
      allowedMentions: { parse: [] },
      components: [{ type: 1 }],
      attachments: [{ id: "0", filename: "release.txt" }],
      flags: 4096,
      threadName: "release-thread",
      appliedTags: ["tag-123"],
      poll: { question: { text: "Ship it?" } },
      threadId: "thread-123",
      wait: true,
      withComponents: true,
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      query: {
        wait: true,
        thread_id: "thread-123",
        with_components: true,
      },
      body: {
        content: "rich webhook",
        username: "Clawix",
        avatar_url: "https://example.invalid/avatar.png",
        tts: true,
        embeds: [{ title: "Release" }],
        allowed_mentions: { parse: [] },
        components: [{ type: 1 }],
        attachments: [{ id: "0", filename: "release.txt" }],
        flags: 4096,
        thread_name: "release-thread",
        applied_tags: ["tag-123"],
        poll: { question: { text: "Ship it?" } },
      },
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.execute-webhook"), {
      webhookId: "999",
      webhookToken: "offline-token",
      content: "webhook file",
      files: ["hello world"],
      attachments: [{ id: "0", filename: "hello.txt" }],
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      query: {},
      bodyEncoding: "multipart",
      body: {
        payload_json: JSON.stringify({
          content: "webhook file",
          attachments: [{ id: "0", filename: "hello.txt" }],
        }),
        "files[0]": "hello world",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-webhook-message"), {
      webhookId: "999",
      webhookToken: "offline-token",
      messageId: "message-123",
      threadId: "thread-123",
    }), {
      method: "GET",
      endpoint: "webhooks/999/offline-token/messages/message-123",
      auth: [],
      headers,
      query: {
        thread_id: "thread-123",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-webhook-message"), {
      webhookId: "999",
      webhookToken: "offline-token",
      messageId: "message-123",
      content: "hello",
      withComponents: true,
    }), {
      method: "PATCH",
      endpoint: "webhooks/999/offline-token/messages/message-123",
      auth: [],
      headers,
      query: {
        with_components: true,
      },
      body: {
        content: "hello",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-webhook-message"), {
      webhookId: "999",
      webhookToken: "offline-token",
      messageId: "message-123",
      content: "replace attachment",
      files: ["updated file"],
      attachments: [{ id: "0", filename: "updated.txt" }],
      poll: { question: { text: "Update?" } },
      threadId: "thread-123",
      withComponents: true,
    }), {
      method: "PATCH",
      endpoint: "webhooks/999/offline-token/messages/message-123",
      auth: [],
      headers,
      query: {
        thread_id: "thread-123",
        with_components: true,
      },
      bodyEncoding: "multipart",
      body: {
        payload_json: JSON.stringify({
          content: "replace attachment",
          attachments: [{ id: "0", filename: "updated.txt" }],
          poll: { question: { text: "Update?" } },
        }),
        "files[0]": "updated file",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-webhook-message"), {
      webhookId: "999",
      webhookToken: "offline-token",
      messageId: "message-123",
      threadId: "thread-123",
    }), {
      method: "DELETE",
      endpoint: "webhooks/999/offline-token/messages/message-123",
      auth: [],
      headers,
      query: {
        thread_id: "thread-123",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("execute-slack-compatible-webhook", "Execute Slack-Compatible Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
      payload: {
        text: "hello",
      },
      wait: true,
      threadId: "thread-123",
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token/slack",
      auth: [],
      headers,
      query: {
        wait: true,
        thread_id: "thread-123",
      },
      body: {
        text: "hello",
      },
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("execute-slack-compatible-webhook", "Execute Slack-Compatible Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
      payload: {
        text: "hello",
      },
      wait: false,
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token/slack",
      auth: [],
      headers,
      query: {
        wait: false,
      },
      body: {
        text: "hello",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("execute-github-compatible-webhook", "Execute GitHub-Compatible Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
      payload: {
        ref: "refs/heads/main",
      },
      wait: true,
      threadId: "thread-123",
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token/github",
      auth: [],
      headers,
      query: {
        wait: true,
        thread_id: "thread-123",
      },
      body: {
        ref: "refs/heads/main",
      },
      responseSchema: {
        type: "object",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(action("execute-github-compatible-webhook", "Execute GitHub-Compatible Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD], []), {
      webhookId: "999",
      webhookToken: "offline-token",
      payload: {
        ref: "refs/heads/main",
      },
      wait: false,
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token/github",
      auth: [],
      headers,
      query: {
        wait: false,
      },
      body: {
        ref: "refs/heads/main",
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-interaction-response"), {
      interactionId: "interaction-123",
      interactionToken: "interaction-token",
      responseType: 4,
      responseData: {
        content: "hello",
      },
      withResponse: true,
    }), {
      method: "POST",
      endpoint: "interactions/interaction-123/interaction-token/callback",
      auth: [],
      headers,
      query: {
        with_response: true,
      },
      body: {
        type: 4,
        data: {
          content: "hello",
        },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["interaction"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-interaction-response"), {
      interactionId: "interaction-123",
      interactionToken: "interaction-token",
      responseType: 4,
      responseData: {
        content: "hello",
      },
      withResponse: false,
    }), {
      method: "POST",
      endpoint: "interactions/interaction-123/interaction-token/callback",
      auth: [],
      headers,
      query: {
        with_response: false,
      },
      body: {
        type: 4,
        data: {
          content: "hello",
        },
      },
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-original-interaction-response"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
    }), {
      method: "GET",
      endpoint: "webhooks/app-123/interaction-token/messages/@original",
      auth: [],
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-original-interaction-response"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
      content: "updated",
      files: ["original file"],
      attachments: [{ id: "0", filename: "original.txt" }],
    }), {
      method: "PATCH",
      endpoint: "webhooks/app-123/interaction-token/messages/@original",
      auth: [],
      headers,
      bodyEncoding: "multipart",
      body: {
        payload_json: JSON.stringify({
          content: "updated",
          attachments: [{ id: "0", filename: "original.txt" }],
        }),
        "files[0]": "original file",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-original-interaction-response"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
    }), {
      method: "DELETE",
      endpoint: "webhooks/app-123/interaction-token/messages/@original",
      auth: [],
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-followup-message"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
      content: "followup",
      files: ["followup file"],
      attachments: [{ id: "0", filename: "followup.txt" }],
    }), {
      method: "POST",
      endpoint: "webhooks/app-123/interaction-token",
      auth: [],
      headers,
      bodyEncoding: "multipart",
      body: {
        payload_json: JSON.stringify({
          content: "followup",
          attachments: [{ id: "0", filename: "followup.txt" }],
        }),
        "files[0]": "followup file",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-followup-message"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
      messageId: "message-123",
    }), {
      method: "GET",
      endpoint: "webhooks/app-123/interaction-token/messages/message-123",
      auth: [],
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-followup-message"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
      messageId: "message-123",
      content: "updated followup",
      embeds: [{ title: "Updated" }],
      components: [{ type: 1 }],
      attachments: [{ id: "0", filename: "updated.txt" }],
      flags: 4,
      poll: { question: { text: "Done?" } },
    }), {
      method: "PATCH",
      endpoint: "webhooks/app-123/interaction-token/messages/message-123",
      auth: [],
      headers,
      body: {
        content: "updated followup",
        embeds: [{ title: "Updated" }],
        components: [{ type: 1 }],
        attachments: [{ id: "0", filename: "updated.txt" }],
        flags: 4,
        poll: { question: { text: "Done?" } },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-followup-message"), {
      applicationId: "app-123",
      interactionToken: "interaction-token",
      messageId: "message-123",
    }), {
      method: "DELETE",
      endpoint: "webhooks/app-123/interaction-token/messages/message-123",
      auth: [],
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-global-application-command"), {
      applicationId: "app-123",
      name: "launch",
      nameLocalizations: {
        "en-US": "Launch",
      },
      description: "Launch the activity",
      descriptionLocalizations: {
        "en-US": "Launch the activity",
      },
      type: 4,
      defaultMemberPermissions: "0",
      defaultPermission: true,
      dmPermission: true,
      integrationTypes: [0, 1],
      contexts: [0, 1, 2],
      nsfw: false,
      handler: 2,
    }), {
      method: "POST",
      endpoint: "applications/app-123/commands",
      auth,
      headers,
      body: {
        name: "launch",
        name_localizations: {
          "en-US": "Launch",
        },
        description: "Launch the activity",
        description_localizations: {
          "en-US": "Launch the activity",
        },
        type: 4,
        default_member_permissions: "0",
        dm_permission: true,
        default_permission: true,
        nsfw: false,
        integration_types: [0, 1],
        contexts: [0, 1, 2],
        handler: 2,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-global-application-command"), {
      applicationId: "app-123",
      commandId: "command-123",
    }), {
      method: "DELETE",
      endpoint: "applications/app-123/commands/command-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.bulk-overwrite-global-application-commands"), {
      applicationId: "app-123",
      commands: [{
        name: "ping",
        description: "Ping command",
        type: 1,
      }],
    }), {
      method: "PUT",
      endpoint: "applications/app-123/commands",
      auth,
      headers,
      body: {},
      bodyValue: [{
        name: "ping",
        description: "Ping command",
        type: 1,
      }],
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.bulk-overwrite-guild-application-commands"), {
      applicationId: "app-123",
      guildId: "guild-123",
      commands: [{
        name: "guild-ping",
        description: "Guild ping command",
        type: 1,
      }],
    }), {
      method: "PUT",
      endpoint: "applications/app-123/guilds/guild-123/commands",
      auth,
      headers,
      body: {},
      bodyValue: [{
        name: "guild-ping",
        description: "Guild ping command",
        type: 1,
      }],
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-application-command"), {
      applicationId: "app-123",
      guildId: "guild-123",
      commandId: "command-123",
    }), {
      method: "DELETE",
      endpoint: "applications/app-123/guilds/guild-123/commands/command-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-guild-application-command-permissions"), {
      applicationId: "app-123",
      guildId: "guild-123",
    }), {
      method: "GET",
      endpoint: "applications/app-123/guilds/guild-123/commands/permissions",
      auth: bearerAuth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.get-application-command-permissions"), {
      applicationId: "app-123",
      guildId: "guild-123",
      commandId: "command-123",
    }), {
      method: "GET",
      endpoint: "applications/app-123/guilds/guild-123/commands/command-123/permissions",
      auth: bearerAuth,
      headers,
      query: {},
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "guild_id", "permissions"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.edit-application-command-permissions"), {
      applicationId: "app-123",
      guildId: "guild-123",
      commandId: "command-123",
      permissions: [{
        id: "role-123",
        type: 1,
        permission: true,
      }],
    }), {
      method: "PUT",
      endpoint: "applications/app-123/guilds/guild-123/commands/command-123/permissions",
      auth: bearerAuth,
      headers,
      body: {
        permissions: [{
          id: "role-123",
          type: 1,
          permission: true,
        }],
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "application_id", "guild_id", "permissions"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-scheduled-event"), {
      guildId: "456",
      channelId: "123",
      name: "Launch",
      privacyLevel: 2,
      scheduledStartTime: "2026-05-13T10:00:00.000Z",
      scheduledEndTime: "2026-05-13T11:00:00.000Z",
      entityType: 2,
      description: "Release walkthrough",
      auditLogReason: "schedule release event",
    }), {
      method: "POST",
      endpoint: "guilds/456/scheduled-events",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "schedule release event",
      },
      body: {
        channel_id: "123",
        name: "Launch",
        privacy_level: 2,
        scheduled_start_time: "2026-05-13T10:00:00.000Z",
        scheduled_end_time: "2026-05-13T11:00:00.000Z",
        description: "Release walkthrough",
        entity_type: 2,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    const recurrenceRule = {
      start: "2026-05-13T10:00:00.000Z",
      frequency: 2,
      interval: 1,
      by_weekday: [2],
    };
    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-scheduled-event"), {
      guildId: "456",
      name: "External launch",
      privacyLevel: 2,
      scheduledStartTime: "2026-05-13T10:00:00.000Z",
      scheduledEndTime: "2026-05-13T11:00:00.000Z",
      entityType: 3,
      entityMetadata: { location: "Online" },
      image: "data:image/png;base64,c2FtcGxl",
      recurrenceRule,
    }), {
      method: "POST",
      endpoint: "guilds/456/scheduled-events",
      auth,
      headers,
      body: {
        entity_metadata: { location: "Online" },
        name: "External launch",
        privacy_level: 2,
        scheduled_start_time: "2026-05-13T10:00:00.000Z",
        scheduled_end_time: "2026-05-13T11:00:00.000Z",
        entity_type: 3,
        image: "data:image/png;base64,c2FtcGxl",
        recurrence_rule: recurrenceRule,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-guild-scheduled-event"), {
      guildId: "456",
      guildScheduledEventId: "event-123",
      channelId: null,
      entityMetadata: null,
      description: null,
      recurrenceRule: null,
      image: "data:image/png;base64,dXBkYXRlZA==",
      status: 2,
      auditLogReason: "reschedule event",
    }), {
      method: "PATCH",
      endpoint: "guilds/456/scheduled-events/event-123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "reschedule event",
      },
      body: {
        channel_id: null,
        entity_metadata: null,
        description: null,
        status: 2,
        image: "data:image/png;base64,dXBkYXRlZA==",
        recurrence_rule: null,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "guild_id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-guild-scheduled-event"), {
      guildId: "456",
      guildScheduledEventId: "event-123",
    }), {
      method: "DELETE",
      endpoint: "guilds/456/scheduled-events/event-123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "null",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.list-guild-scheduled-event-users"), {
      guildId: "456",
      guildScheduledEventId: "event-123",
      limit: 50,
      withMember: true,
      before: "user-before",
      after: "user-after",
    }), {
      method: "GET",
      endpoint: "guilds/456/scheduled-events/event-123/users",
      auth,
      headers,
      query: {
        limit: 50,
        with_member: true,
        before: "user-before",
        after: "user-after",
      },
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-stage-instance"), {
      channelId: "123",
      topic: "Launch room",
      privacyLevel: 2,
      sendStartNotification: true,
      guildScheduledEventId: "event-123",
      auditLogReason: "start stage",
    }), {
      method: "POST",
      endpoint: "stage-instances",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "start stage",
      },
      body: {
        channel_id: "123",
        topic: "Launch room",
        privacy_level: 2,
        send_start_notification: true,
        guild_scheduled_event_id: "event-123",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id", "topic"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.update-stage-instance"), {
      channelId: "123",
      topic: "Updated room",
      privacyLevel: 2,
      auditLogReason: "rescheduled",
    }), {
      method: "PATCH",
      endpoint: "stage-instances/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "rescheduled",
      },
      body: {
        topic: "Updated room",
        privacy_level: 2,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "channel_id", "topic"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.delete-stage-instance"), {
      channelId: "123",
      auditLogReason: "close stage",
    }), {
      method: "DELETE",
      endpoint: "stage-instances/123",
      auth,
      headers: {
        ...headers,
        "X-Audit-Log-Reason": "close stage",
      },
      body: {},
      responseSchema: {
        type: "null",
      },
    });
  });

  it("covers Discord operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(DISCORD_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, DISCORD_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(DISCORD_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      DISCORD_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = DISCORD_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function action(id: string, name: string, fields: Field[], authFieldNames = ["discordBotToken"]) {
  return {
    id: `discord.action.${id}`,
    appId: "discord",
    kind: "action" as const,
    name,
    fields,
    authFieldNames,
  };
}

type Field = {
  name: string;
  type: string;
  optional: boolean;
  default?: unknown;
  min?: number;
  max?: number;
};

function field(name: string, type: string, optional = false, extras: {
  default?: unknown;
  min?: number;
  max?: number;
} = {}): Field {
  return { name, type, optional, ...extras };
}

function pagingFields(): Field[] {
  return [
    field("limit", "integer", true, { default: 1, min: 1, max: 100 }),
    field("after", "string", true),
    field("before", "string", true),
  ];
}
