import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { captureStream, parseCliJsonPayload, runCliCapture } from "./index-test-utils.ts";

test("runCli exposes need route lab dimensions through the public CLI", async () => {
  const result = await runCliCapture(["needs", "dimensions", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    dimensions: Array<{ id: string; values: Array<{ id: string }> }>;
    capabilityGraph: { nodes: Array<{ id: string }> };
    generationModes: string[];
    maturityStates: string[];
    opportunityKinds: string[];
  }>(result.stdout);
  assert.ok(payload.dimensions.some((dimension) => dimension.id === "autonomy_preference"));
  assert.ok(payload.dimensions.some((dimension) => dimension.id === "validation_mode"));
  assert.ok(payload.capabilityGraph.nodes.some((node) => node.id === "need.report_bridge"));
  assert.ok(payload.generationModes.includes("llm_lateral_dry_run"));
  assert.ok(payload.maturityStates.includes("observed_gap"));
  assert.ok(payload.opportunityKinds.includes("security"));
});

test("runCli exposes LLM lateral generation as dry-run metadata without live provider calls", async () => {
  const result = await runCliCapture(["needs", "generate", "--pilot", "agent_workflow", "--mode", "llm-lateral", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    generation: { mode: string; lateralExpansion: { status: string; blockedRealActions: string[] } };
    routes: Array<{ id: string }>;
  }>(result.stdout);
  assert.equal(payload.generation.mode, "llm_lateral_dry_run");
  assert.equal(payload.generation.lateralExpansion.status, "dry_run_only");
  assert.ok(payload.generation.lateralExpansion.blockedRealActions.includes("no_paid_api"));
  assert.equal(payload.routes.length, 1);
});

test("runCli evaluates need routes in dry-run mode and saves a canonical workspace ledger", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-needs-cli-"));
  const result = await runCliCapture(["needs", "evaluate", "--pilot", "iot_home", "--dry-run", "--save", "--json"], workspaceRoot);
  assert.equal(result.code, CLI_EXIT_OK);
  const payload = parseCliJsonPayload<{
    evaluations: Array<{ route: { id: string }; opportunities: Array<{ externalPending: boolean }> }>;
    opportunities: { unique: Array<{ id: string; externalPending: boolean }> };
    save: { wrote: boolean; ledgerPath: string };
  }>(result.stdout);
  assert.equal(payload.evaluations[0]?.route.id, "route_new_light_control_surface");
  assert.equal(payload.save.wrote, true);
  assert.equal(payload.save.ledgerPath, path.join(workspaceRoot, ".claw", "need-routes", "need-route-lab.json"));
  assert.equal(fs.existsSync(payload.save.ledgerPath), true);
  assert.ok(payload.opportunities.unique.some((opportunity) => opportunity.externalPending));
});

test("runCli rejects invalid need route limits instead of expanding work", async () => {
  const result = await runCliCapture(["needs", "generate", "--limit", "-1", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_limit");
});

test("runCli dedupes and promotes need opportunities without executing external publication", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-needs-promote-"));
  await runCliCapture(["needs", "evaluate", "--save", "--json"], workspaceRoot);

  const list = await runCliCapture(["needs", "opportunities", "list", "--json"], workspaceRoot);
  assert.equal(list.code, CLI_EXIT_OK);
  const listPayload = parseCliJsonPayload<{ opportunities: Array<{ id: string; title: string }> }>(list.stdout);
  const schemaGap = listPayload.opportunities.find((opportunity) => opportunity.title === "Track collection schema inspectability failures");
  assert.ok(schemaGap);

  const promote = await runCliCapture(["needs", "opportunities", "promote", schemaGap.id, "--json"], workspaceRoot);
  assert.equal(promote.code, CLI_EXIT_OK);
  const promotePayload = parseCliJsonPayload<{
    promotion: { commandPlan: string[]; reportDraft: { title: string } };
    destructiveActionsAllowed: boolean;
    requiresApproval: boolean;
  }>(promote.stdout);
  assert.equal(promotePayload.destructiveActionsAllowed, false);
  assert.equal(promotePayload.requiresApproval, true);
  assert.match(promotePayload.promotion.commandPlan[0] ?? "", /^claw report bug /);
});

test("runCli includes needs in help and inspect command discovery", async () => {
  const help = await runCliCapture(["--help"], process.cwd());
  assert.equal(help.code, CLI_EXIT_OK);
  assert.match(help.stdout, /^\s+needs\s+canonical/m);

  const stdout = captureStream();
  assert.equal(await runCli(["inspect", "why", "needs", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  }), CLI_EXIT_OK);
  const why = parseCliJsonPayload<{ name: string; docs: string[]; adrs: string[]; source: { file: string } }>(stdout.getOutput());
  assert.equal(why.name, "needs");
  assert.ok(why.docs.includes("docs/need-route-lab.md"));
  assert.ok(why.adrs.includes("docs/adr/0014-need-route-lab-v1.md"));
  assert.equal(why.source.file, "packages/clawjs/src/cli-needs-command.ts");
});
