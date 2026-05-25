import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { validateMCPToolArguments } from "./tool-schema-validation.ts";

describe("MCP tool schema validation", () => {
  it("rejects invalid array items before invoking a tool", () => {
    const schema = {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["tags"],
      additionalProperties: false,
    };

    const result = validateMCPToolArguments(schema, { tags: ["safe", 42] });

    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["arguments.tags[1] must be string"]);
  });
});
