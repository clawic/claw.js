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
const MESSAGE_FIELD = field("messageId", "string");
const USER_FIELD = field("userId", "string");
const ROLE_FIELD = field("roleId", "string");
const WEBHOOK_FIELD = field("webhookId", "string");
const WEBHOOK_TOKEN_FIELD = field("webhookToken", "string");
const APPLICATION_FIELD = field("applicationId", "string");
const COMMAND_FIELD = field("commandId", "string");
const TEMPLATE_CODE_FIELD = field("templateCode", "string");
const SOUNDBOARD_SOUND_FIELD = field("soundboardSoundId", "string");
const STICKER_FIELD = field("stickerId", "string");
const STICKER_PACK_FIELD = field("stickerPackId", "string");
const AUTO_MODERATION_RULE_FIELD = field("autoModerationRuleId", "string");
const AUTO_MODERATION_ACTIONS_FIELD = field("actions", "array", false, { default: [{ type: 1, metadata: { custom_message: "sample" } }] });
const AUTO_MODERATION_TRIGGER_METADATA_FIELD = field("triggerMetadata", "object", true, { default: { keyword_filter: ["sample"] } });

const DISCORD_ACTIONS = [
  action("get-current-user", "Get Current User", []),
  action("get-user", "Get User", [USER_FIELD]),
  action("list-current-user-guilds", "List Current User Guilds", pagingFields()),
  action("get-guild", "Get Guild", [GUILD_FIELD, field("withCounts", "boolean", true)]),
  action("get-guild-preview", "Get Guild Preview", [GUILD_FIELD]),
  action("list-guild-channels", "List Guild Channels", [GUILD_FIELD]),
  action("create-guild-channel", "Create Guild Channel", [GUILD_FIELD, field("name", "string"), field("type", "integer", true, { default: 0 })]),
  action("get-guild-template", "Get Guild Template", [TEMPLATE_CODE_FIELD]),
  action("list-guild-templates", "List Guild Templates", [GUILD_FIELD]),
  action("create-guild-template", "Create Guild Template", [GUILD_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" })]),
  action("sync-guild-template", "Sync Guild Template", [GUILD_FIELD, TEMPLATE_CODE_FIELD]),
  action("update-guild-template", "Update Guild Template", [GUILD_FIELD, TEMPLATE_CODE_FIELD, field("name", "string", true, { default: "sample" }), field("description", "string", true, { default: "sample" })]),
  action("delete-guild-template", "Delete Guild Template", [GUILD_FIELD, TEMPLATE_CODE_FIELD]),
  action("send-soundboard-sound", "Send Soundboard Sound", [CHANNEL_FIELD, SOUNDBOARD_SOUND_FIELD, field("sourceGuildId", "string", true)]),
  action("list-default-soundboard-sounds", "List Default Soundboard Sounds", []),
  action("list-guild-soundboard-sounds", "List Guild Soundboard Sounds", [GUILD_FIELD]),
  action("get-guild-soundboard-sound", "Get Guild Soundboard Sound", [GUILD_FIELD, SOUNDBOARD_SOUND_FIELD]),
  action("create-guild-soundboard-sound", "Create Guild Soundboard Sound", [GUILD_FIELD, field("name", "string"), field("sound", "string", false, { default: "data:audio/mpeg;base64,c2FtcGxl" }), field("volume", "number", true, { default: 1 }), field("emojiId", "string", true), field("emojiName", "string", true), field("auditLogReason", "string", true)]),
  action("update-guild-soundboard-sound", "Update Guild Soundboard Sound", [GUILD_FIELD, SOUNDBOARD_SOUND_FIELD, field("name", "string", true, { default: "sample" }), field("volume", "number", true, { default: 1 }), field("emojiId", "string", true), field("emojiName", "string", true), field("auditLogReason", "string", true)]),
  action("delete-guild-soundboard-sound", "Delete Guild Soundboard Sound", [GUILD_FIELD, SOUNDBOARD_SOUND_FIELD, field("auditLogReason", "string", true)]),
  action("get-application-role-connection-metadata", "Get Application Role Connection Metadata", [APPLICATION_FIELD]),
  action("update-application-role-connection-metadata", "Update Application Role Connection Metadata", [APPLICATION_FIELD, field("records", "array", false, { default: [{ type: 2, key: "score", name: "Score", description: "Sample score" }] })]),
  action("list-guild-emojis", "List Guild Emojis", [GUILD_FIELD]),
  action("get-guild-emoji", "Get Guild Emoji", [GUILD_FIELD, field("emojiId", "string")]),
  action("create-guild-emoji", "Create Guild Emoji", [GUILD_FIELD, field("name", "string"), field("image", "string", false, { default: "data:image/png;base64,c2FtcGxl" }), field("roles", "array", true, { default: ["sample"] })]),
  action("update-guild-emoji", "Update Guild Emoji", [GUILD_FIELD, field("emojiId", "string"), field("name", "string", true, { default: "sample" }), field("roles", "array", true, { default: ["sample"] })]),
  action("delete-guild-emoji", "Delete Guild Emoji", [GUILD_FIELD, field("emojiId", "string")]),
  action("get-sticker", "Get Sticker", [STICKER_FIELD]),
  action("list-sticker-packs", "List Sticker Packs", []),
  action("get-sticker-pack", "Get Sticker Pack", [STICKER_PACK_FIELD]),
  action("list-guild-stickers", "List Guild Stickers", [GUILD_FIELD]),
  action("get-guild-sticker", "Get Guild Sticker", [GUILD_FIELD, STICKER_FIELD]),
  action("create-guild-sticker", "Create Guild Sticker", [GUILD_FIELD, field("name", "string"), field("description", "string"), field("tags", "string"), field("file", "string", false, { default: "sample-file" }), field("auditLogReason", "string", true)]),
  action("update-guild-sticker", "Update Guild Sticker", [GUILD_FIELD, STICKER_FIELD, field("name", "string", true, { default: "sample" }), field("description", "string", true, { default: "sample" }), field("tags", "string", true, { default: "sample" }), field("auditLogReason", "string", true)]),
  action("delete-guild-sticker", "Delete Guild Sticker", [GUILD_FIELD, STICKER_FIELD, field("auditLogReason", "string", true)]),
  action("get-channel", "Get Channel", [CHANNEL_FIELD]),
  action("update-channel", "Update Channel", [CHANNEL_FIELD, field("name", "string", true, { default: "sample" })]),
  action("delete-channel", "Delete Channel", [CHANNEL_FIELD]),
  action("list-messages", "List Messages", [CHANNEL_FIELD, field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("get-message", "Get Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("send-message", "Send Message", [CHANNEL_FIELD, field("content", "string"), field("messageId", "string", true), field("guildId", "string", true)]),
  action("edit-message", "Edit Message", [CHANNEL_FIELD, MESSAGE_FIELD, field("content", "string", true, { default: "sample" })]),
  action("delete-message", "Delete Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("bulk-delete-messages", "Bulk Delete Messages", [CHANNEL_FIELD, field("messages", "array", false, { default: ["sample"] })]),
  action("crosspost-message", "Crosspost Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("list-pinned-messages", "List Pinned Messages", [CHANNEL_FIELD]),
  action("pin-message", "Pin Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("unpin-message", "Unpin Message", [CHANNEL_FIELD, MESSAGE_FIELD]),
  action("create-reaction", "Create Reaction", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("delete-own-reaction", "Delete Own Reaction", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("delete-user-reaction", "Delete User Reaction", [CHANNEL_FIELD, MESSAGE_FIELD, USER_FIELD, field("emoji", "string", false, { default: "thumbsup" })]),
  action("list-reactions", "List Reactions", [CHANNEL_FIELD, MESSAGE_FIELD, field("emoji", "string", false, { default: "thumbsup" }), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("start-thread-from-message", "Start Thread From Message", [CHANNEL_FIELD, MESSAGE_FIELD, field("name", "string")]),
  action("start-thread-without-message", "Start Thread Without Message", [CHANNEL_FIELD, field("name", "string"), field("type", "integer", true, { default: 11 })]),
  action("list-active-threads", "List Active Threads", [GUILD_FIELD]),
  action("join-thread", "Join Thread", [CHANNEL_FIELD]),
  action("leave-thread", "Leave Thread", [CHANNEL_FIELD]),
  action("add-thread-member", "Add Thread Member", [CHANNEL_FIELD, USER_FIELD]),
  action("remove-thread-member", "Remove Thread Member", [CHANNEL_FIELD, USER_FIELD]),
  action("get-thread-member", "Get Thread Member", [CHANNEL_FIELD, USER_FIELD, field("withMember", "boolean", true)]),
  action("list-thread-members", "List Thread Members", [CHANNEL_FIELD, field("withMember", "boolean", true), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("list-guild-members", "List Guild Members", [GUILD_FIELD, field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("get-guild-member", "Get Guild Member", [GUILD_FIELD, USER_FIELD]),
  action("search-guild-members", "Search Guild Members", [GUILD_FIELD, field("query", "string"), field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("modify-guild-member", "Modify Guild Member", [GUILD_FIELD, USER_FIELD, field("nick", "string", true, { default: "sample" })]),
  action("remove-guild-member", "Remove Guild Member", [GUILD_FIELD, USER_FIELD]),
  action("list-guild-roles", "List Guild Roles", [GUILD_FIELD]),
  action("create-guild-role", "Create Guild Role", [GUILD_FIELD, field("name", "string", true, { default: "sample" })]),
  action("update-guild-role", "Update Guild Role", [GUILD_FIELD, ROLE_FIELD, field("name", "string", true, { default: "sample" })]),
  action("delete-guild-role", "Delete Guild Role", [GUILD_FIELD, ROLE_FIELD]),
  action("add-guild-member-role", "Add Guild Member Role", [GUILD_FIELD, USER_FIELD, ROLE_FIELD]),
  action("remove-guild-member-role", "Remove Guild Member Role", [GUILD_FIELD, USER_FIELD, ROLE_FIELD]),
  action("list-guild-bans", "List Guild Bans", [GUILD_FIELD, field("limit", "integer", true, { default: 1, min: 1, max: 100 })]),
  action("get-guild-ban", "Get Guild Ban", [GUILD_FIELD, USER_FIELD]),
  action("create-guild-ban", "Create Guild Ban", [GUILD_FIELD, USER_FIELD, field("deleteMessageSeconds", "integer", true, { default: 0, min: 0 })]),
  action("remove-guild-ban", "Remove Guild Ban", [GUILD_FIELD, USER_FIELD]),
  action("list-auto-moderation-rules", "List Auto Moderation Rules", [GUILD_FIELD]),
  action("get-auto-moderation-rule", "Get Auto Moderation Rule", [GUILD_FIELD, AUTO_MODERATION_RULE_FIELD]),
  action("create-auto-moderation-rule", "Create Auto Moderation Rule", [GUILD_FIELD, field("name", "string"), field("eventType", "integer", false, { default: 1 }), field("triggerType", "integer", false, { default: 1 }), AUTO_MODERATION_TRIGGER_METADATA_FIELD, AUTO_MODERATION_ACTIONS_FIELD, field("enabled", "boolean", true), field("exemptRoles", "array", true, { default: ["sample"] }), field("exemptChannels", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("update-auto-moderation-rule", "Update Auto Moderation Rule", [GUILD_FIELD, AUTO_MODERATION_RULE_FIELD, field("name", "string", true, { default: "sample" }), field("eventType", "integer", true, { default: 1 }), AUTO_MODERATION_TRIGGER_METADATA_FIELD, field("actions", "array", true, { default: [{ type: 1, metadata: { custom_message: "sample" } }] }), field("enabled", "boolean", true), field("exemptRoles", "array", true, { default: ["sample"] }), field("exemptChannels", "array", true, { default: ["sample"] }), field("auditLogReason", "string", true)]),
  action("delete-auto-moderation-rule", "Delete Auto Moderation Rule", [GUILD_FIELD, AUTO_MODERATION_RULE_FIELD, field("auditLogReason", "string", true)]),
  action("list-guild-invites", "List Guild Invites", [GUILD_FIELD]),
  action("list-guild-scheduled-events", "List Guild Scheduled Events", [GUILD_FIELD, field("withUserCount", "boolean", true)]),
  action("create-guild-scheduled-event", "Create Guild Scheduled Event", [
    GUILD_FIELD,
    CHANNEL_FIELD,
    field("name", "string"),
    field("privacyLevel", "integer", false, { default: 2 }),
    field("scheduledStartTime", "string", false, { default: "2026-05-13T10:00:00.000Z" }),
    field("scheduledEndTime", "string", true, { default: "2026-05-13T11:00:00.000Z" }),
    field("entityType", "integer", false, { default: 2 }),
    field("description", "string", true, { default: "sample" }),
  ]),
  action("get-guild-scheduled-event", "Get Guild Scheduled Event", [GUILD_FIELD, field("guildScheduledEventId", "string"), field("withUserCount", "boolean", true)]),
  action("update-guild-scheduled-event", "Update Guild Scheduled Event", [
    GUILD_FIELD,
    field("guildScheduledEventId", "string"),
    CHANNEL_FIELD,
    field("name", "string", true, { default: "sample" }),
    field("privacyLevel", "integer", true, { default: 2 }),
    field("scheduledStartTime", "string", true, { default: "2026-05-13T10:00:00.000Z" }),
    field("scheduledEndTime", "string", true, { default: "2026-05-13T11:00:00.000Z" }),
    field("entityType", "integer", true, { default: 2 }),
    field("description", "string", true, { default: "sample" }),
    field("status", "integer", true, { default: 2 }),
  ]),
  action("delete-guild-scheduled-event", "Delete Guild Scheduled Event", [GUILD_FIELD, field("guildScheduledEventId", "string")]),
  action("list-guild-scheduled-event-users", "List Guild Scheduled Event Users", [GUILD_FIELD, field("guildScheduledEventId", "string"), field("limit", "integer", true, { default: 1, min: 1, max: 100 }), field("withMember", "boolean", true)]),
  action("create-stage-instance", "Create Stage Instance", [CHANNEL_FIELD, field("topic", "string"), field("privacyLevel", "integer", true, { default: 2 }), field("sendStartNotification", "boolean", true), field("guildScheduledEventId", "string", true)]),
  action("get-stage-instance", "Get Stage Instance", [CHANNEL_FIELD]),
  action("update-stage-instance", "Update Stage Instance", [CHANNEL_FIELD, field("topic", "string", true, { default: "sample" }), field("privacyLevel", "integer", true, { default: 2 }), field("auditLogReason", "string", true)]),
  action("delete-stage-instance", "Delete Stage Instance", [CHANNEL_FIELD, field("auditLogReason", "string", true)]),
  action("get-invite", "Get Invite", [field("inviteCode", "string"), field("withCounts", "boolean", true), field("withExpiration", "boolean", true)]),
  action("delete-invite", "Delete Invite", [field("inviteCode", "string")]),
  action("list-channel-webhooks", "List Channel Webhooks", [CHANNEL_FIELD]),
  action("list-guild-webhooks", "List Guild Webhooks", [GUILD_FIELD]),
  action("create-webhook", "Create Webhook", [CHANNEL_FIELD, field("name", "string")]),
  action("get-webhook", "Get Webhook", [WEBHOOK_FIELD]),
  action("update-webhook", "Update Webhook", [WEBHOOK_FIELD, field("name", "string", true, { default: "sample" })]),
  action("delete-webhook", "Delete Webhook", [WEBHOOK_FIELD]),
  action("execute-webhook", "Execute Webhook", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, field("content", "string"), field("wait", "boolean", true)], []),
  action("get-webhook-message", "Get Webhook Message", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, MESSAGE_FIELD], []),
  action("edit-webhook-message", "Edit Webhook Message", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, MESSAGE_FIELD, field("content", "string", true, { default: "sample" })], []),
  action("delete-webhook-message", "Delete Webhook Message", [WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD, MESSAGE_FIELD], []),
  action("list-global-application-commands", "List Global Application Commands", [APPLICATION_FIELD]),
  action("create-global-application-command", "Create Global Application Command", [APPLICATION_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" })]),
  action("get-global-application-command", "Get Global Application Command", [APPLICATION_FIELD, COMMAND_FIELD]),
  action("update-global-application-command", "Update Global Application Command", [APPLICATION_FIELD, COMMAND_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" })]),
  action("delete-global-application-command", "Delete Global Application Command", [APPLICATION_FIELD, COMMAND_FIELD]),
  action("list-application-emojis", "List Application Emojis", [APPLICATION_FIELD]),
  action("get-application-emoji", "Get Application Emoji", [APPLICATION_FIELD, field("emojiId", "string")]),
  action("create-application-emoji", "Create Application Emoji", [APPLICATION_FIELD, field("name", "string"), field("image", "string", false, { default: "data:image/png;base64,c2FtcGxl" })]),
  action("update-application-emoji", "Update Application Emoji", [APPLICATION_FIELD, field("emojiId", "string"), field("name", "string", true, { default: "sample" })]),
  action("delete-application-emoji", "Delete Application Emoji", [APPLICATION_FIELD, field("emojiId", "string")]),
  action("list-guild-application-commands", "List Guild Application Commands", [APPLICATION_FIELD, GUILD_FIELD]),
  action("create-guild-application-command", "Create Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" })]),
  action("get-guild-application-command", "Get Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD]),
  action("update-guild-application-command", "Update Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD, field("name", "string"), field("description", "string", true, { default: "sample" })]),
  action("delete-guild-application-command", "Delete Guild Application Command", [APPLICATION_FIELD, GUILD_FIELD, COMMAND_FIELD]),
];

const DISCORD_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "discord",
    name: "Discord",
    authFieldNames: ["discordBotToken"],
    fields: [{
      name: "discordBotToken",
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

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.send-message"), {
      channelId: "123",
      content: "hello",
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

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-role"), {
      guildId: "456",
      name: "Operators",
      permissions: "0",
      mentionable: true,
    }), {
      method: "POST",
      endpoint: "guilds/456/roles",
      auth,
      headers,
      body: {
        name: "Operators",
        permissions: "0",
        mentionable: true,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "name"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-template"), {
      guildId: "456",
      name: "Support Server",
      description: "Public support layout",
    }), {
      method: "POST",
      endpoint: "guilds/456/templates",
      auth,
      headers,
      body: {
        name: "Support Server",
        description: "Public support layout",
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
        type: "object",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-soundboard-sound"), {
      guildId: "456",
      name: "Doorbell",
      sound: "data:audio/mpeg;base64,c2FtcGxl",
      volume: 0.75,
      emojiName: "bell",
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
        volume: 0.75,
        emoji_name: "bell",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["sound_id", "name"],
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

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-guild-emoji"), {
      guildId: "456",
      name: "wave",
      image: "data:image/png;base64,c2FtcGxl",
      roles: ["123"],
    }), {
      method: "POST",
      endpoint: "guilds/456/emojis",
      auth,
      headers,
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

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.execute-webhook"), {
      webhookId: "999",
      webhookToken: "offline-token",
      content: "hello",
      wait: true,
    }), {
      method: "POST",
      endpoint: "webhooks/999/offline-token",
      auth: [],
      headers,
      query: {
        wait: true,
      },
      body: {
        content: "hello",
      },
      responseSchema: {
        type: "object",
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
    }), {
      method: "POST",
      endpoint: "guilds/456/scheduled-events",
      auth,
      headers,
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

    assert.deepEqual(buildDiscordOperationRequest(operation("discord.action.create-stage-instance"), {
      channelId: "123",
      topic: "Launch room",
      privacyLevel: 2,
      sendStartNotification: true,
      guildScheduledEventId: "event-123",
    }), {
      method: "POST",
      endpoint: "stage-instances",
      auth,
      headers,
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
