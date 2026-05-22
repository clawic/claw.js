import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { resolveRulesRoot } from "./store.ts";

test("rules root uses shared surface path home expansion", () => {
  assert.equal(resolveRulesRoot({ env: {} }), path.join(os.homedir(), ".claw", "rules"));
  assert.equal(resolveRulesRoot({ rootDir: "~", env: {} }), os.homedir());
  assert.equal(resolveRulesRoot({ rootDir: "~/custom-rules", env: {} }), path.join(os.homedir(), "custom-rules"));
  assert.equal(resolveRulesRoot({ env: { CLAW_RULES_DIR: "~/env-rules" } }), path.join(os.homedir(), "env-rules"));
  assert.equal(resolveRulesRoot({ env: { CLAW_HOME: "~/custom-claw" } }), path.join(os.homedir(), "custom-claw", "rules"));
});
