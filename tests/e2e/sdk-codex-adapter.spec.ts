import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("sdk exposes Codex as a hermetic runtime adapter with app-server and exec fallback", async ({ page, request }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-codex-adapter-"));
  const codexLog = path.join(tempRoot, "codex.log");
  const binaryPath = path.join(tempRoot, "bin", "codex");
  const codexHome = path.join(tempRoot, "codex-home");
  const workspacePath = path.join(tempRoot, "workspace");
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;

  fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
  fs.mkdirSync(path.join(codexHome, "skills", "review"), { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), 'model = "gpt-5.3-codex"\n');
  fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const fs = require("fs");
const readline = require("readline");
const args = process.argv.slice(2);
const logPath = ${JSON.stringify(codexLog)};
fs.appendFileSync(logPath, JSON.stringify({ args, codexHome: process.env.CODEX_HOME || null }) + "\\n");

if (args[0] === "--version") {
  process.stdout.write("codex-cli 0.122.0-alpha.13\\n");
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
    }
    if (message.method === "thread/start") {
      process.stdout.write(JSON.stringify({ id: message.id, result: { thread: { id: "thread-1" } } }) + "\\n");
    }
    if (message.method === "turn/start") {
      process.stdout.write(JSON.stringify({ method: "codex/event", params: { msg: { type: "agent_message", message: "app-server reply" } } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "turn/completed", params: {} }) + "\\n");
    }
  });
  return;
}
if (args[0] === "exec") {
  process.stdout.write(JSON.stringify({ type: "agent_message", message: "exec fallback reply" }) + "\\n");
  process.exit(0);
}
process.exit(1);
`, { mode: 0o755 });

  const script = `
import fs from "fs";
const { NodeProcessHost, codexAdapter, getRuntimeResourceCatalogs, getRuntimeSessionDescriptor, getRuntimeStatusReport, streamOpenClawSession } = await import(${JSON.stringify(moduleUrl)});
const runner = new NodeProcessHost();
const options = {
  adapter: "codex",
  binaryPath: ${JSON.stringify(binaryPath)},
  homeDir: ${JSON.stringify(codexHome)},
  workspacePath: ${JSON.stringify(workspacePath)},
  env: { ...process.env, CODEX_HOME: ${JSON.stringify(codexHome)} },
};
const status = await getRuntimeStatusReport(codexAdapter, runner, options);
const resources = await getRuntimeResourceCatalogs(codexAdapter, runner, options);
const sessionAdapter = getRuntimeSessionDescriptor(codexAdapter, options);
const appServerChunks = [];
for await (const chunk of streamOpenClawSession({
  sessionId: "codex-app-server",
  messages: [{ role: "user", content: "hello" }],
  chunkSize: 64,
}, { sessionAdapter, runner })) {
  if (!chunk.done) appServerChunks.push(chunk.delta);
}
const execChunks = [];
for await (const chunk of streamOpenClawSession({
  sessionId: "codex-exec",
  messages: [{ role: "user", content: "hello" }],
  transport: "cli",
  chunkSize: 64,
}, { sessionAdapter, runner })) {
  if (!chunk.done) execChunks.push(chunk.delta);
}
process.stdout.write(JSON.stringify({
  adapter: status.adapter,
  version: status.version,
  authStatus: status.capabilityMap.auth.status,
  gatewayStatus: status.capabilityMap.session_gateway.status,
  defaultModel: resources.models.defaultModel?.modelId,
  appServerText: appServerChunks.join(""),
  execText: execChunks.join(""),
  commands: fs.readFileSync(${JSON.stringify(codexLog)}, "utf8").trim().split("\\n").map((line) => JSON.parse(line)),
}, null, 2));
`;

  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: rootDir,
    env: {
      ...process.env,
      CI: "1",
    },
  });

  const payload = JSON.parse(stdout) as {
    adapter: string;
    version: string;
    authStatus: string;
    gatewayStatus: string;
    defaultModel: string;
    appServerText: string;
    execText: string;
    commands: Array<{ args: string[]; codexHome: string | null }>;
  };

  expect(payload.adapter).toBe("codex");
  expect(payload.version).toBe("0.122.0-alpha.13");
  expect(payload.authStatus).toBe("ready");
  expect(payload.gatewayStatus).toBe("ready");
  expect(payload.defaultModel).toBe("gpt-5.3-codex");
  expect(payload.appServerText).toBe("app-server reply");
  expect(payload.execText).toBe("exec fallback reply");
  expect(payload.commands.some((command) => command.args[0] === "app-server")).toBeTruthy();
  expect(payload.commands.some((command) => command.args[0] === "exec")).toBeTruthy();

  await resetDemoState(request, "seeded");
  await page.goto("/settings?tab=openclaw");
  await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("adapter-codex-card")).toBeVisible();
  await page.getByTestId("adapter-codex-card").click();
  await expect(page.getByTestId("adapter-codex-status-cli")).toBeVisible();
  await saveArtifactScreenshot(page, "runtime-adapters-codex-settings.png");
});
