import { test } from "vitest";
import assert from "node:assert/strict";

import { getRuntimeAdapter, listRuntimeAdapters } from "./registry.ts";

test("runtime adapters expose support metadata with one recommended production path", () => {
  const adapters = listRuntimeAdapters();
  const recommended = adapters.filter((adapter) => adapter.recommended);
  const recommendedProduction = recommended.filter((adapter) => adapter.supportLevel === "production");
  const allowedStability = new Set(["stable", "dev-only"]);
  const allowedSupportLevels = new Set(["production", "dev-only"]);

  assert.ok(adapters.every((adapter) => allowedStability.has(adapter.stability)));
  assert.ok(adapters.every((adapter) => allowedSupportLevels.has(adapter.supportLevel)));
  assert.equal(recommended.length, 1);
  assert.equal(recommendedProduction.length, 1);
  assert.equal(recommendedProduction[0]?.id, "openclaw");
  assert.equal(recommendedProduction[0]?.stability, "stable");
  assert.equal(recommendedProduction[0]?.supportLevel, "production");
  const hermes = getRuntimeAdapter("hermes");
  assert.equal(hermes.id, "hermes");
  assert.equal(hermes.runtimeName, "Hermes Agent");
  assert.equal(hermes.recommended, undefined);
  assert.equal(hermes.stability, "dev-only");
  assert.equal(hermes.supportLevel, "dev-only");
  assert.equal(adapters.some((adapter) => adapter.id === "hermes"), true);
  assert.equal(adapters.some((adapter) => adapter.id === "codex" && adapter.stability === "dev-only" && adapter.supportLevel === "dev-only"), true);
  assert.equal(adapters.some((adapter) => adapter.id === "claw" && !adapter.recommended && adapter.stability === "stable" && adapter.supportLevel === "dev-only"), true);
});
