import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("commands resolve returns the canonical future fixture without execution", async () => {
  const result = await runCliCapture(["commands", "resolve", "house", "buy", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    data: { resolution: { status: string; execute: boolean; intent: { id: string; risk: string[]; reportTarget: string } } };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "commands");
  assert.equal(payload.meta.subcommand, "resolve");
  assert.equal(payload.data.resolution.status, "future");
  assert.equal(payload.data.resolution.execute, false);
  assert.equal(payload.data.resolution.intent.id, "cmd_intent_house_buy");
  assert.equal(payload.data.resolution.intent.risk.includes("cost"), true);
  assert.equal(payload.data.resolution.intent.reportTarget, "github_discussions_ideas");
});

test("commands record writes only the explicit workspace ledger", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-command-intents-"));
  const record = await runCliCapture([
    "commands",
    "record",
    "--phrase",
    "archive client dashboard",
    "--purpose",
    "Save a client dashboard snapshot for later review.",
    "--status",
    "gap",
    "--workspace",
    workspaceRoot,
    "--json",
  ], process.cwd());
  assert.equal(record.code, CLI_EXIT_OK);
  const recordPayload = JSON.parse(record.stdout) as { data: { record: { id: string; source: string; status: string }; ledgerPath: string } };
  assert.equal(recordPayload.data.record.source, "ledger");
  assert.equal(recordPayload.data.record.status, "gap");
  assert.equal(fs.existsSync(recordPayload.data.ledgerPath), true);

  const list = await runCliCapture(["commands", "list", "--source", "ledger", "--workspace", workspaceRoot, "--json"], process.cwd());
  assert.equal(list.code, CLI_EXIT_OK);
  const listPayload = JSON.parse(list.stdout) as { data: { intents: Array<{ id: string; phrase: string; source: string }> } };
  assert.deepEqual(listPayload.data.intents.map((entry) => entry.id), [recordPayload.data.record.id]);
  assert.equal(listPayload.data.intents[0]?.phrase, "archive client dashboard");
});

test("commands opportunities and promote produce review packets", async () => {
  const opportunities = await runCliCapture(["commands", "opportunities", "--status", "future", "--json"], process.cwd());
  assert.equal(opportunities.code, CLI_EXIT_OK);
  const opportunityPayload = JSON.parse(opportunities.stdout) as {
    data: { routeId: string; opportunities: { unique: Array<{ id: string; routeId: string; title: string }> } };
  };
  assert.equal(opportunityPayload.data.routeId, "cli.commandIntentResolution");
  assert.equal(opportunityPayload.data.opportunities.unique.some((entry) => entry.id === "command_intent.cmd_intent_house_buy" && entry.routeId === "cli.commandIntentResolution"), true);

  const promote = await runCliCapture(["commands", "promote", "cmd_intent_house_buy", "--to", "report", "--json"], process.cwd());
  assert.equal(promote.code, CLI_EXIT_OK);
  const promotePayload = JSON.parse(promote.stdout) as {
    data: { destructiveActionsAllowed: boolean; requiresApproval: boolean; promotion: { reportDraft: { destination: string; labels: string[] } } };
  };
  assert.equal(promotePayload.data.destructiveActionsAllowed, false);
  assert.equal(promotePayload.data.requiresApproval, true);
  assert.equal(promotePayload.data.promotion.reportDraft.destination, "github_discussions_ideas");
  assert.equal(promotePayload.data.promotion.reportDraft.labels.includes("cli-command-intent"), true);
});
