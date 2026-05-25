import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("routines every reports invalid heartbeat gate JSON as usage", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-gate-json-"));
  const gatePath = path.join(workspace, "gate.json");
  fs.writeFileSync(gatePath, "{bad", "utf8");

  const result = await runCliCapture([
    "routines",
    "every",
    "5m",
    "gate heartbeat",
    "--gate",
    gatePath,
    "--workspace",
    workspace,
    "--json",
  ], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_heartbeat_gate_json");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /gate\.json/);
});

test("routines every rejects invalid heartbeat context limits as usage", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-limit-"));

  const result = await runCliCapture([
    "routines",
    "every",
    "5m",
    "limited heartbeat",
    "--when",
    "idle",
    "--limit",
    "nope",
    "--workspace",
    workspace,
    "--json",
  ], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_heartbeat_limit");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--limit/);
});
