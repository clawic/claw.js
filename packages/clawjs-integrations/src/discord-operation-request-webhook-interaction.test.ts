import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { buildDiscordOperationRequest } from "./discord-operation-executor.ts";
import { action, field, operation, GUILD_FIELD, WEBHOOK_FIELD, WEBHOOK_TOKEN_FIELD } from "./discord-operation-test-catalog.ts";

const headers = { accept: "application/json" };
const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];
const bearerAuth = [{ type: "secret" as const, field: "discordBearerToken", placement: "bearer" as const }];

describe("discord operation request plans", () => {
  it("builds Discord webhook and interaction request plans", () => {
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
  });
});
