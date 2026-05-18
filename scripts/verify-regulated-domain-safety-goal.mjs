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

function walk(dir, predicate, files = []) {
  const absoluteDir = path.join(rootDir, dir);
  if (!fs.existsSync(absoluteDir)) return files;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".next", ".vitepress", "test-results", "artifacts"].includes(entry.name)) continue;
      walk(relativePath, predicate, files);
    } else if (predicate(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function assertNoBannedPublicClaims() {
  const roots = [
    "README.md",
    "TERMS.md",
    "PRIVACY.md",
    "DISCLAIMER.md",
    "SAFETY.md",
    "REGULATED_DOMAINS.md",
    "SECURITY.md",
    "RELEASING.md",
  ];
  const docs = walk("docs", (file) => [".md", ".json"].includes(path.extname(file)))
    .filter((file) => ![
      "docs/codebase-manifest.json",
      "docs/discoverability.registry.json",
    ].includes(file));
  const website = walk("website", (file) => [".md", ".html", ".json", ".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)));
  const examples = walk("examples", (file) => [".md", ".html", ".json", ".js", ".jsx", ".ts", ".tsx"].includes(path.extname(file)));
  const packageReadmes = walk("packages", (file) => path.basename(file) === "README.md");
  const scanned = [...roots, ...docs, ...website, ...examples, ...packageReadmes]
    .filter((file, index, all) => all.indexOf(file) === index)
    .filter((file) => fs.existsSync(path.join(rootDir, file)));
  const bannedClaims = [
    "autopilot",
    "compliance-ready",
    "hipaa compliant",
    "gdpr compliant",
    "ai act compliant",
    "fda approved",
    "fda cleared",
    "cfpb compliant",
    "diagnose and treat",
    "replaces a doctor",
    "replaces a lawyer",
    "replaces a therapist",
    "provides legal advice",
    "provides medical advice",
    "provides financial advice",
    "makes credit decisions",
    "makes insurance decisions",
    "makes employment decisions",
    "makes admission decisions",
    "submits regulated filings autonomously",
    "send bank details",
  ];
  for (const relativePath of scanned) {
    const lines = read(relativePath).split(/\r?\n/);
    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.toLowerCase();
      if (/\b(do not|does not|must not|without|no)\b/.test(line)) continue;
      for (const claim of bannedClaims) {
        if (line.includes(claim)) {
          errors.push(`${relativePath}:${index + 1}: contains banned or unqualified public claim ${JSON.stringify(claim)}`);
        }
      }
    }
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
assertNoBannedPublicClaims();

if (errors.length > 0) {
  console.error(`Regulated domain safety guard failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Regulated domain safety guard passed.");
