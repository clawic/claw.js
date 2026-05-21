#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const selfTest = process.argv.includes("--self-test");
const errors = [];

function fail(message) {
  errors.push(message);
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function requireSnippet(relativePath, snippet) {
  if (!exists(relativePath)) {
    fail(`${relativePath} is missing`);
    return;
  }
  if (!read(relativePath).includes(snippet)) fail(`${relativePath} must mention ${snippet}`);
}

function validateIncidentDoc(text = read("docs/incident-response.md"), label = "docs/incident-response.md") {
  for (const snippet of [
    "SEV0 critical",
    "SEV1 high",
    "SEV2 medium",
    "SEV3 low",
    "acknowledge within 48 hours",
    "within 24 hours",
    "within 72 hours",
    "high issues target 7 days",
    "medium 30 days",
    "low 90 days",
    "intake",
    "classify",
    "contain",
    "investigate",
    "patch_or_disable",
    "notify",
    "rotate_or_revoke",
    "recover",
    "postmortem",
    "Remote Exploit",
    "Plaintext Secret Or Key Exposure",
    "Compromised Connector",
    "Malicious Plugin Or Sub-App",
    "Data-Loss Incident",
    "Official Artifact Or Update Compromise",
    "embargo",
    "exploit payloads",
    "private paths",
    "private user data",
  ]) {
    if (!text.includes(snippet)) fail(`${label} must mention ${snippet}`);
  }
}

function validateDocs() {
  validateIncidentDoc();
  for (const [file, snippets] of [
    ["SECURITY.md", ["Incident response", "docs/incident-response.md", "48 hours", "72 hours"]],
    ["docs/decision-map.md", ["Incident response", "docs/incident-response.md", "scripts/incident-response-check.mjs"]],
    ["docs/discoverability.registry.json", ["docs/incident-response.md", "scripts/incident-response-check.mjs"]],
    ["docs/discoverability.md", ["docs/incident-response.md", "scripts/incident-response-check.mjs"]],
    ["package.json", ["scripts/incident-response-check.mjs"]],
  ]) {
    for (const snippet of snippets) requireSnippet(file, snippet);
  }
}

function runCheck() {
  validateDocs();
}

function runSelfTest() {
  errors.length = 0;
  validateIncidentDoc(`
# Incident Response
SEV0 critical
SEV1 high
SEV2 medium
SEV3 low
acknowledge within 48 hours
within 24 hours
within 72 hours
high issues target 7 days
medium 30 days
low 90 days
intake classify contain investigate patch_or_disable notify rotate_or_revoke recover postmortem
Remote Exploit
Plaintext Secret Or Key Exposure
Compromised Connector
Malicious Plugin Or Sub-App
Data-Loss Incident
Official Artifact Or Update Compromise
embargo
exploit payloads
private paths
private user data
`, "fixture");
  assert.equal(errors.length, 0);

  errors.length = 0;
  validateIncidentDoc("SEV3 low", "fixture");
  assert(errors.some((error) => error.includes("SEV0 critical")));
  errors.length = 0;
}

if (selfTest) {
  runSelfTest();
  console.log("incident response check self-test passed");
  process.exit(0);
}

runCheck();
if (errors.length > 0) {
  console.error("incident response check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("incident response check passed");
