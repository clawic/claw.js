import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clawCliCommandRegistry, listClawCliAliases } from "../packages/clawjs-core/src/cli-command-registry.ts";
import { resolveClawCliCommandIntent } from "../packages/clawjs-core/src/cli-command-intents.ts";
import { CLI_EXIT_OK, runCli } from "../packages/clawjs/src/index.ts";
import {
  GENERATED_CLI_COMMANDS,
  GENERATED_CLI_ROUTE_GROUPS,
} from "../packages/clawjs/src/cli-router.generated.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--self-test"]);

const removedPublicCommands = new Set([
  "data",
  "app-state",
  "ops",
  "infra",
  "workspace-search",
  "workspace-index",
  "export",
  "import",
  "backup",
  "memory",
  "user",
  "delegation-plane",
  "badger",
  "clawix-relay",
]);

const requiredDocRefs = new Set([
  "docs/cli.md",
  "docs/adr/0048-naming-and-stability-surfaces.md",
  "docs/adr/0004-persistent-surface-registry-and-inspection.md",
  "docs/adr/0007-cli-agent-interface.md",
]);

const sourceFiles = listFiles(path.join(rootDir, "packages", "clawjs", "src"))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => ({
    file,
    relative: path.relative(rootDir, file),
    text: fs.readFileSync(file, "utf8"),
  }));

function listFiles(targetPath) {
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function readRelative(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function symbolPattern(symbol) {
  return new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
}

function cliParityDiagnostic(failure) {
  if (failure.startsWith("unknown argument")) {
    return createDiagnostic("cli_registry_router_usage_error", failure, {
      status: "USAGE",
      location: "scripts/verify-cli-registry-router-parity.mjs",
      suggestion: "Use --self-test or no arguments.",
      safeNextStep: "Rerun node --import tsx scripts/verify-cli-registry-router-parity.mjs with a supported argument.",
    });
  }
  if (failure.startsWith("duplicate command name") || failure.includes("removed legacy command") || failure.includes("missing summary") || failure.includes("invalid kind") || failure.includes("schemaVersion") || failure.includes("jsonSchemaId") || failure.includes("support declaration") || failure.includes("security policy")) {
    return createDiagnostic("cli_registry_entry_invalid", failure, {
      location: "packages/clawjs-core/src/cli-command-registry.ts",
      suggestion: "Fix the CLI registry entry shape before regenerating router metadata.",
      safeNextStep: "Update the named command registry entry, then rerun this parity check.",
    });
  }
  if (failure.includes("target") || failure.includes("alias") && failure.includes("collides")) {
    return createDiagnostic("cli_registry_alias_invalid", failure, {
      location: "packages/clawjs-core/src/cli-command-registry.ts",
      suggestion: "Point aliases and targets at a canonical command or explicit router-backed route.",
      safeNextStep: "Fix the alias/target entry, then rerun node --import tsx scripts/verify-cli-registry-router-parity.mjs.",
    });
  }
  if (failure.includes("missing router evidence")) {
    return createDiagnostic("cli_registry_router_evidence_missing", failure, {
      location: "packages/clawjs/src",
      suggestion: "Add router evidence for the command or mark it as a portal/alias with a public decision.",
      safeNextStep: "Wire the command route or source symbol, then rerun this parity check.",
    });
  }
  if (failure.includes("generated CLI command metadata is stale") || failure.includes("generated summary is stale") || failure.includes("generated route group") || failure.includes("route group map")) {
    return createDiagnostic("cli_generated_router_stale", failure, {
      location: "packages/clawjs/src/cli-router.generated.ts",
      suggestion: "Regenerate the CLI router metadata from the registry.",
      safeNextStep: "Run node --import tsx scripts/generate-cli-router.mjs, review the generated diff, then rerun this parity check.",
    });
  }
  if (failure.startsWith("alias ") && failure.includes("resolves to both")) {
    return createDiagnostic("cli_alias_resolution_ambiguous", failure, {
      location: "packages/clawjs-core/src/cli-command-registry.ts",
      suggestion: "Make each alias resolve to exactly one canonical command.",
      safeNextStep: "Remove or rename the conflicting alias, then rerun this parity check.",
    });
  }
  if (failure.includes("missing doc ref") || failure.includes("missing ADR ref") || failure.includes("missing test ref") || failure.includes("missing required CLI decision/doc ref") || failure.includes("missing test refs")) {
    return createDiagnostic("cli_registry_reference_missing", failure, {
      location: "packages/clawjs-core/src/cli-command-registry.ts",
      suggestion: "Add existing public docs, ADRs, and tests to the command registry evidence.",
      safeNextStep: "Restore the missing reference or update the registry entry, then rerun this parity check.",
    });
  }
  if (failure.includes("missing source file") || failure.includes("source symbol")) {
    return createDiagnostic("cli_registry_source_missing", failure, {
      location: "packages/clawjs-core/src/cli-command-registry.ts",
      suggestion: "Point the command registry source to a committed file and exported symbol.",
      safeNextStep: "Fix the source file/symbol entry, then rerun node --import tsx scripts/verify-cli-registry-router-parity.mjs.",
    });
  }
  if (failure.includes("help exited") || failure.includes("help output")) {
    return createDiagnostic("cli_help_parity_failed", failure, {
      location: "packages/clawjs/src/index.ts",
      suggestion: "Keep command help generated from registry metadata, including summary, support state, and security policy.",
      safeNextStep: "Fix the command help path, then rerun this parity check.",
    });
  }
  if (failure.includes("command intent resolution for routed alias")) {
    return createDiagnostic("cli_command_intent_router_alias_mismatch", failure, {
      location: "packages/clawjs-core/src/cli-command-intents.ts",
      suggestion: "Make command-intent resolution recognize router-backed command aliases as covered routes.",
      safeNextStep: "Fix the alias resolution path, then rerun node --import tsx scripts/verify-cli-registry-router-parity.mjs.",
    });
  }
  return createDiagnostic("cli_registry_router_parity_failed", failure, {
    location: "scripts/verify-cli-registry-router-parity.mjs",
    suggestion: "Inspect the CLI registry/router invariant and restore command parity.",
    safeNextStep: "Fix the reported CLI parity issue, then rerun node --import tsx scripts/verify-cli-registry-router-parity.mjs.",
  });
}

function printFailures(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "CLI registry/router parity check failed:",
    diagnostics: items.map(cliParityDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const chunks = [];
  printFailures([
    "unknown argument --bad-token-sk-test-secret-123456",
    "duplicate command name: inspect",
    "inspect: alias ls collides with a registered command; declare it as an alias command instead",
    "inspect: missing router evidence in packages/clawjs/src",
    "generated CLI command metadata is stale relative to clawCliCommandRegistry",
    "alias ls resolves to both list and inspect",
    "inspect: missing doc ref /Users/example/private.md",
    "inspect: missing source file <none>",
    "inspect: help exited with 1; stderr=token sk-test-secret-123456",
    "templates: command intent resolution for routed alias template returned candidate_alias mapped to network",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  for (const code of [
    "cli_registry_router_usage_error",
    "cli_registry_entry_invalid",
    "cli_registry_alias_invalid",
    "cli_registry_router_evidence_missing",
    "cli_generated_router_stale",
    "cli_alias_resolution_ambiguous",
    "cli_registry_reference_missing",
    "cli_registry_source_missing",
    "cli_help_parity_failed",
    "cli_command_intent_router_alias_mismatch",
  ]) {
    if (!output.includes(`code: ${code}`)) throw new Error(`self-test missing ${code}`);
  }
  if (!output.includes("suggestion: Keep command help")) throw new Error("self-test missing actionable suggestion");
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
  console.log("CLI registry/router parity self-test passed");
  process.exit(0);
}

function hasRouterEvidence(entry, commandsByName) {
  if (entry.kind === "alias") return true;
  if (entry.kind === "portal") return true;
  if (entry.source?.file && entry.source?.symbol && !["runCli", "runCliUnsafe"].includes(entry.source.symbol) && exists(entry.source.file) && symbolPattern(entry.source.symbol).test(readRelative(entry.source.file))) return true;
  const candidates = [entry.name, entry.target].filter(Boolean);
  return candidates.some((name) => {
    const routePattern = new RegExp(`group\\s*===\\s*["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
    const listedPattern = new RegExp(`["']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`);
    return sourceFiles.some(({ text }) => routePattern.test(text) || text.includes(`PUBLIC_PORTAL_HELP_ONLY`) && listedPattern.test(text) || text.includes("HOST_FORWARD_DOMAINS") && listedPattern.test(text) || text.includes("PUBLIC_CLI_GROUPS") && listedPattern.test(text));
  }) || (entry.target ? commandsByName.has(entry.target.split("/")[0]) : false);
}

function checkRegistryShape(failures) {
  const commandsByName = new Map();
  for (const entry of clawCliCommandRegistry.commands) {
    if (commandsByName.has(entry.name)) failures.push(`duplicate command name: ${entry.name}`);
    commandsByName.set(entry.name, entry);
    if (removedPublicCommands.has(entry.name)) failures.push(`removed legacy command is still registered: ${entry.name}`);
    if (!entry.summary?.trim()) failures.push(`${entry.name}: missing summary`);
    if (!entry.kind || !["canonical", "portal", "alias"].includes(entry.kind)) failures.push(`${entry.name}: invalid kind`);
    if (!entry.schemaVersion || entry.schemaVersion < 1) failures.push(`${entry.name}: missing schemaVersion`);
    if (entry.jsonSchemaId !== `claw.cli.${entry.name}.v${entry.schemaVersion}`) failures.push(`${entry.name}: jsonSchemaId does not match schemaVersion`);
    if (!entry.support?.state || !entry.support?.reason || !entry.support?.scenario) failures.push(`${entry.name}: incomplete support declaration`);
    if (!entry.securityPolicy) failures.push(`${entry.name}: missing security policy`);
    if (entry.kind === "alias" && !entry.target) failures.push(`${entry.name}: alias must declare target`);
  }

  for (const entry of clawCliCommandRegistry.commands) {
    if (entry.target && !entry.target.includes("/") && !commandsByName.has(entry.target) && !hasRouterEvidence({ ...entry, name: entry.target, target: undefined }, commandsByName)) {
      failures.push(`${entry.name}: target ${entry.target} is neither registered nor backed by router evidence`);
    }
    for (const alias of entry.aliases ?? []) {
      if (commandsByName.has(alias)) failures.push(`${entry.name}: alias ${alias} collides with a registered command; declare it as an alias command instead`);
    }
    if (!hasRouterEvidence(entry, commandsByName)) {
      failures.push(`${entry.name}: missing router evidence in packages/clawjs/src`);
    }
  }
}

function checkGeneratedRouter(failures) {
  const registryNames = clawCliCommandRegistry.commands.map((entry) => entry.name).sort();
  const generatedNames = GENERATED_CLI_COMMANDS.map((entry) => entry.name).sort();
  if (JSON.stringify(registryNames) !== JSON.stringify(generatedNames)) {
    failures.push("generated CLI command metadata is stale relative to clawCliCommandRegistry");
  }
  const generatedByName = new Map(GENERATED_CLI_COMMANDS.map((entry) => [entry.name, entry]));
  for (const entry of clawCliCommandRegistry.commands) {
    const generated = generatedByName.get(entry.name);
    if (!generated) continue;
    if (generated.summary !== entry.summary) failures.push(`${entry.name}: generated summary is stale`);
    if (generated.schemaVersion !== entry.schemaVersion) failures.push(`${entry.name}: generated schemaVersion is stale`);
    if (GENERATED_CLI_ROUTE_GROUPS[entry.name] !== generated.routeGroup) failures.push(`${entry.name}: generated route group map is inconsistent`);
    if (!generated.routeGroup) failures.push(`${entry.name}: missing generated route group`);
  }
}

function checkAliasRecords(failures) {
  const seen = new Map();
  for (const record of listClawCliAliases()) {
    if (record.source === "collection" && record.shadowedByCommand === record.alias) continue;
    const prior = seen.get(record.alias);
    if (prior && prior.canonicalName !== record.canonicalName) {
      failures.push(`alias ${record.alias} resolves to both ${prior.canonicalName} and ${record.canonicalName}`);
    }
    seen.set(record.alias, record);
  }
}

function checkCommandIntentRouterAliases(failures) {
  for (const entry of clawCliCommandRegistry.commands) {
    const routedAliases = new Set((entry.aliases ?? []).filter((alias) => alias && !alias.includes(" ") && !alias.includes("/")));
    for (const alias of routedAliases) {
      if (!(alias in GENERATED_CLI_ROUTE_GROUPS)) continue;
      const resolution = resolveClawCliCommandIntent({ phrase: `${alias} list`, limit: 5 });
      if (resolution.status !== "covered" || resolution.intent.mappedCommand !== entry.name) {
        failures.push(`${entry.name}: command intent resolution for routed alias ${alias} returned ${resolution.status} mapped to ${resolution.intent.mappedCommand ?? "<none>"}`);
      }
    }
  }
}

function checkReferences(failures) {
  for (const entry of clawCliCommandRegistry.commands) {
    for (const doc of entry.docs ?? []) {
      if (!exists(doc)) failures.push(`${entry.name}: missing doc ref ${doc}`);
    }
    for (const adr of entry.adrs ?? []) {
      if (!exists(adr)) failures.push(`${entry.name}: missing ADR ref ${adr}`);
    }
    for (const test of entry.tests ?? []) {
      if (!exists(test)) failures.push(`${entry.name}: missing test ref ${test}`);
    }
    for (const doc of requiredDocRefs) {
      if (![...(entry.docs ?? []), ...(entry.adrs ?? [])].includes(doc)) failures.push(`${entry.name}: missing required CLI decision/doc ref ${doc}`);
    }
    if ((entry.tests ?? []).length === 0) failures.push(`${entry.name}: missing test refs`);
    if (!entry.source?.file || !exists(entry.source.file)) {
      failures.push(`${entry.name}: missing source file ${entry.source?.file ?? "<none>"}`);
      continue;
    }
    if (entry.source.symbol && !symbolPattern(entry.source.symbol).test(readRelative(entry.source.file))) {
      failures.push(`${entry.name}: source symbol ${entry.source.symbol} not found in ${entry.source.file}`);
    }
  }
}

async function checkHelpParity(failures) {
  for (const entry of clawCliCommandRegistry.commands) {
    let stdout = "";
    let stderr = "";
    const stream = {
      write(chunk) {
        stdout += String(chunk);
        return true;
      },
    };
    const errorStream = {
      write(chunk) {
        stderr += String(chunk);
        return true;
      },
    };
    const exitCode = await runCli([entry.name, "--help"], {
      stdout: stream,
      stderr: errorStream,
      cwd: rootDir,
    });
    if (exitCode !== CLI_EXIT_OK) {
      failures.push(`${entry.name}: help exited with ${exitCode}; stderr=${stderr.trim()}`);
      continue;
    }
    if (!stdout.includes(entry.summary)) failures.push(`${entry.name}: help output is not registry-backed; missing summary`);
    if (!stdout.includes(`Support: ${entry.support.state}`)) failures.push(`${entry.name}: help output is missing support state`);
    if (!stdout.includes(`Security: ${entry.securityPolicy}`)) failures.push(`${entry.name}: help output is missing security policy`);
  }
}

const failures = [];
checkRegistryShape(failures);
checkGeneratedRouter(failures);
checkAliasRecords(failures);
checkCommandIntentRouterAliases(failures);
checkReferences(failures);
await checkHelpParity(failures);

if (failures.length > 0) {
  printFailures(failures);
  process.exit(1);
}

console.log(`cli registry/router parity passed (${clawCliCommandRegistry.commands.length} commands)`);
