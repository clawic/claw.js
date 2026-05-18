#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  assertRegulatedDomainSafetyComplete,
  evaluateRegulatedAction,
  regulatedDomains,
} from "../packages/clawjs-core/src/regulated-domain-safety.ts";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) {
    errors.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
  }
}

function requireNoSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (text.includes(snippet)) {
    errors.push(`${relativePath}: contains forbidden ${JSON.stringify(snippet)}`);
  }
}

try {
  assertRegulatedDomainSafetyComplete();
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

for (const domain of [
  "health",
  "mental_health",
  "finance",
  "banking",
  "insurance",
  "legal",
  "hr_employment",
  "education",
  "government_public_services",
  "pharma",
  "labs_research",
  "iot_physical_actions",
  "vehicles_transport",
  "minors",
]) {
  if (!regulatedDomains.includes(domain)) {
    errors.push(`regulated domain registry missing ${domain}`);
  }
}

const finalFinance = evaluateRegulatedAction({
  regulatedDomain: "finance",
  decisionEffect: "final_decision",
  requestedUse: "investment_or_credit_decision",
});
if (finalFinance.allowed || !finalFinance.denialCodes.includes("final_decision_blocked")) {
  errors.push("finance final decision is not blocked");
}

const legalExport = evaluateRegulatedAction({
  regulatedDomain: "legal",
  decisionEffect: "external_action",
  sensitiveExport: true,
  externalAction: true,
});
if (!legalExport.denialCodes.includes("sensitive_export_review_required")) {
  errors.push("legal sensitive export does not require review");
}

for (const [relativePath, snippets] of [
  ["TERMS.md", [
    "Spain and applicable European Union law",
    "ClawJS is not a doctor",
  ]],
  ["PRIVACY.md", [
    "Local-first default",
    "Support data is manual opt-in",
  ]],
  ["DISCLAIMER.md", [
    "not final decisions",
    "ClawJS is not an emergency service",
  ]],
  ["SAFETY.md", [
    "Allowed sensitive use",
    "Required review",
  ]],
  ["REGULATED_DOMAINS.md", [
    "Covered domains",
    "health",
  ]],
  ["README.md", [
    "Terms",
    "Regulated domains",
  ]],
  ["RELEASING.md", [
    "TERMS.md",
    "compliance-ready claims",
  ]],
  ["CONSTITUTION.md", [
    "Regulated domains are assistive",
    "other regulated decisions",
  ]],
  ["docs/decision-map.md", [
    "Regulated domains are assistive",
    "packages/clawjs-core/src/regulated-domain-safety.test.ts",
  ]],
  ["docs/regulated-domain-safety.md", [
    "The default safe envelope",
    "Every new sensitive collection, connector, agent, CLI route",
  ]],
  ["docs/adr/0026-regulated-domain-safety-liability-boundary.md", [
    "Status",
    "Accepted",
    "Subagents, connectors, MCP, Relay",
  ]],
  ["docs/cli.md", [
    "claw safety domains --json",
    "claw safety check --domain finance --effect final_decision",
  ]],
  ["packages/clawjs-core/src/cli-command-registry.ts", [
    "name: \"safety\"",
    "docs/adr/0026-regulated-domain-safety-liability-boundary.md",
  ]],
]) {
  for (const snippet of snippets) requireSnippet(relativePath, snippet);
}

for (const snippet of [
  "compliance-ready defaults for regulated environments",
  "Autonomous agents make final medical decisions",
  "Autonomous agents make final legal decisions",
  "Autonomous agents make final financial decisions",
]) {
  requireNoSnippet("docs/regulated-domain-safety.md", snippet);
  requireNoSnippet("docs/adr/0026-regulated-domain-safety-liability-boundary.md", snippet);
}

if (errors.length > 0) {
  console.error(`Regulated domain safety guard failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Regulated domain safety guard passed.");
