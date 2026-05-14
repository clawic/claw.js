const STABLE_EVENT_TYPES = {
  browserInput: "browser.input",
} as const;
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import WebSocket from "ws";

import { buildRelayApp } from "../../src/server/app.ts";
import { RelayLogger } from "../../src/server/logger.ts";
import { deriveAssignmentWorkspaceId, deriveRuntimeAgentId } from "../../src/shared/project-model.ts";
import { buildIotApp } from "../../../iot/src/server/app.ts";
import { startFakeConnector } from "./relay.e2e-utils.ts";

let baseUrl = "";
let appRef: Awaited<ReturnType<typeof buildRelayApp>> | null = null;
let logger: RelayLogger;
let iotRef: ReturnType<typeof buildIotApp> | null = null;
let iotBaseUrl = "";

before(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-e2e-"));
  const iotDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-iot-e2e-"));
  iotRef = buildIotApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(iotDir, ".data"),
      dbPath: path.join(iotDir, ".data", "clawjs.sqlite"),
    },
  });
  await iotRef.app.listen({ host: "127.0.0.1", port: 0 });
  const iotAddress = iotRef.app.server.address();
  if (!iotAddress || typeof iotAddress === "string") {
    throw new Error("Failed to resolve iot address");
  }
  iotBaseUrl = `http://127.0.0.1:${iotAddress.port}`;
  logger = new RelayLogger();
  appRef = await buildRelayApp({
    logger,
    config: {
      port: 0,
      host: "127.0.0.1",
      dbPath: path.join(tempDir, "infra.sqlite"),
      jwtSecrets: ["relay-e2e-secret"],
      publicBaseUrl: "http://127.0.0.1:4410",
      loginRateLimitMax: 100,
      iotBaseUrl,
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
  await iotRef?.app.close();
});

async function login(email: string, password: string) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantId: "demo-tenant" }),
  });
  assert.equal(response.status, 200);
  return await response.json() as {
    accessToken: string;
    refreshToken: string;
    deviceId: string;
  };
}

describe("relay e2e", () => {
  test("shared brand assets and fonts are served from repo public", async () => {
    const sharedAssetsDir = path.resolve(process.cwd(), "..", "assets");

    const logoResponse = await fetch(`${baseUrl}/brand/logo.png`);
    assert.equal(logoResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await logoResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedAssetsDir, "logo.png")),
    );

    const faviconResponse = await fetch(`${baseUrl}/brand/favicon.ico`);
    assert.equal(faviconResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await faviconResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedAssetsDir, "favicon.ico")),
    );

    const fontResponse = await fetch(`${baseUrl}/brand/fonts/source-sans-3/source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2`);
    assert.equal(fontResponse.status, 200);
    assert.deepEqual(
      Buffer.from(await fontResponse.arrayBuffer()),
      fs.readFileSync(path.join(sharedAssetsDir, "fonts", "source-sans-3", "source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2")),
    );
  });

  test("tailscale private hosts are accepted without forwarded https", async () => {
    const response = await fetch(`${baseUrl}/v1/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "100.64.0.42:5299",
      },
      body: JSON.stringify({
        email: "user@relay.local",
        password: "relay-user",
        tenantId: "demo-tenant",
      }),
    });
    assert.equal(response.status, 200);
  });

  test("relay forwards home-scoped iot state, actions, approvals, and stream", async () => {
    const { accessToken } = await login("user@relay.local", "relay-user");

    const stateResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/homes/home_main/state`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json() as { snapshot: { things: Array<{ id: string }> } };
    assert.ok(statePayload.snapshot.things.some((thing) => thing.id === "office-light"));

    const approvalResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/homes/home_main/actions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ family: "lock", selector: "front door", action: "unlock" }),
    });
    assert.equal(approvalResponse.status, 200);
    const approvalPayload = await approvalResponse.json() as { result: { approvalId?: string; status: string } };
    assert.equal(approvalPayload.result.status, "approval_required");
    assert.ok(approvalPayload.result.approvalId);

    const approvalsResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/homes/home_main/approvals`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(approvalsResponse.status, 200);
    const approvalsPayload = await approvalsResponse.json() as { approvals: Array<{ id: string; status: string }> };
    assert.equal(approvalsPayload.approvals[0]?.status, "pending");

    const streamResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/homes/home_main/events/stream`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(streamResponse.status, 200);
    const reader = streamResponse.body?.getReader();
    const firstChunk = reader ? await reader.read() : { value: undefined };
    const chunkText = firstChunk.value ? Buffer.from(firstChunk.value).toString("utf8") : "";
    assert.match(chunkText, /event: ready/);
    await reader?.cancel();
    reader?.releaseLock();
  });

  test("relay forwards content workspace routes for brands, variants, plans, runs, and read models", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const adminTokens = await login("admin@relay.local", "relay-admin");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "content-agent", description: "content connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "content-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const brandResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/brands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Relay Brand" }),
    });
    assert.equal(brandResponse.status, 200);
    const brandId = (await brandResponse.json() as { brand: { id: string } }).brand.id;

    const destinationResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/destinations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ brandId, name: "Relay Destination", kind: "webhook", publishPolicy: "autopublish" }),
    });
    const destinationId = (await destinationResponse.json() as { destination: { id: string } }).destination.id;

    const entryResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ brandId, title: "Relay entry", canonicalBody: "Relay body", canonicalFormat: "markdown", contentType: "post" }),
    });
    const entryId = (await entryResponse.json() as { entry: { id: string } }).entry.id;

    const generatedResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/entries/${entryId}/variants:generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ destinationIds: [destinationId] }),
    });
    const variantId = (await generatedResponse.json() as { variants: Array<{ id: string }> }).variants[0]!.id;

    const planResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/plans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ variantId }),
    });
    const planId = (await planResponse.json() as { plan: { id: string } }).plan.id;

    const runResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/plans/${planId}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
    });
    const runPayload = await runResponse.json() as { run: { id: string; status: string } };
    assert.equal(runPayload.run.status, "succeeded");

    const publicationsResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/publications`, {
      headers: {
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
    });
    const publicationsPayload = await publicationsResponse.json() as { runs: Array<{ id: string }> };
    assert.ok(publicationsPayload.runs.some((run) => run.id === runPayload.run.id));

    const dashboardResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/content-agent/workspaces/main/content/app/dashboard`, {
      headers: {
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
    });
    assert.equal(dashboardResponse.status, 200);
    const dashboardPayload = await dashboardResponse.json() as { metrics: { drafts: number } };
    assert.ok(typeof dashboardPayload.metrics.drafts === "number");

    socket.close();
  });

  test("monitor stream publishes agent snapshots and live session deltas", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const adminTokens = await login("admin@relay.local", "relay-admin");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "monitor-agent", description: "monitor connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };
    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    assert.equal(connectorEnroll.status, 200);
    const { connectorToken } = await connectorEnroll.json() as { connectorToken: string };
    const socket = startFakeConnector(baseUrl, connectorToken, "monitor-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const monitorResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/monitor/stream?clientId=e2e-monitor`, {
      headers: { authorization: `Bearer ${adminTokens.accessToken}` },
    });
    assert.equal(monitorResponse.status, 200);
    const reader = monitorResponse.body?.getReader();
    assert.ok(reader);
    const decoder = new TextDecoder();
    let monitorText = "";

    try {
      const firstChunk = await reader.read();
      monitorText += firstChunk.value ? decoder.decode(firstChunk.value) : "";
      assert.match(monitorText, /event: monitor\.snapshot/);
      assert.match(monitorText, /monitor-agent/);

      const createSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/monitor-agent/workspaces/main/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${userTokens.accessToken}`,
        },
        body: JSON.stringify({ title: "monitor stream" }),
      });
      assert.equal(createSession.status, 200);
      const created = await createSession.json() as { session: { sessionId: string } };

      const streamResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/monitor-agent/workspaces/main/sessions/${created.session.sessionId}/stream?message=hello`, {
        headers: { authorization: `Bearer ${userTokens.accessToken}` },
      });
      assert.equal(streamResponse.status, 200);
      await streamResponse.text();

      for (let i = 0; i < 8 && !monitorText.includes("monitor.session.delta"); i += 1) {
        const chunk = await reader.read();
        monitorText += chunk.value ? decoder.decode(chunk.value) : "";
      }
      assert.match(monitorText, /event: monitor\.session\.start/);
      assert.match(monitorText, /event: monitor\.session\.delta/);
      assert.match(monitorText, /hello /);
      assert.match(monitorText, /event: monitor\.session\.end/);
    } finally {
      await reader.cancel();
      reader.releaseLock();
      socket.close();
    }
  });

  test("login, refresh, logout, connector enrollment, routing, CRUD, SSE, offline and admin protection", async () => {
    const userTokens = await login("user@relay.local", "relay-user");

    const myDevices = await fetch(`${baseUrl}/v1/me/devices`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(myDevices.status, 200);
    const devicesPayload = await myDevices.json() as { devices: Array<{ deviceId: string }> };
    assert.equal(devicesPayload.devices[0]?.deviceId, userTokens.deviceId);

    const refreshResponse = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: userTokens.refreshToken }),
    });
    assert.equal(refreshResponse.status, 200);
    const refreshed = await refreshResponse.json() as { accessToken: string; refreshToken: string };
    assert.ok(refreshed.accessToken);
    assert.ok(refreshed.refreshToken);

    const logoutResponse = await fetch(`${baseUrl}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshed.refreshToken }),
    });
    assert.equal(logoutResponse.status, 200);

    const forbiddenAdmin = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "demo-agent" }),
    });
    assert.equal(forbiddenAdmin.status, 403);

    const adminTokens = await login("admin@relay.local", "relay-admin");
    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "demo-agent", description: "e2e connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "demo-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const agentsResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const agentsPayload = await agentsResponse.json() as { agents: Array<{ agentId: string; status: string }> };
    const demoAgent = agentsPayload.agents.find((agent) => agent.agentId === "demo-agent");
    assert.equal(demoAgent?.status, "online");

    const workspacesResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const workspacesPayload = await workspacesResponse.json() as { workspaces: Array<{ workspaceId: string }> };
    assert.equal(workspacesPayload.workspaces.some((workspace) => workspace.workspaceId === "main"), true);

    const myWorkspaces = await fetch(`${baseUrl}/v1/me/workspaces`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(myWorkspaces.status, 200);
    const myWorkspacesPayload = await myWorkspaces.json() as { workspaces: Array<{ workspaceId: string }> };
    assert.equal(myWorkspacesPayload.workspaces.some((workspace) => workspace.workspaceId === "main"), true);

    const workspaceFileWrite = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/agents/demo-agent/workspaces/main/workspace-files/SOUL.md`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ content: "# demo" }),
    });
    assert.equal(workspaceFileWrite.status, 200);

    const workspaceFileRead = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/agents/demo-agent/workspaces/main/workspace-files/SOUL.md`, {
      headers: {
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
    });
    assert.equal(workspaceFileRead.status, 200);
    const workspaceFilePayload = await workspaceFileRead.json() as { file: string };
    assert.equal(workspaceFilePayload.file, "# demo");

    const offlineBefore = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/missing-agent/workspaces/main/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(offlineBefore.status, 503);

    const createSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "E2E session", message: "hello relay" }),
    });
    const sessionPayload = await createSession.json() as { session: SessionRecord };
    const sessionId = sessionPayload.session.sessionId;
    assert.ok(sessionId);

    const documentContent = Buffer.from("budget alpha", "utf8").toString("base64");
    const uploadDocument = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "budget.txt",
        mimeType: "text/plain",
        data: documentContent,
        sessionId,
      }),
    });
    assert.equal(uploadDocument.status, 200);
    const uploadPayload = await uploadDocument.json() as { document: RelayDocumentRecord };
    assert.ok(uploadPayload.document.documentId);

    const uploadDuplicateDocument = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "budget-copy.txt",
        mimeType: "text/plain",
        data: documentContent,
        sessionId,
      }),
    });
    assert.equal(uploadDuplicateDocument.status, 200);
    const duplicateUploadPayload = await uploadDuplicateDocument.json() as { document: RelayDocumentRecord };
    assert.notEqual(duplicateUploadPayload.document.documentId, uploadPayload.document.documentId);
    assert.equal(duplicateUploadPayload.document.storage.path, uploadPayload.document.storage.path);

    const registerDocument = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({
        filePath: "reports/plan.txt",
        name: "plan.txt",
        mimeType: "text/plain",
        sessionId,
      }),
    });
    assert.equal(registerDocument.status, 200);
    const registeredPayload = await registerDocument.json() as { document: RelayDocumentRecord };
    assert.equal(registeredPayload.document.storage.kind, "workspace_path");

    const listDocuments = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents?sessionId=${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listDocuments.status, 200);
    const listedDocuments = await listDocuments.json() as { documents: RelayDocumentRecord[] };
    assert.equal(listedDocuments.documents.length, 3);

    const appendDocumentMessage = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({
        role: "user",
        content: "review attached budget",
        documentIds: [uploadPayload.document.documentId],
      }),
    });
    assert.equal(appendDocumentMessage.status, 200);

    const readSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(readSession.status, 200);
    const readSessionPayload = await readSession.json() as { session: SessionRecord };
    assert.equal(readSessionPayload.session.messages.some((message) => (
      message.documents?.some((document) => document.documentId === uploadPayload.document.documentId)
    )), true);

    const patchSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Patched" }),
    });
    assert.equal(patchSession.status, 200);

    const replyResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ message: "ping" }),
    });
    const replyPayload = await replyResponse.json() as { reply: string };
    assert.equal(replyPayload.reply, "pong from relay");

    const streamResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}/stream?message=streaming`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const streamText = await streamResponse.text();
    assert.match(streamText, /event: chunk/);
    assert.match(streamText, /hello world/);

    const streamPostResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({
        message: "streaming with docs",
        documentIds: [uploadPayload.document.documentId],
      }),
    });
    const streamPostText = await streamPostResponse.text();
    assert.match(streamPostText, /event: chunk/);
    assert.match(streamPostText, /hello world/);

    const searchDocuments = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents:search?q=${encodeURIComponent("budget")}&sessionId=${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(searchDocuments.status, 200);
    const searchPayload = await searchDocuments.json() as {
      documents: Array<RelayDocumentRecord & { snippet: string; score: number; sourcePath: string }>;
    };
    assert.equal(searchPayload.documents.some((document) => document.documentId === uploadPayload.document.documentId), true);

    const getDocument = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents/${uploadPayload.document.documentId}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(getDocument.status, 200);

    const downloadDocument = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/documents/${uploadPayload.document.documentId}/download`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(downloadDocument.status, 200);
    const downloadedText = Buffer.from(await downloadDocument.arrayBuffer()).toString("utf8");
    assert.equal(downloadedText, "budget alpha");

    const taskCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Task 1" }),
    });
    const task = await taskCreate.json() as { task: { id: string } };
    assert.ok(task.task.id);

    const goalCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/goals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Goal 1" }),
    });
    assert.equal(goalCreate.status, 200);

    const projectCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Project 1" }),
    });
    assert.equal(projectCreate.status, 200);

    const noteCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Note 1" }),
    });
    assert.equal(noteCreate.status, 200);

    const memoryCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Memory 1" }),
    });
    assert.equal(memoryCreate.status, 200);

    const peopleCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ displayName: "Alice" }),
    });
    assert.equal(peopleCreate.status, 200);

    const reminderCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/reminders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Reminder 1", triggerAt: "2026-04-15T09:00:00.000Z" }),
    });
    assert.equal(reminderCreate.status, 200);

    const deadlineCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/deadlines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Deadline 1", dueAt: "2026-04-16T09:00:00.000Z" }),
    });
    assert.equal(deadlineCreate.status, 200);

    const eventCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Launch" }),
    });
    assert.equal(eventCreate.status, 200);

    const personaCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/personas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Researcher" }),
    });
    assert.equal(personaCreate.status, 200);

    const pluginCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/plugins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ name: "search" }),
    });
    assert.equal(pluginCreate.status, 200);

    const routineCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/routines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ label: "Daily" }),
    });
    assert.equal(routineCreate.status, 200);

    const imagesCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ prompt: "diagram" }),
    });
    assert.equal(imagesCreate.status, 200);

    const skillsList = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/skills/list`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(skillsList.status, 200);

    const integrations = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/integrations/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(integrations.status, 200);

    const activity = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/activity`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const activityPayload = await activity.json() as { activity: Array<{ capability: string }> };
    assert.ok(activityPayload.activity.some((entry) => entry.capability === "sessions.reply"));

    const usage = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/usage`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const usagePayload = await usage.json() as { usage: Array<{ tokensOut: number }> };
    assert.ok((usagePayload.usage[0]?.tokensOut ?? 0) > 0);

    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));

    const offlineAfter = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(offlineAfter.status, 503);
  });

  test("device pairing boots a connector, grants restrict one device, replay is blocked, and revoke disconnects the connector", async () => {
    const adminTokens = await login("admin@relay.local", "relay-admin");
    const userPrimary = await login("user@relay.local", "relay-user");
    const userRestricted = await login("user@relay.local", "relay-user");

    const startPairing = await fetch(`${baseUrl}/v1/connectors/device/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: "pairing-connector", agentId: "pairing-agent", displayName: "Pairing Connector" }),
    });
    assert.equal(startPairing.status, 200);
    const pairing = await startPairing.json() as {
      pairingId: string;
      deviceCode: string;
      connectorId: string;
      agentId: string;
    };
    assert.equal(pairing.connectorId, "pairing-connector");
    assert.equal(pairing.agentId, "pairing-agent");

    const approvePairing = await fetch(`${baseUrl}/v1/pairings/${pairing.pairingId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminTokens.accessToken}` },
    });
    assert.equal(approvePairing.status, 200);

    const pollApproved = await fetch(`${baseUrl}/v1/connectors/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode: pairing.deviceCode }),
    });
    assert.equal(pollApproved.status, 200);
    const approvedPayload = await pollApproved.json() as {
      status: string;
      connectorToken: string;
      connectorId: string;
      agentId: string;
    };
    assert.equal(approvedPayload.status, "approved");
    assert.equal(approvedPayload.connectorId, "pairing-connector");
    assert.equal(approvedPayload.agentId, "pairing-agent");

    const pollReplay = await fetch(`${baseUrl}/v1/connectors/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode: pairing.deviceCode }),
    });
    assert.equal(pollReplay.status, 409);

    const socket = startFakeConnector(baseUrl, approvedPayload.connectorToken, "pairing-agent", "pairing-connector");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const createWorkspace = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/agents/pairing-agent/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ workspaceId: "restricted", displayName: "Restricted" }),
    });
    assert.equal(createWorkspace.status, 200);

    const grantWorkspace = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/workspace-grants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: userRestricted.deviceId,
        agentId: "pairing-agent",
        workspaceId: "restricted",
      }),
    });
    assert.equal(grantWorkspace.status, 200);

    const restrictedVisibleWorkspaces = await fetch(`${baseUrl}/v1/me/workspaces`, {
      headers: { Authorization: `Bearer ${userRestricted.accessToken}` },
    });
    assert.equal(restrictedVisibleWorkspaces.status, 200);
    const restrictedVisiblePayload = await restrictedVisibleWorkspaces.json() as { workspaces: Array<{ workspaceId: string }> };
    assert.deepEqual(restrictedVisiblePayload.workspaces.map((workspace) => workspace.workspaceId), ["restricted"]);

    const forbiddenMain = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/pairing-agent/workspaces/main/status`, {
      headers: { Authorization: `Bearer ${userRestricted.accessToken}` },
    });
    assert.equal(forbiddenMain.status, 403);

    const allowedRestricted = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/pairing-agent/workspaces/restricted/status`, {
      headers: { Authorization: `Bearer ${userRestricted.accessToken}` },
    });
    assert.equal(allowedRestricted.status, 200);

    const unrestrictedMain = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/pairing-agent/workspaces/main/status`, {
      headers: { Authorization: `Bearer ${userPrimary.accessToken}` },
    });
    assert.equal(unrestrictedMain.status, 200);

    const revokeConnector = await fetch(`${baseUrl}/v1/admin/connectors/pairing-connector/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant" }),
    });
    assert.equal(revokeConnector.status, 200);

    await new Promise((resolve) => socket.once("close", () => resolve(null)));

    const offlineAfterRevoke = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/pairing-agent/workspaces/restricted/status`, {
      headers: { Authorization: `Bearer ${userPrimary.accessToken}` },
    });
    assert.equal(offlineAfterRevoke.status, 503);
  });

  test("browser session routes expose shared state, control, and frame streaming", async () => {
    const adminTokens = await login("admin@relay.local", "relay-admin");
    const userTokens = await login("user@relay.local", "relay-user");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "browser-agent", description: "browser connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "browser-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const grantWorkspace = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/workspace-grants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        deviceId: userTokens.deviceId,
        agentId: "browser-agent",
        workspaceId: "main",
      }),
    });
    assert.equal(grantWorkspace.status, 200);

    const idleResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/browser-agent/workspaces/main/browser/session`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    if (idleResponse.status !== 200) assert.fail(await idleResponse.text());
    const idlePayload = await idleResponse.json() as { session: { status: string; active: boolean } };
    assert.equal(idlePayload.session.status, "idle");
    assert.equal(idlePayload.session.active, false);

    const ensured = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/browser-agent/workspaces/main/browser/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ initialUrl: "http://localhost:4300/login" }),
    });
    assert.equal(ensured.status, 200);
    const ensuredPayload = await ensured.json() as {
      session: { active: boolean; navigation: { displayUrl: string } };
      shareUrl: string;
    };
    assert.equal(ensuredPayload.session.active, true);
    assert.equal(ensuredPayload.session.navigation.displayUrl, "Local preview");
    assert.match(ensuredPayload.shareUrl, /browser\/demo-tenant\/browser-agent\/main$/);

    const browserWs = new WebSocket(
      `${baseUrl.replace(/^http/, "ws")}/v1/tenants/demo-tenant/agents/browser-agent/workspaces/main/browser/events?access_token=${encodeURIComponent(userTokens.accessToken)}`,
    );
    const firstMessages: Array<Record<string, unknown>> = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for browser events")), 10_000);
      browserWs.on("message", (buffer) => {
        firstMessages.push(JSON.parse(buffer.toString()) as Record<string, unknown>);
        const hasState = firstMessages.some((entry) => entry.type === "browser.state");
        const hasFrame = firstMessages.some((entry) => entry.type === "browser.frame");
        if (hasState && hasFrame) {
          clearTimeout(timer);
          resolve();
        }
      });
      browserWs.once("error", reject);
    });
    assert.ok(firstMessages.some((entry) => entry.type === "browser.state"));
    assert.ok(firstMessages.some((entry) => entry.type === "browser.frame"));

    const acquire = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/browser-agent/workspaces/main/browser/control/acquire`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(acquire.status, 200);
    const acquirePayload = await acquire.json() as { session: { controller: { deviceId: string } | null } };
    assert.equal(acquirePayload.session.controller?.deviceId, userTokens.deviceId);

    const wsCommandResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for browser command result")), 10_000);
      const onMessage = (buffer: WebSocket.RawData) => {
        const payload = JSON.parse(buffer.toString()) as Record<string, unknown>;
        if (payload.type === "browser.state" && payload.reason === "input-applied") {
          clearTimeout(timer);
          browserWs.off("message", onMessage);
          resolve(payload);
        }
      };
      browserWs.on("message", onMessage);
      browserWs.send(JSON.stringify({
        type: STABLE_EVENT_TYPES.browserInput,
        command: { type: "key", key: "Enter" },
      }));
    });
    assert.equal(wsCommandResult.type, "browser.state");

    const release = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/browser-agent/workspaces/main/browser/control/release`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(release.status, 200);
    const releasePayload = await release.json() as { session: { controller: null } };
    assert.equal(releasePayload.session.controller, null);

    browserWs.close();
    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));
  });

  test("denied pairings are blocked", async () => {
    const adminTokens = await login("admin@relay.local", "relay-admin");
    const startPairing = await fetch(`${baseUrl}/v1/connectors/device/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: "deny-connector", agentId: "deny-agent" }),
    });
    assert.equal(startPairing.status, 200);
    const pairing = await startPairing.json() as { pairingId: string; deviceCode: string };

    const denyPairing = await fetch(`${baseUrl}/v1/pairings/${pairing.pairingId}/deny`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminTokens.accessToken}` },
    });
    assert.equal(denyPairing.status, 200);

    const deniedPoll = await fetch(`${baseUrl}/v1/connectors/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode: pairing.deviceCode }),
    });
    assert.equal(deniedPoll.status, 403);
  });

  test("logs redact secrets from connector errors", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const response = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/tasks`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(response.status, 503);
    logger.error("Authorization: Bearer secret-token-12345678");
    const found = logger.entries.some((entry) => entry.message.includes("****5678") && !entry.message.includes("secret-token-12345678"));
    assert.equal(found, true);
  });

  test("project assignments expose project-scoped routes and preserve legacy workspace compatibility", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const adminTokens = await login("admin@relay.local", "relay-admin");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "project-agent", description: "project connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "project-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const createProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        projectId: "alpha-app",
        displayName: "Alpha App",
        description: "Mobile application launch.",
        instructions: "Always reason about Alpha App context first.",
        resourceRefs: [{ id: "docs", label: "Docs", uri: "https://docs.alpha.app", mode: "allow" }],
        secretRefs: [{ id: "deploy", label: "Deploy token", secretName: "alpha_deploy", mode: "allow" }],
      }),
    });
    assert.equal(createProject.status, 200);

    const attachAgent = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        agentDisplayName: "DevOps",
        agentRole: "devops",
        agentInstructions: "Ship safely.",
        agentResourceRefs: [{ id: "docs", label: "Docs", uri: "https://docs.alpha.app", mode: "allow" }],
        agentSecretRefs: [{ id: "deploy", label: "Deploy token", secretName: "alpha_deploy", mode: "allow" }],
        displayName: "Alpha App / DevOps",
        instructions: "Only deploy from protected branches.",
        resourceRefs: [{ id: "docs", label: "Docs", uri: "https://docs.alpha.app", mode: "deny" }],
        secretRefs: [{ id: "deploy", label: "Deploy token", secretName: "alpha_deploy", mode: "deny" }],
      }),
    });
    assert.equal(attachAgent.status, 200);
    const assignmentPayload = await attachAgent.json() as {
      assignment: {
        workspaceId: string;
        runtimeAgentId: string;
        effectiveAccessPolicy: {
          resources: Array<{ id: string; mode?: string }>;
          secrets: Array<{ id: string; mode?: string }>;
        };
      };
    };

    const expectedWorkspaceId = deriveAssignmentWorkspaceId("alpha-app", "project-agent");
    const expectedRuntimeAgentId = deriveRuntimeAgentId("alpha-app", "project-agent");
    assert.equal(assignmentPayload.assignment.workspaceId, expectedWorkspaceId);
    assert.equal(assignmentPayload.assignment.runtimeAgentId, expectedRuntimeAgentId);
    assert.equal(assignmentPayload.assignment.effectiveAccessPolicy.resources[0]?.mode, "deny");
    assert.equal(assignmentPayload.assignment.effectiveAccessPolicy.secrets[0]?.mode, "deny");

    const listProjects = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjects.status, 200);

    const listProjectAgents = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjectAgents.status, 200);
    const projectAgentsPayload = await listProjectAgents.json() as {
      agents: Array<{
        workspaceId: string;
        runtimeAgentId: string;
        effectiveAccessPolicy: {
          resources: Array<{ id: string; mode?: string }>;
          secrets: Array<{ id: string; mode?: string }>;
        };
      }>;
    };
    assert.equal(projectAgentsPayload.agents[0]?.workspaceId, expectedWorkspaceId);
    assert.equal(projectAgentsPayload.agents[0]?.runtimeAgentId, expectedRuntimeAgentId);
    assert.equal(projectAgentsPayload.agents[0]?.effectiveAccessPolicy.resources[0]?.mode, "deny");

    const listAgentProjects = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/projects`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listAgentProjects.status, 200);
    const agentProjectsPayload = await listAgentProjects.json() as {
      projects: Array<{ projectId: string; workspaceId: string; runtimeAgentId: string }>;
    };
    assert.equal(agentProjectsPayload.projects[0]?.projectId, "alpha-app");
    assert.equal(agentProjectsPayload.projects[0]?.workspaceId, expectedWorkspaceId);
    assert.equal(agentProjectsPayload.projects[0]?.runtimeAgentId, expectedRuntimeAgentId);

    const legacyWorkspaces = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(legacyWorkspaces.status, 200);
    const legacyWorkspacesPayload = await legacyWorkspaces.json() as { workspaces: Array<{ workspaceId: string }> };
    assert.equal(legacyWorkspacesPayload.workspaces.some((workspace) => workspace.workspaceId === expectedWorkspaceId), true);

    const createProjectSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Deploy plan", message: "prepare deploy" }),
    });
    assert.equal(createProjectSession.status, 200);
    const createdSession = await createProjectSession.json() as { session: SessionRecord };

    const projectReply = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/sessions/${createdSession.session.sessionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ message: "ship it" }),
    });
    assert.equal(projectReply.status, 200);

    const projectTasks = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Cut release" }),
    });
    assert.equal(projectTasks.status, 200);

    const projectStatus = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(projectStatus.status, 200);

    const legacySessionList = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces/${expectedWorkspaceId}/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(legacySessionList.status, 200);
    const legacySessionsPayload = await legacySessionList.json() as { sessions: Array<{ sessionId: string }> };
    assert.equal(legacySessionsPayload.sessions.some((session) => session.sessionId === createdSession.session.sessionId), true);

    const secondProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        projectId: "beta-app",
        displayName: "Beta App",
      }),
    });
    assert.equal(secondProject.status, 200);

    const attachSecondProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/beta-app/agents/project-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        agentDisplayName: "DevOps",
        displayName: "Beta App / DevOps",
      }),
    });
    assert.equal(attachSecondProject.status, 200);
    const secondWorkspaceId = deriveAssignmentWorkspaceId("beta-app", "project-agent");

    const createSecondSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/beta-app/agents/project-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Beta deploy" }),
    });
    assert.equal(createSecondSession.status, 200);

    const alphaLegacySessions = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces/${expectedWorkspaceId}/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const alphaLegacyPayload = await alphaLegacySessions.json() as { sessions: Array<{ title: string }> };
    assert.equal(alphaLegacyPayload.sessions.some((session) => session.title === "Deploy plan"), true);
    assert.equal(alphaLegacyPayload.sessions.some((session) => session.title === "Beta deploy"), false);

    const betaLegacySessions = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces/${secondWorkspaceId}/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const betaLegacyPayload = await betaLegacySessions.json() as { sessions: Array<{ title: string }> };
    assert.equal(betaLegacyPayload.sessions.some((session) => session.title === "Beta deploy"), true);
    assert.equal(betaLegacyPayload.sessions.some((session) => session.title === "Deploy plan"), false);

    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));
  });

  test("project assignment routes expose the payload shape consumed by the ios client", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const adminTokens = await login("admin@relay.local", "relay-admin");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "ios-agent", description: "ios contract connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "ios-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const createProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        projectId: "ios-chat",
        displayName: "iOS Chat",
        description: "Native chat surface",
      }),
    });
    assert.equal(createProject.status, 200);

    const attachAgent = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        agentDisplayName: "Support Agent",
        agentRole: "support",
        agentInstructions: "Handle mobile user chats.",
        displayName: "iOS Chat / Support Agent",
      }),
    });
    assert.equal(attachAgent.status, 200);

    const createSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Mobile thread", message: "hello relay" }),
    });
    assert.equal(createSession.status, 200);
    const createdSessionPayload = await createSession.json() as { session: SessionRecord };
    assert.equal(createdSessionPayload.session.messageCount, 1);
    assert.equal(createdSessionPayload.session.preview, "hello relay");

    const listProjects = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjects.status, 200);
    const projectsPayload = await listProjects.json() as {
      projects: Array<{ projectId: string; displayName: string; description: string }>;
    };
    assert.equal(projectsPayload.projects.some((project) => project.projectId === "ios-chat" && project.displayName === "iOS Chat"), true);

    const listProjectAgents = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjectAgents.status, 200);
    const agentsPayload = await listProjectAgents.json() as {
      agents: Array<{ agentId: string; displayName: string; agent?: { displayName?: string; role?: string; description?: string } }>;
    };
    const iosAgent = agentsPayload.agents.find((agent) => agent.agentId === "ios-agent");
    assert.equal(iosAgent?.agent?.displayName, "Support Agent");
    assert.equal(iosAgent?.agent?.role, "support");

    const listSessions = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listSessions.status, 200);
    const sessionsPayload = await listSessions.json() as {
      sessions: Array<{ sessionId: string; title: string; createdAt: number; updatedAt: number; messageCount: number; preview: string }>;
    };
    assert.equal(sessionsPayload.sessions[0]?.sessionId, createdSessionPayload.session.sessionId);
    assert.equal(typeof sessionsPayload.sessions[0]?.createdAt, "number");
    assert.equal(typeof sessionsPayload.sessions[0]?.updatedAt, "number");
    assert.equal(sessionsPayload.sessions[0]?.messageCount, 1);
    assert.equal(sessionsPayload.sessions[0]?.preview, "hello relay");

    const readSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions/${createdSessionPayload.session.sessionId}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(readSession.status, 200);
    const sessionPayload = await readSession.json() as { session: SessionRecord };
    assert.equal(sessionPayload.session.sessionId, createdSessionPayload.session.sessionId);
    assert.equal(sessionPayload.session.messages.at(-1)?.content, "hello relay");
    assert.equal(sessionPayload.session.messageCount, 1);

    const streamResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions/${createdSessionPayload.session.sessionId}/stream?message=ship`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(streamResponse.status, 200);
    const streamText = await streamResponse.text();
    assert.match(streamText, /event: chunk/);
    assert.match(streamText, /"delta":"hello "/);
    assert.match(streamText, /event: complete/);

    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));
  });

  test("login rate limiting eventually rejects repeated bad credentials", async () => {
    const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-rate-limit-"));
    const isolated = await buildRelayApp({
      logger: new RelayLogger(),
      config: {
        port: 0,
        host: "127.0.0.1",
        dbPath: path.join(isolatedDir, "infra.sqlite"),
        jwtSecrets: ["relay-rate-limit-secret"],
        publicBaseUrl: "http://127.0.0.1:4410",
        loginRateLimitMax: 3,
      },
    });
    await isolated.app.listen({ host: "127.0.0.1", port: 0 });
    const address = isolated.app.server.address();
    assert.ok(address && typeof address !== "string");
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;
    try {
      let lastStatus = 0;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${isolatedBaseUrl}/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "user@relay.local", password: "wrong-password", tenantId: "demo-tenant" }),
        });
        lastStatus = response.status;
        if (lastStatus === 429) break;
      }
      assert.equal(lastStatus, 429);
    } finally {
      await isolated.app.close();
    }
  });
});
