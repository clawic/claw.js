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

  it("maps media URL operations by upstream media type", () => {
    const plan = buildTelegramOperationRequest(
      "telegram_bot_api.action.send-media-by-url-or-id-send-media-by-url-or-id",
      {
        chatId: "123",
        mediaType: "Document/Image",
        media: "https://example.com/report.pdf",
        caption: "report",
        reply_markup: "{\"force_reply\":true}",
      },
    );
    assert.deepEqual(plan, {
      method: "POST",
      endpoint: "sendDocument",
      body: {
        chat_id: "123",
        caption: "report",
        reply_markup: { force_reply: true },
        document: "https://example.com/report.pdf",
      },
    });
  });

  it("maps chat permissions into the REST permissions object", () => {
    const plan = buildTelegramOperationRequest(
      "telegram_bot_api.action.set-chat-permissions-set-chat-permissions",
      {
        chatId: "123",
        canSendMessages: true,
        canSendMediaMessages: false,
        canInviteUsers: true,
      },
    );
    assert.deepEqual(plan, {
      method: "POST",
      endpoint: "setChatPermissions",
      body: {
        chat_id: "123",
        permissions: {
          can_send_messages: true,
          can_send_media_messages: false,
          can_invite_users: true,
        },
      },
    });
  });

  it("maps edited media into the nested media payload", () => {
    const plan = buildTelegramOperationRequest(
      "telegram_bot_api.action.edit-media-message-edit-media-message",
      {
        chatId: "123",
        messageId: "456",
        type: "photo",
        media: "abc",
        caption: "updated",
        parse_mode: "HTML",
        reply_markup: "{\"inline_keyboard\":[]}",
      },
    );
    assert.deepEqual(plan, {
      method: "POST",
      endpoint: "editMessageMedia",
      body: {
        chat_id: "123",
        message_id: "456",
        reply_markup: { inline_keyboard: [] },
        media: {
          type: "photo",
          media: "abc",
          caption: "updated",
          parse_mode: "HTML",
        },
      },
    });
  });

  it("maps document and video note media field names", () => {
    assert.deepEqual(buildTelegramOperationRequest(
      "telegram_bot_api.action.send-document-or-image-send-document-or-image",
      {
        chatId: "123",
        doc: "https://example.com/file.pdf",
      },
    ), {
      method: "POST",
      endpoint: "sendDocument",
      body: {
        chat_id: "123",
        document: "https://example.com/file.pdf",
      },
    });
    assert.deepEqual(buildTelegramOperationRequest(
      "telegram_bot_api.action.send-video-note-send-video-note",
      {
        chatId: "123",
        videoNote: "https://example.com/note.mp4",
        length: 120,
      },
    ), {
      method: "POST",
      endpoint: "sendVideoNote",
      body: {
        chat_id: "123",
        video_note: "https://example.com/note.mp4",
        length: 120,
      },
    });
  });

  it("maps album media and invite link options", () => {
    assert.deepEqual(buildTelegramOperationRequest(
      "telegram_bot_api.action.send-album-send-album",
      {
        chatId: "123",
        media: "[{\"type\":\"photo\",\"media\":\"https://example.com/a.jpg\"},{\"type\":\"video\",\"media\":\"https://example.com/b.mp4\"}]",
        disable_notification: true,
      },
    ), {
      method: "POST",
      endpoint: "sendMediaGroup",
      body: {
        chat_id: "123",
        media: [
          { type: "photo", media: "https://example.com/a.jpg" },
          { type: "video", media: "https://example.com/b.mp4" },
        ],
        disable_notification: true,
      },
    });
    assert.deepEqual(buildTelegramOperationRequest(
      "telegram_bot_api.action.create-chat-invite-link-create-chat-invite-link",
      {
        chatId: "123",
        name: "launch",
        expire_date: 1_700_000_000,
        member_limit: 25,
        creates_join_request: false,
      },
    ), {
      method: "POST",
      endpoint: "createChatInviteLink",
      body: {
        chat_id: "123",
        name: "launch",
        expire_date: 1_700_000_000,
        member_limit: 25,
        creates_join_request: false,
      },
    });
  });

  it("omits wrapper-only file and paging fields from REST payloads", () => {
    assert.deepEqual(buildTelegramOperationRequest(
      "telegram_bot_api.action.send-photo-send-photo",
      {
        chatId: "123",
        photo: "https://example.com/photo.jpg",
        filename: "photo.jpg",
        contentType: "image/jpeg",
      },
    ), {
      method: "POST",
      endpoint: "sendPhoto",
      body: {
        chat_id: "123",
        photo: "https://example.com/photo.jpg",
      },
    });
    assert.deepEqual(buildTelegramOperationRequest(
      "telegram_bot_api.action.list-updates-list-updates",
      {
        offset: 10,
        limit: 50,
        autoPaging: true,
      },
    ), {
      method: "POST",
      endpoint: "getUpdates",
      body: {
        offset: 10,
        limit: 50,
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
