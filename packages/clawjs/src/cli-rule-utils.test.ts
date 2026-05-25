import assert from "node:assert/strict";
import test from "node:test";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { parseRuleHints } from "./cli-rule-utils.ts";

test("parseRuleHints accepts positive integer rules limits", () => {
  assert.deepEqual(parseRuleHints({ "rules-limit": "3" }), { limit: 3 });
});

test("parseRuleHints rejects invalid rules limits", () => {
  for (const value of ["", "0", "-1", "1.5", "many"]) {
    assert.throws(
      () => parseRuleHints({ "rules-limit": value }),
      (error) => {
        assert.equal(error instanceof CliHandledError, true);
        const handled = error as CliHandledError;
        assert.equal(handled.code, "invalid_rules_hint_limit");
        assert.equal(handled.exitCode, CLI_EXIT_USAGE);
        assert.equal(handled.location, "cli.rules.rules-limit");
        assert.deepEqual(handled.details, { flag: "--rules-limit", value });
        return true;
      },
    );
  }
});
