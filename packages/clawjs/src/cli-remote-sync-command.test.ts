import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./inspect-cli-test-support.ts";

function coordinatorSigningFlags(workspace: string): string[] {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privateKeyFile = path.join(workspace, "coordinator-private.pem");
  const publicKeyFile = path.join(workspace, "coordinator-public.pem");
  fs.writeFileSync(privateKeyFile, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");
  fs.writeFileSync(publicKeyFile, publicKey.export({ type: "spki", format: "pem" }), "utf8");
  return ["--coordinator-private-key-file", privateKeyFile, "--coordinator-public-key-file", publicKeyFile, "--coordinator-key-id", "coordinator.test"];
}

test("nodes returns JSON usage errors for unknown subcommands", async () => {
  const result = await runCliCapture(["nodes", "definitely_missing", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: {
        received?: string | null;
        validSubcommands?: string[];
      };
    };
    meta: { canonicalCommand: string; subcommand?: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_nodes_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.nodes.subcommand");
  assert.equal(payload.error.safeNextStep.includes("claw nodes list --json"), true);
  assert.equal(payload.error.details?.received, "definitely_missing");
  assert.deepEqual(payload.error.details?.validSubcommands, ["list", "pair", "trust", "revoke", "invite", "accept", "share", "heartbeat"]);
  assert.equal(payload.meta.canonicalCommand, "nodes");
  assert.equal(payload.meta.subcommand, "definitely_missing");
});

test("nodes list exposes stable identity fingerprints and mutable locators", async () => {
  const result = await runCliCapture(["nodes", "list", "--json"], process.cwd());

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    data: {
      nodes: Array<{
        nodeId: string;
        nodeFingerprint: string;
        observedLocators: Array<{ kind: string; value: string; authority: boolean }>;
        operationalSummary: {
          bounded: boolean;
          startsPolling: boolean;
          grantsAuthority: boolean;
          healthSummary: { status: string };
          capacitySummary: { status: string };
        };
      }>;
    };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.data.nodes.length > 0, true);
  assert.equal(payload.data.nodes.every((node) => node.nodeFingerprint.startsWith("sha256:")), true);
  assert.equal(payload.data.nodes.every((node) => node.observedLocators.every((locator) => locator.authority === false)), true);
  assert.equal(payload.data.nodes.every((node) => node.operationalSummary.bounded === true), true);
  assert.equal(payload.data.nodes.every((node) => node.operationalSummary.startsPolling === false), true);
  assert.equal(payload.data.nodes.every((node) => node.operationalSummary.grantsAuthority === false), true);
  assert.equal(payload.data.nodes.every((node) => node.operationalSummary.healthSummary.status === "offline"), true);
  assert.equal(payload.data.nodes.every((node) => node.operationalSummary.capacitySummary.status === "unknown"), true);
});

test("browser credential-fill returns only redacted receipts for a safe password submit", async () => {
  const result = await runCliCapture([
    "browser", "credential-fill",
    "--session-id", "session.login",
    "--profile-id", "profile.login",
    "--node-id", "node.browser",
    "--agent-id", "agent.browser",
    "--secret-ref", "vault://logins/example",
    "--lease-id", "lease.login",
    "--field-kind", "password",
    "--field-target", "css:input[type=password]",
    "--allowed-origin", "https://example.com",
    "--observed-origin", "https://example.com",
    "--submit-policy", "submit_after_fill",
    "--broker-isolated", "true",
    "--host-audit-persisted", "true",
    "--trusted-node", "true",
    "--physical-broker-available", "true",
    "--now", "2026-05-17T10:00:00.000Z",
    "--expires-at", "2026-05-17T10:10:00.000Z",
    "--json",
  ], process.cwd());

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("password123"), false);
  assert.equal(result.stdout.includes("otpauth://"), false);
  const payload = JSON.parse(result.stdout) as {
    data: {
      status: string;
      receipt: {
        fillStatus: string;
        submitted: boolean;
        plaintextReturned: boolean;
        totpSeedReturned: boolean;
        totpCodeReturned: boolean;
        cookieMaterialReturned: boolean;
        domFieldValueReturned: boolean;
      };
    };
  };
  assert.equal(payload.data.status, "filled");
  assert.equal(payload.data.receipt.fillStatus, "filled");
  assert.equal(payload.data.receipt.submitted, true);
  assert.equal(payload.data.receipt.plaintextReturned, false);
  assert.equal(payload.data.receipt.totpSeedReturned, false);
  assert.equal(payload.data.receipt.totpCodeReturned, false);
  assert.equal(payload.data.receipt.cookieMaterialReturned, false);
  assert.equal(payload.data.receipt.domFieldValueReturned, false);
});

test("browser credential-fill fails closed for unsafe TOTP fill conditions", async () => {
  const result = await runCliCapture([
    "browser", "credential-fill",
    "--session-id", "session.login",
    "--profile-id", "profile.login",
    "--node-id", "node.browser",
    "--agent-id", "agent.browser",
    "--secret-ref", "vault://logins/example",
    "--lease-id", "lease.login",
    "--field-kind", "totp",
    "--field-target", "css:#otp",
    "--allowed-origin", "https://example.com",
    "--observed-origin", "https://evil.example",
    "--broker-isolated", "false",
    "--host-audit-persisted", "true",
    "--trusted-node", "true",
    "--physical-broker-available", "true",
    "--agent-raw-browser-read", "true",
    "--now", "2026-05-17T10:00:00.000Z",
    "--expires-at", "2026-05-17T10:10:00.000Z",
    "--json",
  ], process.cwd());

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("otpauth://"), false);
  assert.equal(result.stdout.includes("123456"), false);
  const payload = JSON.parse(result.stdout) as {
    data: {
      status: string;
      receipt: {
        blockedReasons: string[];
        handoffRequired: boolean;
        totpCodeReturned: boolean;
        plaintextReturned: boolean;
      };
    };
  };
  assert.equal(payload.data.status, "handoff_required");
  assert.equal(payload.data.receipt.handoffRequired, true);
  assert.equal(payload.data.receipt.blockedReasons.includes("origin_mismatch"), true);
  assert.equal(payload.data.receipt.blockedReasons.includes("missing_broker_isolation"), true);
  assert.equal(payload.data.receipt.blockedReasons.includes("unsafe_agent_browser_read"), true);
  assert.equal(payload.data.receipt.totpCodeReturned, false);
  assert.equal(payload.data.receipt.plaintextReturned, false);
});

test("browser session share uses configured human node before presence", async () => {
  const result = await runCliCapture([
    "browser", "session", "share",
    "--session-id", "session.login",
    "--profile-id", "profile.login",
    "--node-id", "node.browser",
    "--agent-id", "agent.browser",
    "--allowed-origin", "https://example.com",
    "--default-human-node", "node.human.default",
    "--presence-node", "node.human.active",
    "--trusted-node", "true",
    "--now", "2026-05-17T10:00:00.000Z",
    "--json",
  ], process.cwd());

  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout) as {
    data: {
      status: string;
      preference: { selectedNodeId: string; selectionReason: string; configWinsOverPresence: boolean };
      receipt: { targetNodeId: string; defaultHumanNodeUsed: boolean; presenceSignalUsed: boolean; status: string };
    };
  };
  assert.equal(payload.data.status, "opened");
  assert.equal(payload.data.preference.selectedNodeId, "node.human.default");
  assert.equal(payload.data.preference.selectionReason, "manual_default");
  assert.equal(payload.data.preference.configWinsOverPresence, true);
  assert.equal(payload.data.receipt.targetNodeId, "node.human.default");
  assert.equal(payload.data.receipt.defaultHumanNodeUsed, true);
  assert.equal(payload.data.receipt.presenceSignalUsed, false);
});

test("browser session handoff rejects live cookie sync and accepts closed encrypted profile transfer", async () => {
  const blocked = await runCliCapture([
    "browser", "session", "handoff",
    "--session-id", "session.login",
    "--profile-id", "profile.login",
    "--node-id", "node.source",
    "--agent-id", "agent.browser",
    "--allowed-origin", "https://example.com",
    "--to-node", "node.target",
    "--source-session-closed", "false",
    "--source-profile-locked", "false",
    "--encrypted-for-target", "true",
    "--target-node-trusted", "true",
    "--live-cookie-sync", "true",
    "--now", "2026-05-17T10:00:00.000Z",
    "--json",
  ], process.cwd());
  assert.equal(blocked.code, 0);
  const blockedPayload = JSON.parse(blocked.stdout) as { data: { status: string; receipt: { blockedReasons: string[]; liveCookieSync: boolean } } };
  assert.equal(blockedPayload.data.status, "blocked");
  assert.equal(blockedPayload.data.receipt.blockedReasons.includes("source_session_open"), true);
  assert.equal(blockedPayload.data.receipt.blockedReasons.includes("live_sync_requested"), true);
  assert.equal(blockedPayload.data.receipt.liveCookieSync, false);

  const ready = await runCliCapture([
    "browser", "session", "handoff",
    "--session-id", "session.login",
    "--profile-id", "profile.login",
    "--node-id", "node.source",
    "--agent-id", "agent.browser",
    "--allowed-origin", "https://example.com",
    "--to-node", "node.target",
    "--source-session-closed", "true",
    "--source-profile-locked", "true",
    "--encrypted-for-target", "true",
    "--target-node-trusted", "true",
    "--now", "2026-05-17T10:00:00.000Z",
    "--json",
  ], process.cwd());
  assert.equal(ready.code, 0);
  const readyPayload = JSON.parse(ready.stdout) as {
    data: {
      status: string;
      receipt: { sourceProfileStatus: string; plaintextCookiesIncluded: boolean; plaintextSecretsIncluded: boolean; liveCookieSync: boolean };
    };
  };
  assert.equal(readyPayload.data.status, "ready_for_import");
  assert.equal(readyPayload.data.receipt.sourceProfileStatus, "transferred_stale");
  assert.equal(readyPayload.data.receipt.plaintextCookiesIncluded, false);
  assert.equal(readyPayload.data.receipt.plaintextSecretsIncluded, false);
  assert.equal(readyPayload.data.receipt.liveCookieSync, false);
});

test("transversal inventory commands expose node location and blocked worktree state", async () => {
  const nodesResult = await runCliCapture(["get", "nodes", "--json"], process.cwd());
  assert.equal(nodesResult.code, 0);
  const nodesPayload = JSON.parse(nodesResult.stdout) as { data: { nodes: Array<{ nodeId: string; nodeFingerprint: string; operationalSummary: { bounded: boolean; startsPolling: boolean; grantsAuthority: boolean } }> } };
  const node = nodesPayload.data.nodes[0];
  assert.ok(node);
  assert.equal(node.operationalSummary.bounded, true);
  assert.equal(node.operationalSummary.startsPolling, false);
  assert.equal(node.operationalSummary.grantsAuthority, false);

  const describeResult = await runCliCapture(["describe", "node", node.nodeId, "--json"], process.cwd());
  assert.equal(describeResult.code, 0);
  const describePayload = JSON.parse(describeResult.stdout) as { data: { node: { nodeId: string; nodeFingerprint: string }; operationalSummary: { capacitySummary: { status: string } }; authority: { trustedSubject: string; locatorAuthority: boolean; discoveryAuthority: boolean; healthAuthority: boolean; capacityAuthority: boolean } } };
  assert.equal(describePayload.data.node.nodeId, node.nodeId);
  assert.equal(describePayload.data.node.nodeFingerprint, node.nodeFingerprint);
  assert.equal(describePayload.data.operationalSummary.capacitySummary.status, "unknown");
  assert.equal(describePayload.data.authority.trustedSubject, "node_identity_fingerprint");
  assert.equal(describePayload.data.authority.locatorAuthority, false);
  assert.equal(describePayload.data.authority.discoveryAuthority, false);
  assert.equal(describePayload.data.authority.healthAuthority, false);
  assert.equal(describePayload.data.authority.capacityAuthority, false);

  const whereResult = await runCliCapture(["where", "node", node.nodeId, "--json"], process.cwd());
  assert.equal(whereResult.code, 0);
  const wherePayload = JSON.parse(whereResult.stdout) as { data: { nodeId: string; nodeFingerprint: string; locatorAuthority: boolean; observedLocators: unknown[] } };
  assert.equal(wherePayload.data.nodeId, node.nodeId);
  assert.equal(wherePayload.data.nodeFingerprint, node.nodeFingerprint);
  assert.equal(wherePayload.data.locatorAuthority, false);
  assert.equal(wherePayload.data.observedLocators.length > 0, true);

  const riskResult = await runCliCapture(["risk", "node", node.nodeId, "--json"], process.cwd());
  assert.equal(riskResult.code, 0);
  const riskPayload = JSON.parse(riskResult.stdout) as { data: { status: string; operationalSummary: { startsPolling: boolean; grantsAuthority: boolean }; failover: { status: string; reentryCondition: string } } };
  assert.equal(riskPayload.data.status, "partial_local");
  assert.equal(riskPayload.data.operationalSummary.startsPolling, false);
  assert.equal(riskPayload.data.operationalSummary.grantsAuthority, false);
  assert.equal(riskPayload.data.failover.status, "blocked");
  assert.match(riskPayload.data.failover.reentryCondition, /coordinator receipts/);

  const worktreesResult = await runCliCapture(["get", "worktrees", "--json"], process.cwd());
  assert.equal(worktreesResult.code, 0);
  const worktreesPayload = JSON.parse(worktreesResult.stdout) as { data: { status: string; blocker: string; reentryCondition: string; items: unknown[] } };
  assert.equal(worktreesPayload.data.status, "blocked");
  assert.equal(worktreesPayload.data.items.length, 0);
  assert.match(worktreesPayload.data.blocker, /Local forge worktree resource backend/);
  assert.match(worktreesPayload.data.reentryCondition, /work claims/);
});

test("sync returns JSON usage errors for unknown subcommands", async () => {
  const result = await runCliCapture(["sync", "definitely_missing", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: {
        received?: string | null;
        validSubcommands?: string[];
      };
    };
    meta: { canonicalCommand: string; subcommand?: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_sync_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.sync.subcommand");
  assert.equal(payload.error.safeNextStep.includes("claw sync status --json"), true);
  assert.equal(payload.error.details?.received, "definitely_missing");
  assert.deepEqual(payload.error.details?.validSubcommands, ["drivers", "manifest", "status", "plan", "run", "reconcile", "apply", "handoff", "conflicts", "cache"]);
  assert.equal(payload.meta.canonicalCommand, "sync");
  assert.equal(payload.meta.subcommand, "definitely_missing");
});

test("sync manifest rejects invalid driver as usage", async () => {
  const result = await runCliCapture(["sync", "manifest", "--driver", "not-a-driver", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string; location: string; details?: { validDrivers?: string[] } };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_sync_driver");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.sync.driver");
  assert.match(payload.error.message, /--driver/);
  assert.equal(payload.error.details?.validDrivers?.includes("skills"), true);
});

test("sync plan reports invalid snapshot JSON as structured usage", async () => {
  const invalid = await runCliCapture(["sync", "plan", "--local-snapshot-json", "{bad", "--json"], process.cwd());

  assert.equal(invalid.code, CLI_EXIT_USAGE);
  assert.equal(invalid.stderr, "");
  const payload = JSON.parse(invalid.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      message: string;
      location: string;
      safeNextStep: string;
      details?: { flag?: string; expected?: string };
    };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_sync_snapshot_json");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.sync.local_snapshot_json");
  assert.match(payload.error.message, /--local-snapshot-json/);
  assert.equal(payload.error.message.includes("SyntaxError"), false);
  assert.match(payload.error.safeNextStep, /sync plan --json/);
  assert.equal(payload.error.details?.flag, "--local-snapshot-json");
  assert.equal(payload.error.details?.expected?.includes("SyncObjectSnapshot"), true);

  const validSnapshot = {
    resourceId: "skills:default",
    objectRef: "skill.review",
    nodeId: "local",
    contentHash: "hash-valid",
    updatedAt: "2026-05-17T09:00:00.000Z",
    deleted: false,
  };
  const valid = await runCliCapture(["sync", "plan", "--local-snapshot-json", JSON.stringify(validSnapshot), "--json"], process.cwd());
  assert.equal(valid.code, 0);
  const validPayload = JSON.parse(valid.stdout) as { ok: boolean; data: { mode: string; writes: boolean } };
  assert.equal(validPayload.ok, true);
  assert.equal(validPayload.data.mode, "plan");
  assert.equal(validPayload.data.writes, false);
});

test("remote returns JSON usage errors for unknown subcommands", async () => {
  const result = await runCliCapture(["remote", "definitely_missing", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: {
        received?: string | null;
        validSubcommands?: string[];
      };
    };
    meta: { canonicalCommand: string; subcommand?: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_remote_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.remote.subcommand");
  assert.equal(payload.error.safeNextStep.includes("claw remote conformance --json"), true);
  assert.equal(payload.error.details?.received, "definitely_missing");
  assert.equal(payload.error.details?.validSubcommands?.includes("conformance"), true);
  assert.equal(payload.error.details?.validSubcommands?.includes("contracts"), true);
  assert.equal(payload.meta.canonicalCommand, "remote");
  assert.equal(payload.meta.subcommand, "definitely_missing");
});

test("gateway returns JSON usage errors for unknown subcommands", async () => {
  const result = await runCliCapture(["gateway", "definitely_missing", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: {
        received?: string | null;
        validSubcommands?: string[];
      };
    };
    meta: { canonicalCommand: string; subcommand?: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_gateway_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.gateway.subcommand");
  assert.equal(payload.error.safeNextStep.includes("claw gateway conformance --json"), true);
  assert.equal(payload.error.details?.received, "definitely_missing");
  assert.deepEqual(payload.error.details?.validSubcommands, ["serve", "project", "conformance", "agent-service", "audit", "secret-lease", "secret-provider"]);
  assert.equal(payload.meta.canonicalCommand, "gateway");
  assert.equal(payload.meta.subcommand, "definitely_missing");
});

test("gateway agent-service rejects invalid cost flags before persistence", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-gateway-agent-cost-"));

  for (const [flag, value, code] of [
    ["--estimated-cost-cents", "nope", "invalid_agent_service_estimated_cost"],
    ["--estimated-cost-cents", "-1", "invalid_agent_service_estimated_cost"],
    ["--limit-cents", "none", "invalid_agent_service_budget_limit"],
    ["--used-cents", "-1", "invalid_agent_service_budget_used"],
  ] as const) {
    const result = await runCliCapture([
      "gateway",
      "agent-service",
      "--tenant-id",
      "tenant.acme",
      "--agent-id",
      "agent.support",
      "--assignment-id",
      "assignment.service",
      "--state-dir",
      stateDir,
      "--record",
      "true",
      flag,
      value,
      "--json",
    ], process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, `${flag} ${value}`);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string; status: string; message: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, code);
    assert.equal(payload.error.status, "USAGE");
    assert.match(payload.error.message, new RegExp(flag));
  }

  assert.equal(fs.existsSync(path.join(stateDir, "remote-sync-state.json")), false);
});

test("gateway deployment rejects invalid deployment kind before persistence", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-gateway-deployment-kind-"));
  const stateDir = path.join(workspace, "state");
  const result = await runCliCapture([
    "gateway",
    "serve",
    "--state-dir",
    stateDir,
    "--record",
    "true",
    "--deployment-kind",
    "nonsense",
    ...coordinatorSigningFlags(workspace),
    "--json",
  ], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_gateway_deployment_kind");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--deployment-kind/);
  assert.equal(fs.existsSync(path.join(stateDir, "remote-sync-state.json")), false);
});

test("sync status reports corrupt remote sync state as usage", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-remote-state-corrupt-"));
  fs.writeFileSync(path.join(stateDir, "remote-sync-state.json"), "{bad", "utf8");

  const result = await runCliCapture(["sync", "status", "--state-dir", stateDir, "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_remote_sync_state_json");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /remote-sync-state\.json/);
});
