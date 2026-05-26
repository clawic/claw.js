import { test } from "vitest";
import assert from "node:assert/strict";

import {
  INSTRUCTION_BODY_CAPS,
  INSTRUCTION_BODY_FIELDS,
  clawInstructionsSchemaVersion,
  resolveInstructionsForEvent,
  validateInstructionShape,
} from "./cli-instructions.ts";
import {
  CATALOG_SEED_INSTRUCTIONS,
  listCatalogSeedInstructions,
  listMaterializedSeedInstructions,
  materializeSeedAsInstruction,
  resolveCatalogSeedsForEvent,
} from "./cli-instructions-seeds.ts";

const REQUIRED_SURFACES = ["tasks", "decisions", "notes", "inbox", "agenda", "people", "memory", "db"];

test("every canonical surface has at least one seed", () => {
  for (const surface of REQUIRED_SURFACES) {
    const covered = CATALOG_SEED_INSTRUCTIONS.some((catalogEntry) =>
      catalogEntry.seed.target.command === surface,
    );
    assert.equal(covered, true, `missing seed for command=${surface}`);
  }
});

test("every seed is shape-valid and within caps", () => {
  for (const catalogEntry of CATALOG_SEED_INSTRUCTIONS) {
    const validation = validateInstructionShape({
      schemaVersion: clawInstructionsSchemaVersion,
      target: catalogEntry.seed.target,
      trigger: catalogEntry.seed.trigger,
      activation: catalogEntry.seed.activation,
      priority: catalogEntry.seed.priority,
      severity: catalogEntry.seed.severity,
      useWhen: catalogEntry.seed.useWhen,
      useNot: catalogEntry.seed.useNot,
      readPolicy: catalogEntry.seed.readPolicy,
      writePolicy: catalogEntry.seed.writePolicy,
      before: catalogEntry.seed.before,
      after: catalogEntry.seed.after,
      forbid: catalogEntry.seed.forbid,
      notes: catalogEntry.seed.notes,
    });
    assert.equal(
      validation.ok,
      true,
      `seed ${catalogEntry.source} failed validation: ${JSON.stringify(validation.issues)}`,
    );
  }
});

test("body field caps are respected by all seed bodies", () => {
  for (const catalogEntry of CATALOG_SEED_INSTRUCTIONS) {
    for (const field of INSTRUCTION_BODY_FIELDS) {
      const value = catalogEntry.seed[field];
      if (typeof value !== "string") continue;
      const cap = INSTRUCTION_BODY_CAPS[field];
      assert.equal(value.length <= cap, true, `seed ${catalogEntry.source} field ${field} exceeds cap ${cap}`);
    }
  }
});

test("materialization preserves source and target", () => {
  for (const catalogEntry of CATALOG_SEED_INSTRUCTIONS) {
    const materialized = materializeSeedAsInstruction(catalogEntry, "2026-05-26T10:00:00.000Z");
    assert.equal(materialized.source, catalogEntry.source);
    assert.equal(materialized.provenance, "seed");
    assert.equal(materialized.state, "active");
    assert.deepEqual(materialized.target, catalogEntry.seed.target);
  }
});

test("listMaterializedSeedInstructions exposes every catalog entry", () => {
  const materialized = listMaterializedSeedInstructions();
  assert.equal(materialized.length, listCatalogSeedInstructions().length);
});

test("resolveCatalogSeedsForEvent returns matches for a known target", () => {
  const matches = resolveCatalogSeedsForEvent({
    target: { command: "tasks", action: "write" },
    trigger: "surface-action",
  });
  assert.equal(matches.length >= 1, true, "expected at least one seed for tasks write");
  assert.equal(
    matches.every((entry) => entry.target.command === "tasks"),
    true,
  );
});

test("session-start hook is exposed via the alias=productivity scope", () => {
  const matches = resolveCatalogSeedsForEvent({
    target: { alias: "productivity" },
    trigger: "session-start",
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.source, "catalog:session-start.bootstrap");
});

test("resolver order is consistent with cli-instructions general resolver", () => {
  const materialized = listMaterializedSeedInstructions();
  const direct = resolveInstructionsForEvent(materialized, {
    target: { command: "tasks", action: "write" },
    trigger: "surface-action",
  });
  const helper = resolveCatalogSeedsForEvent({
    target: { command: "tasks", action: "write" },
    trigger: "surface-action",
  });
  assert.deepEqual(
    direct.map((entry) => entry.source),
    helper.map((entry) => entry.source),
  );
});
