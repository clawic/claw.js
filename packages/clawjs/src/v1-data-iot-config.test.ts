import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { CLI_EXIT_OK, CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { resolveClawjsMainDbPath } from "./v1-data-core.ts";

test("iot config rejects invalid enabled values without persisting config", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-iot-config-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-iot-config-cwd-"));
    const stdout = captureStream();
    const code = await runInternalV1Cli(["iot", "config", "set", "sensor", "--name", "Sensor", "--enabled", "treu", "--json"], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd,
    });
    assert.equal(code, CLI_EXIT_USAGE);
    const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; message: string } };
    assert.equal(error.ok, false);
    assert.equal(error.error.code, "invalid_iot_enabled");
    assert.match(error.error.message, /true\|false/);

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      const rows = sqlite.prepare("SELECT * FROM iot_config WHERE id = ?").all("sensor");
      assert.deepEqual(rows, []);
    } finally {
      sqlite.close();
    }

    const validStdout = captureStream();
    assert.equal(await runInternalV1Cli(["iot", "config", "set", "sensor", "--name", "Sensor", "--enabled", "false", "--json"], {
      stdout: validStdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_OK);
    const valid = JSON.parse(validStdout.getOutput()) as { ok: boolean; data: { enabled: number } };
    assert.equal(valid.ok, true);
    assert.equal(valid.data.enabled, 0);
  });
});
