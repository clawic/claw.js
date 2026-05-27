#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--release-gate", "--self-test"]);
const errors = [];
const releaseApprovalTargets = {
  "release:version": "release-version",
  "release:publish": "release-publish",
  "publish:packages": "publish-packages",
  "prepublishOnly": "direct-package-publish",
};
const rootReleaseScripts = ["release:version", "release:publish", "publish:packages"];
const publishScriptNames = ["publish:dry-run", "publish:packages"];

function fail(message) {
  errors.push(message);
}

function governanceDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("version_governance_usage_error", error, {
      status: "USAGE",
      location: "scripts/version-governance-check.mjs",
      suggestion: "Use --self-test, --release-gate, or no arguments.",
      safeNextStep: "Rerun node scripts/version-governance-check.mjs with a supported argument.",
    });
  }
  if (error.includes("CLAW_ALLOW_PRE_V1_RELEASE=1")) {
    return createDiagnostic("version_governance_release_not_approved", error, {
      status: "BLOCKED",
      location: "environment.CLAW_ALLOW_PRE_V1_RELEASE",
      suggestion: "Do not publish or mutate versions without explicit current user approval for this release action.",
      safeNextStep: "Get explicit approval, set CLAW_ALLOW_PRE_V1_RELEASE=1 for that command only, then rerun the release gate.",
    });
  }
  if (error.includes("CLAW_RELEASE_APPROVED_FOR=")) {
    return createDiagnostic("version_governance_release_target_mismatch", error, {
      status: "BLOCKED",
      location: "environment.CLAW_RELEASE_APPROVED_FOR",
      suggestion: "Set the approval target to exactly the lifecycle action being attempted.",
      safeNextStep: "Use the CLAW_RELEASE_APPROVED_FOR value printed in this error, then rerun the release gate.",
    });
  }
  if (error.startsWith("capability maturity release gate failed")) {
    return createDiagnostic("version_governance_capability_gate_failed", error, {
      location: "scripts/capability-maturity-guard.mjs",
      suggestion: "Fix the nested capability maturity diagnostic before release work can proceed.",
      safeNextStep: "Run node scripts/capability-maturity-guard.mjs and address its first reported failure.",
    });
  }
  if (error.startsWith("regulated-domain legal release gate failed")) {
    return createDiagnostic("version_governance_legal_gate_failed", error, {
      location: "scripts/verify-regulated-domain-safety-goal.mjs",
      suggestion: "Fix the nested regulated-domain safety diagnostic before release mutation or publish.",
      safeNextStep: "Run node --import tsx scripts/verify-regulated-domain-safety-goal.mjs and address its first failure.",
    });
  }
  if (error.startsWith("owned version drift:")) {
    const location = error.match(/^owned version drift: ([^:]+:\d+)/)?.[1] ?? "docs/governance/pre-v1-version-governance";
    return createDiagnostic("version_governance_owned_version_drift", error, {
      location,
      suggestion: "Remove owned v2+ or schema/protocol version drift unless a public pre-v1 decision allows it.",
      safeNextStep: "Edit the named file to stay pre-v1 compatible, then rerun node scripts/version-governance-check.mjs.",
    });
  }
  if (error.includes("baseline") || error.includes("ledger") || error.includes("digest") || error.includes("package version file count")) {
    return createDiagnostic("version_governance_ledger_drift", error, {
      location: "docs/pre-v1-release-ledger.json",
      suggestion: "Refresh or justify the release ledger when changesets or package versions intentionally change.",
      safeNextStep: "Update docs/pre-v1-release-ledger.json with reviewed values, then rerun the check.",
    });
  }
  if (error.includes("must run") || error.includes("must include") || error.includes("must have an exact approval target") || error.includes("must build publishable package")) {
    return createDiagnostic("version_governance_release_script_invalid", error, {
      location: error.startsWith("RELEASING.md") ? "RELEASING.md" : "package.json",
      suggestion: "Restore the required release, publish, build, and approval gates in scripts and release docs.",
      safeNextStep: "Fix the named script or RELEASING.md entry, then rerun node scripts/version-governance-check.mjs.",
    });
  }
  if (error.startsWith("completion audit is missing")) {
    return createDiagnostic("version_governance_completion_audit_incomplete", error, {
      location: "docs/governance/pre-v1-version-governance/completion.md",
      suggestion: "Document the missing decision binding in the public completion audit.",
      safeNextStep: "Update the completion audit, then rerun node scripts/version-governance-check.mjs.",
    });
  }
  if (error.startsWith("version-governance policy is missing")) {
    return createDiagnostic("version_governance_policy_export_missing", error, {
      location: "packages/clawjs-core/src/version-governance.ts",
      suggestion: "Restore the exported version governance policy field expected by downstream checks.",
      safeNextStep: "Fix packages/clawjs-core/src/version-governance.ts, then rerun this check.",
    });
  }
  if (error.includes("self-test mismatch")) {
    return createDiagnostic("version_governance_self_test_failed", error, {
      location: "scripts/version-governance-check.mjs",
      suggestion: "Fix the version drift or approval-target detector before trusting the guard.",
      safeNextStep: "Update the detector logic, then rerun node scripts/version-governance-check.mjs --self-test.",
    });
  }
  return createDiagnostic("version_governance_check_failed", error, {
    location: "scripts/version-governance-check.mjs",
    suggestion: "Inspect the named release governance invariant and restore the expected contract.",
    safeNextStep: "Fix the reported governance issue, then rerun node scripts/version-governance-check.mjs.",
  });
}

function printErrors(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "Version governance check failed:",
    diagnostics: items.map(governanceDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function listChangesets() {
  const changesetDir = path.join(rootDir, ".changeset");
  return fs.readdirSync(changesetDir)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .sort();
}

function changesetContentHash(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(rootDir, ".changeset", file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function packageVersionEntries() {
  const packageFiles = [
    "package.json",
    ...fs.readdirSync(path.join(rootDir, "packages"))
      .map((name) => `packages/${name}/package.json`)
      .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath))),
  ].sort();
  return packageFiles.map((relativePath) => {
    const packageJson = readJson(relativePath);
    return `${relativePath}:${packageJson.name ?? ""}:${packageJson.version ?? ""}`;
  });
}

function publishablePackageEntries() {
  return fs.readdirSync(path.join(rootDir, "packages"))
    .map((name) => {
      const relativePath = `packages/${name}/package.json`;
      const manifestPath = path.join(rootDir, relativePath);
      if (!fs.existsSync(manifestPath)) return undefined;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.private || typeof manifest.name !== "string" || manifest.name === "__APP_NAME__") return undefined;
      return { name: manifest.name, relativePath, manifest };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isWorkspacePublishPrepublish(env = process.env) {
  if (env.npm_lifecycle_event !== "prepublishOnly") return false;
  if (!env.npm_config_workspace) return false;
  if (!env.INIT_CWD) return false;
  return path.resolve(env.INIT_CWD) === rootDir;
}

function expectedReleaseApprovalTarget(env = process.env) {
  const lifecycleEvent = env.npm_lifecycle_event ?? "";
  if (lifecycleEvent === "prepublishOnly") {
    return isWorkspacePublishPrepublish(env) ? "publish-packages" : "direct-package-publish";
  }
  return releaseApprovalTargets[lifecycleEvent] ?? "direct-release-gate";
}

function hasOwnedVersionDrift(relativePath, text) {
  const allowedSnippets = [
    "no owned `/v2+`",
    "skills-v2",
    "data-v2-config",
    "third_party_api_versions",
    "os_sdk_platform_versions",
    "dependency_lockfiles",
    "provider_model_version_names",
    "blockedPatterns",
  ];
  const lines = text.split(/\r?\n/);
  return lines
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => !allowedSnippets.some((snippet) => line.includes(snippet)))
    .filter(({ line }) => {
      if (/(?:schemaVersion|protocolVersion)\s*[:=]\s*[2-9]\d*/.test(line)) return true;
      if (/["'`]\/v[2-9]\b/.test(line)) return true;
      if (/(?:claw|clawix)[A-Za-z0-9._-]*\.v[2-9]\b/.test(line)) return true;
      return false;
    })
    .map(({ line, index }) => `${relativePath}:${index}: ${line.trim()}`);
}

function checkPolicyExport() {
  const policySource = read("packages/clawjs-core/src/version-governance.ts");
  for (const snippet of [
    "phase: \"pre_v1_mutable\"",
    "branchPolicy: \"main_mutable\"",
    "sourceOfTruth: \"clawjs\"",
    "explicit_user_instruction",
    "new_changeset_bump",
    "owned_schema_version_bump",
    "third_party_api_versions",
  ]) {
    if (!policySource.includes(snippet)) fail(`version-governance policy is missing ${JSON.stringify(snippet)}`);
  }
}

function checkLedger() {
  const ledger = readJson("docs/pre-v1-release-ledger.json");
  const changesets = listChangesets();
  if (ledger.phase !== "pre_v1_mutable") fail("pre-v1 release ledger phase must be pre_v1_mutable");
  if (ledger.changesets?.count !== changesets.length) {
    fail(`changeset baseline count drifted: expected ${ledger.changesets?.count}, found ${changesets.length}`);
  }
  const filenames = changesets.join("\n");
  if (ledger.changesets?.filenameSha256 !== sha256(filenames)) fail("changeset filename baseline hash drifted");
  if (ledger.changesets?.contentSha256 !== changesetContentHash(changesets)) fail("changeset content baseline hash drifted");

  const packageEntries = packageVersionEntries();
  if (ledger.packageVersions?.packageFileCount !== packageEntries.length) {
    fail(`package version file count drifted: expected ${ledger.packageVersions?.packageFileCount}, found ${packageEntries.length}`);
  }
  if (ledger.packageVersions?.nameVersionSha256 !== sha256(packageEntries.join("\n"))) {
    fail("package manifest version digest drifted");
  }
}

function checkReleaseScripts() {
  const packageJson = readJson("package.json");
  for (const scriptName of rootReleaseScripts) {
    const approvalTarget = releaseApprovalTargets[scriptName];
    const script = packageJson.scripts?.[scriptName] ?? "";
    if (!script.includes("version-governance-check.mjs --release-gate")) {
      fail(`${scriptName} must run the pre-v1 release approval gate`);
    }
    if (!approvalTarget) fail(`${scriptName} must have an exact approval target`);
    if (!script.includes("verify-regulated-domain-safety-goal.mjs")) {
      fail(`${scriptName} must run the regulated-domain legal release gate before release mutation or publish`);
    }
  }
  if (!packageJson.scripts?.["publish:dry-run"]?.includes("verify-regulated-domain-safety-goal.mjs")) {
    fail("publish:dry-run must run the regulated-domain legal release gate");
  }
  if (!packageJson.scripts?.["publish:dry-run"]?.includes("build:packages")) {
    fail("publish:dry-run must build all packages before dry-run package publishing");
  }
  const buildPackages = read("scripts/build-packages.mjs");
  const publishablePackages = publishablePackageEntries();
  for (const { name, relativePath, manifest } of publishablePackages) {
    const prepublishOnly = manifest.scripts?.prepublishOnly ?? "";
    if (!prepublishOnly.includes("verify-regulated-domain-safety-goal.mjs")) {
      fail(`${relativePath} must run the regulated-domain legal gate in prepublishOnly`);
    }
    if (!prepublishOnly.includes("version-governance-check.mjs --release-gate")) {
      fail(`${relativePath} must run the exact release approval gate in prepublishOnly`);
    }
    if (!buildPackages.includes(`"${name}"`)) {
      fail(`scripts/build-packages.mjs must build publishable package ${name}`);
    }
    for (const scriptName of publishScriptNames) {
      const script = packageJson.scripts?.[scriptName] ?? "";
      if (!script.includes(`--workspace ${name}`)) {
        fail(`package.json ${scriptName} must include publishable package ${name}`);
      }
    }
  }
  const releasing = read("RELEASING.md");
  for (const approvalTarget of Object.values(releaseApprovalTargets)) {
    if (!releasing.includes(`CLAW_RELEASE_APPROVED_FOR=${approvalTarget}`)) {
      fail(`RELEASING.md must document exact approval target ${approvalTarget}`);
    }
  }
  const testDocs = packageJson.scripts?.["test:docs"] ?? "";
  const runner = testDocs.includes("scripts/test-docs-runner.mjs") && fs.existsSync(path.join(rootDir, "scripts", "test-docs-runner.mjs"))
    ? read("scripts/test-docs-runner.mjs")
    : "";
  if (!testDocs.includes("version-governance-check.mjs") && !runner.includes("version-governance-check.mjs")) {
    fail("test:docs must include version-governance-check.mjs");
  }
  if (!testDocs.includes("verify-regulated-domain-safety-goal.mjs") && !runner.includes("verify-regulated-domain-safety-goal.mjs")) {
    fail("test:docs must include verify-regulated-domain-safety-goal.mjs");
  }
}

function checkLegalReleaseGate() {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "./scripts/verify-regulated-domain-safety-goal.mjs"],
    { cwd: rootDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    fail(`regulated-domain legal release gate failed${output ? `:\n${output}` : ""}`);
  }
}

function checkCapabilityMaturityReleaseGate() {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "./scripts/capability-maturity-guard.mjs"],
    { cwd: rootDir, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    fail(`capability maturity release gate failed${output ? `:\n${output}` : ""}`);
  }
}

function checkCompletionAudit() {
  const audit = read("docs/governance/pre-v1-version-governance/completion.md");
  for (const snippet of [
    "Source conversation: `source:pre-v1-version-governance`",
    "Private maintainer provenance is tracked outside this public repository",
    "3 `request_user_input` prompts",
    "8 binding answers",
    "0 excluded prompts",
    "`v1_meaning`",
    "`Pre-V1 mutable`",
    "`approval_gate`",
    "`Todo contrato publico`",
    "`changesets_policy`",
    "`Congelar bumps`",
    "`source_of_truth`",
    "`ClawJS primero`",
    "`existing_versions`",
    "`Renombrar agresivo`",
    "`existing_changesets`",
    "`Consolidar en ledger`",
    "`branch_policy`",
    "`Main mutable`",
    "`freeze_trigger`",
    "`Frase explicita`",
  ]) {
    if (!audit.includes(snippet)) fail(`completion audit is missing ${JSON.stringify(snippet)}`);
  }
}

function checkOwnedVersionDrift() {
  const scanned = [
    "packages/clawjs-core/src/surface-registry.ts",
    "packages/clawjs-core/src/version-governance.ts",
    "packages/clawjs/src/inspect-cli.ts",
    "packages/clawjs/src/inspect-cli.test.ts",
    "docs/adr/0025-pre-v1-version-governance.md",
    "docs/governance/pre-v1-version-governance/completion.md",
    "docs/decision-map.md",
    "docs/git-workflow.md",
    "RELEASING.md",
    "package.json",
  ];
  for (const relativePath of scanned) {
    for (const hit of hasOwnedVersionDrift(relativePath, read(relativePath))) fail(`owned version drift: ${hit}`);
  }
}

function selfTest() {
  const cases = [
    { text: "const x = { schemaVersion: 8 };", expected: true },
    { text: "const x = { protocolVersion: 2 };", expected: true },
    { text: "id: \"clawix.protocol.bridge.v8\"", expected: true },
    { text: "route: \"/v2/messages\"", expected: true },
    { text: "POST /v1/chat/completions third_party_api_versions", expected: false },
    { text: "macOS 15 SDK os_sdk_platform_versions", expected: false },
    { text: "package-lock dependency_lockfiles version 2", expected: false },
    { text: "model gpt-4.1 provider_model_version_names", expected: false },
  ];
  for (const entry of cases) {
    const actual = hasOwnedVersionDrift("self-test", entry.text).length > 0;
    if (actual !== entry.expected) fail(`self-test mismatch for ${stableJson(entry)}: got ${actual}`);
  }
  const releaseApprovalCases = [
    {
      env: { npm_lifecycle_event: "release:version" },
      expected: "release-version",
    },
    {
      env: { npm_lifecycle_event: "release:publish" },
      expected: "release-publish",
    },
    {
      env: { npm_lifecycle_event: "publish:packages" },
      expected: "publish-packages",
    },
    {
      env: { npm_lifecycle_event: "prepublishOnly", INIT_CWD: rootDir, npm_config_workspace: "@clawjs/core" },
      expected: "publish-packages",
    },
    {
      env: { npm_lifecycle_event: "prepublishOnly", INIT_CWD: path.join(rootDir, "packages", "clawjs-core") },
      expected: "direct-package-publish",
    },
    {
      env: { npm_lifecycle_event: "prepublishOnly", INIT_CWD: rootDir },
      expected: "direct-package-publish",
    },
    {
      env: {},
      expected: "direct-release-gate",
    },
  ];
  for (const entry of releaseApprovalCases) {
    const actual = expectedReleaseApprovalTarget(entry.env);
    if (actual !== entry.expected) fail(`release approval self-test mismatch for ${stableJson(entry)}: got ${actual}`);
  }
  const chunks = [];
  printErrors([
    "unknown argument --bad-token-sk-test-secret-123456",
    "pre_v1_mutable blocks release/version/publish flows without CLAW_ALLOW_PRE_V1_RELEASE=1 and explicit user approval",
    "pre_v1_mutable requires exact release approval CLAW_RELEASE_APPROVED_FOR=release-publish",
    "capability maturity release gate failed: /Users/example/private token: sk-test-secret-123456",
    "regulated-domain legal release gate failed: nested failure",
    "owned version drift: docs/api.md:12: route: \"/v2/messages\"",
    "changeset baseline count drifted: expected 1, found 2",
    "release:publish must run the pre-v1 release approval gate",
    "completion audit is missing \"source_of_truth\"",
    "version-governance policy is missing \"phase\"",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "version_governance_usage_error",
    "version_governance_release_not_approved",
    "version_governance_release_target_mismatch",
    "version_governance_capability_gate_failed",
    "version_governance_legal_gate_failed",
    "version_governance_owned_version_drift",
    "version_governance_ledger_drift",
    "version_governance_release_script_invalid",
    "version_governance_completion_audit_incomplete",
    "version_governance_policy_export_missing",
  ]) {
    if (!output.includes(`code: ${code}`)) fail(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Do not publish or mutate versions")) fail("self-test missing release approval suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) fail("self-test leaked private data");
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printErrors([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--release-gate")) {
  if (process.env.CLAW_ALLOW_PRE_V1_RELEASE !== "1") {
    fail("pre_v1_mutable blocks release/version/publish flows without CLAW_ALLOW_PRE_V1_RELEASE=1 and explicit user approval");
  }
  const expectedApproval = expectedReleaseApprovalTarget();
  if (process.env.CLAW_RELEASE_APPROVED_FOR !== expectedApproval) {
    fail(`pre_v1_mutable requires exact release approval CLAW_RELEASE_APPROVED_FOR=${expectedApproval}`);
  }
  checkCapabilityMaturityReleaseGate();
  checkLegalReleaseGate();
} else {
  checkPolicyExport();
  checkLedger();
  checkReleaseScripts();
  checkCompletionAudit();
  checkOwnedVersionDrift();
  if (args.has("--self-test")) selfTest();
}

if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

console.log(args.has("--release-gate") ? "Version governance release gate passed." : "Version governance check passed.");
