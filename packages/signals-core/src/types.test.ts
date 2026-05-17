import { test } from "vitest";
import assert from "node:assert/strict";

import { REGISTRY_STATUSES } from "./types.ts";

test("signals registry statuses are explicit v1 classifications", () => {
  assert.deepEqual([...REGISTRY_STATUSES], ["stable", "dev_only", "removed"]);
});
