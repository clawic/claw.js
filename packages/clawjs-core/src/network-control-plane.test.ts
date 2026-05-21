import { test } from "vitest";
import assert from "node:assert/strict";

import {
  clawNetworkControlPlaneRegistry,
  createNetworkEvent,
  createNetworkRuleSuggestion,
  evaluateGatewayNetworkAccess,
  evaluateNetworkPolicy,
  listNetworkAdapters,
  listNetworkDefaultRules,
  networkAccessManifestSchema,
  networkAdapterSchema,
  networkEventSchema,
  networkRuleSchema,
  redactNetworkEvent,
  resolveClawCliCommand,
} from "./catalogs.ts";

test("Network control plane registry preserves privacy and authority defaults", () => {
  assert.equal(clawNetworkControlPlaneRegistry.version, 1);
  assert.equal(clawNetworkControlPlaneRegistry.defaultPrivacy.redactionLevel, "aggregate");
  assert.equal(clawNetworkControlPlaneRegistry.defaultPrivacy.detailOptInRequired, true);
  assert.equal(clawNetworkControlPlaneRegistry.defaultPrivacy.packetPayloadInspection, false);
  assert.equal(clawNetworkControlPlaneRegistry.defaultPrivacy.tlsDecryption, false);
  assert.equal(clawNetworkControlPlaneRegistry.authority.agentRuleApplication, "suggest_only");
  assert.equal(clawNetworkControlPlaneRegistry.authority.humanOrExplicitGrantApplies, true);
  assert.deepEqual(clawNetworkControlPlaneRegistry.networkPolicyProfiles.map((entry) => entry.id), ["default"]);
  assert.equal(listNetworkDefaultRules().every((rule) => rule.ruleSteward.kind === "system"), true);
});

test("Network adapters distinguish ready framework enforcement from native external pending", () => {
  const adapters = listNetworkAdapters();
  for (const adapter of adapters) assert.doesNotThrow(() => networkAdapterSchema.parse(adapter));

  assert.equal(adapters.find((adapter) => adapter.kind === "clawRuntime")?.status, "ready");
  assert.equal(adapters.find((adapter) => adapter.kind === "gateway")?.enforcement, "enforce");

  for (const kind of ["macContentFilter", "macDnsProxy", "macEndpointSecurity"]) {
    const adapter = adapters.find((entry) => entry.kind === kind);
    assert.equal(adapter?.status, "external_pending", kind);
    assert.equal(adapter?.externalPending, true, kind);
    assert.ok(adapter?.reentryCondition, kind);
  }
});

test("Network policy evaluation matches gateway routes and redacts by default", () => {
  const evaluation = evaluateGatewayNetworkAccess({
    routeId: "remote.chatGateway",
    agentId: "agent.support",
    now: "2026-05-20T00:00:00.000Z",
  });
  assert.equal(evaluation.decision, "allow");
  assert.equal(evaluation.adapterId, "network.adapter.gateway");
  assert.deepEqual(evaluation.matchedRuleIds, ["network.rule.claw-gateway-known-routes"]);
  assert.equal(evaluation.redaction.level, "aggregate");
  assert.equal(evaluation.redaction.detailOptInRequired, true);

  const unknownProvider = evaluateNetworkPolicy({
    subject: { kind: "provider", id: "provider.mail" },
    endpoint: { kind: "provider_endpoint", value: "api.example.invalid", protocol: "https" },
    rules: listNetworkDefaultRules(),
    now: "2026-05-20T00:00:00.000Z",
  });
  assert.equal(unknownProvider.decision, "ask");
  assert.equal(unknownProvider.requiresReview, true);
});

test("Network events and rule suggestions keep detailed fields opt-in", () => {
  const evaluation = evaluateGatewayNetworkAccess({
    routeId: "remote.searchGateway",
    agentId: "agent.ops",
    now: "2026-05-20T00:00:00.000Z",
  });
  const event = createNetworkEvent({
    id: "evt_gateway_search",
    observedAt: "2026-05-20T00:00:00.000Z",
    subject: {
      kind: "gateway",
      id: "gateway.agent.ops",
      displayName: "Ops gateway",
      claw: { agentId: "agent.ops", gatewayId: "gateway", routeId: "remote.searchGateway" },
    },
    endpoint: { kind: "gateway_route", value: "remote.searchGateway", protocol: "unknown" },
    evaluation,
    adapterId: "network.adapter.gateway",
    bytesIn: 11,
    bytesOut: 22,
  });
  assert.doesNotThrow(() => networkEventSchema.parse(event));

  const redacted = redactNetworkEvent(event);
  assert.equal(redacted.subject.displayName, "gateway");
  assert.equal(redacted.endpoint.value, "gateway_route");
  assert.equal(redacted.redaction.processHidden, true);
  assert.equal(redacted.redaction.domainHidden, true);

  const suggestion = createNetworkRuleSuggestion({ event, action: "allow", now: "2026-05-20T00:00:00.000Z" });
  assert.doesNotThrow(() => networkRuleSchema.parse(suggestion));
  assert.equal(suggestion.enabled, false);
  assert.deepEqual(suggestion.ruleSteward, { kind: "agent", id: "agent.network-review" });
  assert.equal(suggestion.source, "agent_suggestion");
});

test("Network access manifests and CLI registry expose the framework portal", () => {
  for (const manifest of clawNetworkControlPlaneRegistry.manifests) {
    assert.doesNotThrow(() => networkAccessManifestSchema.parse(manifest));
  }

  const command = resolveClawCliCommand("network");
  assert.equal(command?.source.file, "packages/clawjs/src/cli-network-command.ts");
  assert.equal(command?.securityPolicy, "local_write");
  assert.equal(command?.relatedSurfaces?.includes("claw gateway"), true);
  assert.equal(resolveClawCliCommand("firewall")?.relatedSurfaces?.includes("claw network"), true);
});
