#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const failures = [];

function read(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function requireNoPrivatePaths(relativePath) {
  const text = read(relativePath);
  if (/\/Users\/|rollout-\d{4}-\d{2}-\d{2}T/u.test(text)) {
    failures.push(`${relativePath}: contains private local session path`);
  }
}

const sourceAuditPath = "docs/governance/governance-workspace-project/source-audit.md";
const completionAuditPath = "docs/governance/governance-workspace-project/completion.md";
const sourceAudit = read(sourceAuditPath);
const completionAudit = read(completionAuditPath);

for (const file of [sourceAuditPath, completionAuditPath]) requireNoPrivatePaths(file);

for (const snippet of [
  "source:governance-workspace-project",
  "GQ-058",
  "GQ-059",
  "GQ-060",
  "superseded",
  "This audit does not close the goal",
]) {
  if (!sourceAudit.includes(snippet)) failures.push(`${sourceAuditPath}: missing ${JSON.stringify(snippet)}`);
}

for (let index = 1; index <= 84; index += 1) {
  const id = `GQ-${String(index).padStart(3, "0")}`;
  if (!sourceAudit.includes(`| ${id} |`)) failures.push(`${sourceAuditPath}: missing ${id}`);
}

for (let index = 1; index <= 14; index += 1) {
  const id = `GWA-${String(index).padStart(3, "0")}`;
  if (!completionAudit.includes(`| ${id} |`)) failures.push(`${completionAuditPath}: missing ${id}`);
}

for (const snippet of [
  "Closure state: `ready_for_close_with_external_pending`",
  "EXTERNAL PENDING",
  "npm run test:governance",
  "swift test --package-path macos --filter ProjectFolderStateTests",
  "swift test --package-path macos --filter ClawJSProjectHandoffClientTests",
]) {
  if (!completionAudit.includes(snippet)) failures.push(`${completionAuditPath}: missing ${JSON.stringify(snippet)}`);
}

requireSnippet("docs/adr/0027-governance-identity-scope-model.md", "`tenant` is a technical isolation word only.");
requireSnippet("docs/adr/0028-workspace-project-folder-manifest.md", "`claw.project.json` is a clean v1 manifest");
requireSnippet("docs/decision-map.md", "Governance Workspace/Project Completion Audit");
requireSnippet("docs/discoverability.md", "governance-workspace-project-goal");
requireSnippet("scripts/governance-scope-guard.mjs", "docs/governance-vocabulary-baseline.json");

if (failures.length > 0) {
  console.error("governance workspace/project goal verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("governance workspace/project goal verifier passed");
