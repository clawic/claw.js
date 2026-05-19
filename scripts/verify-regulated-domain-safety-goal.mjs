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

function extractTableIds(text, prefix) {
  return new Set(text.split(/\r?\n/)
    .map((line) => line.match(new RegExp(`^\\|\\s*(${prefix}-\\d{3})\\s*\\|`))?.[1])
    .filter(Boolean));
}

function assertExternalPendingLedger(relativePath, expectedCount) {
  const text = read(relativePath);
  const rows = text.split(/\r?\n/)
    .map((line) => line.match(/^\|\s*(LEGAL-EXT-\d{3})\s*\|[^|]+\|[^|]+\|[^|]+\|\s*([^|]+?)\s*\|/))
    .filter(Boolean)
    .map((match) => ({ id: match[1], status: match[2].trim() }));
  if (rows.length !== expectedCount) {
    errors.push(`${relativePath}: expected ${expectedCount} LEGAL-EXT rows, found ${rows.length}`);
  }
  const ids = new Set(rows.map((row) => row.id));
  for (let index = 1; index <= expectedCount; index += 1) {
    const id = `LEGAL-EXT-${String(index).padStart(3, "0")}`;
    if (!ids.has(id)) errors.push(`${relativePath}: missing ${id}`);
  }
  for (const row of rows) {
    if (row.status !== "EXTERNAL PENDING") {
      errors.push(`${relativePath}: ${row.id} must have EXTERNAL PENDING status, found ${row.status}`);
    }
  }
}

function walk(dir, predicate, files = []) {
  const absoluteDir = path.join(rootDir, dir);
  if (!fs.existsSync(absoluteDir)) return files;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if ([
        ".build",
        ".git",
        ".next",
        ".tmp",
        ".vitepress",
        "artifacts",
        "build",
        "dist",
        "node_modules",
        "output",
        "playwright-report",
        "release-output",
        "target",
        "test-results",
      ].includes(entry.name)) continue;
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
    "EULA.md",
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
    "bank details included",
    "zero wait time",
    "every workflow is built and maintained by autonomous agents",
    "every seat is an autonomous agent",
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

function assertPackageReadmeDisclaimers() {
  const packageReadmes = walk("packages", (file) => path.basename(file) === "README.md");
  const missingPackageReadmes = [];
  const packageFileErrors = [];
  const packageJsons = walk("packages", (file) => path.basename(file) === "package.json");
  for (const packageJsonPath of packageJsons) {
    const packageJson = JSON.parse(read(packageJsonPath));
    if (packageJson.publishConfig?.access === "public") {
      const prepublishOnly = packageJson.scripts?.prepublishOnly;
      if (typeof prepublishOnly !== "string"
        || !prepublishOnly.includes("verify-regulated-domain-safety-goal.mjs")
        || !prepublishOnly.includes("version-governance-check.mjs --release-gate")) {
        packageFileErrors.push(`${packageJsonPath}: public package must run legal and exact-approval release gates in prepublishOnly`);
      }
      if (!Array.isArray(packageJson.files)) {
        packageFileErrors.push(`${packageJsonPath}: public package must declare package files including README.md`);
        continue;
      }
      if (!packageJson.files.includes("README.md")) {
        packageFileErrors.push(`${packageJsonPath}: public package must ship README.md with legal disclaimer`);
        continue;
      }
      const expectedReadme = path.join(path.dirname(packageJsonPath), "README.md");
      if (!fs.existsSync(path.join(rootDir, expectedReadme))) {
        missingPackageReadmes.push(expectedReadme);
      }
    }
  }
  for (const message of packageFileErrors) {
    errors.push(message);
  }
  for (const relativePath of missingPackageReadmes) {
    errors.push(`${relativePath}: public package declares README.md but the file is missing`);
  }
  for (const relativePath of packageReadmes) {
    const text = read(relativePath);
    for (const snippet of [
      "does not replace regulated professionals",
      "not professional advice",
      "must not make final medical",
      "REGULATED_DOMAINS.md",
    ]) {
      if (!text.includes(snippet)) {
        errors.push(`${relativePath}: missing package legal disclaimer snippet ${JSON.stringify(snippet)}`);
      }
    }
  }
}

function assertReleaseScriptsRunLegalGate() {
  const packageJson = JSON.parse(read("package.json"));
  for (const scriptName of ["publish:dry-run", "publish:packages", "release:version", "release:publish"]) {
    const script = packageJson.scripts?.[scriptName];
    if (typeof script !== "string") {
      errors.push(`package.json: missing release script ${scriptName}`);
      continue;
    }
    if (!script.includes("verify-regulated-domain-safety-goal.mjs")) {
      errors.push(`package.json: ${scriptName} must run verify-regulated-domain-safety-goal.mjs before release mutation or publishing`);
    }
  }
  if (!packageJson.scripts?.["build:website"]?.includes("verify-regulated-domain-safety-goal.mjs")) {
    errors.push("package.json: build:website must run verify-regulated-domain-safety-goal.mjs before building public website assets");
  }
  const websitePackageJson = JSON.parse(read("website/package.json"));
  for (const scriptName of ["prebuild", "predocs:build"]) {
    const script = websitePackageJson.scripts?.[scriptName];
    if (typeof script !== "string" || !script.includes("verify-regulated-domain-safety-goal.mjs")) {
      errors.push(`website/package.json: ${scriptName} must run verify-regulated-domain-safety-goal.mjs before direct website/docs builds`);
    }
  }
}

function assertLegalDocsAreBilingual() {
  for (const relativePath of ["TERMS.md", "PRIVACY.md", "DISCLAIMER.md", "SAFETY.md", "REGULATED_DOMAINS.md", "EULA.md"]) {
    const text = read(relativePath);
    for (const snippet of ["## English", "## Espanol"]) {
      if (!text.includes(snippet)) {
        errors.push(`${relativePath}: legal document must keep bilingual section ${JSON.stringify(snippet)}`);
      }
    }
  }
}

function assertLegalDocVersionsAreAligned() {
  const expectedVersion = "2026-05-18";
  for (const relativePath of ["TERMS.md", "PRIVACY.md", "DISCLAIMER.md", "SAFETY.md", "REGULATED_DOMAINS.md", "EULA.md"]) {
    const text = read(relativePath);
    if (!text.includes(`Last updated: ${expectedVersion}`)) {
      errors.push(`${relativePath}: legal document must keep Last updated: ${expectedVersion}`);
    }
  }
}

function assertDemoDataIsSynthetic() {
  const seedPath = "examples/mock/seed.mjs";
  const seed = read(seedPath);
  if (!seed.includes("All people, messages, emails, tokens, costs, and incidents are synthetic placeholders.")) {
    errors.push(`${seedPath}: mock seed must explicitly declare synthetic placeholder data`);
  }

  const allowedEmailDomains = new Set([
    "example.com",
    "example.net",
    "example.org",
    "example.test",
    "clawjs.local",
  ]);
  const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
  for (const match of seed.matchAll(emailPattern)) {
    const domain = match[1].toLowerCase();
    if (!allowedEmailDomains.has(domain)) {
      errors.push(`${seedPath}: public mock data must use reserved email domains, found ${match[0]}`);
    }
  }
}

function assertNoCredentialLikePublicSecrets() {
  const roots = [
    "README.md",
    "TERMS.md",
    "PRIVACY.md",
    "DISCLAIMER.md",
    "SAFETY.md",
    "REGULATED_DOMAINS.md",
    "EULA.md",
    "SECURITY.md",
    "RELEASING.md",
  ];
  const extensions = new Set([".md", ".html", ".json", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".yml", ".yaml"]);
  const scanned = [
    ...roots,
    ...walk("docs", (file) => extensions.has(path.extname(file))),
    ...walk("website", (file) => extensions.has(path.extname(file))),
    ...walk("examples", (file) => extensions.has(path.extname(file))),
    ...walk("packages", (file) => extensions.has(path.extname(file))),
    ...walk("tests", (file) => extensions.has(path.extname(file))),
  ]
    .filter((file, index, all) => all.indexOf(file) === index)
    .filter((file) => fs.existsSync(path.join(rootDir, file)));
  const patterns = [
    ["github-token", /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{20,}/g],
    ["openai-token", /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g],
    ["slack-token", /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{20,}/g],
    ["aws-access-key", /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g],
    ["google-api-key", /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{20,}/g],
    ["personal-email-domain", /\b[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|icloud|me|live)\.(com|net|org)\b/gi],
  ];
  const allowedCredentialFixtures = new Set([
    "packages/clawjs/src/cli-report.test.ts",
  ]);
  for (const relativePath of scanned) {
    const lines = read(relativePath).split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (allowedCredentialFixtures.has(relativePath) && /redact|redacted|token|TEAM_ID|internal\.example/.test(line)) {
        continue;
      }
      for (const [id, pattern] of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          errors.push(`${relativePath}:${index + 1}: contains credential-like or personal fixture value (${id}); use synthetic placeholders or a redaction test allowlist`);
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
if (finalFinance.policyDecision !== "block") {
  errors.push("finance final decision must return policyDecision=block");
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
if (legalExport.policyDecision !== "confirm" || !legalExport.requirements.includes("human_review")) {
  errors.push("legal sensitive export must return policyDecision=confirm with human review requirement");
}

const reviewedLegalExport = evaluateRegulatedAction({
  regulatedDomain: "legal",
  decisionEffect: "external_action",
  sensitiveExport: true,
  externalAction: true,
  policyConfig: {
    confirmed: true,
    approvalId: "approval_legal_export",
    legalLabel: "Legal export - human reviewed",
    materialConsent: true,
    destinationAuthorized: true,
  },
});
if (!reviewedLegalExport.allowed || reviewedLegalExport.policyDecision !== "allow") {
  errors.push("reviewed legal sensitive export must be allow after central policy config is satisfied");
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
  ["EULA.md", [
    "official apps and binaries",
    "renewed acceptance",
    "not directed to users under 18",
    "Spain and applicable European Union law",
    "not professional",
  ]],
  ["README.md", [
    "Terms",
    "Regulated domains",
    "Official app and binary EULA",
  ]],
  ["RELEASING.md", [
    "TERMS.md",
    "EULA.md",
    "compliance-ready claims",
    "Classify every new sensitive collection, connector, agent, CLI route, MCP tool, Relay route, app surface, demo, or docs claim",
    "docs/regulated-domain-safety.md",
    "npm Package Channel Checklist",
    "GitHub Release Channel Checklist",
    "Website Channel Checklist",
    "App And Binary Channel Checklist",
    "explicit approval for that exact",
    "CLAW_RELEASE_APPROVED_FOR=release-version",
    "CLAW_RELEASE_APPROVED_FOR=release-publish",
    "CLAW_RELEASE_APPROVED_FOR=publish-packages",
    "CLAW_RELEASE_APPROVED_FOR=direct-package-publish",
    "@clawjs/signals-core",
    "@clawjs/marketplace-agent-policy",
    "docs/legal-external-pending-validation.md",
  ]],
  ["package.json", [
    "npm publish --dry-run --access public --workspace @clawjs/search",
    "npm publish --dry-run --access public --workspace @clawjs/search-mcp",
    "npm publish --dry-run --access public --workspace @clawjs/index",
    "npm publish --dry-run --access public --workspace @clawjs/signals-core",
    "npm publish --dry-run --access public --workspace @clawjs/marketplace-agent-policy",
    "npm publish --access public --workspace @clawjs/search",
    "npm publish --access public --workspace @clawjs/search-mcp",
    "npm publish --access public --workspace @clawjs/index",
    "npm publish --access public --workspace @clawjs/signals-core",
    "npm publish --access public --workspace @clawjs/marketplace-agent-policy",
  ]],
  ["scripts/build-packages.mjs", [
    "\"@clawjs/search\"",
    "\"@clawjs/search-mcp\"",
    "\"@clawjs/index\"",
    "\"@clawjs/signals-core\"",
    "\"@clawjs/marketplace-agent-policy\"",
  ]],
  ["scripts/version-governance-check.mjs", [
    "releaseApprovalTargets",
    "publishablePackageEntries",
    "expectedReleaseApprovalTarget",
    "isWorkspacePublishPrepublish",
    "\"release:version\": \"release-version\"",
    "\"release:publish\": \"release-publish\"",
    "\"publish:packages\": \"publish-packages\"",
    "\"prepublishOnly\": \"direct-package-publish\"",
    "CLAW_RELEASE_APPROVED_FOR=${expectedApproval}",
  ]],
  ["scripts/pack-smoke.mjs", [
    "packages\", \"clawjs-search\"",
    "packages\", \"clawjs-search-mcp\"",
    "await import(\"@clawjs/search\")",
    "await import(\"@clawjs/search-mcp\")",
  ]],
  ["scripts/package-surface-guard.mjs", [
    "releaseCriticalPackages",
    "releaseGateScripts",
    "\"release:version\": \"release-version\"",
    "\"release:publish\": \"release-publish\"",
    "\"publish:packages\": \"publish-packages\"",
    "version-governance-check.mjs --release-gate",
    "verify-regulated-domain-safety-goal.mjs",
    "CLAW_RELEASE_APPROVED_FOR=${approvalTarget}",
    "\"@clawjs/search-mcp\"",
    "scripts/build-packages.mjs must build release-critical package",
    "scripts/pack-smoke.mjs must pack local tarball for release-critical package",
    "package.json ${scriptName} must include release-critical package",
  ]],
  ["CONSTITUTION.md", [
    "Regulated domains are assistive",
    "other regulated decisions",
  ]],
  ["docs/decision-map.md", [
    "Regulated domains are assistive",
    "Legal Closure Decision Audit",
    "scripts/verify-regulated-domain-safety-goal.mjs",
    "packages/clawjs-core/src/regulated-domain-safety.test.ts",
  ]],
  ["docs/legal-closure-decision-audit.md", [
    "Source conversation: `019e3a44-1175-7930-b45c-252f342b5ec2`",
    "Closure state: `active_goal_not_complete`",
    "33 structured decisions",
    "LC-001",
    "LC-033",
    "EXTERNAL PENDING",
    "Required Evidence Spine",
    "legal certification is made here",
    "docs/legal-external-pending-validation.md",
  ]],
  ["docs/legal-external-pending-validation.md", [
    "Source conversation: `019e3a44-1175-7930-b45c-252f342b5ec2`",
    "Status: `active_goal_not_complete`",
    "LEGAL-EXT-001",
    "all 36 publishable packages",
    "@clawjs/signals-core",
    "0.1.2",
    "already exists",
    "Release PR/version bump for an unpublished version",
    "LEGAL-EXT-006",
    "EXTERNAL PENDING",
    "not passes",
    "must not be downgraded to `EXTERNAL PENDING`",
    "No row authorizes a push, tag, publish, upload, notarization, TestFlight",
  ]],
  ["docs/regulated-domain-safety.md", [
    "The default safe envelope",
    "Every new sensitive collection, connector, agent, CLI route",
  ]],
  ["packages/clawjs-core/src/agents-v1.ts", [
    "evaluateRegulatedAction",
    "regulated_safety:${regulatedDomain}:${code}",
  ]],
  ["packages/clawjs-core/src/agents-v1.test.ts", [
    "Agents V1 regulated safety blocks final decisions even when grants allow access",
    "Agents V1 regulated safety requires review for connector, remote, and export paths",
  ]],
  ["packages/clawjs-core/src/connector-control-plane.ts", [
    "evaluateRegulatedAction",
    "evaluateRegulatedConnectorSafety",
    "regulated_safety_blocked",
    "requiresSensitiveExportReview",
    "thirdPartyDisclosure",
  ]],
  ["packages/clawjs-core/src/connector-control-plane.test.ts", [
    "connector control plane blocks regulated external actions through connector metadata",
    "health.records.export",
    "regulated_safety_blocked",
    "sensitive_export_review_required",
    "remote_or_provider_opt_in_required",
  ]],
  ["packages/clawjs-mcp/src/control-plane.ts", [
    "regulatedDomains?: RegulatedDomain[]",
    "decisionEffects?: RegulatedDecisionEffect[]",
    "requiresSensitiveExportReview?: boolean",
    "thirdPartyDisclosure?: boolean",
  ]],
  ["packages/clawjs-mcp/src/control-plane.test.ts", [
    "blocks regulated MCP tool calls before protocol invocation",
    "regulatedDomains: [\"health\"]",
    "decisionEffects: [\"final_decision\"]",
    "regulated_safety_blocked",
  ]],
  ["packages/clawjs-core/src/dense-data-os.ts", [
    "regulatedDomains: RegulatedDomain[]",
    "regulatedDomainsForDenseSystem",
    "health: [\"health\"]",
    "hr: [\"hr_employment\"]",
    "iot: [\"iot_physical_actions\"]",
  ]],
  ["packages/clawjs-core/src/dense-data-os.test.ts", [
    "dense data regulated systems are classified through the legal safety policy",
    "evaluateRegulatedAction",
    "decisionEffect: \"final_decision\"",
    "final decisions must be blocked",
  ]],
  ["packages/clawjs-core/src/remote-sync.ts", [
    "evaluateRegulatedAction",
    "regulatedDomainsForRemoteManifest",
    "Regulated remote shares require explicit review",
    "lease_secret",
    "remoteOrProviderUse: true",
  ]],
  ["packages/clawjs-core/src/remote-sync-e2e.ts", [
    "requiredTopologyTargets",
    "mac_host",
    "linux_host",
    "windows_host",
    "headless_server",
    "vps_host",
    "mobile_client",
    "browser_client",
    "self_hosted_gateway",
    "hosted_gateway",
    "approvedPhysicalValidationRequired",
  ]],
  ["packages/clawjs-core/src/index.test.ts", [
    "health:patient:123",
    "Regulated remote shares require explicit review",
    "sensitive_export_review_required",
    "requiredTopologyTargets",
    "hosted_gateway",
  ]],
  ["relay/src/server/remote-sync-routes.test.ts", [
    "health:patient:123",
    "Regulated remote shares require explicit review",
  ]],
  ["packages/clawjs-search/src/index.test.ts", [
    "Search action execution requires review and labels for regulated results",
    "regulated_result_review_required",
    "regulated_domain:finance",
  ]],
  ["packages/clawjs-search-mcp/src/index.test.ts", [
    "finance.records:1",
    "copy-reference",
    "regulated_result_review_required",
    "legalOutputLabels",
  ]],
  ["content/src/server/publish.ts", [
    "Pre-public legal closure: publishPolicy describes operator intent, not permission.",
    "if (destination.publishPolicy === \"autopublish\") return true;",
    "return true;",
  ]],
  ["content/tests/e2e/backend.e2e.test.ts", [
    "Autopublish still requires explicit approval before publication.",
    "approval_required",
    "blockedAutoRun.response.status, 409",
  ]],
  ["content/tests/e2e/cli.e2e.test.ts", [
    "autopublish plan run should require approval before publication",
    "approved approval request",
    "Autopublish still requires explicit approval before publication.",
  ]],
  ["content/tests/e2e/sdk.e2e.test.ts", [
    "approved approval request",
    "Autopublish still requires explicit approval before publication.",
  ]],
  ["relay/tests/e2e/relay.e2e-utils.ts", [
    "content.publish.createPlan",
    "approval_required",
    "Plan requires an approved approval request before publication.",
  ]],
  ["relay/tests/e2e/relay.e2e.test.ts", [
    "Relay content autopublish still requires explicit approval.",
    "planPayload.approval?.status, \"pending\"",
  ]],
  ["packages/clawjs-node/src/create-claw-channel-facades.ts", [
    "requires explicit approvalId before external send",
    "telegram.sendMessage",
    "slack.sendMessage",
    "whatsapp.sendMessage",
    "channels.messages.send",
  ]],
  ["packages/clawjs-node/src/create-claw-telegram.test.ts", [
    "blocked external send",
    "approval_telegram_send_message",
    "approval_channels_message_send",
    "requires explicit approvalId before external send",
  ]],
  ["docs/api.md", [
    "approval-from-human-review",
  ]],
  ["docs/interface-matrix.md", [
    "sendMessage({ approvalId })",
    "sendMedia({ approvalId })",
  ]],
  ["packages/clawjs-node/src/notify/index.ts", [
    "evaluateRegulatedAction",
    "evaluateNotificationDeliveryPolicy",
    "approvalId: string",
    "legalLabel?: string",
    "policy?:",
    "notify.send requires explicit approvalId before external notification delivery.",
  ]],
  ["notify/src/server/app.ts", [
    "evaluateRegulatedAction",
    "evaluateNotificationDeliveryPolicy",
    "serializePolicyDecision",
    "Notification delivery requires explicit approvalId.",
    "approval_required",
  ]],
  ["packages/clawjs-node/src/notify/index.test.ts", [
    "approval_notify_send",
    "Notification delivery - human reviewed",
    "sent.policy?.decision",
    "requires explicit approvalId before external notification delivery",
    "approval_required",
  ]],
  ["packages/clawjs/src/notify.test.ts", [
    "approval_notify_cli_send",
    "--approval-id",
    "--legal-label",
  ]],
  ["notify/tests/e2e/backend.e2e.test.ts", [
    "approval_notify_run_1",
    "created.policy.decision",
    "external_review_required",
  ]],
  ["packages/clawjs-node/src/storage/store.ts", [
    "evaluateRegulatedAction",
    "policyDecision",
    "Storage share creation requires explicit approvalId before export/share.",
    "Storage share creation requires a persistent legalLabel before export/share.",
    "claw.storage.export.legal",
    "policyApplied",
    "approval_id",
    "legal_label",
  ]],
  ["packages/clawjs-node/src/media/store.ts", [
    "evaluateRegulatedAction",
    "policyDecision",
    "Media share creation requires explicit approvalId before export/share.",
    "Media share creation requires a persistent legalLabel before export/share.",
  ]],
  ["packages/clawjs-node/src/storage/store.test.ts", [
    "approval_storage_share",
    "approval_storage_export",
    "Exported content - human reviewed",
    "legalManifest.policy.decision",
    "regulated_domain:identity",
  ]],
  ["packages/clawjs/src/cli-export-review.ts", [
    "evaluateRegulatedAction",
    "policyDecision",
    "requires --confirm before exporting or sharing data",
    "requires --approval-id or --host-approval-id",
    "requires --legal-label",
    "policyApplied",
  ]],
  ["packages/clawjs/src/cli-productivity-primary-command.test.ts", [
    "approval_work_export",
    "approval_work_backup",
    "Work snapshot - human reviewed",
    "Work backup - human reviewed",
  ]],
  ["packages/clawjs/src/cli-download-export-review.test.ts", [
    "approval_document_download",
    "approval_media_download",
    "Document download - human reviewed",
    "Media download - human reviewed",
    "policy.decision",
    "regulated_domain:identity",
  ]],
  ["packages/clawjs/src/cli-file-session-document-command.ts", [
    "claw.documents.download.legal",
    "documents download",
  ]],
  ["packages/clawjs/src/cli-media-generation-command.ts", [
    "claw.media.download.legal",
    "media download",
  ]],
  ["packages/clawjs/src/cli-project-command.test.ts", [
    "approval_project_export",
    "Project handoff - human reviewed",
  ]],
  ["packages/clawjs/src/cli-connector-context.test.ts", [
    "approval_accounts_redacted",
    "approval_accounts_private",
    "Redacted connector export - human reviewed",
  ]],
  ["packages/clawjs-node/src/media/store.test.ts", [
    "approval_media_object",
    "approval_media_gallery",
    "Exported media - human reviewed",
  ]],
  ["packages/clawjs/src/cli-media-generation-command.ts", [
    "legalLabel: flags[\"legal-label\"]",
    "approvalId: flags[\"approval-id\"] ?? flags[\"host-approval-id\"]",
  ]],
  ["docs/api.md", [
    "Exported media - human reviewed",
    "storage.exportToFile",
  ]],
  ["docs/cli.md", [
    "work export snapshot.json --confirm --approval-id",
    "work backup backups/ --confirm --approval-id",
    "project export . --output project-handoff.clawexport --confirm --approval-id",
    "accounts export --provider apple --mode redacted --confirm --approval-id",
    "documents download --document-id document-123",
    "media download --media-id media-123",
  ]],
  ["docs/adr/0026-regulated-domain-safety-liability-boundary.md", [
    "Status",
    "Accepted",
    "`allow`, `confirm`, `block`, or `log-only`",
    "evaluateRegulatedAction(...)",
    "Subagents, connectors, MCP, Relay",
  ]],
  ["docs/regulated-domain-safety.md", [
    "`allow`",
    "`confirm`",
    "`block`",
    "`log-only`",
    "shared policy instead of adding command-local legal checks",
  ]],
  ["docs/cli.md", [
    "claw safety domains --json",
    "claw safety check --domain finance --effect final_decision",
    "--material-consent true --destination-authorized true",
    "policy decision of `block` or `confirm`",
  ]],
  ["packages/clawjs/src/cli-safety-command.ts", [
    "policyConfig",
    "parsePolicyMode",
    "${data.decision.policyDecision}",
    "disclaimer\\t${data.decision.disclaimerPolicy}",
    "labels\\t${data.decision.outputLabels.join(\",\")}",
  ]],
  ["packages/clawjs/src/cli-safety.test.ts", [
    "safety human domain surfaces preserve guard metadata",
    "\"outputLabelPolicy\": \"required\"",
    "safety check can return confirm or allow through central policy config",
    "policyDecision",
    "safety explain returns policy evidence for regulated domains",
    "legal_strategy_as_final_advice",
    "legal_service_decision",
    "safety check human output preserves disclaimer and labels",
    "regulated_domain:legal",
  ]],
  ["packages/clawjs-core/src/cli-command-registry.ts", [
    "name: \"safety\"",
    "docs/adr/0026-regulated-domain-safety-liability-boundary.md",
  ]],
]) {
  for (const snippet of snippets) requireSnippet(relativePath, snippet);
}

const legalClosureAudit = read("docs/legal-closure-decision-audit.md");
const legalClosureIds = extractTableIds(legalClosureAudit, "LC");
if (legalClosureIds.size !== 33) {
  errors.push(`docs/legal-closure-decision-audit.md: expected 33 LC rows, found ${legalClosureIds.size}`);
}
for (let index = 1; index <= 33; index += 1) {
  const id = `LC-${String(index).padStart(3, "0")}`;
  if (!legalClosureIds.has(id)) errors.push(`docs/legal-closure-decision-audit.md: missing ${id}`);
}
assertExternalPendingLedger("docs/legal-external-pending-validation.md", 6);

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
assertPackageReadmeDisclaimers();
assertReleaseScriptsRunLegalGate();
assertLegalDocsAreBilingual();
assertLegalDocVersionsAreAligned();
assertDemoDataIsSynthetic();
assertNoCredentialLikePublicSecrets();

if (errors.length > 0) {
  console.error(`Regulated domain safety guard failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Regulated domain safety guard passed.");
