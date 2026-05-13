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

const DISCORD_ACTIONS = [
  action("get-current-user", "Get Current User", []),
  action("get-user", "Get User", [USER_FIELD]),
  action("list-current-user-guilds", "List Current User Guilds", pagingFields()),
  action("get-guild", "Get Guild", [GUILD_FIELD, field("withCounts", "boolean", true)]),
  action("get-guild-preview", "Get Guild Preview", [GUILD_FIELD]),
  action("list-guild-channels", "List Guild Channels", [GUILD_FIELD]),
  action("create-guild-channel", "Create Guild Channel", [GUILD_FIELD, field("name", "string"), field("type", "integer", true, { default: 0 })]),
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
  action("list-guild-invites", "List Guild Invites", [GUILD_FIELD]),
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
