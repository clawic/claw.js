#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  CONNECTOR_CONTEXT_KINDS,
  CONNECTOR_CONTEXT_SENSITIVITIES,
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER,
  CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS,
  CONNECTOR_GOVERNED_STATES,
  buildConnectorContextDoctorReport,
  getConnectorGovernedContextProviderSchema,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const sourceConversationId = "019e3a54-4629-7c90-b85e-927bf34c4d1b";
const sourcePlanId = "019e3a65-edb8-7350-ba56-1c5d4e097677-plan";

const requiredDecisionKeys = [
  "scope_shape",
  "provider_slice",
  "identifier_sensitivity",
  "governance_level",
  "completion_gate",
  "cli_home",
  "primary_concept",
  "connector_universe",
  "definition_of_done",
  "governed_object_model",
  "usage_policy_granularity",
  "instruction_strength",
  "governed_states",
  "default_resolution",
  "fallback_behavior",
  "agent_visibility",
  "approval_requirements",
  "usage_audit",
  "cli_authority",
  "accounts_role",
  "resources_role",
  "human_vocab",
  "technical_surface",
  "resource_decision",
  "context_hierarchy",
  "base_object_kinds",
  "provider_schema_contract",
  "sensitivity_levels",
  "private_identifier_policy",
  "notes_privacy",
  "record_origin",
  "external_drift",
  "source_trust",
  "existing_connectors_scope",
  "gap_handling",
  "supported_gate",
  "complete_all_meaning",
  "provider_priority",
  "context_completeness_depth",
  "new_provider_scope",
  "google_split",
  "apple_scope",
  "secrets_alignment",
  "secret_guidance",
  "cross_use_tracking",
  "policy_scopes",
  "environment_model",
  "agent_policy",
  "cli_v1_depth",
  "explain_shape",
  "blocked_action_response",
  "storage_shape",
  "export_policy",
  "sync_policy",
  "v1_non_goal",
  "live_import_approval",
  "provider_mutation_future",
  "constitution_change_shape",
  "adr_depth",
  "agent_instructions",
  "apple_acceptance",
  "revenuecat_acceptance",
  "current_provider_acceptance",
  "cli_aliases",
  "technical_command_length",
  "cli_examples_style",
];

const requiredDocs = [
  "CONSTITUTION.md",
  "docs/adr/0029-connector-governed-context-v1.md",
  "docs/connector-governed-context.md",
  "docs/connector-governed-context-completion-audit.md",
  "docs/connector-governed-context-source-decision-audit.md",
  "docs/connector-control-plane.md",
  "docs/secrets.md",
  "docs/secrets-security.md",
  "docs/decision-map.md",
  "docs/cli.md",
  "skills/secrets-boundary-review/SKILL.md",
  "skills/integration-qa-lab/SKILL.md",
  "skills/public-hygiene-review/SKILL.md",
  "packages/clawjs-core/src/connector-governed-context.ts",
  "packages/clawjs-core/src/connector-control-plane.ts",
  "packages/clawjs/src/cli-connector-context-command.ts",
  "packages/clawjs/src/cli-connector-context-store.ts",
  "packages/clawjs/src/v1-data-surface.ts",
  "packages/clawjs-core/src/connector-governed-context.test.ts",
  "packages/clawjs-core/src/connector-control-plane.test.ts",
  "packages/clawjs/src/cli-connector-context.test.ts",
  "packages/clawjs/src/v1-connector-control-plane-storage.test.ts",
];

const requiredProviders = [
  "discord",
  "gitlab",
  "github",
  "google",
  "airtable",
  "salesforce",
  "hubspot",
  "stripe",
  "notion",
  "slack",
  "telegram_bot_api",
  "whatsapp",
  "apple",
  "amazon_appstore",
  "revenuecat",
];

const requiredBaseKinds = [
  "account",
  "organization",
  "workspace",
  "project",
  "team",
  "app",
  "product",
  "entitlement",
  "key",
  "webhook",
  "endpoint",
  "environment",
  "signing_identity",
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function readJson(relativePath) {
  const text = read(relativePath);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    fail(`${relativePath} must be valid JSON`);
    return {};
  }
}

function requireSnippet(relativePath, snippet) {
  const text = read(relativePath);
  if (!text.includes(snippet)) fail(`${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function requireNoPattern(relativePath, pattern, description) {
  const text = read(relativePath);
  if (pattern.test(text)) fail(`${relativePath}: contains forbidden ${description}`);
}

function extractTableIds(text, prefix) {
  return new Set([...text.matchAll(new RegExp(`\\|\\s*(${prefix}-\\d{3})\\s*\\|`, "g"))].map((match) => match[1]));
}

for (const file of requiredDocs) read(file);

for (const file of [
  "docs/connector-governed-context-completion-audit.md",
  "docs/connector-governed-context-source-decision-audit.md",
  "docs/adr/0029-connector-governed-context-v1.md",
]) {
  requireNoPattern(file, /\/Users\/|rollout-\d{4}-\d{2}-\d{2}T/u, "private local session path");
}

const sourceAudit = read("docs/connector-governed-context-source-decision-audit.md");
for (const snippet of [sourceConversationId, sourcePlanId, "Final Closure Gate"]) {
  if (!sourceAudit.includes(snippet)) fail(`source decision audit must include ${snippet}`);
}

const qaIds = extractTableIds(sourceAudit, "QA");
const cgcIds = extractTableIds(sourceAudit, "CGC");
if (qaIds.size !== 22) fail(`source decision audit must have 22 QA rows, found ${qaIds.size}`);
if (cgcIds.size !== 66) fail(`source decision audit must have 66 CGC rows, found ${cgcIds.size}`);
for (let index = 1; index <= 22; index += 1) {
  const id = `QA-${String(index).padStart(3, "0")}`;
  if (!qaIds.has(id)) fail(`source decision audit missing ${id}`);
}
for (let index = 1; index <= 66; index += 1) {
  const id = `CGC-${String(index).padStart(3, "0")}`;
  if (!cgcIds.has(id)) fail(`source decision audit missing ${id}`);
}
for (const key of requiredDecisionKeys) {
  if (!sourceAudit.includes(`\`${key}\``)) fail(`source decision audit missing decision key ${key}`);
}
for (const snippet of ["blocked external", "EXTERNAL PENDING", "This audit does not close the goal"]) {
  if (!sourceAudit.includes(snippet)) fail(`source decision audit must include ${snippet}`);
}

const completionAudit = read("docs/connector-governed-context-completion-audit.md");
const cgaIds = extractTableIds(completionAudit, "CGA");
if (cgaIds.size !== 14) fail(`completion audit must have 14 CGA rows, found ${cgaIds.size}`);
for (let index = 1; index <= 14; index += 1) {
  const id = `CGA-${String(index).padStart(3, "0")}`;
  if (!cgaIds.has(id)) fail(`completion audit missing ${id}`);
}
for (const snippet of [
  sourceConversationId,
  sourcePlanId,
  "Closure state: `complete_with_external_pending`",
  "private source-session re-read",
  "CGC-001",
  "CGC-066",
  "EXTERNAL PENDING",
  "Required Validation Map",
  "npm run test:connector-governed-context-goal",
  "Closure Rule",
]) {
  if (!completionAudit.includes(snippet)) fail(`completion audit must include ${snippet}`);
}
if (/\|\s*partial\s*\|/u.test(completionAudit)) fail("completion audit must not contain partial rows at closure");
if (!/\|\s*CGA-013\s*\|[^\n]*\|\s*external_pending\s*\|/u.test(completionAudit)) {
  fail("completion audit must keep live provider import as external_pending");
}
for (const snippet of [
  "CGA-001",
  "CGA-014",
  "Provider schema doctor checks report no structural gaps for all 15 provider",
  "Live provider import and mutation remain explicit-approval work",
]) {
  if (!completionAudit.includes(snippet)) fail(`completion audit must include ${snippet}`);
}

const packageJson = readJson("package.json");
if (packageJson.scripts?.["test:connector-governed-context-goal"] !== "node --import tsx ./scripts/verify-connector-governed-context-goal.mjs") {
  fail("package.json must expose test:connector-governed-context-goal");
}
if (!packageJson.scripts?.["test:docs"]?.includes("npm run test:connector-governed-context-goal")) {
  fail("test:docs must include test:connector-governed-context-goal");
}

if (JSON.stringify(CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER) !== JSON.stringify(requiredProviders)) {
  fail(`provider order mismatch: ${CONNECTOR_GOVERNED_CONTEXT_PROVIDER_ORDER.join(", ")}`);
}
if (JSON.stringify(CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS.map((schema) => schema.providerId)) !== JSON.stringify(requiredProviders)) {
  fail("provider schema order must match required provider order");
}
if (JSON.stringify([...CONNECTOR_CONTEXT_SENSITIVITIES]) !== JSON.stringify(["public", "private", "secret_ref"])) {
  fail("connector context sensitivities must be public/private/secret_ref");
}
if (JSON.stringify([...CONNECTOR_GOVERNED_STATES]) !== JSON.stringify(["active", "paused", "blocked", "retired"])) {
  fail("connector governed states must be active/paused/blocked/retired");
}
for (const kind of requiredBaseKinds) {
  if (!CONNECTOR_CONTEXT_KINDS.includes(kind)) fail(`missing base context kind ${kind}`);
}

const doctor = buildConnectorContextDoctorReport();
if (!doctor.ok || doctor.gaps.length > 0) {
  fail(`builtin provider doctor must have no gaps: ${JSON.stringify(doctor.gaps)}`);
}

for (const schema of CONNECTOR_GOVERNED_CONTEXT_PROVIDER_SCHEMAS) {
  if (!schema.sourceDocs?.length) fail(`${schema.providerId} must cite source docs`);
  if (!schema.guidance?.summary) fail(`${schema.providerId} must include provider guidance`);
  if (!schema.fields.some((field) => field.sensitivity === "secret_ref")) fail(`${schema.providerId} must include a secret_ref field`);
  for (const contextKind of schema.contextKinds) {
    const example = schema.examples?.find((entry) => entry.providerId === schema.providerId && entry.kind === contextKind.kind);
    if (!example) {
      fail(`${schema.providerId}:${contextKind.kind} missing safe daily-use example`);
      continue;
    }
    for (const fieldName of contextKind.requiredFields) {
      if (!example.fields[fieldName]) fail(`${example.id} missing required field ${fieldName}`);
    }
  }
}

const google = getConnectorGovernedContextProviderSchema("google");
if (!google?.subprofiles?.some((entry) => entry.id === "google_play")) fail("google provider must include google_play subprofile");

const apple = getConnectorGovernedContextProviderSchema("apple");
for (const fieldName of ["team_id", "bundle_id", "sku", "issuer_id", "key_id", "product_id", "entitlement_id", "signing_certificate_sha256"]) {
  const field = apple?.fields.find((entry) => entry.name === fieldName);
  if (!field) fail(`apple schema missing ${fieldName}`);
  else if (field.sensitivity !== "private") fail(`apple ${fieldName} must be private`);
}
for (const kind of ["team", "app", "product", "entitlement", "key", "signing_identity", "environment"]) {
  if (!apple?.contextKinds.some((entry) => entry.kind === kind)) fail(`apple schema missing kind ${kind}`);
}

const amazon = getConnectorGovernedContextProviderSchema("amazon_appstore");
for (const fieldName of ["developer_account_id", "package_name", "amazon_app_id", "product_id", "security_profile_id", "binary_kind"]) {
  if (!amazon?.fields.some((entry) => entry.name === fieldName)) fail(`amazon_appstore schema missing ${fieldName}`);
}

const revenueCat = getConnectorGovernedContextProviderSchema("revenuecat");
if (!revenueCat?.defaults?.some((entry) => entry.contextRef === "revenuecat_api_v2")) fail("revenuecat must default to revenuecat_api_v2");
if (!revenueCat?.fallbacks?.some((entry) => entry.fromRef === "revenuecat_api_v2" && entry.toRef === "revenuecat_api_v1")) {
  fail("revenuecat must declare v2 to v1 fallback");
}
for (const exampleId of ["revenuecat_api_v2", "revenuecat_api_v1"]) {
  if (!revenueCat?.examples?.some((entry) => entry.id === exampleId)) fail(`revenuecat missing example ${exampleId}`);
}

for (const snippet of [
  "I.9 Operational context is governed, not guessed",
  "explicit state, policy, defaults",
]) {
  requireSnippet("CONSTITUTION.md", snippet);
}

for (const snippet of [
  "Connector Governed Context",
  "accounts",
  "connectors context",
  "connectors ctx",
  "public",
  "private",
  "secret_ref",
  "core.sqlite",
  "resource projection",
  "source decision audit",
  "Completion Audit",
  "connector-governed-context-completion-audit.md",
]) {
  const corpus = `${read("docs/adr/0029-connector-governed-context-v1.md")}\n${read("docs/connector-governed-context.md")}\n${read("docs/decision-map.md")}\n${read("docs/cli.md")}`;
  if (!corpus.includes(snippet)) fail(`connector docs corpus missing ${snippet}`);
}

for (const [file, snippets] of Object.entries({
  "docs/secrets.md": [
    "## Governed Connector Context",
    "`secret_ref` bindings",
    "approval",
    "audit",
  ],
  "docs/secrets-security.md": [
    "governed context",
    "secret_ref",
    "approval",
    "audit",
  ],
  "skills/secrets-boundary-review/SKILL.md": [
    "governed context",
    "secret_ref",
    "approval",
    "audit",
  ],
  "skills/integration-qa-lab/SKILL.md": [
    "governed connector context",
    "`secret_ref` bindings",
    "approval",
    "audit",
  ],
  "skills/public-hygiene-review/SKILL.md": [
    "governed connector context",
    "`secret_ref` bindings",
    "approval/audit traces",
  ],
})) {
  for (const snippet of snippets) requireSnippet(file, snippet);
}

for (const snippet of [
  "input.group !== \"connectors\" && input.group !== \"accounts\" && input.group !== \"acct\"",
  "input.command !== \"context\" && input.command !== \"ctx\"",
  "list|show|schema|upsert|edit|link-secret|defaults|doctor|validate|explain|export|activate|pause|block|retire|audit",
  "resolveConnectorContextDefaultRefs",
  "context.export",
  "private-envelope",
  "resourceId: input.flags.resource || input.flags[\"resource-id\"]",
]) {
  requireSnippet("packages/clawjs/src/cli-connector-context-command.ts", snippet);
}

for (const snippet of [
  "connector_context_records",
  "connector_context_defaults",
  "connector_context_audit_events",
  "desired_json",
  "observed_json",
  "verification_json",
  "Resource ids must use the opaque res_* format.",
  "secret_material_rejected",
]) {
  requireSnippet("packages/clawjs/src/cli-connector-context-store.ts", snippet);
}

for (const snippet of [
  "CREATE TABLE IF NOT EXISTS connector_context_records",
  "CREATE TABLE IF NOT EXISTS connector_context_defaults",
  "CREATE TABLE IF NOT EXISTS connector_context_audit_events",
]) {
  requireSnippet("packages/clawjs/src/v1-data-surface.ts", snippet);
}

for (const snippet of [
  "contextRequirements?: ConnectorContextRequirement[]",
  "governedContext?: ConnectorContextChoice",
  "contextRefs?: string[]",
  "contextFieldRefs?: string[]",
  "secretRefs?: string[]",
  "defaultContextRefs?: string[]",
  "appliedRuleIds?: string[]",
  "approvalGrantId?: string",
  "evaluateGovernedContext",
]) {
  requireSnippet("packages/clawjs-core/src/connector-control-plane.ts", snippet);
}

for (const [file, snippets] of Object.entries({
  "packages/clawjs-core/src/connector-governed-context.test.ts": [
    "provider schemas expose safe daily-use examples and secret-ref coverage",
    "Apple context fails closed",
    "RevenueCat API v2 is the default and v1 is a traced fallback",
    "scoped defaults resolve by matching scope and priority",
    "object and field policies apply only to matching agent role and operation scopes",
    "redaction keeps public values and never exposes private or secret material by default",
  ],
  "packages/clawjs-core/src/connector-control-plane.test.ts": [
    "connector control plane fails closed when governed context is required but not approved",
    "audit declares governed context refs, secret refs, defaults, fallback rules, and approvals",
  ],
  "packages/clawjs/src/cli-connector-context.test.ts": [
    "accounts exposes governed connector context catalog",
    "acct doctor validates governed connector context schemas",
    "connectors ctx schema exposes Apple signing context",
    "accounts upsert, link-secret, defaults, and state changes persist in core sqlite",
    "accounts export defaults to redacted records and audits the export",
    "accounts export private envelope includes private context but never plaintext secrets",
    "accounts explain resolves defaults by scope and priority",
    "secret-ref fields reject plaintext set values",
  ],
  "packages/clawjs/src/v1-connector-control-plane-storage.test.ts": [
    "connector_context_records",
    "connector_context_defaults",
    "connector_context_audit_events",
  ],
})) {
  for (const snippet of snippets) requireSnippet(file, snippet);
}

for (const snippet of [
  "guard-scripts-verify-connector-governed-context-goal",
  "scripts/verify-connector-governed-context-goal.mjs",
]) {
  requireSnippet("docs/discoverability.md", snippet);
  requireSnippet("docs/discoverability.registry.json", snippet);
}

if (failures.length > 0) {
  console.error("Connector Governed Context goal verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Connector Governed Context goal verification passed (${requiredDecisionKeys.length} decisions, ${requiredProviders.length} providers)`);
