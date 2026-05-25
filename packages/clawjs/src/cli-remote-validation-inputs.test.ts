import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_USAGE } from "./cli-errors.ts";
import { runCliCapture } from "./inspect-cli-test-support.ts";

function makeTempCwd(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-remote-validation-inputs-"));
}

type CliUsagePayload = {
  ok: boolean;
  error: {
    code: string;
    status: string;
  };
};

test("remote validation-readiness returns stable JSON usage for invalid evidence JSON", async () => {
  const cwd = makeTempCwd();

  const result = await runCliCapture(["remote", "validation-readiness", "--evidence-json", "{bad", "--json"], cwd);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as CliUsagePayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.code, "invalid_remote_evidence_json");
});

test("remote validation-readiness returns stable JSON usage for missing evidence file", async () => {
  const cwd = makeTempCwd();
  const missingFile = path.join(cwd, "missing-evidence.json");

  const result = await runCliCapture(["remote", "validation-readiness", "--evidence-file", missingFile, "--json"], cwd);

  assert.equal(result.code, CLI_EXIT_USAGE);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout) as CliUsagePayload;
  assert.equal(payload.ok, false);
  assert.equal(payload.error.status, "USAGE");
  assert.equal(payload.error.code, "remote_evidence_file_missing");
});
