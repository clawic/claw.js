import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";
import { resolveClawjsMainDbPath } from "./v1-data-core.ts";

async function withTempConnectorContext<T>(fn: (cwd: string, dataRoot: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-connector-context-cli-"));
  const cwd = path.join(root, "workspace");
  const dataRoot = path.join(root, "data");
  fs.mkdirSync(cwd, { recursive: true });
  const previousDataDir = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = dataRoot;
  try {
    return await fn(cwd, dataRoot);
  } finally {
    if (previousDataDir === undefined) delete process.env.CLAW_DATA_DIR;
    else process.env.CLAW_DATA_DIR = previousDataDir;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("accounts exposes governed connector context catalog", async () => {
  const result = await withTempConnectorContext((cwd) => runCliCapture(["accounts", "list", "--json"], cwd));
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
  const result = await withTempConnectorContext((cwd) => runCliCapture([
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
  ], cwd));
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
  const result = await withTempConnectorContext((cwd) => runCliCapture(["acct", "doctor", "--provider", "revenuecat", "--json"], cwd));
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { report: { ok: boolean; providers: number; gaps: unknown[] } };
  };

  assert.equal(payload.data.report.ok, true);
  assert.equal(payload.data.report.providers, 1);
  assert.deepEqual(payload.data.report.gaps, []);
});

test("connectors ctx schema exposes Apple signing context", async () => {
  const result = await withTempConnectorContext((cwd) => runCliCapture(["connectors", "ctx", "schema", "apple", "--json"], cwd));
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
  const result = await withTempConnectorContext((cwd) => runCliCapture([
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
  ], cwd));
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { decision: { allowed: boolean; reasons: Array<{ code: string; field?: string }> } };
  };

  assert.equal(payload.data.decision.allowed, false);
  assert.equal(payload.data.decision.reasons.some((reason) => reason.code === "context_object_blocked"), true);
  assert.equal(payload.data.decision.reasons.some((reason) => reason.code === "context_field_missing" && reason.field === "sku"), true);
});

test("RevenueCat explain falls back from v2 to v1 only with a traced rule", async () => {
  const result = await withTempConnectorContext((cwd) => runCliCapture([
    "connectors",
    "context",
    "explain",
    "revenuecat",
    "--v2-state",
    "paused",
    "--v1-secret-ref",
    "secret://revenuecat/v1",
    "--json",
  ], cwd));
  assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    data: { decision: { allowed: boolean; selected: Array<{ id: string }>; trace: { fallbackRuleIds: string[] } } };
  };

  assert.equal(payload.data.decision.allowed, true);
  assert.deepEqual(payload.data.decision.selected.map((record) => record.id), ["revenuecat_api_v1"]);
  assert.deepEqual(payload.data.decision.trace.fallbackRuleIds, ["revenuecat_v2_to_v1"]);
});

test("accounts upsert, link-secret, defaults, and state changes persist in core sqlite", async () => {
  await withTempConnectorContext(async (cwd, dataRoot) => {
    const upsert = await runCliCapture([
      "accounts",
      "upsert",
      "revenuecat_api_v2",
      "--provider",
      "revenuecat",
      "--kind",
      "key",
      "--name",
      "RevenueCat API v2",
      "--set",
      "api_version=v2",
      "--json",
    ], cwd);
    assert.equal(upsert.code, CLI_EXIT_OK, upsert.stderr || upsert.stdout);

    const link = await runCliCapture([
      "accounts",
      "link-secret",
      "revenuecat_api_v2",
      "--field",
      "api_key",
      "--secret-ref",
      "secret://revenuecat/v2",
      "--json",
    ], cwd);
    assert.equal(link.code, CLI_EXIT_OK, link.stderr || link.stdout);

    const defaults = await runCliCapture([
      "connectors",
      "ctx",
      "defaults",
      "set",
      "--context",
      "revenuecat_api_v2",
      "--provider",
      "revenuecat",
      "--scope",
      "provider:revenuecat",
      "--priority",
      "200",
      "--json",
    ], cwd);
    assert.equal(defaults.code, CLI_EXIT_OK, defaults.stderr || defaults.stdout);

    const pause = await runCliCapture(["accounts", "pause", "revenuecat_api_v2", "--reason", "Rotating key", "--json"], cwd);
    assert.equal(pause.code, CLI_EXIT_OK, pause.stderr || pause.stdout);
    const pausePayload = JSON.parse(pause.stdout) as { data: { record: { id: string; state: string } } };
    assert.equal(pausePayload.data.record.id, "revenuecat_api_v2");
    assert.equal(pausePayload.data.record.state, "paused");

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: dataRoot } as NodeJS.ProcessEnv), { readonly: true });
    try {
      const record = sqlite.prepare("SELECT fields_json, state FROM connector_context_records WHERE id = ?").get("revenuecat_api_v2") as { fields_json: string; state: string };
      assert.equal(record.state, "paused");
      const fields = JSON.parse(record.fields_json) as { api_key: { secretRef: string; value?: string } };
      assert.equal(fields.api_key.secretRef, "secret://revenuecat/v2");
      assert.equal("value" in fields.api_key, false);
      const auditCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM connector_context_audit_events").get() as { count: number }).count;
      assert.equal(auditCount >= 4, true);
    } finally {
      sqlite.close();
    }
  });
});

test("accounts export defaults to redacted records and audits the export", async () => {
  await withTempConnectorContext(async (cwd, dataRoot) => {
    await runCliCapture([
      "accounts",
      "upsert",
      "apple_app_release",
      "--provider",
      "apple",
      "--kind",
      "app",
      "--name",
      "Release App",
      "--set",
      "bundle_id=com.example.release",
      "--set",
      "sku=SKU123",
      "--json",
    ], cwd);

    const result = await runCliCapture(["accounts", "export", "--provider", "apple", "--json"], cwd);
    assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
    assert.equal(result.stdout.includes("com.example.release"), false);
    assert.equal(result.stdout.includes("SKU123"), false);
    const payload = JSON.parse(result.stdout) as {
      data: {
        export: {
          mode: string;
          policy: { protectedHandlingRequired: boolean; privateFieldsIncluded: boolean; plaintextSecretsIncluded: boolean };
          records: Array<{ fieldEntries: Array<{ name: string; value: unknown; redacted?: boolean }> }>;
        };
      };
    };
    assert.equal(payload.data.export.mode, "redacted");
    assert.equal(payload.data.export.policy.protectedHandlingRequired, false);
    assert.equal(payload.data.export.policy.privateFieldsIncluded, false);
    assert.equal(payload.data.export.policy.plaintextSecretsIncluded, false);
    const bundleId = payload.data.export.records[0]?.fieldEntries.find((entry) => entry.name === "bundle_id");
    assert.equal(bundleId?.value, "redacted");
    assert.equal(bundleId?.redacted, true);

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: dataRoot } as NodeJS.ProcessEnv), { readonly: true });
    try {
      const auditCount = (sqlite.prepare("SELECT COUNT(*) AS count FROM connector_context_audit_events WHERE event_type = 'context.export'").get() as { count: number }).count;
      assert.equal(auditCount, 1);
    } finally {
      sqlite.close();
    }
  });
});

test("accounts export private envelope includes private context but never plaintext secrets", async () => {
  await withTempConnectorContext(async (cwd) => {
    await runCliCapture([
      "accounts",
      "upsert",
      "apple_app_release",
      "--provider",
      "apple",
      "--kind",
      "app",
      "--name",
      "Release App",
      "--set",
      "bundle_id=com.example.release",
      "--set",
      "sku=SKU123",
      "--json",
    ], cwd);
    await runCliCapture([
      "accounts",
      "upsert",
      "revenuecat_api_v2",
      "--provider",
      "revenuecat",
      "--kind",
      "key",
      "--set",
      "api_version=v2",
      "--json",
    ], cwd);
    await runCliCapture([
      "accounts",
      "link-secret",
      "revenuecat_api_v2",
      "--field",
      "api_key",
      "--secret-ref",
      "secret://revenuecat/v2",
      "--json",
    ], cwd);

    const result = await runCliCapture(["accounts", "export", "--mode", "private-envelope", "--json"], cwd);
    assert.equal(result.code, CLI_EXIT_OK, result.stderr || result.stdout);
    assert.equal(result.stdout.includes("plain-secret"), false);
    const payload = JSON.parse(result.stdout) as {
      data: {
        export: {
          mode: string;
          policy: { protectedHandlingRequired: boolean; privateFieldsIncluded: boolean; plaintextSecretsIncluded: boolean; secretMaterialIncluded: boolean };
          records: Array<{ id: string; fieldEntries: Array<{ name: string; value?: unknown; binding?: { present: boolean; scheme: string } }> }>;
        };
      };
    };
    assert.equal(payload.data.export.mode, "private-envelope");
    assert.equal(payload.data.export.policy.protectedHandlingRequired, true);
    assert.equal(payload.data.export.policy.privateFieldsIncluded, true);
    assert.equal(payload.data.export.policy.plaintextSecretsIncluded, false);
    assert.equal(payload.data.export.policy.secretMaterialIncluded, false);
    assert.equal(payload.data.export.records.find((record) => record.id === "apple_app_release")?.fieldEntries.find((entry) => entry.name === "bundle_id")?.value, "com.example.release");
    assert.deepEqual(
      payload.data.export.records.find((record) => record.id === "revenuecat_api_v2")?.fieldEntries.find((entry) => entry.name === "api_key")?.binding,
      { present: true, scheme: "secret" },
    );
  });
});

test("accounts preserve desired observed and verification metadata across edits", async () => {
  await withTempConnectorContext(async (cwd) => {
    const create = await runCliCapture([
      "accounts",
      "upsert",
      "google_play_app",
      "--provider",
      "google",
      "--kind",
      "app",
      "--set",
      "package_name=com.example.app",
      "--desired",
      "{\"track\":\"production\"}",
      "--observed",
      "{\"track\":\"internal\"}",
      "--verification",
      "{\"source\":\"manual-review\",\"confidence\":\"low\"}",
      "--json",
    ], cwd);
    assert.equal(create.code, CLI_EXIT_OK, create.stderr || create.stdout);

    const edit = await runCliCapture([
      "accounts",
      "edit",
      "google_play_app",
      "--provider",
      "google",
      "--kind",
      "app",
      "--set",
      "play_console_app_id=play-app-123",
      "--json",
    ], cwd);
    assert.equal(edit.code, CLI_EXIT_OK, edit.stderr || edit.stdout);

    const exported = await runCliCapture(["accounts", "export", "--provider", "google", "--mode", "private-envelope", "--json"], cwd);
    assert.equal(exported.code, CLI_EXIT_OK, exported.stderr || exported.stdout);
    const payload = JSON.parse(exported.stdout) as {
      data: {
        export: {
          records: Array<{ id: string; desired?: Record<string, unknown>; observed?: Record<string, unknown>; verification?: Record<string, unknown> }>;
        };
      };
    };
    const record = payload.data.export.records.find((entry) => entry.id === "google_play_app");
    assert.deepEqual(record?.desired, { track: "production" });
    assert.deepEqual(record?.observed, { track: "internal" });
    assert.deepEqual(record?.verification, { source: "manual-review", confidence: "low" });
  });
});

test("accounts explain uses persisted context before fixtures", async () => {
  await withTempConnectorContext(async (cwd) => {
    await runCliCapture([
      "accounts",
      "upsert",
      "apple_team_release",
      "--provider",
      "apple",
      "--kind",
      "team",
      "--name",
      "Release Team",
      "--set",
      "team_id=TEAM123",
      "--json",
    ], cwd);
    await runCliCapture([
      "accounts",
      "upsert",
      "apple_app_release",
      "--provider",
      "apple",
      "--kind",
      "app",
      "--name",
      "Release App",
      "--set",
      "bundle_id=com.example.release",
      "--set",
      "sku=SKU123",
      "--json",
    ], cwd);

    const explain = await runCliCapture(["accounts", "explain", "apple", "--operation", "apple.upload", "--json"], cwd);
    assert.equal(explain.code, CLI_EXIT_OK, explain.stderr || explain.stdout);
    const payload = JSON.parse(explain.stdout) as { data: { decision: { allowed: boolean; selected: Array<{ id: string; fields: Record<string, { value: unknown; redacted?: boolean }> }> } } };
    assert.equal(payload.data.decision.allowed, true);
    assert.deepEqual(payload.data.decision.selected.map((record) => record.id).sort(), ["apple_app_release", "apple_team_release"]);
    assert.equal(payload.data.decision.selected.some((record) => Object.values(record.fields).some((field) => field.value === "redacted" && field.redacted === true)), true);
  });
});

test("secret-ref fields reject plaintext set values", async () => {
  await withTempConnectorContext(async (cwd) => {
    const result = await runCliCapture([
      "accounts",
      "upsert",
      "revenuecat_api_bad",
      "--provider",
      "revenuecat",
      "--kind",
      "key",
      "--set",
      "api_key=plain-secret",
      "--json",
    ], cwd);
    assert.equal(result.code, CLI_EXIT_USAGE);
    const payload = JSON.parse(result.stdout) as { error: { code: string } };
    assert.equal(payload.error.code, "secret_material_rejected");
  });
});

test("unknown governed context provider returns usage failure", async () => {
  const result = await withTempConnectorContext((cwd) => runCliCapture(["accounts", "schema", "missing_provider", "--json"], cwd));
  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "unknown_provider");
});
