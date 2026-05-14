import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createHash, randomBytes } from "crypto";

import type { ClawInstance } from "@clawjs/claw";
import { resolveClawPersistentSurfacePath } from "@clawjs/core";
import type { RuntimeAdapterId } from "@clawjs/core";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeJson } from "./cli-json.ts";
import { currentCliEntryPath } from "./cli-open-state.ts";
import { resolveOpenSurface, type OpenSurface } from "./cli-open-surfaces.ts";
import { parseSimpleDurationMs } from "./cli-temporal-utils.ts";
import {
  TELEGRAM_CODEX_ATTACHMENT_INSTRUCTIONS,
  TELEGRAM_CODEX_DEFAULT_INTERVAL_MS,
  TELEGRAM_CODEX_DEFAULT_PROCESSOR_TIMEOUT_MS,
  TELEGRAM_CODEX_DEFAULT_TIMEOUT_SECONDS,
} from "./cli-telegram-codex-constants.ts";

interface CliContext {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  cwd: string;
  binName?: string;
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
}

type CreateCliClaw = (
  runtimeAdapter: RuntimeAdapterId,
  flags: Record<string, string>,
  workspaceRoot: string,
  appId: string,
  workspaceId: string,
  agentId: string,
  argv?: string[],
) => Promise<ClawInstance>;

function resolveTelegramDomainShareTtlMs(flags: Record<string, string>): number {
  const parsed = parseSimpleDurationMs(flags["domain-share-ttl"] || "30m");
  if (!parsed) {
    throw new CliHandledError("usage_error", "--ttl must use a duration like 15m, 1h, or 1d", CLI_EXIT_USAGE);
  }
  return parsed;
}

type TelegramCodexReplyPolicy = "all" | "mention_or_reply" | "commands";

interface TelegramCodexBridgeState {
  schemaVersion: 1;
  ownerUserId?: string;
  replyPolicy: TelegramCodexReplyPolicy;
  authorizedTargets: Array<{
    provider: string;
    accountId: string;
    targetId: string;
    threadId?: string | number;
    authorizedByUserId: string;
    authorizedAt: string;
  }>;
  sessions: Record<string, string>;
}

interface TelegramCodexProcessorEvent {
  type?: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  message?: {
    id?: string;
    text?: string;
    targetId?: string;
    threadId?: string | number;
    senderId?: string;
    senderLabel?: string;
    providerMessageId?: string;
    metadata?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(input));
  });
}

function sanitizeStableId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "default";
}

function hashStableId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeTelegramCodexReplyPolicy(value?: string): TelegramCodexReplyPolicy {
  return value === "mention_or_reply" || value === "commands" || value === "all" ? value : "all";
}

function telegramCodexStatePath(workspaceRoot: string, flags: Record<string, string>): string {
  return path.resolve(flags["bridge-state"] || resolveClawPersistentSurfacePath("claw.workspace.telegram_codex_bridge_state", workspaceRoot));
}

export const CODEX_AGENT_ID = "codex";
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function maybeRerenderSlidesPdfMedia(media: unknown): string | null {
  if (typeof media !== "string" || !media.endsWith(".pdf") || /^(https?:|file:)/i.test(media)) return null;
  const marker = `${path.sep}.claw${path.sep}slides${path.sep}outputs${path.sep}`;
  const markerIndex = media.indexOf(marker);
  if (markerIndex < 0) return null;
  const workspaceRoot = media.slice(0, markerIndex);
  const [deckId] = media.slice(markerIndex + marker.length).split(path.sep);
  if (!workspaceRoot || !deckId) return null;
  const manifestPath = resolveClawPersistentSurfacePath("claw.workspace.slides", workspaceRoot, "decks", `${deckId}.json`);
  if (!fs.existsSync(manifestPath)) return null;
  let deck: { slides?: Array<{ image?: { src?: string } }>; outputs?: Array<Record<string, unknown>> };
  try {
    deck = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as typeof deck;
  } catch {
    return null;
  }
  if (!deck.slides?.some((slide) => slide.image?.src)) return null;
  const currentOutput = deck.outputs?.find((output) => output.path === media);
  const usedFallback = typeof currentOutput?.metadata === "object"
    && currentOutput.metadata !== null
    && (currentOutput.metadata as { renderer?: unknown }).renderer === "node-fallback";
  if (!usedFallback) return null;

  const result = spawnSync(process.execPath, [
    currentCliEntryPath(),
    "slides",
    "render",
    manifestPath,
    "--workspace",
    workspaceRoot,
    "--format",
    "pdf",
    "--json",
  ], {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      CLAW_SLIDES_DISABLE_BROWSER: "0",
    },
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try {
    const payload = JSON.parse(result.stdout) as { rendered?: Array<{ format?: string; path?: string; metadata?: { renderer?: string } }> };
    const rendered = payload.rendered?.find((output) => output.format === "pdf" && output.path && output.metadata?.renderer !== "node-fallback");
    return rendered?.path && fs.existsSync(rendered.path) ? rendered.path : null;
  } catch {
    return null;
  }
}

function buildTelegramCodexProcessorCommand(input: {
  workspaceRoot: string;
  runtimeAdapterId: RuntimeAdapterId;
  flags: Record<string, string>;
  agentId?: string;
}): string {
  const args = [
    currentCliEntryPath(),
    "channels",
    "codex-processor",
    "run",
    "--runtime",
    input.runtimeAdapterId,
    "--workspace",
    input.workspaceRoot,
    "--runtime-workspace",
    input.flags["runtime-workspace"] || input.workspaceRoot,
    "--bridge-state",
    telegramCodexStatePath(input.workspaceRoot, input.flags),
    "--reply-policy",
    input.flags["reply-policy"] || "all",
    "--agent-id",
    input.agentId || CODEX_AGENT_ID,
  ];
  if (input.flags["home-dir"]) args.push("--home-dir", input.flags["home-dir"]);
  if (input.flags["library-dir"]) args.push("--library-dir", input.flags["library-dir"]);
  if (input.flags["bot-username"]) args.push("--bot-username", input.flags["bot-username"]);
  if (input.flags["system-prompt"]) args.push("--system-prompt", input.flags["system-prompt"]);
  if (input.flags["domain-share-url"]) args.push("--domain-share-url", input.flags["domain-share-url"]);
  if (input.flags["domain-share-ttl"]) args.push("--domain-share-ttl", input.flags["domain-share-ttl"]);
  if (input.flags.transport) args.push("--transport", input.flags.transport);
  if (input.flags.model) args.push("--model", input.flags.model);
  if (input.flags["gateway-retries"]) args.push("--gateway-retries", input.flags["gateway-retries"]);
  if (input.flags["coalescing-window-ms"]) args.push("--coalescing-window-ms", input.flags["coalescing-window-ms"]);
  if (input.flags["compaction-threshold-chars"]) args.push("--compaction-threshold-chars", input.flags["compaction-threshold-chars"]);
  if (input.flags["max-recent-messages"]) args.push("--max-recent-messages", input.flags["max-recent-messages"]);
  return [process.execPath, ...args].map(shellQuote).join(" ");
}

export function resolveCodexRuntimeAdapterId(flags: Record<string, string>): RuntimeAdapterId {
  return (flags.runtime?.trim() as RuntimeAdapterId | undefined) || "codex";
}

export function registerCodexAgentProcessor(input: {
  claw: Awaited<ReturnType<CreateCliClaw>>;
  workspaceRoot: string;
  runtimeAdapterId: RuntimeAdapterId;
  flags: Record<string, string>;
  id?: string;
}) {
  const id = input.id || CODEX_AGENT_ID;
  return input.claw.channels.processors.register({
    id,
    label: id === CODEX_AGENT_ID ? "Codex" : "Telegram Codex",
    command: buildTelegramCodexProcessorCommand({
      workspaceRoot: input.workspaceRoot,
      runtimeAdapterId: input.runtimeAdapterId,
      flags: input.flags,
      agentId: id,
    }),
    cwd: input.workspaceRoot,
    agentId: id,
    metadata: {
      kind: "agent",
      agentKind: "codex",
      runtimeAdapter: input.runtimeAdapterId,
    },
  });
}

function appendPromptSection(base: string, section: string): string {
  const trimmedSection = section.trim();
  if (!trimmedSection) return base;
  return `${base.trim()}\n\n${trimmedSection}`;
}

export function normalizeTelegramCodexAccount(flags: Record<string, string>): string | undefined {
  return flags.account?.trim() || undefined;
}

export function resolveTelegramCodexListenerOptions(flags: Record<string, string>): { intervalMs: number; timeoutSeconds: number; processorTimeoutMs: number } {
  return {
    intervalMs: flags["interval-ms"] ? Number(flags["interval-ms"]) : TELEGRAM_CODEX_DEFAULT_INTERVAL_MS,
    timeoutSeconds: flags.timeout ? Number(flags.timeout) : TELEGRAM_CODEX_DEFAULT_TIMEOUT_SECONDS,
    processorTimeoutMs: flags["processor-timeout-ms"] ? Number(flags["processor-timeout-ms"]) : TELEGRAM_CODEX_DEFAULT_PROCESSOR_TIMEOUT_MS,
  };
}

function readTelegramCodexBridgeState(statePath: string, replyPolicy: TelegramCodexReplyPolicy): TelegramCodexBridgeState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<TelegramCodexBridgeState>;
    return {
      schemaVersion: 1,
      ...(typeof parsed.ownerUserId === "string" ? { ownerUserId: parsed.ownerUserId } : {}),
      replyPolicy: normalizeTelegramCodexReplyPolicy(parsed.replyPolicy ?? replyPolicy),
      authorizedTargets: Array.isArray(parsed.authorizedTargets) ? parsed.authorizedTargets.filter((entry) => (
        entry
        && typeof entry.provider === "string"
        && typeof entry.accountId === "string"
        && typeof entry.targetId === "string"
        && typeof entry.authorizedByUserId === "string"
        && typeof entry.authorizedAt === "string"
      )) as TelegramCodexBridgeState["authorizedTargets"] : [],
      sessions: parsed.sessions && typeof parsed.sessions === "object" ? parsed.sessions as Record<string, string> : {},
    };
  } catch {
    return {
      schemaVersion: 1,
      replyPolicy,
      authorizedTargets: [],
      sessions: {},
    };
  }
}

function writeTelegramCodexBridgeState(statePath: string, state: TelegramCodexBridgeState): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function telegramCodexTargetKey(input: { provider: string; accountId: string; targetId: string; threadId?: string | number }): string {
  return [input.provider, input.accountId, input.targetId, input.threadId ? `topic:${String(input.threadId)}` : "chat"].join(":");
}

function isTelegramPrivateMessage(event: TelegramCodexProcessorEvent): boolean {
  const rawMessage = event.message?.raw?.message as Record<string, unknown> | undefined;
  const chat = rawMessage?.chat as Record<string, unknown> | undefined;
  return chat?.type === "private";
}

function isTelegramReplyToBot(event: TelegramCodexProcessorEvent): boolean {
  const rawMessage = event.message?.raw?.message as Record<string, unknown> | undefined;
  const reply = rawMessage?.reply_to_message as Record<string, unknown> | undefined;
  const from = reply?.from as Record<string, unknown> | undefined;
  return from?.is_bot === true;
}

function shouldReplyToTelegramCodexMessage(
  event: TelegramCodexProcessorEvent,
  policy: TelegramCodexReplyPolicy,
  botUsername?: string,
): boolean {
  if (policy === "all") return true;
  const text = event.message?.text?.trim() ?? "";
  if (text.startsWith("/codex") || text.startsWith("/start") || text.startsWith("/new") || text.startsWith("/reset")) return true;
  if (policy === "commands") return false;
  if (isTelegramReplyToBot(event)) return true;
  return !!(botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`));
}

type TelegramCodexCommand = "new" | "reset" | "status" | "stop" | "queue" | "continue" | "compact" | "summary" | "debug";

interface TelegramCodexQueuedMessage {
  id: string;
  content: string;
  providerMessageId?: string;
  senderId?: string;
  senderLabel?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

interface TelegramCodexChannelRun {
  runKey: string;
  sessionId: string;
  status: "idle" | "running" | "queued" | "stopping" | "failed";
  queue: TelegramCodexQueuedMessage[];
  summary?: string;
  summaryMessageId?: string;
  activeRunId?: string;
  stopRequestedRunId?: string;
  lastError?: string;
  compactionThresholdChars: number;
  maxRecentMessages: number;
}

type TelegramCodexClaw = ClawInstance & {
  channelRuns: {
    resolveOrCreateChannelRun: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
      sessionId: string;
      options?: Record<string, number | undefined>;
    }) => TelegramCodexChannelRun;
    resetChannelRun: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
      sessionId: string;
      options?: Record<string, number | undefined>;
    }) => TelegramCodexChannelRun;
    enqueueChannelMessage: (runKey: string, message: Omit<TelegramCodexQueuedMessage, "createdAt"> & { createdAt?: number }) => TelegramCodexChannelRun | null;
    processChannelRun: (input: { runKey: string; sessionId?: string; phase: "start" | "succeed" | "fail"; runId?: string; error?: string }) => TelegramCodexChannelRun | null;
    getChannelRunStatus: (runKey: string) => TelegramCodexChannelRun | null;
    requestChannelRunStop: (runKey: string) => TelegramCodexChannelRun | null;
    compactChannelSession: (input: { runKey: string; sessionId?: string; force?: boolean }) => { run: TelegramCodexChannelRun | null; summary: string; compacted: boolean };
    drainQueuedChannelMessages: (runKey: string) => TelegramCodexQueuedMessage[];
  };
};

function parseTelegramCodexSessionCommand(text: string): { command: TelegramCodexCommand; rest: string } | null {
  const match = text.trim().match(/^\/(new|reset|status|stop|queue|continue|compact|summary|debug)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return {
    command: match[1].toLowerCase() as TelegramCodexCommand,
    rest: (match[2] ?? "").trim(),
  };
}

function stripTelegramCodexCommand(text: string, botUsername?: string): string {
  let next = text.trim();
  next = next.replace(/^\/codex(?:@\w+)?\s*/i, "");
  next = next.replace(/^\/(?:new|reset)(?:@\w+)?\s*/i, "");
  if (botUsername) {
    next = next.replace(new RegExp(`@${botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "ig"), "").trim();
  }
  return next || text.trim();
}

function resolveTelegramClawDomainRequest(text: string): OpenSurface | null {
  const trimmed = text.trim();
  const openMatch = trimmed.match(/^open\s+([a-z0-9._-]+)(?:\s+dashboard)?$/i);
  if (openMatch) return resolveOpenSurface(openMatch[1]);
  const bareMatch = trimmed.match(/^([a-z0-9._-]+)\.claw$/i);
  if (bareMatch) return resolveOpenSurface(bareMatch[1]);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".claw")) return null;
    return resolveOpenSurface(url.hostname.slice(0, -".claw".length));
  } catch {
    return null;
  }
}

function buildTelegramClawDomainReply(surface: OpenSurface, flags: Record<string, string>): string {
  const baseUrl = flags["domain-share-url"] || process.env.CLAW_DOMAIN_SHARE_URL || process.env.CLAW_TELEGRAM_DOMAIN_SHARE_URL;
  const alias = `${surface.id}.claw`;
  if (!baseUrl?.trim()) {
    return `${alias} is local to the ClawJS Mac. Configure a relay/share URL to send a reachable mobile link.`;
  }
  const ttlMs = resolveTelegramDomainShareTtlMs(flags);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const share = new URL(baseUrl);
  share.searchParams.set("claw_surface", surface.id);
  share.searchParams.set("claw_target", `http://127.0.0.1:${surface.port}`);
  share.searchParams.set("claw_share_token", randomBytes(18).toString("base64url"));
  share.searchParams.set("expires", expiresAt);
  return `${alias}: ${share.toString()}`;
}

function telegramCodexResetPrompt(command: "new" | "reset"): string {
  return [
    `A new session was started via /${command}.`,
    "Greet the user briefly and ask what they want to do next.",
    `Current time: ${new Date().toISOString()}.`,
  ].join(" ");
}

function formatTelegramCodexQueuedPrompt(messages: Array<{ content: string; senderLabel?: string; createdAt: number }>): string {
  const lines = messages.map((message, index) => {
    const label = message.senderLabel?.trim() || `message ${index + 1}`;
    return `- ${new Date(message.createdAt).toISOString()} ${label}: ${message.content}`;
  });
  return [
    "Messages received while the agent was already working. Treat these as the user's latest steering/follow-up context.",
    ...lines,
  ].join("\n");
}

function formatTelegramCodexStatus(run: TelegramCodexChannelRun | null, sessionId: string): string {
  if (!run) return `Status: idle\nSession: ${sessionId}\nQueue: 0`;
  return [
    `Status: ${run.status}`,
    `Session: ${run.sessionId}`,
    `Queue: ${run.queue.length}`,
    run.summary ? "Summary: available" : "Summary: none",
    run.lastError ? `Last error: ${run.lastError}` : "",
  ].filter(Boolean).join("\n");
}

function buildTelegramCodexEffectiveMessages(
  session: NonNullable<ReturnType<ClawInstance["sessions"]["getSession"]>>,
  options: { summaryMessageId?: string; maxRecentMessages?: number },
) {
  const maxRecentMessages = options.maxRecentMessages ?? 16;
  const summary = options.summaryMessageId
    ? session.messages.find((message) => message.id === options.summaryMessageId)
    : undefined;
  const nonSummary = session.messages.filter((message) => message.metadata?.source !== "channel-run-compaction");
  if (!summary) return nonSummary;
  return [summary, ...nonSummary.slice(-maxRecentMessages)];
}

function formatTelegramCodexPrompt(event: TelegramCodexProcessorEvent, text: string): string {
  const metadata = event.message?.metadata ?? {};
  if (!metadata.voiceNoteId) return text;
  return [
    "The user sent a Telegram voice note. It has already been downloaded and transcribed by ClawJS STT.",
    "Treat the transcript below as the user's actual message. Do not say you cannot hear or access audio.",
    "",
    "Voice note transcript:",
    text,
  ].join("\n");
}

function splitTelegramMessage(text: string, maxLength = 3900): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxLength) {
    let index = remaining.lastIndexOf("\n", maxLength);
    if (index < Math.floor(maxLength * 0.5)) index = remaining.lastIndexOf(" ", maxLength);
    if (index < Math.floor(maxLength * 0.5)) index = maxLength;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

type TelegramCodexMediaAction = {
  type: "send_message";
  targetId?: string;
  text?: string;
  media?: string;
  mediaType?: "photo" | "video" | "document" | "audio" | "animation";
  threadId?: string | number;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  metadata?: Record<string, unknown>;
};

function parseTelegramCodexMediaActions(text: string): { text: string; mediaActions: TelegramCodexMediaAction[] } {
  const mediaActions: TelegramCodexMediaAction[] = [];
  const cleaned = text.replace(/```clawjs-telegram-actions\s*([\s\S]*?)```/gi, (_match, rawJson: string) => {
    try {
      const payload = JSON.parse(rawJson.trim()) as unknown;
      const actions = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { actions?: unknown[] } | null)?.actions)
          ? (payload as { actions: unknown[] }).actions
          : [];
      for (const action of actions) {
        if (!action || typeof action !== "object") continue;
        const candidate = action as Record<string, unknown>;
        const media = typeof candidate.media === "string" ? candidate.media.trim() : "";
        const mediaType = typeof candidate.mediaType === "string" ? candidate.mediaType : "photo";
        if (candidate.type !== "send_message" || !media || !["photo", "video", "document", "audio", "animation"].includes(mediaType)) continue;
        mediaActions.push({
          type: "send_message",
          ...(typeof candidate.targetId === "string" ? { targetId: candidate.targetId } : {}),
          ...(typeof candidate.text === "string" ? { text: candidate.text } : {}),
          media,
          mediaType: mediaType as TelegramCodexMediaAction["mediaType"],
          ...(typeof candidate.threadId === "string" || typeof candidate.threadId === "number" ? { threadId: candidate.threadId } : {}),
          ...(candidate.parseMode === "HTML" || candidate.parseMode === "Markdown" || candidate.parseMode === "MarkdownV2" ? { parseMode: candidate.parseMode } : {}),
          ...(candidate.metadata && typeof candidate.metadata === "object" && !Array.isArray(candidate.metadata) ? { metadata: candidate.metadata as Record<string, unknown> } : {}),
        });
      }
    } catch {
      return _match;
    }
    return "";
  }).trim();
  return { text: cleaned, mediaActions };
}

export async function runTelegramCodexProcessor(input: {
  context: CliContext;
  flags: Record<string, string>;
  argv: string[];
  workspaceRoot: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapterId: RuntimeAdapterId;
  createCliClaw: CreateCliClaw;
}): Promise<number> {
  const raw = await readStdin();
  const event = JSON.parse(raw || "{}") as TelegramCodexProcessorEvent;
  const provider = event.provider || "telegram";
  const accountId = event.accountId || "default";
  const targetId = event.targetId || event.message?.targetId;
  const threadId = event.message?.threadId;
  const senderId = event.message?.senderId;
  const rawText = event.message?.text?.trim();
  if (!targetId || !senderId || !rawText) {
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "missing target, sender, or text" }] });
    return CLI_EXIT_OK;
  }

  const replyPolicy = normalizeTelegramCodexReplyPolicy(input.flags["reply-policy"]);
  const botUsername = input.flags["bot-username"];
  const statePath = telegramCodexStatePath(input.workspaceRoot, input.flags);
  const state = readTelegramCodexBridgeState(statePath, replyPolicy);
  state.replyPolicy = replyPolicy;

  const isPrivate = isTelegramPrivateMessage(event);
  const key = telegramCodexTargetKey({ provider, accountId, targetId, ...(threadId ? { threadId } : {}) });
  const now = new Date().toISOString();
  let changed = false;

  if (!state.ownerUserId) {
    state.ownerUserId = senderId;
    changed = true;
  }

  const isOwner = state.ownerUserId === senderId;
  const authorized = state.authorizedTargets.some((target) => telegramCodexTargetKey(target) === key);
  if (!authorized && (isPrivate || isOwner)) {
    state.authorizedTargets.push({
      provider,
      accountId,
      targetId,
      ...(threadId ? { threadId } : {}),
      authorizedByUserId: senderId,
      authorizedAt: now,
    });
    changed = true;
  }

  const nowAuthorized = authorized || isPrivate || isOwner;
  if (!isOwner && !nowAuthorized) {
    if (changed) writeTelegramCodexBridgeState(statePath, state);
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "target not authorized by owner" }] });
    return CLI_EXIT_OK;
  }
  if (!shouldReplyToTelegramCodexMessage(event, state.replyPolicy, botUsername)) {
    if (changed) writeTelegramCodexBridgeState(statePath, state);
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "reply policy did not match" }] });
    return CLI_EXIT_OK;
  }

  if (changed) writeTelegramCodexBridgeState(statePath, state);

  const requestedClawSurface = resolveTelegramClawDomainRequest(rawText);
  if (requestedClawSurface) {
    const text = buildTelegramClawDomainReply(requestedClawSurface, input.flags);
    writeJson(input.context.stdout, {
      actions: [
        {
          type: "grant_permission",
          targetId,
          agentId: input.agentId,
          permissions: ["write"],
          priority: 100,
          metadata: {
            source: "telegram-codex-bridge",
            ownerUserId: state.ownerUserId,
          },
        },
        {
          type: "send_message",
          targetId,
          text,
          ...(threadId ? { threadId } : {}),
          agentId: input.agentId,
          metadata: {
            source: "telegram-claw-domain",
            surface: requestedClawSurface.id,
            ownerUserId: state.ownerUserId,
          },
        },
      ],
    });
    return CLI_EXIT_OK;
  }

  const targetLabel = threadId ? `${targetId} topic ${threadId}` : targetId;
  const claw = await input.createCliClaw(input.runtimeAdapterId, input.flags, input.workspaceRoot, input.appId, input.workspaceId, input.agentId, input.argv) as TelegramCodexClaw;
  const baseSystemPrompt = input.flags["system-prompt"] || [
    "You are Codex responding through a Telegram bot.",
    "Be concise, useful, and clear.",
    "You are running in the configured ClawJS runtime environment.",
  ].join(" ");
  const skillCapsules = (claw.library as typeof claw.library & {
    resolveSkillCapsules: (input?: { agentId?: string; workspaceId?: string }) => { prompt: string };
  }).resolveSkillCapsules({
    agentId: input.agentId,
    workspaceId: input.workspaceId,
  });
  const systemPrompt = appendPromptSection(
    appendPromptSection(baseSystemPrompt, skillCapsules.prompt),
    TELEGRAM_CODEX_ATTACHMENT_INSTRUCTIONS,
  );
  const telegramRuleHints = {
    channel: provider,
    service: "telegram",
    domain: "channels",
    agent: input.agentId,
    limit: 20,
  };
  const sessionCommand = parseTelegramCodexSessionCommand(rawText);
  const runOptions = {
    coalescingWindowMs: input.flags["coalescing-window-ms"] ? Number(input.flags["coalescing-window-ms"]) : undefined,
    compactionThresholdChars: input.flags["compaction-threshold-chars"] ? Number(input.flags["compaction-threshold-chars"]) : undefined,
    maxRecentMessages: input.flags["max-recent-messages"] ? Number(input.flags["max-recent-messages"]) : undefined,
  };
  let sessionId = state.sessions[key];
  const rotatesSession = sessionCommand?.command === "new" || sessionCommand?.command === "reset";
  if (rotatesSession || !sessionId) {
    sessionId = rotatesSession
      ? claw.sessions.createSession(`Telegram ${targetLabel}`).sessionId
      : claw.sessions.resolveChannelSession({
        provider,
        accountId,
        targetId,
        ...(threadId ? { threadId } : {}),
      }).sessionId;
    if (state.sessions[key] !== sessionId) {
      state.sessions[key] = sessionId;
      writeTelegramCodexBridgeState(statePath, state);
    }
  }
  const run = rotatesSession
    ? claw.channelRuns.resetChannelRun({ provider, accountId, targetId, ...(threadId ? { threadId } : {}), sessionId, options: runOptions })
    : claw.channelRuns.resolveOrCreateChannelRun({ provider, accountId, targetId, ...(threadId ? { threadId } : {}), sessionId, options: runOptions });
  const useChannelSessionHelpers = !rotatesSession && sessionId.startsWith("channel-");
  if (useChannelSessionHelpers) {
    claw.sessions.backfillChannelSession({
      provider,
      accountId,
      targetId,
      ...(threadId ? { threadId } : {}),
      ...(event.message?.providerMessageId ? { excludeProviderMessageIds: [event.message.providerMessageId] } : {}),
    });
  }
  const providerMessageId = event.message?.providerMessageId;
  const userMessageId = `telegram-codex-${hashStableId([
    key,
    "inbound",
    providerMessageId || rawText,
  ].join(":"))}`;
  if (!state.sessions[key]) {
    state.sessions[key] = sessionId;
    writeTelegramCodexBridgeState(statePath, state);
  }

  const sendTextAction = (text: string, metadata: Record<string, unknown> = {}) => ({
    type: "send_message",
    targetId,
    text,
    ...(threadId ? { threadId } : {}),
    agentId: input.agentId,
    metadata: {
      sessionId,
      ownerUserId: state.ownerUserId,
      ...metadata,
    },
  });

  const command = sessionCommand?.command;
  if (command === "status") {
    writeJson(input.context.stdout, { actions: [sendTextAction(formatTelegramCodexStatus(run, sessionId))] });
    return CLI_EXIT_OK;
  }
  if (command === "queue") {
    const current = claw.channelRuns.getChannelRunStatus(run.runKey);
    const queued = current?.queue ?? [];
    writeJson(input.context.stdout, { actions: [sendTextAction(queued.length ? `Queued messages: ${queued.length}` : "Queue is empty.")] });
    return CLI_EXIT_OK;
  }
  if (command === "stop") {
    const stopped = claw.channelRuns.requestChannelRunStop(run.runKey);
    writeJson(input.context.stdout, { actions: [sendTextAction(stopped?.activeRunId ? "Stop requested." : "No active run.")] });
    return CLI_EXIT_OK;
  }
  if (command === "summary") {
    const current = claw.channelRuns.getChannelRunStatus(run.runKey);
    writeJson(input.context.stdout, { actions: [sendTextAction(current?.summary || "No summary yet.")] });
    return CLI_EXIT_OK;
  }
  if (command === "debug") {
    const current = claw.channelRuns.getChannelRunStatus(run.runKey);
    writeJson(input.context.stdout, {
      actions: [sendTextAction([
        `runKey=${run.runKey}`,
        `status=${current?.status ?? "idle"}`,
        `queue=${current?.queue.length ?? 0}`,
        `session=${sessionId}`,
        `summary=${current?.summary ? "yes" : "no"}`,
      ].join("\n"))],
    });
    return CLI_EXIT_OK;
  }
  if (command === "compact") {
    const compacted = claw.channelRuns.compactChannelSession({ runKey: run.runKey, sessionId, force: true });
    writeJson(input.context.stdout, { actions: [sendTextAction(compacted.summary || "Nothing to compact.")] });
    return CLI_EXIT_OK;
  }

  const activeRun = claw.channelRuns.getChannelRunStatus(run.runKey);
  if (activeRun && (activeRun.status === "running" || activeRun.status === "stopping") && command !== "continue") {
    claw.channelRuns.enqueueChannelMessage(run.runKey, {
      id: userMessageId,
      content: formatTelegramCodexPrompt(event, stripTelegramCodexCommand(rawText, botUsername)),
      ...(providerMessageId ? { providerMessageId } : {}),
      senderId,
      ...(event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
      metadata: {
        source: "telegram-codex-bridge",
        ...(event.message?.metadata ?? {}),
      },
    });
    writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "queued while run is active" }] });
    return CLI_EXIT_OK;
  }

  const appendUserTurn = (content: string, metadata: Record<string, unknown>, id: string) => (
    useChannelSessionHelpers
      ? claw.sessions.appendChannelMessage({
        provider,
        accountId,
        targetId,
        ...(threadId ? { threadId } : {}),
        direction: "inbound",
        role: "user",
        content,
        ...(metadata.providerMessageId ? { providerMessageId: String(metadata.providerMessageId) } : {}),
        senderId: typeof metadata.senderId === "string" ? metadata.senderId : senderId,
        ...(typeof metadata.senderLabel === "string" ? { senderLabel: metadata.senderLabel } : event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
        metadata: {
          source: "telegram-codex-bridge",
          ...metadata,
        },
      })
      : claw.sessions.appendMessageOnce(sessionId, {
        id,
        role: "user",
        content,
        metadata: {
          source: "telegram-codex-bridge",
          provider,
          accountId,
          targetId,
          ...(threadId ? { threadId: String(threadId) } : {}),
          direction: "inbound",
          ...metadata,
        },
      })
  );

  const appendAssistantTurn = (text: string, metadata: Record<string, unknown>) => {
    if (useChannelSessionHelpers) {
      claw.sessions.appendChannelMessage({
        provider,
        accountId,
        targetId,
        ...(threadId ? { threadId } : {}),
        direction: "outbound",
        role: "assistant",
        content: text,
        metadata: {
          source: "telegram-codex-bridge",
          ...metadata,
        },
      });
    } else {
      claw.sessions.appendMessageOnce(sessionId, {
        id: `telegram-codex-${hashStableId([key, "outbound", userMessageId, text].join(":"))}`,
        role: "assistant",
        content: text,
        metadata: {
          source: "telegram-codex-bridge",
          provider,
          accountId,
          targetId,
          ...(threadId ? { threadId: String(threadId) } : {}),
          direction: "outbound",
          ...metadata,
        },
      });
    }
  };

  const replies: Array<{ text: string; transport?: string; fallback?: boolean }> = [];
  const processPrompt = async (content: string, metadata: Record<string, unknown>, messageId: string): Promise<"processed" | "duplicate" | "stopped"> => {
    const userMessage = appendUserTurn(content, metadata, messageId);
    if (!userMessage.appended) return "duplicate";
    const runId = `telegram-codex-${hashStableId([run.runKey, messageId, Date.now()].join(":"))}`;
    claw.channelRuns.processChannelRun({ runKey: run.runKey, sessionId, phase: "start", runId });
    try {
      const currentSession = claw.sessions.getSession(sessionId);
      const currentRun = claw.channelRuns.getChannelRunStatus(run.runKey);
      const charCount = currentSession?.messages.reduce((sum, message) => sum + message.content.length, 0) ?? 0;
      if (currentSession && currentRun && charCount > currentRun.compactionThresholdChars) {
        claw.channelRuns.compactChannelSession({ runKey: run.runKey, sessionId });
      }
      const latestRun = claw.channelRuns.getChannelRunStatus(run.runKey);
      const session = claw.sessions.getSession(sessionId);
      const messages = session?.messages.length
        ? buildTelegramCodexEffectiveMessages(session, {
          summaryMessageId: latestRun?.summaryMessageId,
          maxRecentMessages: latestRun?.maxRecentMessages,
        })
        : [{ role: "user" as const, content }];
      const result = await claw.inference.generateText({
        systemPrompt,
        contextBlocks: [
          { title: "Telegram", content: `provider=${provider}\naccount=${accountId}\ntarget=${targetLabel}\nsender=${event.message?.senderLabel ?? senderId}` },
        ],
        ruleHints: telegramRuleHints,
        messages,
        transport: (input.flags.transport as "auto" | "gateway" | "cli" | undefined) ?? "auto",
        ...(input.flags.model ? { model: input.flags.model } : {}),
        ...(input.flags["gateway-retries"] ? { gatewayRetries: Number(input.flags["gateway-retries"]) } : { gatewayRetries: 1 }),
      });
      const afterRun = claw.channelRuns.getChannelRunStatus(run.runKey);
      if (afterRun?.stopRequestedRunId === runId || afterRun?.status === "stopping") {
        claw.channelRuns.processChannelRun({ runKey: run.runKey, sessionId, phase: "succeed", runId });
        return "stopped";
      }
      if (result.text) {
        appendAssistantTurn(result.text, { ...(result.transport ? { transport: result.transport } : {}), fallback: result.fallback });
        replies.push({ text: result.text, ...(result.transport ? { transport: result.transport } : {}), fallback: result.fallback });
      }
      claw.channelRuns.processChannelRun({ runKey: run.runKey, sessionId, phase: "succeed", runId });
      return "processed";
    } catch (error) {
      claw.channelRuns.processChannelRun({
        runKey: run.runKey,
        sessionId,
        phase: "fail",
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const promptText = sessionCommand?.rest
    ? sessionCommand.rest
    : rotatesSession && sessionCommand
      ? telegramCodexResetPrompt(sessionCommand.command === "reset" ? "reset" : "new")
      : command === "continue"
        ? ""
        : stripTelegramCodexCommand(rawText, botUsername);
  const persistUserMessage = !(rotatesSession && sessionCommand && !sessionCommand.rest) && command !== "continue";
  if (!persistUserMessage && rotatesSession && sessionCommand) {
    const resetText = sessionCommand.command === "reset"
      ? "Session reset. What do you want to do next?"
      : "New session is ready. What do you want to do next?";
    appendAssistantTurn(resetText, { command: sessionCommand.command, sessionReset: true });
    replies.push({ text: resetText, transport: "cli", fallback: false });
  } else if (persistUserMessage) {
    const processed = await processPrompt(formatTelegramCodexPrompt(event, promptText), {
      ...(providerMessageId ? { providerMessageId } : {}),
      senderId,
      ...(event.message?.senderLabel ? { senderLabel: event.message.senderLabel } : {}),
      ...(sessionCommand ? { command: sessionCommand.command, sessionReset: rotatesSession } : {}),
      ...(event.message?.metadata ?? {}),
    }, userMessageId);
    if (processed === "duplicate") {
      writeJson(input.context.stdout, { actions: [{ type: "ignore", reason: "duplicate message" }] });
      return CLI_EXIT_OK;
    }
  }

  const queued = claw.channelRuns.drainQueuedChannelMessages(run.runKey);
  if (queued.length > 0) {
    await processPrompt(formatTelegramCodexQueuedPrompt(queued), {
      queued: true,
      queuedCount: queued.length,
    }, `telegram-codex-${hashStableId([run.runKey, "queued", queued.map((message) => message.id).join(":")].join(":"))}`);
  } else if (command === "continue" && !persistUserMessage) {
    writeJson(input.context.stdout, { actions: [sendTextAction("Queue is empty.")] });
    return CLI_EXIT_OK;
  }

  const actions: Array<Record<string, unknown>> = [];
  const mediaActions: Array<Record<string, unknown>> = [];
  for (const reply of replies) {
    const parsedReply = parseTelegramCodexMediaActions(reply.text);
    for (const text of splitTelegramMessage(parsedReply.text)) {
      actions.push(sendTextAction(text, { transport: reply.transport, fallback: reply.fallback }));
    }
    mediaActions.push(...parsedReply.mediaActions.map((action) => {
      const repairedMedia = maybeRerenderSlidesPdfMedia(action.media);
      return {
        ...action,
        ...(repairedMedia ? { media: repairedMedia } : {}),
        targetId: action.targetId ?? targetId,
        ...(action.threadId !== undefined ? { threadId: action.threadId } : threadId ? { threadId } : {}),
        agentId: input.agentId,
        metadata: {
          ...(action.metadata ?? {}),
          ...(repairedMedia ? { slidesMediaRerendered: true, originalMedia: action.media } : {}),
          sessionId,
          transport: reply.transport,
          fallback: reply.fallback,
          ownerUserId: state.ownerUserId,
        },
      };
    }));
  }
  if (actions.length > 0 || mediaActions.length > 0) {
    actions.unshift({
      type: "grant_permission",
      targetId,
      agentId: input.agentId,
      permissions: ["write"],
      priority: 100,
      metadata: {
        source: "telegram-codex-bridge",
        ownerUserId: state.ownerUserId,
      },
    });
    actions.push(...mediaActions);
  }
  if (actions.length === 0) {
    actions.push({ type: "ignore", reason: "codex returned empty response" });
  }
  writeJson(input.context.stdout, {
    actions,
  });
  return CLI_EXIT_OK;
}
