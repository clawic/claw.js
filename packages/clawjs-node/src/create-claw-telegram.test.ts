import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createClaw } from "./create-claw.ts";
import { createFakeSecretsProxy } from "./create-claw-test-utils.ts";

test("createClaw can connect a Telegram bot and reflect it through telegram state and channels", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-telegram-"));
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAW_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "telegram-main",
      agentId: "telegram-main",
      rootDir: workspaceDir,
    },
  });

  const connected = await claw.telegram.connectBot({
    secretName: "telegram_support_bot_token",
    webhookUrl: "https://example.com/telegram/webhook",
    webhookSecretToken: "telegram_secret_token",
  });
  const channels = await claw.channels.list();
  const inspected = await claw.workspace.inspect();
  const channelsIntent = claw.intent.get("channels") as {
    channels?: Record<string, {
      secretRef?: string;
      enabled?: boolean;
    }>;
  };

  assert.equal(connected.botProfile?.username, "claw_support_bot");
  assert.equal(connected.transport.mode, "webhook");
  assert.equal(channels.some((channel) => channel.id === "telegram" && channel.status === "connected"), true);
  assert.equal(channelsIntent.channels?.telegram?.enabled, true);
  assert.equal(channelsIntent.channels?.telegram?.secretRef, "telegram_support_bot_token");
  assert.equal(inspected.telegramState?.secretName, "telegram_support_bot_token");
  assert.match(fs.readFileSync(inspected.telegramStatePath, "utf8"), /telegram_support_bot_token/);
  assert.doesNotMatch(fs.readFileSync(inspected.telegramStatePath, "utf8"), /123456:ABC/);
});

test("createClaw telegram API supports commands, chat inspection, sending, and update sync", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-telegram-ops-"));
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAW_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "telegram-ops",
      agentId: "telegram-ops",
      rootDir: workspaceDir,
    },
  });

  await claw.telegram.connectBot({
    secretName: "telegram_support_bot_token",
  });
  const commands = await claw.telegram.setCommands([{
    command: "start",
    description: "Start the bot",
  }]);
  const fetchedCommands = await claw.telegram.getCommands();
  await assert.rejects(
    () => claw.telegram.sendMessage({
      chatId: "1001",
      text: "blocked external send",
    }),
    /requires explicit approvalId before external send/,
  );
  await assert.rejects(
    async () => claw.slack.sendMessage({
      channel: "C1001",
      text: "blocked slack send",
    }),
    /requires explicit approvalId before external send/,
  );
  await assert.rejects(
    async () => claw.whatsapp.sendMessage({
      to: "15551234567",
      text: "blocked whatsapp send",
    }),
    /requires explicit approvalId before external send/,
  );
  const sentMessage = await claw.telegram.sendMessage({
    chatId: "1001",
    text: "hello",
    approvalId: "approval_telegram_send_message",
    legalLabel: "Telegram send - human reviewed",
  });
  const sentMedia = await claw.telegram.sendMedia({
    type: "photo",
    chatId: "1001",
    media: "file_123",
    approvalId: "approval_telegram_send_media",
    legalLabel: "Telegram media send - human reviewed",
  });
  const chat = await claw.telegram.getChat("1001");
  const admins = await claw.telegram.getChatAdministrators("1001");
  const member = await claw.telegram.getChatMember("1001", "7");
  const invite = await claw.telegram.createInviteLink("1001");
  const updates = await claw.telegram.startPolling({ limit: 10 }).then(() => claw.telegram.syncUpdates());
  const sessions = claw.sessions.listSessions();

  assert.deepEqual(commands, fetchedCommands);
  assert.equal((sentMessage.chat as { id: string }).id, "1001");
  assert.equal(Array.isArray((sentMedia.photo as unknown[])), true);
  assert.equal(chat.username, "alice");
  assert.equal(admins[0]?.status, "administrator");
  assert.equal(member.userId, "7");
  assert.equal((invite.invite_link as string).includes("https://t.me/+invite"), true);
  assert.equal(updates.length, 0);
  assert.equal(sessions.length >= 1, true);
  assert.equal(await claw.telegram.listChats("alice").then((entries) => entries.length > 0), true);
});

test("createClaw channels registry supports Telegram accounts, bindings, targets, and messages", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-channels-registry-"));
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAW_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "channels-registry",
      agentId: "channels-registry",
      rootDir: workspaceDir,
    },
  });

  const support = await claw.channels.accounts.registerTelegramBot({
    accountId: "support",
    secretName: "telegram_support_bot_token",
    label: "Support Telegram",
  });
  const ops = await claw.channels.accounts.registerTelegramBot({
    accountId: "ops",
    secretName: "telegram_ops_bot_token",
    label: "Ops Telegram",
  });
  const binding = claw.channels.bindings.grant({
    agentId: "support-agent",
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
    permissions: ["read", "write", "ingest"],
    priority: 10,
  });
  const synced = await claw.channels.messages.sync({ accountId: "support", limit: 10 });
  await assert.rejects(
    () => claw.channels.messages.send({
      provider: "telegram",
      accountId: "support",
      targetId: "1001",
      text: "blocked registry send",
      agentId: "support-agent",
    }),
    /requires explicit approvalId before external send/,
  );
  const sent = await claw.channels.messages.send({
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
    text: "reply from registry",
    threadId: 42,
    agentId: "support-agent",
    approvalId: "approval_channels_message_send",
    legalLabel: "Channel message send - human reviewed",
  });
  const deniedMessages = claw.channels.messages.read({
    agentId: "blocked-agent",
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
  });

  const accounts = claw.channels.accounts.list("telegram");
  const targets = claw.channels.targets.list({ provider: "telegram", accountId: "support" });
  const messages = claw.channels.messages.read({
    agentId: "support-agent",
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
  });
  const channels = await claw.channels.list();
  const proxyState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { message_thread_id?: number } };

  assert.equal(support.id, "telegram:support");
  assert.equal(ops.id, "telegram:ops");
  assert.equal(accounts.length, 2);
  assert.equal(binding.id, "support-agent:telegram:support:1001");
  assert.equal(synced[0]?.text, "hello telegram");
  assert.equal(sent.threadId, "42");
  assert.equal(proxyState.lastSend?.message_thread_id, 42);
  assert.equal(deniedMessages.length, 0);
  assert.equal(targets.some((target) => target.targetId === "1001"), true);
  assert.equal(messages.some((message) => message.direction === "inbound"), true);
  assert.equal(messages.some((message) => message.direction === "outbound"), true);
  const outbound = messages.find((message) => message.direction === "outbound") as { metadata?: { policyDecision?: string; policyReasonCodes?: string[]; legalLabel?: string } } | undefined;
  assert.equal(outbound?.metadata?.policyDecision, "allow");
  assert.equal(outbound?.metadata?.legalLabel, "Channel message send - human reviewed");
  assert.equal(outbound?.metadata?.policyReasonCodes?.includes("external_review_required"), true);
  assert.equal(channels.some((channel) => channel.id === "telegram:support" && channel.status === "connected"), true);
  assert.equal(channels.some((channel) => channel.id === "telegram:ops" && channel.status === "connected"), true);
});

test("createClaw channel listener invokes a detached processor action", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-channels-listener-"));
  const processorPath = path.join(workspaceDir, "processor.cjs");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(processorPath, `
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  process.stdout.write(JSON.stringify({
    actions: [{
      type: "send_message",
      text: "auto reply: " + event.message.text,
      targetId: event.targetId
    }]
  }));
});
`);
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAW_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "channels-listener",
      agentId: "channels-listener",
      rootDir: workspaceDir,
    },
  });

  await claw.channels.accounts.registerTelegramBot({
    accountId: "support",
    secretName: "telegram_support_bot_token",
  });
  claw.channels.bindings.grant({
    agentId: "support-router",
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
    permissions: ["write"],
  });
  claw.channels.processors.register({
    id: "support-router",
    command: `${process.execPath} ${processorPath}`,
  });

  const listener = await claw.channels.listen.run({
    accountId: "support",
    processorId: "support-router",
    once: true,
    timeoutSeconds: 0,
  });
  const proxyState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string }; lastSendToken?: string };
  const events = claw.channels.events.list({ accountId: "support", processorId: "support-router" });

  assert.equal(listener.status, "stopped");
  assert.equal(proxyState.lastSend?.text, "auto reply: hello telegram");
  assert.equal(proxyState.lastSendToken, "{{telegram_support_bot_token}}");
  assert.equal(events.some((event) => event.type === "channel.processor.invoked" && event.status === "ok"), true);
});

test("createClaw telegram codex listener refreshes stale command menus", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-telegram-codex-commands-"));
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAW_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "telegram-codex-commands",
      agentId: "telegram-codex-commands",
      rootDir: workspaceDir,
    },
  });

  await claw.channels.accounts.registerTelegramBot({
    accountId: "support",
    secretName: "telegram_support_bot_token",
  });
  await claw.channels.commands.set("telegram", [
    { command: "new", description: "Start a fresh session" },
    { command: "codex", description: "Send a prompt to Codex" },
  ], { accountId: "support" });
  const proxyState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { updates?: unknown[] };
  proxyState.updates = [];
  fs.writeFileSync(statePath, JSON.stringify(proxyState, null, 2));
  claw.channels.processors.register({
    id: "telegram-codex",
    command: `${process.execPath} -e "process.stdin.resume()"`,
  });

  await claw.channels.listen.run({
    accountId: "support",
    processorId: "telegram-codex",
    once: true,
    timeoutSeconds: 0,
  });
  const commands = await claw.channels.commands.get("telegram", { accountId: "support" });

  assert.equal(commands.some((command) => command.command === "status"), true);
  assert.equal(commands.some((command) => command.command === "codex"), false);
});
