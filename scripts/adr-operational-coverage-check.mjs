#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scriptRoot = path.resolve(new URL("..", import.meta.url).pathname);
const today = new Date().toISOString().slice(0, 10);
const allowedExemptions = new Set(["decisionMap", "guardrails", "surfaceParity", "cliInspect"]);
const requiredDecisionTensionFields = [
  "Prioritized axes",
  "Constrained axes",
  "Tradeoffs accepted",
  "Debt or pending evidence",
];

function parseArgs(argv) {
  const args = { root: scriptRoot, profile: null, selfTest: false, json: false, cli: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") args.root = path.resolve(argv[++index]);
    else if (arg === "--profile") args.profile = argv[++index];
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--cli") args.cli = true;
  }
  args.profile ??= fs.existsSync(path.join(args.root, "macos")) ? "clawix" : "claw";
  return args;
}

const options = parseArgs(process.argv.slice(2));
const rootDir = options.root;

function absolute(relativePath) {
  return path.join(rootDir, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function listFiles(relativeDir, predicate, output = []) {
  const dir = absolute(relativeDir);
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) listFiles(relativePath, predicate, output);
    else if (entry.isFile() && predicate(relativePath)) output.push(relativePath);
  }
  return output.sort();
}

function isAcceptedAdr(relativePath) {
  return /^Status:\s*accepted\b/im.test(read(relativePath));
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTarget(target) {
  return String(target ?? "").split("#")[0].replace(/^\.?\//, "");
}

function looksLikePath(value) {
  return /^(AGENTS|CLAUDE|CONSTITUTION)\.md$/u.test(value)
    || /^(docs|skills|scripts|packages|tests|qa|playbooks|apps|macos|ios|android|web|relay|runtime|mcp|database|audio|sessions|modules|content|monitor|execution|delegation|secrets|wiki|drive|memory)\//u.test(value)
    || /^[A-Za-z0-9._-]+\.json$/u.test(value)
    || /^[A-Za-z0-9._-]+\.md$/u.test(value)
    || /^[A-Za-z0-9._-]+\.mjs$/u.test(value)
    || value === "package.json";
}

function pathPart(value) {
  return String(value).trim().split(/\s+/u)[0];
}

function validateReferences(values, label, errors) {
  if (!Array.isArray(values) || values.length === 0) {
    errors.push(`${label} must be a non-empty array`);
    return;
  }
  for (const value of values) {
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push(`${label} contains an empty reference`);
      continue;
    }
    const candidate = normalizeTarget(pathPart(value));
    if (looksLikePath(candidate) && !exists(candidate)) errors.push(`${label} references missing path ${candidate}`);
  }
}

function headingSection(text, heading) {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(text);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^##\s+/im);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

function hasHeading(text, heading) {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  return pattern.test(text);
}

function hasSurfaceParityInAdr(relativePath) {
  const section = headingSection(read(relativePath), "Surface Parity");
  return section.includes("Human surface")
    && section.includes("Programmatic surface")
    && section.includes("Persistence")
    && section.includes("Validation");
}

function validateAcceptedAdrRequiredSections(relativePath, errors) {
  const text = read(relativePath);
  for (const heading of ["Performance Impact", "Decision Tensions"]) {
    if (!hasHeading(text, heading)) {
      errors.push(`${relativePath} is accepted but missing ## ${heading}`);
      continue;
    }
    if (headingSection(text, heading).trim().length === 0) {
      errors.push(`${relativePath} has an empty ## ${heading} section`);
    }
  }

  const tensions = headingSection(text, "Decision Tensions");
  for (const field of requiredDecisionTensionFields) {
    if (!tensions.includes(field)) {
      errors.push(`${relativePath} Decision Tensions must include ${field}`);
    }
  }
}

function decisionMapMentions(adr) {
  if (!exists("docs/decision-map.md")) return false;
  const map = read("docs/decision-map.md");
  const file = path.basename(adr);
  const stem = file.replace(/\.md$/u, "");
  const relativeDocsLink = adr.replace(/^docs\//u, "./");
  return map.includes(adr) || map.includes(relativeDocsLink) || map.includes(stem);
}

function mergeCoverage(defaults, coverage) {
  return {
    decisionMap: coverage?.decisionMap ?? defaults?.decisionMap,
    guardrails: coverage?.guardrails ?? defaults?.guardrails,
    humanSurface: coverage?.humanSurface ?? defaults?.humanSurface,
    programmaticSurface: coverage?.programmaticSurface ?? defaults?.programmaticSurface,
    persistence: coverage?.persistence ?? defaults?.persistence,
    cliSearch: coverage?.cliSearch ?? defaults?.cliSearch,
    cliInspect: coverage?.cliInspect ?? defaults?.cliInspect,
    exceptions: coverage?.exceptions ?? defaults?.exceptions,
  };
}

function validateManifest(manifest, errors) {
  if (manifest.version !== 1) errors.push("docs/adr-operational-coverage.manifest.json version must be 1");
  if (!manifest.exceptionsPath || !exists(manifest.exceptionsPath)) errors.push("ADR operational manifest must point to an existing exceptionsPath");
  if (!manifest.defaults || typeof manifest.defaults !== "object") errors.push("ADR operational manifest must declare defaults");
  validateReferences(manifest.defaults?.humanSurface, "manifest.defaults.humanSurface", errors);
  validateReferences(manifest.defaults?.programmaticSurface, "manifest.defaults.programmaticSurface", errors);
  validateReferences(manifest.defaults?.persistence, "manifest.defaults.persistence", errors);
  validateReferences(manifest.defaults?.guardrails, "manifest.defaults.guardrails", errors);
  const seen = new Set();
  for (const entry of manifest.acceptedAdrCoverage ?? []) {
    if (!entry.adr || !exists(entry.adr)) errors.push(`acceptedAdrCoverage entry references missing ADR ${entry.adr}`);
    if (seen.has(entry.adr)) errors.push(`duplicate acceptedAdrCoverage entry for ${entry.adr}`);
    seen.add(entry.adr);
  }
}

function validateExceptions(exceptions, errors) {
  if (exceptions.version !== 1) errors.push("docs/adr-operational-coverage-exceptions.json version must be 1");
  const byAdr = new Map();
  for (const entry of exceptions.entries ?? []) {
    const label = entry.adr || "<missing adr>";
    if (!entry.adr || !exists(entry.adr)) errors.push(`ADR operational exception references missing ADR ${label}`);
    if (entry.adr && byAdr.has(entry.adr)) errors.push(`duplicate ADR operational exception for ${entry.adr}`);
    if (!entry.reason || String(entry.reason).trim().length < 20) errors.push(`${label} exception must include a specific reason`);
    if (!entry.scope || /^(all|any|global|repo)$/iu.test(String(entry.scope).trim()) || String(entry.scope).trim().length < 10) {
      errors.push(`${label} exception scope is missing or too broad`);
    }
    if (!isDate(entry.reviewDate)) errors.push(`${label} exception reviewDate must be YYYY-MM-DD`);
    if (!isDate(entry.expiresAt)) errors.push(`${label} exception expiresAt must be YYYY-MM-DD`);
    if (isDate(entry.expiresAt) && entry.expiresAt < today) errors.push(`${label} exception expired on ${entry.expiresAt}`);
    if (!Array.isArray(entry.exempts) || entry.exempts.length === 0) errors.push(`${label} exception must declare scoped exempts`);
    for (const exemption of entry.exempts ?? []) {
      if (!allowedExemptions.has(exemption)) errors.push(`${label} exception has invalid exemption ${exemption}`);
    }
    if (entry.adr) byAdr.set(entry.adr, entry);
  }
  return byAdr;
}

function isExempt(exception, rule) {
  return exception?.exempts?.includes(rule) === true;
}

function loadInputs(errors) {
  for (const required of [
    "docs/decision-map.md",
    "docs/discoverability.registry.json",
    "docs/adr-operational-coverage.manifest.json",
  ]) {
    if (!exists(required)) errors.push(`missing ${required}`);
  }
  if (errors.length > 0) return null;
  const registry = readJson("docs/discoverability.registry.json");
  const manifest = readJson("docs/adr-operational-coverage.manifest.json");
  validateManifest(manifest, errors);
  const exceptions = manifest.exceptionsPath && exists(manifest.exceptionsPath)
    ? readJson(manifest.exceptionsPath)
    : { version: 1, entries: [] };
  const exceptionsByAdr = validateExceptions(exceptions, errors);
  return { registry, manifest, exceptionsByAdr };
}

function runClawCommand(command) {
  const trimmed = command.trim().replace(/^claw\s+/u, "");
  const args = trimmed.match(/(?:[^\s"]+|"[^"]*")+/gu)?.map((arg) => arg.replace(/^"|"$/gu, "")) ?? [];
  const local = path.join(scriptRoot, "packages/clawjs/bin/claw.mjs");
  const sibling = "/Users/trabajo/Desktop/clawjs/packages/clawjs/bin/claw.mjs";
  const bin = fs.existsSync(local) ? [process.execPath, [local]] : fs.existsSync(sibling) ? [process.execPath, [sibling]] : ["claw", []];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "adr-operational-claw-"));
  return spawnSync(bin[0], [...bin[1], ...args], {
    cwd: rootDir,
    env: { ...process.env, CLAW_DATA_DIR: dataDir, CLAW_HOME: dataDir },
    encoding: "utf8",
    timeout: 30000,
  });
}

function validateCliCoverage(coverage, registryEntry, label, errors) {
  if (!options.cli) return;
  for (const query of registryEntry.searchQueries ?? []) {
    const result = runClawCommand(`claw search "${query.query}" --json`);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status !== 0) {
      errors.push(`${label} CLI search failed for ${JSON.stringify(query.query)}: ${output.trim()}`);
      continue;
    }
    if (query.expectPath && !output.includes(query.expectPath)) {
      errors.push(`${label} CLI search ${JSON.stringify(query.query)} did not return ${query.expectPath}`);
    }
  }
  for (const inspect of coverage.cliInspect ?? []) {
    const command = typeof inspect === "string" ? inspect : inspect.command;
    if (!command) {
      errors.push(`${label} cliInspect entry is missing command`);
      continue;
    }
    const result = runClawCommand(command);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status !== 0) {
      errors.push(`${label} CLI inspect failed for ${command}: ${output.trim()}`);
      continue;
    }
    const expected = typeof inspect === "object" ? inspect.expectPath : null;
    if (expected && !output.includes(expected)) errors.push(`${label} CLI inspect ${command} did not include ${expected}`);
  }
}

function runCheck() {
  const errors = [];
  const inputs = loadInputs(errors);
  if (!inputs) return errors;
  const { registry, manifest, exceptionsByAdr } = inputs;
  const registryBySource = new Map((registry.artifacts ?? []).map((entry) => [entry.canonicalSource, entry]));
  const coverageByAdr = new Map((manifest.acceptedAdrCoverage ?? []).map((entry) => [entry.adr, entry]));
  const acceptedAdrs = listFiles("docs/adr", (file) => file.endsWith(".md") && !file.endsWith("TEMPLATE.md"))
    .filter(isAcceptedAdr);

  for (const adr of acceptedAdrs) {
    const label = adr;
    const exception = exceptionsByAdr.get(adr);
    const registryEntry = registryBySource.get(adr);
    const coverage = mergeCoverage(manifest.defaults, coverageByAdr.get(adr));

    validateAcceptedAdrRequiredSections(adr, errors);

    if (!registryEntry) {
      errors.push(`${label} is accepted but missing from docs/discoverability.registry.json`);
    } else {
      if (!/^adr:[a-z0-9][a-z0-9-]*$/u.test(registryEntry.canonicalName ?? "")) {
        errors.push(`${label} registry entry must declare adr:<semantic-id> canonicalName`);
      }
      if (!Array.isArray(registryEntry.searchQueries) || registryEntry.searchQueries.length === 0) {
        errors.push(`${label} registry entry must declare claw search coverage`);
      }
      if ((!registryEntry.guard || !exists(registryEntry.guard)) && !isExempt(exception, "guardrails")) {
        errors.push(`${label} registry guard is missing or does not exist`);
      }
    }

    if (!isExempt(exception, "decisionMap") && !decisionMapMentions(adr)) {
      errors.push(`${label} is accepted but missing from docs/decision-map.md`);
    }

    if (!isExempt(exception, "guardrails")) {
      validateReferences(coverage.guardrails, `${label} guardrails`, errors);
    }

    if (!isExempt(exception, "surfaceParity") && !hasSurfaceParityInAdr(adr)) {
      validateReferences(coverage.humanSurface, `${label} humanSurface`, errors);
      validateReferences(coverage.programmaticSurface, `${label} programmaticSurface`, errors);
      validateReferences(coverage.persistence, `${label} persistence`, errors);
    }

    if (!isExempt(exception, "cliInspect") && (!Array.isArray(coverage.cliInspect) || coverage.cliInspect.length === 0)) {
      errors.push(`${label} must declare a claw inspect route or a scoped exception`);
    }

    if (registryEntry) validateCliCoverage(coverage, registryEntry, label, errors);
  }

  for (const exceptionAdr of exceptionsByAdr.keys()) {
    if (!acceptedAdrs.includes(exceptionAdr)) errors.push(`${exceptionAdr} has an ADR operational exception but is not an accepted ADR`);
  }

  return errors;
}

function withFixture(files, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adr-operational-fixture-"));
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
  }
  const previousRoot = options.root;
  const previousCli = options.cli;
  Object.assign(options, { root: dir, cli: false });
  const previousCwdRoot = globalThis.__adrOperationalRoot;
  globalThis.__adrOperationalRoot = dir;
  try {
    return callback(dir);
  } finally {
    Object.assign(options, { root: previousRoot, cli: previousCli });
    globalThis.__adrOperationalRoot = previousCwdRoot;
  }
}

function runFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adr-operational-fixture-"));
  for (const [relativePath, body] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
  }
  const previousRoot = rootDir;
  return spawnSync(process.execPath, [new URL(import.meta.url).pathname, "--root", dir], { encoding: "utf8" });
}

function baseFixture(overrides = {}) {
  const manifest = {
    version: 1,
    exceptionsPath: "docs/adr-operational-coverage-exceptions.json",
    defaults: {
      decisionMap: "docs/decision-map.md",
      guardrails: ["scripts/guard.mjs"],
      humanSurface: ["docs/decision-map.md"],
      programmaticSurface: ["scripts/guard.mjs"],
      persistence: ["docs/discoverability.registry.json"],
      cliInspect: [{ command: "claw inspect why search --json" }],
    },
    acceptedAdrCoverage: [],
    ...overrides.manifest,
  };
  const registry = {
    version: 1,
    distanceBudget: 2,
    artifacts: [{
      id: "adr-test",
      kind: "adr",
      owner: "claw",
      canonicalSource: "docs/adr/0001-test.md",
      canonicalName: "adr:test",
      requiredEntrypoints: ["docs/decision-map.md"],
      discoveryTerms: ["ADR 0001 test"],
      searchQueries: [{ query: "ADR 0001 test", expectPath: "docs/adr/0001-test.md" }],
      guard: "scripts/guard.mjs",
      status: "enforced",
      reviewDate: "2026-08-18",
    }],
    ...overrides.registry,
  };
  return {
    "docs/adr/0001-test.md": "# ADR 0001: Test\n\nStatus: Accepted\n\n## Decision\n\nDo it.\n\n## Performance Impact\n\nStatic fixture only.\n\n## Decision Tensions\n\n- **Prioritized axes**: fixture coverage.\n- **Constrained axes**: production behavior.\n- **Tradeoffs accepted**: tiny test ADR.\n- **Debt or pending evidence**: none.\n",
    "docs/decision-map.md": "| Decision | Canonical document | Guardrail or validation |\n| --- | --- | --- |\n| Test | docs/adr/0001-test.md | scripts/guard.mjs |\n",
    "docs/discoverability.registry.json": `${JSON.stringify(registry, null, 2)}\n`,
    "docs/adr-operational-coverage.manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "docs/adr-operational-coverage-exceptions.json": `${JSON.stringify(overrides.exceptions ?? { version: 1, entries: [] }, null, 2)}\n`,
    "scripts/guard.mjs": "console.log('ok');\n",
    ...overrides.files,
  };
}

function runSelfTest() {
  const valid = runFixture(baseFixture());
  assert.equal(valid.status, 0, valid.stderr);

  const missingMap = runFixture(baseFixture({ files: { "docs/decision-map.md": "No rows\n" } }));
  assert.notEqual(missingMap.status, 0);
  assert.match(`${missingMap.stderr}${missingMap.stdout}`, /decision-map/);

  const missingRegistry = runFixture(baseFixture({ registry: { artifacts: [] } }));
  assert.notEqual(missingRegistry.status, 0);
  assert.match(`${missingRegistry.stderr}${missingRegistry.stdout}`, /discoverability\.registry/);

  const missingPerformanceImpact = runFixture(baseFixture({
    files: {
      "docs/adr/0001-test.md": "# ADR 0001: Test\n\nStatus: Accepted\n\n## Decision\n\nDo it.\n\n## Decision Tensions\n\n- **Prioritized axes**: fixture coverage.\n- **Constrained axes**: production behavior.\n- **Tradeoffs accepted**: tiny test ADR.\n- **Debt or pending evidence**: none.\n",
    },
  }));
  assert.notEqual(missingPerformanceImpact.status, 0);
  assert.match(`${missingPerformanceImpact.stderr}${missingPerformanceImpact.stdout}`, /Performance Impact/);

  const missingDecisionTensions = runFixture(baseFixture({
    files: {
      "docs/adr/0001-test.md": "# ADR 0001: Test\n\nStatus: Accepted\n\n## Decision\n\nDo it.\n\n## Performance Impact\n\nStatic fixture only.\n",
    },
  }));
  assert.notEqual(missingDecisionTensions.status, 0);
  assert.match(`${missingDecisionTensions.stderr}${missingDecisionTensions.stdout}`, /Decision Tensions/);

  const incompleteDecisionTensions = runFixture(baseFixture({
    files: {
      "docs/adr/0001-test.md": "# ADR 0001: Test\n\nStatus: Accepted\n\n## Decision\n\nDo it.\n\n## Performance Impact\n\nStatic fixture only.\n\n## Decision Tensions\n\n- **Prioritized axes**: fixture coverage.\n",
    },
  }));
  assert.notEqual(incompleteDecisionTensions.status, 0);
  assert.match(`${incompleteDecisionTensions.stderr}${incompleteDecisionTensions.stdout}`, /Constrained axes|Tradeoffs accepted|Debt or pending evidence/);

  const missingGuard = runFixture(baseFixture({ registry: { artifacts: [{ canonicalSource: "docs/adr/0001-test.md", canonicalName: "adr:test", searchQueries: [{ query: "ADR 0001 test", expectPath: "docs/adr/0001-test.md" }], guard: "scripts/missing.mjs" }] } }));
  assert.notEqual(missingGuard.status, 0);
  assert.match(`${missingGuard.stderr}${missingGuard.stdout}`, /guard/);

  const missingSurface = runFixture(baseFixture({ manifest: { defaults: { guardrails: ["scripts/guard.mjs"], humanSurface: [], programmaticSurface: ["scripts/guard.mjs"], persistence: ["docs/discoverability.registry.json"], cliInspect: [{ command: "claw inspect why search --json" }] } } }));
  assert.notEqual(missingSurface.status, 0);
  assert.match(`${missingSurface.stderr}${missingSurface.stdout}`, /humanSurface/);

  const missingInspect = runFixture(baseFixture({ manifest: { defaults: { guardrails: ["scripts/guard.mjs"], humanSurface: ["docs/decision-map.md"], programmaticSurface: ["scripts/guard.mjs"], persistence: ["docs/discoverability.registry.json"], cliInspect: [] } } }));
  assert.notEqual(missingInspect.status, 0);
  assert.match(`${missingInspect.stderr}${missingInspect.stdout}`, /cliInspect|inspect route/);

  const expiredException = runFixture(baseFixture({
    exceptions: { version: 1, entries: [{ adr: "docs/adr/0001-test.md", reason: "Temporary doc-only decision under review.", scope: "single fixture ADR", reviewDate: "2026-01-01", expiresAt: "2000-01-01", exempts: ["cliInspect"] }] },
  }));
  assert.notEqual(expiredException.status, 0);
  assert.match(`${expiredException.stderr}${expiredException.stdout}`, /expired/);

  const validException = runFixture(baseFixture({
    manifest: { defaults: { guardrails: ["scripts/guard.mjs"], humanSurface: ["docs/decision-map.md"], programmaticSurface: ["scripts/guard.mjs"], persistence: ["docs/discoverability.registry.json"], cliInspect: [] } },
    exceptions: { version: 1, entries: [{ adr: "docs/adr/0001-test.md", reason: "Temporary doc-only decision while inspect routing is intentionally not applicable.", scope: "single fixture ADR inspect route", reviewDate: "2026-01-01", expiresAt: "2099-01-01", exempts: ["cliInspect"] }] },
  }));
  assert.equal(validException.status, 0, validException.stderr);
}

if (options.selfTest) {
  runSelfTest();
  console.log("ADR operational coverage self-test passed");
  process.exit(0);
}

const errors = runCheck();
if (options.json) {
  console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
}
if (errors.length > 0) {
  if (!options.json) {
    console.error("ADR operational coverage check failed:");
    for (const error of errors) console.error(`- ${error}`);
  }
  process.exit(1);
}
if (!options.json) console.log("ADR operational coverage check passed");
