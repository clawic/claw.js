import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { test } from "vitest";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, runCli } from "./index.ts";
import { captureStream, parseCliJsonPayload, useIsolatedClawDataRoot } from "./index-test-utils.ts";
import type { TestContext } from "vitest";

function useWorkTestRoot(t: TestContext, prefix: string): string {
  const cwd = fs.mkdtempSync(path.join("/private/tmp", prefix));
  useIsolatedClawDataRoot(t, cwd);
  return cwd;
}

test("work export requires confirmation, approval, and persistent legal label", async (t) => {
  const cwd = useWorkTestRoot(t, "clawjs-work-export-");
  const output = path.join(cwd, "snapshot.json");

  const blockedStderr = captureStream();
  assert.equal(await runCli(["work", "export", output, "--json"], {
    stdout: captureStream().stream,
    stderr: blockedStderr.stream,
    cwd,
  }), CLI_EXIT_FAILURE);

  const stdout = captureStream();
  assert.equal(await runCli([
    "work",
    "export",
    output,
    "--confirm",
    "--approval-id",
    "approval_work_export",
    "--legal-label",
    "Work snapshot - human reviewed",
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const result = parseCliJsonPayload<{ path: string }>(stdout.getOutput());
  assert.equal(result.path, output);
  const snapshot = JSON.parse(fs.readFileSync(output, "utf8")) as {
    legal: { approvalId: string; legalLabel: string; confirmed: boolean; exportKind: string };
  };
  assert.deepEqual(snapshot.legal, {
    approvalId: "approval_work_export",
    legalLabel: "Work snapshot - human reviewed",
    confirmed: true,
    exportKind: "work.snapshot",
  });
});

test("work backup requires confirmation, approval, and persistent legal label", async (t) => {
  const cwd = useWorkTestRoot(t, "clawjs-work-backup-");

  assert.equal(await runCli(["work", "backup", "backups", "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_FAILURE);

  const stdout = captureStream();
  assert.equal(await runCli([
    "work",
    "backup",
    "backups",
    "--confirm",
    "--approval-id",
    "approval_work_backup",
    "--legal-label",
    "Work backup - human reviewed",
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);

  const result = parseCliJsonPayload<{ files: string[] }>(stdout.getOutput());
  assert.equal(result.files.length > 0, true);
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, "backups", "claw-legal-backup.json"), "utf8")) as {
    approvalId: string;
    legalLabel: string;
    kind: string;
  };
  assert.equal(manifest.kind, "claw.work.backup.legal");
  assert.equal(manifest.approvalId, "approval_work_backup");
  assert.equal(manifest.legalLabel, "Work backup - human reviewed");
});

test("work import rejects invalid JSON before importing", async (t) => {
  const cwd = useWorkTestRoot(t, "clawjs-work-import-invalid-");
  const input = path.join(cwd, "bad-snapshot.json");
  fs.writeFileSync(input, "{bad", "utf8");

  const stdout = captureStream();
  assert.equal(await runCli(["work", "import", input, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_USAGE);

  const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "invalid_work_import_json");
  assert.equal(payload.error.status, "USAGE");
});

test("productivity dashboards reject invalid limits", async (t) => {
  const cwd = useWorkTestRoot(t, "clawjs-productivity-dashboard-limit-");

  for (const args of [
    ["my-work", "--limit", "nope", "--json"],
    ["team-work", "--limit", "-1", "--json"],
  ]) {
    const stdout = captureStream();
    assert.equal(await runCli(args, {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_USAGE);

    const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "invalid_productivity_limit");
    assert.equal(payload.error.status, "USAGE");
  }
});

test("tasks reject invalid numeric planning flags before creating records", async (t) => {
  const cwd = useWorkTestRoot(t, "clawjs-task-invalid-numbers-");

  for (const entry of [
    { args: ["tasks", "create", "Bad rank", "--rank", "nope", "--json"], code: "invalid_task_rank" },
    { args: ["tasks", "create", "Bad estimate", "--estimate-minutes", "1.5", "--json"], code: "invalid_task_estimate_minutes" },
    { args: ["tasks", "create", "Bad actual", "--actual-minutes", "-1", "--json"], code: "invalid_task_actual_minutes" },
    { args: ["tasks", "create", "Bad story", "--story-points", "-0.5", "--json"], code: "invalid_task_story_points" },
  ]) {
    const stdout = captureStream();
    assert.equal(await runCli(entry.args, {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd,
    }), CLI_EXIT_USAGE);

    const payload = JSON.parse(stdout.getOutput()) as { ok: boolean; error: { code: string; status: string } };
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, entry.code);
    assert.equal(payload.error.status, "USAGE");
  }

  const listStdout = captureStream();
  assert.equal(await runCli(["tasks", "list", "--json"], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd,
  }), CLI_EXIT_OK);
  const listPayload = parseCliJsonPayload<Array<{ id: string }>>(listStdout.getOutput());
  assert.deepEqual(listPayload, []);
});
