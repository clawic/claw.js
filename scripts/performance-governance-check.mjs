#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

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
  ]],
])) {
  for (const snippet of snippets) requireSnippet(relativePath, snippet);
}

if (args.has("--self-test")) {
  const result = await import("node:child_process").then(({ spawnSync }) => spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--simulate-missing-constitution"], {
    cwd: rootDir,
    encoding: "utf8",
  }));
  if (result.status === 0 || !String(result.stderr).includes("CONSTITUTION.md")) {
    fail("self-test failed to catch missing constitutional performance governance");
  }
}

if (failures.length > 0) {
  console.error("performance governance check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("performance governance check passed");
