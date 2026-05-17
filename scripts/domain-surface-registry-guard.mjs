import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertClawDomainSurfaceRegistryComplete,
  clawCliCommandRegistry,
  clawDomainOwnershipEntriesV1,
  clawDomainOwnershipMatrixV1,
  clawDomainSurfaceRegistry,
  clawV1ClosureMinimumContractDomains,
  clawPersistentSurfaceRegistry,
  findClawDomainSurfaceEntry,
  listClawDomainSurfaceEntries,
} from "../packages/clawjs-core/src/index.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];

function relative(filePath) {
  return path.relative(rootDir, filePath) || ".";
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function listFiles(targetPath, predicate) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return predicate(targetPath) ? [targetPath] : [];
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", ".data", ".tmp", "artifacts", "test-results", "output"].includes(entry.name)) return [];
    const next = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return listFiles(next, predicate);
    return predicate(next) ? [next] : [];
  });
}

try {
  assertClawDomainSurfaceRegistryComplete();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

const entriesById = new Map();
for (const entry of clawDomainSurfaceRegistry.entries) {
  if (entriesById.has(entry.id)) failures.push(`duplicate surface id: ${entry.id}`);
  entriesById.set(entry.id, entry);

  if (!entry.name?.trim()) failures.push(`${entry.id}: missing name`);
  if (!entry.label?.trim()) failures.push(`${entry.id}: missing label`);
  if (!entry.source?.file) failures.push(`${entry.id}: missing source file`);
  else if (!exists(entry.source.file)) failures.push(`${entry.id}: source file does not exist: ${entry.source.file}`);

  if (entry.kind === "collection") {
    if (entry.status !== "registered_hidden") failures.push(`${entry.id}: collections must be registered_hidden until exposed through an approved command`);
    if (!entry.storageIds?.includes("claw.database.core")) failures.push(`${entry.id}: missing core database ownership`);
    if (!entry.cliCommands?.some((command) => command.startsWith(`claw db ${entry.name} `))) failures.push(`${entry.id}: missing claw db CRUD route`);
    if (!entry.cliCommands?.some((command) => command.startsWith(`claw collections ${entry.name} `))) failures.push(`${entry.id}: missing claw collections schema route`);
  }

  if (entry.kind === "signal_vertical") {
    for (const storageId of [
      "claw.database.core.table.signals_verticals",
      "claw.database.core.table.signals_variables",
      "claw.database.core.table.signals_sessions",
      "claw.database.core.table.signals_observations",
    ]) {
      if (!entry.storageIds?.includes(storageId)) failures.push(`${entry.id}: missing ${storageId}`);
    }
    if (!entry.cliCommands?.includes("claw signals observe")) failures.push(`${entry.id}: missing claw signals observe route`);
    if (!findClawDomainSurfaceEntry(`module:${entry.name}`)) failures.push(`${entry.id}: missing module manifest`);
  }

  if (entry.kind === "module_manifest" && entry.status === "conceptual_manifest") {
    if (entry.packageNames?.length) failures.push(`${entry.id}: conceptual module manifests must not declare package APIs`);
    if (entry.cliCommands?.length) failures.push(`${entry.id}: conceptual module manifests must not declare CLI routes`);
    if (!entry.modulePath) failures.push(`${entry.id}: missing modulePath`);
    else if (!fs.existsSync(path.join(rootDir, entry.modulePath, "module.json"))) failures.push(`${entry.id}: missing ${entry.modulePath}/module.json`);
  }
}

for (const command of clawCliCommandRegistry.commands) {
  if (!entriesById.has(`cli:${command.name}`)) failures.push(`missing CLI surface entry for ${command.name}`);
}

for (const domain of clawDomainOwnershipEntriesV1) {
  if (!entriesById.has(`service:${domain.domain}`)) failures.push(`missing service runtime surface entry for ${domain.domain}`);
}

for (const domain of clawV1ClosureMinimumContractDomains) {
  const contract = clawDomainOwnershipMatrixV1[domain].minimumContract;
  if (!contract) {
    failures.push(`${domain}: missing v1 minimum contract`);
    continue;
  }
  for (const key of ["resourceTypes", "apiShape", "eventTopics", "fixtures", "matrixRows", "validation"]) {
    if (!Array.isArray(contract[key]) || contract[key].length === 0) {
      failures.push(`${domain}: minimum contract missing ${key}`);
    }
  }
  for (const fixture of contract.fixtures) {
    if (!fixture.includes("#") && !exists(fixture)) failures.push(`${domain}: fixture evidence does not exist: ${fixture}`);
  }
}

const contentPublishing = entriesById.get("aggregate:content-publishing");
if (!contentPublishing) {
  failures.push("missing aggregate:content-publishing surface entry");
} else {
  const cliCommands = contentPublishing.cliCommands ?? [];
  for (const command of [
    "claw content brand list|create",
    "claw content destination list|create|test",
    "claw content campaign list|create",
    "claw content entry list|create|update|attach-asset|generate-variants",
    "claw content approval list|approve|reject",
    "claw content publish plan-list|plan-create|run|cancel|runs|retry",
  ]) {
    if (!cliCommands.includes(command)) failures.push(`aggregate:content-publishing missing v1 CLI route ${command}`);
  }
  for (const stale of ["claw content posts|campaigns|publications", "claw posts list"]) {
    if (cliCommands.includes(stale)) failures.push(`aggregate:content-publishing keeps stale CLI route ${stale}`);
  }
}
for (const command of ["posts", "campaigns", "publications"]) {
  if (clawCliCommandRegistry.commands.some((entry) => entry.name === command)) {
    failures.push(`public CLI registry keeps retired content portal ${command}`);
  }
}

for (const node of clawPersistentSurfaceRegistry.nodes) {
  if (["database", "sidecar", "table", "index"].includes(node.kind) && !entriesById.has(`storage:${node.id}`)) {
    failures.push(`missing storage surface entry for ${node.id}`);
  }
}

const conceptualModulePackageAllowlist = new Set([
  "erp",
  "feed",
  "sandbox",
  "user",
  "user-model",
]);
const modulePackageFiles = listFiles(path.join(rootDir, "modules"), (file) => path.basename(file) === "package.json");
for (const file of modulePackageFiles) {
  const moduleId = path.relative(path.join(rootDir, "modules"), path.dirname(file)).split(path.sep)[0];
  if (!conceptualModulePackageAllowlist.has(moduleId)) {
    failures.push(`${relative(file)} is still a package wrapper for a conceptual module`);
  }
}

if (failures.length > 0) {
  console.error("Domain surface registry guard failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Domain surface registry guard passed (${clawDomainSurfaceRegistry.entries.length} entries)`);
