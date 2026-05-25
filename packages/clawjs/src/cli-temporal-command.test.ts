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

  for (const value of ["nope", "1.5", "1e3", "0x10", "0"]) {
    const result = await runCliCapture([
      "routines",
      "every",
      "5m",
      "limited heartbeat",
      "--when",
      "idle",
      "--limit",
      value,
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
  }
});

test("routines every rejects non-decimal max wake counts as usage", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-max-wakes-"));

  for (const value of ["1.5", "1e3", "0x10", "0"]) {
    const result = await runCliCapture([
      "routines",
      "every",
      "5m",
      "limited heartbeat",
      "--when",
      "idle",
      "--max-wakes",
      value,
      "--max-wakes-window",
      "5m",
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
    assert.equal(payload.error.code, "usage_error");
    assert.equal(payload.error.status, "USAGE");
    assert.match(payload.error.message, /--max-wakes/);
  }
});

test("routines every rejects impossible active hour windows as usage", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-temporal-active-hours-"));

  const result = await runCliCapture([
    "routines",
    "every",
    "5m",
    "active hours heartbeat",
    "--when",
    "idle",
    "--active-hours",
    "99:99-99:99",
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
  assert.equal(payload.error.code, "usage_error");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /--active-hours/);
});
