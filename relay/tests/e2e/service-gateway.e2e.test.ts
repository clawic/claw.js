import { clawApiPath } from "@clawjs/core";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";

import WebSocket, { WebSocketServer } from "ws";

import { RelayConnectorRuntime } from "../../src/connector/runtime.ts";
import { buildRelayApp } from "../../src/server/app.ts";
import { RelayLogger } from "../../src/server/logger.ts";
import { startRelayServiceProxy } from "../../src/service-proxy/local.ts";
import type { CancelEnvelope, ConnectorInboundEnvelope, InvokeEnvelope } from "../../src/shared/protocol.ts";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-service-e2e-"));
const dbPath = path.join(tempDir, "infra.sqlite");
const workspaceRoot = path.join(tempDir, "workspaces");

let appRef: Awaited<ReturnType<typeof buildRelayApp>> | null = null;
let serviceServer: http.Server | null = null;
let serviceWsServer: WebSocketServer | null = null;
let serviceBaseUrl = "";
let baseUrl = "";
let connectorSocket: WebSocket | null = null;
const serviceRequests: Array<{ pathname: string; authorization?: string; relayAuth?: string }> = [];

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return `http://127.0.0.1:${address!.port}`;
}

async function closeWebSocket(socket: WebSocket | null): Promise<void> {
  if (!socket || socket.readyState === WebSocket.CLOSED) return;
  if (socket.readyState === WebSocket.CLOSING) {
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    return;
  }
  await new Promise<void>((resolve) => {
    socket.once("close", () => resolve());
    socket.close();
  });
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

async function createEnrollment(agentId: string): Promise<string> {
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
  const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
  });
  assert.equal(connectorEnroll.status, 200);
  return (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
}

async function startServiceConnector(): Promise<WebSocket> {
  const connectorToken = await createEnrollment("service-agent");
  const socket = new WebSocket(baseUrl.replace(/^http/, "ws") + clawApiPath("connector/connect"), {
    headers: { Authorization: `Bearer ${connectorToken}` },
  });
  const runtime = new RelayConnectorRuntime({
    relayUrl: baseUrl,
    enrollmentToken: "",
    connectorId: "service-agent",
    agentId: "service-agent",
    workspaceRoot,
    runtimeAdapter: "demo",
    services: [{
      serviceId: "example-service",
      displayName: "Example Service",
      baseUrl: serviceBaseUrl,
    }],
  });
  const ack = new Promise<void>((resolve, reject) => {
    const activeRequests = new Map<string, AbortController>();
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for connector ack"));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("error", handleError);
      socket.off("close", handleClose);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleClose = () => {
      cleanup();
      reject(new Error("Connector socket closed before ack"));
    };
    socket.once("error", handleError);
    socket.once("close", handleClose);
    socket.on("message", (buffer) => {
      const message = JSON.parse(buffer.toString()) as ConnectorInboundEnvelope | InvokeEnvelope | CancelEnvelope;
      if (message.type === "ack") {
        cleanup();
        resolve();
      }
      if (message.type === "cancel") {
        const controller = activeRequests.get(message.requestId);
        if (controller) controller.abort("cancelled_by_client");
        return;
      }
      if (message.type !== "invoke") return;
      const controller = new AbortController();
      activeRequests.set(message.requestId, controller);
      runtime.execute(
        message.operation,
        message.workspaceId,
        message.payload,
        (event, payload) => {
          socket.send(JSON.stringify({ type: "stream", requestId: message.requestId, event, payload }));
        },
        controller.signal,
      ).then((payload) => {
        socket.send(JSON.stringify({ type: "result", requestId: message.requestId, payload }));
      }).catch((error) => {
        socket.send(JSON.stringify({
          type: "error",
          requestId: message.requestId,
          code: "connector_operation_failed",
          message: error instanceof Error ? error.message : String(error),
        }));
      }).finally(() => {
        activeRequests.delete(message.requestId);
      });
    });
  });
  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "hello",
      payload: {
        tenantId: "demo-tenant",
        connectorId: "service-agent",
        agentId: "service-agent",
        version: "test",
        capabilities: ["services"],
        services: runtime.listServices(),
        workspaces: [],
      },
    }));
  });
  await ack;
  return socket;
}

before(async () => {
  serviceWsServer = new WebSocketServer({ noServer: true });
  serviceServer = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://service.local");
    serviceRequests.push({
      pathname: url.pathname,
      authorization: request.headers.authorization,
      relayAuth: request.headers["x-relay-authorization"] as string | undefined,
    });
    if (url.pathname === clawApiPath("secure")) {
      if (request.headers.authorization !== "Bearer native-token") return sendJson(response, 401, { error: "native_auth_required" });
      return sendJson(response, 200, { ok: true, query: url.searchParams.get("q") });
    }
    if (url.pathname === clawApiPath("upload")) {
      const body = await readBody(request);
      return sendJson(response, 201, { size: body.length, text: body.toString("utf8") });
    }
    if (url.pathname === clawApiPath("download")) {
      response.statusCode = 200;
      response.setHeader("content-type", "application/octet-stream");
      response.end(Buffer.from([0, 1, 2, 3, 255]));
      return;
    }
    if (url.pathname === clawApiPath("events")) {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      response.write("data: first\n\n");
      setTimeout(() => {
        response.write("data: second\n\n");
        response.end();
      }, 20);
      return;
    }
    return sendJson(response, 404, { error: "not_found" });
  });
  serviceServer.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith(clawApiPath("socket"))) {
      socket.destroy();
      return;
    }
    serviceWsServer!.handleUpgrade(request, socket, head, (client) => {
      client.on("message", (data, isBinary) => {
        const prefix = isBinary ? Buffer.from([9]) : "ws:";
        client.send(isBinary ? Buffer.concat([prefix as Buffer, Buffer.from(data as Buffer)]) : `${prefix}${data.toString()}`, { binary: isBinary });
      });
    });
  });
  serviceBaseUrl = await listen(serviceServer);

  appRef = await buildRelayApp({
    config: {
      dbPath,
      jwtSecrets: ["service-gateway-e2e-secret"],
      publicBaseUrl: "http://127.0.0.1:0",
      corsOrigins: [],
      requestTimeoutMs: 5_000,
    },
    logger: new RelayLogger(),
  });
  await appRef.app.listen({ host: "127.0.0.1", port: 0 });
  const address = appRef.app.server.address();
  assert.equal(typeof address, "object");
  baseUrl = `http://127.0.0.1:${address!.port}`;
  connectorSocket = await startServiceConnector();
});

after(async () => {
  await closeWebSocket(connectorSocket);
  for (const client of serviceWsServer?.clients ?? []) {
    await closeWebSocket(client);
  }
  await new Promise<void>((resolve) => serviceWsServer?.close(() => resolve()) ?? resolve());
  await appRef?.app.close();
  await new Promise<void>((resolve) => serviceServer?.close(() => resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Relay service gateway preserves native service auth and proxies HTTP, uploads, downloads, SSE and WebSocket", async () => {
  const user = await login("user@relay.local", "relay-user");
  const relayHeaders = {
    "x-relay-authorization": `Bearer ${user.accessToken}`,
  };
  const secure = await fetch(`${baseUrl}/v1/tenants/demo-tenant/services/example-service/v1/secure?q=relay`, {
    headers: {
      ...relayHeaders,
      Authorization: "Bearer native-token",
    },
  });
  assert.equal(secure.status, 200);
  assert.deepEqual(await secure.json(), { ok: true, query: "relay" });
  const seenSecure = serviceRequests.find((entry) => entry.pathname === clawApiPath("secure"));
  assert.equal(seenSecure?.authorization, "Bearer native-token");
  assert.equal(seenSecure?.relayAuth, undefined);

  const unavailable = await fetch(`${baseUrl}/v1/tenants/demo-tenant/services/missing-service/v1/secure`, {
    headers: relayHeaders,
  });
  assert.equal(unavailable.status, 503);

  const upload = await fetch(`${baseUrl}/v1/tenants/demo-tenant/services/example-service/v1/upload`, {
    method: "POST",
    headers: {
      ...relayHeaders,
      "content-type": "text/plain",
    },
    body: "upload-body",
  });
  assert.equal(upload.status, 201);
  assert.deepEqual(await upload.json(), { size: 11, text: "upload-body" });

  const download = await fetch(`${baseUrl}/v1/tenants/demo-tenant/services/example-service/v1/download`, {
    headers: relayHeaders,
  });
  assert.equal(download.status, 200);
  assert.deepEqual([...new Uint8Array(await download.arrayBuffer())], [0, 1, 2, 3, 255]);

  const events = await fetch(`${baseUrl}/v1/tenants/demo-tenant/services/example-service/v1/events`, {
    headers: {
      ...relayHeaders,
      accept: "text/event-stream",
    },
  });
  assert.equal(events.status, 200);
  const text = await events.text();
  assert.match(text, /data: first/);
  assert.match(text, /data: second/);

  const ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/v1/tenants/demo-tenant/services/example-service/_ws/v1/socket?relay_access_token=${encodeURIComponent(user.accessToken)}`);
  const wsReply = new Promise<string>((resolve) => ws.once("message", (data) => resolve(data.toString())));
  await new Promise<void>((resolve) => ws.once("open", () => resolve()));
  ws.send("hello");
  assert.equal(await wsReply, "ws:hello");
  await closeWebSocket(ws);
});

test("local UI bridge serves the local UI and sends API calls through Relay", async () => {
  const uiServer = http.createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end("<main>local ui</main>");
  });
  const uiUrl = await listen(uiServer);
  const bridge = await startRelayServiceProxy({
    relayUrl: baseUrl,
    tenantId: "demo-tenant",
    serviceId: "example-service",
    email: "user@relay.local",
    password: "relay-user",
    uiUrl,
  });
  try {
    const ui = await fetch(`${bridge.url}/`);
    assert.match(await ui.text(), /local ui/);
    const api = await fetch(`${bridge.url}/v1/secure`, {
      headers: { Authorization: "Bearer native-token" },
    });
    assert.equal(api.status, 200);
    assert.deepEqual(await api.json(), { ok: true, query: null });
  } finally {
    await bridge.close();
    await new Promise<void>((resolve) => uiServer.close(() => resolve()));
  }
});
