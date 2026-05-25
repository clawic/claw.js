import assert from "node:assert/strict";
import { test } from "vitest";

import {
  collectFlagValues,
  extractPositionals,
  hasCliFlag,
  parseFlags,
  readBooleanFlag,
} from "./cli-flag-parsers.ts";

test("CLI flag parser treats -- as the boundary between flags and literal positionals", () => {
  const argv = [
    "notes",
    "create",
    "--tags",
    "work,urgent",
    "--json",
    "--",
    "--json",
    "--not-a-flag",
    "literal title",
  ];

  assert.deepEqual(parseFlags(argv), { tags: "work,urgent" });
  assert.deepEqual(collectFlagValues(argv, "tags"), ["work", "urgent"]);
  assert.equal(hasCliFlag(argv, "--json"), true);
  assert.equal(hasCliFlag(argv.slice(5), "--json"), false);
  assert.deepEqual(extractPositionals(argv), [
    "notes",
    "create",
    "--json",
    "--not-a-flag",
    "literal title",
  ]);
});

test("CLI boolean flags after -- remain literal arguments", () => {
  const argv = ["search", "query", "needle", "--", "--persistent"];

  assert.equal(readBooleanFlag(argv, parseFlags(argv), "persistent", false), false);
  assert.deepEqual(extractPositionals(argv), ["search", "query", "needle", "--persistent"]);
});
