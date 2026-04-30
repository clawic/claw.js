import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import WebSocket from "ws";

import { RelayConnectorRuntime, type RelayConnectorRuntimeSummary } from "../../src/connector/runtime.ts";
import { buildRelayApp } from "../../src/server/app.ts";
import { RelayLogger } from "../../src/server/logger.ts";
import type { CancelEnvelope, ConnectorInboundEnvelope, InvokeEnvelope } from "../../src/shared/protocol.ts";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-codex-e2e-"));
const codexHome = path.join(tempDir, "codex-home");
const workspaceRoot = path.join(tempDir, "workspaces");
const dbPath = path.join(tempDir, "relay.sqlite");
const codexBin = path.join(tempDir, "codex");

let appRef: Awaited<ReturnType<typeof buildRelayApp>> | null = null;
let baseUrl = "";

function writeFakeCodex(): void {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), 'model = "gpt-5.4"\n');
  fs.writeFileSync(codexBin, `#!/usr/bin/env node
const readline = require("readline");
const args = process.argv.slice(2);

if (args[0] === "--version") {
  process.stdout.write("codex-cli 9.9.9\\n");
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
      process.stdout.write(JSON.stringify({ method: "turn/started", params: { input: message.params.input } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "item/started", params: { item: { type: "userMessage", content: message.params.input } } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "item/completed", params: { item: { type: "userMessage", content: message.params.input } } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "item/completed", params: { item: { type: "agentMessage", content: [{ type: "text", text: "codex relay reply" }] } } }) + "\\n");
      process.stdout.write(JSON.stringify({ method: "turn/completed", params: {} }) + "\\n");
    }
  });
  return;
}

if (args[0] === "exec") {
  process.stdout.write(JSON.stringify({ type: "agent_message", message: "codex exec reply" }) + "\\n");
  process.exit(0);
}

process.exit(1);
`, { mode: 0o755 });
}

async function login(email: string, password: string) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantId: "demo-tenant" }),
  });
  assert.equal(response.status, 200);
  return await response.json() as { accessToken: string };
}

async function createEnrollmentToken(agentId: string): Promise<string> {
  const admin = await login("admin@relay.local", "relay-admin");
  const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${admin.accessToken}`,
    },
    body: JSON.stringify({ tenantId: "demo-tenant", agentId, description: `${agentId} connector` }),
  });
  assert.equal(enrollmentResponse.status, 200);
  const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };
  return enrollment.enrollmentToken;
}

async function createEnrollment(agentId: string): Promise<string> {
  const enrollmentToken = await createEnrollmentToken(agentId);
  const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enrollmentToken }),
  });
  assert.equal(connectorEnroll.status, 200);
  const payload = await connectorEnroll.json() as { connectorToken: string };
  return payload.connectorToken;
}

async function waitForAgentCapability(agentId: string, token: string, capability: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const payload = await response.json() as { agents: Array<{ agentId: string; status: string; capabilities: string[] }> };
      const agent = payload.agents.find((entry) => entry.agentId === agentId);
      if (agent?.status === "online" && agent.capabilities.includes(capability)) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${agentId} ${capability}`);
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  child.kill("SIGTERM");
  await closed;
}

async function startCodexConnector(input: {
  agentId: string;
  runtimeBinaryPath: string;
  workspaceRoot: string;
  expectOnline?: boolean;
}): Promise<{ socket: WebSocket; runtime: RelayConnectorRuntimeSummary }> {
  const connectorToken = await createEnrollment(input.agentId);
  const socket = new WebSocket(baseUrl.replace(/^http/, "ws") + "/v1/connector/connect", {
    headers: { Authorization: `Bearer ${connectorToken}` },
  });
  const runtime = new RelayConnectorRuntime({
    relayUrl: baseUrl,
    enrollmentToken: "",
    connectorId: input.agentId,
    agentId: input.agentId,
    workspaceRoot: input.workspaceRoot,
    runtimeAdapter: "codex",
    runtimeBinaryPath: input.runtimeBinaryPath,
  }, (event, payload) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "event", event, payload }));
  });

  const summaryPromise = runtime.getRuntimeSummary();
  const ackPromise = new Promise<void>((resolve, reject) => {
    socket.once("message", (buffer) => {
      const message = JSON.parse(buffer.toString()) as { type: string };
      message.type === "ack" ? resolve() : reject(new Error(`Expected ack, got ${message.type}`));
    });
  });

  socket.on("open", async () => {
    const summary = await summaryPromise;
    socket.send(JSON.stringify({
      type: "hello",
      payload: {
        tenantId: "demo-tenant",
        connectorId: input.agentId,
        agentId: input.agentId,
        version: "test",
        capabilities: [
          "sessions",
          "workspace",
          "integrations",
          "runtime:codex",
          summary.online ? "runtime:ready" : "runtime:degraded",
        ],
        runtime: summary,
        workspaces: runtime.listWorkspaces(),
      },
    }));
  });

  const activeRequests = new Map<string, AbortController>();
  socket.on("message", async (buffer) => {
    const message = JSON.parse(buffer.toString()) as ConnectorInboundEnvelope | InvokeEnvelope | CancelEnvelope;
    if (message.type === "cancel") {
      activeRequests.get(message.requestId)?.abort("cancelled_by_client");
      return;
    }
    if (message.type !== "invoke") return;
    const controller = new AbortController();
    activeRequests.set(message.requestId, controller);
    try {
      const result = await runtime.execute(
        message.operation,
        message.workspaceId,
        message.payload,
        (event, payload) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ type: "stream", requestId: message.requestId, event, payload }));
        },
        controller.signal,
      );
      socket.send(JSON.stringify({ type: "result", requestId: message.requestId, payload: result }));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "error",
        requestId: message.requestId,
        code: "connector_operation_failed",
        message: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      activeRequests.delete(message.requestId);
    }
  });

  const summary = await summaryPromise;
  if (typeof input.expectOnline === "boolean") {
    assert.equal(summary.online, input.expectOnline);
  }
  await ackPromise;
  return { socket, runtime: summary };
}

before(async () => {
  writeFakeCodex();
  appRef = await buildRelayApp({
    logger: new RelayLogger(),
    config: {
      port: 0,
      host: "127.0.0.1",
      dbPath,
      jwtSecrets: ["relay-codex-e2e-secret"],
      publicBaseUrl: "http://127.0.0.1:4410",
      loginRateLimitMax: 100,
    },
  });
  await appRef.app.listen({ host: "127.0.0.1", port: 0 });
  const address = appRef.app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve relay address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await appRef?.app.close();
});

test("relay connector runs Codex sessions without OpenClaw and reports runtime health", async () => {
  const user = await login("user@relay.local", "relay-user");
  const first = await startCodexConnector({
    agentId: "codex-agent",
    runtimeBinaryPath: codexBin,
    workspaceRoot,
    expectOnline: true,
  });

  assert.equal(first.runtime.adapter, "codex");
  assert.equal(first.runtime.cliAvailable, true);
  assert.equal(first.runtime.gatewayAvailable, true);

  const agentsResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assert.equal(agentsResponse.status, 200);
  const agentsPayload = await agentsResponse.json() as { agents: Array<{ agentId: string; capabilities: string[] }> };
  const codexAgent = agentsPayload.agents.find((agent) => agent.agentId === "codex-agent");
  assert.ok(codexAgent?.capabilities.includes("runtime:codex"));
  assert.ok(codexAgent?.capabilities.includes("runtime:ready"));

  const statusResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/codex-agent/workspaces/main/status`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assert.equal(statusResponse.status, 200);
  const statusPayload = await statusResponse.json() as { status: { runtime: { adapter: string; cliAvailable: boolean; gatewayAvailable: boolean } } };
  assert.equal(statusPayload.status.runtime.adapter, "codex");
  assert.equal(statusPayload.status.runtime.cliAvailable, true);
  assert.equal(statusPayload.status.runtime.gatewayAvailable, true);

  const sessionResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/codex-agent/workspaces/main/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.accessToken}`,
    },
    body: JSON.stringify({ title: "Codex Relay", message: "hello" }),
  });
  assert.equal(sessionResponse.status, 200);
  const sessionPayload = await sessionResponse.json() as { session: { sessionId: string } };
  const streamResponse = await fetch(
    `${baseUrl}/v1/tenants/demo-tenant/agents/codex-agent/workspaces/main/sessions/${sessionPayload.session.sessionId}/stream?message=${encodeURIComponent("say hello")}`,
    { headers: { Authorization: `Bearer ${user.accessToken}` } },
  );
  assert.equal(streamResponse.status, 200);
  const streamText = await streamResponse.text();
  assert.match(streamText, /codex relay reply/);
  assert.doesNotMatch(streamText, /SYSTEM PROMPT/);

  first.socket.close();
  await new Promise((resolve) => first.socket.once("close", resolve));
  const offlineResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/codex-agent/workspaces/main/status`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assert.equal(offlineResponse.status, 503);

  const reconnected = await startCodexConnector({
    agentId: "codex-agent",
    runtimeBinaryPath: codexBin,
    workspaceRoot,
    expectOnline: true,
  });
  const reconnectedStatus = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/codex-agent/workspaces/main/status`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assert.equal(reconnectedStatus.status, 200);
  reconnected.socket.close();
  await new Promise((resolve) => reconnected.socket.once("close", resolve));
});

test("relay connector reports degraded Codex runtime when the CLI is unavailable", async () => {
  const user = await login("user@relay.local", "relay-user");
  const broken = await startCodexConnector({
    agentId: "codex-broken",
    runtimeBinaryPath: path.join(tempDir, "missing-codex"),
    workspaceRoot: path.join(tempDir, "broken-workspaces"),
    expectOnline: false,
  });

  const agentsResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assert.equal(agentsResponse.status, 200);
  const agentsPayload = await agentsResponse.json() as { agents: Array<{ agentId: string; capabilities: string[] }> };
  const degradedAgent = agentsPayload.agents.find((agent) => agent.agentId === "codex-broken");
  assert.ok(degradedAgent?.capabilities.includes("runtime:codex"));
  assert.ok(degradedAgent?.capabilities.includes("runtime:degraded"));

  const statusResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/codex-broken/workspaces/main/status`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  assert.equal(statusResponse.status, 200);
  const statusPayload = await statusResponse.json() as { status: { runtime: { adapter: string; cliAvailable: boolean } } };
  assert.equal(statusPayload.status.runtime.adapter, "codex");
  assert.equal(statusPayload.status.runtime.cliAvailable, false);

  broken.socket.close();
  await new Promise((resolve) => broken.socket.once("close", resolve));
});

test("connector CLI persists credentials for stable Codex service restarts", async () => {
  const user = await login("user@relay.local", "relay-user");
  const agentId = "codex-service-agent";
  const serviceRoot = path.join(tempDir, "service-workspaces");
  const credentialPath = path.join(serviceRoot, ".relay", "connector-credential.json");
  const enrollmentToken = await createEnrollmentToken(agentId);
  const connectorScript = path.resolve("src/bin/connector.ts");
  const commonArgs = [
    "tsx",
    connectorScript,
    "--relay-url",
    baseUrl,
    "--agent-id",
    agentId,
    "--workspace-root",
    serviceRoot,
    "--runtime-adapter",
    "codex",
    "--runtime-binary-path",
    codexBin,
    "--credential-path",
    credentialPath,
  ];
  const env = {
    ...process.env,
    CODEX_HOME: codexHome,
  };

  const first = spawn("npx", [...commonArgs, "--enrollment-token", enrollmentToken], {
    cwd: path.resolve("."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForAgentCapability(agentId, user.accessToken, "runtime:ready");
    assert.equal(fs.existsSync(credentialPath), true);
    assert.equal(fs.statSync(credentialPath).mode & 0o777, 0o600);
  } finally {
    await stopChild(first);
  }

  const second = spawn("npx", commonArgs, {
    cwd: path.resolve("."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await waitForAgentCapability(agentId, user.accessToken, "runtime:ready");
  } finally {
    await stopChild(second);
  }
});
