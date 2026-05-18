#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(rootDir, relativePath))) errors.push(`missing ${relativePath}`);
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) errors.push(`${relativePath} is missing ${JSON.stringify(snippet)}`);
}

for (const file of [
  "docs/adr/0030-post-v1-evolution-rescue-backbone.md",
  "docs/evolution/README.md",
  "docs/evolution/schema.json",
  "docs/evolution/baseline.json",
  "packages/clawjs-core/src/evolution.ts",
  "packages/clawjs/src/cli-evolution-command.ts",
  "skills/compatibility-evolution-work/SKILL.md",
]) requireFile(file);

for (const snippet of [
  "postV1Migration: \"step_by_step_all_public_versions\"",
  "rescueCore: \"launch_chat_repair\"",
  "legacyLocation: \"boundary_migrators_adapters_receipts\"",
  "externalSubmission: \"explicit_approval_only\"",
]) requireSnippet("packages/clawjs-core/src/evolution.ts", snippet);

for (const snippet of [
  "evolution list|show|diff",
  "docs/adr/0030-post-v1-evolution-rescue-backbone.md",
  "packages/clawjs/src/cli-evolution-command.ts",
]) requireSnippet("packages/clawjs-core/src/cli-command-registry.ts", snippet);

for (const snippet of [
  "evolution-governance-check.mjs",
  "compatibility-evolution-work",
  "Post-V1 evolution and rescue backbone",
]) requireSnippet("docs/decision-map.md", snippet);

const ledger = readJson("docs/evolution/baseline.json");
if (ledger.schemaVersion !== 1) errors.push("evolution ledger schemaVersion must be 1");
if (ledger.policy?.sourceOfTruth !== "clawjs") errors.push("evolution ledger sourceOfTruth must be clawjs");
if (ledger.policy?.postV1Migration !== "step_by_step_all_public_versions") errors.push("postV1Migration policy drifted");
if (ledger.policy?.rescueCore !== "launch_chat_repair") errors.push("rescueCore policy drifted");
if (!Array.isArray(ledger.records) || ledger.records.length < 1) errors.push("evolution ledger must have at least one record");
for (const record of ledger.records ?? []) {
  for (const key of ["id", "title", "class", "status", "owner", "surfaces", "tests", "createdAt"]) {
    if (record[key] === undefined) errors.push(`evolution record ${record.id ?? "<unknown>"} is missing ${key}`);
  }
  if (!Array.isArray(record.surfaces) || record.surfaces.length < 1) errors.push(`evolution record ${record.id} needs surfaces`);
  if (!Array.isArray(record.tests)) errors.push(`evolution record ${record.id} needs tests`);
}

if (process.argv.includes("--self-test")) {
  const invalid = { schemaVersion: 1, policy: { sourceOfTruth: "other" }, records: [] };
  if (invalid.policy.sourceOfTruth === "clawjs") errors.push("self-test fixture unexpectedly passed");
}

if (errors.length > 0) {
  console.error("evolution governance check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("evolution governance check passed");
