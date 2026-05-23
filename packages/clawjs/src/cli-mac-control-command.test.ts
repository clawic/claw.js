import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("Mac control roots expose atlas and dry-run contracts without direct native execution", async () => {
  const coverage = await runCliCapture(["mac", "coverage", "--json"], process.cwd());
  assert.equal(coverage.code, CLI_EXIT_OK);
  const coveragePayload = JSON.parse(coverage.stdout) as {
    ok: boolean;
    data: { roots: Array<{ root: string }>; capabilities: Array<{ id: string }> };
    meta: { canonicalCommand: string };
  };
  assert.equal(coveragePayload.ok, true);
  assert.equal(coveragePayload.meta.canonicalCommand, "mac");
  assert.equal(coveragePayload.data.roots.some((entry) => entry.root === "wifi"), true);
  assert.equal(coveragePayload.data.capabilities.some((entry) => entry.id === "mac.wifi.connect"), true);

  const dryRun = await runCliCapture(["wifi", "connect", "--ssid", "Office", "--dry-run", "--json"], process.cwd());
  assert.equal(dryRun.code, CLI_EXIT_OK);
  const dryRunPayload = JSON.parse(dryRun.stdout) as {
    ok: boolean;
    data: {
      status: string;
      capabilityId: string;
      risk: string;
      execution: string;
      approvalRequired: boolean;
      blockedReasons: string[];
      plan: {
        schemaVersion: number;
        planId: string;
        capabilityId: string;
        resolvedTarget?: { kind: string; name?: string; selector?: { ssid?: string } };
        requiredApprovals: unknown[];
      };
    };
    meta: { canonicalCommand: string };
  };
  assert.equal(dryRunPayload.ok, true);
  assert.equal(dryRunPayload.meta.canonicalCommand, "wifi");
  assert.equal(dryRunPayload.data.status, "dry_run");
  assert.equal(dryRunPayload.data.capabilityId, "mac.wifi.connect");
  assert.equal(dryRunPayload.data.risk, "high");
  assert.equal(dryRunPayload.data.execution, "signed_host_broker");
  assert.equal(dryRunPayload.data.approvalRequired, true);
  assert.equal(dryRunPayload.data.plan.schemaVersion, 1);
  assert.equal(dryRunPayload.data.plan.capabilityId, "mac.wifi.connect");
  assert.equal(dryRunPayload.data.plan.planId, "macplan_cli_mac_wifi_connect");
  assert.equal(dryRunPayload.data.plan.resolvedTarget?.kind, "wifi_network");
  assert.equal(dryRunPayload.data.plan.resolvedTarget?.name, "Office");
  assert.equal(dryRunPayload.data.plan.resolvedTarget?.selector?.ssid, "Office");
  assert.deepEqual(dryRunPayload.data.blockedReasons, []);
  assert.equal(dryRunPayload.data.plan.requiredApprovals.length, 1);

  const plaintextPassword = await runCliCapture(["wifi", "connect", "Office", "--password", "not-allowed", "--dry-run", "--json"], process.cwd());
  assert.equal(plaintextPassword.code, CLI_EXIT_OK);
  const plaintextPasswordPayload = JSON.parse(plaintextPassword.stdout) as {
    data: { blockedReasons: string[]; plan: { resolvedTarget?: { name?: string }; blockedReasons: string[] } };
  };
  assert.equal(plaintextPasswordPayload.data.plan.resolvedTarget?.name, "Office");
  assert.deepEqual(plaintextPasswordPayload.data.blockedReasons, ["secret_blocked:plaintext_wifi_password"]);
  assert.deepEqual(plaintextPasswordPayload.data.plan.blockedReasons, ["secret_blocked:plaintext_wifi_password"]);
});

test("Mac permissions root exposes central permission catalog and request plans", async () => {
  const list = await runCliCapture(["permissions", "list", "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const listPayload = JSON.parse(list.stdout) as {
    data: { packs: Array<{ id: string }>; permissions: Array<{ id: string; usageDescriptionKeys?: string[] }> };
  };
  assert.equal(listPayload.data.packs.some((entry) => entry.id === "voice"), true);
  assert.equal(listPayload.data.permissions.some((entry) => entry.id === "mac.permission.microphone"), true);

  const request = await runCliCapture(["permissions", "request", "microphone", "--json"], process.cwd());
  assert.equal(request.code, CLI_EXIT_OK);
  const requestPayload = JSON.parse(request.stdout) as {
    data: { permission: { id: string }; plan: { status: string; nativePrompt: string; surprisePrompt: boolean } };
  };
  assert.equal(requestPayload.data.permission.id, "mac.permission.microphone");
  assert.equal(requestPayload.data.plan.status, "permission_plan");
  assert.equal(requestPayload.data.plan.nativePrompt, "just_in_time_only");
  assert.equal(requestPayload.data.plan.surprisePrompt, false);
});

test("Mac direct roots and permission requests hand off to configured signed host", async () => {
  const hostCommand = createFakeMacSignedHostCommand();
  await withPatchedEnv({ CLAW_LIVE_BROKER_COMMAND: hostCommand }, async () => {
    const execute = await runCliCapture(["wifi", "connect", "--ssid", "Office", "--json"], process.cwd());
    assert.equal(execute.code, CLI_EXIT_OK);
    const executePayload = JSON.parse(execute.stdout) as {
      data: {
        status: string;
        response: {
          ok: boolean;
          data: { decision: string; capabilityId: string; requestId: string; ssid: string };
        };
      };
    };
    assert.equal(executePayload.data.status, "signed_host_result");
    assert.equal(executePayload.data.response.ok, true);
    assert.equal(executePayload.data.response.data.decision, "allow");
    assert.equal(executePayload.data.response.data.capabilityId, "mac.wifi.connect");
    assert.equal(executePayload.data.response.data.requestId, "cli.mac.wifi.connect");
    assert.equal(executePayload.data.response.data.ssid, "Office");

    const permission = await runCliCapture(["permissions", "request", "microphone", "--json"], process.cwd());
    assert.equal(permission.code, CLI_EXIT_OK);
    const permissionPayload = JSON.parse(permission.stdout) as {
      data: { response: { data: { status: string; permissionId: string; surprisePrompt: boolean } } };
    };
    assert.equal(permissionPayload.data.response.data.status, "confirmation_required");
    assert.equal(permissionPayload.data.response.data.permissionId, "mac.permission.microphone");
    assert.equal(permissionPayload.data.response.data.surprisePrompt, false);

    const revert = await runCliCapture(["mac", "revert", "macact_123", "--confirm", "--json"], process.cwd());
    assert.equal(revert.code, CLI_EXIT_OK);
    const revertPayload = JSON.parse(revert.stdout) as {
      data: { response: { data: { status: string; receiptId: string; confirmed: boolean } } };
    };
    assert.equal(revertPayload.data.response.data.status, "reverted");
    assert.equal(revertPayload.data.response.data.receiptId, "macact_123");
    assert.equal(revertPayload.data.response.data.confirmed, true);
  });
});

test("Mac signed host bridge failures return actionable JSON errors", async () => {
  const failingHostCommand = createFailingMacSignedHostCommand();
  await withPatchedEnv({ CLAW_LIVE_BROKER_COMMAND: failingHostCommand }, async () => {
    const execute = await runCliCapture(["wifi", "connect", "--ssid", "Office", "--json"], process.cwd());
    assert.equal(execute.code, CLI_EXIT_FAILURE);
    const payload = JSON.parse(execute.stdout) as {
      ok: boolean;
      error: { code: string; status: string; location: string; suggestion: string; safeNextStep: string; message: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "signed_host_bridge_failed");
    assert.equal(payload.error.status, "BLOCKED");
    assert.equal(payload.error.location, "CLAW_LIVE_BROKER_COMMAND");
    assert.match(payload.error.suggestion, /Verify the signed host broker command/);
    assert.match(payload.error.safeNextStep, /claw host status --json/);
    assert.doesNotMatch(execute.stdout, /sk-test-secret-123456/);
  });
});

test("Mac signed host bridge invalid JSON returns parse location and safe next step", async () => {
  const invalidHostCommand = createInvalidJsonMacSignedHostCommand();
  await withPatchedEnv({ CLAW_LIVE_BROKER_COMMAND: invalidHostCommand }, async () => {
    const execute = await runCliCapture(["permissions", "request", "microphone", "--json"], process.cwd());
    assert.equal(execute.code, CLI_EXIT_FAILURE);
    const payload = JSON.parse(execute.stdout) as {
      ok: boolean;
      error: { code: string; status: string; location: string; suggestion: string; safeNextStep: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "signed_host_bridge_invalid_json");
    assert.equal(payload.error.status, "BLOCKED");
    assert.equal(payload.error.location, "signed host stdout");
    assert.match(payload.error.suggestion, /valid Claw JSON envelope/);
    assert.match(payload.error.safeNextStep, /fixture request/);
  });
});

test("Mac control help shows related surfaces in normal help", async () => {
  const cases: Array<[string, string[]]> = [
    ["app", ["claw apps"]],
    ["apps", ["claw app"]],
    ["audio", ["claw mac coverage audio"]],
    ["notification", ["claw notify"]],
    ["notify", ["claw notification"]],
    ["calendar", ["claw permissions show calendar"]],
    ["contacts", ["claw permissions show contacts"]],
    ["reminders", ["claw permissions show reminders"]],
    ["files", ["claw permissions show files"]],
    ["location", ["claw permissions show location"]],
    ["microphone", ["claw stt", "claw tts"]],
    ["speech", ["claw stt", "claw tts"]],
    ["stt", ["claw speech", "claw microphone"]],
    ["tts", ["claw speech", "claw microphone"]],
    ["voice-notes", ["claw microphone", "claw speech"]],
  ];

  for (const [command, relatedSurfaces] of cases) {
    const help = await runCliCapture([command, "--help"], process.cwd());
    assert.equal(help.code, CLI_EXIT_OK, command);
    assert.match(help.stdout, /Related surfaces:/, command);
    for (const related of relatedSurfaces) assert.match(help.stdout, new RegExp(related.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), command);
  }
});

function createFakeMacSignedHostCommand(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-mac-host-"));
  const script = path.join(dir, "fake-mac-host.mjs");
  fs.writeFileSync(script, `#!/usr/bin/env node
const args = process.argv.slice(2);
function value(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
const action = args[2];
if (args[0] !== "system" || args[1] !== "mac") {
  console.log(JSON.stringify({ ok: false, error: { code: "unexpected_args", message: args.join(" ") } }));
  process.exit(1);
}
if (action === "execute") {
  const request = JSON.parse(value("--request-json"));
  console.log(JSON.stringify({
    ok: true,
    data: {
      decision: "allow",
      capabilityId: request.capabilityId,
      requestId: request.requestId,
      ssid: request.arguments?.ssid
    },
    meta: { source: "local_cli" }
  }));
} else if (action === "permissions") {
  console.log(JSON.stringify({
    ok: true,
    data: {
      status: args.includes("--confirm") ? "granted" : "confirmation_required",
      permissionId: value("--permission-id") ?? "mac.permission.microphone",
      surprisePrompt: false,
      nativePrompt: "just_in_time_only"
    },
    meta: { source: "local_cli" }
  }));
} else if (action === "revert") {
  console.log(JSON.stringify({
    ok: true,
    data: {
      status: args.includes("--confirm") ? "reverted" : "confirmation_required",
      receiptId: value("--receipt-id"),
      confirmed: args.includes("--confirm")
    },
    meta: { source: "local_cli" }
  }));
} else if (action === "audit") {
  console.log(JSON.stringify({ ok: true, data: { events: [] }, meta: { source: "local_cli" } }));
} else {
  console.log(JSON.stringify({ ok: false, error: { code: "unknown_action", message: action } }));
  process.exit(1);
}
`);
  fs.chmodSync(script, 0o755);
  return script;
}

function createFailingMacSignedHostCommand(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-mac-host-failing-"));
  const script = path.join(dir, "failing-mac-host.mjs");
  fs.writeFileSync(script, `#!/usr/bin/env node
console.error("token: sk-test-secret-123456");
process.exit(1);
`);
  fs.chmodSync(script, 0o755);
  return script;
}

function createInvalidJsonMacSignedHostCommand(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-mac-host-invalid-json-"));
  const script = path.join(dir, "invalid-json-mac-host.mjs");
  fs.writeFileSync(script, `#!/usr/bin/env node
console.log("{");
`);
  fs.chmodSync(script, 0o755);
  return script;
}
