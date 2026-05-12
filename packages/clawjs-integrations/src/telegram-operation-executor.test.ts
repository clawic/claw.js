import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { telegramAdapter } from "./telegram.ts";
import {
  buildTelegramOperationRequest,
  createTelegramOperationExecutor,
} from "./telegram-operation-executor.ts";

describe("telegram operation executor", () => {
  it("maps text message operations to Telegram Bot API JSON payloads", () => {
    const plan = buildTelegramOperationRequest(
      "telegram_bot_api.action.send-text-message-or-reply-send-text-message-or-reply",
      {
        chatId: "123",
        text: "hello",
        parse_mode: "HTML",
        link_preview_options: "{\"is_disabled\":true}",
      },
    );
    assert.deepEqual(plan, {
      method: "POST",
      endpoint: "sendMessage",
      body: {
        chat_id: "123",
        text: "hello",
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      },
    });
  });

  it("executes through an injected fetch and resolves the app secret", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const executor = createTelegramOperationExecutor({
      fetchImpl: async (input, init) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? "{}")),
        });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
      },
    });

    const output = await executor.execute({
      operation: {
        id: "telegram_bot_api.action.delete-message-delete-message",
        appId: "telegram_bot_api",
        kind: "action",
        name: "Delete a Message",
        fields: [],
        authFieldNames: ["telegramBotApi"],
      },
      values: {
        chatId: "123",
        messageId: "456",
      },
      secrets: {
        telegramBotApi: "test-token",
      },
    });

    assert.deepEqual(output, { ok: true, result: { message_id: 42 } });
    assert.deepEqual(calls, [{
      url: "https://api.telegram.org/bottest-token/deleteMessage",
      body: {
        chat_id: "123",
        message_id: "456",
      },
    }]);
  });

  it("keeps the existing adapter outbound path compatible", async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
    }) as typeof fetch;
    try {
      await telegramAdapter.send({
        connection: {
          id: "conn.telegram",
          service: "telegram",
          label: "Telegram",
          scopes: [],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
        auth: "bot-token",
        message: {
          connectionId: "conn.telegram",
          channelRef: "987",
          text: "hello from adapter",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.deepEqual(calls, [{
      url: "https://api.telegram.org/botbot-token/sendMessage",
      body: {
        chat_id: "987",
        text: "hello from adapter",
      },
    }]);
  });
});
