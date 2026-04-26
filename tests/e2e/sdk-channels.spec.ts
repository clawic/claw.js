import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { expect, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function createFakeTelegramProxy(rootDir: string): { proxyPath: string; statePath: string } {
  const proxyPath = path.join(rootDir, "secrets-proxy");
  const statePath = path.join(rootDir, "telegram-state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    commands: [],
    updates: [{
      update_id: 31,
      message: {
        message_id: 41,
        message_thread_id: 77,
        text: "hello from telegram topic",
        chat: {
          id: -1001,
          type: "supergroup",
          title: "Launch Group",
          is_forum: true,
        },
        from: {
          id: 501,
          first_name: "Alice",
          username: "alice",
        },
      },
    }],
    lastSend: null,
  }, null, 2));
  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
const statePath = process.env.FAKE_TELEGRAM_PROXY_STATE;
const secrets = [
  {
    name: "telegram_support_bot_token",
    allowedHosts: ["api.telegram.org"],
    allowedHeaderNames: [],
    readOnly: false,
    allowInURL: true,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false
  },
  {
    name: "telegram_ops_bot_token",
    allowedHosts: ["api.telegram.org"],
    allowedHeaderNames: [],
    readOnly: false,
    allowInURL: true,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false
  }
];
if (args[0] === "list-secrets") {
  process.stdout.write(JSON.stringify(secrets));
  process.exit(0);
}
if (args[0] === "describe-secret") {
  const name = readFlag("--name");
  process.stdout.write(JSON.stringify(secrets.filter((entry) => entry.name === name)));
  process.exit(0);
}
const url = readFlag("--url") || "";
const body = JSON.parse(readFlag("--body") || "{}");
const method = url.split("/").pop();
const tokenMatch = url.match(/\\/bot([^/]+)\\//);
const token = tokenMatch ? tokenMatch[1] : "";
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
let result;
switch (method) {
  case "getMe":
    result = { id: 42, is_bot: true, username: "claw_support_bot", first_name: "Claw Support", can_join_groups: true };
    break;
  case "getWebhookInfo":
    result = { url: state.webhookUrl || "", pending_update_count: state.updates.length };
    break;
  case "setWebhook":
    state.webhookUrl = body.url || "";
    result = true;
    break;
  case "getUpdates": {
    const offset = typeof body.offset === "number" ? body.offset : 0;
    const updates = state.updates.filter((entry) => entry.update_id >= offset);
    result = typeof body.limit === "number" ? updates.slice(0, body.limit) : updates;
    state.updates = state.updates.filter((entry) => !result.some((selected) => selected.update_id === entry.update_id));
    break;
  }
  case "sendMessage":
    state.lastSend = body;
    state.lastSendToken = token;
    result = { message_id: 91, chat: { id: body.chat_id, type: "supergroup" }, text: body.text };
    break;
  case "sendDocument":
    state.lastMediaSend = body;
    state.lastSendToken = token;
    result = { message_id: 92, chat: { id: body.chat_id, type: "supergroup" }, document: { file_id: body.document } };
    break;
  case "setMyCommands":
    state.commands = body.commands || [];
    result = true;
    break;
  case "getMyCommands":
    result = state.commands || [];
    break;
  default:
    result = true;
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

test("sdk channels manages Telegram accounts, permissions, topics, and messages hermetically", async ({ page }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-channels-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const { proxyPath, statePath } = createFakeTelegramProxy(tempRoot);
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;

  const script = `
const { Claw } = await import(${JSON.stringify(moduleUrl)});
const fs = await import("node:fs");

const claw = await Claw({
  runtime: {
    adapter: "demo",
    env: {
      ...process.env,
      CLAWJS_SECRETS_PROXY_PATH: ${JSON.stringify(proxyPath)},
      FAKE_TELEGRAM_PROXY_STATE: ${JSON.stringify(statePath)},
    },
  },
  workspace: {
    appId: "demo",
    workspaceId: "channels-e2e",
    agentId: "owner",
    rootDir: ${JSON.stringify(workspaceDir)},
  },
});

await claw.channels.accounts.registerTelegramBot({
  accountId: "support",
  secretName: "telegram_support_bot_token",
  label: "Support Telegram",
});
await claw.channels.accounts.registerTelegramBot({
  accountId: "ops",
  secretName: "telegram_ops_bot_token",
  label: "Ops Telegram",
});
claw.channels.bindings.grant({
  agentId: "support-agent",
  provider: "telegram",
  accountId: "support",
  targetId: "-1001",
  permissions: ["read", "write", "ingest"],
});

const synced = await claw.channels.messages.sync({ accountId: "support", limit: 10 });
const sent = await claw.channels.messages.send({
  provider: "telegram",
  accountId: "support",
  targetId: "-1001",
  text: "**topic** reply with [docs](https://example.com) and \`code\`",
  threadId: 77,
  agentId: "support-agent",
});
const sentMedia = await claw.channels.messages.send({
  provider: "telegram",
  accountId: "support",
  targetId: "-1001",
  text: "Spec sheet",
  mediaType: "document",
  media: "https://example.local/spec.pdf",
  threadId: 77,
  agentId: "support-agent",
});
await claw.channels.commands.set("telegram", [{ command: "start", description: "Start" }], { accountId: "support" });

const accounts = claw.channels.accounts.list("telegram");
const targets = claw.channels.targets.list({ provider: "telegram", accountId: "support" });
const groupTarget = targets.find((target) => target.kind === "supergroup");
const topicTarget = targets.find((target) => target.kind === "topic" && target.threadId === "77");
const allowedMessages = claw.channels.messages.read({
  agentId: "support-agent",
  provider: "telegram",
  accountId: "support",
  targetId: "-1001",
});
const deniedMessages = claw.channels.messages.read({
  agentId: "blocked-agent",
  provider: "telegram",
  accountId: "support",
  targetId: "-1001",
});
const commands = await claw.channels.commands.get("telegram", { accountId: "support" });
const proxyState = JSON.parse(fs.readFileSync(${JSON.stringify(statePath)}, "utf8"));

process.stdout.write(JSON.stringify({
  accountIds: accounts.map((account) => account.id).sort(),
  targetIds: targets.map((target) => target.id).sort(),
  groupTarget,
  topicTarget,
  syncedText: synced[0]?.text,
  syncedSender: synced[0]?.senderLabel,
  sentThreadId: sent.threadId,
  sentMediaThreadId: sentMedia.threadId,
  allowedCount: allowedMessages.length,
  deniedCount: deniedMessages.length,
  commands,
  lastThreadId: proxyState.lastSend?.message_thread_id,
  lastParseMode: proxyState.lastSend?.parse_mode,
  lastText: proxyState.lastSend?.text,
  lastMediaThreadId: proxyState.lastMediaSend?.message_thread_id,
  lastMediaDocument: proxyState.lastMediaSend?.document,
  lastMediaCaption: proxyState.lastMediaSend?.caption,
}, null, 2));
`;

  try {
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: rootDir,
      env: {
        ...process.env,
        CI: "1",
      },
      maxBuffer: 10 * 1024 * 1024,
    });

    const payload = JSON.parse(stdout) as {
      accountIds: string[];
      targetIds: string[];
      groupTarget?: { id: string; kind: string };
      topicTarget?: { id: string; kind: string; parentTargetId?: string; threadId?: string };
      syncedText: string;
      syncedSender?: string;
      sentThreadId: string;
      sentMediaThreadId: string;
      allowedCount: number;
      deniedCount: number;
      commands: Array<{ command: string; description: string }>;
      lastThreadId: number;
      lastParseMode?: string;
      lastText?: string;
      lastMediaThreadId?: number;
      lastMediaDocument?: string;
      lastMediaCaption?: string;
    };

    expect(payload.accountIds).toEqual(["telegram:ops", "telegram:support"]);
    expect(payload.groupTarget?.id).toBe("telegram:support:-1001");
    expect(payload.topicTarget?.id).toBe("telegram:support:-1001:topic:77");
    expect(payload.topicTarget?.parentTargetId).toBe("-1001");
    expect(payload.targetIds.some((id) => id.includes("-1001:topic:77"))).toBeTruthy();
    expect(payload.syncedText).toBe("hello from telegram topic");
    expect(payload.syncedSender).toBe("alice");
    expect(payload.sentThreadId).toBe("77");
    expect(payload.sentMediaThreadId).toBe("77");
    expect(payload.allowedCount).toBeGreaterThanOrEqual(2);
    expect(payload.deniedCount).toBe(0);
    expect(payload.commands[0]?.command).toBe("start");
    expect(payload.lastThreadId).toBe(77);
    expect(payload.lastParseMode).toBe("HTML");
    expect(payload.lastText).toContain("<b>topic</b>");
    expect(payload.lastText).toContain('<a href="https://example.com">docs</a>');
    expect(payload.lastText).toContain("<code>code</code>");
    expect(payload.lastMediaThreadId).toBe(77);
    expect(payload.lastMediaDocument).toBe("https://example.local/spec.pdf");
    expect(payload.lastMediaCaption).toBe("Spec sheet");

    const processorPath = path.join(tempRoot, "processor.cjs");
    fs.writeFileSync(processorPath, `
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  const write = () => process.stdout.write(JSON.stringify({ actions: [{ type: "send_message", targetId: event.targetId, text: "background reply: " + event.message.text, threadId: event.message.threadId }] }));
  if (event.message.text.includes("slow")) setTimeout(write, 700);
  else write();
});
`);
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as { updates: unknown[]; lastSend?: { text?: string } };
    state.updates.push({
      update_id: 44,
      message: {
        message_id: 45,
        message_thread_id: 77,
        text: "background hello",
        chat: {
          id: -1001,
          type: "supergroup",
          title: "Launch Group",
          is_forum: true,
        },
      },
    });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const cliPath = path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
    const cliEnv = {
      ...process.env,
      CI: "1",
      CLAWJS_SECRETS_PROXY_PATH: proxyPath,
      FAKE_TELEGRAM_PROXY_STATE: statePath,
    };
    await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "processors",
      "add",
      "--workspace", workspaceDir,
      "--id", "support-router",
      "--command", `${process.execPath} ${processorPath}`,
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });
    await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "permissions",
      "grant",
      "--workspace", workspaceDir,
      "--agent", "support-router",
      "--channel", "telegram",
      "--account", "support",
      "--target-id", "-1001",
      "--permissions", "write",
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });
    const startResult = await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "listen",
      "start",
      "--workspace", workspaceDir,
      "--account", "support",
      "--processor", "support-router",
      "--background",
      "--interval-ms", "100",
      "--timeout", "0",
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });

    let backgroundState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string; message_thread_id?: number } };
    const startedAt = Date.now();
    while (backgroundState.lastSend?.text !== "background reply: background hello" && Date.now() - startedAt < 10_000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      backgroundState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string; message_thread_id?: number } };
    }
    const stopResult = await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "listen",
      "stop",
      "--workspace", workspaceDir,
      "--account", "support",
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });
    const listenerStart = JSON.parse(startResult.stdout) as { status: string; pid?: number };
    const listenerStatus = JSON.parse(stopResult.stdout) as { status: string };
    await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "targets",
      "update",
      "--workspace", workspaceDir,
      "--provider", "telegram",
      "--account", "support",
      "--target-id", "-1001",
      "--thread-id", "77",
      "--instructions", "Route launch-topic messages to support-router.",
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });
    const inspectResult = await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "targets",
      "inspect",
      "--workspace", workspaceDir,
      "--provider", "telegram",
      "--account", "support",
      "--target-id", "-1001",
      "--thread-id", "77",
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });
    const inspectedTarget = JSON.parse(inspectResult.stdout) as { metadata?: { instructions?: string } };

    expect(listenerStart.status).toBe("running");
    expect(backgroundState.lastSend?.text).toBe("background reply: background hello");
    expect(backgroundState.lastSend?.message_thread_id).toBe(77);
    expect(listenerStatus.status).toBe("stopped");

    const slowState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { updates: unknown[]; lastSend?: { text?: string } };
    slowState.updates.push({
      update_id: 45,
      message: {
        message_id: 46,
        text: "slow hello",
        chat: {
          id: -1001,
          type: "supergroup",
          title: "Launch Group",
          is_forum: true,
        },
      },
    });
    fs.writeFileSync(statePath, JSON.stringify(slowState, null, 2));
    await execFileAsync(process.execPath, [
      cliPath,
      "channels",
      "listen",
      "run",
      "--workspace", workspaceDir,
      "--account", "support",
      "--processor", "support-router",
      "--once",
      "--timeout", "0",
      "--processor-timeout-ms", "2000",
      "--json",
    ], { cwd: rootDir, env: cliEnv, maxBuffer: 10 * 1024 * 1024 });
    const afterSlowState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string } };
    expect(afterSlowState.lastSend?.text).toBe("background reply: slow hello");

    expect(inspectedTarget.metadata?.instructions).toBe("Route launch-topic messages to support-router.");

    const visualPayload = {
      ...payload,
      inspectedTarget,
      backgroundListener: {
        startStatus: listenerStart.status,
        stopStatus: listenerStatus.status,
        sentText: backgroundState.lastSend?.text,
        sentThreadId: backgroundState.lastSend?.message_thread_id,
      },
    };

    await page.setViewportSize({ width: 1280, height: 840 });
    await page.setContent(`
      <main style="font-family: Menlo, Monaco, monospace; padding: 32px; min-height: 100vh; background: #f7f7f4; color: #17202a;">
        <section style="max-width: 980px; margin: 0 auto;">
          <h1 style="margin: 0 0 16px; font-size: 30px;">Channels E2E</h1>
          <p style="font-size: 16px; line-height: 1.6;">Telegram accounts, topic targets, agent permissions, inbound sync, outbound send, and commands all resolved through the workspace channel registry.</p>
          <pre style="white-space: pre-wrap; border: 1px solid #d7d7d0; border-radius: 8px; background: white; padding: 18px; font-size: 13px; line-height: 1.5;">${JSON.stringify(visualPayload, null, 2)}</pre>
        </section>
      </main>
    `);
    const screenshotPath = path.join(rootDir, "artifacts", "e2e", "sdk-channels.png");
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
