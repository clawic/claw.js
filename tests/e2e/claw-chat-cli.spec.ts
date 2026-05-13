import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { spawn, execFile } from "child_process";
import { promisify } from "util";

import { expect, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

function clawBin(rootDir: string): string {
  return path.join(rootDir, "packages", "clawjs", "bin", "clawjs.mjs");
}

async function startFakeProvider() {
  const calls: Array<{ url: string; body: any; authorization?: string }> = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : {};
      calls.push({ url: req.url ?? "", body: parsed, authorization: req.headers.authorization });
      if (req.url !== "/chat/completions") {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const joined = messages.map((message: { content?: string }) => message.content ?? "").join("\n");
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      if (joined.includes("write tool") && !joined.includes("Tool write_file result")) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_write", type: "function", function: { name: "write_file", arguments: JSON.stringify({ path: "tool-output.txt", content: "written by tool" }) } }] } }] })}\n\n`);
      } else if (joined.includes("show reasoning")) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "thinking-visible " } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "reasoned reply" } }] })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "chat reply" } }] })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function createFakeSecretsProxy(tempRoot: string, configured: boolean) {
  const proxyPath = path.join(tempRoot, "secrets-proxy");
  const statePath = path.join(tempRoot, "secrets.json");
  fs.writeFileSync(statePath, JSON.stringify(configured ? [{
    name: "claw_deepseek_api_key",
    kind: "generic",
    allowedHosts: ["api.deepseek.com"],
    allowedHeaderNames: ["Authorization"],
    readOnly: true,
    allowInURL: false,
    allowInRequestBody: false,
    allowInsecureTransport: false,
    allowLocalNetwork: false,
  }] : [], null, 2));
  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(process.env.FAKE_SECRETS_PROXY_STATE, "utf8"));
if (args[0] === "describe-secret") {
  const name = String(args[args.indexOf("--name") + 1] || "");
  process.stdout.write(JSON.stringify(state.filter((entry) => entry.name === name)));
  process.exit(0);
}
if (args[0] === "list-secrets") {
  process.stdout.write(JSON.stringify(state));
  process.exit(0);
}
process.stderr.write("unsupported");
process.exit(1);
`, { mode: 0o755 });
  return {
    CLAW_SECRETS_PROXY_PATH: proxyPath,
    FAKE_SECRETS_PROXY_STATE: statePath,
    CLAW_SECRETS_BACKEND: "local_proxy",
  };
}

async function runClaw(rootDir: string, args: string[], env: NodeJS.ProcessEnv) {
  return execFileAsync(process.execPath, [clawBin(rootDir), ...args], {
    cwd: rootDir,
    env,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
}

function spawnClaw(rootDir: string, args: string[], env: NodeJS.ProcessEnv, input: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
    const child = spawn(process.execPath, [clawBin(rootDir), ...args], {
      cwd: rootDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claw chat timed out\nstdout=${stdout}\nstderr=${stderr}`));
    }, 120_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
    child.stdin.end(input);
  });
}

test("claw chat streams, persists sessions, handles slash commands, provider login, and tool approval", async ({ page }) => {
  test.setTimeout(180_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-chat-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const homeDir = path.join(tempRoot, "runtime-home");
  fs.mkdirSync(workspaceDir, { recursive: true });

  const fakeProvider = await startFakeProvider();
  const env = {
    ...process.env,
    DEEPSEEK_API_KEY: "test-key",
    CLAW_E2E_DISABLE_EXTERNAL_CALLS: "1",
  };
  const baseArgs = [
    "--workspace", workspaceDir,
    "--home-dir", homeDir,
    "--provider", "deepseek",
    "--model", "deepseek-v4-pro",
    "--wire", "chat_completions",
    "--base-url", fakeProvider.baseUrl,
  ];

  try {
    const initial = await runClaw(rootDir, ["chat", "hello", ...baseArgs], env);
    expect(initial.stdout).toContain("Claw Chat");
    expect(initial.stdout).toContain("provider=deepseek model=deepseek-v4-pro sandbox=read-only");
    expect(initial.stdout).toContain("chat reply");
    expect(fakeProvider.calls.every((call) => call.authorization === "Bearer test-key")).toBeTruthy();
    expect(fakeProvider.calls.at(-1)?.body.tools.map((tool: { function?: { name?: string } }) => tool.function?.name)).toEqual(expect.arrayContaining(["read_file", "write_file", "list_dir", "shell"]));

    const listed = await runClaw(rootDir, ["chat", "list", "--json", ...baseArgs], env);
    const sessions = JSON.parse(listed.stdout) as { sessions: Array<{ id: string; messages: unknown[] }> };
    expect(sessions.sessions.length).toBeGreaterThanOrEqual(1);
    const sessionId = sessions.sessions[0]!.id;

    const resumed = await runClaw(rootDir, ["chat", "resume", sessionId, "hello again", ...baseArgs], env);
    expect(resumed.stdout).toContain(`session=${sessionId}`);
    expect(resumed.stdout).toContain("chat reply");

    const interactive = await spawnClaw(rootDir, ["chat", ...baseArgs], env, [
      "/status",
      "/provider deepseek",
      "/model deepseek-v4-flash",
      "/sandbox workspace-write",
      "write tool",
      "y",
      "/exit",
      "",
    ].join("\n"));
    expect(interactive.exitCode).toBe(0);
    expect(interactive.stdout).toContain("sandbox=workspace-write");
    expect(interactive.stdout).toContain("model=deepseek-v4-flash");
    expect(fs.readFileSync(path.join(workspaceDir, "tool-output.txt"), "utf8")).toBe("written by tool");

    const reasoning = await runClaw(rootDir, ["chat", "show reasoning", "--show-reasoning", ...baseArgs], env);
    expect(reasoning.stdout).toContain("thinking-visible");
    expect(reasoning.stdout).toContain("reasoned reply");

    const secretEnv = createFakeSecretsProxy(tempRoot, true);
    const login = await runClaw(rootDir, ["provider", "login", "deepseek", "--home-dir", homeDir], { ...env, ...secretEnv });
    expect(login.stdout).toContain("deepseek vault configured");
    const configText = fs.readFileSync(path.join(homeDir, "config.json"), "utf8");
    expect(configText).toContain("claw_deepseek_api_key");
    expect(configText).not.toContain("test-key");

    const missingTemp = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-chat-missing-"));
    const missingEnv = createFakeSecretsProxy(missingTemp, false);
    await expect(runClaw(rootDir, ["provider", "login", "deepseek", "--home-dir", path.join(missingTemp, "home")], { ...env, ...missingEnv }))
      .rejects
      .toMatchObject({
        stdout: expect.stringContaining("Secret required: claw_deepseek_api_key"),
      });

    await page.setContent(`<main><h1>Claw Chat CLI</h1><pre>${interactive.stdout.replace(/[<>&]/g, "")}</pre></main>`);
    await saveArtifactScreenshot(page, "claw-chat-cli.png");
  } finally {
    await fakeProvider.close();
  }
});
