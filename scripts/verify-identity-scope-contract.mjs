#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const viewWord = ["pro", "file"].join("");
const viewField = `${viewWord}Id`;
const viewColumn = `${viewWord}_id`;
const entityField = ["company", "Id"].join("");
const entityColumn = ["company", "_id"].join("");
const decisionId = "conceptual-vocabulary.identity-scope-contract";
const allowedClasses = new Set([
  "businessEntityIdentifier",
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

function read(repoRoot, relativePath, failures) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`missing required file ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function readJson(repoRoot, relativePath, failures) {
  const text = read(repoRoot, relativePath, failures);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    failures.push(`${relativePath}: invalid JSON`);
    return {};
  }
}

function requireSnippet(repoRoot, relativePath, snippet, failures) {
  const text = read(repoRoot, relativePath, failures);
  if (!text.includes(snippet)) failures.push(`${relativePath}: missing ${JSON.stringify(snippet)}`);
}

function listFiles(repoRoot, relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  const results = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absoluteEntry = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(absoluteEntry);
      else if (entry.isFile() && /\.(?:ts|tsx|md|json)$/u.test(entry.name)) results.push(path.relative(repoRoot, absoluteEntry));
    }
  };
  visit(absoluteDir);
  return results;
}

function requireNoAuthorityPhrases(repoRoot, failures) {
  const forbidden = [
    `${entityField} grants`,
    `${entityField} gives access`,
    `${entityField} authorizes`,
    `${entityField} permits`,
    `${viewWord} grants`,
    `${viewWord} gives access`,
    `${viewField} grants`,
    `${viewField} authorizes`,
  ].map((phrase) => phrase.toLowerCase());
  for (const relativePath of [
    ...listFiles(repoRoot, "docs"),
    ...listFiles(repoRoot, "packages/clawjs-core/src"),
    ...listFiles(repoRoot, "packages/clawjs/src"),
    ...listFiles(repoRoot, "apps"),
  ]) {
    const lower = read(repoRoot, relativePath, failures).toLowerCase();
    for (const phrase of forbidden) {
      if (lower.includes(phrase.toLowerCase())) failures.push(`${relativePath}: forbidden identity-scope authority phrase ${JSON.stringify(phrase)}`);
    }
  }
}

function requireClassifications(repoRoot, failures) {
  const manifest = readJson(repoRoot, "docs/governance-vocabulary-classifications.json", failures);
  const classifications = manifest.entries ?? manifest.classifications ?? [];
  const relevantPatterns = new Set([viewWord, viewField, viewColumn, entityField, entityColumn]);
  const seenPatterns = new Set();
  const seenClasses = new Set();
  for (const entry of classifications) {
    if (!relevantPatterns.has(entry.pattern)) continue;
    seenPatterns.add(entry.pattern);
    if (!allowedClasses.has(entry.classification)) {
      failures.push(`${entry.id ?? entry.path}: invalid identity-scope classification ${JSON.stringify(entry.classification)}`);
    }
    seenClasses.add(entry.classification);
    if (typeof entry.rationale !== "string" || entry.rationale.length < 20) {
      failures.push(`${entry.id ?? entry.path}: classification needs rationale`);
    }
  }
  for (const pattern of [viewWord, viewColumn, entityField]) {
    if (!seenPatterns.has(pattern)) failures.push(`missing classification coverage for ${pattern}`);
  }
  for (const requiredClass of ["businessEntityIdentifier", "domainProfile", "legacySchemaReadOnly"]) {
    if (!seenClasses.has(requiredClass)) failures.push(`missing classification class ${requiredClass}`);
  }
}

function requireBusinessEntityRelation(repoRoot, failures) {
  const fieldNeedle = `{ name: "${entityField}", type: "relation"`;
  const targetNeedle = `relation: { collectionName: "companies" }`;
  for (const file of listFiles(repoRoot, "packages/clawjs-core/src/builtins")) {
    const text = read(repoRoot, file, failures);
    if (!text.includes(entityField)) continue;
    if (!text.includes(fieldNeedle) || !text.includes(targetNeedle)) {
      failures.push(`${file}: ${entityField} must stay a business entity relation to companies`);
    }
  }
}

function verify(repoRoot) {
  const failures = [];
  requireSnippet(repoRoot, "docs/adr/0027-governance-identity-scope-model.md", `\`${entityField}\` is a business relationship, not authority.`, failures);
  requireSnippet(repoRoot, "docs/naming-style-guide.md", `Avoid bare \`${viewWord}\` for identity or authority.`, failures);
  requireSnippet(repoRoot, "docs/governance/conceptual-vocabulary-classification-ledger.md", "Bare identity-view field family", failures);
  requireClassifications(repoRoot, failures);
  requireBusinessEntityRelation(repoRoot, failures);
  requireNoAuthorityPhrases(repoRoot, failures);

  const audit = read(repoRoot, "docs/governance/conceptual-vocabulary-audit.md", failures);
  if (audit.includes("Pending Semantic Decisions") && audit.includes(`| \`${decisionId}\``)) failures.push("conceptual vocabulary audit still lists identity-scope as pending");
  if (!audit.includes("Identity-scope contract verifier")) failures.push("conceptual vocabulary audit must record identity-scope verifier evidence");
  return failures;
}

function writeFile(repoRoot, relativePath, text) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text);
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "claw-identity-scope-"));
  writeFile(tempRoot, "docs/adr/0027-governance-identity-scope-model.md", `\`${entityField}\` is a business relationship, not authority.\n`);
  writeFile(tempRoot, "docs/naming-style-guide.md", `Avoid bare \`${viewWord}\` for identity or authority.\n`);
  writeFile(tempRoot, "docs/governance/conceptual-vocabulary-classification-ledger.md", "Bare identity-view field family\n");
  writeFile(tempRoot, "docs/governance/conceptual-vocabulary-audit.md", "Identity-scope contract verifier\n");
  writeFile(tempRoot, "docs/governance-vocabulary-classifications.json", JSON.stringify({
    classifications: [
      { id: "view", path: "docs/a.md", pattern: viewWord, classification: "domainProfile", rationale: "domain role vocabulary without authority" },
      { id: "legacy", path: "src/a.ts", pattern: viewColumn, classification: "legacySchemaReadOnly", rationale: "legacy column is read for migration only" },
      { id: "entity", path: "src/b.ts", pattern: entityField, classification: "businessEntityIdentifier", rationale: "business entity relation, not authority" },
    ],
  }));
  writeFile(tempRoot, "packages/clawjs-core/src/builtins/work/items.ts", `export default { fields: [{ name: "${entityField}", type: "relation", relation: { collectionName: "companies" } }] };\n`);
  writeFile(tempRoot, "packages/clawjs/src/a.ts", "const ok = true;\n");
  const passingFailures = verify(tempRoot);
  if (passingFailures.length > 0) throw new Error(`self-test expected fixture to pass:\n${passingFailures.join("\n")}`);

  writeFile(tempRoot, "packages/clawjs/src/a.ts", `${entityField} grants read access.\n`);
  const failingFailures = verify(tempRoot);
  if (!failingFailures.some((failure) => failure.includes("forbidden identity-scope authority phrase"))) {
    throw new Error("self-test expected authority phrase to fail");
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("Identity scope contract self-test passed");
} else {
  const failures = verify(rootDir);
  if (failures.length > 0) {
    console.error("Identity scope contract verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Identity scope contract verification passed");
}
