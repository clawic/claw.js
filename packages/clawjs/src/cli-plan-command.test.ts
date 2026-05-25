import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { parseCliJsonPayload, runCliCapture } from "./index-test-utils.ts";

test("plan review rejects invalid decisions before approving", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-plan-review-decision-"));
  const create = await runCliCapture([
    "plan",
    "create",
    "Review decision",
    "--id",
    "plan_bad_decision",
    "--no-auto-run",
    "--workspace",
    cwd,
    "--json",
  ], cwd);
  assert.equal(create.code, CLI_EXIT_OK);

  const review = await runCliCapture([
    "plan",
    "review",
    "plan_bad_decision",
    "--agent",
    "reviewer",
    "--decision",
    "maybe",
    "--workspace",
    cwd,
    "--json",
  ], cwd);
  assert.equal(review.code, CLI_EXIT_USAGE);
  const reviewPayload = JSON.parse(review.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string };
  };
  assert.equal(reviewPayload.ok, false);
  assert.equal(reviewPayload.error.code, "invalid_plan_review_decision");
  assert.equal(reviewPayload.error.status, "USAGE");
  assert.equal(reviewPayload.error.location, "cli.plan.review.decision");

  const show = await runCliCapture(["plan", "show", "plan_bad_decision", "--workspace", cwd, "--json"], cwd);
  assert.equal(show.code, CLI_EXIT_OK);
  const showPayload = parseCliJsonPayload<{ plan: { reviewerAgentId?: string; reviewReason?: string } }>(show.stdout);
  assert.equal(showPayload.plan.reviewerAgentId, undefined);
  assert.equal(showPayload.plan.reviewReason, undefined);
});

test("plan commands reject corrupt agent plan state instead of overwriting it", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-plan-corrupt-state-"));
  const statePath = path.join(cwd, ".claw", "data", "agent-plans.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, "{bad-json", "utf8");

  const create = await runCliCapture([
    "plan",
    "create",
    "Do not erase corrupt state",
    "--id",
    "plan_should_not_write",
    "--no-auto-run",
    "--workspace",
    cwd,
    "--json",
  ], cwd);
  assert.equal(create.code, CLI_EXIT_FAILURE);
  const payload = JSON.parse(create.stdout) as {
    ok: boolean;
    error: { code: string; status: string; location: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_agent_plan_state");
  assert.equal(payload.error.status, "FAIL");
  assert.equal(payload.error.location, "claw.workspace.data.agent_plans");
  assert.equal(fs.readFileSync(statePath, "utf8"), "{bad-json");
});
