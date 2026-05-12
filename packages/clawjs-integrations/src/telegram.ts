// Telegram Bot API watcher. Uses long-polling so we don't need to
// expose a webhook URL — the Mac client is intermittently online and
// running a server is heavier than what's needed for MVP. The watcher
// translates each `Update` payload into `IntegrationInboundMessage` and
// dedupes by `update_id`.
//
// Spec: https://core.telegram.org/bots/api#getupdates

import type {
  IntegrationAdapter,
  IntegrationInboundMessage,
  IntegrationOutboundMessage,
} from "./types.js";
import { sendTelegramRequest } from "./telegram-operation-executor.ts";

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

const BASE = "https://api.telegram.org/bot";
const LONG_POLL_TIMEOUT_S = 25;

export const telegramAdapter: IntegrationAdapter = {
  service: "telegram",

  async start({ connection, auth, onMessage }) {
    let offset: number | undefined;
    let cancelled = false;
    const seen = new Set<number>();

    const loop = async () => {
      while (!cancelled) {
        try {
          const params = new URLSearchParams({
            timeout: String(LONG_POLL_TIMEOUT_S),
            allowed_updates: JSON.stringify(["message"]),
          });
          if (offset != null) params.set("offset", String(offset));
          const res = await fetch(`${BASE}${auth}/getUpdates?${params.toString()}`);
          if (!res.ok) {
            // Back off on 5xx so a server outage doesn't melt the
            // poller. Cancel-safe via the `cancelled` flag re-checked
            // at the top of the loop.
            await sleep(Math.min(30_000, 1_000 * Math.pow(2, 3)));
            continue;
          }
          const body = (await res.json()) as TelegramResponse<TelegramUpdate[]>;
          if (!body.ok || !body.result) continue;
          for (const upd of body.result) {
            offset = upd.update_id + 1;
            if (seen.has(upd.update_id)) continue;
            seen.add(upd.update_id);
            if (!upd.message?.text) continue;
            const inbound: IntegrationInboundMessage = {
              connectionId: connection.id,
              channelRef: String(upd.message.chat.id),
              externalId: `tg.${upd.message.message_id}`,
              text: upd.message.text,
              senderName: upd.message.from?.first_name ?? upd.message.from?.username,
              timestamp: new Date(upd.message.date * 1_000).toISOString(),
            };
            await onMessage(inbound);
          }
        } catch (err) {
          // Network blip or fetch abort: pause and retry. Throwing
          // here would kill the poller for the rest of the process
          // lifetime; we prefer keeping the watcher alive.
          await sleep(2_000);
        }
      }
    };

    void loop();
    return () => {
      cancelled = true;
    };
  },

  async send({ auth, message }) {
    await sendTelegramRequest({
      token: auth,
      endpoint: "sendMessage",
      body: {
        chat_id: message.channelRef,
        text: message.text,
      },
    });
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export for callers that only need the outbound message type.
export type { IntegrationOutboundMessage };
