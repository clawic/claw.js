import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseObjectFlag } from "./cli-value-utils.ts";

test("parseObjectFlag reports non-object JSON as usage", () => {
  assert.throws(
    () => parseObjectFlag("[]", "--data"),
    (error) => {
      assert.equal(error instanceof CliHandledError, true);
      assert.equal((error as CliHandledError).code, "invalid_json");
      assert.equal((error as CliHandledError).exitCode, CLI_EXIT_USAGE);
      return true;
    },
  );
});
