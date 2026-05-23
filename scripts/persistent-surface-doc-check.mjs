import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const docPath = path.join(rootDir, "docs", "persistent-surface.md");
const write = process.argv.includes("--write");

function printFailure(diagnostics) {
  printActionableFailureReport({
    title: "persistent surface docs check failed:",
    diagnostics,
  });
}

function createStaleDiagnostic(location = "docs/persistent-surface.md") {
  return createDiagnostic("persistent_surface_docs_stale", "docs/persistent-surface.md is stale", {
    location,
    suggestion: "Regenerate the rendered persistent surface docs from the current inspect graph.",
    safeNextStep: "Run node scripts/persistent-surface-doc-check.mjs --write, review docs/persistent-surface.md, then rerun node scripts/persistent-surface-doc-check.mjs.",
  });
}

function createCommandFailedDiagnostic(code, message, location, next) {
  return createDiagnostic(code, message, {
    location,
    suggestion: "Fix the command output shown above before trusting the generated docs comparison.",
    safeNextStep: next,
  });
}

function runRequiredCommand(command, args, options) {
  try {
    return execFileSync(command, args, options);
  } catch (error) {
    const commandText = [command, ...args].join(" ");
    const status = error?.status ?? "unknown";
    throw createCommandFailedDiagnostic(
      options.failureCode,
      `${commandText} failed with exit status ${status}`,
      options.failureLocation,
      options.failureNextStep,
    );
  }
}

function generatePersistentSurfaceDocs() {
  runRequiredCommand("npm", ["--prefix", "packages/clawjs-core", "run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
    failureCode: "persistent_surface_docs_build_failed",
    failureLocation: "packages/clawjs-core",
    failureNextStep: "Fix the package build, then rerun node scripts/persistent-surface-doc-check.mjs.",
  });
  return runRequiredCommand(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `
        import { runCli } from "./packages/clawjs/src/index.ts";
        let output = "";
        const stream = { write(chunk) { output += chunk; return true; } };
        const code = await runCli(["inspect", "render", "--format", "markdown"], {
          stdout: stream,
          stderr: process.stderr,
          cwd: process.cwd(),
        });
        if (code !== 0) process.exit(code);
        process.stdout.write(output);
      `,
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
      failureCode: "persistent_surface_docs_render_failed",
      failureLocation: "claw inspect render --format markdown",
      failureNextStep: "Fix inspect render, then rerun node scripts/persistent-surface-doc-check.mjs.",
    },
  );
}

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "persistent surface docs check failed for /Users/example/private:",
    diagnostics: [
      createStaleDiagnostic("/Users/example/private/docs/persistent-surface.md"),
      createCommandFailedDiagnostic(
        "persistent_surface_docs_render_failed",
        "node render failed with token: sk-test-secret-123456",
        "/Users/example/private/packages/clawjs/src/index.ts",
        "Fix inspect render, then rerun node scripts/persistent-surface-doc-check.mjs.",
      ),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: persistent_surface_docs_stale/);
  assert.match(output, /code: persistent_surface_docs_render_failed/);
  assert.match(output, /location: ~\/private\/docs\/persistent-surface\.md/);
  assert.match(output, /suggestion: Regenerate the rendered persistent surface docs/);
  assert.match(output, /next: Run node scripts\/persistent-surface-doc-check\.mjs --write/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("persistent surface docs check self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

let generated;
try {
  generated = generatePersistentSurfaceDocs();
} catch (diagnostic) {
  printFailure([diagnostic]);
  process.exit(1);
}

const current = fs.readFileSync(docPath, "utf8");
if (current !== generated) {
  if (write) {
    fs.writeFileSync(docPath, generated);
    console.log("persistent surface docs regenerated");
    process.exit(0);
  }
  printFailure([createStaleDiagnostic()]);
  process.exit(1);
}

console.log("persistent surface docs check passed");
