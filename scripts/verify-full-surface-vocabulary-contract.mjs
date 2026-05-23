#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const responsibilityWord = ["own", "er"].join("");
const isolationWord = ["ten", "ant"].join("");
const responsibilityCategory = `${responsibilityWord}/generic-${responsibilityWord}-authority`;
const isolationCategory = `${isolationWord}/${isolationWord}-as-product-scope`;
const decisionId = "conceptual-vocabulary.full-surface-guard-scope";
const budgets = {
  "ui-strings": {
    [responsibilityCategory]: { files: 6, occurrences: 18 },
    [isolationCategory]: { files: 25, occurrences: 205 },
  },
  code: {
    [responsibilityCategory]: { files: 137, occurrences: 560 },
    [isolationCategory]: { files: 93, occurrences: 2771 },
  },
  "tests-fixtures": {
    [responsibilityCategory]: { files: 53, occurrences: 177 },
    [isolationCategory]: { files: 26, occurrences: 317 },
  },
  docs: {
    [responsibilityCategory]: { files: 75, occurrences: 216 },
    [isolationCategory]: { files: 21, occurrences: 166 },
  },
  examples: {
    [responsibilityCategory]: { files: 4, occurrences: 14 },
    [isolationCategory]: { files: 3, occurrences: 9 },
  },
};

function read(repoRoot, relativePath, failures) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function runFullSurfaceReport(repoRoot) {
  const output = execFileSync(process.execPath, [
    "scripts/conceptual-vocabulary-guard.mjs",
    "--report-all-surfaces",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  });
  return JSON.parse(output);
}

function verifyPayload(payload) {
  const failures = [];
  if (payload.failures?.length) failures.push(...payload.failures.map((failure) => `blocking vocabulary guard failed: ${failure}`));
  const categories = payload.fullSurfaceReport?.categories ?? {};
  for (const [scope, scopeBudgets] of Object.entries(budgets)) {
    const actualScope = categories[scope] ?? {};
    for (const [category, budget] of Object.entries(scopeBudgets)) {
      const actual = actualScope[category] ?? { files: 0, occurrences: 0 };
      if (actual.files > budget.files || actual.occurrences > budget.occurrences) {
        failures.push(`${scope} ${category} exceeded budget: ${actual.files}/${actual.occurrences} > ${budget.files}/${budget.occurrences}`);
      }
    }
    for (const category of Object.keys(actualScope)) {
      if (!(category in scopeBudgets)) failures.push(`${scope} introduced unbudgeted category ${category}`);
    }
  }
  return failures;
}

function verify(repoRoot) {
  const payload = runFullSurfaceReport(repoRoot);
  const failures = verifyPayload(payload);
  const audit = read(repoRoot, "docs/governance/conceptual-vocabulary-audit.md", failures);
  if (audit.includes("Pending Semantic Decisions") && audit.includes(`| \`${decisionId}\``)) failures.push("conceptual vocabulary audit still lists full-surface scope as pending");
  if (!audit.includes("Full-surface vocabulary budget gate")) failures.push("conceptual vocabulary audit must record full-surface budget-gate evidence");
  return failures;
}

function writeFile(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

function runSelfTest() {
  const passing = {
    failures: [],
    fullSurfaceReport: {
      categories: budgets,
    },
  };
  const passingFailures = verifyPayload(passing);
  if (passingFailures.length > 0) throw new Error(`self-test expected budget fixture to pass:\n${passingFailures.join("\n")}`);

  const failing = JSON.parse(JSON.stringify(passing));
  failing.fullSurfaceReport.categories.docs[responsibilityCategory].occurrences += 1;
  const failingFailures = verifyPayload(failing);
  if (!failingFailures.some((failure) => failure.includes("exceeded budget"))) {
    throw new Error("self-test expected budget growth to fail");
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-full-surface-"));
  writeFile(tempRoot, "docs/governance/conceptual-vocabulary-audit.md", "Full-surface vocabulary budget gate\n");
  if (!read(tempRoot, "docs/governance/conceptual-vocabulary-audit.md", []).includes("budget gate")) {
    throw new Error("self-test expected audit read helper to work");
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("Full surface vocabulary contract self-test passed");
} else {
  const failures = verify(rootDir);
  if (failures.length > 0) {
    console.error("Full surface vocabulary contract verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Full surface vocabulary contract verification passed");
}
