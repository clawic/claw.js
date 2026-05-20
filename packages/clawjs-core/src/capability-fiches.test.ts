import assert from "node:assert/strict";
import { test } from "vitest";

import { listClawCapabilities } from "./capability-catalog.ts";
import { criticalCapabilityFicheIds, listClawCapabilityFiches } from "./capability-fiches.ts";
import { clawPersistentSurfaceRegistry } from "./surface-registry.ts";

test("critical capability fiches cover the local-complete slice", () => {
  const fiches = listClawCapabilityFiches();
  const ids = fiches.map((fiche) => fiche.id);

  assert.equal(new Set(ids).size, ids.length);
  for (const id of criticalCapabilityFicheIds) {
    assert.ok(ids.includes(id), `missing critical capability fiche ${id}`);
  }
  for (const capability of listClawCapabilities()) {
    assert.ok(ids.includes(capability.id), `missing custom-app capability fiche ${capability.id}`);
  }
});

test("critical capability fiches have complete fields and valid graph references", () => {
  const routeIds = new Set((clawPersistentSurfaceRegistry.routes ?? []).map((route) => route.id));
  const nodeIds = new Set(clawPersistentSurfaceRegistry.nodes.map((node) => node.id));

  for (const fiche of listClawCapabilityFiches()) {
    assert.ok(fiche.id, "fiche id is required");
    assert.ok(fiche.system, `${fiche.id} system is required`);
    assert.ok(fiche.title, `${fiche.id} title is required`);
    assert.ok(fiche.summary, `${fiche.id} summary is required`);
    assert.ok(fiche.does.length > 0, `${fiche.id} needs does`);
    assert.ok(fiche.inputs.length > 0, `${fiche.id} needs inputs`);
    assert.ok(fiche.outputs.length > 0, `${fiche.id} needs outputs`);
    assert.ok(fiche.touchedResources.length > 0, `${fiche.id} needs touched resources`);
    assert.ok(fiche.permissions.length > 0, `${fiche.id} needs permissions`);
    assert.ok(fiche.errorStates.length > 0, `${fiche.id} needs error states`);
    assert.ok(fiche.fixtures.length > 0, `${fiche.id} needs fixtures`);
    assert.ok(fiche.limits.length > 0, `${fiche.id} needs limits`);
    assert.ok(fiche.validation.length > 0, `${fiche.id} needs validation`);
    assert.ok(fiche.source.file.endsWith("capability-fiches.ts"), `${fiche.id} source must point to the typed catalog`);
    assert.ok(
      Object.values(fiche.cliApiMcpRelay).some((refs) => refs.length > 0),
      `${fiche.id} needs at least one CLI/API/MCP/Relay/SDK/host surface`,
    );
    if (fiche.routes.length === 0) {
      assert.ok(fiche.gaps.length > 0, `${fiche.id} needs an explicit route gap`);
    }
    for (const routeId of fiche.routes) {
      assert.ok(routeIds.has(routeId), `${fiche.id} references missing route ${routeId}`);
    }
    for (const nodeId of [...fiche.touchedResources, ...fiche.storage]) {
      assert.ok(nodeIds.has(nodeId), `${fiche.id} references missing node ${nodeId}`);
    }
  }
});
