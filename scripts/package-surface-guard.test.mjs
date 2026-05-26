import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "vitest";

const scriptPath = path.resolve("scripts/package-surface-guard.mjs");

test("package surface guard rejects approved bins with missing targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-surface-guard-test-"));
  try {
    fs.mkdirSync(path.join(root, "pkg"), { recursive: true });
    fs.writeFileSync(path.join(root, "pkg", "package.json"), JSON.stringify({
      name: "@clawjs/bad-bin",
      bin: { claw: "./missing.js" },
    }));

    const result = runGuard(root, "pkg");

    assert.equal(result.status, 1);
    assert.match(result.stderr, /package_surface_bin_target_missing/);
    assert.match(result.stderr, /bin "claw" points to missing file/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("package surface guard accepts approved bins with existing package-local targets", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "package-surface-guard-test-"));
  try {
    fs.mkdirSync(path.join(root, "pkg", "bin"), { recursive: true });
    fs.writeFileSync(path.join(root, "pkg", "bin", "claw.mjs"), "#!/usr/bin/env node\n");
    fs.writeFileSync(path.join(root, "pkg", "package.json"), JSON.stringify({
      name: "@clawjs/valid-bin",
      bin: { claw: "bin/claw.mjs" },
    }));

    const result = runGuard(root, "pkg");

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Package surface guard passed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function runGuard(cwd, target) {
  return spawnSync(process.execPath, [scriptPath, "--steward", "clawjs", target], {
    cwd,
    encoding: "utf8",
  });
}
