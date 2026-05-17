import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

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
    data: { status: string; capabilityId: string; risk: string; execution: string; approvalRequired: boolean; plan: { schemaVersion: number; planId: string; capabilityId: string; requiredApprovals: unknown[] } };
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
  assert.equal(dryRunPayload.data.plan.requiredApprovals.length, 1);
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

test("Mac control help shows related surfaces in normal help", async () => {
  const notificationHelp = await runCliCapture(["notification", "--help"], process.cwd());
  assert.equal(notificationHelp.code, CLI_EXIT_OK);
  assert.match(notificationHelp.stdout, /Related surfaces:/);
  assert.match(notificationHelp.stdout, /claw notify/);
});
