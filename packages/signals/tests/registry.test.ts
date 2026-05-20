import { test } from "vitest";
import assert from "node:assert/strict";

import { getSignalsRegistryProjection, signalsRegistryProjection } from "../src/index.ts";

test("signals package entrypoint exports the registry projection used by the CLI", () => {
  const projection = getSignalsRegistryProjection();

  assert.equal(projection.projectionVersion, "signals-registry.v1");
  assert.equal(projection.service.id, "signals");
  assert.equal(projection.entries.length, signalsRegistryProjection.entries.length);
  assert.equal(signalsRegistryProjection.source.path, "tracking-registry.json");
});
