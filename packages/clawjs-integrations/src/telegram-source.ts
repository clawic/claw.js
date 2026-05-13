import type { IntegrationInboundMessage, IntegrationJson } from "./types.js";

export type TelegramSourceKind =
  | "new-updates"
  | "message-updates"
  | "channel-updates"
  | "new-bot-command-received";

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  date?: number;
  edit_date?: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  [key: string]: IntegrationJson | TelegramMessage | undefined;
}

export interface TelegramSourceEvent {
  kind: TelegramSourceKind;
  eventType: string;
  meta: {
    id: number;
    summary: string;
    ts?: number;
  };
  update: TelegramUpdate;
  message?: TelegramMessage;
}

export const TELEGRAM_POLL_UPDATE_TYPES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
] as const;

export const TELEGRAM_SOURCE_KINDS = [
  "new-updates",
  "message-updates",
  "channel-updates",
  "new-bot-command-received",
] as const;

const TELEGRAM_SOURCE_KIND_SET = new Set<TelegramSourceKind>(TELEGRAM_SOURCE_KINDS);

export function isTelegramSourceOperationSupported(operationId: string): boolean {
  const raw = operationId.includes(".source.")
    ? operationId.slice(operationId.indexOf(".source.") + ".source.".length)
    : operationId;
  for (const kind of TELEGRAM_SOURCE_KIND_SET) {
    if (raw === kind || raw.startsWith(`${kind}-`)) return true;
  }
  return false;
}

export function telegramSourceEventsForUpdate(
  update: TelegramUpdate,
  options: {
    commands?: string[] | string;
    updateTypes?: string[];
    chatId?: string | number;
  } = {},
): TelegramSourceEvent[] {
  const events: TelegramSourceEvent[] = [];
  const typed = telegramTypedMessage(update);
  if (!typed) {
    const eventType = telegramEventType(update);
    if (matchesUpdateTypes(eventType, options.updateTypes)) {
      events.push({
        kind: "new-updates",
        eventType,
        meta: {
          id: update.update_id,
          summary: `New ${eventType} update: ${update.update_id}`,
        },
        update,
      });
    }
    return events;
  }

  if (matchesUpdateTypes(typed.eventType, options.updateTypes)) {
    events.push({
      kind: "new-updates",
      eventType: typed.eventType,
      meta: {
        id: update.update_id,
        summary: `New ${typed.eventType} update: ${update.update_id}`,
        ts: telegramMessageTimestamp(typed.message),
      },
      update,
      message: typed.message,
    });
  }

  if (
    (typed.eventType === "message" || typed.eventType === "edited_message")
    && matchesChat(typed.message, options.chatId)
  ) {
    events.push({
      kind: "message-updates",
      eventType: typed.eventType,
      meta: {
        id: update.update_id,
        summary: telegramMessageText(typed.message),
        ts: telegramMessageTimestamp(typed.message),
      },
      update,
      message: typed.message,
    });
  }

  if (typed.eventType === "channel_post" || typed.eventType === "edited_channel_post") {
    const title = typed.message.chat.title ?? String(typed.message.chat.id);
    events.push({
      kind: "channel-updates",
      eventType: typed.eventType,
      meta: {
        id: update.update_id,
        summary: `${title} - ${telegramMessageText(typed.message)}`.trim(),
        ts: telegramMessageTimestamp(typed.message),
      },
      update,
      message: typed.message,
    });
  }

  if (
    (typed.eventType === "message" || typed.eventType === "edited_message")
    && matchesCommand(typed.message, options.commands)
  ) {
    events.push({
      kind: "new-bot-command-received",
      eventType: typed.eventType,
      meta: {
        id: update.update_id,
        summary: telegramMessageText(typed.message),
        ts: telegramMessageTimestamp(typed.message),
      },
      update,
      message: typed.message,
    });
  }

  return events;
}

export function telegramInboundMessageFromUpdate(
  connectionId: string,
  update: TelegramUpdate,
): IntegrationInboundMessage | null {
  const typed = telegramTypedMessage(update);
  if (!typed) return null;
  const text = telegramMessageText(typed.message);
  if (!text) return null;
  return {
    connectionId,
    channelRef: String(typed.message.chat.id),
    externalId: `tg.${typed.eventType}.${typed.message.message_id}`,
    text,
    senderName: typed.message.from?.first_name ?? typed.message.from?.username,
    timestamp: new Date((telegramMessageTimestamp(typed.message) ?? 0) * 1_000).toISOString(),
  };
}

function telegramTypedMessage(update: TelegramUpdate): { eventType: string; message: TelegramMessage } | null {
  if (update.message) return { eventType: "message", message: update.message };
  if (update.edited_message) return { eventType: "edited_message", message: update.edited_message };
  if (update.channel_post) return { eventType: "channel_post", message: update.channel_post };
  if (update.edited_channel_post) return { eventType: "edited_channel_post", message: update.edited_channel_post };
  return null;
}

function telegramEventType(update: TelegramUpdate): string {
  return Object.keys(update).filter((key) => key !== "update_id").at(-1) ?? "unknown";
}

function telegramMessageText(message: TelegramMessage): string {
  return message.text ?? message.caption ?? "";
}

function telegramMessageTimestamp(message: TelegramMessage): number | undefined {
  return message.edit_date ?? message.date;
}

function matchesUpdateTypes(eventType: string, updateTypes?: string[]): boolean {
  return !updateTypes?.length || updateTypes.includes(eventType);
}

function matchesChat(message: TelegramMessage, chatId?: string | number): boolean {
  return chatId == null || String(message.chat.id) === String(chatId);
}

function matchesCommand(message: TelegramMessage, commands?: string[] | string): boolean {
  const commandList = normalizeCommands(commands);
  if (!commandList.length || !message.text) return false;
  const command = message.text.split(" ")[0] ?? "";
  return commandList.some((candidate) => command.includes(candidate));
}

function normalizeCommands(commands?: string[] | string): string[] {
  if (Array.isArray(commands)) return commands;
  if (typeof commands !== "string" || !commands.trim()) return [];
  try {
    const parsed = JSON.parse(commands) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}
