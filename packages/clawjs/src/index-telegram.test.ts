import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { captureStream, createFakeTelegramSecretsProxy, withPatchedEnv } from "./index-test-utils.ts";

test("runCli can connect and inspect telegram state through the CLI", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-telegram-"));
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAW_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const connectStdout = captureStream();
    const connectExitCode = await runCli([
      "telegram",
      "connect",
      "--workspace",
      workspaceRoot,
      "--secret-name",
      "telegram_support_bot_token",
      "--webhook-url",
      "https://example.com/telegram/webhook",
      "--json",
    ], {
      stdout: connectStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const statusStdout = captureStream();
    const statusExitCode = await runCli([
      "telegram",
      "status",
      "--workspace",
      workspaceRoot,
      "--json",
    ], {
      stdout: statusStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(connectExitCode, CLI_EXIT_OK);
    assert.equal(statusExitCode, CLI_EXIT_OK);
    assert.match(connectStdout.getOutput(), /claw_support_bot/);
    assert.match(statusStdout.getOutput(), /"mode": "webhook"/);
  });
});

test("runCli exposes structured channel accounts and permissions", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-channels-"));
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAW_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const addStdout = captureStream();
    const addExitCode = await runCli([
      "channels",
      "accounts",
      "add",
      "telegram",
      "--workspace",
      workspaceRoot,
      "--account",
      "support",
      "--secret-name",
      "telegram_support_bot_token",
      "--json",
    ], {
      stdout: addStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const grantStdout = captureStream();
    const grantExitCode = await runCli([
      "channels",
      "permissions",
      "grant",
      "--workspace",
      workspaceRoot,
      "--agent",
      "support-agent",
      "--channel",
      "telegram",
      "--account",
      "support",
      "--target-id",
      "1001",
      "--permissions",
      "read,write,ingest",
      "--json",
    ], {
      stdout: grantStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const listStdout = captureStream();
    const listExitCode = await runCli([
      "channels",
      "accounts",
      "list",
      "--workspace",
      workspaceRoot,
      "--provider",
      "telegram",
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(addExitCode, CLI_EXIT_OK);
    assert.equal(grantExitCode, CLI_EXIT_OK);
    assert.equal(listExitCode, CLI_EXIT_OK);
    assert.match(addStdout.getOutput(), /"id": "telegram:support"/);
    assert.match(grantStdout.getOutput(), /support-agent:telegram:support:1001/);
    assert.match(listStdout.getOutput(), /telegram:support/);
  });
});

test("runCli rejects invalid channel permission priority before granting", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-channel-priority-"));

  const grantStdout = captureStream();
  const grantExitCode = await runCli([
    "channels",
    "permissions",
    "grant",
    "--workspace",
    workspaceRoot,
    "--agent",
    "support-agent",
    "--channel",
    "telegram",
    "--target-id",
    "1001",
    "--permissions",
    "read",
    "--priority",
    "urgent",
    "--json",
  ], {
    stdout: grantStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const payload = JSON.parse(grantStdout.getOutput()) as { ok: boolean; error: { code: string; details?: { flag?: string; value?: string } } };
  assert.equal(grantExitCode, CLI_EXIT_USAGE);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_channel_priority");
  assert.deepEqual(payload.error.details, { flag: "--priority", value: "urgent" });
});

test("runCli connects Telegram through channels and runs a processor listener once", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-channels-listener-"));
  const processorPath = path.join(workspaceRoot, "processor.cjs");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(processorPath, `
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  process.stdout.write(JSON.stringify({ actions: [{ type: "send_message", targetId: event.targetId, text: "cli reply: " + event.message.text }] }));
});
`);
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAW_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const connectExitCode = await runCli([
      "channels",
      "telegram",
      "connect",
      "--workspace",
      workspaceRoot,
      "--account",
      "support",
      "--secret-name",
      "telegram_support_bot_token",
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const processorExitCode = await runCli([
      "channels",
      "processors",
      "add",
      "--workspace",
      workspaceRoot,
      "--id",
      "support-router",
      "--command",
      `${process.execPath} ${processorPath}`,
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const grantExitCode = await runCli([
      "channels",
      "permissions",
      "grant",
      "--workspace",
      workspaceRoot,
      "--agent",
      "support-router",
      "--channel",
      "telegram",
      "--account",
      "support",
      "--target-id",
      "1001",
      "--permissions",
      "write",
      "--json",
    ], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const listenStdout = captureStream();
    const listenExitCode = await runCli([
      "channels",
      "listen",
      "start",
      "--workspace",
      workspaceRoot,
      "--account",
      "support",
      "--processor",
      "support-router",
      "--once",
      "--timeout",
      "0",
      "--json",
    ], {
      stdout: listenStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    const proxyState = JSON.parse(fs.readFileSync(statePath, "utf8")) as { commands?: Array<{ command: string; description: string }>; lastSend?: { text?: string }; lastSendToken?: string };

    assert.equal(connectExitCode, CLI_EXIT_OK);
    assert.equal(processorExitCode, CLI_EXIT_OK);
    assert.equal(grantExitCode, CLI_EXIT_OK);
    assert.equal(listenExitCode, CLI_EXIT_OK);
    assert.match(listenStdout.getOutput(), /"status": "stopped"/);
    assert.deepEqual(proxyState.commands?.map((entry) => entry.command), [
      "new",
      "reset",
      "status",
      "queue",
      "stop",
      "continue",
      "compact",
      "summary",
      "debug",
    ]);
    assert.equal(proxyState.lastSend?.text, "cli reply: hello telegram");
    assert.equal(proxyState.lastSendToken, "{{telegram_support_bot_token}}");
  });
});

test("runCli handles Telegram /new session reset without model latency", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-telegram-new-"));
  const payload = JSON.stringify({
    provider: "telegram",
    accountId: "support",
    targetId: "1001",
    message: {
      targetId: "1001",
      senderId: "test-user",
      text: "/new",
      raw: { message: { chat: { type: "private" } } },
    },
  });
  const script = [
    "import { runCli } from './packages/clawjs/src/index.ts';",
    "const code = await runCli([",
    "'channels','codex-processor','run','--runtime','demo','--workspace',process.env.CLAW_TEST_WORKSPACE,",
    "'--bridge-state',process.env.CLAW_TEST_WORKSPACE + '/.claw/telegram-codex-bridge.json','--reply-policy','all','--json'",
    "], { stdout: process.stdout, stderr: process.stderr, cwd: process.cwd() });",
    "process.exit(code);",
  ].join(" ");
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    CLAW_TEST_WORKSPACE: workspaceRoot,
    CLAW_DATA_DIR: path.join(workspaceRoot, "claw-data"),
  };
  for (const key of ["CLAW_DB_PATH", "CLAW_DB_PATH", "DATABASE_DB_PATH", "DATABASE_FILES_DIR"]) {
    delete childEnv[key];
  }
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    input: payload,
    encoding: "utf8",
    env: childEnv,
  });

  assert.equal(result.status, CLI_EXIT_OK, `${result.stderr}\n${result.stdout}`);
  const output = JSON.parse(result.stdout) as {
    ok: boolean;
    data: { actions: Array<{ type: string; text?: string }> };
    meta: { canonicalCommand?: string; invokedCommand?: string; subcommand?: string; operation?: string };
  };
  assert.equal(output.ok, true);
  assert.equal(output.meta.canonicalCommand, "channels");
  assert.equal(output.meta.invokedCommand, "channels");
  assert.equal(output.meta.subcommand, "codex-processor");
  assert.equal(output.meta.operation, "run");
  assert.equal(output.data.actions.some((action) => action.type === "send_message" && action.text === "New session is ready. What do you want to do next?"), true);
});
