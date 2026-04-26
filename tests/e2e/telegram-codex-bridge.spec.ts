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
  const statePath = path.join(workspacePath, ".clawjs", "observed", "channels.json");
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
      const text = payload.includes("Repeat the prior summary") && payload.includes("Prior summary about product planning")
        ? "context preserved"
        : payload.includes("Repeat the prior summary")
        ? "context missing"
        : payload.includes("follow up")
        ? "follow up reply"
        : payload.includes("Voice note transcript:")
        ? "voice-aware reply"
        : payload.includes("long")
        ? "x".repeat(8200)
        : payload.includes("fresh topic")
        ? "fresh reply"
        : "codex reply";
      process.stdout.write(JSON.stringify({ method: "codex/event", params: { msg: { type: "agent_message", message: text } } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "turn/completed", params: {} }) + "\\n");
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
}) {
  const child = spawn(process.execPath, [
    path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs"),
    ...args,
    "--runtime",
    "codex",
    "--workspace",
    input.workspacePath,
    "--runtime-workspace",
    input.runtimeWorkspace,
    "--home-dir",
    input.codexHome,
    "--json",
  ], {
    cwd: rootDir,
    env: {
      ...process.env,
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

async function runProcessor(rootDir: string, input: {
  event: unknown;
  statePath: string;
  workspacePath: string;
  codexHome: string;
  runtimeWorkspace: string;
  replyPolicy?: string;
  botUsername?: string;
}) {
  const args = [
    path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs"),
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
    "--bridge-state",
    input.statePath,
    "--reply-policy",
    input.replyPolicy ?? "all",
    "--agent-id",
    "telegram-codex",
    "--bot-username",
    input.botUsername ?? "ClawCodexBot",
  ];
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: {
      ...process.env,
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
  return JSON.parse(Buffer.concat(stdout).toString("utf8")) as { actions: ProcessorAction[] };
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
