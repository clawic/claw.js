import { once } from "node:events";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { test } from "vitest";
import assert from "node:assert/strict";
import BetterSqlite3 from "better-sqlite3";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK, runCli } from "./index.ts";
import { captureStream, useIsolatedClawDataRoot } from "./index-test-utils.ts";

async function createHermesTuiGatewayFixture(options: {
  stateDatabasePath?: string;
} = {}) {
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
    if (payload.method === "session.create" && options.stateDatabasePath) {
      insertHermesStateSession(options.stateDatabasePath, String(sessionId), null);
    }
    if (payload.method === "session.title" && options.stateDatabasePath && sessionId) {
      updateHermesStateSessionTitle(options.stateDatabasePath, String(sessionId), String(payload.params?.title ?? ""));
    }
    if ((payload.method === "prompt.submit" || payload.method === "session.steer") && options.stateDatabasePath && sessionId) {
      insertHermesStateMessage(
        options.stateDatabasePath,
        String(sessionId),
        payload.method === "prompt.submit" ? "user" : "system",
        String(payload.params?.text ?? ""),
      );
    }
    if (payload.method === "session.interrupt" && options.stateDatabasePath && sessionId) {
      updateHermesStateSessionInterrupted(options.stateDatabasePath, String(sessionId));
    }
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

function createHermesStateDatabase(databasePath: string) {
  const db = new BetterSqlite3(databasePath);
  try {
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        source TEXT,
        model TEXT,
        parent_session_id TEXT,
        started_at REAL,
        ended_at REAL,
        end_reason TEXT,
        message_count INTEGER,
        tool_call_count INTEGER,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_write_tokens INTEGER,
        reasoning_tokens INTEGER,
        billing_provider TEXT,
        billing_mode TEXT,
        estimated_cost_usd REAL,
        actual_cost_usd REAL,
        cost_status TEXT,
        api_call_count INTEGER
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT,
        content TEXT,
        timestamp REAL
      );
    `);
  } finally {
    db.close();
  }
}

function insertHermesStateSession(databasePath: string, sessionId: string, title: string | null) {
  const db = new BetterSqlite3(databasePath);
  try {
    db.prepare(`
      INSERT INTO sessions (id, title, source, model, parent_session_id, started_at, ended_at, end_reason, message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, billing_provider, billing_mode, estimated_cost_usd, actual_cost_usd, cost_status, api_call_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, title, "tui_gateway_fixture", "fixture/model", null, 1779746000, null, null, 0, 0, 0, 0, 0, 0, 0, null, null, null, null, "fixture", 0);
  } finally {
    db.close();
  }
}

function updateHermesStateSessionTitle(databasePath: string, sessionId: string, title: string) {
  const db = new BetterSqlite3(databasePath);
  try {
    db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, sessionId);
  } finally {
    db.close();
  }
}

function insertHermesStateMessage(databasePath: string, sessionId: string, role: string, content: string) {
  const db = new BetterSqlite3(databasePath);
  try {
    db.prepare("UPDATE sessions SET message_count = COALESCE(message_count, 0) + 1 WHERE id = ?").run(sessionId);
    const count = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE session_id = ?").get(sessionId) as { count?: number };
    db.prepare("INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)").run(
      `fixture-message-${Number(count.count ?? 0) + 1}`,
      sessionId,
      role,
      content,
      1779746100 + Number(count.count ?? 0),
    );
  } finally {
    db.close();
  }
}

function updateHermesStateSessionInterrupted(databasePath: string, sessionId: string) {
  const db = new BetterSqlite3(databasePath);
  try {
    db.prepare("UPDATE sessions SET ended_at = ?, end_reason = ? WHERE id = ?").run(1779746200, "interrupted", sessionId);
  } finally {
    db.close();
  }
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
    assert.equal(payload.data.supportAudit.evidenceReadinessSummary.statusCounts.blocked_until_production_transport_lifecycle, 4);
    assert.equal(payload.data.supportAudit.evidenceReadinessSummary.tuiGatewayWrapperBlockedCount, 0);
    assert.equal(payload.data.supportAudit.evidenceReadinessSummary.tuiGatewayFixtureBackedCount, 4);
    assert.deepEqual(payload.data.supportAudit.evidenceReadinessSummary.tuiGatewayWrapperRequirementIds, []);
    assert.deepEqual(payload.data.supportAudit.evidenceReadinessSummary.tuiGatewayFixtureBackedRequirementIds, [
      "hermes.sessions.send.action_contract",
      "hermes.sessions.inject.action_contract",
      "hermes.sessions.abort.action_contract",
      "hermes.sessions.create.action_contract",
    ]);
    assert.equal(payload.data.supportAudit.evidenceReadinessSummary.nextRequiredActions.includes("tui_gateway_wrapper_fixture_and_round_trip_evidence"), false);
    assert.equal(payload.data.supportAudit.evidenceReadinessSummary.nextRequiredActions.includes("production_transport_lifecycle_policy_and_native_round_trip_evidence"), true);
    assert.equal(payload.data.supportAudit.finalSupportClaimDecision.blockedPromotionClaims.includes("tui_gateway_wrapper_fixture"), false);
    assert.equal(payload.data.supportAudit.finalSupportClaimDecision.blockedPromotionClaims.includes("production_transport_lifecycle"), true);

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
    assert.equal(create.payload.data.result.roundTripVerification.status, "not_found");
    assert.equal(create.payload.data.result.roundTripVerification.writesRuntime, false);

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

test("Hermes TUI gateway create round-trips through the official SQLite session store fixture", async (t) => {
  const { workspaceRoot, hermesHome } = hermesWorkspace(t);
  const stateDatabasePath = path.join(hermesHome, "state.db");
  createHermesStateDatabase(stateDatabasePath);
  const gateway = await createHermesTuiGatewayFixture({ stateDatabasePath });
  try {
    const create = await runHermesAction([
      "runtime", "hermes", "sessions", "create",
      "--title", "Round Trip Fixture Session",
      "--gateway-url", gateway.url,
      "--confirm-runtime-write",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(create.exitCode), true);
    assert.equal(create.payload.data.status, "ok");
    assert.equal(create.payload.data.result.id, "created-tui-session");
    assert.equal(create.payload.data.result.titleApplied, true);
    assert.equal(create.payload.data.result.roundTripVerification.status, "verified");
    assert.equal(create.payload.data.result.roundTripVerification.id, "created-tui-session");
    assert.equal(create.payload.data.result.roundTripVerification.matchedBy, "sessionId");
    assert.equal(create.payload.data.result.roundTripVerification.writesRuntime, false);
    assert.equal(create.payload.data.result.roundTripVerification.provenance.source, "runtime-session-sqlite");
    assert.deepEqual(gateway.requests.map((entry) => entry.method), [
      "session.create",
      "session.title",
    ]);

    const list = await runHermesAction([
      "runtime", "hermes", "sessions", "list",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(list.exitCode), true);
    assert.equal(list.payload.data.result.totalProjected, 1);
    assert.equal(list.payload.data.result.sessions[0].id, "created-tui-session");
    assert.equal(list.payload.data.result.sessions[0].title, "Round Trip Fixture Session");
    assert.equal(list.payload.data.result.sessions[0].provenance.source, "runtime-session-sqlite");

    const resolve = await runHermesAction([
      "runtime", "hermes", "sessions", "resolve",
      "--session-key", "Round Trip Fixture Session",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(resolve.exitCode), true);
    assert.equal(resolve.payload.data.result.found, true);
    assert.equal(resolve.payload.data.result.id, "created-tui-session");
    assert.equal(resolve.payload.data.result.matchedBy, "sessionTitle");
    assert.equal(resolve.payload.data.result.writesRuntime, false);
    assert.equal(resolve.payload.data.result.provenance.source, "runtime-session-sqlite");
  } finally {
    await gateway.close();
  }
});

test("Hermes TUI gateway send and inject round-trip through native SQLite history fixture", async (t) => {
  const { workspaceRoot, hermesHome } = hermesWorkspace(t);
  const stateDatabasePath = path.join(hermesHome, "state.db");
  createHermesStateDatabase(stateDatabasePath);
  insertHermesStateSession(stateDatabasePath, "message-roundtrip-session", "Message Round Trip Session");
  const gateway = await createHermesTuiGatewayFixture({ stateDatabasePath });
  try {
    const common = [
      "--gateway-url", gateway.url,
      "--confirm-runtime-write",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ];

    const send = await runHermesAction([
      "runtime", "hermes", "sessions", "send",
      "--session-key", "message-roundtrip-session",
      "--message", "fixture visible message",
      ...common,
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(send.exitCode), true);
    assert.equal(send.payload.data.status, "ok");
    assert.equal(send.payload.data.result.roundTripVerification.status, "verified");
    assert.equal(send.payload.data.result.roundTripVerification.id, "message-roundtrip-session");
    assert.equal(send.payload.data.result.roundTripVerification.matchedBy, "messageContent");
    assert.equal(send.payload.data.result.roundTripVerification.messageRole, "user");
    assert.equal(send.payload.data.result.roundTripVerification.writesRuntime, false);
    assert.equal(send.payload.data.result.roundTripVerification.provenance.table, "messages");

    const inject = await runHermesAction([
      "runtime", "hermes", "sessions", "inject",
      "--session-key", "message-roundtrip-session",
      "--message", "fixture steering note",
      ...common,
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(inject.exitCode), true);
    assert.equal(inject.payload.data.status, "ok");
    assert.equal(inject.payload.data.result.roundTripVerification.status, "verified");
    assert.equal(inject.payload.data.result.roundTripVerification.messageRole, "system");
    assert.equal(inject.payload.data.result.roundTripVerification.provenance.source, "runtime-session-sqlite");

    const history = await runHermesAction([
      "runtime", "hermes", "sessions", "history",
      "--session-key", "message-roundtrip-session",
      "--include-content",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(history.exitCode), true);
    assert.equal(history.payload.data.result.messages.some((entry: { contentPreview?: string }) => entry.contentPreview === "fixture visible message"), true);
    assert.equal(history.payload.data.result.messages.some((entry: { contentPreview?: string }) => entry.contentPreview === "fixture steering note"), true);
    assert.deepEqual(gateway.requests.map((entry) => entry.method), [
      "prompt.submit",
      "session.steer",
    ]);
  } finally {
    await gateway.close();
  }
});

test("Hermes TUI gateway abort round-trips through native SQLite control state fixture", async (t) => {
  const { workspaceRoot, hermesHome } = hermesWorkspace(t);
  const stateDatabasePath = path.join(hermesHome, "state.db");
  createHermesStateDatabase(stateDatabasePath);
  insertHermesStateSession(stateDatabasePath, "abort-roundtrip-session", "Abort Round Trip Session");
  const gateway = await createHermesTuiGatewayFixture({ stateDatabasePath });
  try {
    const abort = await runHermesAction([
      "runtime", "hermes", "sessions", "abort",
      "--session-key", "abort-roundtrip-session",
      "--gateway-url", gateway.url,
      "--confirm-runtime-write",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(abort.exitCode), true);
    assert.equal(abort.payload.data.status, "ok");
    assert.equal(abort.payload.data.result.roundTripVerification.status, "verified");
    assert.equal(abort.payload.data.result.roundTripVerification.id, "abort-roundtrip-session");
    assert.equal(abort.payload.data.result.roundTripVerification.endReason, "interrupted");
    assert.equal(abort.payload.data.result.roundTripVerification.endedAt, "2026-05-25T21:56:40.000Z");
    assert.equal(abort.payload.data.result.roundTripVerification.writesRuntime, false);
    assert.equal(abort.payload.data.result.roundTripVerification.provenance.table, "sessions");

    const resolve = await runHermesAction([
      "runtime", "hermes", "sessions", "resolve",
      "--session-key", "abort-roundtrip-session",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(resolve.exitCode), true);
    assert.equal(resolve.payload.data.result.endReason, "interrupted");
    assert.equal(resolve.payload.data.result.endedAt, "2026-05-25T21:56:40.000Z");
    assert.deepEqual(gateway.requests.map((entry) => entry.method), ["session.interrupt"]);
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

test("Hermes TUI gateway token is never emitted in runtime portal JSON", async (t) => {
  const gateway = await createHermesTuiGatewayFixture();
  try {
    const { workspaceRoot, hermesHome } = hermesWorkspace(t);
    const secretToken = ["fixture", "gateway", "token", "must", "not", "leak"].join("-");
    const send = await runHermesAction([
      "runtime", "hermes", "sessions", "send",
      "--session-key", "token-session",
      "--message", "token fixture hello",
      "--gateway-url", gateway.url,
      "--gateway-token", secretToken,
      "--confirm-runtime-write",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);

    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(send.exitCode), true);
    assert.equal(send.payload.data.status, "ok");
    assert.equal(send.payload.data.transportPolicy?.credentialPolicy, "no_credential_or_token_emission");
    assert.equal(JSON.stringify(send.payload).includes(secretToken), false);
    assert.equal(JSON.stringify(gateway.requests).includes(secretToken), false);

    const gatewayResources = await runHermesAction([
      "runtime", "hermes", "resources", "gateway",
      "--gateway-url", gateway.url,
      "--gateway-token", secretToken,
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);
    assert.equal([CLI_EXIT_OK, CLI_EXIT_DEGRADED].includes(gatewayResources.exitCode), true);
    assert.equal(gatewayResources.payload.data.data.resources.some((entry: { id?: string; attributes?: string[] }) => (
      entry.id === "gateway-configuration"
      && entry.attributes?.includes("token configured: true")
      && entry.attributes?.includes("secret policy: redacted_presence_only")
    )), true);
    assert.equal(JSON.stringify(gatewayResources.payload).includes(secretToken), false);
  } finally {
    await gateway.close();
  }
});

test("Hermes confirmed TUI gateway writes reject production and credentialed endpoints", async (t) => {
  for (const gatewayUrl of [
    "http://198.51.100.10:31337",
    "https://hermes-gateway.example.invalid/rpc",
    "ws://127.0.0.1:31337",
    "http://user:pass@127.0.0.1:31337",
    "http://127.0.0.1:31337?token=fixture-secret",
    "http://127.0.0.1:31337?access_token=fixture-secret",
    "http://127.0.0.1:31337?client_secret=fixture-secret",
    "http://127.0.0.1:31337#api_key=fixture-secret",
    "http://127.0.0.1:31337#refresh_token=fixture-secret",
    "http://127.0.0.1:31337#id_token=fixture-secret",
  ]) {
    const { workspaceRoot, hermesHome } = hermesWorkspace(t);
    const { exitCode, payload } = await runHermesAction([
      "runtime", "hermes", "sessions", "send",
      "--session-key", "tui-session",
      "--message", "fixture hello",
      "--gateway-url", gatewayUrl,
      "--confirm-runtime-write",
      "--workspace", workspaceRoot,
      "--home-dir", hermesHome,
      "--json",
    ]);

    assert.equal(exitCode, CLI_EXIT_DEGRADED);
    assert.equal(payload.data.status, "blocked");
    assert.equal(payload.data.requiredEndpoint, "loopback_http_json_rpc");
    assert.equal(payload.data.endpointPolicy, "non_loopback_endpoint_rejected_until_production_transport_lifecycle_policy");
    assert.equal(payload.data.approvalScope, "production_transport_lifecycle_policy_and_non_loopback_endpoint_approval");
    assert.equal(payload.data.productionTransportCommandShape, "blocked_until_approved_production_transport_lifecycle_policy_and_non_loopback_endpoint_approval");
    assert.equal(payload.data.safeDefault, "fixture_only_no_production_transport_contact");
    assert.equal(payload.data.doNotRunWithoutApproval, true);
    assert.equal(payload.data.claimBlockedUntil, "production_transport_lifecycle_policy_and_native_round_trip_evidence_attached");
    assert.equal(payload.data.productDecision, "production_gateway_transport_blocked_until_lifecycle_policy_and_approval");
    assert.equal(payload.data.userVisibleContract, "non_loopback_gateway_endpoint_rejected_until_production_transport_lifecycle_policy");
    assert.equal(payload.data.officialMethod, "prompt.submit");
    assert.equal(payload.data.writesRuntime, false);
    assert.equal(payload.data.transportPolicy?.configuredEndpointClass, "non_loopback_endpoint_rejected");
  }
});
