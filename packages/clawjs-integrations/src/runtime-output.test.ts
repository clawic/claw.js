import assert from "node:assert/strict";
import { describe, it } from "vitest";

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

  it("accepts outputs that match alternate schemas", () => {
    const schema = {
      oneOf: [
        { type: "object" as const, requiredPaths: ["id"] },
        { type: "null" as const },
      ],
    };

    assert.deepEqual(validateConnectorRuntimeOutput({ id: "evt_1" }, schema), []);
    assert.deepEqual(validateConnectorRuntimeOutput(null, schema), []);
    assert.deepEqual(
      validateConnectorRuntimeOutput("evt_1", schema),
      ["output did not match any schema: output type string expected object, output missing required path id; output type string expected null"],
    );
  });
});
