#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scriptRoot = path.resolve(new URL("..", import.meta.url).pathname);
const allowedKinds = new Set([
  "adr",
  "decision-map-row",
  "skill",
  "guardrail",
  "test-harness",
  "ui-governance",
  "surface-route",
  "docs-page",
  "validation-manifest",
  "code-comment-policy",
]);
const allowedStatuses = new Set(["enforced", "baseline", "external_pending"]);
const decisionLikeComment = /\b(?:CANON|DECISION|GUARDRAIL|POLICY|INVARIANT)\b\s*:/;
const canonicalCommentReference = /(?:docs\/|ADR\s*\d{4}|registry|manifest|scripts\/|tests?\/|SKILL\.md)/i;
const kindOrder = new Map([
  ["adr", 0],
  ["surface-route", 1],
  ["skill", 2],
  ["guardrail", 3],
  ["test-harness", 4],
  ["ui-governance", 5],
  ["docs-page", 6],
  ["decision-map-row", 7],
  ["code-comment-policy", 8],
]);

function parseArgs(argv) {
  const args = { root: scriptRoot, profile: null, command: "check", write: false, cli: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") args.root = path.resolve(argv[++index]);
    else if (arg === "--profile") args.profile = argv[++index];
    else if (arg === "--write") args.write = true;
    else if (arg === "--check") args.write = false;
    else if (arg === "--no-cli") args.cli = false;
    else if (arg === "--cli") args.cli = true;
    else if (arg === "--self-test") args.command = "self-test";
    else if (arg === "--golden-queries") args.command = "golden-queries";
    else if (["check", "audit", "generate", "golden-queries"].includes(arg)) args.command = arg;
  }
  args.profile ??= fs.existsSync(path.join(args.root, "macos")) ? "clawix" : "claw";
  return args;
}

const options = parseArgs(process.argv.slice(2));
const rootDir = options.root;
const registryPath = path.join(rootDir, "docs/discoverability.registry.json");
const baselinePath = path.join(rootDir, "docs/discoverability-baseline.json");
const routerPath = path.join(rootDir, "docs/discoverability.md");
const goldenQueriesPath = path.join(rootDir, "docs/discoverability-golden-queries.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function listFiles(relativeDir, predicate, output = []) {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(absoluteDir)) return output;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git", ".tmp", "build", ".next", ".build", "coverage"].includes(entry.name)) continue;
      listFiles(relativePath, predicate, output);
    } else if (entry.isFile() && predicate(relativePath)) {
      output.push(relativePath);
    }
  }
  return output.sort();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value) {
  return value
    .replace(/\.(md|mjs|js|ts|swift)$/u, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function firstMarkdownHeading(relativePath) {
  if (!exists(relativePath)) return null;
  const heading = read(relativePath).match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() ?? null;
}

function skillFrontmatter(relativePath) {
  if (!exists(relativePath)) return {};
  const frontmatter = read(relativePath).match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) return {};
  const result = {};
  for (const line of frontmatter[1].split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

function generatedDiscoveryTerms(source) {
  if (source.startsWith("docs/adr/")) {
    const heading = firstMarkdownHeading(source);
    const stem = path.basename(source, ".md");
    return [...new Set([heading, stem, `ADR ${stem.match(/\d{4}/)?.[0] ?? ""}`].filter(Boolean))];
  }
  if (source.startsWith("skills/")) {
    const dir = path.basename(path.dirname(source));
    const fm = skillFrontmatter(source);
    return [...new Set([fm.name, dir, fm.description].filter(Boolean))].slice(0, 3);
  }
  const stem = path.basename(source, path.extname(source));
  return [stem, titleCase(stem)].filter(Boolean);
}

function generatedQuery(source, terms) {
  if (source.startsWith("docs/adr/")) return terms[0] ?? path.basename(source, ".md");
  if (source.startsWith("skills/")) return path.basename(path.dirname(source));
  return path.basename(source, path.extname(source));
}

function normalizeTarget(target) {
  return target.split("#")[0].replace(/^\.?\//, "");
}

function targetTokens(target) {
  const normalized = normalizeTarget(target);
  const parsed = path.parse(normalized);
  const tokens = new Set([normalized, path.basename(normalized)]);
  if (parsed.dir.includes("skills") && parsed.name === "SKILL") tokens.add(path.basename(parsed.dir));
  if (parsed.ext === ".md" || parsed.ext === ".json" || parsed.ext === ".mjs") tokens.add(parsed.name);
  return [...tokens].filter(Boolean);
}

function resolveMention(fromRelativePath, mention) {
  const clean = normalizeTarget(mention);
  if (!clean || clean.startsWith("http") || clean.startsWith("mailto:")) return null;
  const candidates = [];
  if (/^(AGENTS|CLAUDE|CONSTITUTION)\.md$/u.test(clean) || /^(docs|skills|scripts|packages|tests|qa|playbooks)\//u.test(clean)) {
    candidates.push(clean);
  }
  candidates.push(path.normalize(path.join(path.dirname(fromRelativePath), clean)).split(path.sep).join("/"));
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function mentionedFiles(relativePath) {
  if (!exists(relativePath)) return [];
  const text = read(relativePath);
  const mentions = new Set();
  const patterns = [
    /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
    /`([^`\n]+\.(?:md|json|mjs|sh|ts|swift))`/g,
    /\b((?:docs|skills|scripts|packages|tests|qa|playbooks)\/[A-Za-z0-9._/@+-][A-Za-z0-9._/@+/\-]*\.(?:md|json|mjs|sh|ts|swift))\b/g,
    /\b((?:AGENTS|CLAUDE|CONSTITUTION)\.md)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const resolved = resolveMention(relativePath, match[1]);
      if (resolved) mentions.add(resolved);
    }
  }
  return [...mentions];
}

function containsTarget(relativePath, target) {
  if (!exists(relativePath)) return false;
  const text = read(relativePath);
  return targetTokens(target).some((token) => text.includes(token));
}

function routeDistance(fromRelativePath, targetRelativePath, maxDistance) {
  if (fromRelativePath === targetRelativePath) return 0;
  if (!exists(fromRelativePath) || !exists(targetRelativePath)) return Infinity;
  if (containsTarget(fromRelativePath, targetRelativePath)) return 1;
  const queue = [[fromRelativePath, 0]];
  const seen = new Set([fromRelativePath]);
  while (queue.length > 0) {
    const [current, distance] = queue.shift();
    if (distance >= maxDistance) continue;
    for (const next of mentionedFiles(current)) {
      if (seen.has(next)) continue;
      if (next === targetRelativePath || containsTarget(next, targetRelativePath)) return distance + 1;
      seen.add(next);
      queue.push([next, distance + 1]);
    }
  }
  return Infinity;
}

function inventory() {
  const adr = listFiles("docs/adr", (file) => file.endsWith(".md") && !file.endsWith("TEMPLATE.md"));
  const skills = listFiles("skills", (file) => file.endsWith("/SKILL.md"));
  const guards = listFiles("scripts", (file) => {
    const name = path.basename(file);
    return /\.(mjs|js)$/u.test(name) && (
      name.includes("check") ||
      name.includes("guard") ||
      name.startsWith("verify-") ||
      name.endsWith(".test.mjs")
    );
  });
  return { adr, skills, guards, all: [...adr, ...skills, ...guards] };
}

function generatedKind(source) {
  if (source.startsWith("docs/adr/")) {
    if (source.includes("surface-route")) return "surface-route";
    if (source.includes("interface-governance")) return "ui-governance";
    return "adr";
  }
  if (source.startsWith("skills/")) return "skill";
  if (/\.test\.mjs$/u.test(source) || source.includes("harness")) return "test-harness";
  if (path.basename(source).startsWith("ui_")) return "ui-governance";
  return "guardrail";
}

function generatedGuard(source) {
  if (source.startsWith("skills/")) return exists("scripts/skills-check.mjs") ? "scripts/skills-check.mjs" : "scripts/discoverability-check.mjs";
  if (source.startsWith("docs/adr/") && source.includes("surface-route") && exists("scripts/surface-route-graph-guard.mjs")) return "scripts/surface-route-graph-guard.mjs";
  if (source.startsWith("scripts/")) return source;
  return "scripts/discoverability-check.mjs";
}

function generatedEntrypoints(source) {
  const entrypoints = ["AGENTS.md", "docs/discoverability.md"];
  if (exists("CLAUDE.md")) entrypoints.splice(1, 0, "CLAUDE.md");
  if (source.startsWith("docs/adr/")) {
    if (exists("CONSTITUTION.md")) entrypoints.push("CONSTITUTION.md");
    if (exists("docs/decision-map.md")) entrypoints.push("docs/decision-map.md");
  } else if (source.startsWith("scripts/")) {
    if (exists("docs/decision-map.md")) entrypoints.push("docs/decision-map.md");
  }
  return [...new Set(entrypoints.filter(exists))];
}

function generatedArtifact(source, profile) {
  const terms = generatedDiscoveryTerms(source);
  const query = generatedQuery(source, terms);
  const idPrefix = source.startsWith("docs/adr/")
    ? "adr"
    : source.startsWith("skills/")
      ? "skill"
      : "guard";
  return {
    id: `${idPrefix}-${slug(source.replace(/\/SKILL\.md$/u, "").replace(/\.(md|mjs|js)$/u, ""))}`,
    kind: generatedKind(source),
    owner: profile === "clawix" ? "clawix" : "claw",
    canonicalSource: source,
    requiredEntrypoints: generatedEntrypoints(source),
    discoveryTerms: terms,
    searchQueries: [{ query, expectPath: source }],
    guard: generatedGuard(source),
    status: "enforced",
    reviewDate: "2026-08-18",
  };
}

function mergeArrays(generated, existing) {
  return [...new Set([...(generated ?? []), ...(existing ?? [])].filter(Boolean))];
}

function mergeArtifact(generated, existing) {
  if (!existing) return generated;
  return {
    ...generated,
    ...existing,
    requiredEntrypoints: mergeArrays(generated.requiredEntrypoints, existing.requiredEntrypoints).filter(exists),
    discoveryTerms: mergeArrays(generated.discoveryTerms, existing.discoveryTerms),
    searchQueries: existing.searchQueries?.length ? existing.searchQueries : generated.searchQueries,
    inspect: existing.inspect,
    guard: existing.guard ?? generated.guard,
    reviewDate: existing.reviewDate ?? generated.reviewDate,
  };
}

function sortArtifacts(artifacts) {
  return artifacts.sort((a, b) => {
    const kindDelta = (kindOrder.get(a.kind) ?? 99) - (kindOrder.get(b.kind) ?? 99);
    if (kindDelta !== 0) return kindDelta;
    return a.canonicalSource.localeCompare(b.canonicalSource) || a.id.localeCompare(b.id);
  });
}

function expectedRegistry(existingRegistry = {}, profile = options.profile) {
  const generated = inventory().all.map((source) => generatedArtifact(source, profile));
  const existingBySource = new Map();
  for (const artifact of existingRegistry.artifacts ?? []) {
    if (!existingBySource.has(artifact.canonicalSource)) existingBySource.set(artifact.canonicalSource, artifact);
  }
  const generatedSources = new Set(generated.map((artifact) => artifact.canonicalSource));
  const merged = generated.map((artifact) => mergeArtifact(artifact, existingBySource.get(artifact.canonicalSource)));
  const extras = (existingRegistry.artifacts ?? []).filter((artifact) => !generatedSources.has(artifact.canonicalSource));
  return {
    version: 1,
    distanceBudget: existingRegistry.distanceBudget ?? 2,
    description: existingRegistry.description ?? "Machine-readable discovery routes for durable meta-code. Routers route, ADR/docs decide, skills/playbooks execute, and checks enforce.",
    artifacts: sortArtifacts([...merged, ...extras]),
  };
}

function expectedBaseline(existingBaseline = {}) {
  return {
    version: 1,
    createdAt: existingBaseline.createdAt ?? "2026-05-18",
    description: existingBaseline.description ?? "Expiring baseline for exceptional pre-existing meta-code that cannot yet be fully routed. The normal target is an empty baseline.",
    entries: [],
  };
}

function renderRouter(registry, profile) {
  const title = profile === "clawix" ? "Clawix Discoverability Router" : "ClawJS Discoverability Router";
  const rows = registry.artifacts.map((artifact) => {
    const source = artifact.canonicalSource;
    const canonicalName = artifact.canonicalName ?? "";
    const terms = (artifact.discoveryTerms ?? []).join(", ");
    const guard = artifact.guard ?? "";
    const sourceCell = source.startsWith("docs/")
      ? `[${source}](/${source.slice("docs/".length).replace(/\.md$/, "")})`
      : `\`${source}\``;
    return `| \`${artifact.id}\` | ${artifact.kind} | ${canonicalName ? `\`${canonicalName}\`` : ""} | ${sourceCell} | ${terms} | \`${guard}\` |`;
  }).join("\n");
  return `# ${title}

This generated router lists the durable meta-code routes enforced by
\`docs/discoverability.registry.json\`. Edit the registry, then regenerate this
file; do not hand-maintain this table.

| Artifact | Kind | Canonical name | Canonical source | Discovery terms | Guard |
| --- | --- | --- | --- | --- | --- |
${rows}
`;
}

function loadCurrent() {
  return {
    registry: fs.existsSync(registryPath) ? readJson(registryPath) : {},
    baseline: fs.existsSync(baselinePath) ? readJson(baselinePath) : {},
    router: fs.existsSync(routerPath) ? fs.readFileSync(routerPath, "utf8") : "",
  };
}

function generatedState() {
  const current = loadCurrent();
  const registry = expectedRegistry(current.registry, options.profile);
  const baseline = expectedBaseline(current.baseline);
  const router = renderRouter(registry, options.profile);
  return { registry, baseline, router };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function runGenerate(write) {
  const expected = generatedState();
  const current = loadCurrent();
  const diffs = [];
  if (stableJson(current.registry) !== stableJson(expected.registry)) diffs.push("docs/discoverability.registry.json");
  if (stableJson(current.baseline) !== stableJson(expected.baseline)) diffs.push("docs/discoverability-baseline.json");
  if (current.router !== expected.router) diffs.push("docs/discoverability.md");
  if (write) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    writeJson(registryPath, expected.registry);
    writeJson(baselinePath, expected.baseline);
    fs.writeFileSync(routerPath, expected.router);
    console.log(`discoverability generated ${diffs.length} file(s)`);
    return [];
  }
  return diffs.map((file) => `${file} is not generated from current artifacts`);
}

function validateRegistry(registry, errors) {
  if (registry.version !== 1) errors.push("docs/discoverability.registry.json version must be 1");
  if (!Number.isInteger(registry.distanceBudget) || registry.distanceBudget < 1) errors.push("discoverability distanceBudget must be a positive integer");
  const ids = new Set();
  const sources = new Set();
  for (const artifact of registry.artifacts ?? []) {
    const label = artifact.id || "<missing id>";
    if (!artifact.id) errors.push("registry artifact is missing id");
    if (ids.has(artifact.id)) errors.push(`duplicate registry artifact id ${artifact.id}`);
    ids.add(artifact.id);
    if (!allowedKinds.has(artifact.kind)) errors.push(`${label} has invalid kind ${artifact.kind}`);
    if (!["claw", "clawix", "external"].includes(artifact.owner)) errors.push(`${label} has invalid owner ${artifact.owner}`);
    if (!artifact.canonicalSource || !exists(artifact.canonicalSource)) errors.push(`${label} canonicalSource is missing or does not exist: ${artifact.canonicalSource}`);
    if (artifact.canonicalSource) sources.add(artifact.canonicalSource);
    if (artifact.canonicalName !== undefined && typeof artifact.canonicalName !== "string") errors.push(`${label} canonicalName must be a string when present`);
    if (artifact.canonicalSource?.startsWith("docs/adr/") && !/^adr:[a-z0-9][a-z0-9-]*$/u.test(artifact.canonicalName ?? "")) {
      errors.push(`${label} ADR canonicalName must use adr:<semantic-id>`);
    }
    if (!allowedStatuses.has(artifact.status)) errors.push(`${label} has invalid status ${artifact.status}`);
    if (!isDate(artifact.reviewDate)) errors.push(`${label} reviewDate must be YYYY-MM-DD`);
    if (!artifact.guard || !exists(artifact.guard)) errors.push(`${label} guard is missing or does not exist: ${artifact.guard}`);
    if (!Array.isArray(artifact.requiredEntrypoints) || artifact.requiredEntrypoints.length === 0) errors.push(`${label} must declare requiredEntrypoints`);
    if (!Array.isArray(artifact.discoveryTerms) || artifact.discoveryTerms.length === 0) errors.push(`${label} must declare discoveryTerms`);
    if (!Array.isArray(artifact.searchQueries) || artifact.searchQueries.length === 0) errors.push(`${label} must declare searchQueries`);
    for (const entrypoint of artifact.requiredEntrypoints ?? []) {
      if (!exists(entrypoint)) {
        errors.push(`${label} required entrypoint does not exist: ${entrypoint}`);
        continue;
      }
      const distance = routeDistance(entrypoint, artifact.canonicalSource, registry.distanceBudget);
      if (distance > registry.distanceBudget) errors.push(`${label} is not reachable from ${entrypoint} within ${registry.distanceBudget} hops`);
    }
    for (const query of artifact.searchQueries ?? []) {
      if (!query.query || !query.expectPath) errors.push(`${label} searchQueries must include query and expectPath`);
      if (query.expectPath && !exists(query.expectPath)) errors.push(`${label} search expectPath does not exist: ${query.expectPath}`);
      if (query.query && query.expectPath && exists(query.expectPath)) {
        const searchable = [
          artifact.id,
          artifact.canonicalName,
          artifact.canonicalSource,
          ...(artifact.discoveryTerms ?? []),
          query.expectPath,
          read(query.expectPath),
        ].filter(Boolean).join("\n").toLowerCase();
        for (const term of query.query.toLowerCase().split(/\s+/).filter(Boolean)) {
          if (!searchable.includes(term)) errors.push(`${label} search query ${JSON.stringify(query.query)} is not represented in ${query.expectPath}`);
        }
      }
    }
  }
  for (const source of inventory().all) {
    if (!sources.has(source)) errors.push(`${source} is missing from docs/discoverability.registry.json`);
  }
}

function validateBaseline(baseline, errors) {
  if (baseline.version !== 1) errors.push("docs/discoverability-baseline.json version must be 1");
  const seen = new Set();
  for (const entry of baseline.entries ?? []) {
    const label = entry.id || "<missing baseline id>";
    if (!entry.id) errors.push("baseline entry is missing id");
    if (!entry.owner) errors.push(`${label} is missing owner`);
    if (!entry.reason) errors.push(`${label} is missing reason`);
    if (!isDate(entry.reviewDate)) errors.push(`${label} reviewDate must be YYYY-MM-DD`);
    if (!isDate(entry.expiresAt)) errors.push(`${label} expiresAt must be YYYY-MM-DD`);
    if (isDate(entry.expiresAt) && entry.expiresAt < new Date().toISOString().slice(0, 10)) errors.push(`${label} is expired`);
    if (!Array.isArray(entry.artifacts) || entry.artifacts.length === 0) errors.push(`${label} must freeze at least one artifact`);
    if (entry.frozenCount !== entry.artifacts?.length) errors.push(`${label} frozenCount must equal artifacts length`);
    const sorted = [...(entry.artifacts ?? [])].sort();
    if (JSON.stringify(sorted) !== JSON.stringify(entry.artifacts ?? [])) errors.push(`${label} artifacts must be sorted`);
    for (const artifact of entry.artifacts ?? []) {
      if (seen.has(artifact)) errors.push(`baseline artifact is listed twice: ${artifact}`);
      seen.add(artifact);
      if (!exists(artifact)) errors.push(`${label} baseline artifact does not exist: ${artifact}`);
    }
  }
  return seen;
}

function validateAdrCoverage(registry, baselineArtifacts, errors) {
  const registered = new Set((registry.artifacts ?? []).map((artifact) => artifact.canonicalSource));
  const decisionMap = exists("docs/decision-map.md") ? read("docs/decision-map.md") : "";
  for (const adr of listFiles("docs/adr", (file) => file.endsWith(".md") && !file.endsWith("TEMPLATE.md")).sort()) {
    if (!registered.has(adr) && !baselineArtifacts.has(adr)) errors.push(`${adr} is not registered in discoverability.registry.json or discoverability-baseline.json`);
    const relativeDocsLink = adr.replace(/^docs\//, "./");
    const routerMentions = exists("docs/discoverability.md") && read("docs/discoverability.md").includes(adr);
    if (registered.has(adr) && !decisionMap.includes(adr) && !decisionMap.includes(relativeDocsLink) && !routerMentions) {
      errors.push(`${adr} is registered but missing from docs/decision-map.md or docs/discoverability.md`);
    }
  }
}

function validateSkillFrontmatter(registry, errors) {
  for (const artifact of registry.artifacts ?? []) {
    if (artifact.kind !== "skill") continue;
    const text = read(artifact.canonicalSource);
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatter) {
      errors.push(`${artifact.canonicalSource} is missing YAML frontmatter`);
      continue;
    }
    for (const field of ["name:", "description:", "keywords:"]) {
      if (!frontmatter[1].includes(field)) errors.push(`${artifact.canonicalSource} frontmatter is missing ${field}`);
    }
  }
}

function validateRouter(registry, errors) {
  if (!exists("docs/discoverability.md")) {
    errors.push("missing docs/discoverability.md");
    return;
  }
  const router = read("docs/discoverability.md");
  for (const artifact of registry.artifacts ?? []) {
    if (!router.includes(artifact.id) || !router.includes(artifact.canonicalSource)) {
      errors.push(`docs/discoverability.md is missing ${artifact.id}`);
    }
  }
}

function validateDecisionLikeComments(errors) {
  const files = [
    ...listFiles("packages", (file) => /\.(ts|tsx|js|mjs|swift)$/u.test(file)),
    ...listFiles("scripts", (file) => /\.(mjs|js)$/u.test(file)),
  ];
  for (const file of files) {
    const lines = read(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("//") && !trimmed.startsWith("*")) return;
      if (decisionLikeComment.test(trimmed) && !canonicalCommentReference.test(trimmed)) {
        errors.push(`${file}:${index + 1} has decision-like comment without canonical reference`);
      }
    });
  }
}

function flattenJson(value) {
  return JSON.stringify(value);
}

function commandToArgs(command) {
  const trimmed = command.trim().replace(/^claw\s+/u, "");
  const result = [];
  let current = "";
  let quote = null;
  for (const char of trimmed) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (/\s/u.test(char)) {
      if (current) {
        result.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) result.push(current);
  return result;
}

function clawBin() {
  const sourceRunner = path.join(scriptRoot, "scripts/claw-source-runner.mjs");
  if (fs.existsSync(sourceRunner)) return { command: process.execPath, prefix: ["--import", "tsx", sourceRunner] };
  const local = path.join(scriptRoot, "packages/clawjs/bin/claw.mjs");
  const sibling = "/Users/trabajo/Desktop/clawjs/packages/clawjs/bin/claw.mjs";
  if (fs.existsSync(local)) return { command: process.execPath, prefix: [local] };
  if (fs.existsSync(sibling)) return { command: process.execPath, prefix: [sibling] };
  return { command: "claw", prefix: [] };
}

function runClaw(args, cwd, env, attempts = 3) {
  const bin = clawBin();
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = spawnSync(bin.command, [...bin.prefix, ...args], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 30000,
    });
    last = result;
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.status === 0 && !output.includes("database is locked")) return result;
    if (!output.includes("database is locked")) return result;
  }
  return last;
}

function validateCli(registry, errors) {
  if (!options.cli) return;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-discoverability-"));
  const env = { ...process.env, CLAW_DATA_DIR: dataDir, CLAW_HOME: dataDir };
  for (const artifact of registry.artifacts ?? []) {
    for (const query of artifact.searchQueries ?? []) {
      const result = runClaw(["search", "query", query.query, "--json"], rootDir, env);
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      if (result.status !== 0) {
        errors.push(`${artifact.id} CLI search failed for ${JSON.stringify(query.query)}: ${output.trim()}`);
        continue;
      }
      if (!flattenJson(JSON.parse(result.stdout)).includes(query.expectPath)) {
        errors.push(`${artifact.id} CLI search ${JSON.stringify(query.query)} did not return ${query.expectPath}`);
      }
    }
    for (const inspect of artifact.inspect ?? []) {
      const result = runClaw(commandToArgs(inspect.command), rootDir, env);
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      if (result.status !== 0) {
        errors.push(`${artifact.id} CLI inspect failed for ${inspect.command}: ${output.trim()}`);
        continue;
      }
      const flattened = flattenJson(JSON.parse(result.stdout));
      if (inspect.expectPath && !flattened.includes(inspect.expectPath)) errors.push(`${artifact.id} inspect did not include ${inspect.expectPath}`);
      if (inspect.expectRoute && !flattened.includes(inspect.expectRoute)) errors.push(`${artifact.id} inspect did not include route ${inspect.expectRoute}`);
    }
  }
}

function validateGoldenQueries(errors) {
  if (!fs.existsSync(goldenQueriesPath)) return;
  const fixture = readJson(goldenQueriesPath);
  if (fixture.version !== 1) errors.push("docs/discoverability-golden-queries.json version must be 1");
  if (!Array.isArray(fixture.queries) || fixture.queries.length === 0) {
    errors.push("docs/discoverability-golden-queries.json must declare queries");
    return;
  }
  const ids = new Set();
  for (const query of fixture.queries) {
    const label = query.id || "<missing golden query id>";
    if (!query.id) errors.push("golden query is missing id");
    if (query.id && ids.has(query.id)) errors.push(`duplicate golden query id ${query.id}`);
    if (query.id) ids.add(query.id);
    if (!query.query || typeof query.query !== "string") errors.push(`${label} must declare query`);
    if (!Array.isArray(query.domains) || query.domains.length === 0) errors.push(`${label} must declare domains`);
    if (!query.expectSource || typeof query.expectSource !== "string") errors.push(`${label} must declare expectSource`);
    if (!query.expectType || typeof query.expectType !== "string") errors.push(`${label} must declare expectType`);
    if (!query.expectResourceId || typeof query.expectResourceId !== "string") errors.push(`${label} must declare expectResourceId`);
    if (!Number.isInteger(query.maxRank) || query.maxRank < 1) errors.push(`${label} maxRank must be a positive integer`);
  }
  if (!options.cli) return;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-golden-discoverability-"));
  const env = { ...process.env, CLAW_DATA_DIR: dataDir, CLAW_HOME: dataDir };
  for (const query of fixture.queries) {
    if (!query.query || !query.expectSource || !query.expectType || !query.expectResourceId || !Number.isInteger(query.maxRank)) continue;
    const domains = query.domains.join(",");
    const limit = String(Math.max(5, query.maxRank));
    const result = runClaw(["search", "query", query.query, "--domains", domains, "--data-dir", dataDir, "--json", "--limit", limit], rootDir, env);
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.status !== 0) {
      errors.push(`${query.id} golden query failed for ${JSON.stringify(query.query)}: ${output.trim()}`);
      continue;
    }
    const payload = JSON.parse(result.stdout);
    const results = Array.isArray(payload.data?.results) ? payload.data.results : [];
    const rank = results.findIndex((entry) => (
      entry.source === query.expectSource &&
      entry.type === query.expectType &&
      entry.resourceId === query.expectResourceId
    ));
    if (rank < 0) {
      errors.push(`${query.id} golden query ${JSON.stringify(query.query)} did not return ${query.expectSource}/${query.expectType}/${query.expectResourceId} in top ${limit}`);
    } else if (rank + 1 > query.maxRank) {
      errors.push(`${query.id} golden query ${JSON.stringify(query.query)} returned ${query.expectResourceId} at rank ${rank + 1}, expected <= ${query.maxRank}`);
    }
  }
}

function runGoldenQueries() {
  const errors = [];
  const previousCli = options.cli;
  options.cli = true;
  validateGoldenQueries(errors);
  options.cli = previousCli;
  return errors;
}

function runCheck() {
  const errors = [];
  if (!fs.existsSync(registryPath)) errors.push("missing docs/discoverability.registry.json");
  if (!fs.existsSync(baselinePath)) errors.push("missing docs/discoverability-baseline.json");
  if (errors.length > 0) return errors;
  const registry = readJson(registryPath);
  const baseline = readJson(baselinePath);
  validateRegistry(registry, errors);
  const baselineArtifacts = validateBaseline(baseline, errors);
  validateAdrCoverage(registry, baselineArtifacts, errors);
  validateSkillFrontmatter(registry, errors);
  validateRouter(registry, errors);
  validateDecisionLikeComments(errors);
  validateCli(registry, errors);
  validateGoldenQueries(errors);
  return errors;
}

function runAudit() {
  const registry = fs.existsSync(registryPath) ? readJson(registryPath) : { artifacts: [] };
  const registered = new Set((registry.artifacts ?? []).map((artifact) => artifact.canonicalSource));
  return inventory().all.filter((source) => !registered.has(source));
}

function runSelfTest() {
  assert.equal(isDate("2026-05-18"), true);
  assert.equal(isDate("18-05-2026"), false);
  assert.equal(targetTokens("skills/docs-alignment-update/SKILL.md").includes("docs-alignment-update"), true);
  assert.equal(decisionLikeComment.test("// DECISION: keep this"), true);
  assert.equal(canonicalCommentReference.test("// DECISION: see docs/adr/0017-discoverability-and-meta-code-routing.md"), true);
  assert.deepEqual(commandToArgs("claw search query \"surface route graph\" --json"), ["search", "query", "surface route graph", "--json"]);
  const errors = [];
  validateRegistry({
    version: 1,
    distanceBudget: 2,
    artifacts: [{
      id: "bad",
      kind: "adr",
      owner: options.profile === "clawix" ? "clawix" : "claw",
      canonicalSource: "docs/adr/missing.md",
      requiredEntrypoints: ["AGENTS.md"],
      discoveryTerms: ["bad"],
      searchQueries: [{ query: "bad", expectPath: "docs/adr/missing.md" }],
      guard: "scripts/missing.mjs",
      status: "enforced",
      reviewDate: "2026-05-18",
    }],
  }, errors);
  assert.equal(errors.some((error) => error.includes("canonicalSource")), true);
  assert.equal(errors.some((error) => error.includes("guard")), true);
}

if (options.command === "self-test") {
  runSelfTest();
  console.log("discoverability check self-test passed");
  process.exit(0);
}

if (options.command === "generate") {
  const errors = runGenerate(options.write);
  if (errors.length > 0) {
    console.error("discoverability generation check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("discoverability generation check passed");
  process.exit(0);
}

if (options.command === "audit") {
  const missing = runAudit();
  if (missing.length > 0) {
    console.error("discoverability audit found unregistered artifacts:");
    for (const item of missing) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log("discoverability audit passed");
  process.exit(0);
}

if (options.command === "golden-queries") {
  const errors = runGoldenQueries();
  if (errors.length > 0) {
    console.error("discoverability golden query check failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("discoverability golden query check passed");
  process.exit(0);
}

const errors = runCheck();
if (errors.length > 0) {
  console.error("discoverability check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("discoverability check passed");
