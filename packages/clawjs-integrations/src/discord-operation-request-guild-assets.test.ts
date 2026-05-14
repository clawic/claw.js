import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { buildDiscordOperationRequest } from "./discord-operation-executor.ts";
import { action, field, operation, GUILD_FIELD, WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD } from "./discord-operation-test-catalog.ts";

const headers = { accept: "application/json" };
const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

describe("discord operation request plans", () => {
  it("builds Discord role, guild asset, invite, thread, and automation request plans", () => {
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
  });
});
