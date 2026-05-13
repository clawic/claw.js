import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTelegramConfig, type TelegramSurfaceConfig } from "./config.ts";
import { readTelegramBotsForWorkspace } from "./state.ts";
import { runClawCli } from "./cli.ts";

export interface BuildTelegramAppOptions {
  config?: Partial<TelegramSurfaceConfig>;
}

interface RouteBody {
  account?: string;
  workspace?: string;
}

function pickAccount(body: RouteBody | undefined, fallback: string | null): string | null {
  const fromBody = body?.account?.trim();
  if (fromBody) return fromBody;
  return fallback;
}

function buildAccountFlags(account: string | null): string[] {
  return account ? ["--account", account] : [];
}

export async function buildTelegramApp(options: BuildTelegramAppOptions = {}) {
  const baseConfig = loadTelegramConfig();
  const config: TelegramSurfaceConfig = { ...baseConfig, ...options.config };

  const app = Fastify({
    logger: { level: process.env.CLAW_TELEGRAM_LOG_LEVEL ?? "info" },
  });

  await app.register(cors, { origin: true });

  app.get("/v1/health", async () => ({
    ok: true,
    surface: "telegram",
    workspace: config.workspace,
    clawBinAvailable: !!process.env.CLAW_BIN,
    now: new Date().toISOString(),
  }));

  app.get("/v1/bots", async () => {
    const bots = readTelegramBotsForWorkspace(config.workspace);
    return { workspace: config.workspace, bots };
  });

  // Connect a new Telegram bot. Wraps `claw telegram connect`.
  // The bot token must already live in the Secrets vault under
  // `secretName`; the CLI looks it up there and registers the channel
  // account in `<workspace>/.claw/observed/channels.json`.
  app.post("/v1/bots", async (request, reply) => {
    const body = (request.body ?? {}) as RouteBody & {
      secretName?: string;
      accountId?: string;
      label?: string;
      apiBaseUrl?: string;
      webhookUrl?: string;
      webhookSecretToken?: string;
    };
    if (!body.secretName) {
      return reply.code(400).send({ error: "secretName is required" });
    }
    const args = ["telegram", "connect", "--secret-name", body.secretName];
    if (body.apiBaseUrl) args.push("--api-base-url", body.apiBaseUrl);
    if (body.webhookUrl) args.push("--webhook-url", body.webhookUrl);
    if (body.webhookSecretToken) args.push("--webhook-secret-token", body.webhookSecretToken);
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 60_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.get("/v1/bots/:id", async (request, reply) => {
    const params = request.params as { id?: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    return { bot };
  });

  // ------------------------------------------------------------------
  // Action endpoints. Each one shells out to `claw telegram <subcommand>`
  // (with `--json` appended). The CLI binary is found via the CLAW_BIN
  // env var that `claw open telegram` forwards to us.
  // ------------------------------------------------------------------

  app.get("/v1/bots/:id/status", async (request, reply) => {
    const params = request.params as { id: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const result = await runClawCli({
      workspace: config.workspace,
      args: ["telegram", "status", "--account", bot.accountId],
      timeoutMs: 30_000,
    });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.post("/v1/bots/:id/polling/start", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as RouteBody & { limit?: number; timeoutSeconds?: number; dropPendingUpdates?: boolean };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "polling", "start", ...buildAccountFlags(pickAccount(body, bot.accountId))];
    if (body.limit) args.push("--limit", String(body.limit));
    if (body.timeoutSeconds) args.push("--timeout", String(body.timeoutSeconds));
    if (body.dropPendingUpdates) args.push("--drop-pending-updates");
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 60_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.post("/v1/bots/:id/polling/stop", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as RouteBody;
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "polling", "stop", ...buildAccountFlags(pickAccount(body, bot.accountId))];
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 30_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.post("/v1/bots/:id/webhook", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as RouteBody & {
      url?: string;
      secretToken?: string;
      allowedUpdates?: string[];
      maxConnections?: number;
      ipAddress?: string;
      dropPendingUpdates?: boolean;
    };
    if (!body.url) return reply.code(400).send({ error: "url is required" });
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "webhook", "set", "--url", body.url, ...buildAccountFlags(pickAccount(body, bot.accountId))];
    if (body.secretToken) args.push("--webhook-secret-token", body.secretToken);
    if (body.allowedUpdates && body.allowedUpdates.length) {
      args.push("--allowed-updates", JSON.stringify(body.allowedUpdates));
    }
    if (body.maxConnections) args.push("--max-connections", String(body.maxConnections));
    if (body.ipAddress) args.push("--ip-address", body.ipAddress);
    if (body.dropPendingUpdates) args.push("--drop-pending-updates");
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 30_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.delete("/v1/bots/:id/webhook", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as RouteBody & { dropPendingUpdates?: boolean };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "webhook", "clear", ...buildAccountFlags(pickAccount(body, bot.accountId))];
    if (body.dropPendingUpdates) args.push("--drop-pending-updates");
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 30_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.get("/v1/bots/:id/commands", async (request, reply) => {
    const params = request.params as { id: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const result = await runClawCli({
      workspace: config.workspace,
      args: ["telegram", "commands", "get", "--account", bot.accountId],
      timeoutMs: 30_000,
    });
    return reply.code(result.ok || Array.isArray(result.json) ? 200 : 502).send(result);
  });

  app.post("/v1/bots/:id/commands", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as RouteBody & { commands?: Array<{ command: string; description: string }> };
    if (!Array.isArray(body.commands)) return reply.code(400).send({ error: "commands array required" });
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = [
      "telegram", "commands", "set",
      "--commands", JSON.stringify(body.commands),
      ...buildAccountFlags(pickAccount(body, bot.accountId)),
    ];
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 30_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.get("/v1/bots/:id/chats", async (request, reply) => {
    const params = request.params as { id: string };
    const query = (request.query ?? {}) as { q?: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "chats", "list", "--account", bot.accountId];
    if (query.q?.trim()) args.push("--query", query.q.trim());
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 60_000 });
    return reply.code(result.ok || Array.isArray(result.json) ? 200 : 502).send(result);
  });

  app.get("/v1/bots/:id/chats/:chatId", async (request, reply) => {
    const params = request.params as { id: string; chatId: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "chats", "inspect", "--chat-id", params.chatId, "--account", bot.accountId];
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 30_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.post("/v1/bots/:id/messages", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as RouteBody & {
      chatId?: string;
      text?: string;
      media?: string;
      mediaType?: "photo" | "video" | "document" | "audio" | "animation";
      caption?: string;
      parseMode?: "MarkdownV2" | "HTML";
      replyToMessageId?: number;
      messageThreadId?: number;
    };
    if (!body.chatId) return reply.code(400).send({ error: "chatId is required" });
    if (!body.text && !body.media) return reply.code(400).send({ error: "text or media required" });
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const args = ["telegram", "send", "--chat-id", body.chatId, ...buildAccountFlags(pickAccount(body, bot.accountId))];
    if (body.media) {
      args.push("--media", body.media);
      args.push("--type", body.mediaType ?? "photo");
      if (body.caption) args.push("--caption", body.caption);
    } else if (body.text) {
      args.push("--text", body.text);
    }
    if (body.parseMode) args.push("--parse-mode", body.parseMode);
    if (body.replyToMessageId) args.push("--reply-to-message-id", String(body.replyToMessageId));
    if (body.messageThreadId) args.push("--message-thread-id", String(body.messageThreadId));
    const result = await runClawCli({ workspace: config.workspace, args, timeoutMs: 30_000 });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  app.get("/v1/bots/:id/codex/status", async (request, reply) => {
    const params = request.params as { id: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const result = await runClawCli({
      workspace: config.workspace,
      args: ["channels", "telegram", "codex", "status", "--account", bot.accountId],
      timeoutMs: 30_000,
    });
    return reply.code(200).send(result);
  });

  for (const codexCommand of ["start", "stop", "repair"] as const) {
    app.post(`/v1/bots/:id/codex/${codexCommand}`, async (request, reply) => {
      const params = request.params as { id: string };
      const bots = readTelegramBotsForWorkspace(config.workspace);
      const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
      if (!bot) return reply.code(404).send({ error: "Bot not found" });
      const result = await runClawCli({
        workspace: config.workspace,
        args: ["channels", "telegram", "codex", codexCommand, "--account", bot.accountId],
        timeoutMs: 60_000,
      });
      return reply.code(result.ok ? 200 : 502).send(result);
    });
  }

  app.post("/v1/bots/:id/codex/commands-sync", async (request, reply) => {
    const params = request.params as { id: string };
    const bots = readTelegramBotsForWorkspace(config.workspace);
    const bot = bots.find((b) => b.id === params.id || b.accountId === params.id);
    if (!bot) return reply.code(404).send({ error: "Bot not found" });
    const result = await runClawCli({
      workspace: config.workspace,
      args: ["channels", "telegram", "codex", "commands", "sync", "--account", bot.accountId],
      timeoutMs: 60_000,
    });
    return reply.code(result.ok ? 200 : 502).send(result);
  });

  // Static UI
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const uiCandidates = [
    path.resolve(__dirname, "../../ui/dist"),
    path.resolve(__dirname, "../ui/dist"),
    path.resolve(__dirname, "../../../ui/dist"),
  ];
  const publicDir = uiCandidates.find((candidate) => existsSync(path.join(candidate, "index.html")));
  const hasStaticBuild = !!publicDir;

  if (hasStaticBuild && publicDir) {
    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: "/",
      wildcard: false,
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    if (hasStaticBuild && publicDir) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).type("text/plain").send(
      "Telegram UI build not found. Run `npm --prefix integrations/telegram/ui run build`.",
    );
  });

  return { app, config };
}
