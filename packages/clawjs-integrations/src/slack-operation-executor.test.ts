import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  buildSlackOperationRequest,
} from "./slack-operation-executor.ts";
const SLACK_CATALOG = normalizeConnectorCatalog({
  version: 1,
  apps: [{
    id: "slack",
    name: "Slack",
    authFieldNames: ["slackBotToken"],
    fields: [{
      name: "slackBotToken",
      type: "app",
      optional: false,
      secret: true,
    }],
    operations: [
      {
        id: "slack.action.send-message",
        appId: "slack",
        kind: "action",
        name: "Send Message",
        fields: [
          { name: "channelId", type: "string", optional: false },
          { name: "text", type: "string", optional: false },
          { name: "threadTs", type: "string", optional: true },
        ],
        authFieldNames: ["slackBotToken"],
      },
      {
        id: "slack.action.list-channels",
        appId: "slack",
        kind: "action",
        name: "List Channels",
        fields: [
          { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
          { name: "cursor", type: "string", optional: true },
        ],
        authFieldNames: ["slackBotToken"],
      },
      {
        id: "slack.action.get-channel",
        appId: "slack",
        kind: "action",
        name: "Get Channel",
        fields: [
          { name: "channelId", type: "string", optional: false },
        ],
        authFieldNames: ["slackBotToken"],
      },
    ],
  }],
});
describe("slack operation runtime", () => {
  it("builds Slack Web API request plans for channel operations", () => {
    const send = operation("slack.action.send-message");
    const list = operation("slack.action.list-channels");
    const get = operation("slack.action.get-channel");

    assert.deepEqual(buildSlackOperationRequest(send, {
      channelId: "C123",
      text: "hello",
      threadTs: "1710000000.000000",
    }), {
      method: "POST",
      endpoint: "chat.postMessage",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        channel: "C123",
        text: "hello",
        thread_ts: "1710000000.000000",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "channel", "ts"],
      },
    });

    assert.deepEqual(buildSlackOperationRequest(list, { limit: 50 }), {
      method: "GET",
      endpoint: "conversations.list",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      query: {
        types: "public_channel,private_channel",
        limit: 50,
        exclude_archived: true,
      },
      body: {},
      pagination: {
        mode: "cursor",
        itemsPath: "channels",
        nextCursorPath: "response_metadata.next_cursor",
        cursorParam: "cursor",
        limitParam: "limit",
        pageSize: 50,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "channels"],
      },
    });

    assert.deepEqual(buildSlackOperationRequest(get, { channelId: "C123" }), {
      method: "GET",
      endpoint: "conversations.info",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      query: { channel: "C123" },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "channel"],
      },
    });
  });

});

function operation(operationId: string) {
  const found = SLACK_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}
