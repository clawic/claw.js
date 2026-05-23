#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(rootDir, "docs/governance/cross-process-json-contracts.json");

const REQUIRED_COVERAGE = [
  "valid",
  "parseableError",
  "incomplete",
  "versioning",
  "extraFields",
  "oversized",
  "truncated",
  "partialErrors",
];

const REQUIRED_BOUNDARY_FAMILIES = ["ui", "bridge", "daemon", "cli", "mcp", "runtime", "fixtures"];
const COVERAGE_STATUSES = new Set(["covered", "not_applicable", "blocked"]);
const CONTRACT_STATUSES = new Set(["covered", "blocked"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function localEvidenceExists(evidencePath) {
  if (evidencePath.startsWith("clawix:")) {
    return evidencePath.slice("clawix:".length).length > 0;
  }
  return fs.existsSync(path.join(rootDir, evidencePath));
}

function addDiagnostic(diagnostics, code, message, options = {}) {
  diagnostics.push(createDiagnostic(code, message, {
    location: options.location ?? "docs/governance/cross-process-json-contracts.json",
    suggestion: options.suggestion ?? "Update the cross-process JSON contract manifest with explicit producer, consumer, risk, and evidence.",
    safeNextStep: options.safeNextStep ?? "Fix the manifest entry, then rerun node scripts/cross-process-json-contracts-check.mjs.",
  }));
}

function validateCoverageEntry({ contract, kind, entry, diagnostics }) {
  const label = `${contract.id}.coverage.${kind}`;
  if (!isRecord(entry)) {
    addDiagnostic(diagnostics, "cross_process_json_coverage_invalid", `${label} must be an object`, {
      location: `${manifestPath}#${label}`,
      suggestion: "Declare a coverage row for every required adversarial JSON case.",
    });
    return;
  }
  if (!COVERAGE_STATUSES.has(entry.status)) {
    addDiagnostic(diagnostics, "cross_process_json_coverage_status_invalid", `${label}.status must be one of ${Array.from(COVERAGE_STATUSES).join(", ")}`, {
      location: `${manifestPath}#${label}.status`,
      suggestion: "Use covered, not_applicable, or blocked so downstream gates can reason about the state.",
    });
    return;
  }

  if (entry.status === "covered") {
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      addDiagnostic(diagnostics, "cross_process_json_coverage_missing_evidence", `${label} is covered but has no evidence`, {
        location: `${manifestPath}#${label}.evidence`,
        suggestion: "Attach the local test, fixture, or sibling evidence path that proves this case.",
      });
      return;
    }
    for (const evidencePath of entry.evidence) {
      if (typeof evidencePath !== "string" || evidencePath.length === 0) {
        addDiagnostic(diagnostics, "cross_process_json_evidence_invalid", `${label}.evidence entries must be non-empty strings`, {
          location: `${manifestPath}#${label}.evidence`,
          suggestion: "Use repo-relative evidence paths or clawix: evidence references.",
        });
      } else if (!localEvidenceExists(evidencePath)) {
        addDiagnostic(diagnostics, "cross_process_json_evidence_missing", `${label}.evidence path does not exist: ${evidencePath}`, {
          location: `${manifestPath}#${label}.evidence`,
          suggestion: "Point evidence to an existing file or use a clawix: reference for sibling app evidence.",
        });
      }
    }
    return;
  }

  if (typeof entry.absenceReason !== "string" || entry.absenceReason.length < 20) {
    addDiagnostic(diagnostics, "cross_process_json_absence_reason_missing", `${label} must include a specific absenceReason`, {
      location: `${manifestPath}#${label}.absenceReason`,
      suggestion: "Explain why this adversarial case is not covered yet, with enough detail for the next agent.",
    });
  }

  if (entry.status === "blocked") {
    for (const field of ["producer", "consumer", "risk"]) {
      if (typeof entry[field] !== "string" || entry[field].length < 5) {
        addDiagnostic(diagnostics, "cross_process_json_blocked_context_missing", `${label} blocked coverage must include ${field}`, {
          location: `${manifestPath}#${label}.${field}`,
          suggestion: "Name the blocked producer, consumer, and risk so the next step is owned.",
        });
      }
    }
  }
}

export function validateCrossProcessJsonContracts(manifest) {
  const diagnostics = [];
  if (!isRecord(manifest)) {
    addDiagnostic(diagnostics, "cross_process_json_manifest_invalid", "manifest must be an object");
    return diagnostics;
  }
  if (manifest.schemaVersion !== 1) {
    addDiagnostic(diagnostics, "cross_process_json_manifest_invalid", "schemaVersion must be 1", {
      location: `${manifestPath}#schemaVersion`,
      suggestion: "Keep the manifest on schema version 1 until a migration updates this guard.",
    });
  }
  if (manifest.contractId !== "claw.governance.cross_process_json_contracts.v1") {
    addDiagnostic(diagnostics, "cross_process_json_manifest_invalid", "contractId must be claw.governance.cross_process_json_contracts.v1", {
      location: `${manifestPath}#contractId`,
      suggestion: "Restore the stable governance contract id.",
    });
  }
  if (!isRecord(manifest.scope)) {
    addDiagnostic(diagnostics, "cross_process_json_scope_invalid", "scope must be an object", {
      location: `${manifestPath}#scope`,
      suggestion: "Declare scope.requiredCoverageKinds and scope.requiredContractIds.",
    });
  }

  const scopeCoverage = manifest.scope?.requiredCoverageKinds ?? [];
  for (const kind of REQUIRED_COVERAGE) {
    if (!scopeCoverage.includes(kind)) {
      addDiagnostic(diagnostics, "cross_process_json_scope_missing_coverage", `scope.requiredCoverageKinds missing ${kind}`, {
        location: `${manifestPath}#scope.requiredCoverageKinds`,
        suggestion: "Keep every adversarial JSON coverage kind in scope until explicitly migrated.",
      });
    }
  }
  const requiredContractIds = manifest.scope?.requiredContractIds ?? [];
  if (!Array.isArray(requiredContractIds) || requiredContractIds.length === 0) {
    addDiagnostic(diagnostics, "cross_process_json_scope_missing_contracts", "scope.requiredContractIds must be a non-empty array", {
      location: `${manifestPath}#scope.requiredContractIds`,
      suggestion: "List every required cross-process contract id that this guard must track.",
    });
  }

  const contracts = manifest.contracts;
  if (!Array.isArray(contracts) || contracts.length === 0) {
    addDiagnostic(diagnostics, "cross_process_json_contracts_missing", "contracts must be a non-empty array", {
      location: `${manifestPath}#contracts`,
      suggestion: "Add at least one tracked cross-process JSON contract.",
    });
    return diagnostics;
  }

  const ids = new Set();
  const coveredBoundaryFamilies = new Set();
  let blockedCoverageCount = 0;

  for (const [index, contract] of contracts.entries()) {
    const label = `contracts[${index}]`;
    if (!isRecord(contract)) {
      addDiagnostic(diagnostics, "cross_process_json_contract_invalid", `${label} must be an object`, {
        location: `${manifestPath}#${label}`,
        suggestion: "Use an object with id, status, producer, consumer, boundaryFamilies, risk, and coverage.",
      });
      continue;
    }
    if (typeof contract.id !== "string" || contract.id.length === 0) {
      addDiagnostic(diagnostics, "cross_process_json_contract_id_missing", `${label}.id is required`, {
        location: `${manifestPath}#${label}.id`,
        suggestion: "Give each contract a stable id used by scope.requiredContractIds.",
      });
    }
    if (ids.has(contract.id)) {
      addDiagnostic(diagnostics, "cross_process_json_contract_id_duplicate", `duplicate contract id ${contract.id}`, {
        location: `${manifestPath}#${label}.id`,
        suggestion: "Keep contract ids unique so failures point to one owner.",
      });
    }
    ids.add(contract.id);
    if (!CONTRACT_STATUSES.has(contract.status)) {
      addDiagnostic(diagnostics, "cross_process_json_contract_status_invalid", `${contract.id}.status must be covered or blocked`, {
        location: `${manifestPath}#${contract.id}.status`,
        suggestion: "Use covered only with evidence; use blocked when the gap is explicit and owned.",
      });
    }
    for (const field of ["producer", "consumer", "risk"]) {
      if (typeof contract[field] !== "string" || contract[field].length < 5) {
        addDiagnostic(diagnostics, "cross_process_json_contract_context_missing", `${contract.id}.${field} must be a specific string`, {
          location: `${manifestPath}#${contract.id}.${field}`,
          suggestion: "Name the process role and risk clearly enough for the next agent to act.",
        });
      }
    }
    if (!Array.isArray(contract.boundaryFamilies) || contract.boundaryFamilies.length === 0) {
      addDiagnostic(diagnostics, "cross_process_json_boundary_families_missing", `${contract.id}.boundaryFamilies must be non-empty`, {
        location: `${manifestPath}#${contract.id}.boundaryFamilies`,
        suggestion: "Classify the contract across ui, bridge, daemon, cli, mcp, runtime, or fixtures.",
      });
    } else {
      for (const family of contract.boundaryFamilies) coveredBoundaryFamilies.add(family);
    }
    if (contract.status === "blocked") {
      if (!isRecord(contract.ambiguity)) {
        addDiagnostic(diagnostics, "cross_process_json_blocked_ambiguity_missing", `${contract.id} is blocked and must include ambiguity`, {
          location: `${manifestPath}#${contract.id}.ambiguity`,
          suggestion: "Record what is ambiguous about producer, consumer, and risk before closing the gap.",
        });
      } else {
        for (const field of ["producer", "consumer", "risk"]) {
          if (typeof contract.ambiguity[field] !== "string" || contract.ambiguity[field].length < 5) {
            addDiagnostic(diagnostics, "cross_process_json_blocked_ambiguity_incomplete", `${contract.id}.ambiguity.${field} is required`, {
              location: `${manifestPath}#${contract.id}.ambiguity.${field}`,
              suggestion: "Make the blocked ambiguity explicit enough for safe follow-up work.",
            });
          }
        }
      }
    }
    if (!isRecord(contract.coverage)) {
      addDiagnostic(diagnostics, "cross_process_json_coverage_invalid", `${contract.id}.coverage must be an object`, {
        location: `${manifestPath}#${contract.id}.coverage`,
        suggestion: "Declare coverage rows for all required adversarial JSON cases.",
      });
      continue;
    }
    for (const kind of REQUIRED_COVERAGE) {
      validateCoverageEntry({ contract, kind, entry: contract.coverage[kind], diagnostics });
      if (contract.coverage[kind]?.status === "blocked") blockedCoverageCount += 1;
    }
  }

  for (const contractId of requiredContractIds) {
    if (!ids.has(contractId)) {
      addDiagnostic(diagnostics, "cross_process_json_required_contract_missing", `scope.requiredContractIds entry is missing from contracts: ${contractId}`, {
        location: `${manifestPath}#scope.requiredContractIds`,
        suggestion: "Add the required contract row or remove it only through a reviewed scope migration.",
      });
    }
  }

  for (const family of REQUIRED_BOUNDARY_FAMILIES) {
    if (!coveredBoundaryFamilies.has(family)) {
      addDiagnostic(diagnostics, "cross_process_json_boundary_family_uncovered", `no contract covers required boundary family ${family}`, {
        location: `${manifestPath}#contracts.boundaryFamilies`,
        suggestion: "Add or classify a contract that covers this cross-process boundary family.",
      });
    }
  }
  if (blockedCoverageCount === 0) {
    addDiagnostic(diagnostics, "cross_process_json_blocked_rows_missing", "manifest must retain explicit blocked rows until every adversarial case is genuinely covered", {
      location: `${manifestPath}#contracts.coverage`,
      suggestion: "Keep blocked rows for unresolved adversarial cases instead of silently treating gaps as complete.",
    });
  }
  return diagnostics;
}

function runSelfTest() {
  const valid = {
    schemaVersion: 1,
    contractId: "claw.governance.cross_process_json_contracts.v1",
    scope: { requiredCoverageKinds: REQUIRED_COVERAGE, requiredContractIds: ["example.contract"] },
    contracts: [
      {
        id: "example.contract",
        status: "blocked",
        producer: "producer process",
        consumer: "consumer process",
        boundaryFamilies: REQUIRED_BOUNDARY_FAMILIES,
        risk: "risk statement",
        ambiguity: { producer: "producer process", consumer: "consumer process", risk: "risk statement" },
        coverage: Object.fromEntries(REQUIRED_COVERAGE.map((kind) => [
          kind,
          kind === "valid"
            ? { status: "covered", evidence: ["package.json"] }
            : {
                status: "blocked",
                absenceReason: "specific absence reason for the example contract",
                producer: "producer process",
                consumer: "consumer process",
                risk: "risk statement",
              },
        ])),
      },
    ],
  };
  assert.deepEqual(validateCrossProcessJsonContracts(valid), []);

  const invalid = structuredClone(valid);
  delete invalid.contracts[0].coverage.truncated;
  const diagnostics = validateCrossProcessJsonContracts(invalid);
  assert.match(diagnostics.map((diagnostic) => diagnostic.message).join("\n"), /coverage\.truncated/);
  const chunks = [];
  printActionableFailureReport({
    title: "Cross-process JSON contracts check failed for /Users/example/private:",
    diagnostics: [
      createDiagnostic("cross_process_json_evidence_missing", "example.contract.coverage.valid evidence missing: token: sk-test-secret-123456", {
        location: "/Users/example/private/docs/governance/cross-process-json-contracts.json#example.contract.coverage.valid",
        suggestion: "Point evidence to an existing bridge/daemon/CLI contract test.",
        safeNextStep: "Fix the evidence path, then rerun node scripts/cross-process-json-contracts-check.mjs.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: cross_process_json_evidence_missing/);
  assert.match(output, /location: ~\/private\/docs\/governance\/cross-process-json-contracts\.json#example\.contract\.coverage\.valid/);
  assert.match(output, /suggestion: Point evidence to an existing bridge\/daemon\/CLI contract test/);
  assert.match(output, /next: Fix the evidence path/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("cross-process JSON contracts self-test passed");
} else {
  const errors = validateCrossProcessJsonContracts(readJson(manifestPath));
  if (errors.length > 0) {
    printActionableFailureReport({
      title: "Cross-process JSON contracts check failed:",
      diagnostics: errors,
    });
    process.exit(1);
  }
  console.log("cross-process JSON contracts check passed");
}
