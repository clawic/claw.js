import type {
  ChannelAccountDescriptor,
  ChannelAgentBinding,
  ChannelDescriptor,
  ChannelEventRecord,
  ChannelListenerDescriptor,
  ChannelMessageRecord,
  ChannelPermission,
  ChannelProcessorDescriptor,
  ChannelTargetDescriptor,
  TelegramBotProfile,
  TelegramChatSummary,
  TelegramTransportStatus,
  TelegramUpdateEnvelope,
} from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import { readChannelsStateSnapshot, writeChannelsStateSnapshot } from "../state/store.ts";

type JsonRecord = Record<string, unknown>;

const DEFAULT_ACCOUNT_ID = "default";
const MAX_STORED_MESSAGES = 500;
const MAX_STORED_EVENTS = 500;

export interface RegisterTelegramBotAccountInput {
  accountId?: string;
  secretName: string;
  label?: string;
  enabled?: boolean;
  status?: ChannelDescriptor["status"];
  botProfile?: TelegramBotProfile | null;
  transport?: TelegramTransportStatus | null;
  metadata?: Record<string, unknown>;
}

export interface RegisterChannelTargetInput {
  provider: string;
  accountId?: string;
  targetId: string;
  kind: ChannelTargetDescriptor["kind"];
  label?: string;
  title?: string;
  username?: string;
  parentTargetId?: string;
  threadId?: string | number;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SendChannelMessageInput {
  provider?: string;
  accountId?: string;
  targetId: string;
  text?: string;
  media?: string;
  mediaType?: "photo" | "video" | "document" | "audio" | "animation";
  threadId?: string | number;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ReadChannelMessagesInput {
  provider?: string;
  accountId?: string;
  targetId?: string;
  agentId?: string;
  limit?: number;
}

export interface GrantChannelBindingInput {
  agentId: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  permissions: ChannelPermission[];
  priority?: number;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RegisterChannelProcessorInput {
  id: string;
  label?: string;
  command: string;
  cwd?: string;
  agentId?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpsertChannelListenerInput {
  id?: string;
  provider: string;
  accountId?: string;
  processorId?: string;
  mode: ChannelListenerDescriptor["mode"];
  status: ChannelListenerDescriptor["status"];
  pid?: number;
  pidPath?: string;
  logPath?: string;
  stopPath?: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordChannelEventInput {
  type: ChannelEventRecord["type"];
  provider: string;
  accountId?: string;
  targetId?: string;
  messageId?: string;
  processorId?: string;
  status?: ChannelEventRecord["status"];
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ChannelsRegistry {
  accounts: {
    registerTelegramBot(input: RegisterTelegramBotAccountInput): ChannelAccountDescriptor;
    upsert(account: ChannelAccountDescriptor): ChannelAccountDescriptor;
    list(provider?: string): ChannelAccountDescriptor[];
    get(provider: string, accountId?: string): ChannelAccountDescriptor | null;
    remove(provider: string, accountId?: string): boolean;
    descriptors(): ChannelDescriptor[];
  };
  targets: {
    register(input: RegisterChannelTargetInput): ChannelTargetDescriptor;
    list(input?: { provider?: string; accountId?: string; query?: string }): ChannelTargetDescriptor[];
    get(provider: string, accountId: string | undefined, targetId: string, threadId?: string | number): ChannelTargetDescriptor | null;
  };
  bindings: {
    grant(input: GrantChannelBindingInput): ChannelAgentBinding;
    revoke(id: string): boolean;
    list(input?: { agentId?: string; provider?: string; accountId?: string; targetId?: string }): ChannelAgentBinding[];
    can(agentId: string | undefined, permission: ChannelPermission, selector: { provider: string; accountId?: string; targetId?: string }): boolean;
  };
  processors: {
    register(input: RegisterChannelProcessorInput): ChannelProcessorDescriptor;
    list(): ChannelProcessorDescriptor[];
    get(id?: string): ChannelProcessorDescriptor | null;
    remove(id: string): boolean;
  };
  listeners: {
    upsert(input: UpsertChannelListenerInput): ChannelListenerDescriptor;
    list(input?: { provider?: string; accountId?: string; processorId?: string }): ChannelListenerDescriptor[];
    get(provider: string, accountId?: string): ChannelListenerDescriptor | null;
    remove(provider: string, accountId?: string): boolean;
  };
  events: {
    record(input: RecordChannelEventInput): ChannelEventRecord;
    list(input?: { provider?: string; accountId?: string; targetId?: string; processorId?: string; limit?: number }): ChannelEventRecord[];
  };
  messages: {
    record(record: Omit<ChannelMessageRecord, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string; updatedAt?: string }): ChannelMessageRecord;
    recordTelegramUpdate(envelope: TelegramUpdateEnvelope, options?: { accountId?: string }): ChannelMessageRecord | null;
    recordTelegramOutbound(input: SendChannelMessageInput, response: JsonRecord): ChannelMessageRecord;
    read(input?: ReadChannelMessagesInput): ChannelMessageRecord[];
  };
}

export interface CreateChannelsRegistryOptions {
  workspaceDir: string;
  filesystem?: NodeFileSystemHost;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeAccountId(value?: string): string {
  const trimmed = (value ?? DEFAULT_ACCOUNT_ID).trim();
  if (!trimmed) return DEFAULT_ACCOUNT_ID;
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`channel account id contains unsupported characters: ${value}`);
  }
  return trimmed;
}

function accountRecordId(provider: string, accountId?: string): string {
  return `${provider}:${normalizeAccountId(accountId)}`;
}

function listenerRecordId(provider: string, accountId?: string): string {
  return `${provider}:${normalizeAccountId(accountId)}`;
}

function targetRecordId(provider: string, accountId: string | undefined, targetId: string, threadId?: string | number): string {
  const thread = threadId === undefined || threadId === null ? "" : `:topic:${String(threadId)}`;
  return `${provider}:${normalizeAccountId(accountId)}:${targetId}${thread}`;
}

function bindingRecordId(input: { agentId: string; provider?: string; accountId?: string; targetId?: string }): string {
  const parts = [
    input.agentId,
    input.provider ?? "*",
    input.accountId ? normalizeAccountId(input.accountId) : "*",
    input.targetId ?? "*",
  ];
  return parts.join(":");
}

function upsertById<TEntry extends { id: string }>(entries: TEntry[], entry: TEntry): TEntry[] {
  return [
    ...entries.filter((candidate) => candidate.id !== entry.id),
    entry,
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function getTextFromTelegramRaw(raw: JsonRecord | undefined): string | undefined {
  const message = raw?.message as JsonRecord | undefined;
  const edited = raw?.edited_message as JsonRecord | undefined;
  const callback = raw?.callback_query as JsonRecord | undefined;
  const source = message ?? edited;
  if (typeof source?.text === "string") return source.text;
  if (typeof source?.caption === "string") return source.caption;
  if (typeof callback?.data === "string") return `callback:${callback.data}`;
  return undefined;
}

function getChatFromTelegramRaw(raw: JsonRecord | undefined): JsonRecord | undefined {
  const message = raw?.message as JsonRecord | undefined;
  const edited = raw?.edited_message as JsonRecord | undefined;
  const callbackMessage = (raw?.callback_query as JsonRecord | undefined)?.message as JsonRecord | undefined;
  const membership = raw?.my_chat_member as JsonRecord | undefined;
  const chatMember = raw?.chat_member as JsonRecord | undefined;
  return ((message ?? edited ?? callbackMessage)?.chat ?? membership?.chat ?? chatMember?.chat) as JsonRecord | undefined;
}

function getTelegramMessageId(raw: JsonRecord | undefined): string | undefined {
  const message = raw?.message as JsonRecord | undefined;
  const edited = raw?.edited_message as JsonRecord | undefined;
  const callbackMessage = (raw?.callback_query as JsonRecord | undefined)?.message as JsonRecord | undefined;
  const value = (message ?? edited ?? callbackMessage)?.message_id;
  return typeof value === "number" || typeof value === "string" ? String(value) : undefined;
}

function getTelegramThreadId(raw: JsonRecord | undefined): string | undefined {
  const message = raw?.message as JsonRecord | undefined;
  const edited = raw?.edited_message as JsonRecord | undefined;
  const callbackMessage = (raw?.callback_query as JsonRecord | undefined)?.message as JsonRecord | undefined;
  const value = (message ?? edited ?? callbackMessage)?.message_thread_id;
  return typeof value === "number" || typeof value === "string" ? String(value) : undefined;
}

function getTelegramSender(raw: JsonRecord | undefined): { senderId?: string; senderLabel?: string } {
  const message = raw?.message as JsonRecord | undefined;
  const edited = raw?.edited_message as JsonRecord | undefined;
  const callback = raw?.callback_query as JsonRecord | undefined;
  const source = message ?? edited ?? callback;
  const from = source?.from as JsonRecord | undefined;
  if (!from) return {};
  const firstName = typeof from.first_name === "string" ? from.first_name : undefined;
  const lastName = typeof from.last_name === "string" ? from.last_name : undefined;
  const username = typeof from.username === "string" ? from.username : undefined;
  return {
    senderId: from.id === undefined ? undefined : String(from.id),
    senderLabel: username ?? ([firstName, lastName].filter(Boolean).join(" ") || undefined),
  };
}

function normalizeTelegramTarget(chat: TelegramChatSummary, accountId?: string, threadId?: string | number): RegisterChannelTargetInput {
  return {
    provider: "telegram",
    accountId,
    targetId: chat.id,
    kind: threadId ? "topic" : chat.type === "private" ? "dm" : chat.type,
    label: chat.title ?? chat.username ?? chat.firstName ?? chat.id,
    title: chat.title,
    username: chat.username,
    parentTargetId: threadId ? chat.id : undefined,
    threadId,
    lastSeenAt: chat.lastSeenAt ?? nowIso(),
    metadata: {
      telegramType: chat.type,
      isForum: chat.isForum,
    },
  };
}

function normalizeTelegramParentTarget(chat: TelegramChatSummary, accountId?: string): RegisterChannelTargetInput {
  return {
    provider: "telegram",
    accountId,
    targetId: chat.id,
    kind: chat.type === "private" ? "dm" : chat.type,
    label: chat.title ?? chat.username ?? chat.firstName ?? chat.id,
    title: chat.title,
    username: chat.username,
    lastSeenAt: chat.lastSeenAt ?? nowIso(),
    metadata: {
      telegramType: chat.type,
      isForum: chat.isForum,
    },
  };
}

function accountToChannel(account: ChannelAccountDescriptor, targets: ChannelTargetDescriptor[]): ChannelDescriptor {
  const isDefaultTelegram = account.provider === "telegram" && account.accountId === DEFAULT_ACCOUNT_ID;
  return {
    id: isDefaultTelegram ? "telegram" : `${account.provider}:${account.accountId}`,
    label: account.label,
    kind: "chat",
    status: account.status,
    provider: account.provider,
    endpoint: typeof account.transport?.webhook === "object" && account.transport.webhook
      ? (account.transport.webhook as { url?: string }).url
      : undefined,
    lastSyncAt: typeof account.transport?.lastSyncAt === "string" ? account.transport.lastSyncAt : undefined,
    lastError: typeof account.metadata?.lastError === "string" ? account.metadata.lastError : null,
    metadata: {
      accountId: account.accountId,
      enabled: account.enabled,
      targetCount: targets.filter((target) => target.provider === account.provider && target.accountId === account.accountId).length,
      ...(account.metadata ?? {}),
    },
  };
}

export function createChannelsRegistry(options: CreateChannelsRegistryOptions): ChannelsRegistry {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();

  function readState() {
    return readChannelsStateSnapshot(options.workspaceDir, filesystem) ?? {
      schemaVersion: 1,
      updatedAt: nowIso(),
      channels: [],
      accounts: [],
      targets: [],
      messages: [],
      bindings: [],
      processors: [],
      listeners: [],
      events: [],
    };
  }

  function writeState(patch: Partial<ReturnType<typeof readState>>) {
    const current = readState();
    return writeChannelsStateSnapshot(options.workspaceDir, {
      ...current,
      ...patch,
      schemaVersion: 1,
      updatedAt: nowIso(),
      channels: patch.channels ?? current.channels,
      accounts: patch.accounts ?? current.accounts ?? [],
      targets: patch.targets ?? current.targets ?? [],
      messages: patch.messages ?? current.messages ?? [],
      bindings: patch.bindings ?? current.bindings ?? [],
      processors: patch.processors ?? current.processors ?? [],
      listeners: patch.listeners ?? current.listeners ?? [],
      events: patch.events ?? current.events ?? [],
    }, filesystem);
  }

  function upsertAccount(account: ChannelAccountDescriptor): ChannelAccountDescriptor {
    const state = readState();
    writeState({
      accounts: upsertById(state.accounts ?? [], account),
    });
    return account;
  }

  function registerTarget(input: RegisterChannelTargetInput): ChannelTargetDescriptor {
    const timestamp = nowIso();
    const state = readState();
    const accountId = normalizeAccountId(input.accountId);
    const id = targetRecordId(input.provider, accountId, input.targetId, input.threadId);
    const existing = (state.targets ?? []).find((target) => target.id === id);
    const target: ChannelTargetDescriptor = {
      id,
      provider: input.provider,
      accountId,
      targetId: input.targetId,
      kind: input.kind ?? existing?.kind,
      label: input.label ?? existing?.label,
      title: input.title ?? existing?.title,
      username: input.username ?? existing?.username,
      parentTargetId: input.parentTargetId ?? existing?.parentTargetId,
      threadId: input.threadId === undefined ? existing?.threadId : String(input.threadId),
      lastSeenAt: input.lastSeenAt ?? timestamp,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(input.metadata ?? {}),
      },
    };
    writeState({
      targets: upsertById(state.targets ?? [], target),
    });
    return target;
  }

  function bindingMatches(binding: ChannelAgentBinding, selector: { provider: string; accountId?: string; targetId?: string }): boolean {
    if (!binding.enabled) return false;
    if (binding.provider && binding.provider !== selector.provider) return false;
    if (binding.accountId && binding.accountId !== normalizeAccountId(selector.accountId)) return false;
    if (binding.targetId && binding.targetId !== selector.targetId) return false;
    return true;
  }

  function hasPermission(agentId: string | undefined, permission: ChannelPermission, selector: { provider: string; accountId?: string; targetId?: string }): boolean {
    if (!agentId) return true;
    return (readState().bindings ?? [])
      .filter((binding) => binding.agentId === agentId && bindingMatches(binding, selector))
      .sort((left, right) => right.priority - left.priority)
      .some((binding) => binding.permissions.includes(permission) || binding.permissions.includes("admin"));
  }

  function recordMessage(record: Omit<ChannelMessageRecord, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: string; updatedAt?: string }): ChannelMessageRecord {
    const timestamp = nowIso();
    const state = readState();
    const message: ChannelMessageRecord = {
      ...record,
      accountId: normalizeAccountId(record.accountId),
      id: record.id ?? `${record.provider}:${normalizeAccountId(record.accountId)}:${record.targetId}:${timestamp}`,
      createdAt: record.createdAt ?? timestamp,
      updatedAt: record.updatedAt ?? timestamp,
    };
    const messages = upsertById(state.messages ?? [], message)
      .sort((left, right) => (right.createdAt).localeCompare(left.createdAt))
      .slice(0, MAX_STORED_MESSAGES);
    writeState({ messages });
    return message;
  }

  return {
    accounts: {
      registerTelegramBot(input) {
        const timestamp = nowIso();
        const state = readState();
        const accountId = normalizeAccountId(input.accountId);
        const id = accountRecordId("telegram", accountId);
        const existing = (state.accounts ?? []).find((account) => account.id === id);
        const username = input.botProfile?.username;
        const account: ChannelAccountDescriptor = {
          id,
          provider: "telegram",
          accountId,
          label: input.label ?? (username ? `Telegram (@${username})` : accountId === DEFAULT_ACCOUNT_ID ? "Telegram" : `Telegram (${accountId})`),
          enabled: input.enabled ?? true,
          status: input.status ?? "configured",
          secretRef: input.secretName,
          maskedCredential: input.secretName ? `vault:${input.secretName.replace(/.(?=.{4})/g, "*")}` : null,
          profile: input.botProfile ? { ...input.botProfile } : existing?.profile ?? null,
          transport: input.transport ? { ...input.transport } : existing?.transport ?? null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          metadata: {
            ...(existing?.metadata ?? {}),
            ...(input.metadata ?? {}),
          },
        };
        return upsertAccount(account);
      },
      upsert: upsertAccount,
      list(provider) {
        return (readState().accounts ?? []).filter((account) => !provider || account.provider === provider);
      },
      get(provider, accountId) {
        const id = accountRecordId(provider, accountId);
        return (readState().accounts ?? []).find((account) => account.id === id) ?? null;
      },
      remove(provider, accountId) {
        const id = accountRecordId(provider, accountId);
        const state = readState();
        const next = (state.accounts ?? []).filter((account) => account.id !== id);
        writeState({ accounts: next });
        return next.length !== (state.accounts ?? []).length;
      },
      descriptors() {
        const state = readState();
        return (state.accounts ?? []).map((account) => accountToChannel(account, state.targets ?? []));
      },
    },
    targets: {
      register: registerTarget,
      list(input = {}) {
        const query = input.query?.trim().toLowerCase();
        return (readState().targets ?? []).filter((target) => {
          if (input.provider && target.provider !== input.provider) return false;
          if (input.accountId && target.accountId !== normalizeAccountId(input.accountId)) return false;
          if (!query) return true;
          return [target.targetId, target.label, target.title, target.username].some((value) => value?.toLowerCase().includes(query));
        });
      },
      get(provider, accountId, targetId, threadId) {
        const id = targetRecordId(provider, accountId, targetId, threadId);
        return (readState().targets ?? []).find((target) => target.id === id) ?? null;
      },
    },
    bindings: {
      grant(input) {
        const timestamp = nowIso();
        const state = readState();
        const id = bindingRecordId(input);
        const existing = (state.bindings ?? []).find((binding) => binding.id === id);
        const binding: ChannelAgentBinding = {
          id,
          agentId: input.agentId,
          provider: input.provider,
          accountId: input.accountId ? normalizeAccountId(input.accountId) : undefined,
          targetId: input.targetId,
          permissions: Array.from(new Set(input.permissions)),
          priority: input.priority ?? existing?.priority ?? 0,
          enabled: input.enabled ?? existing?.enabled ?? true,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          metadata: {
            ...(existing?.metadata ?? {}),
            ...(input.metadata ?? {}),
          },
        };
        writeState({ bindings: upsertById(state.bindings ?? [], binding) });
        return binding;
      },
      revoke(id) {
        const state = readState();
        const next = (state.bindings ?? []).filter((binding) => binding.id !== id);
        writeState({ bindings: next });
        return next.length !== (state.bindings ?? []).length;
      },
      list(input = {}) {
        return (readState().bindings ?? []).filter((binding) => {
          if (input.agentId && binding.agentId !== input.agentId) return false;
          if (input.provider && binding.provider !== input.provider) return false;
          if (input.accountId && binding.accountId !== normalizeAccountId(input.accountId)) return false;
          if (input.targetId && binding.targetId !== input.targetId) return false;
          return true;
        });
      },
      can: hasPermission,
    },
    processors: {
      register(input) {
        const timestamp = nowIso();
        const trimmedId = input.id.trim();
        if (!trimmedId) throw new Error("channel processor id is required");
        if (!input.command.trim()) throw new Error("channel processor command is required");
        const state = readState();
        const existing = (state.processors ?? []).find((processor) => processor.id === trimmedId);
        const processor: ChannelProcessorDescriptor = {
          id: trimmedId,
          label: input.label,
          command: input.command.trim(),
          cwd: input.cwd,
          agentId: input.agentId,
          enabled: input.enabled ?? existing?.enabled ?? true,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          metadata: {
            ...(existing?.metadata ?? {}),
            ...(input.metadata ?? {}),
          },
        };
        writeState({ processors: upsertById(state.processors ?? [], processor) });
        return processor;
      },
      list() {
        return readState().processors ?? [];
      },
      get(id) {
        if (!id) return null;
        return (readState().processors ?? []).find((processor) => processor.id === id) ?? null;
      },
      remove(id) {
        const state = readState();
        const next = (state.processors ?? []).filter((processor) => processor.id !== id);
        writeState({ processors: next });
        return next.length !== (state.processors ?? []).length;
      },
    },
    listeners: {
      upsert(input) {
        const timestamp = nowIso();
        const accountId = normalizeAccountId(input.accountId);
        const id = input.id ?? listenerRecordId(input.provider, accountId);
        const state = readState();
        const existing = (state.listeners ?? []).find((listener) => listener.id === id);
        const listener: ChannelListenerDescriptor = {
          id,
          provider: input.provider,
          accountId,
          processorId: input.processorId,
          mode: input.mode,
          status: input.status,
          pid: input.pid,
          pidPath: input.pidPath,
          logPath: input.logPath,
          stopPath: input.stopPath,
          startedAt: input.startedAt ?? existing?.startedAt,
          stoppedAt: input.stoppedAt,
          lastHeartbeatAt: input.lastHeartbeatAt,
          lastError: input.lastError ?? null,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          metadata: {
            ...(existing?.metadata ?? {}),
            ...(input.metadata ?? {}),
          },
        };
        writeState({ listeners: upsertById(state.listeners ?? [], listener) });
        return listener;
      },
      list(input = {}) {
        return (readState().listeners ?? []).filter((listener) => {
          if (input.provider && listener.provider !== input.provider) return false;
          if (input.accountId && listener.accountId !== normalizeAccountId(input.accountId)) return false;
          if (input.processorId && listener.processorId !== input.processorId) return false;
          return true;
        });
      },
      get(provider, accountId) {
        const id = listenerRecordId(provider, accountId);
        return (readState().listeners ?? []).find((listener) => listener.id === id) ?? null;
      },
      remove(provider, accountId) {
        const id = listenerRecordId(provider, accountId);
        const state = readState();
        const next = (state.listeners ?? []).filter((listener) => listener.id !== id);
        writeState({ listeners: next });
        return next.length !== (state.listeners ?? []).length;
      },
    },
    events: {
      record(input) {
        const timestamp = nowIso();
        const accountId = normalizeAccountId(input.accountId);
        const event: ChannelEventRecord = {
          id: `${input.type}:${input.provider}:${accountId}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
          type: input.type,
          provider: input.provider,
          accountId,
          targetId: input.targetId,
          messageId: input.messageId,
          processorId: input.processorId,
          status: input.status,
          createdAt: timestamp,
          payload: input.payload,
          metadata: input.metadata,
        };
        const state = readState();
        const events = [event, ...(state.events ?? [])].slice(0, MAX_STORED_EVENTS);
        writeState({ events });
        return event;
      },
      list(input = {}) {
        const limit = Math.max(1, Math.min(input.limit ?? 100, MAX_STORED_EVENTS));
        return (readState().events ?? [])
          .filter((event) => {
            if (input.provider && event.provider !== input.provider) return false;
            if (input.accountId && event.accountId !== normalizeAccountId(input.accountId)) return false;
            if (input.targetId && event.targetId !== input.targetId) return false;
            if (input.processorId && event.processorId !== input.processorId) return false;
            return true;
          })
          .slice(0, limit);
      },
    },
    messages: {
      record: recordMessage,
      recordTelegramUpdate(envelope, options = {}) {
        const raw = envelope.raw;
        const chat = getChatFromTelegramRaw(raw);
        const chatId = envelope.chatId ?? (chat?.id === undefined ? undefined : String(chat.id));
        if (!chatId) return null;
        const accountId = normalizeAccountId(options.accountId);
        const threadId = envelope.messageId === undefined ? getTelegramThreadId(raw) : getTelegramThreadId(raw);
        const chatSummary: TelegramChatSummary = {
          id: chatId,
          type: (typeof chat?.type === "string" ? chat.type : envelope.chatType ?? "private") as TelegramChatSummary["type"],
          title: typeof chat?.title === "string" ? chat.title : undefined,
          username: typeof chat?.username === "string" ? chat.username : undefined,
          firstName: typeof chat?.first_name === "string" ? chat.first_name : undefined,
          lastName: typeof chat?.last_name === "string" ? chat.last_name : undefined,
          isForum: typeof chat?.is_forum === "boolean" ? chat.is_forum : undefined,
          lastSeenAt: envelope.receivedAt,
        };
        registerTarget(normalizeTelegramParentTarget(chatSummary, accountId));
        if (threadId) {
          registerTarget(normalizeTelegramTarget(chatSummary, accountId, threadId));
        }
        const sender = getTelegramSender(raw);
        return recordMessage({
          id: `telegram:${accountId}:update:${envelope.updateId}`,
          provider: "telegram",
          accountId,
          targetId: chatId,
          direction: "inbound",
          status: "received",
          text: getTextFromTelegramRaw(raw),
          providerMessageId: envelope.messageId === undefined ? getTelegramMessageId(raw) : String(envelope.messageId),
          threadId,
          senderId: sender.senderId,
          senderLabel: sender.senderLabel,
          receivedAt: envelope.receivedAt,
          raw,
        });
      },
      recordTelegramOutbound(input, response) {
        const accountId = normalizeAccountId(input.accountId);
        const sentAt = nowIso();
        const chat = response.chat as JsonRecord | undefined;
        const providerMessageId = response.message_id === undefined ? undefined : String(response.message_id);
        const chatId = input.targetId;
        registerTarget({
          provider: "telegram",
          accountId,
          targetId: chatId,
          kind: input.threadId ? "topic" : typeof chat?.type === "string" && chat.type !== "private" ? chat.type as ChannelTargetDescriptor["kind"] : "dm",
          threadId: input.threadId,
          label: chatId,
          lastSeenAt: sentAt,
        });
        if (input.threadId !== undefined && chat?.id !== undefined && chat?.type !== undefined) {
          registerTarget({
            provider: "telegram",
            accountId,
            targetId: String(chat.id),
            kind: chat.type === "private" ? "dm" : chat.type as ChannelTargetDescriptor["kind"],
            label: chatId,
            lastSeenAt: sentAt,
            metadata: {
              telegramType: chat.type,
            },
          });
        }
        return recordMessage({
          id: providerMessageId ? `telegram:${accountId}:message:${providerMessageId}` : undefined,
          provider: "telegram",
          accountId,
          targetId: chatId,
          direction: "outbound",
          status: "sent",
          text: input.text,
          providerMessageId,
          threadId: input.threadId === undefined ? undefined : String(input.threadId),
          sentAt,
          metadata: input.metadata,
          raw: response,
        });
      },
      read(input = {}) {
        const limit = Math.max(1, Math.min(input.limit ?? 100, MAX_STORED_MESSAGES));
        return (readState().messages ?? [])
          .filter((message) => {
            if (input.agentId && !hasPermission(input.agentId, "read", message)) return false;
            if (input.provider && message.provider !== input.provider) return false;
            if (input.accountId && message.accountId !== normalizeAccountId(input.accountId)) return false;
            if (input.targetId && message.targetId !== input.targetId) return false;
            return true;
          })
          .slice(0, limit);
      },
    },
  };
}
