import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildDiscordOperationRequest,
} from "./discord-operation-executor.ts";

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
    operations: [
      {
        id: "discord.action.get-channel",
        appId: "discord",
        kind: "action",
        name: "Get Channel",
        fields: [
          { name: "channelId", type: "string", optional: false },
        ],
        authFieldNames: ["discordBotToken"],
      },
      {
        id: "discord.action.list-guild-channels",
        appId: "discord",
        kind: "action",
        name: "List Guild Channels",
        fields: [
          { name: "guildId", type: "string", optional: false },
        ],
        authFieldNames: ["discordBotToken"],
      },
      {
        id: "discord.action.send-message",
        appId: "discord",
        kind: "action",
        name: "Send Message",
        fields: [
          { name: "channelId", type: "string", optional: false },
          { name: "content", type: "string", optional: false },
          { name: "messageId", type: "string", optional: true },
          { name: "guildId", type: "string", optional: true },
        ],
        authFieldNames: ["discordBotToken"],
      },
    ],
  }],
});

describe("discord operation runtime", () => {
  it("builds Discord channel and message request plans", () => {
    const get = operation("discord.action.get-channel");
    const list = operation("discord.action.list-guild-channels");
    const send = operation("discord.action.send-message");
    const headers = { accept: "application/json" };
    const auth = [{ type: "secret" as const, field: "discordBotToken", placement: "bearer" as const, prefix: "Bot" }];

    assert.deepEqual(buildDiscordOperationRequest(get, { channelId: "123" }), {
      method: "GET",
      endpoint: "channels/123",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["id", "type"],
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(list, { guildId: "456" }), {
      method: "GET",
      endpoint: "guilds/456/channels",
      auth,
      headers,
      body: {},
      responseSchema: {
        type: "array",
      },
    });

    assert.deepEqual(buildDiscordOperationRequest(send, {
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
  });
});

function operation(operationId: string) {
  const found = DISCORD_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
