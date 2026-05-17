import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { buildMCPApp } from "./app.ts";

describe("MCP connector control plane", () => {
  it("exposes Mac Control HTTP planning routes without native execution", async () => {
    const { app, config } = buildFixtureApp();
    try {
      const request = fixtureMacActionRequest();
      const plan = await app.inject({
        method: "POST",
        url: "/v1/mac/plan",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: request,
      });
      assert.equal(plan.statusCode, 200);
      assert.equal(plan.json().capabilityId, "mac.wifi.connect");
      assert.equal(plan.json().risk, "high");
      assert.equal(plan.json().requiredApprovals.length, 1);

      const execute = await app.inject({
        method: "POST",
        url: "/v1/mac/execute",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: request,
      });
      assert.equal(execute.statusCode, 409);
      assert.equal(execute.json().status, "signed_host_required");
      assert.equal(execute.json().plan.capabilityId, "mac.wifi.connect");

      const permissions = await app.inject({
        method: "GET",
        url: "/v1/mac/permissions",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(permissions.statusCode, 200);
      assert.equal(permissions.json().permissions.some((entry: { id: string }) => entry.id === "mac.permission.microphone"), true);
    } finally {
      await app.close();
    }
  });

  it("exposes Mac Control MCP tools as plan-first surfaces", async () => {
    const { app } = buildFixtureApp();
    try {
      const tools = await app.inject({
        method: "POST",
        url: "/v1/mcp/expose/rpc",
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      assert.equal(tools.statusCode, 200);
      assert.equal(tools.json().result.tools.some((entry: { name: string }) => entry.name === "mac.plan"), true);

      const plan = await app.inject({
        method: "POST",
        url: "/v1/mcp/expose/rpc",
        payload: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "mac.plan", arguments: fixtureMacActionRequest() },
        },
      });
      assert.equal(plan.statusCode, 200);
      assert.equal(plan.json().result.content.capabilityId, "mac.wifi.connect");

      const execute = await app.inject({
        method: "POST",
        url: "/v1/mcp/expose/rpc",
        payload: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "mac.execute", arguments: fixtureMacActionRequest() },
        },
      });
      assert.equal(execute.statusCode, 200);
      assert.equal(execute.json().result.content.status, "signed_host_required");
    } finally {
      await app.close();
    }
  });

  it("blocks tool calls without control plane approval", async () => {
    const { app, config } = buildFixtureApp();
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: "/v1/mcp/tools/call",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
        },
      });

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /requires connector control plane approval/);
    } finally {
      await app.close();
    }
  });

  it("blocks denied MCP tool calls before protocol invocation", async () => {
    let toolCalled = false;
    const { app, config } = buildFixtureApp(() => {
      toolCalled = true;
    });
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: "/v1/mcp/tools/call",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
          controlPlane: {
            ...fixtureControlPlane(),
            policy: {
              ...fixtureControlPlane().policy,
              rules: [{
                effect: "deny",
                providerIds: ["mcp:srv_fixture"],
                capabilityIds: ["mcp.tool.call"],
                reason: "MCP tools are paused.",
              }],
            },
          },
          agentPolicy: fixtureAgentPolicy(),
        },
      });

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /policy_denied/);
      assert.equal(toolCalled, false);
    } finally {
      await app.close();
    }
  });

  it("blocks MCP tool calls without an Agents V1 assignment policy", async () => {
    let toolCalled = false;
    const { app, config } = buildFixtureApp(() => {
      toolCalled = true;
    });
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: "/v1/mcp/tools/call",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
          controlPlane: fixtureApprovedControlPlane(),
        },
      });

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /requires Agents V1 assignment policy/);
      assert.equal(toolCalled, false);
    } finally {
      await app.close();
    }
  });

  it("blocks MCP tool calls when the Agents V1 assignment route is not active", async () => {
    let toolCalled = false;
    const { app, config } = buildFixtureApp(() => {
      toolCalled = true;
    });
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: "/v1/mcp/tools/call",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
          controlPlane: fixtureApprovedControlPlane(),
          agentPolicy: fixtureAgentPolicy({ assignmentStatus: "paused" }),
        },
      });

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /MCP Agents V1 assignment route denied execution/);
      assert.equal(toolCalled, false);
    } finally {
      await app.close();
    }
  });

  it("allows MCP tool calls only through a scoped approval grant", async () => {
    const { app, config } = buildFixtureApp();
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: "/v1/mcp/tools/call",
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
          controlPlane: {
            ...fixtureControlPlane(),
            approvalGrant: {
              id: "grant_mcp",
              expiresAt: "2026-05-15T12:10:00.000Z",
              providerIds: ["mcp:srv_fixture"],
              capabilityIds: ["mcp.tool.call"],
              riskTiers: ["system"],
            },
          },
          agentPolicy: fixtureAgentPolicy(),
        },
      });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        ok: true,
        content: [{ type: "text", text: "hello" }],
        error: null,
        durationMs: response.json().durationMs,
      });
      assert.equal(typeof response.json().durationMs, "number");
    } finally {
      await app.close();
    }
  });
});

function fixtureMacActionRequest() {
  return {
    schemaVersion: 1,
    requestId: "req.mcp.mac.1",
    capabilityId: "mac.wifi.connect",
    actor: { kind: "mcp_client", id: "mcp.fixture", role: "operator" },
    host: { hostId: "host.fixture", bundleId: "com.example.Claw" },
    target: { kind: "wifi_network", name: "Office", selector: { ssid: "Office" } },
    arguments: { ssid: "Office", secretRef: "secret_wifi" },
    dryRun: true,
  };
}

function buildFixtureApp(onToolCall?: () => void) {
  return buildMCPApp({
    config: {
      dataDir: path.join(os.tmpdir(), `clawjs-mcp-control-plane-${Date.now()}-${Math.random()}`),
      sharedSecret: "test-secret",
    },
    protocolFetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as { id: string | number; method: string; params?: { arguments?: { text?: string } } };
      if (request.method === "initialize") {
        return jsonResponse({ jsonrpc: "2.0", id: request.id, result: { capabilities: { tools: {} } } });
      }
      if (request.method === "tools/list") {
        return jsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: [{
              name: "echo",
              description: "Echo text.",
              inputSchema: { type: "object", properties: { text: { type: "string" } } },
            }],
          },
        });
      }
      if (request.method === "tools/call") {
        onToolCall?.();
        return jsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: { content: [{ type: "text", text: request.params?.arguments?.text ?? "" }] },
        });
      }
      return jsonResponse({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "unknown" } }, 400);
    },
  });
}

async function registerAndRefreshFixtureServer(app: ReturnType<typeof buildMCPApp>["app"], sharedSecret: string): Promise<void> {
  const register = await app.inject({
    method: "POST",
    url: "/v1/mcp/servers",
    headers: { authorization: `Bearer ${sharedSecret}` },
    payload: {
      id: "srv_fixture",
      name: "fixture",
      transport: "http",
      endpoint: "https://mcp.example.invalid/rpc",
    },
  });
  assert.equal(register.statusCode, 200);

  const refresh = await app.inject({
    method: "POST",
    url: "/v1/mcp/servers/srv_fixture/refresh",
    headers: { authorization: `Bearer ${sharedSecret}` },
    payload: {},
  });
  assert.equal(refresh.statusCode, 200);
}

function fixtureAgentPolicy(input: { assignmentStatus?: "active" | "paused" } = {}) {
  const assignment = {
    id: "assignment.mcp",
    agentId: "agent_mcp",
    kind: "mcp_api" as const,
    status: input.assignmentStatus ?? "active" as const,
    channel: "mcp",
    endpointRef: "mcp://srv_fixture/echo",
    externalDisclosure: "transparent_agent" as const,
  };
  const requested = {
    resourceType: "mcp_tool",
    resourceId: "srv_fixture:echo",
    action: "invoke" as const,
    scopeType: "mcp_server",
    scopeId: "srv_fixture",
  };
  const allow = (id: string) => ({
    id,
    resourceType: "mcp_tool",
    resourceId: "srv_fixture:echo",
    action: "invoke" as const,
    scopeType: "mcp_server",
    scopeId: "srv_fixture",
  });
  return {
    route: {
      assignment,
      kind: "mcp_api" as const,
      channel: "mcp",
      endpointRef: "mcp://srv_fixture/echo",
      now: "2026-05-15T12:00:00.000Z",
    },
    access: {
      requested,
      agentGrants: [allow("agent")],
      assignmentGrants: [allow("assignment")],
      executionProfileGrants: [allow("execution")],
      connectorGrants: [allow("connector")],
      hostGrants: [allow("host")],
      runScopeGrants: [allow("run")],
      now: "2026-05-15T12:00:00.000Z",
    },
  };
}

function fixtureApprovedControlPlane() {
  return {
    ...fixtureControlPlane(),
    approvalGrant: {
      id: "grant_mcp",
      expiresAt: "2026-05-15T12:10:00.000Z",
      providerIds: ["mcp:srv_fixture"],
      capabilityIds: ["mcp.tool.call"],
      riskTiers: ["system"],
    },
  };
}

function fixtureControlPlane() {
  return {
    capabilityId: "mcp.tool.call",
    now: "2026-05-15T12:00:00.000Z",
    context: {
      actorId: "agent_test",
      purpose: "fixture mcp tool call",
      requestId: "req_test",
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
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
