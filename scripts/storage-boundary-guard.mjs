#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const failures = [];

const retiredWorkspaceDatabases = [
  ".clawjs/data/database.sqlite",
  ".clawjs/data/productivity.sqlite",
  ".clawjs/data/storage.sqlite",
  ".clawjs/code/code.sqlite",
];

const retiredDatabaseNames = [
  "database.sqlite",
  "productivity.sqlite",
  "storage.sqlite",
  "code.sqlite",
  "claw.sqlite",
  "clawjs.sqlite",
];

const allowedRetiredReferenceFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "docs/agent-rules/index.md",
  "docs/adr/0001-claw-framework-host-boundary.md",
  "docs/adr/0048-naming-and-stability-surfaces.md",
  "docs/data-storage-boundary.md",
  "docs/decision-map.md",
  "docs/host-ownership.md",
  "docs/index.md",
  "docs/naming-style-guide.md",
  "docs/workspace.md",
  "packages/clawjs/src/index-productivity.test.ts",
  "packages/clawjs-node/src/data-v2-config.test.ts",
  "packages/clawjs/src/index-installed.test.ts",
  "scripts/docs-alignment-check.mjs",
  "scripts/naming-surface-guard.mjs",
  "scripts/storage-boundary-guard.mjs",
]);

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".tmp",
  ".data",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "playwright-report",
  "test-results",
]);

const scannedExtensions = new Set([
  ".cjs",
  ".cs",
  ".js",
  ".jsx",
  ".json",
  ".kt",
  ".mjs",
  ".rs",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
]);

function fail(message) {
  failures.push(message);
}

function relativePath(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function read(relative) {
  return fs.readFileSync(path.join(rootDir, relative), "utf8");
}

function requireSnippet(relative, snippet) {
  if (!read(relative).includes(snippet)) {
    fail(`${relative} is missing required storage-boundary snippet ${JSON.stringify(snippet)}`);
  }
}

function forbidSnippet(relative, snippet) {
  if (read(relative).includes(snippet)) {
    fail(`${relative} contains retired storage-boundary snippet ${JSON.stringify(snippet)}`);
  }
}

function listFiles(dir, output = []) {
  const absolute = path.join(rootDir, dir);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const filePath = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      listFiles(relativePath(filePath), output);
    } else if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      output.push(relativePath(filePath));
    }
  }
  return output;
}

function scanRetiredStorageReferences(relative, body) {
  if (allowedRetiredReferenceFiles.has(relative)) return;

  if (/(^|[/\\])\.clawjs([/\\]|$)/.test(body)) {
    fail(`${relative} references retired .clawjs storage; new code must use .claw/, core.sqlite, or a registered sidecar`);
  }

  for (const retired of retiredWorkspaceDatabases) {
    if (body.includes(retired)) {
      fail(`${relative} references retired workspace database ${retired}`);
    }
  }

  for (const retired of retiredDatabaseNames) {
    if (body.includes(retired)) {
      fail(`${relative} references retired database name ${retired}`);
    }
  }
}

function storageBoundaryDiagnostic(failure) {
  const missingSnippet = failure.match(/^(.+) is missing required storage-boundary snippet (.+)$/);
  if (missingSnippet) {
    return createDiagnostic("storage_boundary_required_snippet_missing", failure, {
      location: missingSnippet[1],
      suggestion: "Restore the public storage-boundary contract text before changing runtime storage behavior.",
      safeNextStep: `Update ${missingSnippet[1]}, then rerun npm run test:storage-boundary.`,
    });
  }
  const retiredSnippet = failure.match(/^(.+) contains retired storage-boundary snippet (.+)$/);
  if (retiredSnippet) {
    return createDiagnostic("storage_boundary_retired_snippet_present", failure, {
      location: retiredSnippet[1],
      suggestion: "Replace retired storage wording with the current .claw/core.sqlite boundary.",
      safeNextStep: `Remove the retired snippet from ${retiredSnippet[1]}, then rerun npm run test:storage-boundary.`,
    });
  }
  const retiredReference = failure.match(/^(.+) references retired/);
  if (retiredReference) {
    return createDiagnostic("storage_boundary_retired_reference", failure, {
      location: retiredReference[1],
      suggestion: "Move new code to .claw/, core.sqlite, runtime.sqlite, drive.sqlite, or a registered sidecar.",
      safeNextStep: `Replace the retired storage reference in ${retiredReference[1]}, then rerun npm run test:storage-boundary.`,
    });
  }
  if (failure.startsWith("self-test")) {
    return createDiagnostic("storage_boundary_self_test_failed", failure, {
      location: "scripts/storage-boundary-guard.mjs",
      suggestion: "Fix the storage-boundary guard fixture before trusting the guard result.",
      safeNextStep: "Repair scripts/storage-boundary-guard.mjs, then rerun node scripts/storage-boundary-guard.mjs --self-test.",
    });
  }
  return createDiagnostic("storage_boundary_guard_failed", failure, {
    location: "scripts/storage-boundary-guard.mjs",
    suggestion: "Inspect the named storage-boundary invariant and restore the expected public contract.",
    safeNextStep: "Fix the reported storage boundary issue, then rerun npm run test:storage-boundary.",
  });
}

function printFailures(options = {}) {
  printActionableFailureReport({
    title: options.title ?? "storage boundary guard failed:",
    diagnostics: failures.map(storageBoundaryDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const cases = [
    {
      file: "packages/example/src/bad.ts",
      body: "path.join(workspace, '.clawjs', 'data', 'database.sqlite')",
      expected: ".clawjs",
    },
    {
      file: "packages/example/src/productivity.ts",
      body: "const db = 'productivity.sqlite';",
      expected: "productivity.sqlite",
    },
    {
      file: "docs/data-storage-boundary.md",
      body: "Older `.clawjs/` workspace paths are retired.",
      expected: null,
    },
  ];

  for (const item of cases) {
    const before = failures.length;
    scanRetiredStorageReferences(item.file, item.body);
    const produced = failures.slice(before).join("\n");
    if (item.expected && !produced.includes(item.expected)) {
      fail(`self-test did not flag ${item.expected}`);
    }
    if (!item.expected && produced) {
      fail(`self-test unexpectedly flagged allowed documentation reference: ${produced}`);
    }
    failures.splice(before);
  }

  const chunks = [];
  const before = failures.length;
  failures.push(
    "/Users/example/private/file.ts references retired database name claw.sqlite",
    "docs/data-storage-boundary.md is missing required storage-boundary snippet \"Workspace root: `.claw/`\"",
  );
  printFailures({ stream: { write: (chunk) => chunks.push(chunk) } });
  failures.splice(before);
  const output = chunks.join("");
  assert.match(output, /code: storage_boundary_retired_reference/);
  assert.match(output, /code: storage_boundary_required_snippet_missing/);
  assert.match(output, /location: docs\/data-storage-boundary\.md/);
  assert.match(output, /suggestion: Restore the public storage-boundary contract text/);
  assert.match(output, /next: Update docs\/data-storage-boundary\.md/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.equal(failures.length, 0, failures.join("\n"));

  console.log("storage boundary guard self-test passed");
}

function runGuard() {
  requireSnippet("docs/data-storage-boundary.md", "Framework main database: `~/.claw/data/core.sqlite`");
  requireSnippet("docs/data-storage-boundary.md", "Framework files/blob root: `~/.claw/data/files`");
  requireSnippet("docs/data-storage-boundary.md", "Workspace root: `.claw/`");
  requireSnippet("docs/data-storage-boundary.md", "Clawix host-operational root: `~/.clawix`");
  requireSnippet("docs/data-storage-boundary.md", "Older `.clawjs/` workspace paths");
  requireSnippet("docs/data-storage-boundary.md", "Every future domain migration must state which of these buckets it uses");
  requireSnippet("docs/decision-map.md", "scripts/storage-boundary-guard.mjs");
  requireSnippet("package.json", "\"test:storage-boundary\"");

  requireSnippet("packages/clawjs-workspace/src/workspace-sqlite-surface.ts", "return path.join(dataRoot, \"core.sqlite\");");
  requireSnippet("packages/clawjs-database/src/config.ts", "path.join(dataDir, clawStorageFiles.mainDatabase)");
  requireSnippet("packages/clawjs-node/src/storage/store.ts", "return path.join(dataRoot(workspaceDir), \"drive.sqlite\");");
  requireSnippet("packages/clawjs-node/src/storage/surface.ts", "claw.database.drive.table.storage_objects");
  requireSnippet("packages/clawjs-node/src/storage/surface.ts", "claw.database.drive.table.storage_tokens");
  requireSnippet("packages/clawjs-node/src/storage/surface.ts", "claw.database.drive.table.storage_shares");
  forbidSnippet("packages/clawjs-node/src/storage/surface.ts", "claw.database.core.table.storage_objects");

  requireSnippet("packages/clawjs-node/src/code/index.ts", "return path.join(resolveClawjsDataRoot(), \"runtime.sqlite\");");
  requireSnippet("packages/clawjs-node/src/code/index.ts", "return path.join(resolveGlobalRootDir(rootDir), \"runtime.sqlite\");");
  requireSnippet("packages/clawjs-node/src/code/surface.ts", "claw.database.runtime.table.code_repositories");
  requireSnippet("packages/clawjs-node/src/code/surface.ts", "claw.database.runtime.table.code_intents");
  requireSnippet("packages/clawjs-node/src/code/surface.ts", "claw.database.runtime.table.code_agents");
  forbidSnippet("packages/clawjs-node/src/code/surface.ts", "claw.database.core.table.code_repositories");

  requireSnippet("packages/clawjs/src/v1-data-core.ts", "clear(\"drive.sqlite\", [\"drive_fts\", \"drive_items\", \"storage_objects\", \"storage_tokens\", \"storage_shares\"]);");
  requireSnippet("packages/clawjs/src/v1-data-core.ts", "clear(\"runtime.sqlite\", [");
  requireSnippet("packages/clawjs/src/v1-data-core.ts", "\"code_repositories\"");

  const files = [
    ...listFiles("packages"),
    ...listFiles("bridge"),
    ...listFiles("runtime"),
    ...listFiles("sessions"),
    ...listFiles("audio"),
    ...listFiles("database"),
    ...listFiles("notify"),
    ...listFiles("monitor"),
    ...listFiles("relay"),
    ...listFiles("drive"),
    ...listFiles("secrets"),
    ...listFiles("content"),
    ...listFiles("memory"),
    ...listFiles("modules"),
    ...listFiles("iot"),
    ...listFiles("time"),
    ...listFiles("execution"),
    ...listFiles("delegation"),
    ...listFiles("scripts"),
  ];

  for (const file of files) {
    scanRetiredStorageReferences(file, read(file));
  }

  if (failures.length > 0) {
    printFailures();
    process.exit(1);
  }

  console.log("storage boundary guard passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  runGuard();
}
