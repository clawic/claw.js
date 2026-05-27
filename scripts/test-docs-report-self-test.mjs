#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

function run(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const repoRoot = path.resolve(".");
const scratch = await mkdtemp(path.join(os.tmpdir(), "clawjs-test-docs-report-"));

try {
  await mkdir(path.join(scratch, "scripts"));
  await writeFile(
    path.join(scratch, "package.json"),
    JSON.stringify({ type: "module", scripts: {} }, null, 2)
  );
  await writeFile(
    path.join(scratch, "scripts", "alpha-guard.mjs"),
    "console.error('ALPHA_FAILURE fixture breach at 2026-05-27T10:20:30Z:12:4'); process.exit(1);\n"
  );
  await writeFile(
    path.join(scratch, "scripts", "beta-doc-check.mjs"),
    "console.error('BETA_FAILURE fixture drift at 2026-05-28T11:21:31Z:9:2'); process.exit(1);\n"
  );
  await writeFile(path.join(scratch, "scripts", "passing-guard.mjs"), "process.exit(0);\n");

  const commandsPath = path.join(scratch, "commands.json");
  const reportPath = path.join(scratch, "report.json");
  await writeFile(
    commandsPath,
    JSON.stringify([
      "node ./scripts/alpha-guard.mjs",
      "node ./scripts/passing-guard.mjs",
      "node ./scripts/beta-doc-check.mjs"
    ])
  );

  const result = await run(
    process.execPath,
    [
      path.join(repoRoot, "scripts/test-docs-runner.mjs"),
      "--report-all",
      "--repo-root",
      scratch,
      "--commands-json",
      commandsPath,
      "--report-file",
      reportPath
    ],
    repoRoot
  );

  assert(result.status === 0, `report-all exited ${result.status}\n${result.stderr}\n${result.stdout}`);

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert(Array.isArray(report), "report must be an array");
  assert(report.length === 2, `expected 2 failures, got ${report.length}`);

  const [alpha, beta] = report;
  assert(alpha.guard === "alpha-guard", `unexpected alpha guard ${alpha.guard}`);
  assert(alpha.target === "scripts/alpha-guard.mjs", `unexpected alpha target ${alpha.target}`);
  assert(
    alpha.signature.includes("ALPHA_FAILURE fixture breach at <ts>:<line:col>"),
    `alpha signature was not normalized: ${alpha.signature}`
  );
  assert(beta.guard === "beta-doc-check", `unexpected beta guard ${beta.guard}`);
  assert(beta.target === "scripts/beta-doc-check.mjs", `unexpected beta target ${beta.target}`);
  assert(
    beta.signature.includes("BETA_FAILURE fixture drift at <ts>:<line:col>"),
    `beta signature was not normalized: ${beta.signature}`
  );
  assert(report.every((entry) => typeof entry.ts === "string" && entry.ts.length > 0), "each entry needs ts");

  console.log("test-docs report self-test passed");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
