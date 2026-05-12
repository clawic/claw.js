import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeConnectorCatalog } from "./catalog.ts";
import {
  createConnectorRuntimeFixtureFetch,
  loadConnectorRuntimeFixtures,
} from "./runtime-fixtures.ts";
import { runConnectorSource } from "./source-runner.ts";
import {
  telegramInboundMessageFromUpdate,
  telegramSourceEventsForUpdate,
} from "./telegram-source.ts";

describe("telegram source events", () => {
  it("emits generic, message, and command source events for matching commands", () => {
    const events = telegramSourceEventsForUpdate(
      {
        update_id: 100,
        message: {
          message_id: 20,
          date: 1_700_000_000,
          chat: { id: 123 },
          from: { id: 1, first_name: "Ada" },
          text: "/start hello",
        },
      },
      { commands: ["/start"] },
    );

    assert.deepEqual(events.map((event) => event.kind), [
      "new-updates",
      "message-updates",
      "new-bot-command-received",
    ]);
    assert.deepEqual(events.map((event) => event.meta), [
      { id: 100, summary: "New message update: 100", ts: 1_700_000_000 },
      { id: 100, summary: "/start hello", ts: 1_700_000_000 },
      { id: 100, summary: "/start hello", ts: 1_700_000_000 },
    ]);
  });

  it("filters message source events by chat id", () => {
    const events = telegramSourceEventsForUpdate(
      {
        update_id: 101,
        message: {
          message_id: 21,
          date: 1_700_000_100,
          chat: { id: 123 },
          text: "hello",
        },
      },
      { chatId: "999" },
    );

    assert.deepEqual(events.map((event) => event.kind), ["new-updates"]);
  });

  it("accepts JSON command lists like the source prop value", () => {
    const events = telegramSourceEventsForUpdate(
      {
        update_id: 104,
        message: {
          message_id: 24,
          date: 1_700_000_400,
          chat: { id: 123 },
          text: "/deploy now",
        },
      },
      { commands: "[\"/deploy\"]" },
    );

    assert.deepEqual(events.map((event) => event.kind), [
      "new-updates",
      "message-updates",
      "new-bot-command-received",
    ]);
  });

  it("emits channel source events with the channel summary", () => {
    const events = telegramSourceEventsForUpdate({
      update_id: 102,
      channel_post: {
        message_id: 22,
        date: 1_700_000_200,
        chat: { id: -100, title: "Builds" },
        text: "release ready",
      },
    });

    assert.deepEqual(events.map((event) => event.kind), ["new-updates", "channel-updates"]);
    assert.equal(events[1]?.meta.summary, "Builds - release ready");
  });

  it("normalizes updates into adapter inbound messages", () => {
    assert.deepEqual(
      telegramInboundMessageFromUpdate("conn.telegram", {
        update_id: 103,
        edited_message: {
          message_id: 23,
          edit_date: 1_700_000_300,
          chat: { id: 321 },
          from: { id: 2, username: "grace" },
          text: "edited",
        },
      }),
      {
        connectionId: "conn.telegram",
        channelRef: "321",
        externalId: "tg.edited_message.23",
        text: "edited",
        senderName: "grace",
        timestamp: "2023-11-14T22:18:20.000Z",
      },
    );
  });

  it("runs supported polling sources through the registered runtime executor", async () => {
    const calls: string[] = [];
    const fixtureFetch = createConnectorRuntimeFixtureFetch(loadConnectorRuntimeFixtures([{
      kind: "source_event",
      path: "packages/clawjs-integrations/fixtures/telegram-get-updates-response.json",
    }]));
    const catalog = normalizeConnectorCatalog({
      version: 1,
      apps: [{
        id: "telegram_bot_api",
        name: "Telegram Bot",
        authFieldNames: ["telegramBotApi"],
        fields: [{ name: "telegramBotApi", type: "app", optional: false, secret: true }],
        operations: [{
          id: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
          appId: "telegram_bot_api",
          kind: "source",
          name: "New Bot Command",
          fields: [
            { name: "commands", type: "string", optional: true },
            { name: "timer", type: "$.interface.timer", optional: false, managed: true },
          ],
          authFieldNames: ["telegramBotApi"],
          runtime: {
            hasRun: false,
            hasHooks: true,
            hookNames: ["deploy"],
            hasAdditionalProps: false,
            hasMethods: false,
            methodNames: [],
            dedupe: "unique",
          },
          source: {
            delivery: "polling",
            usesTimer: true,
            usesHttp: false,
            usesServiceDb: false,
          },
        }],
      }],
    });

    const result = await runConnectorSource({
      catalog,
      operationId: "telegram_bot_api.source.new-bot-command-received-new-bot-command-received",
      dryRun: false,
      input: {
        values: { commands: "[\"/start\"]" },
        secretRefs: { telegramBotApi: "secret://telegram" },
      },
      resolveSecret: async (ref) => ref === "secret://telegram" ? "runtime-token" : null,
      runtimeExecutorOptions: {
        fetchImpl: async (input) => {
          calls.push(String(input));
          return fixtureFetch(input);
        },
      },
    });

    assert.equal(result.status, "source_started");
    assert.equal(result.output.nextOffset, 1001);
    assert.equal((result.output.events as unknown[]).length, 1);
    const url = new URL(calls[0] ?? "");
    assert.equal(url.pathname, "/botruntime-token/getUpdates");
    assert.equal(url.searchParams.get("timeout"), "0");
    assert.equal(url.searchParams.get("allowed_updates"), "[\"message\",\"edited_message\",\"channel_post\",\"edited_channel_post\"]");
  });
});
