import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const skillsDir = path.join(rootDir, "skills");
const adapterRoots = [
  `${[".co", "dex"].join("")}/skills`,
  `${[".cla", "ude"].join("")}/skills`,
];

const requiredSkills = [
  "constitution-drift-audit",
  "architecture-drift-repair",
  "adr-to-guardrail",
  "decision-map-maintenance",
  "naming-surface-audit",
  "surface-registry-alignment",
  "surface-route-work",
  "compatibility-evolution-work",
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

function addError(code, message, options = {}) {
  errors.push(createDiagnostic(code, message, {
    location: options.location ?? "skills",
    suggestion: options.suggestion ?? "Restore the skill file, frontmatter, or adapter symlink to match the public skill registry.",
    safeNextStep: options.safeNextStep ?? "Fix the reported skill artifact, then rerun node scripts/skills-check.mjs.",
  }));
}

function runSelfTest() {
  const chunks = [];
  printActionableFailureReport({
    title: "skills check failed for /Users/example/private:",
    diagnostics: [
      createDiagnostic("skill_missing", "missing required skill token: sk-test-secret-123456", {
        location: "/Users/example/private/skills/missing/SKILL.md",
        suggestion: "Restore the required skill directory and SKILL.md file.",
        safeNextStep: "Add skills/missing/SKILL.md, then rerun node scripts/skills-check.mjs.",
      }),
      createDiagnostic("skill_adapter_symlink_invalid", `${adapterRoots[0]}/example/SKILL.md points to bad, expected ../../../skills/example/SKILL.md`, {
        location: `${adapterRoots[0]}/example/SKILL.md`,
        suggestion: "Use a symlink adapter that points back to the canonical public skill.",
        safeNextStep: "Replace the adapter with the expected symlink, then rerun node scripts/skills-check.mjs.",
      }),
    ],
    stream: { write: (chunk) => chunks.push(chunk) },
  });
  const output = chunks.join("");
  assert.match(output, /code: skill_missing/);
  assert.match(output, /code: skill_adapter_symlink_invalid/);
  assert.match(output, /location: ~\/private\/skills\/missing\/SKILL\.md/);
  assert.match(output, /suggestion: Restore the required skill directory/);
  assert.match(output, /next: Replace the adapter with the expected symlink/);
  assert.doesNotMatch(output, /\/Users\/example/);
  assert.doesNotMatch(output, /sk-test-secret-123456/);
  console.log("skills check self-test passed");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

function parseFrontmatter(text, relativePath) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    addError("skill_frontmatter_missing", `${relativePath} is missing YAML frontmatter`, {
      location: relativePath,
      suggestion: "Add YAML frontmatter with name, description, and keywords.",
      safeNextStep: `Add frontmatter to ${relativePath}, then rerun node scripts/skills-check.mjs.`,
    });
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
      addError("skill_frontmatter_field_missing", `${relativePath} frontmatter is missing ${key}`, {
        location: relativePath,
        suggestion: "Complete the required skill frontmatter fields.",
        safeNextStep: `Add ${key} to ${relativePath}, then rerun node scripts/skills-check.mjs.`,
      });
    }
  }
  return fields;
}

for (const skill of requiredSkills) {
  const skillPath = path.join(skillsDir, skill, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    addError("skill_missing", `missing required skill ${skill}`, {
      location: `skills/${skill}/SKILL.md`,
      suggestion: "Restore the required public skill directory.",
      safeNextStep: `Add skills/${skill}/SKILL.md, then rerun node scripts/skills-check.mjs.`,
    });
    continue;
  }
  const relativePath = path.relative(rootDir, skillPath);
  const text = fs.readFileSync(skillPath, "utf8");
  const fields = parseFrontmatter(text, relativePath);
  if (fields && fields.get("name") !== skill) {
    addError("skill_frontmatter_name_mismatch", `${relativePath} frontmatter name must be ${skill}`, {
      location: relativePath,
      suggestion: "Keep the frontmatter name equal to the skill directory name.",
      safeNextStep: `Set name: ${skill} in ${relativePath}, then rerun node scripts/skills-check.mjs.`,
    });
  }
}

for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }
  const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    addError("skill_file_missing", `skills/${entry.name} is missing SKILL.md`, {
      location: `skills/${entry.name}/SKILL.md`,
      suggestion: "Every skill directory must contain a canonical SKILL.md.",
      safeNextStep: `Add skills/${entry.name}/SKILL.md, then rerun node scripts/skills-check.mjs.`,
    });
    continue;
  }
  parseFrontmatter(fs.readFileSync(skillPath, "utf8"), path.relative(rootDir, skillPath));
  for (const adapterRoot of adapterRoots) {
    const adapterPath = path.join(rootDir, adapterRoot, entry.name, "SKILL.md");
    const expectedTarget = `../../../skills/${entry.name}/SKILL.md`;
    if (!fs.existsSync(adapterPath)) {
      addError("skill_adapter_missing", `${adapterRoot}/${entry.name}/SKILL.md adapter is missing`, {
        location: `${adapterRoot}/${entry.name}/SKILL.md`,
        suggestion: "Create the adapter symlink for this skill.",
        safeNextStep: `Create ${adapterRoot}/${entry.name}/SKILL.md -> ${expectedTarget}, then rerun node scripts/skills-check.mjs.`,
      });
      continue;
    }
    const stat = fs.lstatSync(adapterPath);
    if (!stat.isSymbolicLink()) {
      addError("skill_adapter_not_symlink", `${adapterRoot}/${entry.name}/SKILL.md must be a symlink to ${expectedTarget}`, {
        location: `${adapterRoot}/${entry.name}/SKILL.md`,
        suggestion: "Adapters should be symlinks, not copied skill bodies.",
        safeNextStep: `Replace ${adapterRoot}/${entry.name}/SKILL.md with a symlink to ${expectedTarget}, then rerun node scripts/skills-check.mjs.`,
      });
      continue;
    }
    const target = fs.readlinkSync(adapterPath);
    if (target !== expectedTarget) {
      addError("skill_adapter_symlink_invalid", `${adapterRoot}/${entry.name}/SKILL.md points to ${target}, expected ${expectedTarget}`, {
        location: `${adapterRoot}/${entry.name}/SKILL.md`,
        suggestion: "Point adapter symlinks at the canonical public skill file.",
        safeNextStep: `Recreate the symlink to ${expectedTarget}, then rerun node scripts/skills-check.mjs.`,
      });
    }
  }
}

if (errors.length > 0) {
  printActionableFailureReport({
    title: "skills check failed:",
    diagnostics: errors,
  });
  process.exit(1);
}

console.log("skills check passed");
