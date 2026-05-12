import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
});
