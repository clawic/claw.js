import { test } from "vitest";
import assert from "node:assert/strict";

import trackingRegistry from "../../../tracking-registry.json" with { type: "json" };

import { buildSignalsRegistryProjection } from "./registry-projection.ts";
import { REGISTRY_STATUSES } from "./types.ts";

test("signals registry statuses are explicit v1 classifications", () => {
  assert.deepEqual([...REGISTRY_STATUSES], ["stable", "dev_only", "removed"]);
});

test("signals registry projection is host-safe and versioned", () => {
  const projection = buildSignalsRegistryProjection({
    registry: trackingRegistry,
    servicePort: 24110,
  });

  assert.equal(projection.schemaVersion, 1);
  assert.equal(projection.projectionVersion, "signals-registry.v1");
  assert.equal(projection.source.path, "tracking-registry.json");
  assert.match(projection.source.checksum, /^sha256:/);
  assert.equal(projection.service.port, 24110);
  assert.equal(projection.service.verticalRouteTemplate, "/v1/{verticalId}");
  assert.equal(projection.categories.length, 10);
  assert.equal(projection.entries.length, 80);
  assert.equal(projection.entries.some((entry) => entry.status === "dev_only"), true);
  assert.equal(JSON.stringify(projection).includes("catalogPackage"), false);
  assert.equal(JSON.stringify(projection).includes("servicePort"), false);
  assert.equal(JSON.stringify(projection).includes("packageName"), false);
});
