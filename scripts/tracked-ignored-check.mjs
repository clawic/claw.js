import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

function diagnosticsForTrackedIgnoredFiles(files) {
  return files.map((file) => createDiagnostic("tracked_ignored_file", `${file} is tracked by Git but also matches ignore rules`, {
    location: file,
    suggestion: "Either remove the file from Git tracking or narrow the ignore rule that matches it.",
    safeNextStep: `Run git rm --cached -- ${file} if the file should stay ignored, or update .gitignore and rerun node scripts/tracked-ignored-check.mjs.`,
  }));
}

function trackedIgnoredFiles() {
  const output = execFileSync("git", ["ls-files", "-ci", "--exclude-standard", "-z"], {
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "tracked ignored check failed for /Users/example/private:",
    diagnostics: diagnosticsForTrackedIgnoredFiles([
      "/Users/example/private/.tmp/token-sk-test-secret-123456.log",
    ]),
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: tracked_ignored_file/);
  assert.match(output, /location: ~\/private\/\.tmp\/token-\[REDACTED\]/);
  assert.match(output, /suggestion: Either remove the file from Git tracking/);
  assert.match(output, /next: Run git rm --cached/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("tracked ignored check self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const files = trackedIgnoredFiles();
if (files.length > 0) {
  printActionableFailureReport({
    title: "tracked ignored check failed:",
    diagnostics: diagnosticsForTrackedIgnoredFiles(files),
  });
  process.exit(1);
}

console.log("tracked ignored check passed");
