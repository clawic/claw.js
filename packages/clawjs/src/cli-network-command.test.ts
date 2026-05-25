import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("network CLI exposes status, adapters, manifests and aggregate privacy defaults", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-network-cli-"));
  const monitorDb = path.join(workspace, "monitor.sqlite");
  await withPatchedEnv({ CLAW_MONITOR_DB_PATH: monitorDb }, async () => {
    const status = await runCliCapture(["network", "status", "--workspace", workspace, "--json"], workspace);
    assert.equal(status.code, CLI_EXIT_OK);
    const statusPayload = JSON.parse(status.stdout) as {
      ok: boolean;
      data: {
        privacy: { detailOptIn: boolean; defaultRedaction: string };
        enforcement: { clawRuntime: string; gateway: string; nativeMac: string };
      };
      meta: { canonicalCommand: string };
    };
    assert.equal(statusPayload.ok, true);
    assert.equal(statusPayload.meta.canonicalCommand, "network");
    assert.equal(statusPayload.data.privacy.detailOptIn, false);
    assert.equal(statusPayload.data.privacy.defaultRedaction, "aggregate");
    assert.equal(statusPayload.data.enforcement.gateway, "ready");
    assert.equal(statusPayload.data.enforcement.nativeMac, "external_pending");

    const adapters = await runCliCapture(["network", "adapters", "--workspace", workspace, "--json"], workspace);
    assert.equal(adapters.code, CLI_EXIT_OK);
    const adaptersPayload = JSON.parse(adapters.stdout) as {
      data: { adapters: Array<{ kind: string; status: string; externalPending: boolean }> };
    };
    assert.equal(adaptersPayload.data.adapters.some((adapter) => adapter.kind === "gateway" && adapter.status === "ready"), true);
    assert.equal(adaptersPayload.data.adapters.some((adapter) => adapter.kind === "macContentFilter" && adapter.externalPending), true);

    const manifests = await runCliCapture(["network", "manifests", "--workspace", workspace, "--json"], workspace);
    assert.equal(manifests.code, CLI_EXIT_OK);
    const manifestsPayload = JSON.parse(manifests.stdout) as { data: { manifests: Array<{ id: string; reviewRequired: boolean }> } };
    assert.equal(manifestsPayload.data.manifests.some((manifest) => manifest.id === "network.manifest.gateway" && !manifest.reviewRequired), true);

    const policyProfiles = await runCliCapture(["network", "policy-profiles", "--workspace", workspace, "--json"], workspace);
    assert.equal(policyProfiles.code, CLI_EXIT_OK);
    const policyProfilesPayload = JSON.parse(policyProfiles.stdout) as {
      data: { networkPolicyProfiles: Array<{ id: string }>; activeNetworkPolicyProfileId: string };
    };
    assert.deepEqual(policyProfilesPayload.data.networkPolicyProfiles.map((entry) => entry.id), ["default"]);
    assert.equal(policyProfilesPayload.data.activeNetworkPolicyProfileId, "default");
  });
});

test("network CLI records Monitor-backed events and keeps details redacted unless opted in", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-network-events-"));
  const monitorDb = path.join(workspace, "monitor.sqlite");
  await withPatchedEnv({ CLAW_MONITOR_DB_PATH: monitorDb }, async () => {
    const record = await runCliCapture([
      "network",
      "events",
      "record",
      "--workspace",
      workspace,
      "--id",
      "evt_test_gateway",
      "--agent-id",
      "agent.ops",
      "--route-id",
      "remote.chatGateway",
      "--bytes-in",
      "10",
      "--bytes-out",
      "20",
      "--json",
    ], workspace);
    assert.equal(record.code, CLI_EXIT_OK);
    const recordPayload = JSON.parse(record.stdout) as {
      data: { event: { subject: { displayName?: string }; endpoint: { value: string }; decision: string }; recorded: { dbPath: string } };
    };
    assert.equal(recordPayload.data.event.decision, "allow");
    assert.equal(recordPayload.data.event.subject.displayName, "gateway");
    assert.equal(recordPayload.data.event.endpoint.value, "gateway_route");
    assert.equal(recordPayload.data.recorded.dbPath, monitorDb);

    const list = await runCliCapture(["network", "events", "--workspace", workspace, "--json"], workspace);
    assert.equal(list.code, CLI_EXIT_OK);
    const listPayload = JSON.parse(list.stdout) as { data: { events: Array<{ endpoint: { value: string }; redaction: { domainHidden: boolean } }> } };
    assert.equal(listPayload.data.events[0].endpoint.value, "gateway_route");
    assert.equal(listPayload.data.events[0].redaction.domainHidden, true);

    const detail = await runCliCapture(["network", "events", "--workspace", workspace, "--detail-opt-in", "true", "--json"], workspace);
    assert.equal(detail.code, CLI_EXIT_OK);
    const detailPayload = JSON.parse(detail.stdout) as { data: { events: Array<{ endpoint: { value: string }; redaction: { domainHidden: boolean } }> } };
    assert.equal(detailPayload.data.events[0].endpoint.value, "remote.chatGateway");
    assert.equal(detailPayload.data.events[0].redaction.domainHidden, false);
  });
});

test("network CLI rejects invalid event byte counters before recording", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-network-invalid-bytes-"));
  const monitorDb = path.join(workspace, "monitor.sqlite");

  const invalidText = await runCliCapture([
    "network",
    "events",
    "record",
    "--workspace",
    workspace,
    "--monitor-db",
    monitorDb,
    "--bytes-in",
    "nope",
    "--json",
  ], workspace);
  assert.equal(invalidText.code, CLI_EXIT_USAGE);
  const invalidTextPayload = JSON.parse(invalidText.stdout) as {
    ok: boolean;
    error: { code: string; status: string };
  };
  assert.equal(invalidTextPayload.ok, false);
  assert.equal(invalidTextPayload.error.code, "invalid_network_event_bytes");
  assert.equal(invalidTextPayload.error.status, "USAGE");
  assert.equal(fs.existsSync(monitorDb), false);

  const negative = await runCliCapture([
    "network",
    "events",
    "record",
    "--workspace",
    workspace,
    "--monitor-db",
    monitorDb,
    "--bytes-out",
    "-1",
    "--json",
  ], workspace);
  assert.equal(negative.code, CLI_EXIT_USAGE);
  const negativePayload = JSON.parse(negative.stdout) as { error: { code: string; status: string } };
  assert.equal(negativePayload.error.code, "invalid_network_event_bytes");
  assert.equal(negativePayload.error.status, "USAGE");
  assert.equal(fs.existsSync(monitorDb), false);

  for (const bytesIn of ["1e3", "0x10", "+10"]) {
    const result = await runCliCapture([
      "network",
      "events",
      "record",
      "--workspace",
      workspace,
      "--monitor-db",
      monitorDb,
      "--bytes-in",
      bytesIn,
      "--json",
    ], workspace);
    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as { error: { code: string; status: string } };
    assert.equal(payload.error.code, "invalid_network_event_bytes");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(fs.existsSync(monitorDb), false);
  }
});

test("network CLI rejects invalid history limits before opening Monitor storage", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-network-invalid-limit-"));
  const monitorDb = path.join(workspace, "monitor.sqlite");

  const events = await runCliCapture([
    "network",
    "events",
    "--workspace",
    workspace,
    "--monitor-db",
    monitorDb,
    "--limit",
    "nope",
    "--json",
  ], workspace);
  assert.equal(events.code, CLI_EXIT_USAGE);
  const eventsPayload = JSON.parse(events.stdout) as {
    ok: boolean;
    error: { code: string; status: string };
  };
  assert.equal(eventsPayload.ok, false);
  assert.equal(eventsPayload.error.code, "invalid_network_limit");
  assert.equal(eventsPayload.error.status, "USAGE");
  assert.equal(fs.existsSync(monitorDb), false);

  const suggestions = await runCliCapture([
    "network",
    "suggestions",
    "--workspace",
    workspace,
    "--monitor-db",
    monitorDb,
    "--limit",
    "NaN",
    "--json",
  ], workspace);
  assert.equal(suggestions.code, CLI_EXIT_USAGE);
  const suggestionsPayload = JSON.parse(suggestions.stdout) as { error: { code: string; status: string } };
  assert.equal(suggestionsPayload.error.code, "invalid_network_limit");
  assert.equal(suggestionsPayload.error.status, "USAGE");
  assert.equal(fs.existsSync(monitorDb), false);

  for (const limit of ["1e3", "0x10", "+10"]) {
    const result = await runCliCapture([
      "network",
      "events",
      "--workspace",
      workspace,
      "--monitor-db",
      monitorDb,
      "--limit",
      limit,
      "--json",
    ], workspace);
    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as { error: { code: string; status: string } };
    assert.equal(payload.error.code, "invalid_network_limit");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(fs.existsSync(monitorDb), false);
  }
});

test("network CLI rejects invalid rule numeric flags before writing control state", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-network-invalid-rule-flags-"));
  const statePath = path.join(workspace, ".claw", "data", "network-control-state.json");

  const invalidPriority = await runCliCapture([
    "network",
    "rules",
    "upsert",
    "network.rule.invalid.priority",
    "--workspace",
    workspace,
    "--action",
    "deny",
    "--subject-kind",
    "gateway",
    "--endpoint-kind",
    "gateway_route",
    "--endpoint",
    "remote.searchGateway",
    "--priority",
    "nope",
    "--json",
  ], workspace);
  assert.equal(invalidPriority.code, CLI_EXIT_USAGE);
  const invalidPriorityPayload = JSON.parse(invalidPriority.stdout) as {
    ok: boolean;
    error: { code: string; status: string };
  };
  assert.equal(invalidPriorityPayload.ok, false);
  assert.equal(invalidPriorityPayload.error.code, "invalid_network_rule_priority");
  assert.equal(invalidPriorityPayload.error.status, "USAGE");
  assert.equal(fs.existsSync(statePath), false);

  const invalidPort = await runCliCapture([
    "network",
    "rules",
    "upsert",
    "network.rule.invalid.port",
    "--workspace",
    workspace,
    "--action",
    "deny",
    "--subject-kind",
    "gateway",
    "--endpoint-kind",
    "gateway_route",
    "--endpoint",
    "remote.searchGateway",
    "--port",
    "70000",
    "--json",
  ], workspace);
  assert.equal(invalidPort.code, CLI_EXIT_USAGE);
  const invalidPortPayload = JSON.parse(invalidPort.stdout) as { error: { code: string; status: string } };
  assert.equal(invalidPortPayload.error.code, "invalid_network_rule_port");
  assert.equal(invalidPortPayload.error.status, "USAGE");
  assert.equal(fs.existsSync(statePath), false);

  for (const priority of ["1e3", "0x10", "+10"]) {
    const result = await runCliCapture([
      "network",
      "rules",
      "upsert",
      `network.rule.invalid.priority.${priority.replace(/[^a-z0-9]/gi, "_")}`,
      "--workspace",
      workspace,
      "--action",
      "deny",
      "--subject-kind",
      "gateway",
      "--endpoint-kind",
      "gateway_route",
      "--endpoint",
      "remote.searchGateway",
      "--priority",
      priority,
      "--json",
    ], workspace);
    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as { error: { code: string; status: string } };
    assert.equal(payload.error.code, "invalid_network_rule_priority");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(fs.existsSync(statePath), false);
  }

  for (const port of ["1e3", "0x10", "+10"]) {
    const result = await runCliCapture([
      "network",
      "rules",
      "upsert",
      `network.rule.invalid.port.${port.replace(/[^a-z0-9]/gi, "_")}`,
      "--workspace",
      workspace,
      "--action",
      "deny",
      "--subject-kind",
      "gateway",
      "--endpoint-kind",
      "gateway_route",
      "--endpoint",
      "remote.searchGateway",
      "--port",
      port,
      "--json",
    ], workspace);
    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as { error: { code: string; status: string } };
    assert.equal(payload.error.code, "invalid_network_rule_port");
    assert.equal(payload.error.status, "USAGE");
    assert.equal(fs.existsSync(statePath), false);
  }
});

test("network CLI applies rules to Gateway route explanations and suggestions never auto-apply", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "claw-network-rules-"));
  const monitorDb = path.join(workspace, "monitor.sqlite");
  await withPatchedEnv({ CLAW_MONITOR_DB_PATH: monitorDb }, async () => {
    const deny = await runCliCapture([
      "network",
      "rules",
      "upsert",
      "network.rule.deny.search",
      "--workspace",
      workspace,
      "--action",
      "deny",
      "--subject-kind",
      "gateway",
      "--endpoint-kind",
      "gateway_route",
      "--endpoint",
      "remote.searchGateway",
      "--priority",
      "200",
      "--json",
    ], workspace);
    assert.equal(deny.code, CLI_EXIT_OK);

    const explain = await runCliCapture(["network", "explain", "remote.searchGateway", "--workspace", workspace, "--json"], workspace);
    assert.equal(explain.code, CLI_EXIT_OK);
    const explainPayload = JSON.parse(explain.stdout) as {
      data: { evaluation: { decision: string; matchedRuleIds: string[]; adapterId: string } };
    };
    assert.equal(explainPayload.data.evaluation.decision, "deny");
    assert.deepEqual(explainPayload.data.evaluation.matchedRuleIds, ["network.rule.deny.search"]);
    assert.equal(explainPayload.data.evaluation.adapterId, "network.adapter.gateway");

    await runCliCapture([
      "network",
      "events",
      "record",
      "--workspace",
      workspace,
      "--id",
      "evt_denied_search",
      "--route-id",
      "remote.searchGateway",
      "--json",
    ], workspace);
    const suggestions = await runCliCapture(["network", "suggestions", "--workspace", workspace, "--json"], workspace);
    assert.equal(suggestions.code, CLI_EXIT_OK);
    const suggestionsPayload = JSON.parse(suggestions.stdout) as {
      data: { autoApply: boolean; suggestions: Array<{ enabled: boolean; source: string }> };
    };
    assert.equal(suggestionsPayload.data.autoApply, false);
    assert.equal(suggestionsPayload.data.suggestions[0].enabled, false);
    assert.equal(suggestionsPayload.data.suggestions[0].source, "agent_suggestion");
  });
});
