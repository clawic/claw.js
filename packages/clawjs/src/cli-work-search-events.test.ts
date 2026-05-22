import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registeredDatabasePath, registeredSearchDatabasePath } from "../../../tests/helpers/stable-surface-test-builders.ts";
import { test } from "vitest";

import { SearchStore } from "@clawjs/search";

import { CLI_EXIT_OK } from "./index.ts";
import { runCliCapture, withPatchedEnv } from "./index-test-utils.ts";

test("productivity database writes schedule work search events for create update and delete", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-v1-work-search-events-"));
  const dataRoot = path.join(workspaceRoot, "data");
  try {
    await withPatchedEnv({ CLAW_DATA_DIR: dataRoot }, async () => {
      const created = await runCliCapture(["db", "tasks", "create", "Alias task", "--json"], workspaceRoot);
      assert.equal(created.code, CLI_EXIT_OK, created.stderr || created.stdout);
      const createdPayload = JSON.parse(created.stdout) as { data: { id: string } };
      const taskId = createdPayload.data.id;

      const updated = await runCliCapture(["db", "tasks", "update", taskId, "--set", "status=done", "--json"], workspaceRoot);
      assert.equal(updated.code, CLI_EXIT_OK, updated.stderr || updated.stdout);

      const deleted = await runCliCapture(["db", "tasks", "delete", taskId, "--force", "--json"], workspaceRoot);
      assert.equal(deleted.code, CLI_EXIT_OK, deleted.stderr || deleted.stdout);

      const store = new SearchStore(registeredSearchDatabasePath(dataRoot));
      try {
        const resourceId = `main:tasks:${taskId}`;
        const jobs = store.listIndexJobs({ source: "work.items", limit: 20 });
        assert.equal(jobs.some((job) => job.operation === "upsert" && job.resourceId === resourceId && job.shard === "hot"), true);
        assert.equal(jobs.some((job) => job.operation === "delete" && job.resourceId === resourceId && job.shard === "hot"), true);
      } finally {
        store.close();
      }
    });
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
