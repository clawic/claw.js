import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateConnectorRuntimeOutput } from "./runtime-output.ts";

describe("connector runtime output validation", () => {
  it("accepts outputs that match type and required paths", () => {
    assert.deepEqual(
      validateConnectorRuntimeOutput(
        { id: "evt_1", nested: { ok: true } },
        { type: "object", requiredPaths: ["id", "nested.ok"] },
      ),
      [],
    );
  });

  it("reports type and missing path mismatches", () => {
    assert.deepEqual(
      validateConnectorRuntimeOutput(
        [{ id: "evt_1" }],
        { type: "object", requiredPaths: ["id"] },
      ),
      [
        "output type array expected object",
        "output missing required path id",
      ],
    );
  });
});
