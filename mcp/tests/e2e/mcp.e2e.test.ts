import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";

import { MCPApiClient, buildMCPApp } from "@clawjs/mcp";

const SECRET = "mcp-e2e-secret";

function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const response = await app.inject({
      method: init?.method ?? "GET",
      url: `${url.pathname}${url.search}`,
      headers: init?.headers as Record<string, string> | undefined,
      payload: init?.body ? String(init.body) : undefined,
    });
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> });
  };
}

async function spinUp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-e2e-"));
  const externalServerApp = buildMCPApp({
    config: { host: "127.0.0.1", port: 0, dataDir: path.join(tmpDir, "ext"), dbPath: path.join(tmpDir, "ext", "core.sqlite"), sharedSecret: "external" },
  }).app;
  const externalFetch = injectFetch(externalServerApp);
  const local = buildMCPApp({
    config: { host: "127.0.0.1", port: 0, dataDir: path.join(tmpDir, "local"), dbPath: path.join(tmpDir, "local", "core.sqlite"), sharedSecret: SECRET },
    protocolFetch: externalFetch,
  });
  const client = new MCPApiClient({ baseUrl: "http://mcp.test", token: SECRET, fetchImpl: injectFetch(local.app) });
  return {
    client,
    externalEndpoint: "http://external.test/v1/mcp/expose/rpc",
    close: async () => { await local.app.close(); await externalServerApp.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); },
  };
}

test("expose endpoint lists default ClawJS tools (clawjs_ping + clawjs_echo)", async () => {
  const ctx = await spinUp();
  try {
    const exposed = await ctx.client.exposed();
    const names = exposed.items.map((tool) => tool.name);
    assert.ok(names.includes("clawjs_ping"));
    assert.ok(names.includes("clawjs_echo"));
    assert.ok(names.includes("clawjs.custom_app_sdk"));
  } finally { await ctx.close(); }
});

test("custom app SDK endpoint exposes schema refs and risk map", async () => {
  const ctx = await spinUp();
  try {
    const payload = await ctx.client.customAppSDK() as {
      mcpRole: string;
      richUiRuntime: string;
      schemaRefs: string[];
      missingSchemaRefs: string[];
      riskMap: { approvalRequired: string[] };
      capabilities: Array<{ id: string; redactionPolicyRef?: string }>;
    };
    assert.equal(payload.mcpRole, "inspection_validation_contract_resource");
    assert.equal(payload.richUiRuntime, "sdk_host_bridge_not_mcp_process");
    assert.deepEqual(payload.missingSchemaRefs, []);
    assert.ok(payload.schemaRefs.includes("claw.db.query.v1"));
    assert.ok(payload.riskMap.approvalRequired.includes("actions.invoke"));
    assert.equal(
      payload.capabilities.find((capability) => capability.id === "resources.read")?.redactionPolicyRef,
      "claw.customApps.redaction.v1",
    );
  } finally { await ctx.close(); }
});

test("register http server + refresh discovers tools and persists with prefix", async () => {
  const ctx = await spinUp();
  try {
    const server = await ctx.client.registerServer({ name: "playground", transport: "http", endpoint: ctx.externalEndpoint });
    assert.equal(server.transport, "http");
    const refreshed = await ctx.client.refreshServer(server.id);
    assert.ok((refreshed.tools as unknown[]).length >= 2);

    const tools = await ctx.client.listTools(server.id);
    const prefixedNames = (tools.items as Array<{ prefixedName: string }>).map((tool) => tool.prefixedName);
    assert.ok(prefixedNames.includes("mcp_playground_clawjs_ping"));
    assert.ok(prefixedNames.includes("mcp_playground_clawjs_echo"));
  } finally { await ctx.close(); }
});

test("call tool via prefixed name returns echoed content", async () => {
  const ctx = await spinUp();
  try {
    const server = await ctx.client.registerServer({ name: "playground", transport: "http", endpoint: ctx.externalEndpoint });
    await ctx.client.refreshServer(server.id);
    const result = await ctx.client.callTool(
      "mcp_playground_clawjs_echo",
      { message: "hola mcp" },
      fixtureControlPlane(server.id),
      fixtureAgentPolicy(server.id),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.content, { echo: "hola mcp" });
    assert.ok(result.durationMs >= 0);
  } finally { await ctx.close(); }
});

test("stdio refresh returns 501 (not implemented in this build)", async () => {
  const ctx = await spinUp();
  try {
    const server = await ctx.client.registerServer({ name: "stdio-server", transport: "stdio", endpoint: "/usr/local/bin/mcp-server" });
    await assert.rejects(() => ctx.client.refreshServer(server.id), /501|stdio/);
  } finally { await ctx.close(); }
});

test("remove server cascades tool deletion", async () => {
  const ctx = await spinUp();
  try {
    const server = await ctx.client.registerServer({ name: "playground", transport: "http", endpoint: ctx.externalEndpoint });
    await ctx.client.refreshServer(server.id);
    const before = await ctx.client.listTools(server.id);
    assert.ok((before.items as unknown[]).length > 0);

    await ctx.client.removeServer(server.id);
    const after = await ctx.client.listTools(server.id);
    assert.equal((after.items as unknown[]).length, 0);
  } finally { await ctx.close(); }
});

test("rpc tools/call against missing tool returns 404", async () => {
  const ctx = await spinUp();
  try {
    const server = await ctx.client.registerServer({ name: "playground", transport: "http", endpoint: ctx.externalEndpoint });
    await ctx.client.refreshServer(server.id);
    await assert.rejects(() => ctx.client.callTool("mcp_playground_does_not_exist", {}, fixtureControlPlane(server.id)), /tool_not_found|404/);
  } finally { await ctx.close(); }
});

function fixtureControlPlane(serverId: string) {
  return {
    capabilityId: "mcp.tool.call",
    now: "2026-05-15T12:00:00.000Z",
    context: {
      actorId: "agent_e2e",
      purpose: "mcp e2e fixture",
      requestId: "req_mcp_e2e",
    },
    policy: {
      id: "fixture_policy",
      enabled: true,
      defaultEffect: "allow" as const,
      requireContext: true,
      blockUnsupported: true,
      blockMissingCredentialBinding: true,
      rules: [],
      traceMode: "redacted" as const,
    },
    approvalGrant: {
      id: "grant_mcp_e2e",
      expiresAt: "2026-05-15T12:10:00.000Z",
      providerIds: [`mcp:${serverId}`],
      capabilityIds: ["mcp.tool.call"],
      riskTiers: ["system" as const],
    },
  };
}

function fixtureAgentPolicy(serverId: string) {
  const assignment = {
    id: "assignment.mcp.e2e",
    agentId: "agent_mcp_e2e",
    kind: "mcp_api" as const,
    status: "active" as const,
    channel: "mcp",
    endpointRef: `mcp://${serverId}/clawjs_echo`,
    externalDisclosure: "transparent_agent" as const,
  };
  const grant = {
    resourceType: "mcp_tool",
    resourceId: `${serverId}:clawjs_echo`,
    action: "invoke" as const,
    scopeType: "mcp_server",
    scopeId: serverId,
  };
  return {
    route: {
      assignment,
      kind: "mcp_api" as const,
      channel: "mcp",
      endpointRef: `mcp://${serverId}/clawjs_echo`,
      now: "2026-05-15T12:00:00.000Z",
    },
    access: {
      requested: grant,
      agentGrants: [{ ...grant, id: "agent" }],
      assignmentGrants: [{ ...grant, id: "assignment" }],
      executionProfileGrants: [{ ...grant, id: "execution" }],
      connectorGrants: [{ ...grant, id: "connector" }],
      hostGrants: [{ ...grant, id: "host" }],
      runScopeGrants: [{ ...grant, id: "run" }],
      now: "2026-05-15T12:00:00.000Z",
    },
  };
}
