#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

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

function incidentDiagnostic(error) {
  const missingFile = error.match(/^(.+) is missing$/);
  if (missingFile) {
    return createDiagnostic("incident_response_required_file_missing", error, {
      location: missingFile[1],
      suggestion: "Restore the required incident-response document or registry entry.",
      safeNextStep: `Add or restore ${missingFile[1]}, then rerun node scripts/incident-response-check.mjs.`,
    });
  }
  const missingSnippet = error.match(/^(.+) must mention (.+)$/);
  if (missingSnippet) {
    return createDiagnostic("incident_response_required_text_missing", error, {
      location: missingSnippet[1],
      suggestion: "Restore the required incident-response severity, timeline, workflow, or privacy wording.",
      safeNextStep: `Update ${missingSnippet[1]}, then rerun node scripts/incident-response-check.mjs.`,
    });
  }
  return createDiagnostic("incident_response_check_failed", error, {
    location: "scripts/incident-response-check.mjs",
    suggestion: "Inspect the incident-response contract and restore the expected invariant.",
    safeNextStep: "Fix the reported incident-response issue, then rerun node scripts/incident-response-check.mjs.",
  });
}

function printErrors(options = {}) {
  printActionableFailureReport({
    title: options.title ?? "incident response check failed:",
    diagnostics: errors.map(incidentDiagnostic),
    stream: options.stream ?? process.stderr,
  });
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

  errors.push(
    "/Users/example/private/SECURITY.md is missing",
    "docs/incident-response.md must mention private paths",
  );
  const chunks = [];
  printErrors({ stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  assert.match(output, /code: incident_response_required_file_missing/);
  assert.match(output, /code: incident_response_required_text_missing/);
  assert.match(output, /location: docs\/incident-response\.md/);
  assert.match(output, /suggestion: Restore the required incident-response severity/);
  assert.match(output, /next: Update docs\/incident-response\.md/);
  assert.doesNotMatch(output, /\/Users\/example/);
  errors.length = 0;
}

if (selfTest) {
  runSelfTest();
  console.log("incident response check self-test passed");
  process.exit(0);
}

runCheck();
if (errors.length > 0) {
  printErrors();
  process.exit(1);
}

console.log("incident response check passed");
