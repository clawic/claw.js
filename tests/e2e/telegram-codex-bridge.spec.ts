import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { once } from "events";
import { spawn } from "child_process";

import { expect, test } from "./fixtures";
import { buildVaultApp } from "../../vault/src/server/app";

type ProcessorAction = {
  type: string;
  targetId?: string;
  threadId?: string | number;
  text?: string;
  media?: string;
  mediaType?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

type BridgeState = {
  ownerUserId?: string;
  replyPolicy: string;
  authorizedTargets: Array<{ targetId: string; threadId?: string | number; authorizedByUserId: string }>;
  sessions: Record<string, string>;
};

function sendActions(actions: ProcessorAction[]) {
  return actions.filter((action) => action.type === "send_message");
}

function appendChannelMessages(workspacePath: string, messages: Array<{
  id: string;
  targetId: string;
  direction: "inbound" | "outbound";
  text: string;
  providerMessageId?: string;
  senderId?: string;
}>) {
  const statePath = path.join(workspacePath, ".claw", "observed", "channels.json");
  const now = new Date().toISOString();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const current = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8")) as Record<string, unknown>
    : {};
  const existing = Array.isArray(current.messages) ? current.messages : [];
  fs.writeFileSync(statePath, `${JSON.stringify({
    schemaVersion: 1,
    updatedAt: now,
    channels: [],
    accounts: current.accounts ?? [],
    targets: current.targets ?? [],
    messages: [
      ...messages.map((message) => ({
        ...message,
        provider: "telegram",
        accountId: "test-account",
        status: message.direction === "outbound" ? "sent" : "received",
        createdAt: now,
        updatedAt: now,
      })),
      ...existing,
    ],
    bindings: current.bindings ?? [],
    processors: current.processors ?? [],
    listeners: current.listeners ?? [],
    events: current.events ?? [],
  }, null, 2)}\n`);
}

function writeSyntheticBridgeSlideImage(targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#09315a"/><stop offset="1" stop-color="#19b7a4"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <circle cx="880" cy="220" r="150" fill="#f7c85f" opacity=".9"/>
  <rect x="160" y="180" width="420" height="440" rx="36" fill="#fff" opacity=".78"/>
  <rect x="640" y="330" width="330" height="230" rx="28" fill="#07111f" opacity=".66"/>
</svg>`, "utf8");
}

async function startHermeticVault(prefix = "clawjs-telegram-vault") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const { app } = buildVaultApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(rootDir, ".data"),
      dbPath: path.join(rootDir, ".data", "vault.sqlite"),
      jwtSecret: "vault-test-secret",
      publicBaseUrl: "http://127.0.0.1:0",
      uiDistDir: path.join(process.cwd(), "vault", "ui", "dist"),
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 4610;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await app.close();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

async function loginToVault(baseUrl: string) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: "demo-tenant",
      email: "admin@vault.local",
      password: "vault-admin",
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as { accessToken: string };
}

async function startHermeticUpstream() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/echo") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      authorization: request.headers.authorization ?? null,
      queryToken: url.searchParams.get("token"),
    }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function writeFakeCodexBinary(rootDir: string) {
  const binDir = path.join(rootDir, "bin");
  const binaryPath = path.join(binDir, "codex");
  const payloadPath = path.join(rootDir, "codex-payloads.jsonl");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const readline = require("readline");
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.122.0-test\\n");
  process.exit(0);
}
if (args[0] === "login" && args[1] === "status") {
  process.stdout.write("Logged in using ChatGPT\\n");
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "--help") {
  process.stdout.write("Usage: codex app-server\\n");
  process.exit(0);
}
if (args[0] === "app-server") {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      process.stdout.write(JSON.stringify({ id: message.id, result: {} }) + "\\n");
      return;
    }
    if (message.method === "thread/start") {
      process.stdout.write(JSON.stringify({ id: message.id, result: { thread: { id: "thread-" + message.id } } }) + "\\n");
      return;
    }
    if (message.method === "turn/start") {
      const payload = JSON.stringify(message.params || {});
      fs.appendFileSync(${JSON.stringify(payloadPath)}, payload + "\\n");
      const slidesFallbackMedia = payload.match(/slides fallback media ([^\\s"]+\\.pdf)/)?.[1];
      const text = payload.includes("Repeat the prior summary") && payload.includes("Prior summary about product planning")
        ? "context preserved"
        : payload.includes("Messages received while the agent was already working")
        ? "queued steering reply"
        : payload.includes("slow first")
        ? "slow first reply"
        : payload.includes("Repeat the prior summary")
        ? "context missing"
        : payload.includes("send a product photo")
        ? ${JSON.stringify("Here is the photo.\n\n```clawjs-telegram-actions\n{\"actions\":[{\"type\":\"send_message\",\"mediaType\":\"photo\",\"media\":\"https://example.local/product.png\",\"text\":\"Product preview\"}]}\n```")}
        : slidesFallbackMedia
        ? ${JSON.stringify("PDF adjunto.\n\n```clawjs-telegram-actions\n")} + JSON.stringify({ actions: [{ type: "send_message", mediaType: "document", media: slidesFallbackMedia, text: "Deck PDF" }] }) + ${JSON.stringify("\n```")}
        : payload.includes("follow up")
        ? "follow up reply"
        : payload.includes("Voice note transcript:")
        ? "voice-aware reply"
        : payload.includes("long")
        ? "x".repeat(8200)
        : payload.includes("fresh topic")
        ? "fresh reply"
        : "codex reply";
      const finish = () => {
        process.stdout.write(JSON.stringify({ method: "codex/event", params: { msg: { type: "agent_message", message: text } } }) + "\\n");
        process.stdout.write(JSON.stringify({ method: "turn/completed", params: {} }) + "\\n");
      };
      if (payload.includes("slow first")) setTimeout(finish, 1200);
      else finish();
    }
  });
  return;
}
if (args[0] === "exec") {
  process.stdout.write(JSON.stringify({ type: "agent_message", message: "codex reply" }) + "\\n");
  process.exit(0);
}
process.exit(1);
`, { mode: 0o755 });
  return binaryPath;
}

let nextTelegramMessageId = 10;

function telegramEvent(input: {
  chatId: string;
  chatType: "private" | "group" | "supergroup";
  senderId: string;
  text: string;
  messageId?: number;
  threadId?: number;
  replyToBot?: boolean;
  voiceNoteId?: string;
}) {
  const messageId = input.messageId ?? nextTelegramMessageId++;
  return {
    type: "channel.message.received",
    provider: "telegram",
    accountId: "test-account",
    targetId: input.chatId,
    message: {
      text: input.text,
      targetId: input.chatId,
      providerMessageId: String(messageId),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      senderId: input.senderId,
      senderLabel: `user-${input.senderId}`,
      ...(input.voiceNoteId ? { metadata: { voiceNoteId: input.voiceNoteId } } : {}),
      raw: {
        message: {
          message_id: messageId,
          ...(input.threadId ? { message_thread_id: input.threadId } : {}),
          chat: { id: Number(input.chatId), type: input.chatType, is_forum: input.chatType === "supergroup" },
          from: { id: Number(input.senderId), first_name: `User ${input.senderId}` },
          text: input.text,
          ...(input.replyToBot ? { reply_to_message: { from: { id: 123, is_bot: true, username: "ClawCodexBot" } } } : {}),
        },
      },
    },
  };
}

async function runClawJson(rootDir: string, args: string[], input: {
  workspacePath: string;
  codexHome: string;
  runtimeWorkspace: string;
  libraryDir?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const child = spawn(process.execPath, [
    path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs"),
    ...args,
    "--runtime",
    "codex",
    "--workspace",
    input.workspacePath,
    "--runtime-workspace",
    input.runtimeWorkspace,
    "--home-dir",
    input.codexHome,
    ...(input.libraryDir ? ["--library-dir", input.libraryDir] : []),
    "--json",
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(input.env ?? {}),
      PATH: `${path.join(path.dirname(input.codexHome), "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
      CI: "1",
    },
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  if (exitCode !== 0) {
    throw new Error(`claw exited ${exitCode}: ${Buffer.concat(stderr).toString("utf8")}`);
  }
  return JSON.parse(Buffer.concat(stdout).toString("utf8")) as unknown;
}

function writeFakeTelegramSecretsProxy(rootDir: string): { proxyPath: string; statePath: string } {
  const proxyPath = path.join(rootDir, "telegram-secrets-proxy.cjs");
  const statePath = path.join(rootDir, "telegram-proxy-state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    commands: [],
    updates: [],
    webhookUrl: "",
  }, null, 2));
  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
function flag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
const statePath = process.env.FAKE_TELEGRAM_PROXY_STATE;
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
if (args[0] === "list-secrets" || args[0] === "describe-secret") {
  process.stdout.write(JSON.stringify([{ name: "test_telegram_bot_token", allowedHosts: ["api.telegram.org"], allowedHeaderNames: [], allowInURL: true }]));
  process.exit(0);
}
const body = JSON.parse(flag("--body") || "{}");
const url = flag("--url") || "";
const method = url.split("/").pop();
let result;
switch (method) {
  case "getMe":
    result = { id: 42, is_bot: true, username: "test_codex_bot", first_name: "Test Codex" };
    break;
  case "setMyCommands":
    state.commands = Array.isArray(body.commands) ? body.commands : [];
    result = true;
    break;
  case "getMyCommands":
    result = state.commands || [];
    break;
  case "getUpdates": {
    const offset = typeof body.offset === "number" ? body.offset : 0;
    const updates = (state.updates || []).filter((entry) => entry.update_id >= offset);
    state.updates = (state.updates || []).filter((entry) => !updates.some((selected) => selected.update_id === entry.update_id));
    result = updates;
    break;
  }
  case "getWebhookInfo":
    result = { url: state.webhookUrl || "", pending_update_count: 0 };
    break;
  case "deleteWebhook":
    state.webhookUrl = "";
    result = true;
    break;
  case "sendMessage":
    state.lastSend = body;
    result = { message_id: 99, chat: { id: body.chat_id, type: "private" }, text: body.text };
    break;
  default:
    result = true;
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

test("telegram codex bridge injects default and assigned skill capsules in order", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-capsules-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const libraryDir = path.join(tempRoot, "library");
  const statePath = path.join(tempRoot, "state", "bridge.json");
  const jsonSkillDir = path.join(tempRoot, "json-skill");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(jsonSkillDir, { recursive: true });
  writeFakeCodexBinary(tempRoot);

  fs.writeFileSync(path.join(jsonSkillDir, "skill.json"), JSON.stringify({
    id: "json-skill",
    name: "JSON Skill",
    version: "0.1.0",
    context: {
      priority: 5,
      capsule: "JSON capsule wins over frontmatter.",
      readWhen: ["json metadata"],
    },
  }, null, 2));
  fs.writeFileSync(path.join(jsonSkillDir, "SKILL.md"), [
    "---",
    "name: json-skill",
    "description: frontmatter fallback",
    "clawjs-context:",
    "  priority: 1",
    "  capsule: Frontmatter capsule should lose.",
    "---",
    "",
    "# JSON Skill",
  ].join("\n"));

  await runClawJson(rootDir, [
    "library", "import-skill", "json-skill",
    "--id", "json-skill",
    "--path", jsonSkillDir,
  ], { workspacePath, runtimeWorkspace, codexHome, libraryDir });
  await runClawJson(rootDir, [
    "library", "create", "same-b",
    "--kind", "skill",
    "--title", "Same B",
    "--context-capsule", "Same priority B comes first by assignment.",
    "--context-priority", "20",
  ], { workspacePath, runtimeWorkspace, codexHome, libraryDir });
  await runClawJson(rootDir, [
    "library", "create", "same-a",
    "--kind", "skill",
    "--title", "Same A",
    "--context-capsule", "Same priority A comes second by assignment.",
    "--context-priority", "20",
  ], { workspacePath, runtimeWorkspace, codexHome, libraryDir });
  for (const asset of ["same-b", "json-skill", "same-a"]) {
    await runClawJson(rootDir, [
      "library", "assign", asset,
      "--agent", "telegram-codex",
    ], { workspacePath, runtimeWorkspace, codexHome, libraryDir });
  }

  const result = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "hello capsules" }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    libraryDir,
  });
  expect(sendActions(result.actions)[0]).toMatchObject({ type: "send_message", targetId: "501", text: "codex reply" });

  const payloadText = fs.readFileSync(path.join(tempRoot, "codex-payloads.jsonl"), "utf8");
  expect(payloadText).toContain("Applicable Rules");
  expect(payloadText).toContain("ClawJS operating layer");
  expect(payloadText).toContain("Telegram Codex bridge");
  const defaultIndex = payloadText.indexOf("Use ClawJS as the operating layer");
  const jsonIndex = payloadText.indexOf("JSON capsule wins over frontmatter.");
  const frontmatterIndex = payloadText.indexOf("Frontmatter capsule should lose.");
  const sameBIndex = payloadText.indexOf("Same priority B comes first by assignment.");
  const sameAIndex = payloadText.indexOf("Same priority A comes second by assignment.");
  expect(defaultIndex).toBeGreaterThanOrEqual(0);
  expect(jsonIndex).toBeGreaterThan(defaultIndex);
  expect(frontmatterIndex).toBe(-1);
  expect(sameBIndex).toBeGreaterThan(jsonIndex);
  expect(sameAIndex).toBeGreaterThan(sameBIndex);
});

test("telegram codex bridge rerenders fallback slide PDFs before attaching", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-slides-rerender-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const statePath = path.join(tempRoot, "state", "bridge.json");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeFakeCodexBinary(tempRoot);
  const imagePath = path.join(runtimeWorkspace, "assets", "visual.svg");
  writeSyntheticBridgeSlideImage(imagePath);

  const created = await runClawJson(rootDir, ["slides", "create", "Visual Deck", "--theme", "product"], {
    workspacePath: runtimeWorkspace,
    runtimeWorkspace,
    codexHome,
  }) as { deck: { id: string } };
  await runClawJson(rootDir, [
    "slides", "add", created.deck.id,
    "--layout", "image-left",
    "--heading", "Image slide",
    "--body", "This deck should be rerendered outside the Codex sandbox before Telegram receives it.",
    "--image", imagePath,
  ], { workspacePath: runtimeWorkspace, runtimeWorkspace, codexHome });
  const fallbackRender = await runClawJson(rootDir, [
    "slides", "render", created.deck.id,
    "--format", "pdf",
  ], {
    workspacePath: runtimeWorkspace,
    runtimeWorkspace,
    codexHome,
    env: { CLAW_SLIDES_DISABLE_BROWSER: "1" },
  }) as { rendered: Array<{ format: string; path: string; metadata?: { renderer?: string }; sizeBytes: number }> };
  const fallbackPdf = fallbackRender.rendered.find((entry) => entry.format === "pdf");
  expect(fallbackPdf?.metadata?.renderer).toBe("node-fallback");

  const result = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: `slides fallback media ${fallbackPdf!.path}`, messageId: 9901 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  const attached = sendActions(result.actions).find((action) => action.mediaType === "document");
  expect(attached?.media).toBeTruthy();
  expect(attached!.media).not.toBe(fallbackPdf!.path);
  expect(fs.existsSync(attached!.media!)).toBeTruthy();
  expect(fs.statSync(attached!.media!).size).toBeGreaterThan(fallbackPdf!.sizeBytes);
  expect(attached?.metadata?.slidesMediaRerendered).toBeTruthy();
});

test("telegram codex bridge translates .claw aliases into tokenized mobile links", async () => {
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-domains-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const statePath = path.join(tempRoot, "bridge-state.json");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeFakeCodexBinary(tempRoot);

  const env = { CLAW_DOMAIN_SHARE_URL: "https://example.local/claw-share" };
  const alias = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "memory.claw" }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    env,
  });
  const aliasText = sendActions(alias.actions)[0]?.text ?? "";
  expect(aliasText).toContain("memory.claw: https://example.local/claw-share?");
  expect(aliasText).toContain("claw_share_token=");
  expect(aliasText).toContain("claw_surface=memory");

  const open = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "open memory", messageId: 502 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    env,
  });
  const openText = sendActions(open.actions)[0]?.text ?? "";
  expect(openText).toContain("memory.claw: https://example.local/claw-share?");
  expect(openText).not.toContain("localhost");
});

async function runProcessor(rootDir: string, input: {
  event: unknown;
  statePath: string;
  workspacePath: string;
  codexHome: string;
  runtimeWorkspace: string;
  libraryDir?: string;
  replyPolicy?: string;
  botUsername?: string;
  systemPrompt?: string;
  env?: NodeJS.ProcessEnv;
}) {
  const args = [
    path.join(rootDir, "packages", "clawjs", "bin", "claw.mjs"),
    "channels",
    "codex-processor",
    "run",
    "--runtime",
    "codex",
    "--workspace",
    input.workspacePath,
    "--runtime-workspace",
    input.runtimeWorkspace,
    "--home-dir",
    input.codexHome,
    ...(input.libraryDir ? ["--library-dir", input.libraryDir] : []),
    "--bridge-state",
    input.statePath,
    "--reply-policy",
    input.replyPolicy ?? "all",
    "--agent-id",
    "telegram-codex",
    "--bot-username",
    input.botUsername ?? "ClawCodexBot",
    ...(input.systemPrompt ? ["--system-prompt", input.systemPrompt] : []),
  ];
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(input.env ?? {}),
      PATH: `${path.join(path.dirname(input.codexHome), "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
      CI: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(JSON.stringify(input.event));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const exitCode = await new Promise<number | null>((resolve) => child.on("close", resolve));
  if (exitCode !== 0) {
    throw new Error(`processor exited ${exitCode}: ${Buffer.concat(stderr).toString("utf8")}`);
  }
  return (JSON.parse(Buffer.concat(stdout).toString("utf8")) as { data: { actions: ProcessorAction[] } }).data;
}

test("telegram codex bridge owns, authorizes topics, applies reply policy, and splits replies", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-codex-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const statePath = path.join(tempRoot, "state", "bridge.json");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeFakeCodexBinary(tempRoot);

  const dm = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "hello" }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    systemPrompt: "Keep replies short.",
  });
  expect(dm.actions[0]).toMatchObject({ type: "grant_permission", targetId: "501" });
  expect(sendActions(dm.actions)[0]).toMatchObject({ type: "send_message", targetId: "501", text: "codex reply" });
  const bootstrappedState = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  expect(bootstrappedState.ownerUserId).toBe("501");
  expect(bootstrappedState.authorizedTargets.some((target) => target.targetId === "501")).toBeTruthy();

  const resetSeed = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "777", chatType: "private", senderId: "777", text: "old topic", messageId: 7701 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(resetSeed.actions)[0]).toMatchObject({ type: "send_message", targetId: "777", text: "codex reply" });
  const beforeResetState = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  const oldResetSessionId = beforeResetState.sessions["telegram:test-account:777:chat"];
  expect(typeof oldResetSessionId).toBe("string");
  const resetCommand = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "777", chatType: "private", senderId: "777", text: "/new fresh topic", messageId: 7702 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    replyPolicy: "commands",
  });
  expect(sendActions(resetCommand.actions)[0]).toMatchObject({ type: "send_message", targetId: "777", text: "fresh reply" });
  const afterResetState = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  const newResetSessionId = afterResetState.sessions["telegram:test-account:777:chat"];
  expect(newResetSessionId).not.toBe(oldResetSessionId);
  const oldResetSession = await runClawJson(rootDir, ["sessions", "read", "--session-id", oldResetSessionId], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string }> };
  expect(oldResetSession.messages.map((message) => message.content)).toEqual(["old topic", "codex reply"]);
  const newResetSession = await runClawJson(rootDir, ["sessions", "read", "--session-id", newResetSessionId], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string }> };
  expect(newResetSession.messages.map((message) => message.content)).toEqual(["fresh topic", "fresh reply"]);

  const bareNewCommand = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "888", chatType: "private", senderId: "888", text: "/new", messageId: 8801 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    replyPolicy: "commands",
  });
  expect(sendActions(bareNewCommand.actions)[0]).toMatchObject({ type: "send_message", targetId: "888", text: "codex reply" });
  const afterBareNewState = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  const bareNewSessionId = afterBareNewState.sessions["telegram:test-account:888:chat"];
  const bareNewSession = await runClawJson(rootDir, ["sessions", "read", "--session-id", bareNewSessionId], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string }> };
  expect(bareNewSession.messages.map((message) => message.content)).toEqual(["codex reply"]);

  const rejectedGroup = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-1001", chatType: "supergroup", senderId: "999", text: "activate?", threadId: 77 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(rejectedGroup.actions[0]).toMatchObject({ type: "ignore", reason: "target not authorized by owner" });

  const ownerTopic = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-1001", chatType: "supergroup", senderId: "501", text: "enable this topic", threadId: 77 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(ownerTopic.actions[0]).toMatchObject({ type: "grant_permission", targetId: "-1001" });
  expect(sendActions(ownerTopic.actions)[0]).toMatchObject({ type: "send_message", targetId: "-1001", threadId: 77 });
  const authorizedState = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  expect(authorizedState.authorizedTargets.some((target) => target.targetId === "-1001" && target.threadId === 77)).toBeTruthy();

  const authorizedNonOwner = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-1001", chatType: "supergroup", senderId: "999", text: "now respond", threadId: 77 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(authorizedNonOwner.actions)[0]).toMatchObject({ type: "send_message", targetId: "-1001", threadId: 77 });

  appendChannelMessages(workspacePath, [
    {
      id: "telegram:test-account:update:780",
      targetId: "-2002",
      direction: "inbound",
      text: "hello group",
      providerMessageId: "780",
      senderId: "501",
    },
  ]);
  const preSyncedGroup = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-2002", chatType: "group", senderId: "501", text: "hello group", messageId: 780 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(preSyncedGroup.actions[0]).toMatchObject({ type: "grant_permission", targetId: "-2002" });
  expect(sendActions(preSyncedGroup.actions)[0]).toMatchObject({ type: "send_message", targetId: "-2002", text: "codex reply" });
  appendChannelMessages(workspacePath, [
    {
      id: "telegram:test-account:message:781",
      targetId: "-2002",
      direction: "outbound",
      text: "codex reply",
      providerMessageId: "781",
    },
  ]);
  const groupFollowUp = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-2002", chatType: "group", senderId: "501", text: "follow up", messageId: 782 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(groupFollowUp.actions)[0]).toMatchObject({ type: "send_message", targetId: "-2002", text: "follow up reply" });
  const preSyncedState = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  const preSyncedSessionId = preSyncedState.sessions["telegram:test-account:-2002:chat"];
  const preSyncedSession = await runClawJson(rootDir, ["sessions", "read", "--session-id", preSyncedSessionId], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string }> };
  expect(preSyncedSession.messages.map((message) => message.content)).toEqual(["hello group", "codex reply", "follow up", "follow up reply"]);

  const voiceNote = await runProcessor(rootDir, {
    event: telegramEvent({
      chatId: "501",
      chatType: "private",
      senderId: "501",
      text: "quiero que me digas la transcripción exacta de lo que estás ahora mismo escuchando",
      voiceNoteId: "voice-note-1",
    }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(voiceNote.actions)[0]).toMatchObject({ type: "send_message", targetId: "501", text: "voice-aware reply" });

  const photoReply = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "send a product photo", messageId: 5020 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  const photoActions = sendActions(photoReply.actions);
  expect(photoActions).toHaveLength(2);
  expect(photoActions[0]).toMatchObject({ type: "send_message", targetId: "501", text: "Here is the photo." });
  expect(photoActions[1]).toMatchObject({
    type: "send_message",
    targetId: "501",
    mediaType: "photo",
    media: "https://example.local/product.png",
    text: "Product preview",
  });

  const customSystemPromptPhotoReply = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "send a product photo", messageId: 5021 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    systemPrompt: "Keep replies short.",
  });
  expect(sendActions(customSystemPromptPhotoReply.actions).some((action) => action.mediaType === "photo")).toBeTruthy();
  const codexPayloads = fs.readFileSync(path.join(tempRoot, "codex-payloads.jsonl"), "utf8").trim().split("\n");
  const lastCodexPayload = codexPayloads[codexPayloads.length - 1] ?? "";
  expect(lastCodexPayload).toContain("Keep replies short.");
  expect(lastCodexPayload).toContain("Telegram delivery supports photos");

  appendChannelMessages(workspacePath, [
    {
      id: "telegram:test-account:message:300",
      targetId: "501",
      direction: "outbound",
      text: "Prior summary about product planning",
      providerMessageId: "300",
    },
  ]);
  const contextualReply = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "Repeat the prior summary", messageId: 5010 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(contextualReply.actions)[0]).toMatchObject({ type: "send_message", targetId: "501", text: "context preserved" });
  const stateWithCentralSession = JSON.parse(fs.readFileSync(statePath, "utf8")) as BridgeState;
  const dmSessionId = stateWithCentralSession.sessions["telegram:test-account:501:chat"];
  const dmSession = await runClawJson(rootDir, ["sessions", "read", "--session-id", dmSessionId], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }> };
  expect(dmSession.messages.some((message) => message.role === "assistant" && message.content.includes("Prior summary about product planning"))).toBeTruthy();
  expect(dmSession.messages.some((message) => message.role === "user" && message.content.includes("Repeat the prior summary"))).toBeTruthy();

  const beforeDuplicateCount = dmSession.messages.length;
  const duplicateReply = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "501", chatType: "private", senderId: "501", text: "Repeat the prior summary", messageId: 5010 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(duplicateReply.actions[0]).toMatchObject({ type: "ignore", reason: "duplicate message" });
  const afterDuplicateSession = await runClawJson(rootDir, ["sessions", "read", "--session-id", dmSessionId], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string }> };
  expect(afterDuplicateSession.messages).toHaveLength(beforeDuplicateCount);

  const ignoredByPolicy = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-1001", chatType: "supergroup", senderId: "999", text: "plain text", threadId: 77 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    replyPolicy: "commands",
  });
  expect(ignoredByPolicy.actions[0]).toMatchObject({ type: "ignore", reason: "reply policy did not match" });

  const commandWithLongReply = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "-1001", chatType: "supergroup", senderId: "999", text: "/codex long", threadId: 77 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
    replyPolicy: "commands",
  });
  const longReplyChunks = sendActions(commandWithLongReply.actions);
  expect(longReplyChunks).toHaveLength(3);
  expect(longReplyChunks.every((action) => (action.text?.length ?? 0) <= 3900)).toBeTruthy();
});

test("telegram codex bridge orchestrates queued steering, operational commands, stop, and compaction", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-runs-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  const statePath = path.join(tempRoot, "state", "bridge.json");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeFakeCodexBinary(tempRoot);

  const firstRun = runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "slow first", messageId: 6101 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const queued = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "please adjust this", messageId: 6102 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(queued.actions[0]).toMatchObject({ type: "ignore", reason: "queued while run is active" });
  const firstResult = await firstRun;
  expect(sendActions(firstResult.actions).map((action) => action.text)).toEqual(["slow first reply", "queued steering reply"]);

  const status = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "/status", messageId: 6103 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(status.actions)[0]?.text).toContain("Status: idle");
  expect(sendActions(status.actions)[0]?.text).toContain("Queue: 0");

  const queue = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "/queue", messageId: 6104 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(queue.actions)[0]).toMatchObject({ text: "Queue is empty." });

  const debug = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "/debug", messageId: 6105 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(debug.actions)[0]?.text).toContain("status=idle");

  const compact = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "/compact", messageId: 6106 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(compact.actions)[0]?.text).toContain("Earlier conversation summary:");
  const summary = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "610", chatType: "private", senderId: "610", text: "/summary", messageId: 6107 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(summary.actions)[0]?.text).toContain("slow first");

  const stopRun = runProcessor(rootDir, {
    event: telegramEvent({ chatId: "611", chatType: "private", senderId: "610", text: "slow first", messageId: 6111 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const stop = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "611", chatType: "private", senderId: "610", text: "/stop", messageId: 6112 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(stop.actions)[0]).toMatchObject({ text: "Stop requested." });
  const stoppedResult = await stopRun;
  expect(sendActions(stoppedResult.actions)).toHaveLength(0);
  expect(stoppedResult.actions[0]).toMatchObject({ type: "ignore" });

  const afterContinue = await runProcessor(rootDir, {
    event: telegramEvent({ chatId: "611", chatType: "private", senderId: "610", text: "/continue", messageId: 6113 }),
    statePath,
    workspacePath,
    runtimeWorkspace,
    codexHome,
  });
  expect(sendActions(afterContinue.actions)[0]).toMatchObject({ text: "Queue is empty." });
});

test("channel CLI assigns Telegram to Codex and controls the listener", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-codex-cli-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeFakeCodexBinary(tempRoot);
  const { proxyPath, statePath } = writeFakeTelegramSecretsProxy(tempRoot);
  const env = {
    CLAW_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  };
  const base = { workspacePath, runtimeWorkspace, codexHome, env };

  const agentSetup = await runClawJson(rootDir, [
    "agents",
    "codex",
    "setup",
  ], base) as { processor: { id: string }; runtime: string };
  expect(agentSetup.processor.id).toBe("codex");
  expect(agentSetup.runtime).toBe("codex");

  const channelSetup = await runClawJson(rootDir, [
    "channels",
    "telegram",
    "setup",
    "--account",
    "test-account",
    "--secret-name",
    "test_telegram_bot_token",
  ], base) as { id: string; status: string };
  expect(channelSetup.id).toBe("telegram:test-account");
  expect(channelSetup.status).toBe("connected");

  const stale = await runClawJson(rootDir, [
    "channels",
    "commands",
    "set",
    "--channel",
    "telegram",
    "--account",
    "test-account",
    "--commands",
    "[{\"command\":\"codex\",\"description\":\"Send a prompt to Codex\"}]",
  ], base) as Array<{ command: string }>;
  expect(stale.map((command) => command.command)).toEqual(["codex"]);

  const assignment = await runClawJson(rootDir, [
    "channels",
    "assign",
    "--channel",
    "telegram",
    "--account",
    "test-account",
    "--agent",
    "codex",
  ], base) as { assignment: { agentId: string; metadata: { processorId: string } } };
  expect(assignment.assignment.agentId).toBe("codex");
  expect(assignment.assignment.metadata.processorId).toBe("codex");

  const assignments = await runClawJson(rootDir, [
    "channels",
    "assignments",
    "status",
    "--channel",
    "telegram",
    "--account",
    "test-account",
  ], base) as Array<{ agentId: string; processorId: string; processorRegistered: boolean }>;
  expect(Array.isArray(assignments)).toBe(true);
  expect(assignments[0]).toMatchObject({ agentId: "codex", processorId: "codex", processorRegistered: true });

  const aliasSetup = await runClawJson(rootDir, [
    "channels",
    "telegram",
    "codex",
    "setup",
    "--account",
    "test-account",
  ], base) as { processor: { id: string }; status: { commandsSynced: boolean } };
  expect(aliasSetup.processor.id).toBe("codex");
  expect(aliasSetup.status.commandsSynced).toBe(true);

  const commands = await runClawJson(rootDir, [
    "channels",
    "telegram",
    "codex",
    "commands",
    "sync",
    "--account",
    "test-account",
  ], base) as Array<{ command: string }>;
  expect(commands.some((command) => command.command === "status")).toBe(true);
  expect(commands.some((command) => command.command === "codex")).toBe(false);

  const proxyState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { updates?: unknown[]; lastSend?: { text?: string } };
  proxyState.updates = [{
    update_id: 101,
    message: {
      message_id: 201,
      text: "hello through assignment",
      chat: { id: 1001, type: "private", first_name: "Ada" },
      from: { id: 1001, first_name: "Ada" },
    },
  }];
  fs.writeFileSync(statePath, JSON.stringify(proxyState, null, 2));

  const started = await runClawJson(rootDir, [
    "channels",
    "listen",
    "start",
    "--channel",
    "telegram",
    "--account",
    "test-account",
    "--background",
    "--interval-ms",
    "200",
    "--timeout",
    "0",
    "--processor-timeout-ms",
    "5000",
  ], base) as { status: string; pid: number };
  expect(started.status).toBe("running");
  expect(started.pid).toBeGreaterThan(0);

  const startedAgain = await runClawJson(rootDir, [
    "channels",
    "listen",
    "start",
    "--channel",
    "telegram",
    "--account",
    "test-account",
    "--background",
  ], base) as { status: string; pid: number };
  expect(startedAgain.status).toBe("running");
  expect(startedAgain.pid).toBe(started.pid);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const afterPoll = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string } };
  expect(afterPoll.lastSend?.text).toBe("codex reply");

  const status = await runClawJson(rootDir, [
    "channels",
    "listen",
    "status",
    "--channel",
    "telegram",
    "--account",
    "test-account",
  ], base) as { status: string; processorId?: string };
  expect(status.status).toBe("running");

  const logs = await runClawJson(rootDir, [
    "channels",
    "listen",
    "logs",
    "--channel",
    "telegram",
    "--account",
    "test-account",
    "--lines",
    "20",
  ], base) as { log: string };
  expect(logs.log).toContain("listener started");

  const stopped = await runClawJson(rootDir, [
    "channels",
    "listen",
    "stop",
    "--channel",
    "telegram",
    "--account",
    "test-account",
  ], base) as { status: string };
  expect(stopped.status).toBe("stopped");

  const unassigned = await runClawJson(rootDir, [
    "channels",
    "unassign",
    "--channel",
    "telegram",
    "--account",
    "test-account",
    "--agent",
    "codex",
  ], base) as { removed: number };
  expect(unassigned.removed).toBe(1);
});

test("inference with a session id persists user and assistant messages", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-inference-session-"));
  const workspacePath = path.join(tempRoot, "workspace");
  const runtimeWorkspace = path.join(tempRoot, "runtime-workspace");
  const codexHome = path.join(tempRoot, "codex-home");
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(runtimeWorkspace, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeFakeCodexBinary(tempRoot);

  const generated = await runClawJson(rootDir, [
    "inference",
    "generate-text",
    "--session-id",
    "central-session",
    "--prompt",
    "remember this session detail",
  ], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { text: string };
  expect(generated.text).toBe("codex reply");

  const session = await runClawJson(rootDir, ["sessions", "read", "--session-id", "central-session"], {
    workspacePath,
    runtimeWorkspace,
    codexHome,
  }) as { messages: Array<{ role: string; content: string }> };
  expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  expect(session.messages[0]?.content).toBe("remember this session detail");
  expect(session.messages[1]?.content).toBe("codex reply");
});

test("vault sidecar resolves telegram bot token placeholders without exposing plaintext metadata", async () => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const vault = await startHermeticVault("clawjs-telegram-vault");
  const upstream = await startHermeticUpstream();
  try {
    const session = await loginToVault(vault.baseUrl);
    const upstreamHost = new URL(upstream.baseUrl).host;
    const create = await fetch(`${vault.baseUrl}/v1/tenants/demo-tenant/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secretName: "test_telegram_bot_token",
        secretValue: "test-token-placeholder",
        typeId: "telegram.bot_token",
        allowedHosts: [upstreamHost],
        allowedHeaderNames: ["Authorization"],
        allowInURL: true,
        allowLocalNetwork: true,
      }),
    });
    expect(create.status).toBe(201);

    const principalResponse = await fetch(`${vault.baseUrl}/v1/tenants/demo-tenant/principals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "sidecar_principal", label: "telegram-codex-sidecar" }),
    });
    expect(principalResponse.status).toBe(201);
    const principalPayload = await principalResponse.json() as { principal: { id: string; token: string } };
    for (const capability of ["metadata.read", "broker.http"]) {
      const policy = await fetch(`${vault.baseUrl}/v1/tenants/demo-tenant/policies`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectType: "sidecar_principal",
          subjectId: principalPayload.principal.id,
          secretName: "test_telegram_bot_token",
          capability,
          effect: "allow",
        }),
      });
      expect(policy.status).toBe(201);
    }

    const env = {
      ...process.env,
      VAULT_BASE_URL: vault.baseUrl,
      VAULT_TOKEN: principalPayload.principal.token,
      VAULT_TENANT_ID: "demo-tenant",
    };
    delete env.FORCE_COLOR;
    const sidecarPath = path.join(rootDir, "vault", "dist", "sidecar.js");
    const request = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
      const child = spawn(process.execPath, [
        sidecarPath,
        "request",
        "--method",
        "GET",
        "--url",
        `${upstream.baseUrl}/echo?token={{test_telegram_bot_token}}`,
        "--header",
        "Authorization: Bearer {{test_telegram_bot_token}}",
      ], { env });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
      child.on("close", (exitCode) => resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        exitCode,
      }));
    });
    expect(request.stderr).toBe("");
    expect(request.exitCode).toBe(0);
    const payload = JSON.parse(request.stdout) as { authorization: string; queryToken: string };
    expect(payload.authorization).toBe("Bearer test-token-placeholder");
    expect(payload.queryToken).toBe("test-token-placeholder");

    const describe = await new Promise<{ stdout: string; exitCode: number | null }>((resolve) => {
      const child = spawn(process.execPath, [sidecarPath, "describe-secret", "--name", "test_telegram_bot_token"], { env });
      const stdout: Buffer[] = [];
      child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
      child.on("close", (exitCode) => resolve({ stdout: Buffer.concat(stdout).toString("utf8"), exitCode }));
    });
    expect(describe.exitCode).toBe(0);
    expect(describe.stdout).toContain("test_telegram_bot_token");
    expect(describe.stdout).not.toContain("test-token-placeholder");
  } finally {
    await upstream.close();
    await vault.close();
  }
});
