import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { createLocalRulesStore, resolveRulesRoot } from "./store.ts";

test("rules root uses shared surface path home expansion", () => {
  assert.equal(resolveRulesRoot({ env: {} }), path.join(os.homedir(), ".claw", "rules"));
  assert.equal(resolveRulesRoot({ rootDir: "~", env: {} }), os.homedir());
  assert.equal(resolveRulesRoot({ rootDir: "~/custom-rules", env: {} }), path.join(os.homedir(), "custom-rules"));
  assert.equal(resolveRulesRoot({ env: { CLAW_RULES_DIR: "~/env-rules" } }), path.join(os.homedir(), "env-rules"));
  assert.equal(resolveRulesRoot({ env: { CLAW_HOME: "~/custom-claw" } }), path.join(os.homedir(), "custom-claw", "rules"));
});

test("local rules can target the listed builtin global scope", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-rules-store-"));
  const store = createLocalRulesStore({ rootDir, env: {} });
  assert.equal(store.scopes().some((scope) => scope.id === "clawjs"), true);

  const rule = store.propose({
    scopeId: "clawjs",
    title: "Review route guidance",
    content: "Inspect the owning route before editing guidance surfaces.",
    status: "active",
    applyWhen: { domains: ["routing"] },
  });

  assert.equal(rule.scopeId, "clawjs");
  const compiled = store.compile({ prompt: "Update routing guidance.", domain: "routing" });
  assert.equal(compiled.included.some((match) => match.rule.id === rule.id), true);
});
