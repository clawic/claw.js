import { clawChannelEvents } from "@clawjs/core";
import type {
  ChannelAccountDescriptor,
  ChannelMessageRecord,
  ChannelTargetDescriptor,
  TelegramBotProfile,
  TelegramChatSummary,
  TelegramCommand,
  TelegramTransportStatus,
  TelegramUpdateEnvelope,
} from "@clawjs/core";

import type { CommandRunner } from "../runtime/contracts.ts";
import { callTelegramApi, type TelegramBanOrRestrictInput, type TelegramInviteLinkOptions } from "../telegram/index.ts";
import type { ChannelsRegistry, RegisterTelegramBotAccountInput, SendChannelMessageInput } from "./index.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DEFAULT_ACCOUNT_ID = "default";

export interface TelegramAccountRuntimeOptions {
  registry: ChannelsRegistry;
  runner: CommandRunner;
  env?: NodeJS.ProcessEnv;
}

export interface TelegramAccountSyncOptions {
  accountId?: string;
  limit?: number;
  timeoutSeconds?: number;
  allowedUpdates?: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAccountId(value?: string): string {
  return value?.trim() || DEFAULT_ACCOUNT_ID;
}

function requireTelegramAccount(registry: ChannelsRegistry, accountId?: string): ChannelAccountDescriptor {
  const account = registry.accounts.get("telegram", accountId);
  if (!account?.secretRef) {
    throw new Error(`telegram account is not connected: ${normalizeAccountId(accountId)}`);
  }
  return account;
}

function accountApiBaseUrl(account: ChannelAccountDescriptor): string {
  return typeof account.metadata?.apiBaseUrl === "string" && account.metadata.apiBaseUrl.trim()
    ? account.metadata.apiBaseUrl
    : DEFAULT_TELEGRAM_API_BASE_URL;
}

function escapeTelegramHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeTelegramHtmlAttribute(value: string): string {
  return escapeTelegramHtml(value).replace(/"/g, "&quot;");
}

function renderTelegramInlineMarkdown(value: string): string {
  const parts = value.split(/(`[^`\n]+`)/g);
  return parts.map((part) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return `<code>${escapeTelegramHtml(part.slice(1, -1))}</code>`;
    }
    let rendered = escapeTelegramHtml(part);
    rendered = rendered.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label: string, href: string) => (
      `<a href="${escapeTelegramHtmlAttribute(href)}">${label}</a>`
    ));
    rendered = rendered.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    rendered = rendered.replace(/(^|[^\*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
    return rendered;
  }).join("");
}

function renderTelegramMarkdownHtml(value: string): string {
  const lines = value.split(/\r?\n/);
  const rendered: string[] = [];
  let inFence = false;
  const fence: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inFence) {
        rendered.push(`<pre><code>${escapeTelegramHtml(fence.join("\n"))}</code></pre>`);
        fence.length = 0;
        inFence = false;
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fence.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      rendered.push(`<b>${renderTelegramInlineMarkdown(heading[2] ?? "")}</b>`);
      continue;
    }
    const listItem = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (listItem) {
      rendered.push(`${listItem[1] ?? ""}• ${renderTelegramInlineMarkdown(listItem[2] ?? "")}`);
      continue;
    }
    rendered.push(renderTelegramInlineMarkdown(line));
  }
  if (inFence) rendered.push(`<pre><code>${escapeTelegramHtml(fence.join("\n"))}</code></pre>`);
  return rendered.join("\n");
}

function buildTelegramTextPayload(input: SendChannelMessageInput): {
  text: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  plainText: string;
} {
  const plainText = input.text ?? "";
  if (input.parseMode) return { text: plainText, parseMode: input.parseMode, plainText };
  return { text: renderTelegramMarkdownHtml(plainText), parseMode: "HTML", plainText };
}

function telegramMediaMethod(type: NonNullable<SendChannelMessageInput["mediaType"]>): string {
  return ({
    photo: "sendPhoto",
    video: "sendVideo",
    document: "sendDocument",
    audio: "sendAudio",
    animation: "sendAnimation",
  })[type];
}

function normalizeTelegramMessageThreadId(value: SendChannelMessageInput["threadId"]): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number"
    ? value
    : /^[0-9]+$/.test(value.trim())
      ? Number(value.trim())
      : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Message thread id must be a positive integer: ${String(value)}`);
  }
  return parsed;
}

function isTelegramHtmlParseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /parse|entity|can't parse|unsupported start tag|bad request/i.test(message);
}

function asStringId(value: string | number | bigint): string {
  return String(value);
}

function normalizeBotProfile(raw: JsonRecord): TelegramBotProfile {
  return {
    id: asStringId(raw.id as string | number),
    isBot: !!raw.is_bot,
    username: typeof raw.username === "string" ? raw.username : undefined,
    firstName: String(raw.first_name ?? ""),
    canJoinGroups: typeof raw.can_join_groups === "boolean" ? raw.can_join_groups : undefined,
    canReadAllGroupMessages: typeof raw.can_read_all_group_messages === "boolean" ? raw.can_read_all_group_messages : undefined,
    supportsInlineQueries: typeof raw.supports_inline_queries === "boolean" ? raw.supports_inline_queries : undefined,
  };
}

function normalizeWebhookStatus(raw: JsonRecord | null | undefined, configuredSecretToken?: string): Record<string, unknown> | null {
  if (!raw) return null;
  return {
    url: typeof raw.url === "string" ? raw.url : undefined,
    hasCustomCertificate: typeof raw.has_custom_certificate === "boolean" ? raw.has_custom_certificate : undefined,
    pendingUpdateCount: typeof raw.pending_update_count === "number" ? raw.pending_update_count : undefined,
    ipAddress: typeof raw.ip_address === "string" ? raw.ip_address : undefined,
    lastErrorDate: typeof raw.last_error_date === "number" ? raw.last_error_date : undefined,
    lastErrorMessage: typeof raw.last_error_message === "string" ? raw.last_error_message : undefined,
    lastSynchronizationErrorDate: typeof raw.last_synchronization_error_date === "number" ? raw.last_synchronization_error_date : undefined,
    maxConnections: typeof raw.max_connections === "number" ? raw.max_connections : undefined,
    allowedUpdates: Array.isArray(raw.allowed_updates) ? raw.allowed_updates.map(String) : undefined,
    secretTokenConfigured: configuredSecretToken ? true : undefined,
  };
}

function normalizeChatSummary(raw: JsonRecord): TelegramChatSummary {
  return {
    id: asStringId(raw.id as string | number),
    type: String(raw.type ?? "private") as TelegramChatSummary["type"],
    title: typeof raw.title === "string" ? raw.title : undefined,
    username: typeof raw.username === "string" ? raw.username : undefined,
    firstName: typeof raw.first_name === "string" ? raw.first_name : undefined,
    lastName: typeof raw.last_name === "string" ? raw.last_name : undefined,
    isForum: typeof raw.is_forum === "boolean" ? raw.is_forum : undefined,
    inviteLink: typeof raw.invite_link === "string" ? raw.invite_link : undefined,
    lastSeenAt: nowIso(),
  };
}

function normalizeCommands(raw: unknown): TelegramCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({
      command: typeof (entry as JsonRecord).command === "string" ? (entry as JsonRecord).command as string : "",
      description: typeof (entry as JsonRecord).description === "string" ? (entry as JsonRecord).description as string : "",
    }))
    .filter((entry) => entry.command && entry.description);
}

function detectUpdateType(update: JsonRecord): TelegramUpdateEnvelope["type"] {
  if (update.message) return "message";
  if (update.edited_message) return "edited_message";
  if (update.callback_query) return "callback_query";
  if (update.my_chat_member) return "my_chat_member";
  if (update.chat_member) return "chat_member";
  return "unknown";
}

function extractUpdateChat(update: JsonRecord): { chat?: TelegramChatSummary; messageId?: number } {
  const sources = [
    update.message as JsonRecord | undefined,
    update.edited_message as JsonRecord | undefined,
    (update.callback_query as JsonRecord | undefined)?.message as JsonRecord | undefined,
    (update.my_chat_member as JsonRecord | undefined)?.chat as JsonRecord | undefined,
    (update.chat_member as JsonRecord | undefined)?.chat as JsonRecord | undefined,
  ].filter(Boolean);
  for (const source of sources) {
    const chat = (source?.chat as JsonRecord | undefined) ?? source;
    if (chat?.id !== undefined && chat?.type !== undefined) {
      return {
        chat: normalizeChatSummary(chat),
        messageId: typeof source?.message_id === "number" ? source.message_id : undefined,
      };
    }
  }
  return {};
}

function normalizeUpdate(update: JsonRecord): TelegramUpdateEnvelope | null {
  const updateId = typeof update.update_id === "number" ? update.update_id : null;
  if (updateId === null) return null;
  const { chat, messageId } = extractUpdateChat(update);
  return {
    updateId,
    type: detectUpdateType(update),
    chatId: chat?.id,
    messageId,
    chatType: chat?.type,
    receivedAt: nowIso(),
    raw: update,
  };
}

function buildTransport(input: {
  mode: TelegramTransportStatus["mode"];
  active: boolean;
  existing?: Record<string, unknown> | null;
  webhook?: Record<string, unknown> | null;
  lastUpdateId?: number;
  pendingUpdateCount?: number;
  lastError?: string | null;
}): TelegramTransportStatus {
  return {
    ...(input.existing ?? {}),
    mode: input.mode,
    active: input.active,
    webhook: input.webhook ?? null,
    lastSyncAt: nowIso(),
    ...(typeof input.lastUpdateId === "number" ? { lastUpdateId: input.lastUpdateId } : {}),
    ...(typeof input.pendingUpdateCount === "number" ? { pendingUpdateCount: input.pendingUpdateCount } : {}),
    ...(input.lastError ? { lastError: input.lastError } : {}),
  } as TelegramTransportStatus;
}

function upsertAccountTransport(
  registry: ChannelsRegistry,
  account: ChannelAccountDescriptor,
  transport: TelegramTransportStatus,
  status: ChannelAccountDescriptor["status"] = "connected",
  metadata: Record<string, unknown> = {},
): ChannelAccountDescriptor {
  return registry.accounts.upsert({
    ...account,
    status,
    transport: transport as unknown as Record<string, unknown>,
    updatedAt: nowIso(),
    metadata: {
      ...(account.metadata ?? {}),
      ...metadata,
    },
  });
}

export async function connectTelegramAccount(
  options: TelegramAccountRuntimeOptions,
  input: RegisterTelegramBotAccountInput & {
    apiBaseUrl?: string;
    webhookUrl?: string;
    webhookSecretToken?: string;
    allowedUpdates?: string[];
    dropPendingUpdates?: boolean;
  },
): Promise<ChannelAccountDescriptor> {
  const apiBaseUrl = (input.apiBaseUrl?.trim() || DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "");
  const profile = normalizeBotProfile(await callTelegramApi<JsonRecord>(
    options.runner,
    options.env,
    input.secretName,
    apiBaseUrl,
    "getMe",
  ));
  let webhook: Record<string, unknown> | null = null;
  if (input.webhookUrl) {
    await callTelegramApi<boolean>(
      options.runner,
      options.env,
      input.secretName,
      apiBaseUrl,
      "setWebhook",
      {
        url: input.webhookUrl,
        ...(input.webhookSecretToken ? { secret_token: input.webhookSecretToken } : {}),
        ...(input.allowedUpdates ? { allowed_updates: input.allowedUpdates } : {}),
        ...(typeof input.dropPendingUpdates === "boolean" ? { drop_pending_updates: input.dropPendingUpdates } : {}),
      },
    );
    webhook = normalizeWebhookStatus(await callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      input.secretName,
      apiBaseUrl,
      "getWebhookInfo",
    ), input.webhookSecretToken);
  }

  return options.registry.accounts.registerTelegramBot({
    ...input,
    botProfile: profile,
    status: "connected",
    transport: buildTransport({
      mode: input.webhookUrl ? "webhook" : "polling",
      active: true,
      webhook,
    }),
    metadata: {
      ...(input.metadata ?? {}),
      apiBaseUrl,
    },
  });
}

export async function refreshTelegramAccountStatus(options: TelegramAccountRuntimeOptions, accountId?: string): Promise<ChannelAccountDescriptor> {
  const account = requireTelegramAccount(options.registry, accountId);
  try {
    const webhook = normalizeWebhookStatus(await callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      account.secretRef!,
      accountApiBaseUrl(account),
      "getWebhookInfo",
    ));
    return upsertAccountTransport(options.registry, account, buildTransport({
      mode: webhook?.url ? "webhook" : ((account.transport as TelegramTransportStatus | null)?.mode ?? "polling"),
      active: (account.transport as TelegramTransportStatus | null)?.active ?? true,
      existing: account.transport,
      webhook,
      pendingUpdateCount: typeof webhook?.pendingUpdateCount === "number" ? webhook.pendingUpdateCount as number : undefined,
    }), account.status === "disconnected" ? "configured" : account.status);
  } catch (error) {
    return upsertAccountTransport(options.registry, account, buildTransport({
      mode: ((account.transport as TelegramTransportStatus | null)?.mode ?? "polling"),
      active: false,
      existing: account.transport,
      webhook: ((account.transport as TelegramTransportStatus | null)?.webhook ?? null) as Record<string, unknown> | null,
      lastError: error instanceof Error ? error.message : String(error),
    }), "degraded", { lastError: error instanceof Error ? error.message : String(error) });
  }
}

export async function syncTelegramAccount(
  options: TelegramAccountRuntimeOptions,
  input: TelegramAccountSyncOptions = {},
): Promise<ChannelMessageRecord[]> {
  const account = requireTelegramAccount(options.registry, input.accountId);
  const currentTransport = account.transport as TelegramTransportStatus | null;
  if (currentTransport?.mode === "webhook" && currentTransport.webhook && typeof currentTransport.webhook === "object" && "url" in currentTransport.webhook && currentTransport.webhook.url) {
    return [];
  }
  const updates = await callTelegramApi<JsonRecord[]>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "getUpdates",
    {
      ...(typeof currentTransport?.lastUpdateId === "number" ? { offset: currentTransport.lastUpdateId + 1 } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
      ...(typeof input.timeoutSeconds === "number" ? { timeout: input.timeoutSeconds } : {}),
      ...(input.allowedUpdates ? { allowed_updates: input.allowedUpdates } : {}),
    },
    Math.max(15_000, (input.timeoutSeconds ?? 0) * 1_000 + 5_000),
  );
  const accountId = normalizeAccountId(input.accountId);
  const records: ChannelMessageRecord[] = [];
  let lastUpdateId = currentTransport?.lastUpdateId;
  for (const update of updates) {
    const envelope = normalizeUpdate(update);
    if (!envelope) continue;
    lastUpdateId = Math.max(lastUpdateId ?? envelope.updateId, envelope.updateId);
    const record = options.registry.messages.recordTelegramUpdate(envelope, { accountId });
    if (record) {
      records.push(record);
      options.registry.events.record({
        type: clawChannelEvents.messageReceived,
        provider: "telegram",
        accountId,
        targetId: record.targetId,
        messageId: record.id,
        status: "ok",
        payload: { text: record.text, threadId: record.threadId },
      });
      options.registry.events.record({
        type: clawChannelEvents.targetDiscovered,
        provider: "telegram",
        accountId,
        targetId: record.targetId,
        messageId: record.id,
        status: "ok",
      });
    }
  }
  upsertAccountTransport(options.registry, account, buildTransport({
    mode: "polling",
    active: true,
    existing: account.transport,
    webhook: null,
    lastUpdateId,
    pendingUpdateCount: 0,
  }), "connected");
  return records;
}

export async function sendTelegramAccountMessage(
  options: TelegramAccountRuntimeOptions,
  input: SendChannelMessageInput,
): Promise<ChannelMessageRecord> {
  const account = requireTelegramAccount(options.registry, input.accountId);
  const textPayload = buildTelegramTextPayload(input);
  const mediaType = input.mediaType ?? "photo";
  const messageThreadId = normalizeTelegramMessageThreadId(input.threadId);
  const send = (text: string, parseMode?: "HTML" | "Markdown" | "MarkdownV2") => input.media
    ? callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      account.secretRef!,
      accountApiBaseUrl(account),
      telegramMediaMethod(mediaType),
      {
        chat_id: input.targetId,
        [mediaType]: input.media,
        ...(input.text ? { caption: text } : {}),
        ...(input.text && parseMode ? { parse_mode: parseMode } : {}),
        ...(messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {}),
      },
    )
    : callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      account.secretRef!,
      accountApiBaseUrl(account),
      "sendMessage",
      {
        chat_id: input.targetId,
        text,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        ...(messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {}),
      },
    );
  let response: JsonRecord;
  try {
    response = await send(textPayload.text, textPayload.parseMode);
  } catch (error) {
    if (textPayload.parseMode !== "HTML" || !isTelegramHtmlParseError(error)) throw error;
    response = await send(textPayload.plainText);
  }
  const record = options.registry.messages.recordTelegramOutbound({
    ...input,
    provider: "telegram",
    accountId: normalizeAccountId(input.accountId),
    threadId: messageThreadId,
  }, response);
  options.registry.events.record({
    type: clawChannelEvents.messageSent,
    provider: "telegram",
    accountId: record.accountId,
    targetId: record.targetId,
    messageId: record.id,
    status: "ok",
    payload: { text: record.text, threadId: record.threadId },
  });
  return record;
}

export async function setTelegramAccountCommands(
  options: TelegramAccountRuntimeOptions,
  accountId: string | undefined,
  commands: TelegramCommand[],
): Promise<TelegramCommand[]> {
  const account = requireTelegramAccount(options.registry, accountId);
  await callTelegramApi<boolean>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "setMyCommands",
    { commands },
  );
  options.registry.accounts.upsert({
    ...account,
    updatedAt: nowIso(),
    metadata: {
      ...(account.metadata ?? {}),
      commands,
    },
  });
  return normalizeCommands(commands);
}

export async function getTelegramAccountCommands(options: TelegramAccountRuntimeOptions, accountId?: string): Promise<TelegramCommand[]> {
  const account = requireTelegramAccount(options.registry, accountId);
  const commands = normalizeCommands(await callTelegramApi<JsonRecord[]>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "getMyCommands",
  ));
  options.registry.accounts.upsert({
    ...account,
    updatedAt: nowIso(),
    metadata: {
      ...(account.metadata ?? {}),
      commands,
    },
  });
  return commands;
}

export function listTelegramAccountChats(registry: ChannelsRegistry, accountId?: string, query?: string): TelegramChatSummary[] {
  const targets = registry.targets.list({ provider: "telegram", accountId, query });
  const byChat = new Map<string, TelegramChatSummary>();
  for (const target of targets) {
    const id = target.parentTargetId ?? target.targetId;
    byChat.set(id, {
      id,
      type: target.kind === "dm" ? "private" : target.kind === "topic" ? "supergroup" : target.kind as TelegramChatSummary["type"],
      title: target.title ?? target.label,
      username: target.username,
      isForum: target.kind === "topic" ? true : typeof target.metadata?.isForum === "boolean" ? target.metadata.isForum : undefined,
      lastSeenAt: target.lastSeenAt,
    });
  }
  return Array.from(byChat.values()).sort((left, right) => right.id.localeCompare(left.id));
}

export async function getTelegramAccountChat(options: TelegramAccountRuntimeOptions, accountId: string | undefined, chatId: string | number): Promise<TelegramChatSummary> {
  const account = requireTelegramAccount(options.registry, accountId);
  const chat = normalizeChatSummary(await callTelegramApi<JsonRecord>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "getChat",
    { chat_id: chatId },
  ));
  options.registry.targets.register({
    provider: "telegram",
    accountId: account.accountId,
    targetId: chat.id,
    kind: chat.type === "private" ? "dm" : chat.type,
    label: chat.title ?? chat.username ?? chat.firstName ?? chat.id,
    title: chat.title,
    username: chat.username,
    lastSeenAt: chat.lastSeenAt,
    metadata: {
      telegramType: chat.type,
      isForum: chat.isForum,
    },
  });
  return chat;
}

export async function configureTelegramAccountWebhook(
  options: TelegramAccountRuntimeOptions,
  accountId: string | undefined,
  input: { url: string; secretToken?: string; allowedUpdates?: string[]; dropPendingUpdates?: boolean; maxConnections?: number; ipAddress?: string },
): Promise<ChannelAccountDescriptor> {
  const account = requireTelegramAccount(options.registry, accountId);
  await callTelegramApi<boolean>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "setWebhook",
    {
      url: input.url,
      ...(input.secretToken ? { secret_token: input.secretToken } : {}),
      ...(input.allowedUpdates ? { allowed_updates: input.allowedUpdates } : {}),
      ...(typeof input.dropPendingUpdates === "boolean" ? { drop_pending_updates: input.dropPendingUpdates } : {}),
      ...(typeof input.maxConnections === "number" ? { max_connections: input.maxConnections } : {}),
      ...(input.ipAddress ? { ip_address: input.ipAddress } : {}),
    },
  );
  const webhook = normalizeWebhookStatus(await callTelegramApi<JsonRecord>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "getWebhookInfo",
  ), input.secretToken);
  return upsertAccountTransport(options.registry, account, buildTransport({
    mode: "webhook",
    active: true,
    existing: account.transport,
    webhook,
  }), "connected");
}

export async function disableTelegramAccountWebhook(
  options: TelegramAccountRuntimeOptions,
  accountId?: string,
  input: { dropPendingUpdates?: boolean } = {},
): Promise<ChannelAccountDescriptor> {
  const account = requireTelegramAccount(options.registry, accountId);
  await callTelegramApi<boolean>(
    options.runner,
    options.env,
    account.secretRef!,
    accountApiBaseUrl(account),
    "deleteWebhook",
    typeof input.dropPendingUpdates === "boolean" ? { drop_pending_updates: input.dropPendingUpdates } : {},
  );
  return upsertAccountTransport(options.registry, account, buildTransport({
    mode: "polling",
    active: true,
    existing: account.transport,
    webhook: null,
  }), "connected");
}

export async function callTelegramAccountBooleanMethod(
  options: TelegramAccountRuntimeOptions,
  accountId: string | undefined,
  method: string,
  params: JsonRecord,
): Promise<boolean> {
  const account = requireTelegramAccount(options.registry, accountId);
  return callTelegramApi<boolean>(options.runner, options.env, account.secretRef!, accountApiBaseUrl(account), method, params);
}

export async function callTelegramAccountRecordMethod(
  options: TelegramAccountRuntimeOptions,
  accountId: string | undefined,
  method: string,
  params: JsonRecord,
): Promise<JsonRecord> {
  const account = requireTelegramAccount(options.registry, accountId);
  return callTelegramApi<JsonRecord>(options.runner, options.env, account.secretRef!, accountApiBaseUrl(account), method, params);
}

export function telegramBanOrRestrictParams(input: TelegramBanOrRestrictInput): { method: string; params: JsonRecord } {
  if (input.action === "ban") {
    return {
      method: "banChatMember",
      params: {
        chat_id: input.chatId,
        user_id: input.userId,
        ...(input.untilDate ? { until_date: input.untilDate } : {}),
        ...(typeof input.revokeMessages === "boolean" ? { revoke_messages: input.revokeMessages } : {}),
      },
    };
  }
  if (input.action === "unban") {
    return { method: "unbanChatMember", params: { chat_id: input.chatId, user_id: input.userId } };
  }
  return {
    method: "restrictChatMember",
    params: {
      chat_id: input.chatId,
      user_id: input.userId,
      permissions: input.permissions ?? {},
      ...(input.untilDate ? { until_date: input.untilDate } : {}),
    },
  };
}

export function telegramInviteLinkParams(chatId: string | number, options: TelegramInviteLinkOptions = {}): JsonRecord {
  return {
    chat_id: chatId,
    ...(options.name ? { name: options.name } : {}),
    ...(options.expireDate ? { expire_date: options.expireDate } : {}),
    ...(options.memberLimit ? { member_limit: options.memberLimit } : {}),
    ...(typeof options.createsJoinRequest === "boolean" ? { creates_join_request: options.createsJoinRequest } : {}),
  };
}

function targetKindFromChat(chat: TelegramChatSummary): ChannelTargetDescriptor["kind"] {
  return chat.type === "private" ? "dm" : chat.type;
}
