import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./inspect-cli-test-support.ts";

test("gateway agent-service rejects invalid cost flags before persistence", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-gateway-agent-cost-"));

  for (const [flag, value, code] of [
    ["--estimated-cost-cents", "nope", "invalid_agent_service_estimated_cost"],
    ["--estimated-cost-cents", "-1", "invalid_agent_service_estimated_cost"],
    ["--limit-cents", "none", "invalid_agent_service_budget_limit"],
    ["--used-cents", "-1", "invalid_agent_service_budget_used"],
  ] as const) {
    const result = await runCliCapture([
      "gateway",
      "agent-service",
      "--tenant-id",
      "tenant.acme",
      "--agent-id",
      "agent.support",
      "--assignment-id",
      "assignment.service",
      "--state-dir",
      stateDir,
      "--record",
      "true",
      flag,
      value,
      "--json",
    ], process.cwd());
    assert.equal(result.code, CLI_EXIT_USAGE, `${flag} ${value}`);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      error: { code: string; status: string; message: string };
    };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, code);
    assert.equal(payload.error.status, "USAGE");
    assert.match(payload.error.message, new RegExp(flag));
  }

  assert.equal(fs.existsSync(path.join(stateDir, "remote-sync-state.json")), false);
});

test("sync status reports corrupt remote sync state as usage", async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-remote-state-corrupt-"));
  fs.writeFileSync(path.join(stateDir, "remote-sync-state.json"), "{bad", "utf8");

  const result = await runCliCapture(["sync", "status", "--state-dir", stateDir, "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  const payload = JSON.parse(result.stdout) as {
    ok: boolean;
    error: { code: string; status: string; message: string };
  };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_remote_sync_state_json");
  assert.equal(payload.error.status, "USAGE");
  assert.match(payload.error.message, /remote-sync-state\.json/);
});
