import assert from "node:assert/strict";
import { test } from "vitest";

import {
  listClawSurfaceEdges,
  listClawSurfaceRoutes,
} from "./surface-registry.ts";

test("surface graph lookup includes registered contract nodes", () => {
  const receiptContractId = "claw.mac.actionReceipt.v1";

  assert.deepEqual(
    listClawSurfaceEdges(receiptContractId).map((edge) => edge.id).sort(),
    ["claw.edge.mac.action.brokers.host", "claw.edge.mac.action.owns.audit"],
  );
  assert.deepEqual(
    listClawSurfaceRoutes(receiptContractId).map((route) => route.id).sort(),
    ["mac.directCliAction"],
  );
});
