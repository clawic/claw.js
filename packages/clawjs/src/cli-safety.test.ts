import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("safety domains exposes regulated policy coverage", async () => {
  const result = await runCliCapture(["safety", "domains", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    data: { version: number; domains: Array<{ regulatedDomain: string; outputLabelPolicy: string }> };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "safety");
  assert.equal(payload.meta.subcommand, "domains");
  assert.equal(payload.data.version, 1, result.stdout);
  assert.equal(payload.data.domains.some((entry) => entry.regulatedDomain === "health"), true);
  assert.equal(payload.data.domains.every((entry) => entry.outputLabelPolicy === "required"), true);
});

test("safety check blocks final regulated decisions", async () => {
  const result = await runCliCapture([
    "safety",
    "check",
    "--domain",
    "finance",
    "--effect",
    "final_decision",
    "--use",
    "investment_or_credit_decision",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { decision: { allowed: boolean; denialCodes: string[]; outputLabels: string[] } };
  };
  assert.equal(payload.data.decision.allowed, false);
  assert.deepEqual(payload.data.decision.denialCodes.sort(), ["blocked_regulated_use", "final_decision_blocked"]);
  assert.equal(payload.data.decision.outputLabels.includes("regulated_domain:finance"), true);
});

test("safety disclaimers returns persistent labels for sensitive outputs", async () => {
  const result = await runCliCapture(["safety", "disclaimers", "mental_health", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { disclaimerPolicy: string; outputLabels: string[] };
  };
  assert.equal(payload.data.disclaimerPolicy, "contextual_remembered");
  assert.equal(payload.data.outputLabels.includes("not_professional_advice"), true);
  assert.equal(payload.data.outputLabels.includes("regulated_domain:mental_health"), true);
});
