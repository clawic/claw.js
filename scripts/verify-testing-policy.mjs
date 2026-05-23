#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

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

function verifyTestingPolicy(targetRoot = root, today = new Date().toISOString().slice(0, 10)) {
  const diagnostics = [];

  function fail(code, message, options = {}) {
    diagnostics.push(createDiagnostic(code, message, {
      location: options.location ?? "testing-policy",
      suggestion: options.suggestion ?? "Restore the missing testing-policy artifact or update the policy intentionally.",
      safeNextStep: options.safeNextStep ?? "Fix the reported file, then rerun node scripts/verify-testing-policy.mjs.",
    }));
  }

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(targetRoot, file))) {
      fail("testing_policy_missing_file", `missing ${file}`, {
        location: file,
      });
    }
  }

  for (const directory of requiredLaneRoots) {
    if (!fs.existsSync(path.join(targetRoot, directory))) {
      fail("testing_policy_missing_lane_root", `missing ${directory}`, {
        location: directory,
      });
    }
  }

  const gitignorePath = path.join(targetRoot, ".gitignore");
  let gitignore = "";
  try {
    gitignore = fs.readFileSync(gitignorePath, "utf8");
  } catch (error) {
    fail("testing_policy_missing_gitignore", `.gitignore is unreadable: ${error.message}`, {
      location: ".gitignore",
      suggestion: "Restore .gitignore with test output exclusions.",
    });
  }
  for (const ignored of ["test-results/", "artifacts/", "coverage/", ".tmp/"]) {
    if (!gitignore.includes(ignored)) {
      fail("testing_policy_missing_ignore_rule", `.gitignore must include ${ignored}`, {
        location: ".gitignore",
        suggestion: "Add the missing generated-output ignore rule.",
      });
    }
  }

  const quarantinePath = path.join(targetRoot, "qa/quarantine.json");
  let quarantine;
  try {
    quarantine = JSON.parse(fs.readFileSync(quarantinePath, "utf8"));
  } catch (error) {
    fail("testing_policy_quarantine_invalid_json", `qa/quarantine.json is invalid JSON: ${error.message}`, {
      location: "qa/quarantine.json",
      suggestion: "Repair the JSON syntax before editing quarantine entries.",
    });
    quarantine = { entries: [] };
  }

  if (!Array.isArray(quarantine.entries)) {
    fail("testing_policy_quarantine_invalid_shape", "qa/quarantine.json must contain an entries array", {
      location: "qa/quarantine.json",
      suggestion: "Use the quarantine schema with a top-level entries array.",
    });
  } else {
    for (const entry of quarantine.entries) {
      for (const field of ["id", "owner", "reason", "repair", "expires"]) {
        if (!entry[field]) {
          fail("testing_policy_quarantine_entry_incomplete", `quarantine entry is missing ${field}`, {
            location: "qa/quarantine.json",
            suggestion: "Complete every quarantine row with id, owner, reason, repair, and expires.",
          });
        }
      }
      if (entry.expires && entry.expires < today) {
        fail("testing_policy_quarantine_entry_expired", `quarantine entry ${entry.id ?? "<unknown>"} expired on ${entry.expires}`, {
          location: "qa/quarantine.json",
          suggestion: "Repair the quarantined test or renew the quarantine with explicit review.",
        });
      }
    }
  }

  const budgetPath = path.join(targetRoot, "qa/coverage-budgets.json");
  let coverageBudgets;
  try {
    coverageBudgets = JSON.parse(fs.readFileSync(budgetPath, "utf8"));
  } catch (error) {
    fail("testing_policy_coverage_budget_invalid_json", `qa/coverage-budgets.json is invalid JSON: ${error.message}`, {
      location: "qa/coverage-budgets.json",
      suggestion: "Repair the JSON syntax before editing coverage budgets.",
    });
    coverageBudgets = { budgets: [] };
  }

  if (!Array.isArray(coverageBudgets.budgets)) {
    fail("testing_policy_coverage_budget_invalid_shape", "qa/coverage-budgets.json must contain a budgets array", {
      location: "qa/coverage-budgets.json",
      suggestion: "Use the coverage budget schema with a top-level budgets array.",
    });
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
          fail("testing_policy_coverage_budget_incomplete", `coverage budget is missing ${field}`, {
            location: "qa/coverage-budgets.json",
            suggestion: "Complete every budget row with boundary, lane, metric, and minimum.",
          });
        }
      }
      if (typeof budget.minimum !== "number" || budget.minimum < 0) {
        fail("testing_policy_coverage_budget_invalid_minimum", `coverage budget ${budget.boundary ?? "<unknown>"} has invalid minimum`, {
          location: "qa/coverage-budgets.json",
          suggestion: "Set minimum to a non-negative number.",
        });
      }
      seen.add(budget.boundary);
    }
    for (const boundary of requiredBoundaries) {
      if (!seen.has(boundary)) {
        fail("testing_policy_coverage_budget_missing_boundary", `coverage budget is missing boundary ${boundary}`, {
          location: "qa/coverage-budgets.json",
          suggestion: "Add a coverage budget row for every required testing boundary.",
        });
      }
    }
  }

  return diagnostics;
}

function runSelfTest() {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-testing-policy-"));
  fs.mkdirSync(path.join(targetRoot, "qa"), { recursive: true });
  fs.writeFileSync(path.join(targetRoot, ".gitignore"), "coverage/\n");
  fs.writeFileSync(path.join(targetRoot, "qa/quarantine.json"), JSON.stringify({
    entries: [{ id: "expired", owner: "qa", reason: "fixture", repair: "fix fixture", expires: "2020-01-01" }],
  }));
  fs.writeFileSync(path.join(targetRoot, "qa/coverage-budgets.json"), JSON.stringify({
    budgets: [{ boundary: "cli-and-public-api", lane: "fast", metric: "tests", minimum: -1 }],
  }));
  const diagnostics = verifyTestingPolicy(targetRoot, "2026-05-23");
  const chunks = [];
  printActionableFailureReport({
    title: "testing policy failed for /Users/example/private",
    diagnostics,
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: testing_policy_missing_file/);
  assert.match(output, /code: testing_policy_missing_ignore_rule/);
  assert.match(output, /code: testing_policy_quarantine_entry_expired/);
  assert.match(output, /code: testing_policy_coverage_budget_invalid_minimum/);
  assert.match(output, /location: qa\/coverage-budgets\.json/);
  assert.match(output, /next: Fix the reported file/);
  assert.doesNotMatch(output, /\/Users\/example/);
  fs.rmSync(targetRoot, { recursive: true, force: true });
  console.log("testing policy self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const diagnostics = verifyTestingPolicy();
if (diagnostics.length > 0) {
  printActionableFailureReport({
    title: "testing policy failed:",
    diagnostics,
  });
  process.exit(1);
}
console.log("testing policy passed");
