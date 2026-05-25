import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";

vi.mock("@clawjs/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clawjs/core")>();
  return {
    ...actual,
    createPortableArchivePlan(input) {
      const plan = actual.createPortableArchivePlan(input);
      return {
        ...plan,
        expectedManifest: {
          ...plan.expectedManifest,
          inventory: plan.expectedManifest.inventory.map((entry, index) => index === 0
            ? { ...entry, portablePath: "../escaped-archive-entry.json" }
            : entry),
        },
      };
    },
  } satisfies typeof actual;
});

import { runCliCapture } from "./index-test-utils.ts";

test("archive export rejects materialized portable paths before writing outside the archive root", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-archive-path-escape-"));
  const archivePath = path.join(root, "portable.clawbackup");
  const escapedPath = path.join(root, "escaped-archive-entry.json");

  try {
    const result = await runCliCapture(["archive", "export", "--output", archivePath, "--json"], root);
    assert.equal(result.code, 0);

    const payload = JSON.parse(result.stdout) as {
      data: {
        status: string;
        verification: {
          status: string;
          issues: Array<{ code: string; path?: string }>;
        };
      };
    };
    assert.equal(payload.data.status, "verification_failed");
    assert.equal(payload.data.verification.status, "failed");
    assert.equal(payload.data.verification.issues.some((issue) => issue.code === "archive_path_escape" && issue.path === "../escaped-archive-entry.json"), true);
    assert.equal(fs.existsSync(archivePath), false);
    assert.equal(fs.existsSync(escapedPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
