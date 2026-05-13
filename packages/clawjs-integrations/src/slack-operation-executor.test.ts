import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  verifyConnectorRuntimeCoverage,
  verifyConnectorRuntimeOfflineExecutions,
} from "./runtime-coverage.ts";
import {
  buildSlackOperationRequest,
  SLACK_EXTRA_ACTION_SPECS,
} from "./slack-operation-executor.ts";

const SLACK_ACTIONS = [
  action("slack.action.send-message", "Send Message", [
    { name: "channelId", type: "string", optional: false },
    { name: "text", type: "string", optional: false },
    { name: "threadTs", type: "string", optional: true },
  ]),
  action("slack.action.update-message", "Update Message", [
    { name: "channelId", type: "string", optional: false },
    { name: "messageTs", type: "string", optional: false },
    { name: "text", type: "string", optional: true, default: "sample" },
  ]),
  action("slack.action.delete-message", "Delete Message", [
    { name: "channelId", type: "string", optional: false },
    { name: "messageTs", type: "string", optional: false },
  ]),
  action("slack.action.schedule-message", "Schedule Message", [
    { name: "channelId", type: "string", optional: false },
    { name: "text", type: "string", optional: false },
    { name: "postAt", type: "integer", optional: false, default: 1710003600 },
  ]),
  action("slack.action.delete-scheduled-message", "Delete Scheduled Message", [
    { name: "channelId", type: "string", optional: false },
    { name: "scheduledMessageId", type: "string", optional: false },
  ]),
  action("slack.action.post-ephemeral", "Post Ephemeral Message", [
    { name: "channelId", type: "string", optional: false },
    { name: "userId", type: "string", optional: false },
    { name: "text", type: "string", optional: false },
  ]),
  action("slack.action.get-channel", "Get Channel", [
    { name: "channelId", type: "string", optional: false },
  ]),
  action("slack.action.list-channels", "List Channels", [
    { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
    { name: "cursor", type: "string", optional: true },
  ]),
  action("slack.action.create-channel", "Create Channel", [
    { name: "name", type: "string", optional: false },
    { name: "isPrivate", type: "boolean", optional: true },
  ]),
  action("slack.action.rename-channel", "Rename Channel", [
    { name: "channelId", type: "string", optional: false },
    { name: "name", type: "string", optional: false },
  ]),
  action("slack.action.archive-channel", "Archive Channel", [
    { name: "channelId", type: "string", optional: false },
  ]),
  action("slack.action.unarchive-channel", "Unarchive Channel", [
    { name: "channelId", type: "string", optional: false },
  ]),
  action("slack.action.invite-to-channel", "Invite To Channel", [
    { name: "channelId", type: "string", optional: false },
    { name: "users", type: "string", optional: false },
  ]),
  action("slack.action.kick-from-channel", "Kick From Channel", [
    { name: "channelId", type: "string", optional: false },
    { name: "userId", type: "string", optional: false },
  ]),
  action("slack.action.join-channel", "Join Channel", [
    { name: "channelId", type: "string", optional: false },
  ]),
  action("slack.action.leave-channel", "Leave Channel", [
    { name: "channelId", type: "string", optional: false },
  ]),
  action("slack.action.conversation-history", "Conversation History", [
    { name: "channelId", type: "string", optional: false },
    { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
  ]),
  action("slack.action.conversation-replies", "Conversation Replies", [
    { name: "channelId", type: "string", optional: false },
    { name: "messageTs", type: "string", optional: false },
    { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
  ]),
  action("slack.action.conversation-members", "Conversation Members", [
    { name: "channelId", type: "string", optional: false },
    { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
  ]),
  action("slack.action.open-conversation", "Open Conversation", [
    { name: "users", type: "string", optional: false },
  ]),
  action("slack.action.list-users", "List Users", [
    { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
  ]),
  action("slack.action.get-user", "Get User", [
    { name: "userId", type: "string", optional: false },
  ]),
  action("slack.action.get-user-presence", "Get User Presence", [
    { name: "userId", type: "string", optional: false },
  ]),
  action("slack.action.set-user-presence", "Set User Presence", [
    { name: "presence", type: "string", optional: false, default: "auto" },
  ]),
  action("slack.action.add-reaction", "Add Reaction", reactionFields()),
  action("slack.action.remove-reaction", "Remove Reaction", reactionFields()),
  action("slack.action.get-reactions", "Get Reactions", reactionFields()),
  action("slack.action.add-pin", "Add Pin", pinFields()),
  action("slack.action.remove-pin", "Remove Pin", pinFields()),
  action("slack.action.list-pins", "List Pins", [
    { name: "channelId", type: "string", optional: false },
  ]),
  action("slack.action.list-files", "List Files", [
    { name: "limit", type: "integer", optional: true, default: 1, min: 1 },
  ]),
  action("slack.action.get-file", "Get File", [
    { name: "fileId", type: "string", optional: false },
  ]),
  action("slack.action.delete-file", "Delete File", [
    { name: "fileId", type: "string", optional: false },
  ]),
  action("slack.action.add-reminder", "Add Reminder", [
    { name: "text", type: "string", optional: false },
    { name: "time", type: "string", optional: false, default: "in 10 minutes" },
  ]),
  action("slack.action.list-reminders", "List Reminders", []),
  action("slack.action.complete-reminder", "Complete Reminder", [
    { name: "reminderId", type: "string", optional: false },
  ]),
  action("slack.action.delete-reminder", "Delete Reminder", [
    { name: "reminderId", type: "string", optional: false },
  ]),
  action("slack.action.search-messages", "Search Messages", [
    { name: "query", type: "string", optional: false },
  ]),
  action("slack.action.search-files", "Search Files", [
    { name: "query", type: "string", optional: false },
  ]),
  action("slack.action.list-usergroups", "List User Groups", []),
  action("slack.action.enable-usergroup", "Enable User Group", [
    { name: "usergroupId", type: "string", optional: false },
  ]),
  action("slack.action.disable-usergroup", "Disable User Group", [
    { name: "usergroupId", type: "string", optional: false },
  ]),
  action("slack.action.list-usergroup-users", "List User Group Users", [
    { name: "usergroupId", type: "string", optional: false },
  ]),
  action("slack.action.update-usergroup-users", "Update User Group Users", [
    { name: "usergroupId", type: "string", optional: false },
    { name: "users", type: "string", optional: false },
  ]),
  action("slack.action.open-view", "Open View", [
    { name: "triggerId", type: "string", optional: false },
    { name: "view", type: "object", optional: false, default: { type: "modal", title: { type: "plain_text", text: "Sample" }, blocks: [], close: { type: "plain_text", text: "Close" } } },
  ]),
  action("slack.action.publish-view", "Publish View", [
    { name: "userId", type: "string", optional: false },
    { name: "view", type: "object", optional: false, default: { type: "home", blocks: [] } },
  ]),
  action("slack.action.push-view", "Push View", [
    { name: "triggerId", type: "string", optional: false },
    { name: "view", type: "object", optional: false, default: { type: "modal", title: { type: "plain_text", text: "Sample" }, blocks: [], close: { type: "plain_text", text: "Close" } } },
  ]),
  action("slack.action.update-view", "Update View", [
    { name: "viewId", type: "string", optional: false },
    { name: "view", type: "object", optional: false, default: { type: "modal", title: { type: "plain_text", text: "Sample" }, blocks: [], close: { type: "plain_text", text: "Close" } } },
  ]),
  action("slack.action.test-auth", "Test Auth", []),
  ...SLACK_EXTRA_ACTION_SPECS.map((spec) => action(`slack.action.${spec.slug}`, titleize(spec.slug), spec.fields)),
];

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
    operations: SLACK_ACTIONS,
  }],
});
describe("slack operation runtime", () => {
  it("builds Slack Web API request plans for core operations", () => {
    const send = operation("slack.action.send-message");
    const list = operation("slack.action.list-channels");
    const get = operation("slack.action.get-channel");
    const history = operation("slack.action.conversation-history");
    const update = operation("slack.action.update-message");
    const view = operation("slack.action.open-view");
    const permalink = operation("slack.action.get-message-permalink");
    const bookmark = operation("slack.action.add-bookmark");
    const remoteFile = operation("slack.action.add-remote-file");

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

    assert.deepEqual(buildSlackOperationRequest(update, {
      channelId: "C123",
      messageTs: "1710000000.000000",
      text: "edited",
    }), {
      method: "POST",
      endpoint: "chat.update",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        channel: "C123",
        ts: "1710000000.000000",
        text: "edited",
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

    assert.deepEqual(buildSlackOperationRequest(history, { channelId: "C123", limit: 25 }), {
      method: "GET",
      endpoint: "conversations.history",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      query: {
        channel: "C123",
        limit: 25,
      },
      body: {},
      pagination: {
        mode: "cursor",
        itemsPath: "messages",
        nextCursorPath: "response_metadata.next_cursor",
        cursorParam: "cursor",
        limitParam: "limit",
        pageSize: 25,
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "messages"],
      },
    });

    assert.deepEqual(buildSlackOperationRequest(view, {
      triggerId: "trigger_sample",
      view: { type: "modal", blocks: [] },
    }), {
      method: "POST",
      endpoint: "views.open",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        trigger_id: "trigger_sample",
        view: { type: "modal", blocks: [] },
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "view"],
      },
    });

    assert.deepEqual(buildSlackOperationRequest(permalink, {
      channelId: "C123",
      messageTs: "1710000000.000000",
    }), {
      method: "GET",
      endpoint: "chat.getPermalink",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      query: {
        channel: "C123",
        message_ts: "1710000000.000000",
      },
      body: {},
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "permalink"],
      },
    });

    assert.deepEqual(buildSlackOperationRequest(bookmark, {
      channelId: "C123",
      title: "Sample bookmark",
      type: "link",
      link: "https://example.invalid",
      emoji: ":bookmark:",
    }), {
      method: "POST",
      endpoint: "bookmarks.add",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        channel_id: "C123",
        title: "Sample bookmark",
        type: "link",
        link: "https://example.invalid",
        emoji: ":bookmark:",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "bookmark"],
      },
    });

    assert.deepEqual(buildSlackOperationRequest(remoteFile, {
      externalId: "external-123",
      externalUrl: "https://example.invalid/file",
      title: "Sample file",
      filetype: "text",
      indexableFileContents: "sample",
    }), {
      method: "POST",
      endpoint: "files.remote.add",
      auth: [{ type: "secret", field: "slackBotToken", placement: "bearer" }],
      headers: { accept: "application/json" },
      body: {
        external_id: "external-123",
        external_url: "https://example.invalid/file",
        title: "Sample file",
        filetype: "text",
        indexable_file_contents: "sample",
      },
      responseSchema: {
        type: "object",
        requiredPaths: ["ok", "file"],
      },
    });
  });

  it("covers Slack operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(SLACK_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, SLACK_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(SLACK_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      SLACK_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});

function operation(operationId: string) {
  const found = SLACK_CATALOG.apps[0]?.operations.find((candidate) => candidate.id === operationId);
  assert.ok(found);
  return found;
}

function action(id: string, name: string, fields: Array<{
  name: string;
  type: string;
  optional: boolean;
  default?: unknown;
  min?: number;
  max?: number;
}>) {
  return {
    id,
    appId: "slack",
    kind: "action" as const,
    name,
    fields,
    authFieldNames: ["slackBotToken"],
  };
}

function titleize(slug: string): string {
  return slug.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function reactionFields() {
  return [
    { name: "channelId", type: "string", optional: false },
    { name: "timestamp", type: "string", optional: false },
    { name: "name", type: "string", optional: false, default: "thumbsup" },
  ];
}

function pinFields() {
  return [
    { name: "channelId", type: "string", optional: false },
    { name: "timestamp", type: "string", optional: false },
  ];
}
