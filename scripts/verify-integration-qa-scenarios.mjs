#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const allowedStatuses = new Set([
  "implemented",
  "fixture_only",
  "live_smoke",
  "manual_only",
  "unsupported_by_policy",
  "deprecated",
]);
const requiredReportStatuses = [
  "PASS",
  "FAIL",
  "PARTIAL",
  "EXTERNAL PENDING",
  "QUARANTINED",
];

function fail(message) {
  console.error(`integration qa scenario validation failed: ${message}`);
  process.exitCode = 1;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

run("npm", ["--workspace", "@clawjs/integrations", "run", "build"]);

const integrations = await import(path.join(rootDir, "packages/clawjs-integrations/dist/index.js"));
const matrixReport = integrations.verifyOfficialApiCoverageMatrix(integrations.TELEGRAM_OFFICIAL_API_MATRIX);
if (matrixReport.provider !== "telegram_bot_api") fail("Telegram matrix provider mismatch");
if (matrixReport.totalOfficialMethods !== 176) fail(`Telegram matrix expected 176 official methods, got ${matrixReport.totalOfficialMethods}`);
if (matrixReport.totalEntries !== matrixReport.totalOfficialMethods) fail("Telegram matrix entries do not match official method count");
if (integrations.TELEGRAM_OFFICIAL_UPDATE_FIELDS.length !== 25) fail("Telegram Update field snapshot must contain 25 fields");
if (integrations.TELEGRAM_OFFICIAL_UPDATE_COVERAGE.length !== integrations.TELEGRAM_OFFICIAL_UPDATE_FIELDS.length) {
  fail("Telegram Update coverage entries do not match official field count");
}

const officialMethods = new Set(integrations.TELEGRAM_OFFICIAL_API_COVERAGE.map((entry) => entry.officialMethod));
const updateFields = new Set(integrations.TELEGRAM_OFFICIAL_UPDATE_FIELDS);
const fixtureSnapshot = readJson("packages/clawjs-integrations/fixtures/telegram-official-api-10.0-surface.json");
if (!sameArray(fixtureSnapshot.officialMethods, integrations.TELEGRAM_OFFICIAL_BOT_API_METHODS)) {
  fail("Telegram official method fixture snapshot is out of sync");
}
if (!sameArray(fixtureSnapshot.officialUpdateFields, integrations.TELEGRAM_OFFICIAL_UPDATE_FIELDS)) {
  fail("Telegram official Update field fixture snapshot is out of sync");
}
const fixtureOnlyMethods = integrations.TELEGRAM_OFFICIAL_API_COVERAGE
  .filter((entry) => entry.status === "fixture_only")
  .map((entry) => entry.officialMethod);
if (!sameArray(fixtureSnapshot.fixtureOnlyMethods, fixtureOnlyMethods)) {
  fail("Telegram fixture_only method snapshot is out of sync");
}
const fixtureOnlyUpdateFields = integrations.TELEGRAM_OFFICIAL_UPDATE_COVERAGE
  .filter((entry) => entry.status === "fixture_only")
  .map((entry) => entry.updateField);
if (!sameArray(fixtureSnapshot.fixtureOnlyUpdateFields, fixtureOnlyUpdateFields)) {
  fail("Telegram fixture_only Update field snapshot is out of sync");
}
for (const entry of integrations.TELEGRAM_OFFICIAL_API_COVERAGE) {
  if (!allowedStatuses.has(entry.status)) fail(`${entry.officialMethod} has invalid status ${entry.status}`);
  if (!entry.notes?.trim()) fail(`${entry.officialMethod} is missing a coverage rationale`);
  if (entry.status === "implemented") {
    for (const operationId of entry.connectorOperationIds) {
      if (operationId === "telegram_bot_api.source.*") {
        for (const source of ["new-updates", "message-updates", "channel-updates", "new-bot-command-received"]) {
          if (!fs.existsSync(path.join(rootDir, `packages/clawjs-integrations/fixtures/telegram-source-${source}-request.json`))) {
            fail(`${entry.officialMethod} is missing source request fixture ${source}`);
          }
          if (!fs.existsSync(path.join(rootDir, `packages/clawjs-integrations/fixtures/telegram-source-${source}.json`))) {
            fail(`${entry.officialMethod} is missing source event fixture ${source}`);
          }
        }
        continue;
      }
      const slug = operationId.split(".").at(-1);
      if (!slug) fail(`${entry.officialMethod} has invalid operation id ${operationId}`);
      if (!fs.existsSync(path.join(rootDir, `packages/clawjs-integrations/fixtures/telegram-${slug}-request.json`))) {
        fail(`${entry.officialMethod} is missing request fixture for ${slug}`);
      }
      if (!fs.existsSync(path.join(rootDir, `packages/clawjs-integrations/fixtures/telegram-${slug}-response.json`))) {
        fail(`${entry.officialMethod} is missing response fixture for ${slug}`);
      }
    }
  }
}
for (const entry of integrations.TELEGRAM_OFFICIAL_UPDATE_COVERAGE) {
  if (!updateFields.has(entry.updateField)) fail(`${entry.updateField} is not in the official Update field snapshot`);
  if (!allowedStatuses.has(entry.status)) fail(`${entry.updateField} has invalid status ${entry.status}`);
  if (!entry.notes?.trim()) fail(`${entry.updateField} is missing a coverage rationale`);
}

const scenarioIds = new Set();
for (const scenario of integrations.TELEGRAM_LIVE_SMOKE_SCENARIOS) {
  if (scenarioIds.has(scenario.id)) fail(`duplicate Telegram live smoke scenario ${scenario.id}`);
  scenarioIds.add(scenario.id);
  if (!scenario.requires?.length) fail(`${scenario.id} has no explicit prerequisites`);
  if (!scenario.notes?.trim()) fail(`${scenario.id} has no rationale`);
  for (const method of scenario.officialMethods) {
    if (!officialMethods.has(method)) fail(`${scenario.id} references unknown official method ${method}`);
  }
}

const requiredScenarioIds = [
  "telegram.get-me",
  "telegram.poll-updates",
  "telegram.send-edit-delete-text",
  "telegram.synthetic-photo",
  "telegram.rate-error-handling",
  "telegram.webhook-loopback",
  "telegram.group-admin-authorization",
  "telegram.payments-passport-managed-bot",
];
for (const id of requiredScenarioIds) {
  if (!scenarioIds.has(id)) fail(`missing Telegram live smoke scenario ${id}`);
}

const manualScenarioIds = integrations.TELEGRAM_LIVE_SMOKE_SCENARIOS
  .filter((scenario) => scenario.lane === "manual_only")
  .map((scenario) => scenario.id);
for (const id of ["telegram.webhook-loopback", "telegram.group-admin-authorization"]) {
  if (!manualScenarioIds.includes(id)) fail(`${id} must remain manual_only`);
}
const policyBlocked = integrations.TELEGRAM_LIVE_SMOKE_SCENARIOS
  .find((scenario) => scenario.id === "telegram.payments-passport-managed-bot");
if (policyBlocked?.lane !== "unsupported_by_policy") {
  fail("payments/passport/managed-bot scenario must remain unsupported_by_policy");
}

const scenarioDoc = read("qa/scenarios/telegram-integration-qa-lab.md");
const validationReport = read("qa/scenarios/telegram-integration-qa-lab-validation-report.md");
const liveRunbook = read("qa/scenarios/telegram-live-broker-runbook.md");
for (const status of requiredReportStatuses) {
  const docs = [
    read("docs/testing.md"),
    read("docs/adr/0002-testing-architecture.md"),
    read("docs/integration-qa-lab.md"),
    scenarioDoc,
    validationReport,
    liveRunbook,
  ].join("\n");
  if (!docs.includes(status)) fail(`report status ${status} is not documented`);
}
for (const phrase of [
  "official API",
  "update-field",
  "brokered credential lease",
  "telegram-live-broker-runbook.md",
  "test:package-live",
  "EXTERNAL PENDING",
  "manual-only",
  "policy-blocked",
]) {
  if (!scenarioDoc.includes(phrase)) fail(`Telegram QA scenario is missing phrase: ${phrase}`);
}
for (const phrase of [
  "Decision Audit",
  "Prompt-to-Artifact Checklist",
  "CLAWJS_LIVE_REPORT_PATH",
  "official API completeness",
  "brokered credential leases",
  "OpenClaw",
  "Hermes Agent",
  "Docker daemon",
  "Completion Judgment",
]) {
  if (!validationReport.includes(phrase)) fail(`Telegram QA validation report is missing phrase: ${phrase}`);
}
for (const phrase of [
  "CLAW_LIVE_BROKER_COMMAND",
  "CLAWJS_LIVE_REPORT_PATH",
  "TELEGRAM_BOT_TOKEN",
  "credentialLeaseReleased",
  "free_only",
]) {
  if (!liveRunbook.includes(phrase)) fail(`Telegram live broker runbook is missing phrase: ${phrase}`);
}
for (const phrase of [
  "send-voice-message",
  "TELEGRAM_OFFICIAL_BOT_API_VERSION=10.0",
  "qa/quarantine.json",
  "EXTERNAL PENDING",
]) {
  if (!validationReport.includes(phrase)) fail(`Telegram QA validation checklist is missing evidence: ${phrase}`);
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("integration qa scenario validation passed");
