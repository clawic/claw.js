import { test } from "vitest";
import assert from "node:assert/strict";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("accounts exposes governed connector context catalog", async () => {
  const result = await runCliCapture(["accounts", "list", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    meta: { canonicalCommand: string; invokedCommand: string; operation: string };
    data: { providers: Array<{ providerId: string; contextKinds: string[]; subprofiles: string[] }> };
  };

  assert.equal(payload.ok, true);
  assert.equal(payload.meta.canonicalCommand, "accounts");
  assert.equal(payload.meta.invokedCommand, "accounts");
  assert.equal(payload.meta.operation, "list");
  assert.equal(payload.data.providers.some((provider) => provider.providerId === "apple" && provider.contextKinds.includes("signing_identity")), true);
  assert.equal(payload.data.providers.some((provider) => provider.providerId === "amazon_appstore"), true);
  assert.equal(payload.data.providers.find((provider) => provider.providerId === "google")?.subprofiles.includes("google_play"), true);
  assert.equal(payload.data.providers.some((provider) => provider.providerId === "revenuecat"), true);
});

test("connectors context explains provider context choices without exposing private fields", async () => {
  const result = await runCliCapture([
    "connectors",
    "context",
    "explain",
    "apple",
    "--operation",
    "apple.upload",
    "--env",
    "production",
    "--team-id",
    "TEAM123",
    "--bundle-id",
    "com.example.app",
    "--sku",
    "SKU123",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: {
      decision: {
        allowed: boolean;
        selected: Array<{ fields: Record<string, { value: unknown; redacted?: boolean }> }>;
      };
    };
  };

  assert.equal(payload.data.decision.allowed, true);
  assert.equal(payload.data.decision.selected.some((record) => Object.values(record.fields).some((field) => field.value === "redacted" && field.redacted === true)), true);
});

test("acct doctor validates governed connector context schemas", async () => {
  const result = await runCliCapture(["acct", "doctor", "--provider", "revenuecat", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { report: { ok: boolean; providers: number; gaps: unknown[] } };
  };

  assert.equal(payload.data.report.ok, true);
  assert.equal(payload.data.report.providers, 1);
  assert.deepEqual(payload.data.report.gaps, []);
});

test("connectors ctx schema exposes Apple signing context", async () => {
  const result = await runCliCapture(["connectors", "ctx", "schema", "apple", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { schema: { providerId: string; contextKinds: Array<{ kind: string }>; fields: Array<{ name: string; sensitivity: string }> } };
    meta: { canonicalCommand: string; subcommand: string; operation: string };
  };

  assert.equal(payload.meta.canonicalCommand, "connectors");
  assert.equal(payload.meta.subcommand, "context");
  assert.equal(payload.meta.operation, "schema");
  assert.equal(payload.data.schema.providerId, "apple");
  assert.equal(payload.data.schema.contextKinds.some((entry) => entry.kind === "signing_identity"), true);
  assert.equal(payload.data.schema.fields.find((entry) => entry.name === "team_id")?.sensitivity, "private");
});

test("Apple explain rejects incomplete signing context with explicit reasons", async () => {
  const result = await runCliCapture([
    "accounts",
    "explain",
    "apple",
    "--operation",
    "apple.upload",
    "--team-id",
    "TEAM1",
    "--bundle-id",
    "com.example.app",
    "--team-state",
    "blocked",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { decision: { allowed: boolean; reasons: Array<{ code: string; field?: string }> } };
  };

  assert.equal(payload.data.decision.allowed, false);
  assert.equal(payload.data.decision.reasons.some((reason) => reason.code === "context_object_blocked"), true);
  assert.equal(payload.data.decision.reasons.some((reason) => reason.code === "context_field_missing" && reason.field === "sku"), true);
});

test("RevenueCat explain falls back from v2 to v1 only with a traced rule", async () => {
  const result = await runCliCapture([
    "connectors",
    "context",
    "explain",
    "revenuecat",
    "--v2-state",
    "paused",
    "--v1-secret-ref",
    "secret://revenuecat/v1",
    "--json",
  ], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { decision: { allowed: boolean; selected: Array<{ id: string }>; trace: { fallbackRuleIds: string[] } } };
  };

  assert.equal(payload.data.decision.allowed, true);
  assert.deepEqual(payload.data.decision.selected.map((record) => record.id), ["revenuecat_api_v1"]);
  assert.deepEqual(payload.data.decision.trace.fallbackRuleIds, ["revenuecat_v2_to_v1"]);
});

test("accounts edit verbs are exposed as non-mutating plans until storage is wired", async () => {
  const result = await runCliCapture(["accounts", "block", "apple_team_default", "--provider", "apple", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { mutationSupported: boolean; externalPending: boolean; plan: { action: string; state: string; recordId: string } };
  };

  assert.equal(payload.data.mutationSupported, false);
  assert.equal(payload.data.externalPending, true);
  assert.equal(payload.data.plan.action, "block");
  assert.equal(payload.data.plan.state, "blocked");
  assert.equal(payload.data.plan.recordId, "apple_team_default");
});

test("unknown governed context provider returns usage failure", async () => {
  const result = await runCliCapture(["accounts", "schema", "missing_provider", "--json"], process.cwd());
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_provider");
});
