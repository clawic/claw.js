import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { buildDiscordOperationRequest } from "./discord-operation-executor.ts";
import { action, field, operation, GUILD_FIELD, WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD } from "./discord-operation-test-catalog.ts";

const headers = { accept: "application/json" };
const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

describe("discord operation request plans", () => {
  it("builds Discord core user, guild, channel, message, and voice request plans", () => {
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
  });
});
