import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("safety returns JSON usage errors for unknown subcommands", async () => {
  const result = await runCliCapture(["safety", "definitely_missing", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: {
      code: string;
      status: string;
      location: string;
      safeNextStep: string;
      details?: {
        received?: string | null;
        validSubcommands?: string[];
      };
    };
    meta: { canonicalCommand: string; subcommand: string | null };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.meta.canonicalCommand, "safety");
  assert.equal(payload.meta.subcommand, "definitely_missing");
  assert.equal(payload.error.code, "unknown_safety_subcommand");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.safety.subcommand");
  assert.equal(payload.error.safeNextStep.includes("claw safety domains --json"), true);
  assert.equal(payload.error.details?.received, "definitely_missing");
  assert.deepEqual(payload.error.details?.validSubcommands, ["domains", "classify", "check", "explain", "disclaimers"]);
});

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

test("safety human domain surfaces preserve guard metadata", async () => {
  const domains = await runCliCapture(["safety", "domains"], process.cwd());
  assert.equal(domains.code, CLI_EXIT_OK, domains.stderr || domains.stdout);
  assert.match(domains.stdout, /health/);
  assert.match(domains.stdout, /contextual_remembered/);
  assert.match(domains.stdout, /required/);

  const classify = await runCliCapture(["safety", "classify", "finance"], process.cwd());
  assert.equal(classify.code, CLI_EXIT_OK, classify.stderr || classify.stdout);
  assert.match(classify.stdout, /"regulatedDomain": "finance"/);
  assert.match(classify.stdout, /"disclaimerPolicy": "contextual_remembered"/);
  assert.match(classify.stdout, /"outputLabelPolicy": "required"/);
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
    data: { decision: { allowed: boolean; policyDecision: string; denialCodes: string[]; outputLabels: string[] } };
  };
  assert.equal(payload.data.decision.allowed, false);
  assert.equal(payload.data.decision.policyDecision, "block");
  assert.deepEqual(payload.data.decision.denialCodes.sort(), ["blocked_regulated_use", "final_decision_blocked"]);
  assert.equal(payload.data.decision.outputLabels.includes("regulated_domain:finance"), true);
});

test("safety check can return confirm or allow through central policy config", async () => {
  const confirm = await runCliCapture([
    "safety",
    "check",
    "--domain",
    "legal",
    "--effect",
    "external_action",
    "--export",
    "true",
    "--json",
  ], process.cwd());
  assert.equal(confirm.code, CLI_EXIT_OK, confirm.stderr || confirm.stdout);
  const confirmPayload = JSON.parse(confirm.stdout) as {
    data: { decision: { allowed: boolean; policyDecision: string; requirements: string[] } };
  };
  assert.equal(confirmPayload.data.decision.allowed, false);
  assert.equal(confirmPayload.data.decision.policyDecision, "confirm");
  assert.ok(confirmPayload.data.decision.requirements.includes("human_review"));

  const allow = await runCliCapture([
    "safety",
    "check",
    "--domain",
    "legal",
    "--effect",
    "external_action",
    "--export",
    "true",
    "--confirm",
    "true",
    "--approval-id",
    "approval_cli_safety",
    "--legal-label",
    "Legal export - human reviewed",
    "--material-consent",
    "true",
    "--destination-authorized",
    "true",
    "--json",
  ], process.cwd());
  assert.equal(allow.code, CLI_EXIT_OK, allow.stderr || allow.stdout);
  const allowPayload = JSON.parse(allow.stdout) as {
    data: { decision: { allowed: boolean; policyDecision: string; reasonCodes: string[] } };
  };
  assert.equal(allowPayload.data.decision.allowed, true);
  assert.equal(allowPayload.data.decision.policyDecision, "allow");
  assert.ok(allowPayload.data.decision.reasonCodes.includes("sensitive_export_review_required"));
});

test("safety check validates boolean guard flags", async () => {
  const invalid = await runCliCapture([
    "safety",
    "check",
    "--domain",
    "legal",
    "--effect",
    "summary",
    "--minor",
    "maybe",
    "--json",
  ], process.cwd());
  assert.equal(invalid.code, CLI_EXIT_USAGE, invalid.stderr || invalid.stdout);
  const invalidPayload = JSON.parse(invalid.stdout) as {
    ok: boolean;
    error: { code: string; status: string };
  };
  assert.equal(invalidPayload.ok, false);
  assert.equal(invalidPayload.error.code, "invalid_boolean_flag");
  assert.equal(invalidPayload.error.status, "USAGE");

  const explicitFalse = await runCliCapture([
    "safety",
    "check",
    "--domain",
    "legal",
    "--effect",
    "summary",
    "--external",
    "false",
    "--export",
    "false",
    "--json",
  ], process.cwd());
  assert.equal(explicitFalse.code, CLI_EXIT_OK, explicitFalse.stderr || explicitFalse.stdout);
  const falsePayload = JSON.parse(explicitFalse.stdout) as {
    data: { decision: { allowed: boolean; policyDecision: string; reasonCodes: string[] } };
  };
  assert.equal(falsePayload.data.decision.allowed, true);
  assert.equal(falsePayload.data.decision.policyDecision, "allow");
  assert.equal(falsePayload.data.decision.reasonCodes.includes("external_review_required"), false);
});

test("safety explain returns policy evidence for regulated domains", async () => {
  const result = await runCliCapture(["safety", "explain", "legal", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: {
      policy: { regulatedDomain: string; disclaimerPolicy: string; outputLabelPolicy: string };
      allowedUses: string[];
      blockedUses: string[];
      prohibitedPractices: string[];
    };
    meta: { canonicalCommand: string; subcommand: string };
  };
  assert.equal(payload.meta.canonicalCommand, "safety");
  assert.equal(payload.meta.subcommand, "explain");
  assert.equal(payload.data.policy.regulatedDomain, "legal");
  assert.equal(payload.data.policy.disclaimerPolicy, "contextual_remembered");
  assert.equal(payload.data.policy.outputLabelPolicy, "required");
  assert.equal(payload.data.allowedUses.includes("factual_summary"), true);
  assert.equal(payload.data.blockedUses.includes("legal_strategy_as_final_advice"), true);
  assert.equal(payload.data.prohibitedPractices.includes("legal_service_decision"), true);
});

test("safety check human output preserves disclaimer and labels", async () => {
  const result = await runCliCapture([
    "safety",
    "check",
    "--domain",
    "legal",
    "--effect",
    "external_action",
    "--export",
    "true",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  assert.match(result.stdout, /^confirm\t/m);
  assert.match(result.stdout, /disclaimer\tcontextual_remembered/);
  assert.match(result.stdout, /labels\t/);
  assert.match(result.stdout, /not_professional_advice/);
  assert.match(result.stdout, /human_review_required/);
  assert.match(result.stdout, /regulated_domain:legal/);
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
