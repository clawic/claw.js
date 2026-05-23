import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(rootDir, "packages", "clawjs", "src");
const debtPath = path.join(rootDir, "qa", "cli-json-envelope-debt.json");
const debt = JSON.parse(fs.readFileSync(debtPath, "utf8"));

function listFiles(targetPath) {
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith(".ts")) return [fullPath];
    return [];
  });
}

function countRawJsonWriters(filePath) {
  if (filePath.endsWith(`${path.sep}cli-json.ts`)) return 0;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    if (/\b(?:function|export function)\s+writeJson\b/.test(line)) continue;
    count += line.match(/\bwriteJson\s*\(/g)?.length ?? 0;
  }
  return count;
}

function collectRawJsonWriterDebt(targetRoot = sourceRoot) {
  const actual = {};
  for (const file of listFiles(targetRoot)) {
    const count = countRawJsonWriters(file);
    if (count === 0) continue;
    actual[path.relative(rootDir, file)] = count;
  }
  return actual;
}

function validateCliJsonEnvelopeDebt(actual, baseline, debtFile = path.relative(rootDir, debtPath)) {
  const diagnostics = [];
  for (const [file, count] of Object.entries(actual)) {
    const allowed = baseline[file];
    if (allowed === undefined) {
      diagnostics.push(createDiagnostic("cli_json_raw_writer_untracked", `${file}: new raw writeJson debt (${count})`, {
        location: file,
        suggestion: "Route CLI JSON output through writeCommandJsonOk/writeCommandJsonError so errors keep the stable envelope.",
        safeNextStep: `Migrate the raw writer or add a reviewed decreasing baseline entry in ${debtFile}.`,
      }));
    } else if (count > allowed) {
      diagnostics.push(createDiagnostic("cli_json_raw_writer_growth", `${file}: raw writeJson debt increased from ${allowed} to ${count}`, {
        location: file,
        suggestion: "Do not add new raw JSON writers; use the common CLI JSON helpers instead.",
        safeNextStep: "Replace the new writer with writeCommandJsonOk/writeCommandJsonError, then rerun this check.",
      }));
    }
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = actual[file] ?? 0;
    if (count < allowed) {
      diagnostics.push(createDiagnostic("cli_json_baseline_stale", `${file}: raw writeJson debt decreased from ${allowed} to ${count}`, {
        location: debtFile,
        suggestion: "Lower the baseline when raw writer debt is removed.",
        safeNextStep: `Update ${debtFile}, then rerun node scripts/verify-cli-json-envelope-debt.mjs.`,
      }));
    }
  }
  return diagnostics;
}

function runSelfTest() {
  const diagnostics = validateCliJsonEnvelopeDebt(
    { "packages/clawjs/src/new-command.ts": 1, "packages/clawjs/src/reduced.ts": 0 },
    { "packages/clawjs/src/reduced.ts": 2 },
    "qa/cli-json-envelope-debt.json",
  );
  assert.equal(diagnostics.length, 2);
  const chunks = [];
  printActionableFailureReport({
    title: "CLI JSON envelope debt check failed for /Users/example/private",
    diagnostics,
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: cli_json_raw_writer_untracked/);
  assert.match(output, /location: packages\/clawjs\/src\/new-command\.ts/);
  assert.match(output, /suggestion: Route CLI JSON output through writeCommandJsonOk\/writeCommandJsonError/);
  assert.match(output, /next: Migrate the raw writer/);
  assert.match(output, /code: cli_json_baseline_stale/);
  assert.doesNotMatch(output, /\/Users\/example/);
  console.log("cli json envelope debt self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const actual = collectRawJsonWriterDebt();
const diagnostics = validateCliJsonEnvelopeDebt(actual, debt.files ?? {});
if (diagnostics.length > 0) {
  printActionableFailureReport({
    title: "CLI JSON envelope debt check failed:",
    diagnostics,
  });
  process.exit(1);
}

const total = Object.values(actual).reduce((sum, count) => sum + count, 0);
console.log(`cli json envelope debt check passed (${total} raw writers tracked)`);
