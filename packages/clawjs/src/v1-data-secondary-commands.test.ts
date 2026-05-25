import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { CLI_EXIT_USAGE } from "./index.ts";
import { captureStream, runInternalV1Cli, withPatchedEnv } from "./index-test-utils.ts";
import { resolveClawjsMainDbPath } from "./v1-data-core.ts";

test("design upsert rejects invalid manifest JSON before persistence", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-design-json-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-design-json-cwd-"));
    const stdout = captureStream();
    const code = await runInternalV1Cli([
      "design",
      "upsert",
      "theme",
      "demo",
      "--name",
      "Demo",
      "--manifest",
      "{bad",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd,
    });

    assert.equal(code, CLI_EXIT_USAGE);
    const error = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(error.ok, false);
    assert.equal(error.error.code, "invalid_design_manifest_json");
    assert.equal(error.error.status, "USAGE");

    const sqlite = new Database(resolveClawjsMainDbPath({ CLAW_DATA_DIR: tempRoot } as NodeJS.ProcessEnv));
    try {
      const rows = sqlite.prepare("SELECT id FROM design_resources").all();
      assert.deepEqual(rows, []);
    } finally {
      sqlite.close();
    }
  });
});
