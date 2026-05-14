import type {
  ConnectorSourceExecutionContext,
  ConnectorSourceExecutor,
} from "./source-runner.js";
import { TelegramBotApiError } from "./telegram-operation-executor.ts";
import {
  TELEGRAM_POLL_UPDATE_TYPES,
  telegramSourceEventsForUpdate,
  type TelegramSourceKind,
  type TelegramUpdate,
} from "./telegram-source.ts";
import type { IntegrationJson } from "./types.ts";

export interface TelegramSourceExecutorOptions {
  fetchImpl?: typeof fetch;
}

interface TelegramUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
  description?: string;
}

type TelegramSourceFetch = typeof fetch;

const BASE = "https://api.telegram.org/bot";

export function createTelegramSourceExecutor(options: TelegramSourceExecutorOptions = {}): ConnectorSourceExecutor {
  return {
    async start(ctx) {
      return executeTelegramSource(ctx, options);
    },
  };
}

export async function executeTelegramSource(
  ctx: ConnectorSourceExecutionContext,
  options: TelegramSourceExecutorOptions = {},
): Promise<Record<string, IntegrationJson>> {
  const token = resolveTelegramToken(ctx.secrets);
  const kind = telegramSourceKind(ctx.operation.id);
  const response = await fetchTelegramUpdates({
    token,
    values: ctx.values,
    fetchImpl: options.fetchImpl,
  });
  const updates = response.result ?? [];
  const events = updates
    .flatMap((update) => telegramSourceEventsForUpdate(update, {
      commands: stringList(ctx.values.commands),
      updateTypes: stringList(ctx.values.updateTypes),
      chatId: stringOrNumber(ctx.values.chatId),
    }))
    .filter((event) => event.kind === kind);
  const nextOffset = updates.reduce<number | undefined>(
    (offset, update) => Math.max(offset ?? update.update_id + 1, update.update_id + 1),
    undefined,
  );
  return {
    events: events as unknown as IntegrationJson,
    ...(nextOffset == null ? {} : { nextOffset }),
  };
}

async function fetchTelegramUpdates(input: {
  token: string;
  values: Record<string, IntegrationJson>;
  fetchImpl?: TelegramSourceFetch;
}): Promise<TelegramUpdatesResponse> {
  const params = new URLSearchParams({
    timeout: "0",
    allowed_updates: JSON.stringify(TELEGRAM_POLL_UPDATE_TYPES),
  });
  const offset = scalar(input.values.offset);
  if (offset != null && offset !== "") params.set("offset", String(offset));
  const limit = scalar(input.values.limit);
  if (limit != null && limit !== "") params.set("limit", String(limit));
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(`${BASE}${input.token}/getUpdates?${params.toString()}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const payload = (await response.json()) as TelegramUpdatesResponse;
  if (!response.ok || payload.ok === false) {
    const description = typeof payload.description === "string" ? payload.description : response.statusText;
    throw new TelegramBotApiError({
      endpoint: "getUpdates",
      status: response.status,
      description,
      parameters: telegramErrorParameters((payload as unknown as Record<string, IntegrationJson>).parameters),
    });
  }
  return payload;
}

function telegramErrorParameters(value: IntegrationJson | undefined): { retryAfter?: number; migrateToChatId?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    ...(typeof value.retry_after === "number" ? { retryAfter: value.retry_after } : {}),
    ...(typeof value.migrate_to_chat_id === "number" ? { migrateToChatId: value.migrate_to_chat_id } : {}),
  };
}

function telegramSourceKind(operationId: string): TelegramSourceKind {
  const raw = operationId.includes(".source.")
    ? operationId.slice(operationId.indexOf(".source.") + ".source.".length)
    : operationId;
  for (const kind of ["new-updates", "message-updates", "channel-updates", "new-bot-command-received"] as const) {
    if (raw === kind || raw.startsWith(`${kind}-`)) return kind;
  }
  throw new Error(`Unsupported Telegram source: ${raw}`);
}

function resolveTelegramToken(secrets: Record<string, string>): string {
  const token = secrets.telegramBotApi ?? secrets.token ?? secrets.auth;
  if (!token) {
    throw new Error("Missing Telegram token secret.");
  }
  return token;
}

function stringList(value: IntegrationJson): string[] | undefined {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [value];
  } catch {
    return [value];
  }
}

function scalar(value: IntegrationJson): string | number | boolean | undefined {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;
}

function stringOrNumber(value: IntegrationJson): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}
