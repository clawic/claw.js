#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const outputs = ["guard/test añadido", "ADR/regla añadida", "deuda explícita con expiry"];
const antiLoop = [
  "2 ciclos seguidos",
  "sin reducir blockers reales",
  "blocker directo",
  "deuda lateral",
  "pendiente externo",
];
const required = new Map([
  ["docs/adr/0046-problem-to-guardrail-loop.md", [
    "Problem-to-Guardrail loop",
    ...outputs,
    ...antiLoop,
    "punctual problem",
    "general class",
    "existing rule",
  ]],
  ["docs/decision-map.md", [
    "Problem-to-Guardrail loop",
    ...outputs,
    ...antiLoop,
    "scripts/problem-to-guardrail-check.mjs",
  ]],
  ["docs/agent-rules/index.md", [
    "Problem-to-Guardrail loop",
    ...outputs,
    ...antiLoop,
  ]],
  ["docs/adr/TEMPLATE.md", [...outputs, ...antiLoop]],
  ["skills/adr-to-guardrail/SKILL.md", [...outputs, ...antiLoop]],
  ["skills/code-review-risk/SKILL.md", [...outputs, ...antiLoop]],
  ["docs/adr-operational-coverage.manifest.json", [
    "docs/adr/0046-problem-to-guardrail-loop.md",
    "scripts/problem-to-guardrail-check.mjs",
  ]],
  ["package.json", ["problem-to-guardrail-check.mjs"]],
]);

function read(relativePath, overrides = new Map()) {
  return overrides.get(relativePath) ?? fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function validate(overrides = new Map()) {
  const failures = [];
  for (const [relativePath, snippets] of required) {
    const filePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(filePath)) {
      failures.push(`missing ${relativePath}`);
      continue;
    }
    const text = read(relativePath, overrides);
    for (const snippet of snippets.flat()) {
      if (!text.includes(snippet)) failures.push(`${relativePath} must include ${JSON.stringify(snippet)}`);
    }
  }
  return failures;
}

function failureDiagnostic(failure) {
  const missingFile = failure.match(/^missing (.+)$/);
  if (missingFile) {
    return createDiagnostic("problem_guardrail_required_file_missing", failure, {
      location: missingFile[1],
      suggestion: "Restore the required ADR, rule, skill, or package hook that documents the guardrail loop.",
      safeNextStep: `Add or restore ${missingFile[1]}, then rerun node scripts/problem-to-guardrail-check.mjs.`,
    });
  }
  const missingSnippet = failure.match(/^(.+) must include (.+)$/);
  if (missingSnippet) {
    return createDiagnostic("problem_guardrail_required_text_missing", failure, {
      location: missingSnippet[1],
      suggestion: "Put the missing loop requirement back in the documented public contract.",
      safeNextStep: `Update ${missingSnippet[1]}, then rerun node scripts/problem-to-guardrail-check.mjs.`,
    });
  }
  return createDiagnostic("problem_guardrail_check_failed", failure, {
    location: "scripts/problem-to-guardrail-check.mjs",
    suggestion: "Inspect the listed guardrail contract and restore the expected invariant.",
    safeNextStep: "Fix the reported problem-to-guardrail contract, then rerun node scripts/problem-to-guardrail-check.mjs.",
  });
}

function printFailures(failures, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "problem-to-guardrail check failed:",
    diagnostics: failures.map(failureDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  assert.deepEqual(validate(), []);
  const broken = new Map([[
    "docs/agent-rules/index.md",
    read("docs/agent-rules/index.md").replaceAll("2 ciclos seguidos", "more governance"),
  ]]);
  assert.match(validate(broken).join("\n"), /2 ciclos seguidos/);

  const chunks = [];
  printFailures([
    "missing /Users/example/private/docs/adr/missing.md",
    "docs/agent-rules/index.md must include \"2 ciclos seguidos\"",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  assert.match(output, /code: problem_guardrail_required_file_missing/);
  assert.match(output, /code: problem_guardrail_required_text_missing/);
  assert.match(output, /location: docs\/agent-rules\/index\.md/);
  assert.match(output, /suggestion: Put the missing loop requirement back/);
  assert.match(output, /next: Update docs\/agent-rules\/index\.md/);
  assert.doesNotMatch(output, /\/Users\/example/);
}

if (process.argv.includes("--self-test")) {
  const result = spawnSync(process.execPath, [new URL(import.meta.url).pathname], {
    cwd: rootDir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  runSelfTest();
  console.log("problem-to-guardrail check self-test passed");
  process.exit(0);
}

const failures = validate();
if (failures.length > 0) {
  printFailures(failures);
  process.exit(1);
}

console.log("problem-to-guardrail check passed");
