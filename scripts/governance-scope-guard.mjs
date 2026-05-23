import fs from "node:fs";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const baselinePath = path.join(rootDir, "docs/governance-vocabulary-baseline.json");
const classificationsPath = path.join(rootDir, "docs/governance-vocabulary-classifications.json");
const updateBaseline = process.argv.includes("--update-baseline");
const selfTest = process.argv.includes("--self-test");
const json = process.argv.includes("--json");

const ignoredDirs = new Set([
  ".git",
  ".claude",
  ".next",
  ".next-e2e",
  ".tmp",
  ".tmp-pack-smoke",
  ".data",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "output",
  "playwright-report",
  "test-results",
]);
const ignoredPathParts = [
  "/docs/conceptual-vocabulary-baseline.json",
  "/docs/governance-vocabulary-baseline.json",
  "/docs/governance-vocabulary-classifications.json",
  "/docs/vocabulary.registry.json",
  "/scripts/conceptual-vocabulary-guard.mjs",
  "/scripts/governance-scope-guard.mjs",
  "/package-lock.json",
];
const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".swift",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const maxFileBytes = 1_000_000;

const trackedPatterns = [
  { id: "ownerKind", regex: /\bownerKind\b/gu },
  { id: "ownerId", regex: /\bownerId\b/gu },
  { id: "owner_id", regex: /\bowner_id\b/gu },
  { id: "owner_field", regex: /(?:\bowner\b\s*[:?=]|\b["']owner["']\s*[:,])/gu },
  { id: "ownership_relation", regex: /\bownership\b/gu },
  { id: "tenant", regex: /\btenant\b/giu },
  { id: "tenantId", regex: /\btenantId\b/gu },
  { id: "tenant_id", regex: /\btenant_id\b/gu },
  { id: "profile", regex: /\bprofile\b/giu },
  { id: "profileId", regex: /\bprofileId\b/gu },
  { id: "profile_id", regex: /\bprofile_id\b/gu },
  { id: "companyId", regex: /\bcompanyId\b/gu },
  { id: "company_id", regex: /\bcompany_id\b/gu },
];

const allowedClassifications = new Set([
  "businessEntityIdentifier",
  "technicalIsolationIdentifier",
  "humanUserProfile",
  "domainProfile",
  "providerProfile",
  "behaviorProfile",
  "profileProjection",
  "legacySchemaReadOnly",
  "deterministicGeneratedArtifact",
  "governancePolicyReference",
  "externalProviderSchema",
]);

const requiredSnippets = [
  {
    file: "docs/adr/0027-governance-identity-scope-model.md",
    snippets: [
      "`tenant` is a technical isolation word only.",
      "Generic `owner`, `ownerId`, and `ownerKind` are prohibited as new authority",
      "`companyId` is a business relationship, not authority.",
      "Membership and hierarchy do not imply read access.",
      "The individual/local case is implicit and lightweight.",
    ],
  },
  {
    file: "docs/adr/0028-workspace-project-folder-manifest.md",
    snippets: [
      "`Workspace` is the isolated context.",
      "`Project` is the collaborable human work scope.",
      "The full `.claw/` directory is reserved for Workspace roots.",
      "`claw.project.json` is a clean v1 manifest",
      "A Finder copy of a project folder is usable but incomplete.",
    ],
  },
  {
    file: "docs/decision-map.md",
    snippets: [
      "Governance identity, stewardship, scopes, grants, restrictions, workspaces, projects, and folder manifests use the canonical Principal + Entity model",
      "scripts/governance-scope-guard.mjs",
    ],
  },
  {
    file: "docs/naming-style-guide.md",
    snippets: [
      "Governance words",
      "Do not add generic `ownerId`, `ownerKind`, or `tenantId` authority fields.",
    ],
  },
  {
    file: "docs/data-storage-boundary.md",
    snippets: [
      "Governance bindings",
      "Project folders carry",
      "`claw.project.json`, managed `AGENTS.md`, and `CLAUDE.md`",
    ],
  },
  {
    file: "docs/workspace.md",
    snippets: [
      "Workspace, Project, And Folder Boundary",
      "A project primary folder is not a",
      "workspace root.",
    ],
  },
];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function shouldIgnore(relativePath, entry) {
  if (entry?.isDirectory?.() && ignoredDirs.has(entry.name)) return true;
  const wrapped = `/${toPosix(relativePath)}`;
  return ignoredPathParts.some((part) => wrapped.endsWith(part) || wrapped.includes(part));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = toPosix(path.relative(rootDir, absolutePath));
    if (shouldIgnore(relativePath, entry)) continue;
    if (entry.isDirectory()) walk(absolutePath, out);
    else if (entry.isFile()) out.push(relativePath);
  }
  return out;
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function countMatches(text, regex) {
  regex.lastIndex = 0;
  let count = 0;
  while (regex.exec(text) !== null) count += 1;
  return count;
}

function collectCounts() {
  const byPattern = Object.fromEntries(trackedPatterns.map((pattern) => [pattern.id, {}]));
  for (const relativePath of walk(rootDir)) {
    const ext = path.extname(relativePath);
    if (!textExtensions.has(ext)) continue;
    const absolutePath = path.join(rootDir, relativePath);
    const stat = fs.statSync(absolutePath);
    if (stat.size > maxFileBytes) continue;
    let text;
    try {
      text = fs.readFileSync(absolutePath, "utf8");
    } catch {
      continue;
    }
    for (const pattern of trackedPatterns) {
      const count = countMatches(text, pattern.regex);
      if (count > 0) byPattern[pattern.id][relativePath] = count;
    }
  }
  return byPattern;
}

function sortedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedObject(value[key])]),
  );
}

function totalFor(patternCounts) {
  return Object.values(patternCounts).reduce((sum, count) => sum + count, 0);
}

function loadBaseline() {
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

function loadClassifications() {
  if (!fs.existsSync(classificationsPath)) return { schemaVersion: 1, entries: [] };
  return JSON.parse(fs.readFileSync(classificationsPath, "utf8"));
}

function validateClassifications(classifications, counts) {
  const errors = [];
  if (classifications.schemaVersion !== 1) errors.push("docs/governance-vocabulary-classifications.json schemaVersion must be 1");
  const seen = new Set();
  for (const [index, entry] of (classifications.entries ?? []).entries()) {
    const label = entry.id ?? `<entry ${index + 1}>`;
    for (const field of ["id", "path", "pattern", "classification", "rationale", "canonicalDoc", "maxOccurrences", "steward"]) {
      if (entry[field] === undefined || entry[field] === null || entry[field] === "") errors.push(`${label} is missing ${field}`);
    }
    if (entry.id && seen.has(entry.id)) errors.push(`${label} duplicates classification id ${entry.id}`);
    if (entry.id) seen.add(entry.id);
    if (!allowedClassifications.has(entry.classification)) errors.push(`${label} has invalid classification ${entry.classification}`);
    if (!trackedPatterns.some((pattern) => pattern.id === entry.pattern)) errors.push(`${label} has unknown pattern ${entry.pattern}`);
    if (!Number.isInteger(entry.maxOccurrences) || entry.maxOccurrences < 0) errors.push(`${label} maxOccurrences must be a non-negative integer`);
    if (entry.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(entry.expiresOn)) errors.push(`${label} expiresOn must use YYYY-MM-DD`);
    if (entry.path && !fs.existsSync(path.join(rootDir, entry.path))) errors.push(`${label} path does not exist: ${entry.path}`);
    if (entry.canonicalDoc && !fs.existsSync(path.join(rootDir, entry.canonicalDoc))) errors.push(`${label} canonicalDoc does not exist: ${entry.canonicalDoc}`);
    if (entry.classification === "deterministicGeneratedArtifact") {
      if (!entry.generatedFrom || !fs.existsSync(path.join(rootDir, entry.generatedFrom))) errors.push(`${label} deterministicGeneratedArtifact requires generatedFrom`);
      if (!entry.parityTest || !fs.existsSync(path.join(rootDir, entry.parityTest))) errors.push(`${label} deterministicGeneratedArtifact requires parityTest`);
    }
    const actual = counts[entry.pattern]?.[entry.path] ?? 0;
    if (Number.isInteger(entry.maxOccurrences) && actual !== entry.maxOccurrences) {
      errors.push(`${label} expected ${entry.maxOccurrences} ${entry.pattern} occurrence(s) in ${entry.path}, found ${actual}`);
    }
  }
  return errors;
}

function classificationAllowances(classifications) {
  const allowances = Object.fromEntries(trackedPatterns.map((pattern) => [pattern.id, {}]));
  for (const entry of classifications.entries ?? []) {
    if (!entry.pattern || !entry.path || !Number.isInteger(entry.maxOccurrences)) continue;
    allowances[entry.pattern][entry.path] = (allowances[entry.pattern][entry.path] ?? 0) + entry.maxOccurrences;
  }
  return allowances;
}

function subtractAllowances(counts, allowances) {
  const adjusted = Object.fromEntries(trackedPatterns.map((pattern) => [pattern.id, {}]));
  for (const pattern of trackedPatterns) {
    for (const [relativePath, count] of Object.entries(counts[pattern.id] ?? {})) {
      const remaining = count - (allowances[pattern.id]?.[relativePath] ?? 0);
      if (remaining > 0) adjusted[pattern.id][relativePath] = remaining;
    }
  }
  return adjusted;
}

function summaryFor(countsByPattern) {
  return Object.fromEntries(
    Object.entries(countsByPattern).map(([id, files]) => [id, { files: Object.keys(files).length, occurrences: totalFor(files) }]),
  );
}

function governanceDiagnostic(failure) {
  if (failure.includes("required governance snippet") || failure.endsWith(" is missing")) {
    return createDiagnostic("governance_scope_required_doc_missing", failure, {
      location: "docs/",
      suggestion: "Restore the required governance identity, workspace, or naming canon before trusting vocabulary counts.",
      safeNextStep: "Update the named governance doc, then rerun node scripts/governance-scope-guard.mjs.",
    });
  }
  if (failure.includes("classifications.json") || failure.includes("classification") || failure.includes("maxOccurrences")) {
    return createDiagnostic("governance_scope_classification_invalid", failure, {
      location: "docs/governance-vocabulary-classifications.json",
      suggestion: "Fix the classification row schema, allowed classification, exact count, steward, or evidence path.",
      safeNextStep: "Update docs/governance-vocabulary-classifications.json, then rerun node scripts/governance-scope-guard.mjs.",
    });
  }
  if (failure.includes("baseline update cannot increase governance debt")) {
    return createDiagnostic("governance_scope_baseline_increase_blocked", failure, {
      location: "docs/governance-vocabulary-baseline.json",
      suggestion: "Do not grow the baseline; remove the new vocabulary debt or classify it with exact rationale.",
      safeNextStep: "Remove the new occurrence or add a reviewed classification entry, then rerun the guard.",
    });
  }
  if (failure.includes("governance vocabulary debt")) {
    return createDiagnostic("governance_scope_debt_increase", failure, {
      location: "governance vocabulary scan",
      suggestion: "Remove the new authority/profile/isolation wording or classify it with exact count and rationale.",
      safeNextStep: "Fix the named file or add a reviewed classification entry, then rerun node scripts/governance-scope-guard.mjs.",
    });
  }
  if (failure.includes("baseline")) {
    return createDiagnostic("governance_scope_baseline_invalid", failure, {
      location: "docs/governance-vocabulary-baseline.json",
      suggestion: "Restore the baseline or run a reviewed shrink-only baseline update.",
      safeNextStep: "Run node scripts/governance-scope-guard.mjs --update-baseline only after confirming the debt shrank.",
    });
  }
  return createDiagnostic("governance_scope_guard_failed", failure, {
    location: "scripts/governance-scope-guard.mjs",
    suggestion: "Inspect the named governance file or vocabulary count before retrying.",
    safeNextStep: "Fix the reported governance issue, then rerun node scripts/governance-scope-guard.mjs.",
  });
}

function printGovernanceFailures(failures, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "governance scope guard failed:",
    diagnostics: failures.map(governanceDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function shrinkBaseline(existingBaseline, adjustedCounts) {
  const nextCounts = Object.fromEntries(trackedPatterns.map((pattern) => [pattern.id, {}]));
  const increases = [];
  for (const pattern of trackedPatterns) {
    const currentFiles = adjustedCounts[pattern.id] ?? {};
    const baselineFiles = existingBaseline.counts?.[pattern.id] ?? {};
    for (const [relativePath, count] of Object.entries(currentFiles)) {
      const allowed = baselineFiles[relativePath] ?? 0;
      if (count > allowed) increases.push(`${relativePath} would increase ${pattern.id}: ${count} current, ${allowed} baselined`);
      if (allowed > 0) nextCounts[pattern.id][relativePath] = Math.min(count, allowed);
    }
  }
  return { increases, nextCounts };
}

function runSelfTest() {
  const fixtureCounts = {
    ownerId: { "src/a.ts": 1 },
    tenantId: { "src/a.ts": 1 },
    profile: { "generated.ts": 2 },
    companyId: { "src/company.ts": 3 },
  };
  const ok = {
    schemaVersion: 1,
    entries: [
      { id: "company", path: "package.json", pattern: "companyId", classification: "businessEntityIdentifier", rationale: "self-test", canonicalDoc: "docs/adr/0027-governance-identity-scope-model.md", maxOccurrences: 0, steward: "clawjs" },
    ],
  };
  if (validateClassifications(ok, fixtureCounts).length !== 0) throw new Error("classification self-test expected valid fixture");
  const bad = {
    schemaVersion: 1,
    entries: [
      { id: "bad", path: "package.json", pattern: "ownerId", classification: "invalid", rationale: "self-test", canonicalDoc: "docs/adr/0027-governance-identity-scope-model.md", maxOccurrences: 0, steward: "clawjs" },
    ],
  };
  if (!validateClassifications(bad, fixtureCounts).some((error) => error.includes("invalid classification"))) throw new Error("classification self-test expected invalid classification failure");
  const allowances = classificationAllowances({
    schemaVersion: 1,
    entries: [{ id: "tenant", path: "src/a.ts", pattern: "tenantId", classification: "technicalIsolationIdentifier", rationale: "self-test", canonicalDoc: "docs/adr/0027-governance-identity-scope-model.md", maxOccurrences: 1, steward: "clawjs" }],
  });
  const adjusted = subtractAllowances(fixtureCounts, allowances);
  if ((adjusted.tenantId?.["src/a.ts"] ?? 0) !== 0) throw new Error("classification self-test expected allowance subtraction");
  const shrink = shrinkBaseline({ counts: { ownerId: {}, tenantId: {}, profile: {}, companyId: {} } }, fixtureCounts);
  if (!shrink.increases.some((entry) => entry.includes("ownerId"))) throw new Error("baseline self-test expected increase rejection");

  const chunks = [];
  printGovernanceFailures([
    "/Users/example/private/docs/decision-map.md is missing required governance snippet: token sk-test-secret-123456",
    "bad has invalid classification invalid",
    "src/a.ts adds governance vocabulary debt for ownerId: 1 current, 0 baselined",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "governance_scope_required_doc_missing",
    "governance_scope_classification_invalid",
    "governance_scope_debt_increase",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion:") || !output.includes("next:")) throw new Error("self-test missing guidance");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

if (selfTest) {
  runSelfTest();
  if (!json) console.log("governance scope guard self-test passed");
  process.exit(0);
}

const failures = [];

for (const requirement of requiredSnippets) {
  const absolutePath = path.join(rootDir, requirement.file);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${requirement.file} is missing`);
    continue;
  }
  const text = read(requirement.file);
  for (const snippet of requirement.snippets) {
    if (!text.includes(snippet)) failures.push(`${requirement.file} is missing required governance snippet: ${snippet}`);
  }
}

const counts = collectCounts();
const classifications = loadClassifications();
failures.push(...validateClassifications(classifications, counts));
const adjustedCounts = subtractAllowances(counts, classificationAllowances(classifications));
const summary = summaryFor(counts);
const adjustedSummary = summaryFor(adjustedCounts);

if (updateBaseline) {
  const existingBaseline = loadBaseline();
  if (!existingBaseline) {
    failures.push("docs/governance-vocabulary-baseline.json is missing. Cannot shrink baseline.");
  } else {
    const { increases, nextCounts } = shrinkBaseline(existingBaseline, adjustedCounts);
    failures.push(...increases.map((increase) => `baseline update cannot increase governance debt: ${increase}`));
    if (failures.length === 0) {
      const baseline = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        policy: "Current governance vocabulary debt may shrink without review. Any increase in a tracked path or any new tracked path fails scripts/governance-scope-guard.mjs unless the occurrence is removed or classified in docs/governance-vocabulary-classifications.json with exact counts and rationale.",
        trackedPatterns: trackedPatterns.map((pattern) => pattern.id),
        summary: summaryFor(nextCounts),
        counts: nextCounts,
      };
      fs.writeFileSync(baselinePath, `${JSON.stringify(sortedObject(baseline), null, 2)}\n`);
    }
  }
} else {
  const baseline = loadBaseline();
  if (!baseline) {
    failures.push("docs/governance-vocabulary-baseline.json is missing. Run node ./scripts/governance-scope-guard.mjs --update-baseline only after reviewing shrink-only debt.");
  } else {
    for (const pattern of trackedPatterns) {
      const currentFiles = adjustedCounts[pattern.id] ?? {};
      const baselineFiles = baseline.counts?.[pattern.id] ?? {};
      for (const [relativePath, count] of Object.entries(currentFiles)) {
        const allowed = baselineFiles[relativePath] ?? 0;
        if (count > allowed) {
          failures.push(`${relativePath} adds governance vocabulary debt for ${pattern.id}: ${count} current, ${allowed} baselined`);
        }
      }
    }
  }
}

const result = { failures, summary, adjustedSummary, baselineUpdated: updateBaseline };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (updateBaseline && failures.length === 0) console.log("governance scope baseline shrunk");
  if (failures.length) {
    printGovernanceFailures(failures);
  }
  console.log(`governance scope guard ${failures.length ? "failed" : "passed"}`);
}

if (failures.length) process.exit(1);
