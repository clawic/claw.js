#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "docs/adr/0002-testing-architecture.md",
  "docs/testing.md",
  "docs/testing-matrix.md",
  "qa/quarantine.json",
  "qa/scenarios/testing-release-gate.md",
  "scripts/test-lane.mjs",
  "vitest.config.ts",
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

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("testing policy passed");
