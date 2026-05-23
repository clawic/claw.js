#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath) {
  const text = read(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function requireIncludes(relativePath, snippets) {
  const text = read(relativePath);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) errors.push(`${relativePath} missing ${snippet}`);
  }
  return text;
}

function flatten(value) {
  return JSON.stringify(value ?? {});
}

requireIncludes("docs/adr/0038-portable-archive-contract.md", [
  ".clawbackup",
  ".clawexport",
  ".clawsecrets",
  "manifest.json",
  "signed-host proof",
  "Clawix Settings/Data",
]);

requireIncludes("docs/portable-archive-contract.md", [
  "PortableArchiveManifestV1",
  "restoreReport.v1",
  "requires_signed_host",
  "--confirm-restore",
  "rebuildable_no_canonical_backup",
  "raw Secret Keys",
  "POST /v1/archives/restores",
]);

requireIncludes("packages/clawjs-core/src/portable-archive.ts", [
  "PortableArchiveManifestV1",
  "PortableArchivePlan",
  "PortableArchiveVerificationReport",
  "PortableArchiveImportPreview",
  "PortableArchiveRestoreReport",
  "verifyPortableArchiveManifest",
  "plaintext_secret",
]);

requireIncludes("packages/clawjs/src/cli-archive-command.ts", [
  "runArchiveCli",
  "local_export_writes_manifest",
  "local_verify_reads_manifest",
  "restore_confirmation_required",
  "requires_signed_host",
  "plan|export|verify|inspect|import|restore|doctor",
]);

requireIncludes("packages/clawjs-core/src/surface-registry-contracts.ts", [
  "claw.api.archives.plans",
  "claw.api.archives.exports",
  "claw.api.archives.verifications",
  "claw.api.archives.importPreviews",
  "claw.api.archives.restores",
]);

requireIncludes("packages/clawjs-core/src/surface-registry-graph.ts", [
  "claw.schema.portableArchive.manifest.v1",
  "claw.schema.portableArchive.restoreReport.v1",
]);

requireIncludes("packages/clawjs-core/src/cli-command-registry.ts", [
  "name: \"archive\"",
  "docs/adr/0038-portable-archive-contract.md",
  "scripts/portable-archive-governance-check.mjs",
]);

requireIncludes("packages/clawjs-core/src/portable-archive.test.ts", [
  "plaintext secret material",
  "two phase",
  "requires_signed_host",
]);

requireIncludes("packages/clawjs/src/index.test.ts", [
  "local.clawbackup",
  "hash_mismatch",
  "restore_confirmation_required",
]);

const assertion = readJson("docs/constitution.assertions.json")?.assertions?.find((entry) => entry.id === "II.6.backups-and-export-are-a-user-right");
if (!assertion) errors.push("II.6 assertion missing");
else {
  for (const required of [
    "docs/portable-archive-contract.md",
    "docs/adr/0038-portable-archive-contract.md",
    "scripts/portable-archive-governance-check.mjs",
  ]) {
    if (!flatten(assertion).includes(required)) errors.push(`II.6 assertion missing ${required}`);
  }
}

const registry = readJson("docs/discoverability.registry.json");
for (const required of [
  "docs/adr/0038-portable-archive-contract.md",
  "scripts/portable-archive-governance-check.mjs",
]) {
  if (!flatten(registry).includes(required)) errors.push(`discoverability registry missing ${required}`);
}
for (const query of ["backup", "export", "import", "restore", "portable archive", "secrets backup signed host"]) {
  if (!read("docs/portable-archive-contract.md").includes(query) && !read("docs/adr/0038-portable-archive-contract.md").includes(query)) {
    errors.push(`portable archive docs missing query term ${query}`);
  }
}

const golden = readJson("docs/discoverability-golden-queries.json");
for (const id of ["portable-archive-command", "portable-archive-restore-report-schema"]) {
  if (!flatten(golden).includes(id)) errors.push(`golden queries missing ${id}`);
}

const operational = readJson("docs/adr-operational-coverage.manifest.json");
if (!flatten(operational).includes("docs/adr/0038-portable-archive-contract.md")) errors.push("ADR operational coverage missing portable archive ADR");

const evolution = readJson("docs/evolution/baseline.json");
if (!flatten(evolution).includes("evo_portable_archive_contract")) errors.push("evolution ledger missing evo_portable_archive_contract");

const baseline = readJson("docs/evolution/public-surface-baseline.json");
for (const surface of ["claw.cli.command.archive", "claw.api.archives.restores", "claw.schema.portableArchive.restoreReport.v1"]) {
  if (!flatten(baseline).includes(surface)) errors.push(`public surface baseline missing ${surface}`);
}

const sourceAndFixtures = [
  "packages/clawjs-core/src/portable-archive.ts",
  "packages/clawjs-core/src/portable-archive.test.ts",
  "packages/clawjs/src/index.test.ts",
].map(read).join("\n");
for (const forbidden of ["sk-live-", "sk-proj-", "Bearer live", "plaintextSecretValue"]) {
  if (sourceAndFixtures.includes(forbidden)) errors.push(`plaintext secret fixture marker found: ${forbidden}`);
}

const clawixMirror = path.resolve(root, "../Clawix/clawix/docs/adr/0034-portable-archive-contract-mirror.md");
if (!fs.existsSync(clawixMirror)) errors.push("missing Clawix portable archive mirror ADR");
else {
  const mirror = fs.readFileSync(clawixMirror, "utf8");
  for (const snippet of [".clawbackup", ".clawsecrets", "requires_signed_host", "Settings/Data"]) {
    if (!mirror.includes(snippet)) errors.push(`Clawix mirror missing ${snippet}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `portable-archive-governance: ${error}`).join("\n"));
  process.exit(1);
}

console.log("portable archive governance ok");
