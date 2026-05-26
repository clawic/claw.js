import assert from "node:assert/strict";
import { test } from "vitest";

import { clawCliCommandRegistry } from "../cli-command-registry.ts";
import { findKeywordRouterConceptByCommand } from "./keyword-router.ts";

const REQUIRED_FAMILIES = new Set(["work", "time"]);

const REQUIRED_PORTAL_COMMANDS = new Set(["knowledge"]);

test("every productivity command in family work or time has a keyword-router concept", () => {
  const missing: string[] = [];
  for (const entry of clawCliCommandRegistry.commands) {
    if (!entry.family || !REQUIRED_FAMILIES.has(entry.family)) continue;
    if (entry.kind === "alias") continue;
    if (findKeywordRouterConceptByCommand(entry.name)) continue;
    missing.push(`${entry.name} (family=${entry.family})`);
  }
  assert.deepEqual(
    missing,
    [],
    `keyword-router.json is missing entries for productivity commands: ${missing.join(", ")}`,
  );
});

test("knowledge portal is covered by the router", () => {
  for (const name of REQUIRED_PORTAL_COMMANDS) {
    assert.ok(
      findKeywordRouterConceptByCommand(name),
      `keyword-router.json must cover the ${name} portal command`,
    );
  }
});

test("raw-data fallback concept points at the db alias", () => {
  const concept = findKeywordRouterConceptByCommand("db");
  assert.ok(concept, "raw-data concept should point at the db command");
  assert.ok(concept.antiPattern.length > 0, "raw-data concept must declare an anti-pattern");
});
