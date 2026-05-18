import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture } from "./index-test-utils.ts";

test("search monitor run records sensitive query audit events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-search-monitor-audit-"));
  const dataRoot = path.join(workspaceRoot, "data");
  try {
    const saved = await runCliCapture([
      "search",
      "saved",
      "create",
      "secret-monitor-query",
      "--query",
      "secret token",
      "--actor",
      "agent:test",
      "--surface",
      "cli",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(saved.code, CLI_EXIT_OK, saved.stderr || saved.stdout);

    const monitor = await runCliCapture([
      "search",
      "monitors",
      "create",
      "secret-monitor",
      "--saved-search",
      "secret-monitor-query",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(monitor.code, CLI_EXIT_OK, monitor.stderr || monitor.stdout);

    const run = await runCliCapture([
      "search",
      "monitors",
      "run",
      "secret-monitor",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(run.code, CLI_EXIT_OK, run.stderr || run.stdout);

    const audit = await runCliCapture([
      "search",
      "audit",
      "--type",
      "sensitive_query",
      "--data-dir",
      dataRoot,
      "--json",
    ], workspaceRoot);
    assert.equal(audit.code, CLI_EXIT_OK, audit.stderr || audit.stdout);
    const payload = JSON.parse(audit.stdout) as {
      data: {
        items: Array<{
          type: string;
          actor?: string;
          surface?: string;
          query?: string;
          metadata?: { monitorId?: string; savedSearchId?: string; resultCount?: number };
        }>;
      };
    };
    const event = payload.data.items.find((item) => item.query === "secret token");
    assert.equal(event?.type, "sensitive_query");
    assert.equal(event?.actor, "agent:test");
    assert.equal(event?.surface, "cli");
    assert.equal(event?.metadata?.monitorId, "secret-monitor");
    assert.equal(event?.metadata?.savedSearchId, "secret-monitor-query");
    assert.equal(typeof event?.metadata?.resultCount, "number");
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
