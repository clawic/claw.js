import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const baselinePath = path.join(rootDir, "docs/governance-vocabulary-baseline.json");
const updateBaseline = process.argv.includes("--update-baseline");
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
const summary = Object.fromEntries(
  Object.entries(counts).map(([id, files]) => [id, { files: Object.keys(files).length, occurrences: totalFor(files) }]),
);

if (updateBaseline) {
  const baseline = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    policy: "Current governance vocabulary debt may shrink without review. Any increase in a tracked path or any new tracked path fails scripts/governance-scope-guard.mjs unless the occurrence is removed or this baseline is deliberately updated with rationale.",
    trackedPatterns: trackedPatterns.map((pattern) => pattern.id),
    summary,
    counts,
  };
  fs.writeFileSync(baselinePath, `${JSON.stringify(sortedObject(baseline), null, 2)}\n`);
} else {
  const baseline = loadBaseline();
  if (!baseline) {
    failures.push("docs/governance-vocabulary-baseline.json is missing. Run node ./scripts/governance-scope-guard.mjs --update-baseline after reviewing debt.");
  } else {
    for (const pattern of trackedPatterns) {
      const currentFiles = counts[pattern.id] ?? {};
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

const result = { failures, summary, baselineUpdated: updateBaseline };
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (updateBaseline) console.log("governance scope baseline updated");
  if (failures.length) {
    console.error("governance scope guard failed:");
    for (const failure of failures) console.error(`- ${failure}`);
  }
  console.log(`governance scope guard ${failures.length ? "failed" : "passed"}`);
}

if (failures.length) process.exit(1);
