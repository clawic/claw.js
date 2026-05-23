#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function requireSnippet(relativePath, snippet) {
  const content = overrides.get(relativePath) ?? read(relativePath);
  if (!content.includes(snippet)) fail(`${relativePath} must include ${JSON.stringify(snippet)}`);
}

function performanceDiagnostic(failure) {
  const missingSnippet = failure.match(/^(.+) must include (.+)$/);
  if (missingSnippet) {
    const location = missingSnippet[1];
    return createDiagnostic("performance_governance_required_text_missing", failure, {
      location,
      suggestion: "Restore the required performance-governance contract text before closing performance-sensitive work.",
      safeNextStep: `Update ${location}, then rerun node scripts/performance-governance-check.mjs.`,
    });
  }
  if (failure.startsWith("self-test")) {
    return createDiagnostic("performance_governance_self_test_failed", failure, {
      location: "scripts/performance-governance-check.mjs",
      suggestion: "Fix the negative fixture so the guard proves it catches missing performance governance.",
      safeNextStep: "Rerun node scripts/performance-governance-check.mjs --self-test after repairing the fixture.",
    });
  }
  return createDiagnostic("performance_governance_check_failed", failure, {
    location: "scripts/performance-governance-check.mjs",
    suggestion: "Inspect the performance governance rule and restore the expected invariant.",
    safeNextStep: "Fix the reported performance governance issue, then rerun node scripts/performance-governance-check.mjs.",
  });
}

function printFailures(options = {}) {
  printActionableFailureReport({
    title: options.title ?? "performance governance check failed:",
    diagnostics: failures.map(performanceDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

const failures = [];
const overrides = new Map();

if (args.has("--simulate-missing-constitution")) {
  overrides.set("CONSTITUTION.md", read("CONSTITUTION.md").replace("computer's resources are product correctness", "computer resources are ordinary implementation detail"));
}

for (const [relativePath, snippets] of new Map([
  ["CONSTITUTION.md", [
    "The computer's resources are product correctness",
    "CPU, RAM, GPU/Neural Engine, disk, network, battery, thermals",
    "boundedness, lazy startup, cancellation, backpressure, windowing, and idle quiescence",
  ]],
  ["docs/adr/0036-performance-governance.md", [
    "Status: Accepted",
    "Performance means whole-computer resource behavior",
    "Windowing/Pagination by Default",
    "hypotheses,",
    "static guard",
    "compile/build",
    "measurement taken",
    "confirmed cause",
    "probable",
    "discarded causes",
    "never as performance validated",
    "Resource Contract is required for implementation closure",
    "docs/boundedness-baseline.json",
    "docs/surface-resource-contract-baseline.json",
    "Idle Quiescence Contract P1",
    "docs/idle-quiescence.manifest.json",
    "## Performance Impact",
    "adr:performance-governance",
  ]],
  ["docs/adr/0043-streaming-backpressure-bounded-queues.md", [
    "Status: Accepted",
    "resourceContract.streaming",
    "bounded queues",
  ]],
  ["docs/adr/0044-launch-and-idle-contract.md", [
    "Status: Accepted",
    "resourceContract.startup",
    "resourceContract.idle",
  ]],
  ["docs/adr/0045-ui-state-invalidation-high-churn-data-boundary.md", [
    "Status: Accepted",
    "High-churn data",
    "resource contracts",
  ]],
  ["docs/governance/performance-governance.md", [
    "whole-computer resource behavior",
    "## Required Impact Classification",
    "## Required Report States",
    "hypotheses, static guard, compile/build, measurement taken, confirmed cause",
    "No measurement, no performance validated",
    "## Windowing/Pagination by Default",
    "load all -> filter/sort/render",
    "cursor/window/batch/limit",
    "## Hot Path Guard P1",
    "hot-path-ok",
    "## Idle Quiescence Contract P1",
    "docs/idle-quiescence.manifest.json",
    "## Resource Dimensions",
    "GPU / Neural Engine",
    "## Performance Debt",
  ]],
  ["docs/adr/TEMPLATE.md", [
    "## Performance Impact",
    "CPU, RAM, GPU/Neural Engine, disk, network, battery, thermals",
  ]],
  ["docs/decision-map.md", [
    "Performance Governance",
    "hypotheses, static guard, compile/build, measurement taken, confirmed cause",
    "never performance validated",
    "streaming, backpressure, and bounded queues",
    "launch and idle contract",
    "UI state invalidation and high-churn data boundary",
    "./adr/0036-performance-governance.md",
    "scripts/performance-governance-check.mjs",
    "scripts/boundedness-guard.mjs",
    "scripts/hot-path-guard.mjs",
    "scripts/surface-resource-contract-guard.mjs",
    "scripts/idle-quiescence-check.mjs",
  ]],
  ["docs/constitution-map.md", [
    "Performance Governance",
    "CPU/RAM/GPU/disk/network/battery",
  ]],
  ["docs/agent-rules/index.md", [
    "Performance governance",
    "performance-governance.md",
    "hypotheses, static guard, compile/build, measurement taken",
    "no measurement means",
  ]],
  ["docs/governance/README.md", [
    "Performance Governance",
  ]],
  ["docs/boundedness-baseline.json", [
    "\"program\": \"boundedness-guard\"",
    "\"entries\"",
  ]],
  ["docs/hot-path-baseline.json", [
    "\"program\": \"hot-path-guard\"",
    "\"entries\"",
  ]],
  ["docs/idle-quiescence.manifest.json", [
    "\"program\": \"idle-quiescence-check\"",
    "\"severity\": \"P1\"",
    "\"visibleOnly\"",
  ]],
  ["scripts/hot-path-guard.mjs", [
    "Hot Path Guard P1",
    "hot-path-ok",
  ]],
  ["scripts/idle-quiescence-check.mjs", [
    "Idle Quiescence Contract P1",
    "diagnosticsOptIn",
  ]],
  ["scripts/boundedness-guard.mjs", [
    "Boundedness Guard P0",
    "buffer-concat",
    "eventbus",
  ]],
  ["skills/performance-investigation/SKILL.md", [
    "CPU, RAM, GPU/Neural Engine",
    "disk, network, battery, thermals",
    "## Required final report",
    "Hypotheses",
    "Static guard",
    "Compile/build",
    "Measurement taken",
    "Confirmed cause",
    "Probable cause",
    "Discarded causes",
    "No measurement, no performance validated",
  ]],
])) {
  for (const snippet of snippets) requireSnippet(relativePath, snippet);
}

if (args.has("--self-test")) {
  const result = await import("node:child_process").then(({ spawnSync }) => spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--simulate-missing-constitution"], {
    cwd: rootDir,
    encoding: "utf8",
  }));
  if (result.status === 0 || !String(result.stderr).includes("code: performance_governance_required_text_missing")) {
    fail("self-test failed to catch missing constitutional performance governance");
  }
  const chunks = [];
  failures.push(
    "/Users/example/private/CONSTITUTION.md must include \"CPU, RAM, GPU/Neural Engine\"",
    "self-test fixture token: sk-test-secret-123456",
  );
  printFailures({ stream: { write: (chunk) => chunks.push(chunk) } });
  failures.splice(-2);
  const output = chunks.join("");
  if (!output.includes("code: performance_governance_required_text_missing")) throw new Error("self-test missing stable code");
  if (!output.includes("code: performance_governance_self_test_failed")) throw new Error("self-test missing self-test code");
  if (!output.includes("suggestion: Restore the required performance-governance contract text")) throw new Error("self-test missing suggestion");
  if (!output.includes("next: Update ~/private/CONSTITUTION.md")) throw new Error("self-test missing next step");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

if (failures.length > 0) {
  printFailures();
  process.exit(1);
}

console.log("performance governance check passed");
