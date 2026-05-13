import { test } from "vitest";
import assert from "node:assert/strict";

import { listRuntimeAdapters } from "./registry.ts";

test("runtime adapters expose support metadata with one recommended production path", () => {
  const adapters = listRuntimeAdapters();
  const recommended = adapters.filter((adapter) => adapter.recommended);
  const recommendedProduction = recommended.filter((adapter) => adapter.supportLevel === "production");

  assert.ok(adapters.every((adapter) => typeof adapter.stability === "string"));
  assert.ok(adapters.every((adapter) => typeof adapter.supportLevel === "string"));
  assert.equal(recommendedProduction.length, 1);
  assert.equal(recommendedProduction[0]?.id, "openclaw");
  assert.equal(recommendedProduction[0]?.stability, "stable");
  assert.equal(recommendedProduction[0]?.supportLevel, "production");
  assert.equal(adapters.some((adapter) => adapter.id === "codex" && adapter.stability === "experimental" && adapter.supportLevel === "experimental"), true);
  assert.equal(adapters.some((adapter) => adapter.id === "claw" && adapter.recommended && adapter.supportLevel === "experimental"), true);
});
