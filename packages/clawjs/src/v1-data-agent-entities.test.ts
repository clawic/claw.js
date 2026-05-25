import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { captureStream, withPatchedEnv } from "./index-test-utils.ts";

test("agent entity record flags reject invalid JSON before evaluation", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agent-record-json-"));
  await withPatchedEnv({
    CLAW_HOME: path.join(tempRoot, "home"),
    CLAW_DATA_DIR: tempRoot,
    CLAW_DB_PATH: undefined,
    DATABASE_DB_PATH: undefined,
    DATABASE_FILES_DIR: undefined,
  }, async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-agent-record-json-cwd-"));
    const invalidStdout = captureStream();

    assert.equal(await runCli(["agents", "evaluate-access", "--record", "{bad", "--json"], {
      stdout: invalidStdout.stream,
      stderr: captureStream().stream,
      cwd,
      binName: "claw",
    }), CLI_EXIT_USAGE);

    const invalid = JSON.parse(invalidStdout.getOutput()) as {
      ok: boolean;
      error: { code: string; status: string; location: string; message: string };
    };
    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, "invalid_agent_record_json");
    assert.equal(invalid.error.status, "USAGE");
    assert.equal(invalid.error.location, "cli.agents.evaluate-access.record");
    assert.match(invalid.error.message, /valid JSON/);

    const invalidEntityCases: Array<{ argv: string[]; code: string; location: string }> = [
      {
        argv: ["personalities", "upsert", "focused", "--record", "{bad", "--json"],
        code: "invalid_personality_record_json",
        location: "cli.personalities.upsert.record",
      },
      {
        argv: ["connections", "upsert", "local", "--record", "{bad", "--json"],
        code: "invalid_connection_record_json",
        location: "cli.connections.upsert.record",
      },
    ];
    for (const testCase of invalidEntityCases) {
      const stdout = captureStream();
      assert.equal(await runCli(testCase.argv, {
        stdout: stdout.stream,
        stderr: captureStream().stream,
        cwd,
        binName: "claw",
      }), CLI_EXIT_USAGE);
      const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string; location: string } };
      assert.equal(payload.ok, false);
      assert.equal(payload.error.code, testCase.code);
      assert.equal(payload.error.status, "USAGE");
      assert.equal(payload.error.location, testCase.location);
    }

    const optionalStdout = captureStream();
    assert.equal(await runCli(["connections", "upsert", "local", "--provider", "local", "--label", "Local", "--json"], {
      stdout: optionalStdout.stream,
      stderr: captureStream().stream,
      cwd,
      binName: "claw",
    }), CLI_EXIT_OK);
    const optional = JSON.parse(optionalStdout.getOutput()) as { ok: boolean; data: { id: string } };
    assert.equal(optional.ok, true);
    assert.equal(optional.data.id, "local");
  });
});
