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
  "qa/agent-coordination.manifest.json",
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

const coordinationCostClasses = new Set(["light", "heavy", "saturating", "interactive"]);
const coordinationResourceModes = new Set(["read", "write", "exclusive"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

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

  const coordinationManifestPath = path.join(targetRoot, "qa/agent-coordination.manifest.json");
  let coordinationManifest;
  try {
    coordinationManifest = JSON.parse(fs.readFileSync(coordinationManifestPath, "utf8"));
  } catch (error) {
    fail("testing_policy_coordination_manifest_invalid_json", `qa/agent-coordination.manifest.json is invalid JSON: ${error.message}`, {
      location: "qa/agent-coordination.manifest.json",
      suggestion: "Repair the coordination manifest JSON before editing test lanes.",
    });
    coordinationManifest = { checks: [] };
  }

  if (!Array.isArray(coordinationManifest.checks)) {
    fail("testing_policy_coordination_manifest_invalid_shape", "qa/agent-coordination.manifest.json must contain a checks array", {
      location: "qa/agent-coordination.manifest.json",
      suggestion: "Use the coordination manifest schema with a top-level checks array.",
    });
  } else {
    const seenCheckIds = new Set();
    for (const check of coordinationManifest.checks) {
      const checkId = check.id ?? "<unknown>";
      for (const field of ["id", "lane", "command", "failureAction", "repairPolicy", "externalPendingPolicy", "cleanup"]) {
        if (!isNonEmptyString(check[field])) {
          fail("testing_policy_coordination_manifest_check_incomplete", `coordination check ${checkId} is missing ${field}`, {
            location: "qa/agent-coordination.manifest.json",
            suggestion: "Complete every coordination check with stewardship, command, cleanup, and failure guidance.",
          });
        }
      }
      if (seenCheckIds.has(check.id)) {
        fail("testing_policy_coordination_manifest_duplicate_check", `coordination check ${checkId} is duplicated`, {
          location: "qa/agent-coordination.manifest.json",
          suggestion: "Give every coordination check a stable unique id.",
        });
      }
      seenCheckIds.add(check.id);

      for (const field of ["timeoutSeconds", "heartbeatSeconds", "ttlSeconds"]) {
        if (!isPositiveNumber(check[field])) {
          fail("testing_policy_coordination_manifest_invalid_number", `coordination check ${checkId} has invalid ${field}`, {
            location: "qa/agent-coordination.manifest.json",
            suggestion: "Use positive numeric timeout, heartbeat, and ttl values.",
          });
        }
      }
      if (isPositiveNumber(check.ttlSeconds) && isPositiveNumber(check.heartbeatSeconds) && check.ttlSeconds < check.heartbeatSeconds) {
        fail("testing_policy_coordination_manifest_invalid_ttl", `coordination check ${checkId} has ttlSeconds shorter than heartbeatSeconds`, {
          location: "qa/agent-coordination.manifest.json",
          suggestion: "Set ttlSeconds to cover at least one heartbeat interval.",
        });
      }
      if (!coordinationCostClasses.has(check.costClass)) {
        fail("testing_policy_coordination_manifest_invalid_cost_class", `coordination check ${checkId} has invalid costClass`, {
          location: "qa/agent-coordination.manifest.json",
          suggestion: "Use costClass light, heavy, saturating, or interactive.",
        });
      }
      if (typeof check.realServices !== "boolean") {
        fail("testing_policy_coordination_manifest_invalid_real_services", `coordination check ${checkId} must declare realServices as a boolean`, {
          location: "qa/agent-coordination.manifest.json",
          suggestion: "Set realServices to true only for lanes that contact real services.",
        });
      }

      for (const field of ["pathPatterns", "fingerprintInputs", "consumes", "produces", "mutates", "exclusiveResources", "canRunWith", "cannotRunWith"]) {
        if (!isStringArray(check[field])) {
          fail("testing_policy_coordination_manifest_invalid_array", `coordination check ${checkId} has invalid ${field}`, {
            location: "qa/agent-coordination.manifest.json",
            suggestion: "Declare every coordination relationship field as an array of non-empty strings.",
          });
        }
      }
      for (const field of ["environmentInputs", "resourceStateInputs"]) {
        if (check[field] !== undefined && !isStringArray(check[field])) {
          fail("testing_policy_coordination_manifest_invalid_array", `coordination check ${checkId} has invalid ${field}`, {
            location: "qa/agent-coordination.manifest.json",
            suggestion: "Optional fingerprint dependency fields must be arrays of non-empty strings.",
          });
        }
      }
      const obligations = Array.isArray(check.ownerObligations) ? check.ownerObligations : check.stewardObligations;
      if (!isStringArray(obligations)) {
        fail("testing_policy_coordination_manifest_invalid_array", `coordination check ${checkId} has invalid ownerObligations`, {
          location: "qa/agent-coordination.manifest.json",
          suggestion: "Declare every coordination relationship field as an array of non-empty strings.",
        });
      }

      const resourceIds = new Set();
      const exclusiveResourceIds = new Set();
      if (!Array.isArray(check.resources) || check.resources.length === 0) {
        fail("testing_policy_coordination_manifest_missing_resources", `coordination check ${checkId} must declare resources`, {
          location: "qa/agent-coordination.manifest.json",
          suggestion: "Declare every resource the check reads, writes, or requires exclusively.",
        });
      } else {
        for (const resource of check.resources) {
          if (!isNonEmptyString(resource?.id) || !coordinationResourceModes.has(resource?.mode)) {
            fail("testing_policy_coordination_manifest_invalid_resource", `coordination check ${checkId} has an invalid resource declaration`, {
              location: "qa/agent-coordination.manifest.json",
              suggestion: "Use resource declarations with id and mode read, write, or exclusive.",
            });
            continue;
          }
          if (resourceIds.has(resource.id)) {
            fail("testing_policy_coordination_manifest_duplicate_resource", `coordination check ${checkId} declares duplicate resource ${resource.id}`, {
              location: "qa/agent-coordination.manifest.json",
              suggestion: "Declare each resource once per check.",
            });
          }
          resourceIds.add(resource.id);
          if (resource.mode === "exclusive") {
            exclusiveResourceIds.add(resource.id);
          }
        }
      }

      if (isStringArray(check.consumes)) {
        for (const consumed of check.consumes) {
          if (!resourceIds.has(consumed)) {
            fail("testing_policy_coordination_manifest_unmapped_consumption", `coordination check ${checkId} consumes undeclared resource ${consumed}`, {
              location: "qa/agent-coordination.manifest.json",
              suggestion: "Every consumed resource must also appear in resources with the required mode.",
            });
          }
        }
      }
      if (isStringArray(check.exclusiveResources)) {
        for (const exclusiveResource of check.exclusiveResources) {
          if (!exclusiveResourceIds.has(exclusiveResource)) {
            fail("testing_policy_coordination_manifest_unmapped_exclusive", `coordination check ${checkId} lists ${exclusiveResource} as exclusive without an exclusive resource declaration`, {
              location: "qa/agent-coordination.manifest.json",
              suggestion: "Exclusive resources must appear in resources with mode exclusive.",
            });
          }
        }
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
  fs.writeFileSync(path.join(targetRoot, "qa/agent-coordination.manifest.json"), JSON.stringify({
    checks: [{
      id: "changed",
      lane: "changed",
      command: "npm test",
      timeoutSeconds: 5,
      heartbeatSeconds: 10,
      ttlSeconds: 1,
      costClass: "expensive",
      realServices: "no",
      pathPatterns: ["**/*"],
      fingerprintInputs: ["package.json"],
      resources: [{ id: "repo:fixture:worktree", mode: "read" }],
      failureAction: "repair",
      repairPolicy: "claim repair",
      externalPendingPolicy: "report",
      consumes: ["repo:fixture:worktree", "missing:resource"],
      produces: ["test-result:fixture:changed"],
      mutates: [],
      exclusiveResources: ["repo:fixture:worktree"],
      canRunWith: [],
      cannotRunWith: [],
      cleanup: "release leases",
      ownerObligations: ["release leases"],
    }],
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
  assert.match(output, /code: testing_policy_coordination_manifest_invalid_ttl/);
  assert.match(output, /code: testing_policy_coordination_manifest_invalid_cost_class/);
  assert.match(output, /code: testing_policy_coordination_manifest_unmapped_consumption/);
  assert.match(output, /code: testing_policy_coordination_manifest_unmapped_exclusive/);
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
