import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { buildDiscordOperationRequest } from "./discord-operation-executor.ts";
import { action, field, operation, GUILD_FIELD, WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD } from "./discord-operation-test-catalog.ts";

const headers = { accept: "application/json" };
const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

describe("discord operation request plans", () => {
  it("builds Discord lobby and channel permission request plans", () => {
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
  });
});
