import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcess } from "child_process";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number, label: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  await waitFor(async () => {
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }, timeoutMs, url);
}

function stopProcess(child: ChildProcess | null): void {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
}

test("demo bootstrap stays responsive with local OpenClaw chat and disabled mail/calendar probes", async ({ page }) => {
  test.setTimeout(180_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-openclaw-localhost-"));
  const stateDir = path.join(tempRoot, "state");
  const workspaceDir = path.join(tempRoot, "workspace");
  const agentDir = path.join(tempRoot, "agent");
  const sessionsDir = path.join(tempRoot, "sessions");
  const configDir = path.join(tempRoot, "workspace-config");
  const gatewayStatePath = path.join(stateDir, "gateway-state.json");
  const gatewayServerPath = path.join(tempRoot, "gateway-server.mjs");
  const binaryPath = path.join(tempRoot, "bin", "openclaw");
  const settingsPath = path.join(tempRoot, "settings.json");
  const configPath = path.join(stateDir, "openclaw.json");
  const screenshotName = "demo-openclaw-bootstrap-localhost.png";
  const port = 4325;
  const gatewayPort = 18895;

  let gatewayProcess: ChildProcess | null = null;
  let demoProcess: ChildProcess | null = null;

  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "bin"), { recursive: true });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(path.join(configDir, "profile"), { recursive: true });

    const pngPath = path.join(tempRoot, "chart.png");
    const pdfPath = path.join(tempRoot, "report.pdf");

    fs.writeFileSync(gatewayStatePath, JSON.stringify({ requests: [], gatewayCalls: [] }, null, 2));
    fs.writeFileSync(settingsPath, JSON.stringify({
      schemaVersion: 1,
      locale: "es",
      onboardingCompleted: true,
      disclaimerAcceptedAt: new Date("2026-04-08T10:37:31.453Z").toISOString(),
      ageVerifiedAt: new Date("2026-04-08T10:37:31.455Z").toISOString(),
      openClawEnabled: true,
      activeAdapter: "openclaw",
      sidebarOpen: true,
      theme: "light",
    }, null, 2));
    fs.writeFileSync(path.join(configDir, "user-config.json"), JSON.stringify({
      schemaVersion: 1,
      locale: "es",
      displayName: "Demo",
      profileNameKey: "default",
      dataSources: {
        wacliDbPath: "",
        transcriptionDbPath: "",
        activityStoreDbPath: path.join(workspaceDir, "data", "runtime.sqlite"),
      },
      calendarAccounts: [],
      emailAccounts: [],
      contactsEnabled: false,
      telegram: { enabled: false },
      slack: { enabled: false },
      whatsapp: { enabled: false },
      chat: {
        roles: [],
        greeting: "",
        suggestedTopics: [],
        focusTopics: [],
        neverMention: [],
        additionalGuidelines: [],
      },
      assistant: {
        roles: [],
        greeting: "",
        suggestedTopics: [],
        focusTopics: [],
        neverMention: [],
        additionalGuidelines: [],
      },
      profileBasics: {},
      contextFiles: {},
      profileFile: "profile.md",
    }, null, 2));
    fs.writeFileSync(path.join(configDir, "profile.md"), "# User Context\n\n- Preferred name: Demo\n");
    fs.writeFileSync(pngPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnCYl8AAAAASUVORK5CYII=", "base64"));
    fs.writeFileSync(pdfPath, Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"));
    fs.writeFileSync(configPath, JSON.stringify({
      gateway: {
        port: gatewayPort,
        auth: { token: "localhost-test-token" },
      },
      agents: {
        defaults: { workspace: workspaceDir },
        list: [{ id: "clawjs-demo", workspace: workspaceDir, agentDir }],
      },
    }, null, 2));
    fs.writeFileSync(gatewayServerPath, `import fs from "fs";
import http from "http";

const port = ${gatewayPort};
const statePath = ${JSON.stringify(gatewayStatePath)};

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function record(entry) {
  const state = readState();
  state.requests.push(entry);
  writeState(state);
}

function collect(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => data += chunk);
    req.on("end", () => resolve(data));
  });
}

function sendSse(res, blocks) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  for (const block of blocks) res.write(block);
  res.end();
}

function textFromInput(input) {
  return (Array.isArray(input) ? input : [])
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join(" ");
}

const server = http.createServer(async (req, res) => {
  const bodyText = await collect(req);
  const body = bodyText ? JSON.parse(bodyText) : {};
  record({ method: req.method, url: req.url, body });

  if (req.url === "/v1/responses" && req.method === "POST") {
    const flat = textFromInput(body.input).toLowerCase();
    if (flat.includes("fallback plain text request")) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("responses unavailable");
      return;
    }
    const reply = flat.includes("inspect the attached files") ? "Reviewed image and pdf" : "Budget stream ready";
    sendSse(res, [
      "event: response.output_text.delta\\ndata: " + JSON.stringify({ delta: reply.slice(0, 9) }) + "\\n\\n",
      "event: response.output_text.delta\\ndata: " + JSON.stringify({ delta: reply.slice(9) }) + "\\n\\n",
      "event: response.completed\\ndata: " + JSON.stringify({ output_text: reply }) + "\\n\\n",
    ]);
    return;
  }

  if (req.url === "/v1/chat/completions" && req.method === "POST") {
    if (body.stream) {
      sendSse(res, [
        "data: " + JSON.stringify({ choices: [{ delta: { content: "Fallback " } }] }) + "\\n\\n",
        "data: " + JSON.stringify({ choices: [{ delta: { content: "chat reply" } }] }) + "\\n\\n",
        "data: [DONE]\\n\\n",
      ]);
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "Budget review" } }] }));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log("fake-gateway-ready:" + port);
});
`);
    fs.writeFileSync(binaryPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const statePath = ${JSON.stringify(gatewayStatePath)};

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

if (args[0] === "--version") {
  process.stdout.write("openclaw 9.9.9\\n");
  process.exit(0);
}

if (args[0] === "models" && args.includes("status")) {
  process.stdout.write(JSON.stringify({
    defaultModel: "openai/gpt-5.4",
    auth: {
      missingProvidersInUse: [],
      providers: [{ provider: "openai", effective: { kind: "apiKey" }, profiles: { apiKey: 1 } }],
    },
  }) + "\\n");
  process.exit(0);
}

if (args[0] === "agents" && args[1] === "list") {
  process.stdout.write("[]\\n");
  process.exit(0);
}

if (args[0] === "agents" && args[1] === "add") {
  process.stdout.write("{}\\n");
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "list") {
  process.stdout.write("{\\"plugins\\":[],\\"diagnostics\\":[]}\\n");
  process.exit(0);
}

if (args[0] === "gateway" && (args[1] === "start" || args[1] === "stop" || args[1] === "install" || args[1] === "restart")) {
  process.stdout.write("ok\\n");
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "call") {
  const method = args[args.length - 1];
  const params = JSON.parse(readFlag("--params") || "{}");
  const state = readState();
  state.gatewayCalls.push({ method, params });
  writeState(state);

  switch (method) {
    case "channels.status":
      process.stdout.write(JSON.stringify({ ok: true, channels: {} }) + "\\n");
      process.exit(0);
    case "sessions.list":
      process.stdout.write(JSON.stringify({ sessions: [{ sessionKey: "alpha", title: "Native Alpha" }] }) + "\\n");
      process.exit(0);
    case "chat.history":
      process.stdout.write(JSON.stringify({ sessionKey: params.sessionKey || "alpha", messages: [{ role: "assistant", content: "native-history" }] }) + "\\n");
      process.exit(0);
    case "chat.send":
      process.stdout.write(JSON.stringify({ accepted: true, sessionKey: params.sessionKey || "alpha" }) + "\\n");
      process.exit(0);
    default:
      process.stdout.write(JSON.stringify({ ok: true, method, params }) + "\\n");
      process.exit(0);
  }
}

process.stdout.write("{}\\n");
process.exit(0);
`, { mode: 0o755 });

    gatewayProcess = spawn(process.execPath, [gatewayServerPath], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForHttp(`http://127.0.0.1:${gatewayPort}/healthz`.replace("/healthz", "/"), 15_000).catch(async () => {
      await waitFor(async () => {
        try {
          const response = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, { method: "POST" });
          return response.status === 404 || response.status === 200;
        } catch {
          return false;
        }
      }, 15_000, "fake gateway");
    });

    const demoEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${path.dirname(binaryPath)}${path.delimiter}${process.env.PATH || ""}`,
      NEXT_DIST_DIR: ".next-e2e",
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_WORKSPACE_DIR: workspaceDir,
      OPENCLAW_AGENT_DIR: agentDir,
      OPENCLAW_SESSIONS_DIR: sessionsDir,
      OPENCLAW_CONFIG_DIR: configDir,
      OPENCLAW_LOCAL_SETTINGS_PATH: settingsPath,
      CLAWJS_E2E: "",
      CLAWJS_E2E_FIXTURE_MODE: "",
      CLAWJS_E2E_DISABLE_EXTERNAL_CALLS: "",
    };

    demoProcess = spawn("npm", ["run", "start", "--", "--port", String(port)], {
      cwd: path.join(rootDir, "demo"),
      env: demoEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForHttp(`http://127.0.0.1:${port}/`, 30_000);

    const statusResponse = await page.request.get(`http://127.0.0.1:${port}/api/integrations/status?scope=bootstrap`, {
      timeout: 10_000,
    });
    expect(statusResponse.ok()).toBeTruthy();
    const bootstrapStatus = await statusResponse.json() as { openClaw: { ready: boolean }; email: { enabled?: boolean }; calendar: { enabled?: boolean } };
    expect(bootstrapStatus.openClaw.ready).toBeTruthy();
    expect(bootstrapStatus.email.enabled).toBeFalsy();
    expect(bootstrapStatus.calendar.enabled).toBeFalsy();

    await page.goto(`http://127.0.0.1:${port}/?chatDebug=1`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-testid='app-splash']").waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
    const input = page.getByTestId("chat-input");
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await expect(input).not.toHaveAttribute("placeholder", /Configura antes el runtime local/);

    await page.locator("input[type='file']").setInputFiles([pngPath, pdfPath]);
    await input.fill("Inspect the attached files");
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-message-assistant").last()).toContainText("Reviewed image and pdf", { timeout: 30_000 });

    await page.getByTestId("sidebar-new-session").click();
    await expect(page.getByTestId("chat-empty-state")).toBeVisible({ timeout: 15_000 });
    await input.fill("fallback plain text request");
    await page.getByTestId("chat-send-button").click();
    await expect(page.getByTestId("chat-message-assistant").last()).toContainText("Fallback chat reply", { timeout: 30_000 });

    const gatewayState = JSON.parse(fs.readFileSync(gatewayStatePath, "utf8")) as {
      requests: Array<{ url: string; body: { input?: Array<{ content?: Array<{ type?: string }> }> } }>;
    };

    const responsesRequest = gatewayState.requests.find((entry) =>
      entry.url === "/v1/responses"
      && entry.body?.input?.some((message) => message.content?.some((item) => item.type === "input_image"))
      && entry.body?.input?.some((message) => message.content?.some((item) => item.type === "input_file")));
    expect(responsesRequest).toBeTruthy();
    expect(gatewayState.requests.some((entry) => entry.url === "/v1/chat/completions")).toBeTruthy();

    await saveArtifactScreenshot(page, screenshotName);
  } finally {
    stopProcess(demoProcess);
    stopProcess(gatewayProcess);
  }
});
