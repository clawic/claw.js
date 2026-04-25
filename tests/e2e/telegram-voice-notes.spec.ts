import fs from "fs";
import os from "os";
import path from "path";

import { expect, test } from "./fixtures";

function writeFakeSecretsProxy(rootDir: string): { proxyPath: string; statePath: string } {
  const proxyPath = path.join(rootDir, "secrets-proxy.cjs");
  const statePath = path.join(rootDir, "telegram-state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    webhookUrl: "",
    updates: [{
      update_id: 41,
      message: {
        message_id: 71,
        message_thread_id: 12,
        chat: { id: -1001, type: "supergroup", title: "Voice Lab", is_forum: true },
        from: { id: 501, first_name: "Owner" },
        voice: {
          file_id: "voice-file-id",
          file_unique_id: "voice-unique-id",
          mime_type: "audio/ogg",
          duration: 4,
        },
      },
    }],
    files: {
      "voice-file-id": { file_path: "voice/file_1.ogg", content: "fake-ogg-audio" },
    },
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
const url = flag("--url") || "";
const requestMethod = flag("--method") || "POST";
if (args[0] === "list-secrets" || args[0] === "describe-secret") {
  process.stdout.write(JSON.stringify([{ name: "telegram_support_bot_token", allowedHosts: ["api.telegram.org"], allowedHeaderNames: [], allowInURL: true }]));
  process.exit(0);
}
if (requestMethod === "GET" && url.includes("/file/bot")) {
  const filePath = url.split("/file/bot").pop().split("/").slice(1).join("/");
  const file = Object.values(state.files).find((entry) => entry.file_path === filePath);
  process.stdout.write(file ? file.content : "");
  process.exit(0);
}
const body = JSON.parse(flag("--body") || "{}");
const method = url.split("/").pop();
let result;
switch (method) {
  case "getMe":
    result = { id: 42, is_bot: true, username: "claw_support_bot", first_name: "Claw Support" };
    break;
  case "deleteWebhook":
    state.webhookUrl = "";
    result = true;
    break;
  case "getUpdates": {
    const offset = typeof body.offset === "number" ? body.offset : 0;
    const updates = (state.updates || []).filter((entry) => entry.update_id >= offset);
    state.updates = (state.updates || []).filter((entry) => !updates.some((selected) => selected.update_id === entry.update_id));
    result = updates;
    break;
  }
  case "getFile":
    result = state.files[body.file_id];
    break;
  case "sendMessage":
    state.lastSend = body;
    result = { message_id: 91, chat: { id: body.chat_id, type: "supergroup" }, text: body.text };
    break;
  case "getWebhookInfo":
    result = { url: state.webhookUrl || "", pending_update_count: 0 };
    break;
  default:
    result = true;
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

test("telegram voice notes are stored, transcribed, and delivered to the processor", async () => {
  test.setTimeout(120_000);
  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-telegram-voice-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  const whisperPath = path.join(tempRoot, "fake-whisper.cjs");
  const ffmpegPath = path.join(tempRoot, "fake-ffmpeg.cjs");
  const processorPath = path.join(tempRoot, "processor.cjs");
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(ffmpegPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-i") + 1];
const output = args[args.length - 1];
if (!input || !output.endsWith(".wav")) process.exit(2);
fs.writeFileSync(output, fs.readFileSync(input));
`, { mode: 0o755 });
  fs.writeFileSync(whisperPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const input = args[args.indexOf("-f") + 1];
if (!input.endsWith(".wav")) process.exit(3);
const outIndex = args.indexOf("-of");
if (outIndex !== -1) fs.writeFileSync(args[outIndex + 1] + ".txt", "transcribed telegram voice");
`, { mode: 0o755 });
  fs.writeFileSync(processorPath, `
process.stdin.setEncoding("utf8");
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  process.stdout.write(JSON.stringify({ actions: [
    { type: "grant_permission", agentId: "voice-router", targetId: event.targetId, permissions: ["write"] },
    { type: "send_message", targetId: event.targetId, threadId: event.message.threadId, text: "processor saw: " + event.message.text }
  ] }));
});
`);
  const { proxyPath, statePath } = writeFakeSecretsProxy(tempRoot);
  const env = {
    ...process.env,
    CLAWJS_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  };
  const cli = path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");

  async function run(args: string[]) {
    const { spawn } = await import("child_process");
    return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve) => {
      const child = spawn(process.execPath, [cli, ...args], { cwd: rootDir, env });
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
  }

  expect((await run(["channels", "telegram", "connect", "--workspace", workspaceRoot, "--account", "support", "--secret-name", "telegram_support_bot_token", "--json"])).exitCode).toBe(0);
  expect((await run(["stt", "set-config", "--workspace", workspaceRoot, "--enabled", "true", "--binary-path", whisperPath, "--ffmpeg-path", ffmpegPath, "--model-path", path.join(tempRoot, "model.bin"), "--json"])).exitCode).toBe(0);
  expect((await run(["channels", "processors", "add", "--workspace", workspaceRoot, "--id", "voice-router", "--agent-id", "voice-router", "--command", `${process.execPath} ${processorPath}`, "--json"])).exitCode).toBe(0);
  const listen = await run(["channels", "listen", "start", "--workspace", workspaceRoot, "--account", "support", "--processor", "voice-router", "--once", "--timeout", "0", "--json"]);
  expect(listen.exitCode).toBe(0);

  const notes = await run(["voice-notes", "list", "--workspace", workspaceRoot, "--origin", "telegram", "--query", "transcribed", "--json"]);
  expect(notes.exitCode).toBe(0);
  expect(notes.stdout).toContain("transcribed telegram voice");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastSend?: { text?: string; message_thread_id?: number } };
  expect(state.lastSend?.text).toBe("processor saw: transcribed telegram voice");
  expect(state.lastSend?.message_thread_id).toBe(12);
});
