import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { pathToFileURL } from "url";

import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

const execFileAsync = promisify(execFile);

test("sdk exposes Claw Runtime with hermetic provider streaming, app-server, and workspace tools", async ({ page, request }) => {
  test.setTimeout(120_000);

  const rootDir = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-e2e-claw-runtime-"));
  const workspacePath = path.join(tempRoot, "workspace");
  fs.mkdirSync(workspacePath, { recursive: true });

  const calls: Array<{ url: string; body: unknown; authorization: string | null }> = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      calls.push({
        url: req.url ?? "",
        body: body ? JSON.parse(body) as unknown : null,
        authorization: req.headers.authorization ?? null,
      });

      if (req.url === "/responses") {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("responses unavailable");
        return;
      }

      if (req.url === "/chat/completions") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "thinking" } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_read", type: "function", function: { name: "read_file", arguments: "{\"path\":\"notes/result.txt\"}" } }] } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "chat " } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "reply" } }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      res.writeHead(404);
      res.end("not found");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const moduleUrl = pathToFileURL(path.join(rootDir, "packages", "clawjs-node", "dist", "index.js")).href;

  const script = `
import fs from "fs";
const {
  ClawRuntimeAppServer,
  NodeProcessHost,
  clawAdapter,
  executeClawRuntimeTool,
  getRuntimeResourceCatalogs,
  getRuntimeSessionDescriptor,
  getRuntimeStatusReport,
  streamRuntimeSessionEvents,
} = await import(${JSON.stringify(moduleUrl)});

const runner = new NodeProcessHost();
const options = {
  adapter: "claw",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  wire: "responses",
  baseUrl: ${JSON.stringify(baseUrl)},
  envKey: "DEEPSEEK_API_KEY",
  permissionMode: "workspace-write",
  workspacePath: ${JSON.stringify(workspacePath)},
  env: { ...process.env, DEEPSEEK_API_KEY: "test-key" },
};

const status = await getRuntimeStatusReport(clawAdapter, runner, options);
const resources = await getRuntimeResourceCatalogs(clawAdapter, runner, options);
const sessionAdapter = getRuntimeSessionDescriptor(clawAdapter, options);

const streamEvents = [];
let text = "";
let reasoning = "";
const toolCalls = [];
let usage = null;
for await (const event of streamRuntimeSessionEvents({
  sessionId: "claw-runtime-session",
  messages: [{ role: "user", content: "hello" }],
  chunkSize: 32,
}, { sessionAdapter, runner })) {
  streamEvents.push(event.type === "transport" ? event.transport + ":" + String(event.fallback) : event.type);
  if (event.type === "chunk") {
    text += event.chunk.delta;
    reasoning += event.chunk.reasoningDelta ?? "";
    toolCalls.push(...(event.chunk.toolCalls ?? []));
  }
}

await executeClawRuntimeTool({
  name: "write_file",
  arguments: { path: "notes/result.txt", content: "tool output" },
  workspacePath: ${JSON.stringify(workspacePath)},
  permissionMode: "workspace-write",
});
const toolRead = await executeClawRuntimeTool({
  name: "read_file",
  arguments: { path: "notes/result.txt" },
  workspacePath: ${JSON.stringify(workspacePath)},
  permissionMode: "read-only",
});

const appServer = new ClawRuntimeAppServer({ runtime: { ...options, wire: "chat_completions" }, dependencies: { runner } });
const init = await appServer.handle({ id: 1, method: "initialize", params: { clientInfo: { name: "e2e" } } });
const threadStarted = await appServer.handle({ id: 2, method: "thread/start", params: { cwd: ${JSON.stringify(workspacePath)}, model: "deepseek-v4-pro" } });
const threadId = threadStarted[0].result.thread.id;
const turn = await appServer.handle({ id: 3, method: "turn/start", params: { threadId, input: [{ type: "text", text: "reply through app-server" }] } });
const readDirectory = await appServer.handle({ id: 4, method: "fs/readDirectory", params: { threadId, path: "." } });

process.stdout.write(JSON.stringify({
  status: {
    adapter: status.adapter,
    runtimeName: status.runtimeName,
    authStatus: status.capabilityMap.auth.status,
    authSource: status.diagnostics.authSource,
    gatewayKind: sessionAdapter.transport.gatewayKind,
  },
  providers: resources.providers.providers.map((provider) => provider.id),
  defaultModel: resources.models.defaultModel,
  modelIds: resources.models.models.map((model) => model.modelId),
  streamEvents,
  text,
  reasoning,
  toolCalls,
  toolRead,
  initOk: !!init[0].result.serverInfo,
  appServerDeltas: turn.filter((message) => message.method === "item/agentMessage/delta").map((message) => message.params.delta).join(""),
  appServerCompleted: turn.some((message) => message.method === "turn/completed"),
  directoryEntries: readDirectory[0].result.entries.map((entry) => entry.fileName),
}, null, 2));
`;

  try {
    const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: rootDir,
      env: { ...process.env, CI: "1" },
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });

    const payload = JSON.parse(stdout) as {
      status: { adapter: string; runtimeName: string; authStatus: string; authSource: string; gatewayKind: string };
      providers: string[];
      defaultModel: { provider: string; modelId: string; label: string };
      modelIds: string[];
      streamEvents: string[];
      text: string;
      reasoning: string;
      toolCalls: Array<{ id?: string; name?: string; arguments?: string }>;
      toolRead: string;
      initOk: boolean;
      appServerDeltas: string;
      appServerCompleted: boolean;
      directoryEntries: string[];
    };

    expect(payload.status.adapter).toBe("claw");
    expect(payload.status.runtimeName).toBe("Claw Runtime");
    expect(payload.status.authStatus).toBe("ready");
    expect(payload.status.authSource).toBe("env");
    expect(payload.status.gatewayKind).toBe("claw-runtime");
    expect(payload.providers).toEqual(expect.arrayContaining(["deepseek", "openrouter", "openai", "openai-compatible"]));
    expect(payload.defaultModel).toEqual({ provider: "deepseek", modelId: "deepseek-v4-pro", label: "DeepSeek V4 Pro" });
    expect(payload.modelIds).toEqual(expect.arrayContaining(["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat"]));
    expect(payload.streamEvents).toEqual(expect.arrayContaining(["gateway:false", "gateway:true", "chunk", "done"]));
    expect(payload.text).toBe("chat reply");
    expect(payload.reasoning).toBe("thinking");
    expect(payload.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "call_read", name: "read_file" }),
    ]));
    expect(payload.toolRead).toBe("tool output");
    expect(payload.initOk).toBe(true);
    expect(payload.appServerDeltas).toBe("chat reply");
    expect(payload.appServerCompleted).toBe(true);
    expect(payload.directoryEntries).toContain("notes");
    expect(calls.every((call) => call.authorization === "Bearer test-key")).toBeTruthy();

    await resetDemoState(request, "seeded");
    await page.goto("/settings?tab=openclaw");
    await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("adapter-claw-card")).toBeVisible();
    await page.getByTestId("adapter-claw-card").click();
    await expect(page.getByTestId("adapter-claw-capability-session_gateway")).toBeVisible();
    await expect(page.getByTestId("adapter-claw-session-transport")).toContainText("hybrid -> gateway");
    await saveArtifactScreenshot(page, "claw-runtime-settings.png");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
