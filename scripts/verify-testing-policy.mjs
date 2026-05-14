#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "docs/adr/0002-testing-architecture.md",
  "docs/adr/0006-integration-qa-lab.md",
  "docs/adr/0009-dual-human-programmatic-surfaces.md",
  "docs/adr/TEMPLATE.md",
  "docs/integration-qa-lab.md",
  "docs/integration-qa-reference-research.md",
  "docs/testing.md",
  "docs/testing-matrix.md",
  "qa/coverage-budgets.json",
  "qa/quarantine.json",
  "qa/scenarios/external-pending.md",
  "qa/scenarios/telegram-integration-qa-lab.md",
  "qa/scenarios/testing-release-gate.md",
  "scripts/verify-integration-package-live-harness.mjs",
  "scripts/verify-integration-qa-scenarios.mjs",
  "scripts/test-lane.mjs",
  "vitest.config.ts",
];

const requiredLaneRoots = [
  "tests/fast",
  "tests/integration",
  "tests/e2e",
  "tests/host",
  "tests/device",
  "tests/fixtures",
  "tests/live",
];

function fail(message) {
  console.error(`testing policy failed: ${message}`);
  process.exitCode = 1;
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing ${file}`);
  }
}

for (const directory of requiredLaneRoots) {
  if (!fs.existsSync(path.join(root, directory))) {
    fail(`missing ${directory}`);
  }
}

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
for (const ignored of ["test-results/", "artifacts/", "coverage/", ".tmp/"]) {
  if (!gitignore.includes(ignored)) {
    fail(`.gitignore must include ${ignored}`);
  }
}

const quarantinePath = path.join(root, "qa/quarantine.json");
let quarantine;
try {
  quarantine = JSON.parse(fs.readFileSync(quarantinePath, "utf8"));
} catch (error) {
  fail(`qa/quarantine.json is invalid JSON: ${error.message}`);
  quarantine = { entries: [] };
}

if (!Array.isArray(quarantine.entries)) {
  fail("qa/quarantine.json must contain an entries array");
} else {
  const today = new Date().toISOString().slice(0, 10);
  for (const entry of quarantine.entries) {
    for (const field of ["id", "owner", "reason", "repair", "expires"]) {
      if (!entry[field]) {
        fail(`quarantine entry is missing ${field}`);
      }
    }
    if (entry.expires && entry.expires < today) {
      fail(`quarantine entry ${entry.id ?? "<unknown>"} expired on ${entry.expires}`);
    }
  }
}

const budgetPath = path.join(root, "qa/coverage-budgets.json");
let coverageBudgets;
try {
  coverageBudgets = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
} catch (error) {
  fail(`qa/coverage-budgets.json is invalid JSON: ${error.message}`);
  coverageBudgets = { budgets: [] };
}

if (!Array.isArray(coverageBudgets.budgets)) {
  fail("qa/coverage-budgets.json must contain a budgets array");
} else {
  const requiredBoundaries = [
    "contracts-and-schemas",
    "storage-and-migrations",
    "cli-and-public-api",
    "daemon-and-bridge",
    "browser-ui",
    "host-and-permissions",
    "device-clients",
    "live-integrations",
    "connector-official-api-coverage",
    "integration-qa-scenarios",
    "package-live-connector-harness",
  ];
  const seen = new Set();
  for (const budget of coverageBudgets.budgets) {
    for (const field of ["boundary", "lane", "metric", "minimum"]) {
      if (budget[field] === undefined || budget[field] === "") {
        fail(`coverage budget is missing ${field}`);
      }
    }
    if (typeof budget.minimum !== "number" || budget.minimum < 0) {
      fail(`coverage budget ${budget.boundary ?? "<unknown>"} has invalid minimum`);
    }
    seen.add(budget.boundary);
  }
  for (const boundary of requiredBoundaries) {
    if (!seen.has(boundary)) {
      fail(`coverage budget is missing boundary ${boundary}`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("testing policy passed");
