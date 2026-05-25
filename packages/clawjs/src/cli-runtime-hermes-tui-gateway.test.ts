import { once } from "node:events";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, useIsolatedClawDataRoot } from "./index-test-utils.ts";

async function createHermesTuiGatewayFixture() {
  const requests: Array<{ method?: string; params?: Record<string, unknown>; id?: string | number }> = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.end("method not allowed");
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    await once(request, "end");
    const payload = JSON.parse(body);
    requests.push(payload);
    const sessionId = payload.method === "session.create"
      ? "created-tui-session"
      : payload.params?.session_id;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id: payload.id,
      result: {
        accepted: true,
        method: payload.method,
        session_id: sessionId,
      },
    }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function hermesWorkspace(t: any) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-tui-gateway-workspace-"));
  useIsolatedClawDataRoot(t, workspaceRoot);
  const hermesHome = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-hermes-tui-gateway-home-")), ".hermes");
  fs.mkdirSync(hermesHome, { recursive: true });
  return { workspaceRoot, hermesHome };
}

async function runHermesAction(args: string[]) {
  const stdout = captureStream();
  const exitCode = await runCli(args, {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  return {
    exitCode,
    payload: JSON.parse(stdout.getOutput()),
  };
}

test("Hermes TUI gateway session actions require confirmation before contacting the fixture", async (t) => {
  const gateway = await createHermesTuiGatewayFixture();
  try {
    const { workspaceRoot, hermesHome } = hermesWorkspace(t);
    const { exitCode, payload } = await runHermesAction([
      "runtime", "hermes", "sessions", "send",
      "--session-key", "tui-session",
      "--message", "fixture hello",
      "--gateway-url", gateway.url,
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);

    assert.equal(exitCode, CLI_EXIT_DEGRADED);
    assert.equal(payload.data.status, "confirmation_required");
    assert.equal(payload.data.requiredFlag, "--confirm-runtime-write");
    assert.equal(payload.data.officialMethod, "prompt.submit");
    assert.equal(payload.data.transportPolicy?.id, "hermes.tui_gateway.transport_lifecycle_policy");
    assert.equal(payload.data.transportPolicy?.configuredEndpointClass, "loopback_http_json_rpc_fixture");
    assert.equal(payload.data.transportPolicy?.productionTransportStatus, "blocked_until_production_transport_lifecycle_policy");
    assert.equal(payload.data.transportPolicy?.credentialPolicy, "no_credential_or_token_emission");
    assert.equal(gateway.requests.length, 0);
  } finally {
    await gateway.close();
  }
});

test("Hermes runtime portal materializes TUI gateway actions when a loopback fixture is configured", async (t) => {
  const gateway = await createHermesTuiGatewayFixture();
  try {
    const { workspaceRoot, hermesHome } = hermesWorkspace(t);
    const { exitCode, payload } = await runHermesAction([
      "runtime", "hermes", "domains",
      "--gateway-url", gateway.url,
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);

    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(exitCode), true);
    assert.equal(payload.data.domainData.gateway.tuiGatewayTransportPolicy.id, "hermes.tui_gateway.transport_lifecycle_policy");
    assert.equal(payload.data.domainData.gateway.tuiGatewayTransportPolicy.configuredEndpointClass, "loopback_http_json_rpc_fixture");
    assert.equal(payload.data.domainData.gateway.tuiGatewayTransportPolicy.startupPolicy, "no_auto_start_stop_or_install_from_runtime_lens");
    assert.equal(payload.data.domainData.gateway.tuiGatewayTransportPolicy.requiredEvidence.includes("approved_native_round_trip_evidence"), true);
    assert.equal(payload.data.domainData.gateway.resources.some((entry: { id?: string; transportPolicy?: { id?: string } }) => (
      entry.id === "tui-gateway-transport-policy"
      && entry.transportPolicy?.id === "hermes.tui_gateway.transport_lifecycle_policy"
    )), true);
    const actions = new Map((payload.data.domainData.sessions.actionPolicy ?? []).map((entry: { action?: string }) => [entry.action, entry]));
    for (const action of ["send", "inject", "abort", "create"]) {
      const materialized = actions.get(action) as {
        status?: string;
        writesRuntime?: boolean;
        wouldWriteRuntime?: boolean;
        guard?: string;
        materializedBy?: string;
        fixtureBacked?: boolean;
        productionTransportReady?: boolean;
        productionTransportStatus?: string;
        lifecycleStatus?: string;
        transportPolicy?: { id?: string; configuredEndpointClass?: string };
      };
      assert.equal(materialized?.status, "implemented_requires_confirmation");
      assert.equal(materialized?.writesRuntime, true);
      assert.equal(materialized?.wouldWriteRuntime, true);
      assert.equal(materialized?.guard, "requires_confirm_runtime_write");
      assert.equal(materialized?.materializedBy, "loopback_tui_gateway_fixture");
      assert.equal(materialized?.fixtureBacked, true);
      assert.equal(materialized?.productionTransportReady, false);
      assert.equal(materialized?.productionTransportStatus, "blocked_until_production_transport_lifecycle_policy");
      assert.equal(materialized?.lifecycleStatus, "external_user_managed_not_started_by_claw");
      assert.equal(materialized?.transportPolicy?.configuredEndpointClass, "loopback_http_json_rpc_fixture");
    }
    const sendRequirement = payload.data.supportAudit.evidenceRequirements.find((entry: { id?: string }) => entry.id === "hermes.sessions.send.action_contract");
    assert.equal(sendRequirement?.evidenceDisposition, "fixture_backed_tui_gateway_bridge_pending_production_round_trip_evidence");
    assert.equal(sendRequirement?.currentBehavior, "fixture_backed_tui_gateway_action_available_with_confirm_runtime_write");
    assert.equal(sendRequirement?.userVisibleContract, "executable_only_with_confirmation_and_loopback_tui_gateway_fixture_until_production_transport_is_validated");
    assert.match(sendRequirement?.promotionGate ?? "", /production_transport_lifecycle_policy/);
    assert.equal(sendRequirement?.transportPolicyId, "hermes.tui_gateway.transport_lifecycle_policy");
    assert.equal(sendRequirement?.productionTransportStatus, "blocked_until_production_transport_lifecycle_policy");
    assert.equal(sendRequirement?.lifecycleStatus, "external_user_managed_not_started_by_claw");

    const gatewayResources = await runHermesAction([
      "runtime", "hermes", "resources", "gateway",
      "--gateway-url", gateway.url,
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(gatewayResources.exitCode), true);
    assert.equal(gatewayResources.payload.data.data.tuiGatewayTransportPolicy.protocol, "tui_gateway_json_rpc");
    assert.equal(gatewayResources.payload.data.data.tuiGatewayTransportPolicy.mutationPolicy, "no_production_gateway_mutation_without_explicit_approval_and_contract");
    assert.equal(gatewayResources.payload.data.data.resources.some((entry: { id?: string }) => entry.id === "tui-gateway-transport-policy"), true);
    assert.equal(gateway.requests.length, 0);
  } finally {
    await gateway.close();
  }
});

test("Hermes TUI gateway session actions post fixture-backed JSON-RPC when confirmed", async (t) => {
  const gateway = await createHermesTuiGatewayFixture();
  try {
    const { workspaceRoot, hermesHome } = hermesWorkspace(t);
    const common = [
      "--gateway-url", gateway.url,
      "--confirm-runtime-write",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ];

    const send = await runHermesAction([
      "runtime", "hermes", "sessions", "send",
      "--session-key", "tui-session",
      "--message", "fixture hello",
      ...common,
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(send.exitCode), true);
    assert.equal(send.payload.data.status, "ok");
    assert.equal(send.payload.data.writesRuntime, true);
    assert.equal(send.payload.data.officialMethod, "prompt.submit");
    assert.equal(send.payload.data.transportPolicy?.configuredEndpointClass, "loopback_http_json_rpc_fixture");
    assert.equal(send.payload.data.result.gatewayReceipt.method, "prompt.submit");

    const inject = await runHermesAction([
      "runtime", "hermes", "sessions", "inject",
      "--session-key", "tui-session",
      "--message", "steer this",
      ...common,
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(inject.exitCode), true);
    assert.equal(inject.payload.data.status, "ok");
    assert.equal(inject.payload.data.officialMethod, "session.steer");

    const abort = await runHermesAction([
      "runtime", "hermes", "sessions", "abort",
      "--session-key", "tui-session",
      ...common,
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(abort.exitCode), true);
    assert.equal(abort.payload.data.status, "ok");
    assert.equal(abort.payload.data.officialMethod, "session.interrupt");

    const create = await runHermesAction([
      "runtime", "hermes", "sessions", "create",
      "--title", "Created Fixture Session",
      ...common,
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(create.exitCode), true);
    assert.equal(create.payload.data.status, "ok");
    assert.equal(create.payload.data.officialMethod, "session.create");
    assert.equal(create.payload.data.result.id, "created-tui-session");
    assert.equal(create.payload.data.result.titleApplied, true);
    assert.equal(create.payload.data.result.titleGatewayReceipt.method, "session.title");

    assert.deepEqual(gateway.requests.map((entry) => entry.method), [
      "prompt.submit",
      "session.steer",
      "session.interrupt",
      "session.create",
      "session.title",
    ]);
    assert.deepEqual(gateway.requests.map((entry) => entry.params?.session_id), [
      "tui-session",
      "tui-session",
      "tui-session",
      undefined,
      "created-tui-session",
    ]);
    assert.equal(gateway.requests[0]?.params?.text, "fixture hello");
    assert.equal(gateway.requests[1]?.params?.text, "steer this");
    assert.equal("text" in (gateway.requests[2]?.params ?? {}), false);
    assert.equal(gateway.requests[3]?.params?.cols, 80);
    assert.equal(gateway.requests[4]?.params?.title, "Created Fixture Session");
  } finally {
    await gateway.close();
  }
});

test("Hermes confirmed TUI gateway writes stay blocked without an explicit endpoint", async (t) => {
  const { workspaceRoot, hermesHome } = hermesWorkspace(t);
  const { exitCode, payload } = await runHermesAction([
    "runtime", "hermes", "sessions", "send",
    "--session-key", "tui-session",
    "--message", "fixture hello",
    "--confirm-runtime-write",
    "--workspace", workspaceRoot,
    "--home-dir", hermesHome,
    "--json",
  ]);

  assert.equal(exitCode, CLI_EXIT_DEGRADED);
  assert.equal(payload.data.status, "blocked");
  assert.equal(payload.data.requiredFlag, "--gateway-url");
  assert.equal(payload.data.officialMethod, "prompt.submit");
  assert.equal(payload.data.writesRuntime, false);
  assert.equal(payload.data.transportPolicy?.configuredEndpointClass, "none");
  assert.equal(payload.data.transportPolicy?.safeDefault, "fixture_only_no_production_transport_contact");
});
