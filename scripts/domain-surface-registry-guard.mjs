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
} from "../packages/clawjs-core/src/catalogs.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test"]);

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

function domainSurfaceDiagnostic(failure) {
  if (failure.startsWith("unknown argument")) {
    return createDiagnostic("domain_surface_registry_usage_error", failure, {
      status: "USAGE",
      location: "scripts/domain-surface-registry-guard.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node --import tsx scripts/domain-surface-registry-guard.mjs with a supported argument.",
    });
  }
  if (failure.startsWith("duplicate surface id")) {
    return createDiagnostic("domain_surface_duplicate_id", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Give every domain surface registry entry a unique id.",
      safeNextStep: "Rename or merge the duplicate entry, then rerun this guard.",
    });
  }
  if (failure.includes(": missing name") || failure.includes(": missing label") || failure.includes(": missing source file")) {
    return createDiagnostic("domain_surface_entry_shape_invalid", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Complete the required name, label, and source metadata for the surface entry.",
      safeNextStep: "Fill the missing registry field, then rerun node --import tsx scripts/domain-surface-registry-guard.mjs.",
    });
  }
  if (failure.includes("source file does not exist") || failure.includes("fixture evidence does not exist") || failure.includes("references missing")) {
    return createDiagnostic("domain_surface_evidence_missing", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Point registry evidence at a committed public file, fixture, or documented anchor.",
      safeNextStep: "Restore the evidence file or correct the path, then rerun this guard.",
    });
  }
  if (failure.includes("collections must be") || failure.includes("missing core database ownership") || failure.includes("missing claw db") || failure.includes("missing claw collections")) {
    return createDiagnostic("domain_surface_collection_contract_invalid", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Keep collection surfaces hidden until approved and prove database plus CLI CRUD/schema routes.",
      safeNextStep: "Fix the collection surface contract, then rerun this guard.",
    });
  }
  if (failure.includes("missing service runtime surface entry")) {
    return createDiagnostic("domain_surface_service_runtime_missing", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Add the service runtime surface entry for every owned domain.",
      safeNextStep: "Register the missing service surface, then rerun node --import tsx scripts/domain-surface-registry-guard.mjs.",
    });
  }
  if (failure.includes("missing CLI surface entry") || failure.includes("missing v1 CLI route") || failure.includes("retired content portal") || failure.includes("stale CLI route")) {
    return createDiagnostic("domain_surface_cli_contract_invalid", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Keep public CLI registry and domain surface entries aligned, without retired command portals.",
      safeNextStep: "Add or remove the named CLI surface entry, then rerun this guard.",
    });
  }
  if (failure.includes("minimum contract")) {
    return createDiagnostic("domain_surface_minimum_contract_invalid", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Complete the v1 minimum contract arrays for resource types, API shape, events, fixtures, matrix rows, and validation.",
      safeNextStep: "Fill the missing minimum contract field, then rerun node --import tsx scripts/domain-surface-registry-guard.mjs.",
    });
  }
  if (failure.includes("missing storage surface entry")) {
    return createDiagnostic("domain_surface_storage_entry_missing", failure, {
      location: "packages/clawjs-core/src/catalogs.ts",
      suggestion: "Register storage surfaces for database, sidecar, table, and index nodes.",
      safeNextStep: "Add the missing storage surface entry, then rerun this guard.",
    });
  }
  if (failure.includes("conceptual module manifests")) {
    return createDiagnostic("domain_surface_conceptual_manifest_invalid", failure, {
      location: "modules",
      suggestion: "Keep conceptual module manifests free of package APIs and CLI routes until promoted.",
      safeNextStep: "Remove package/CLI declarations from the conceptual manifest, then rerun this guard.",
    });
  }
  if (failure.includes("package wrapper for a conceptual module")) {
    return createDiagnostic("domain_surface_conceptual_package_wrapper", failure, {
      location: "modules",
      suggestion: "Do not ship package wrappers for conceptual modules unless they are allowlisted or promoted.",
      safeNextStep: "Remove the package wrapper or add a reviewed allowlist entry, then rerun this guard.",
    });
  }
  return createDiagnostic("domain_surface_registry_failed", failure, {
    location: "packages/clawjs-core/src/catalogs.ts",
    suggestion: "Inspect the domain surface registry invariant and restore the missing ownership evidence.",
    safeNextStep: "Fix the reported registry issue, then rerun node --import tsx scripts/domain-surface-registry-guard.mjs.",
  });
}

function printFailures(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "Domain surface registry guard failed:",
    diagnostics: items.map(domainSurfaceDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const chunks = [];
  printFailures([
    "unknown argument --bad-token-sk-test-secret-123456",
    "duplicate surface id: service.demo",
    "service.demo: missing source file",
    "service.demo: source file does not exist: /Users/example/private/source.ts",
    "collection:tasks: missing claw db CRUD route",
    "missing service runtime surface entry for tasks",
    "missing CLI surface entry for tasks",
    "tasks: minimum contract missing fixtures",
    "missing storage surface entry for claw.database.core.table.tasks",
    "module:demo: conceptual module manifests must not declare CLI routes",
    "modules/demo/package.json is still a package wrapper for a conceptual module",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "domain_surface_registry_usage_error",
    "domain_surface_duplicate_id",
    "domain_surface_entry_shape_invalid",
    "domain_surface_evidence_missing",
    "domain_surface_collection_contract_invalid",
    "domain_surface_service_runtime_missing",
    "domain_surface_cli_contract_invalid",
    "domain_surface_minimum_contract_invalid",
    "domain_surface_storage_entry_missing",
    "domain_surface_conceptual_manifest_invalid",
    "domain_surface_conceptual_package_wrapper",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Keep public CLI registry")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printFailures([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("Domain surface registry guard self-test passed");
  process.exit(0);
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
  printFailures(failures);
  process.exit(1);
}

console.log(`Domain surface registry guard passed (${clawDomainSurfaceRegistry.entries.length} entries)`);
