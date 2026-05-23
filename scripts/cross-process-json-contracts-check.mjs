#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function validateCoverageEntry({ contract, kind, entry, errors }) {
  const label = `${contract.id}.coverage.${kind}`;
  if (!isRecord(entry)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!COVERAGE_STATUSES.has(entry.status)) {
    errors.push(`${label}.status must be one of ${Array.from(COVERAGE_STATUSES).join(", ")}`);
    return;
  }

  if (entry.status === "covered") {
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      errors.push(`${label} is covered but has no evidence`);
      return;
    }
    for (const evidencePath of entry.evidence) {
      if (typeof evidencePath !== "string" || evidencePath.length === 0) {
        errors.push(`${label}.evidence entries must be non-empty strings`);
      } else if (!localEvidenceExists(evidencePath)) {
        errors.push(`${label}.evidence path does not exist: ${evidencePath}`);
      }
    }
    return;
  }

  if (typeof entry.absenceReason !== "string" || entry.absenceReason.length < 20) {
    errors.push(`${label} must include a specific absenceReason`);
  }

  if (entry.status === "blocked") {
    for (const field of ["producer", "consumer", "risk"]) {
      if (typeof entry[field] !== "string" || entry[field].length < 5) {
        errors.push(`${label} blocked coverage must include ${field}`);
      }
    }
  }
}

export function validateCrossProcessJsonContracts(manifest) {
  const errors = [];
  if (!isRecord(manifest)) return ["manifest must be an object"];
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (manifest.contractId !== "claw.governance.cross_process_json_contracts.v1") {
    errors.push("contractId must be claw.governance.cross_process_json_contracts.v1");
  }
  if (!isRecord(manifest.scope)) errors.push("scope must be an object");

  const scopeCoverage = manifest.scope?.requiredCoverageKinds ?? [];
  for (const kind of REQUIRED_COVERAGE) {
    if (!scopeCoverage.includes(kind)) errors.push(`scope.requiredCoverageKinds missing ${kind}`);
  }
  const requiredContractIds = manifest.scope?.requiredContractIds ?? [];
  if (!Array.isArray(requiredContractIds) || requiredContractIds.length === 0) {
    errors.push("scope.requiredContractIds must be a non-empty array");
  }

  const contracts = manifest.contracts;
  if (!Array.isArray(contracts) || contracts.length === 0) {
    errors.push("contracts must be a non-empty array");
    return errors;
  }

  const ids = new Set();
  const coveredBoundaryFamilies = new Set();
  let blockedCoverageCount = 0;

  for (const [index, contract] of contracts.entries()) {
    const label = `contracts[${index}]`;
    if (!isRecord(contract)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof contract.id !== "string" || contract.id.length === 0) errors.push(`${label}.id is required`);
    if (ids.has(contract.id)) errors.push(`duplicate contract id ${contract.id}`);
    ids.add(contract.id);
    if (!CONTRACT_STATUSES.has(contract.status)) errors.push(`${contract.id}.status must be covered or blocked`);
    for (const field of ["producer", "consumer", "risk"]) {
      if (typeof contract[field] !== "string" || contract[field].length < 5) {
        errors.push(`${contract.id}.${field} must be a specific string`);
      }
    }
    if (!Array.isArray(contract.boundaryFamilies) || contract.boundaryFamilies.length === 0) {
      errors.push(`${contract.id}.boundaryFamilies must be non-empty`);
    } else {
      for (const family of contract.boundaryFamilies) coveredBoundaryFamilies.add(family);
    }
    if (contract.status === "blocked") {
      if (!isRecord(contract.ambiguity)) {
        errors.push(`${contract.id} is blocked and must include ambiguity`);
      } else {
        for (const field of ["producer", "consumer", "risk"]) {
          if (typeof contract.ambiguity[field] !== "string" || contract.ambiguity[field].length < 5) {
            errors.push(`${contract.id}.ambiguity.${field} is required`);
          }
        }
      }
    }
    if (!isRecord(contract.coverage)) {
      errors.push(`${contract.id}.coverage must be an object`);
      continue;
    }
    for (const kind of REQUIRED_COVERAGE) {
      validateCoverageEntry({ contract, kind, entry: contract.coverage[kind], errors });
      if (contract.coverage[kind]?.status === "blocked") blockedCoverageCount += 1;
    }
  }

  for (const contractId of requiredContractIds) {
    if (!ids.has(contractId)) errors.push(`scope.requiredContractIds entry is missing from contracts: ${contractId}`);
  }

  for (const family of REQUIRED_BOUNDARY_FAMILIES) {
    if (!coveredBoundaryFamilies.has(family)) errors.push(`no contract covers required boundary family ${family}`);
  }
  if (blockedCoverageCount === 0) {
    errors.push("manifest must retain explicit blocked rows until every adversarial case is genuinely covered");
  }
  return errors;
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
  assert.match(validateCrossProcessJsonContracts(invalid).join("\n"), /coverage\.truncated/);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  console.log("cross-process JSON contracts self-test passed");
} else {
  const errors = validateCrossProcessJsonContracts(readJson(manifestPath));
  if (errors.length > 0) {
    console.error("Cross-process JSON contracts check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("cross-process JSON contracts check passed");
}
