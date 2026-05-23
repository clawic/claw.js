import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test"]);
const errors = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fail(message) {
  errors.push(message);
}

function hygieneDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("code_hygiene_usage_error", error, {
      status: "USAGE",
      location: "scripts/code-hygiene-check.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node scripts/code-hygiene-check.mjs with a supported argument.",
    });
  }
  if (error.includes("generatedProvenance")) {
    return createDiagnostic("code_hygiene_generated_provenance_invalid", error, {
      location: "docs/code-hygiene-baseline.json",
      suggestion: "Document generator, command, source, hash, regeneration mode, delta, and debt impact for generated or refreshed baselines.",
      safeNextStep: "Fix the generatedProvenance entry, then rerun node scripts/code-hygiene-check.mjs.",
    });
  }
  if (error.includes("must run successfully") || error.includes("output must be valid JSON")) {
    return createDiagnostic("code_hygiene_audit_unavailable", error, {
      location: "scripts/code-hygiene-audit.mjs",
      suggestion: "Fix the nested audit command or its JSON output before trusting the hygiene report.",
      safeNextStep: "Run node scripts/code-hygiene-audit.mjs --json and address its first failure.",
    });
  }
  if (error.includes("decisions")) {
    return createDiagnostic("code_hygiene_decisions_invalid", error, {
      location: "docs/code-hygiene-decisions.json",
      suggestion: "Restore the reviewed code hygiene decision record without private session fields.",
      safeNextStep: "Fix docs/code-hygiene-decisions.json, then rerun node scripts/code-hygiene-check.mjs.",
    });
  }
  if (error.includes("baseline")) {
    return createDiagnostic("code_hygiene_baseline_invalid", error, {
      location: "docs/code-hygiene-baseline.json",
      suggestion: "Keep baseline entries categorized, owned, referenced, unexpired, and justified.",
      safeNextStep: "Fix the named baseline entry, then rerun node scripts/code-hygiene-check.mjs.",
    });
  }
  if (error.includes("Knip")) {
    return createDiagnostic("code_hygiene_knip_report_invalid", error, {
      location: "docs/code-hygiene-knip-report.json",
      suggestion: "Refresh or correct the Knip report while keeping it report-only and non-destructive.",
      safeNextStep: "Run node scripts/code-hygiene-knip.mjs, review the report pair, then rerun this check.",
    });
  }
  if (error.includes("Periphery")) {
    return createDiagnostic("code_hygiene_periphery_report_invalid", error, {
      location: "docs/code-hygiene-periphery-report.json",
      suggestion: "Refresh or correct the Periphery report while keeping external-pending evidence separate when the binary is unavailable.",
      safeNextStep: "Run node scripts/code-hygiene-periphery.mjs or record external pending, then rerun this check.",
    });
  }
  if (error.includes("report")) {
    return createDiagnostic("code_hygiene_report_invalid", error, {
      location: "docs/code-hygiene-report.json",
      suggestion: "Keep the JSON/Markdown report pair aligned with the current audit summaries and safety notes.",
      safeNextStep: "Regenerate or edit the code hygiene report pair, then rerun node scripts/code-hygiene-check.mjs.",
    });
  }
  if (error.includes("completion audit")) {
    return createDiagnostic("code_hygiene_completion_audit_invalid", error, {
      location: "docs/governance/code-hygiene/completion.md",
      suggestion: "Document every reviewed decision row without private source-session placeholders.",
      safeNextStep: "Fix the completion audit, then rerun node scripts/code-hygiene-check.mjs.",
    });
  }
  if (error.includes("private maintainer path") || error.includes("private source-session")) {
    return createDiagnostic("code_hygiene_private_reference", error, {
      location: "docs/code-hygiene",
      suggestion: "Remove private maintainer paths and source-session placeholders from public hygiene artifacts.",
      safeNextStep: "Replace private references with public-safe provenance, then rerun this check.",
    });
  }
  return createDiagnostic("code_hygiene_check_failed", error, {
    location: "scripts/code-hygiene-check.mjs",
    suggestion: "Inspect the named code hygiene artifact and restore the expected governance invariant.",
    safeNextStep: "Fix the reported hygiene issue, then rerun node scripts/code-hygiene-check.mjs.",
  });
}

function printErrors(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "code hygiene check failed:",
    diagnostics: items.map(hygieneDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runDiagnosticSelfTest() {
  const chunks = [];
  printErrors([
    "unknown argument --bad-token-sk-test-secret-123456",
    "code hygiene baseline entry generated generatedProvenance is missing upstreamHash",
    "code hygiene audit must run successfully from the checker",
    "code hygiene decisions must not publish private sourceSessionPath",
    "code hygiene report Knip summary must match the Knip report",
    "code hygiene report Periphery status must match the Periphery report",
    "code hygiene report must include generatedAt",
    "code hygiene completion audit must record the decision count review",
    "docs/code-hygiene-ledger.md contains a private maintainer path /Users/example/private",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "code_hygiene_usage_error",
    "code_hygiene_generated_provenance_invalid",
    "code_hygiene_audit_unavailable",
    "code_hygiene_decisions_invalid",
    "code_hygiene_knip_report_invalid",
    "code_hygiene_periphery_report_invalid",
    "code_hygiene_report_invalid",
    "code_hygiene_completion_audit_invalid",
    "code_hygiene_private_reference",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Document generator")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printErrors([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

function validateGeneratedProvenance(value, label) {
  const requiredStringFields = ["generator", "command", "source", "upstreamHash", "regenerationMode", "deltaSummary", "debtImpact"];
  const regenerationModes = new Set(["deterministic", "snapshot-refresh", "manual-reviewed"]);
  const debtImpacts = new Set(["decreases", "neutral", "increases"]);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is missing generatedProvenance`);
    return;
  }
  for (const field of requiredStringFields) {
    if (typeof value[field] !== "string" || value[field].trim() === "") {
      fail(`${label} generatedProvenance is missing ${field}`);
    }
  }
  if (typeof value.upstreamHash === "string" && value.upstreamHash.trim() && !/^sha256:[a-f0-9]{64}$/.test(value.upstreamHash)) {
    fail(`${label} generatedProvenance upstreamHash must use sha256:<64 hex>`);
  }
  if (typeof value.regenerationMode === "string" && value.regenerationMode.trim() && !regenerationModes.has(value.regenerationMode)) {
    fail(`${label} generatedProvenance regenerationMode is invalid`);
  }
  if (typeof value.debtImpact === "string" && value.debtImpact.trim() && !debtImpacts.has(value.debtImpact)) {
    fail(`${label} generatedProvenance debtImpact is invalid`);
  }
  if (value.debtImpact !== "decreases" && (typeof value.debtImpactReason !== "string" || value.debtImpactReason.trim() === "")) {
    fail(`${label} generatedProvenance is missing debtImpactReason for neutral/increasing debt`);
  }
}

const decisions = readJson("docs/code-hygiene-decisions.json");
const baseline = readJson("docs/code-hygiene-baseline.json");
const tools = readJson("docs/code-hygiene-tools.json");
const report = readJson("docs/code-hygiene-report.json");
const knipReport = readJson("docs/code-hygiene-knip-report.json");
const peripheryReport = readJson("docs/code-hygiene-periphery-report.json");
const reportMarkdown = readText("docs/code-hygiene-report.md");
const knipReportMarkdown = readText("docs/code-hygiene-knip-report.md");
const peripheryReportMarkdown = readText("docs/code-hygiene-periphery-report.md");
const codeHygieneAdr = readText("docs/adr/0016-code-hygiene-program.md");
const ledger = readText("docs/code-hygiene-ledger.md");
const decisionChecklist = readText("docs/code-hygiene-decision-checklist.md");
const completionAudit = readText("docs/governance/code-hygiene/completion.md");
const auditSkill = readText("skills/code-hygiene-audit/SKILL.md");
const cleanupSkill = readText("skills/code-hygiene-cleanup/SKILL.md");
const knipConfigPath = fs.existsSync(path.join(rootDir, "web", "knip.json")) ? "web/knip.json" : "knip.json";
const auditResult = spawnSync("node", ["scripts/code-hygiene-audit.mjs", "--json"], {
  cwd: rootDir,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});
let auditSummary = null;
if (auditResult.status !== 0) {
  fail("code hygiene audit must run successfully from the checker");
} else {
  try {
    auditSummary = JSON.parse(auditResult.stdout).summary;
  } catch {
    fail("code hygiene audit output must be valid JSON");
  }
}

if (decisions.schemaVersion !== 1) fail("code hygiene decisions schemaVersion must be 1");
if (decisions.program !== "code-hygiene") fail("code hygiene decisions program must be code-hygiene");
if (decisions.decisionCount !== 33) fail("code hygiene decisionCount must be 33");
if (!Array.isArray(decisions.decisions) || decisions.decisions.length !== decisions.decisionCount) {
  fail("code hygiene decisions length must match decisionCount");
}
for (const [index, decision] of (decisions.decisions ?? []).entries()) {
  if (!decision.id) fail(`code hygiene decision ${index} is missing id`);
  if (!decision.answer) fail(`code hygiene decision ${decision.id ?? index} is missing answer`);
}
if ("sourceSessionPath" in decisions) fail("code hygiene decisions must not publish private sourceSessionPath");

if (baseline.schemaVersion !== 1) fail("code hygiene baseline schemaVersion must be 1");
if (baseline.program !== "code-hygiene") fail("code hygiene baseline program must be code-hygiene");
if (baseline.defaultExpiryDays !== 90) fail("code hygiene baseline defaultExpiryDays must be 90");
if (!Array.isArray(baseline.categories) || baseline.categories.length === 0) {
  fail("code hygiene baseline must define categories");
}
for (const entry of baseline.entries ?? []) {
  if (!entry.reason) fail("code hygiene baseline entry is missing reason");
  if (!entry.ownerArea) fail("code hygiene baseline entry is missing ownerArea");
  if (!entry.reference) fail("code hygiene baseline entry is missing reference");
  if (!entry.expiresAt) fail("code hygiene baseline entry is missing expiresAt");
  if (entry.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresAt)) {
    fail(`code hygiene baseline entry ${entry.id ?? "(unknown)"} has invalid expiresAt`);
  }
  if (entry.expiresAt && entry.expiresAt <= report.generatedAt) {
    fail(`code hygiene baseline entry ${entry.id ?? "(unknown)"} is expired`);
  }
  if (entry.category && !baseline.categories.includes(entry.category)) fail(`code hygiene baseline entry ${entry.id ?? "(unknown)"} has unknown category`);
  if (entry.category === "generated") {
    validateGeneratedProvenance(entry.generatedProvenance, `code hygiene baseline entry ${entry.id ?? "(unknown)"}`);
  }
}

const generatedProvenanceDocs = [
  ["ADR 0016", codeHygieneAdr],
  ["decision checklist", decisionChecklist],
  ["code hygiene audit skill", auditSkill],
  ["code hygiene cleanup skill", cleanupSkill],
];
for (const [label, text] of generatedProvenanceDocs) {
  if (!text.includes("generated provenance")) fail(`${label} must document generated provenance for large generated/baseline refreshes`);
  for (const field of ["generator", "command", "source", "upstreamHash", "regenerationMode", "deltaSummary", "debtImpact"]) {
    if (!text.includes(field)) fail(`${label} must document generated provenance field ${field}`);
  }
  if (!/delta/i.test(text) || !/debt/i.test(text)) {
    fail(`${label} must document baseline refresh delta and debt impact`);
  }
}

if (tools.schemaVersion !== 1) fail("code hygiene tools schemaVersion must be 1");
if (tools.tools?.knip?.version !== "6.14.0") fail("code hygiene Knip version must be 6.14.0");
if (tools.tools?.knip?.mode !== "pinned-dev-dependency-report-only") fail("code hygiene Knip mode must be report-only");
if (tools.tools?.knip?.runner !== "scripts/code-hygiene-knip.mjs") fail("code hygiene Knip runner must be documented");
if (tools.tools?.knip?.config !== knipConfigPath) fail(`code hygiene Knip config must be ${knipConfigPath}`);
if (tools.tools?.knip?.reportJson !== "docs/code-hygiene-knip-report.json") fail("code hygiene Knip JSON report path must be documented");
if (tools.tools?.knip?.reportMarkdown !== "docs/code-hygiene-knip-report.md") fail("code hygiene Knip Markdown report path must be documented");
if (tools.tools?.knip?.destructiveDefault !== false) fail("code hygiene Knip destructive default must be false");
if (tools.tools?.periphery?.version !== "3.7.4") fail("code hygiene Periphery version must be 3.7.4");
if (tools.tools?.periphery?.mode !== "versioned-homebrew-report-only-until-calibrated") fail("code hygiene Periphery mode must be report-only");
if (tools.tools?.periphery?.runner !== "scripts/code-hygiene-periphery.mjs") fail("code hygiene Periphery runner must be documented");
if (tools.tools?.periphery?.reportJson !== "docs/code-hygiene-periphery-report.json") fail("code hygiene Periphery JSON report path must be documented");
if (tools.tools?.periphery?.reportMarkdown !== "docs/code-hygiene-periphery-report.md") fail("code hygiene Periphery Markdown report path must be documented");
if (tools.tools?.periphery?.destructiveDefault !== false) fail("code hygiene Periphery destructive default must be false");
const packageCandidates = ["package.json", "web/package.json"];
const hasKnipDependency = packageCandidates
  .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)))
  .some((relativePath) => readJson(relativePath).devDependencies?.knip === "6.14.0");
if (!hasKnipDependency) fail("Knip must be pinned as a dev dependency");

if (report.schemaVersion !== 1) fail("code hygiene report schemaVersion must be 1");
if (report.program !== "code-hygiene") fail("code hygiene report program must be code-hygiene");
if (!report.generatedAt) fail("code hygiene report must include generatedAt");
if (!report.lastAuditSummary) fail("code hygiene report must include lastAuditSummary");
if (typeof report.baselinedFindings !== "number") fail("code hygiene report must include baselinedFindings");
if (report.baselinedFindings !== (baseline.entries ?? []).length) fail("code hygiene report baselinedFindings must match baseline entry count");
if (report.blockingFindings !== 0) fail("code hygiene report must have zero blocking findings after initial cleanup");
for (const field of ["scannedFiles", "todoFindings", "duplicateAssetGroups", "duplicateAssetFiles", "unreferencedAssetCandidates"]) {
  if (typeof report.lastAuditSummary?.[field] !== "number") {
    fail(`code hygiene report lastAuditSummary must include numeric ${field}`);
  }
  if (auditSummary && report.lastAuditSummary?.[field] !== auditSummary[field]) {
    fail(`code hygiene report lastAuditSummary.${field} must match current audit summary`);
  }
}
const expectedReportOnlyFindings =
  report.lastAuditSummary.todoFindings +
  report.lastAuditSummary.duplicateAssetGroups +
  report.lastAuditSummary.unreferencedAssetCandidates;
if (report.reportOnlyFindings !== expectedReportOnlyFindings) {
  fail("code hygiene reportOnlyFindings must match report-only audit categories");
}
if (report.lastAuditSummary.todoFindings !== 0) fail("code hygiene report must keep actionable TODO findings at zero");
if (report.lastAuditSummary.unreferencedAssetCandidates !== 0) fail("code hygiene report must keep unreferenced asset candidates at zero");
if (report.knipSummary?.totalIssues !== knipReport.summary?.totalIssues) fail("code hygiene report Knip summary must match the Knip report");
if (report.baselinedFindings !== (baseline.entries?.length ?? 0)) fail("code hygiene report baselinedFindings must match baseline entries");
if (typeof report.peripherySummary?.packageCount !== "number") fail("code hygiene report must include Periphery packageCount");
if (report.peripherySummary?.status !== peripheryReport.status) fail("code hygiene report Periphery status must match the Periphery report");
if (peripheryReport.status === "external-pending" && !report.externalPending?.some((entry) => entry.id === "periphery-binary-unavailable")) {
  fail("code hygiene report must record Periphery external pending separately");
}
if (!reportMarkdown.includes("docs/code-hygiene-report.json")) fail("code hygiene Markdown report must link the JSON pair");
if (!reportMarkdown.includes("unreferenced asset candidates")) fail("code hygiene Markdown report must mention unreferenced asset candidates");
if (knipReport.schemaVersion !== 1) fail("code hygiene Knip report schemaVersion must be 1");
if (knipReport.program !== "code-hygiene") fail("code hygiene Knip report program must be code-hygiene");
if (knipReport.tool !== "knip") fail("code hygiene Knip report tool must be knip");
if (knipReport.toolVersion !== "6.14.0") fail("code hygiene Knip report must use Knip 6.14.0");
if (knipReport.mode !== "report-only") fail("code hygiene Knip report must be report-only");
if (knipReport.config !== knipConfigPath) fail(`code hygiene Knip report config must be ${knipConfigPath}`);
if (typeof knipReport.summary?.totalIssues !== "number") fail("code hygiene Knip report must include numeric totalIssues");
if (!Array.isArray(knipReport.summary?.topFiles)) fail("code hygiene Knip report must include topFiles");
if (!knipReportMarkdown.includes("This report does not authorize automatic deletion")) {
  fail("code hygiene Knip Markdown report must state cleanup safety");
}
if (!knipReportMarkdown.includes("## Top Files")) fail("code hygiene Knip Markdown report must include top files");
if (peripheryReport.schemaVersion !== 1) fail("code hygiene Periphery report schemaVersion must be 1");
if (peripheryReport.program !== "code-hygiene") fail("code hygiene Periphery report program must be code-hygiene");
if (peripheryReport.tool !== "periphery") fail("code hygiene Periphery report tool must be periphery");
if (peripheryReport.toolVersion !== "3.7.4") fail("code hygiene Periphery report must use Periphery 3.7.4");
if (peripheryReport.mode !== "report-only") fail("code hygiene Periphery report must be report-only");
if (!["scanned", "external-pending"].includes(peripheryReport.status)) fail("code hygiene Periphery report status is invalid");
if (typeof peripheryReport.summary?.packageCount !== "number") fail("code hygiene Periphery report must include numeric packageCount");
if (!peripheryReportMarkdown.includes("This report does not authorize automatic deletion")) {
  fail("code hygiene Periphery Markdown report must state cleanup safety");
}
const privateSourceSessionRefField = ["source", "Session", "Ref"].join("");
const privateSessionPlaceholderPattern = new RegExp(`(?:private session,\\s*not published|${privateSourceSessionRefField})`, "iu");
if (privateSessionPlaceholderPattern.test(ledger)) fail("code hygiene ledger must not publish private source-session placeholders");
if (!decisionChecklist.includes("rollout_model")) fail("code hygiene decision checklist must include rollout_model");
if (!decisionChecklist.includes("Initial cleanup completed")) fail("code hygiene decision checklist must record completed initial cleanup");
if (!report.notes?.some((note) => note.includes("Initial cleanup completed"))) {
  fail("code hygiene report notes must record completed initial cleanup");
}
if (!completionAudit.includes("11 `request_user_input`")) fail("code hygiene completion audit must record the request_user_input batch review");
if (!completionAudit.includes("33 binding answers")) fail("code hygiene completion audit must record the decision count review");
if (privateSessionPlaceholderPattern.test(completionAudit)) fail("code hygiene completion audit must not publish private source-session placeholders");
if (privateSourceSessionRefField in decisions) fail("code hygiene decisions must not publish private source-session ref fields");
for (const decision of decisions.decisions ?? []) {
  if (!completionAudit.includes(`\`${decision.id}\``)) {
    fail(`code hygiene completion audit must include decision ${decision.id}`);
  }
}
const completionRows = completionAudit.split("\n").filter((line) => /^\| \d+ \|/.test(line));
if (completionRows.length !== decisions.decisionCount) fail("code hygiene completion audit must have one row per decision");

if (args.has("--self-test")) {
  runDiagnosticSelfTest();
}

for (const relativePath of [
  "docs/adr/0016-code-hygiene-program.md",
  "docs/code-hygiene-decisions.json",
  "docs/code-hygiene-baseline.json",
  "docs/code-hygiene-decision-checklist.md",
  "docs/governance/code-hygiene/completion.md",
  "docs/code-hygiene-tools.json",
  "docs/code-hygiene-ledger.md",
  "docs/code-hygiene-report.json",
  "docs/code-hygiene-report.md",
  "docs/code-hygiene-knip-report.json",
  "docs/code-hygiene-knip-report.md",
  "docs/code-hygiene-periphery-report.json",
  "docs/code-hygiene-periphery-report.md",
  "scripts/code-hygiene-audit.mjs",
  "scripts/code-hygiene-knip.mjs",
  "scripts/code-hygiene-periphery.mjs",
  knipConfigPath,
  "skills/code-hygiene-audit/SKILL.md",
  "skills/code-hygiene-cleanup/SKILL.md",
]) {
  const text = readText(relativePath);
  if (/\/Users\/trabajo\b/.test(text)) fail(`${relativePath} contains a private maintainer path`);
  if (/\b(is|for|as|id)\s+`\s*`/.test(text) || /\bfor\s+\./.test(text)) fail(`${relativePath} appears to contain an empty placeholder`);
}

if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

console.log(args.has("--self-test") ? "code hygiene check self-test passed" : "code hygiene check passed");
