import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { resolveClawjsMainDbPath } from "./v1-data-core.ts";

test("providers settings rejects invalid enabled values without persisting config", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-provider-settings-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-provider-settings-cwd-"));
    const stderr = captureStream();
    const stdout = captureStream();
    const code = await runInternalV1Cli(["providers", "settings", "set", "openai", "--enabled", "treu", "--json"], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      cwd,
    });
    assert.equal(code, CLI_EXIT_USAGE);
    const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string } };
    assert.equal(error.ok, false);
    assert.equal(error.error.code, "usage");

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      const rows = sqlite.prepare("SELECT * FROM provider_settings WHERE provider = ?").all("openai");
      assert.deepEqual(rows, []);
    } finally {
      sqlite.close();
    }

    const validStdout = captureStream();
    assert.equal(await runInternalV1Cli(["providers", "settings", "set", "openai", "--enabled", "false", "--json"], {
      stdout: validStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const valid = JSON.parse(validStdout.getOutput()) as { ok: boolean; data: { enabled: boolean } };
    assert.equal(valid.ok, true);
    assert.equal(valid.data.enabled, false);
  });
});
