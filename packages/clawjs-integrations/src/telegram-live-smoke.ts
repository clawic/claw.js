import {
  auditCredentialLeaseEvent,
  buildConnectorCredentialLeaseRequest,
  credentialLeaseAuditEvent,
  verifyConnectorCredentialLease,
  type ConnectorCredentialLeaseBroker,
} from "./credential-lease-broker.ts";
import { TelegramBotApiError, sendTelegramRequest } from "./telegram-operation-executor.ts";
import type { IntegrationJson } from "./types.ts";

export type TelegramLiveSmokeResultStatus =
  | "PASS"
  | "FAIL"
  | "PARTIAL"
  | "EXTERNAL PENDING"
  | "QUARANTINED";

export interface TelegramLiveSmokeScenario {
  id: string;
  officialMethods: readonly string[];
  lane: "brokered_live" | "manual_only" | "unsupported_by_policy";
  requires: readonly string[];
  notes: string;
}

export interface TelegramLiveSmokeResult {
  id: string;
  status: TelegramLiveSmokeResultStatus;
  evidence: readonly string[];
  missingPrerequisites: readonly string[];
  error?: string;
}

export interface TelegramLiveSmokeReport {
  provider: "telegram_bot_api";
  status: TelegramLiveSmokeResultStatus;
  credentialLeaseId?: string;
  credentialLeaseReleased: boolean;
  results: readonly TelegramLiveSmokeResult[];
}

export interface RunTelegramBrokeredLiveSmokeOptions {
  broker: ConnectorCredentialLeaseBroker;
  secretRef: string;
  fetchImpl?: typeof fetch;
  chatId?: string | number;
  mediaPhotoUrl?: string;
  webhookUrl?: string;
}

export const TELEGRAM_LIVE_SMOKE_SCENARIOS: readonly TelegramLiveSmokeScenario[] = [
  {
    id: "telegram.get-me",
    officialMethods: ["getMe"],
    lane: "brokered_live",
    requires: ["disposable Telegram bot token"],
    notes: "Read-only bot identity check.",
  },
  {
    id: "telegram.poll-updates",
    officialMethods: ["getUpdates"],
    lane: "brokered_live",
    requires: ["disposable Telegram bot token", "no active Telegram webhook"],
    notes: "Read-only polling check with timeout 0.",
  },
  {
    id: "telegram.send-edit-delete-text",
    officialMethods: ["sendMessage", "editMessageText", "deleteMessage"],
    lane: "brokered_live",
    requires: ["disposable Telegram bot token", "disposable private chat or group"],
    notes: "Creates, edits, and deletes one disposable text message.",
  },
  {
    id: "telegram.synthetic-photo",
    officialMethods: ["sendPhoto", "deleteMessage"],
    lane: "brokered_live",
    requires: ["disposable Telegram bot token", "disposable private chat or group", "approved synthetic photo URL"],
    notes: "Sends and deletes one synthetic media message.",
  },
  {
    id: "telegram.rate-error-handling",
    officialMethods: ["getUpdates"],
    lane: "brokered_live",
    requires: ["synthetic Telegram 429 fixture"],
    notes: "Exercises Telegram error parsing without intentionally rate-limiting a real bot.",
  },
  {
    id: "telegram.webhook-loopback",
    officialMethods: ["setWebhook", "getWebhookInfo", "deleteWebhook"],
    lane: "manual_only",
    requires: ["approved public HTTPS loopback endpoint"],
    notes: "Webhook delivery needs provider-reachable HTTPS and is not part of default live smoke.",
  },
  {
    id: "telegram.group-admin-authorization",
    officialMethods: ["banChatMember", "restrictChatMember", "promoteChatMember", "setChatPermissions"],
    lane: "manual_only",
    requires: ["disposable group", "bot administrator role", "operator approval"],
    notes: "Admin authorization checks can mutate group state and require manual approval.",
  },
  {
    id: "telegram.payments-passport-managed-bot",
    officialMethods: ["sendInvoice", "answerPreCheckoutQuery", "setPassportDataErrors", "getManagedBotToken"],
    lane: "unsupported_by_policy",
    requires: ["payments/passport/managed-bot policy approval"],
    notes: "Payments, Passport, and managed-bot token delegation are blocked from automated live smoke.",
  },
];

export async function runTelegramBrokeredLiveSmoke(
  options: RunTelegramBrokeredLiveSmokeOptions,
): Promise<TelegramLiveSmokeReport> {
  const leaseRequest = buildConnectorCredentialLeaseRequest({
    provider: "telegram_bot_api",
    appId: "telegram_bot_api",
    operationId: "telegram.live-smoke",
    purpose: "live_smoke",
    secretRefs: { telegramBotApi: options.secretRef },
    scopes: [
      "telegram:getMe",
      "telegram:getUpdates",
      ...(options.chatId == null ? [] : ["telegram:sendMessage", "telegram:editMessageText", "telegram:deleteMessage"]),
      ...(options.mediaPhotoUrl == null ? [] : ["telegram:sendPhoto"]),
    ],
    ttlSeconds: 300,
    costPolicy: { mode: "free_only" },
    valuesPreview: {
      hasChatId: options.chatId != null,
      hasMediaPhotoUrl: options.mediaPhotoUrl != null,
      hasWebhookUrl: options.webhookUrl != null,
    },
  });
  const lease = await options.broker.acquire(leaseRequest);
  await auditCredentialLeaseEvent(options.broker, credentialLeaseAuditEvent({ event: "acquire", lease }));
  let released = false;
  const results: TelegramLiveSmokeResult[] = [];
  try {
    verifyConnectorCredentialLease(lease, leaseRequest, ["telegramBotApi"]);
    if (options.broker.heartbeat) {
      await options.broker.heartbeat(lease, leaseRequest);
      await auditCredentialLeaseEvent(options.broker, credentialLeaseAuditEvent({ event: "heartbeat", lease }));
    }
    const token = lease.secrets.telegramBotApi;
    await runSmokeStep(results, "telegram.get-me", [], async () => {
      await sendTelegramRequest({ token, endpoint: "getMe", body: {}, fetchImpl: options.fetchImpl });
    });
    await runSmokeStep(results, "telegram.poll-updates", [], async () => {
      await sendTelegramRequest({
        token,
        endpoint: "getUpdates",
        body: { timeout: 0, allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"] },
        fetchImpl: options.fetchImpl,
      });
    });
    await runSmokeStep(results, "telegram.rate-error-handling", [], async () => {
      await runSyntheticRateLimitProbe(token);
    });
    if (options.chatId == null) {
      results.push(externalPending("telegram.send-edit-delete-text", ["disposable private chat or group"]));
      results.push(externalPending("telegram.synthetic-photo", ["disposable private chat or group", "approved synthetic photo URL"]));
    } else {
      await runSendEditDelete(results, token, options);
      if (options.mediaPhotoUrl == null) {
        results.push(externalPending("telegram.synthetic-photo", ["approved synthetic photo URL"]));
      } else {
        await runSyntheticPhoto(results, token, options);
      }
    }
    results.push(externalPending("telegram.webhook-loopback", ["approved public HTTPS loopback endpoint"]));
    results.push(externalPending("telegram.group-admin-authorization", ["disposable group", "bot administrator role", "operator approval"]));
    results.push({
      id: "telegram.payments-passport-managed-bot",
      status: "EXTERNAL PENDING",
      evidence: [],
      missingPrerequisites: ["payments/passport/managed-bot policy approval"],
    });
    await options.broker.release(lease, leaseRequest);
    released = true;
    await auditCredentialLeaseEvent(options.broker, credentialLeaseAuditEvent({ event: "release", lease }));
    return {
      provider: "telegram_bot_api",
      status: aggregateStatus(results),
      credentialLeaseId: lease.id,
      credentialLeaseReleased: released,
      results,
    };
  } finally {
    if (!released) {
      await options.broker.release(lease, leaseRequest);
      await auditCredentialLeaseEvent(options.broker, credentialLeaseAuditEvent({ event: "release", lease }));
    }
  }
}

async function runSendEditDelete(
  results: TelegramLiveSmokeResult[],
  token: string,
  options: RunTelegramBrokeredLiveSmokeOptions,
): Promise<void> {
  await runSmokeStep(results, "telegram.send-edit-delete-text", [], async () => {
    const sent = await sendTelegramRequest({
      token,
      endpoint: "sendMessage",
      body: { chat_id: options.chatId as IntegrationJson, text: "ClawJS Telegram smoke test" },
      fetchImpl: options.fetchImpl,
    });
    const messageId = messageIdFromResult(sent);
    await sendTelegramRequest({
      token,
      endpoint: "editMessageText",
      body: { chat_id: options.chatId as IntegrationJson, message_id: messageId, text: "ClawJS Telegram smoke test edited" },
      fetchImpl: options.fetchImpl,
    });
    await sendTelegramRequest({
      token,
      endpoint: "deleteMessage",
      body: { chat_id: options.chatId as IntegrationJson, message_id: messageId },
      fetchImpl: options.fetchImpl,
    });
  });
}

async function runSyntheticPhoto(
  results: TelegramLiveSmokeResult[],
  token: string,
  options: RunTelegramBrokeredLiveSmokeOptions,
): Promise<void> {
  await runSmokeStep(results, "telegram.synthetic-photo", [], async () => {
    const sent = await sendTelegramRequest({
      token,
      endpoint: "sendPhoto",
      body: { chat_id: options.chatId as IntegrationJson, photo: options.mediaPhotoUrl as string },
      fetchImpl: options.fetchImpl,
    });
    await sendTelegramRequest({
      token,
      endpoint: "deleteMessage",
      body: { chat_id: options.chatId as IntegrationJson, message_id: messageIdFromResult(sent) },
      fetchImpl: options.fetchImpl,
    });
  });
}

async function runSyntheticRateLimitProbe(token: string): Promise<void> {
  try {
    await sendTelegramRequest({
      token,
      endpoint: "getUpdates",
      body: { timeout: 0 },
      fetchImpl: syntheticRateLimitFetch,
    });
  } catch (error) {
    if (
      error instanceof TelegramBotApiError
      && error.endpoint === "getUpdates"
      && error.status === 429
      && error.retryAfter === 3
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Telegram synthetic rate-limit probe did not fail.");
}

const syntheticRateLimitFetch = (async () => new Response(JSON.stringify({
  ok: false,
  description: "Too Many Requests: retry after 3",
  parameters: { retry_after: 3 },
}), {
  status: 429,
  headers: { "content-type": "application/json" },
})) as typeof fetch;

async function runSmokeStep(
  results: TelegramLiveSmokeResult[],
  id: string,
  missingPrerequisites: readonly string[],
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    results.push({ id, status: "PASS", evidence: ["brokered_live"], missingPrerequisites });
  } catch (error) {
    results.push({
      id,
      status: "FAIL",
      evidence: ["brokered_live"],
      missingPrerequisites,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function externalPending(id: string, missingPrerequisites: readonly string[]): TelegramLiveSmokeResult {
  return {
    id,
    status: "EXTERNAL PENDING",
    evidence: [],
    missingPrerequisites,
  };
}

function aggregateStatus(results: readonly TelegramLiveSmokeResult[]): TelegramLiveSmokeResultStatus {
  if (results.some((result) => result.status === "FAIL")) return "FAIL";
  if (results.some((result) => result.status === "EXTERNAL PENDING" || result.status === "PARTIAL")) return "PARTIAL";
  return "PASS";
}

function messageIdFromResult(payload: Record<string, IntegrationJson>): number {
  const result = payload.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Telegram response did not include a message result.");
  }
  const messageId = (result as Record<string, IntegrationJson>).message_id;
  if (typeof messageId !== "number") {
    throw new Error("Telegram response did not include result.message_id.");
  }
  return messageId;
}
