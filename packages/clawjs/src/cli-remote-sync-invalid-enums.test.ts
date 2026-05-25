import assert from "node:assert/strict";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./inspect-cli-test-support.ts";

type UsageErrorPayload = {
  ok: boolean;
  error: {
    code: string;
    status: string;
    location: string;
    message: string;
  };
};

test("sync handoff returns structured usage for invalid requested authority", async () => {
  const result = await runCliCapture(["sync", "handoff", "--requested-authority", "bad", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as UsageErrorPayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_sync_authority");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.sync.requested_authority");
  assert.match(payload.error.message, /--requested-authority/);
});

test("remote offline-command returns structured usage for invalid reason", async () => {
  const result = await runCliCapture(["remote", "offline-command", "--reason", "bad", "--json"], process.cwd());

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as UsageErrorPayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_remote_offline_reason");
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.location, "cli.remote.offline_reason");
  assert.match(payload.error.message, /--reason/);
});
