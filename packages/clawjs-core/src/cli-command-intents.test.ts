import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CLAW_CLI_COMMAND_INTENT_STATUSES,
  commandIntentToNeedOpportunity,
  listClawCliCommandIntentRegistry,
  resolveClawCliCommandIntent,
} from "./index.ts";

test("CLI command intents expose the compact V1 status model", () => {
  assert.deepEqual(CLAW_CLI_COMMAND_INTENT_STATUSES, [
    "covered",
    "candidate_alias",
    "gap",
    "future",
    "blocked",
    "external_pending",
  ]);
  const intents = listClawCliCommandIntentRegistry();
  assert.equal(intents.some((entry) => entry.id === "cmd_intent_house_buy" && entry.status === "future"), true);
  assert.equal(intents.some((entry) => entry.status === "blocked"), true);
  assert.equal(intents.some((entry) => entry.status === "external_pending"), true);
});

test("CLI command intent resolution is deterministic and non-executing", () => {
  const covered = resolveClawCliCommandIntent({ phrase: "claw tasks list" });
  assert.equal(covered.status, "covered");
  assert.equal(covered.execute, false);
  assert.equal(covered.intent.mappedCommand, "tasks");

  const future = resolveClawCliCommandIntent({ phrase: "house buy" });
  assert.equal(future.status, "future");
  assert.equal(future.execute, false);
  assert.equal(future.intent.reportTarget, "github_discussions_ideas");
  assert.equal(future.intent.risk.includes("cost"), true);

  const typo = resolveClawCliCommandIntent({ phrase: "peopel" });
  assert.equal(typo.status, "candidate_alias");
  assert.equal(typo.related.some((entry) => entry.canonicalName === "people"), true);
});

test("CLI command intents produce Need-compatible opportunities for unresolved demand", () => {
  const future = resolveClawCliCommandIntent({ phrase: "house buy" }).intent;
  const opportunity = commandIntentToNeedOpportunity(future);
  assert.equal(opportunity?.routeId, "cli.commandIntentResolution");
  assert.equal(opportunity?.source, "known_discovery_gap");
  assert.equal(opportunity?.affectedSurfaces.includes("claw.cli.command.commands"), true);
});
