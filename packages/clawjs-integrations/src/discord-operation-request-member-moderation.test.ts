import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { buildDiscordOperationRequest } from "./discord-operation-executor.ts";
import { action, field, operation, GUILD_FIELD, WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD } from "./discord-operation-test-catalog.ts";

const headers = { accept: "application/json" };
const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

describe("discord operation request plans", () => {
  it("builds Discord member and moderation request plans", () => {
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
        oneOf: [
          { type: "object", requiredPaths: ["user"] },
          { type: "null" },
        ],
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
  });
});
