import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const skillsDir = path.join(rootDir, "skills");
const adapterRoots = [".codex/skills", ".claude/skills"];

const requiredSkills = [
  "constitution-drift-audit",
  "architecture-drift-repair",
  "adr-to-guardrail",
  "decision-map-maintenance",
  "naming-surface-audit",
  "surface-registry-alignment",
  "surface-route-work",
  "cli-agent-surface-work",
  "source-file-boundary-refactor",
  "canonical-catalog-expansion",
  "data-storage-boundary-review",
  "host-boundary-review",
  "mac-control-plane-work",
  "secrets-boundary-review",
  "integration-qa-lab",
  "host-dependent-validation",
  "performance-investigation",
  "public-hygiene-review",
  "code-hygiene-audit",
  "code-hygiene-cleanup",
  "docs-alignment-update",
  "code-review-risk",
  "commit-hygiene-public",
];

const errors = [];

function parseFrontmatter(text, relativePath) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push(`${relativePath} is missing YAML frontmatter`);
    return null;
  }
  const fields = new Map();
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (field) {
      fields.set(field[1], field[2]);
    }
  }
  for (const key of ["name", "description", "keywords"]) {
    if (!fields.has(key) || fields.get(key) === "") {
      errors.push(`${relativePath} frontmatter is missing ${key}`);
    }
  }
  return fields;
}

for (const skill of requiredSkills) {
  const skillPath = path.join(skillsDir, skill, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    errors.push(`missing required skill ${skill}`);
    continue;
  }
  const relativePath = path.relative(rootDir, skillPath);
  const text = fs.readFileSync(skillPath, "utf8");
  const fields = parseFrontmatter(text, relativePath);
  if (fields && fields.get("name") !== skill) {
    errors.push(`${relativePath} frontmatter name must be ${skill}`);
  }
}

for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    errors.push(`skills/${entry.name} is missing SKILL.md`);
    continue;
  }
  parseFrontmatter(fs.readFileSync(skillPath, "utf8"), path.relative(rootDir, skillPath));
  for (const adapterRoot of adapterRoots) {
    const adapterPath = path.join(rootDir, adapterRoot, entry.name, "SKILL.md");
    const expectedTarget = `../../../skills/${entry.name}/SKILL.md`;
    if (!fs.existsSync(adapterPath)) {
      errors.push(`${adapterRoot}/${entry.name}/SKILL.md adapter is missing`);
      continue;
    }
    const stat = fs.lstatSync(adapterPath);
    if (!stat.isSymbolicLink()) {
      errors.push(`${adapterRoot}/${entry.name}/SKILL.md must be a symlink to ${expectedTarget}`);
      continue;
    }
    const target = fs.readlinkSync(adapterPath);
    if (target !== expectedTarget) {
      errors.push(`${adapterRoot}/${entry.name}/SKILL.md points to ${target}, expected ${expectedTarget}`);
    }
  }
}

if (errors.length > 0) {
  console.error("skills check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("skills check passed");
