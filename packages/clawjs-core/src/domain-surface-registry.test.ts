import { test } from "vitest";
import assert from "node:assert/strict";

import {
  BUILTIN_COLLECTIONS,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
  assertClawDomainSurfaceRegistryComplete,
  clawCliCommandRegistry,
  clawDomainOwnershipMatrixV1,
  clawDomainSurfaceRegistry,
  clawDomainSurfaceRegistryVersion,
  clawV1ClosureMinimumContractDomains,
  findClawDomainSurfaceEntry,
  listClawDomainSurfaceEntries,
} from "./index.ts";

test("domain surface registry maps database, services, modules and CLI ownership", () => {
  assert.equal(clawDomainSurfaceRegistry.version, clawDomainSurfaceRegistryVersion);
  assert.doesNotThrow(() => assertClawDomainSurfaceRegistryComplete());

  const ids = clawDomainSurfaceRegistry.entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "domain surface ids must be unique");

  const collectionNames = new Set([
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name),
    ...BUILTIN_COLLECTIONS.map((collection) => collection.name),
  ]);
  const collectionEntries = listClawDomainSurfaceEntries({ kind: "collection" });
  assert.equal(collectionEntries.length, collectionNames.size);
  for (const name of collectionNames) {
    const entry = findClawDomainSurfaceEntry(`collection:${name}`);
    assert.equal(entry?.owner, "claw", name);
    assert.equal(entry?.status, "registered_hidden", name);
    assert.ok(entry?.storageIds?.includes("claw.database.core"), name);
    assert.ok(entry?.cliCommands?.some((command) => command.includes(`claw db ${name}`)), name);
  }

  const host = findClawDomainSurfaceEntry("host-boundary:signed-host");
  assert.equal(host?.owner, "signed_host");
  assert.equal(host?.status, "host_required");

  const signalEntries = listClawDomainSurfaceEntries({ kind: "signal_vertical" });
  assert.equal(signalEntries.length, 80);
  for (const signal of signalEntries) {
    assert.equal(signal.status, "canonical", signal.id);
    assert.ok(signal.storageIds?.includes("claw.database.core.table.signals_observations"), signal.id);
    assert.ok(signal.cliCommands?.includes("claw signals observe"), signal.id);
    const moduleEntry = findClawDomainSurfaceEntry(`module:${signal.name}`);
    assert.equal(moduleEntry?.status, "conceptual_manifest", signal.name);
    assert.equal(moduleEntry?.modulePath, `modules/${signal.name}`, signal.name);
    assert.equal(moduleEntry?.packageNames, undefined, signal.name);
    assert.equal(moduleEntry?.cliCommands, undefined, signal.name);
  }

  for (const storageId of [
    "claw.database.core.table.signals_verticals",
    "claw.database.core.table.signals_variables",
    "claw.database.core.table.signals_sessions",
    "claw.database.core.table.signals_observations",
  ]) {
    assert.equal(findClawDomainSurfaceEntry(`storage:${storageId}`)?.owner, "claw");
  }

  for (const command of clawCliCommandRegistry.commands) {
    const entry = findClawDomainSurfaceEntry(`cli:${command.name}`);
    assert.ok(entry, `missing CLI surface entry for ${command.name}`);
    assert.equal(entry?.cliCommands?.[0], `claw ${command.name}`);
  }

  const database = findClawDomainSurfaceEntry("system:database");
  assert.ok(database?.invariants?.some((invariant) => invariant.includes("Custom collection creation is explicit")));
  const erp = findClawDomainSurfaceEntry("system:erp");
  assert.equal(erp?.status, "runtime_service");
  assert.equal(erp?.modulePath, "modules/erp");
  assert.ok(erp?.invariants?.some((invariant) => invariant.includes("ERP workflows may coordinate")));

  const denseHealth = findClawDomainSurfaceEntry("dense-system:health");
  assert.equal(denseHealth?.status, "canonical");
  assert.equal(denseHealth?.sensitive, true);
  assert.ok(denseHealth?.storageIds?.includes("claw.database.core"));
  assert.ok(denseHealth?.cliCommands?.includes("claw health"));
  assert.ok(denseHealth?.cliCommands?.includes("claw ehr"));
  assert.ok(denseHealth?.cliCommands?.includes("claw patient"));
  assert.ok(denseHealth?.cliCommands?.includes("claw patients"));
  assert.ok(denseHealth?.invariants?.some((invariant) => invariant.includes("not duplicate databases")));

  const denseErp = findClawDomainSurfaceEntry("dense-system:erp");
  assert.equal(denseErp?.status, "canonical");
  assert.ok(denseErp?.invariants?.some((invariant) => invariant.includes("visible orchestration packs")));

  const denseHris = findClawDomainSurfaceEntry("dense-system:hr");
  assert.equal(denseHris?.status, "conceptual_manifest");
  assert.ok(denseHris?.cliCommands?.includes("claw hris"));

  const contentPublishing = findClawDomainSurfaceEntry("aggregate:content-publishing");
  assert.ok(contentPublishing?.cliCommands?.includes("claw content brand list|create"));
  assert.ok(contentPublishing?.cliCommands?.includes("claw content destination list|create|test"));
  assert.ok(contentPublishing?.cliCommands?.includes("claw content entry list|create|update|attach-asset|generate-variants"));
  assert.ok(contentPublishing?.cliCommands?.includes("claw content approval list|approve|reject"));
  assert.ok(contentPublishing?.cliCommands?.includes("claw content publish plan-list|plan-create|run|cancel|runs|retry"));
  assert.equal(contentPublishing?.cliCommands?.some((command) => command.includes("posts|campaigns|publications")), false);
  for (const command of ["posts", "campaigns", "publications"]) {
    assert.equal(clawCliCommandRegistry.commands.some((entry) => entry.name === command), false);
  }
});

test("v1 closure domains declare minimum resource API event fixture and validation contracts", () => {
  assert.deepEqual(
    [...clawV1ClosureMinimumContractDomains],
    ["signals", "calendar", "contacts", "database", "index", "marketplace", "iot", "publishing"],
  );

  for (const domain of clawV1ClosureMinimumContractDomains) {
    const contract = clawDomainOwnershipMatrixV1[domain].minimumContract;
    assert.ok(contract, `${domain} missing minimum contract`);
    assert.ok(contract.resourceTypes.length > 0, `${domain} missing resource types`);
    assert.ok(contract.apiShape.length > 0, `${domain} missing API shape`);
    assert.ok(contract.eventTopics.every((event) => event.startsWith(`${domain}.`) || (domain === "signals" && event.startsWith("signals."))), `${domain} event topic prefix`);
    assert.ok(contract.fixtures.length > 0, `${domain} missing fixtures`);
    assert.ok(contract.matrixRows.length > 0, `${domain} missing matrix rows`);
    assert.ok(contract.validation.length > 0, `${domain} missing validation`);
  }
});
