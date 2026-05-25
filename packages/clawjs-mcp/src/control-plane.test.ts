import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { registeredPublicApiRoute } from "../../../tests/helpers/stable-surface-test-builders";

import { buildMCPApp } from "./app.ts";
import type { MacSignedHostBridge } from "./mac-signed-host-bridge.ts";

describe("MCP connector control plane", () => {
  it("exposes Mac Control HTTP planning routes without native execution", async () => {
    const { app, config } = buildFixtureApp();
    try {
      const request = fixtureMacActionRequest();
      const plan = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mac.plan"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: request,
      });
      assert.equal(plan.statusCode, 200);
      assert.equal(plan.json().capabilityId, "mac.wifi.connect");
      assert.equal(plan.json().risk, "high");
      assert.equal(plan.json().requiredApprovals.length, 1);

      const execute = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mac.execute"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: request,
      });
      assert.equal(execute.statusCode, 409);
      assert.equal(execute.json().status, "signed_host_required");
      assert.equal(execute.json().plan.capabilityId, "mac.wifi.connect");

      const permissions = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.mac.permissions"),
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
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      assert.equal(tools.statusCode, 200);
      assert.equal(tools.json().result.tools.some((entry: { name: string }) => entry.name === "mac.plan"), true);

      const plan = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
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
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
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

  it("exposes custom app SDK contracts through HTTP and MCP tools", async () => {
    const { app, config } = buildFixtureApp();
    try {
      const http = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.mcp.exposeCustomAppSdk"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(http.statusCode, 200);
      assert.equal(http.json().mcpRole, "inspection_validation_contract_resource");
      assert.equal(http.json().richUiRuntime, "sdk_host_bridge_not_mcp_process");
      assert.deepEqual(http.json().missingSchemaRefs, []);
      assert.equal(http.json().schemaRefs.includes("claw.search.query.v1"), true);
      assert.equal(http.json().schemaRefs.includes("claw.mac.actionRequest.v1"), true);
      assert.equal(http.json().schemaRefs.includes("claw.customApp.request.partial.v1"), true);
      assert.equal(http.json().capabilities.some((capability: { id: string }) => capability.id === "search.query"), true);
      assert.equal(http.json().capabilities.some((capability: { id: string }) => capability.id === "mac.action.plan"), true);
      const mac = http.json().capabilities.find((capability: { id: string }) => capability.id === "mac.action.plan");
      const actions = http.json().capabilities.find((capability: { id: string }) => capability.id === "actions.invoke");
      assert.equal(mac.dispatch.mode, "approvalRequiredPlanOnly");
      assert.equal(actions.dispatch.mode, "approvalRequiredNoRunner");
      assert.equal(http.json().riskMap.approvalRequired.includes("actions.invoke"), true);

      const tools = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      assert.equal(tools.statusCode, 200);
      assert.equal(tools.json().result.tools.some((entry: { name: string }) => entry.name === "clawjs.custom_app_sdk"), true);

      const rpc = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "clawjs.custom_app_sdk", arguments: {} },
        },
      });
      assert.equal(rpc.statusCode, 200);
      assert.equal(rpc.json().result.content.missingSchemaRefs.length, 0);
      assert.equal(rpc.json().result.content.capabilities.some((capability: { id: string }) => capability.id === "resources.read"), true);
    } finally {
      await app.close();
    }
  });

  it("exposes system telemetry MCP tools as read-only agent context", async () => {
    const { app } = buildFixtureApp();
    try {
      const tools = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });
      assert.equal(tools.statusCode, 200);
      const toolNames = tools.json().result.tools.map((entry: { name: string }) => entry.name);
      assert.equal(toolNames.includes("system.snapshot"), true);
      assert.equal(toolNames.includes("system.metrics"), true);
      assert.equal(toolNames.includes("system.widgets"), true);
      assert.equal(toolNames.includes("system.providers"), true);
      assert.equal(toolNames.includes("system.provider_plan"), true);
      assert.equal(toolNames.includes("system.controls"), true);
      assert.equal(toolNames.includes("system.control_plan"), true);
      assert.equal(toolNames.includes("system.history"), true);
      const providerPlanTool = tools.json().result.tools.find((entry: { name: string }) => entry.name === "system.provider_plan");
      assert.equal(providerPlanTool.inputSchema.properties.credentialRef.description.includes("Public credential lease reference"), true);
      assert.equal(providerPlanTool.inputSchema.properties.credentialRef.not.anyOf.some((rule: { pattern: string }) => rule.pattern === "secret://"), true);
      assert.equal(providerPlanTool.inputSchema.properties.credentialRef.not.anyOf.some((rule: { pattern: string }) => rule.pattern === "file://"), true);

      const snapshot = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "system.snapshot", arguments: {} },
        },
      });
      assert.equal(snapshot.statusCode, 200);
      assert.equal(snapshot.json().result.content.policy.defaultAgentAccess, "safe_read");
      assert.equal(snapshot.json().result.content.samples.some((entry: { key: string }) => entry.key === "system.memory.used"), true);

      const widgets = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "system.widgets", arguments: {} },
        },
      });
      assert.equal(widgets.statusCode, 200);
      assert.equal(widgets.json().result.content.widgets.some((entry: { id: string }) => entry.id === "cpu-load"), true);

      const providers = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "system.providers", arguments: {} },
        },
      });
      assert.equal(providers.statusCode, 200);
      assert.equal(providers.json().result.content.providers.some((entry: { kind: string; mode: string }) => entry.kind === "weather" && entry.mode === "mock"), true);

      const providerPlan = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 45,
          method: "tools/call",
          params: { name: "system.provider_plan", arguments: { providerId: "context.weather.live", reason: "test-plan" } },
        },
      });
      assert.equal(providerPlan.statusCode, 200);
      assert.equal(providerPlan.json().result.content.provider.metrics.includes("context.weather.temperature"), true);
      assert.equal(providerPlan.json().result.content.willConnect, false);
      assert.equal(providerPlan.json().result.content.broker.failClosed, true);
      assert.equal(providerPlan.json().result.content.auditPlan.status, "planned");
      assert.equal(providerPlan.json().result.content.auditPlan.redaction.credentialRefRedacted, true);
      assert.equal(providerPlan.json().result.content.auditPlan.receiptStatus, "not_issued");
      assert.equal(providerPlan.json().result.content.steps.some((entry: { id: string; status: string }) => entry.id === "connect_provider" && entry.status === "blocked"), true);

      const providerPlanWithCredential = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 46,
          method: "tools/call",
          params: { name: "system.provider_plan", arguments: { providerId: "context.weather.live", credentialRef: "credential-lease:weather-local", reason: "credential-test" } },
        },
      });
      assert.equal(providerPlanWithCredential.statusCode, 200);
      assert.equal(providerPlanWithCredential.json().result.content.request.credentialRef, "provided_redacted");
      assert.equal(JSON.stringify(providerPlanWithCredential.json()).includes("credential-lease:weather-local"), false);

      const providerPlanWithUnsafeCredential = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 47,
          method: "tools/call",
          params: { name: "system.provider_plan", arguments: { providerId: "context.weather.live", credentialRef: "secret://weather/local", reason: "unsafe-credential-test" } },
        },
      });
      assert.equal(providerPlanWithUnsafeCredential.statusCode, 400);
      assert.equal(providerPlanWithUnsafeCredential.json().error.message, "invalid_tool_arguments");
      assert.equal(JSON.stringify(providerPlanWithUnsafeCredential.json()).includes("secret://weather/local"), false);

      const controls = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "system.controls", arguments: {} },
        },
      });
      assert.equal(controls.statusCode, 200);
      assert.equal(controls.json().result.content.mutatesHardware, false);
      assert.equal(controls.json().result.content.controls.some((entry: { id: string; requiresSignedHostBroker: boolean }) => entry.id === "system.power.sleep" && entry.requiresSignedHostBroker), true);

      const plan = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "system.control_plan", arguments: { controlId: "system.audio.set_output_volume", target: "default", value: "35" } },
        },
      });
      assert.equal(plan.statusCode, 200);
      assert.equal(plan.json().result.content.willExecute, false);
      assert.equal(plan.json().result.content.broker.failClosed, true);
      assert.equal(plan.json().result.content.receipt.auditEvent, "system.telemetry.control.audio.set_output_volume");
      assert.equal(plan.json().result.content.auditPlan.redaction.valueRedacted, true);
      assert.equal(plan.json().result.content.auditPlan.receiptStatus, "not_issued");
    } finally {
      await app.close();
    }
  });

  it("serves system telemetry HTTP routes from catalog and Monitor history without creating stores", async () => {
    const { app, config } = buildFixtureApp();
    const monitorDb = path.join(os.tmpdir(), `clawjs-mcp-system-history-${Date.now()}-${Math.random()}`, "monitor.sqlite");
    try {
      const metrics = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.system.metrics"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(metrics.statusCode, 200);
      assert.equal(metrics.json().metrics.some((entry: { key: string }) => entry.key === "system.cpu.load1"), true);
      assert.equal(metrics.json().metrics.some((entry: { key: string }) => entry.key === "context.weather.temperature"), true);

      const snapshot = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.system.snapshot"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(snapshot.statusCode, 200);
      assert.equal(snapshot.json().policy.controlsRequireSignedHostBroker, true);

      const widgets = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.system.widgets"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(widgets.statusCode, 200);
      assert.equal(widgets.json().widgets.some((entry: { placement: string }) => entry.placement === "menu_bar" || entry.placement === "both"), true);

      const providers = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.system.providers"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(providers.statusCode, 200);
      assert.equal(providers.json().providers.some((entry: { kind: string; status: string }) => entry.kind === "custom_metric" && entry.status === "ready"), true);

      const providerPlan = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.system.providersPlan"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: { providerId: "context.weather.live", reason: "test-plan" },
      });
      assert.equal(providerPlan.statusCode, 200);
      assert.equal(providerPlan.json().provider.metrics.includes("context.weather.temperature"), true);
      assert.equal(providerPlan.json().request.reason, "test-plan");
      assert.equal(providerPlan.json().willConnect, false);
      assert.equal(providerPlan.json().auditPlan.redaction.preciseLocationRedacted, true);
      assert.equal(providerPlan.json().auditPlan.receiptStatus, "not_issued");
      assert.equal(providerPlan.json().steps.some((entry: { id: string; status: string }) => entry.id === "resolve_credential_ref" && entry.status === "blocked"), true);

      const providerPlanWithCredential = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.system.providersPlan"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: { providerId: "context.weather.live", credentialRef: "credential-lease:weather-local", reason: "credential-test" },
      });
      assert.equal(providerPlanWithCredential.statusCode, 200);
      assert.equal(providerPlanWithCredential.json().request.credentialRef, "provided_redacted");
      assert.equal(JSON.stringify(providerPlanWithCredential.json()).includes("credential-lease:weather-local"), false);

      const providerPlanWithUnsafeCredential = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.system.providersPlan"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: { providerId: "context.weather.live", credentialRef: "secret://weather/local", reason: "unsafe-credential-test" },
      });
      assert.equal(providerPlanWithUnsafeCredential.statusCode, 200);
      assert.equal(providerPlanWithUnsafeCredential.json().error, "unsafe_credential_ref");

      const controls = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.system.controls"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(controls.statusCode, 200);
      assert.equal(controls.json().mutatesHardware, false);
      assert.equal(controls.json().controls.some((entry: { family: string }) => entry.family === "display"), true);

      const controlPlan = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.system.controlsPlan"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: { controlId: "system.display.set_brightness", target: "main", value: "70", reason: "test-plan" },
      });
      assert.equal(controlPlan.statusCode, 200);
      assert.equal(controlPlan.json().request.reason, "test-plan");
      assert.equal(controlPlan.json().willExecute, false);
      assert.equal(controlPlan.json().steps.some((entry: { id: string; status: string }) => entry.id === "execute_native_action" && entry.status === "blocked"), true);

      const history = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.system.history", { metricKey: "system.memory.used" }, { range: "1h", monitorDb: monitorDb }),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(history.statusCode, 200);
      assert.equal(history.json().metric.key, "system.memory.used");
      assert.equal(history.json().retention.status, "empty");
      assert.equal(history.json().samples.length, 0);
      assert.deepEqual(history.json().chart, {
        kind: "line",
        metricKey: "system.memory.used",
        unit: "bytes",
        source: "empty",
        points: [],
        empty: true,
      });
      assert.deepEqual(history.json().render, {
        kind: "ascii_sparkline",
        metricKey: "system.memory.used",
        unit: "bytes",
        source: "empty",
        width: 24,
        line: "",
        min: null,
        max: null,
        empty: true,
      });
      assert.equal(fs.existsSync(monitorDb), false);
    } finally {
      await app.close();
    }
  });

  it("routes Mac execute, audit and permissions through the configured signed host bridge", async () => {
    const calls: string[] = [];
    const bridge: MacSignedHostBridge = {
      execute: async (request) => {
        calls.push(`execute:${request.requestId}`);
        return { ok: true, requestId: request.requestId, data: { decision: "dry_run" }, meta: { source: "local_cli" } };
      },
      revert: async (receiptId) => {
        calls.push(`revert:${receiptId}`);
        return { ok: false, data: { receiptId, status: "plan_required" } };
      },
      audit: async () => {
        calls.push("audit");
        return { ok: true, data: { events: [] }, meta: { source: "local_cli" } };
      },
      permissions: async (request) => {
        calls.push(request?.command === "request" ? `permissions:${request.permissionId}:${request.confirm}` : "permissions");
        return { ok: true, data: { permissions: [{ id: "mac.permission.microphone", status: "not_determined" }] }, meta: { source: "local_cli" } };
      },
    };
    const { app, config } = buildFixtureApp(undefined, bridge);
    try {
      const execute = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mac.execute"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: fixtureMacActionRequest(),
      });
      assert.equal(execute.statusCode, 200);
      assert.equal(execute.json().ok, true);
      assert.equal(execute.json().requestId, "req.mcp.mac.1");
      assert.equal(execute.json().meta.source, "local_cli");

      const audit = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.mac.audit"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(audit.statusCode, 200);
      assert.deepEqual(audit.json().data.events, []);

      const permissions = await app.inject({
        method: "GET",
        url: registeredPublicApiRoute("claw.api.mac.permissions"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
      });
      assert.equal(permissions.statusCode, 200);
      assert.equal(permissions.json().data.permissions[0].id, "mac.permission.microphone");

      const permissionRequest = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mac.permissionsRequest"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: { permissionId: "mac.permission.microphone", confirm: false },
      });
      assert.equal(permissionRequest.statusCode, 200);

      const mcpExecute = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "mac.execute", arguments: fixtureMacActionRequest() },
        },
      });
      assert.equal(mcpExecute.statusCode, 200);
      assert.equal(mcpExecute.json().result.content.ok, true);

      const mcpPermissionRequest = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.exposeRpc"),
        payload: {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "mac.permissions",
            arguments: { command: "request", permissionId: "mac.permission.microphone", confirm: false },
          },
        },
      });
      assert.equal(mcpPermissionRequest.statusCode, 200);

      assert.deepEqual(calls, [
        "execute:req.mcp.mac.1",
        "audit",
        "permissions",
        "permissions:mac.permission.microphone:false",
        "execute:req.mcp.mac.1",
        "permissions:mac.permission.microphone:false",
      ]);
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
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
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
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
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

  it("blocks MCP tool calls when the connector policy is disabled", async () => {
    let toolCalled = false;
    const { app, config } = buildFixtureApp(() => {
      toolCalled = true;
    });
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
          controlPlane: {
            ...fixtureApprovedControlPlane(),
            policy: {
              ...fixtureControlPlane().policy,
              enabled: false,
            },
          },
          agentPolicy: fixtureAgentPolicy(),
        },
      });

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /policy_disabled/);
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
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
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
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
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

  it("blocks invalid MCP tool arguments before protocol invocation", async () => {
    let toolCalled = false;
    const { app, config } = buildFixtureApp(() => {
      toolCalled = true;
    });
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: {},
          controlPlane: fixtureApprovedControlPlane(),
          agentPolicy: fixtureAgentPolicy(),
        },
      });

      assert.equal(response.statusCode, 400);
      assert.match(response.body, /invalid_tool_arguments/);
      assert.match(response.body, /missing required property: text/);
      assert.equal(toolCalled, false);
    } finally {
      await app.close();
    }
  });

  it("blocks regulated MCP tool calls before protocol invocation", async () => {
    let toolCalled = false;
    const { app, config } = buildFixtureApp(() => {
      toolCalled = true;
    });
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "submit this patient diagnosis" },
          controlPlane: {
            ...fixtureApprovedControlPlane(),
            regulatedDomains: ["health"],
            decisionEffects: ["final_decision"],
            requiresSensitiveExportReview: true,
            thirdPartyDisclosure: true,
          },
          agentPolicy: fixtureAgentPolicy(),
        },
      });

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /regulated_safety_blocked/);
      assert.equal(toolCalled, false);
    } finally {
      await app.close();
    }
  });

  it("allows MCP tool calls only through a scoped connector grant", async () => {
    const { app, config } = buildFixtureApp();
    try {
      await registerAndRefreshFixtureServer(app, config.sharedSecret);
      const response = await app.inject({
        method: "POST",
        url: registeredPublicApiRoute("claw.api.mcp.toolsCall"),
        headers: { authorization: `Bearer ${config.sharedSecret}` },
        payload: {
          prefixedName: "mcp_fixture_echo",
          args: { text: "hello" },
          controlPlane: {
            ...fixtureControlPlane(),
            scopedGrant: {
              id: "grant_mcp",
              expiresAt: "2026-05-15T12:10:00.000Z",
              approvalEvidenceId: "approval_mcp",
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

function buildFixtureApp(onToolCall?: () => void, macSignedHostBridge?: MacSignedHostBridge) {
  return buildMCPApp({
    config: {
      dataDir: path.join(os.tmpdir(), `clawjs-mcp-control-plane-${Date.now()}-${Math.random()}`),
      sharedSecret: "test-secret",
    },
    macSignedHostBridge,
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
              inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
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
    url: registeredPublicApiRoute("claw.api.mcp.servers"),
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
    url: registeredPublicApiRoute("claw.api.mcp.serversRefresh", { serverId: "srv_fixture" }),
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
    scopedGrant: {
      id: "grant_mcp",
      expiresAt: "2026-05-15T12:10:00.000Z",
      approvalEvidenceId: "approval_mcp",
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
