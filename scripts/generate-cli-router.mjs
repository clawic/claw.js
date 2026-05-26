import fs from "node:fs";
import path from "node:path";

import {
  BUILTIN_COLLECTIONS_BY_ALIAS,
} from "../packages/clawjs-core/src/builtins/index.ts";
import {
  clawCliCommandRegistry,
} from "../packages/clawjs-core/src/cli-command-registry.ts";
import {
  listKeywordRouterConcepts,
} from "../packages/clawjs-core/src/discovery/keyword-router.ts";
import { createDiagnostic, printActionableFailureReport } from "./actionable-error.mjs";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const outputPath = path.join(rootDir, "packages", "clawjs", "src", "cli-router.generated.ts");
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(["--check", "--self-test"]);
const check = args.has("--check");

const REMOVED_PUBLIC_COMMANDS = [
  ["data", "Use `claw database ...` for technical database operations or `claw work export|import|backup ...` for productivity snapshots."],
  ["app-state", "App state is internal. Use `claw host ...`, `claw doctor`, or diagnostics surfaces instead."],
  ["memory", "Use `claw knowledge ...` or `claw knowledge memories ...`."],
  ["user", "Use `claw profile ...` or the profile domain portals such as `health`, `travel`, `career`, `family`, `legal`, `finance`, `location`, and `accounts`."],
  ["ops", "Use `claw logs`, `claw doctor`, `claw monitor`, or `claw host ...`."],
  ["infra", "`infra` is not a public Claw namespace. Use `claw host`, `claw monitor`, or `claw logs`."],
  ["workspace-search", "Use `claw search query ...`."],
  ["workspace-index", "Use `claw search rebuild`."],
  ["export", "Use `claw work export ...`."],
  ["import", "Use `claw work import ...`."],
  ["backup", "Use `claw work backup ...` or `claw database ...` for technical database backups."],
  ["posts", "Use `claw content entry ...`."],
  ["campaigns", "Use `claw content campaign ...`."],
  ["publications", "Use `claw content publish ...`."],
];

const PUBLIC_PORTAL_HELP_ONLY = [
  "drive",
  "business",
  "social",
  "monitor",
  "logs",
  "diagnostics",
  "health",
  "travel",
  "career",
  "family",
  "legal",
  "location",
  "accounts",
];

const JSON_HELP_REQUIRED_COMMANDS = [
  "agent-resource",
  "audio",
  "code",
  "commitments",
  "context",
  "content",
  "database",
  "erp",
  "handoffs",
  "iot",
  "judgment",
  "knowledge",
  "learning",
  "library",
  "mcp",
  "notes",
  "notify",
  "outcomes",
  "plan",
  "profile",
  "references",
  "remote",
  "rules",
  "runtime",
  "search",
  "sessions",
  "signals",
  "skills",
  "slides",
  "soul",
  "styles",
  "sync",
  "templates",
  "test",
  "nodes",
  "gateway",
];

const SPECIAL_ROUTE_ALIASES = new Map([
  ["chat", "runtime-workspace"],
  ["provider", "runtime-workspace"],
  ["image", "media-documents"],
  ["info", "legacy"],
  ["style", "media-documents"],
  ["template", "media-documents"],
  ["ref", "media-documents"],
]);

function routeGroupForEntry(entry) {
  if (["inspect", "search", "router", "about", "source", "governance", "debt", "safety", "evolution", "commands", "needs", "agent-resource", "test"].includes(entry.name)) return "inspect-search-governance";
  if (["database", "db", "collections", "records", "work", "tasks", "notes", "people", "projects", "goals", "inbox", "approvals", "blockers", "decisions", "assignments", "handoffs", "artifacts", "commitments", "agenda", "review", "timeline", "my-work", "team-work"].includes(entry.name)) return "database-productivity";
  if (["host", "system", "network", "domains"].includes(entry.name) || entry.family === "mac-control" || entry.family === "mac-care") return "host-system-network";
  if (["remote", "sync", "nodes", "gateway"].includes(entry.name)) return "remote-sync";
  if (["chat", "provider", "providers", "runtime", "workspace", "auth", "models", "sessions", "knowledge"].includes(entry.name)) return "runtime-workspace";
  if (["slides", "styles", "style", "templates", "template", "references", "ref", "report"].includes(entry.name) || entry.family === "media") return "media-documents";
  if (["new", "generate", "add", "project", "setup", "modules"].includes(entry.name)) return "scaffold-setup";
  if (["notify", "content", "erp", "iot", "dense-fixtures", "dense-fixture"].includes(entry.name) || entry.family === "database" || entry.family === "signals") return "domain-data";
  return "legacy";
}

function compactCommand(entry) {
  return {
    name: entry.name,
    kind: entry.kind,
    summary: entry.summary,
    usage: entry.usage,
    advanced: entry.advanced,
    target: entry.target,
    aliases: entry.aliases,
    family: entry.family,
    schemaVersion: entry.schemaVersion,
    jsonSchemaId: entry.jsonSchemaId,
    support: entry.support,
    securityPolicy: entry.securityPolicy,
    docs: entry.docs,
    adrs: entry.adrs,
    tests: entry.tests,
    source: entry.source,
    relatedSurfaces: entry.relatedSurfaces,
    routeGroup: routeGroupForEntry(entry),
  };
}

function tsConst(value) {
  return JSON.stringify(value, null, 2).replace(/^(\s*)"([A-Za-z_$][A-Za-z0-9_$]*)":/gm, "$1$2:");
}

function generatorDiagnostic(error) {
  if (error.startsWith("unknown argument")) {
    return createDiagnostic("cli_router_generator_usage_error", error, {
      status: "USAGE",
      location: "scripts/generate-cli-router.mjs",
      suggestion: "Use --check, --self-test, or no arguments.",
      safeNextStep: "Rerun node --import tsx scripts/generate-cli-router.mjs with a supported argument.",
    });
  }
  if (error.includes("is stale")) {
    return createDiagnostic("cli_router_generated_file_stale", error, {
      location: path.relative(rootDir, outputPath),
      suggestion: "Regenerate the CLI router metadata from the public CLI registry.",
      safeNextStep: "Run node --import tsx scripts/generate-cli-router.mjs, review packages/clawjs/src/cli-router.generated.ts, then rerun --check.",
    });
  }
  return createDiagnostic("cli_router_generator_failed", error, {
    location: "scripts/generate-cli-router.mjs",
    suggestion: "Inspect the CLI registry and generated router inputs.",
    safeNextStep: "Fix the generator input or output file, then rerun node --import tsx scripts/generate-cli-router.mjs --check.",
  });
}

function printErrors(items, options = {}) {
  printActionableFailureReport({
    title: options.title ?? "CLI router generator failed:",
    diagnostics: items.map(generatorDiagnostic),
    stream: options.stream ?? process.stderr,
  });
}

function runSelfTest() {
  const chunks = [];
  printErrors([
    "unknown argument --bad-token-sk-test-secret-123456",
    "packages/clawjs/src/cli-router.generated.ts is stale. Run: node --import tsx ./scripts/generate-cli-router.mjs from /Users/example/private",
  ], { stream: { write: (chunk) => chunks.push(chunk) } });
  const output = chunks.join("");
  if (!output.includes("code: cli_router_generator_usage_error")) throw new Error("self-test missing usage code");
  if (!output.includes("code: cli_router_generated_file_stale")) throw new Error("self-test missing stale code");
  if (!output.includes("suggestion: Regenerate the CLI router metadata")) throw new Error("self-test missing actionable suggestion");
  if (output.includes("/Users/example") || output.includes("sk-test-secret-123456")) throw new Error("self-test leaked private data");
}

for (const arg of args) {
  if (!allowedArgs.has(arg)) {
    printErrors([`unknown argument ${arg}`]);
    process.exit(64);
  }
}

if (args.has("--self-test")) {
  runSelfTest();
  console.log("CLI router generator self-test passed");
  process.exit(0);
}

const commands = clawCliCommandRegistry.commands.map(compactCommand);
const keywordRouterConcepts = listKeywordRouterConcepts();
const routeGroups = {};
for (const entry of commands) {
  const roots = [entry.name];
  if (entry.target && !entry.target.includes(" ")) roots.push(entry.target);
  for (const alias of entry.aliases ?? []) {
    if (!alias.includes(" ")) roots.push(alias);
  }
  for (const root of roots) {
    routeGroups[root] ??= entry.routeGroup;
  }
}
for (const [alias, routeGroup] of SPECIAL_ROUTE_ALIASES) {
  routeGroups[alias] = routeGroup;
}
const stableCommands = commands
  .filter((entry) => entry.kind !== "alias")
  .map((entry) => entry.name)
  .sort();
const collectionAliases = Object.fromEntries([...BUILTIN_COLLECTIONS_BY_ALIAS].sort(([left], [right]) => left.localeCompare(right)));

const generated = `// @generated by scripts/generate-cli-router.mjs
// This file is generated from the public CLI registry. Do not edit by hand.

export type GeneratedCliRouteGroup =
  | "inspect-search-governance"
  | "database-productivity"
  | "host-system-network"
  | "remote-sync"
  | "runtime-workspace"
  | "media-documents"
  | "scaffold-setup"
  | "domain-data"
  | "legacy";

export type GeneratedCliSupportState =
  | "supported"
  | "unsupported"
  | "partial"
  | "external_pending"
  | "host_required"
  | "auth_required"
  | "cost_risk";

export interface GeneratedCliCommandEntry {
  name: string;
  kind: "canonical" | "portal" | "alias";
  summary: string;
  usage?: string;
  advanced?: boolean;
  target?: string;
  aliases?: string[];
  family?: string;
  schemaVersion: number;
  jsonSchemaId: string;
  support: { state: GeneratedCliSupportState; reason: string; scenario: string };
  securityPolicy: string;
  docs: string[];
  adrs: string[];
  tests: string[];
  source: { file: string; symbol?: string };
  relatedSurfaces?: string[];
  routeGroup: GeneratedCliRouteGroup;
}

export const GENERATED_CLI_ROUTER_VERSION = ${JSON.stringify(clawCliCommandRegistry.version)} as const;
export const GENERATED_CLI_COMMANDS = ${tsConst(commands)} as const satisfies readonly GeneratedCliCommandEntry[];
export const GENERATED_KEYWORD_ROUTER_CONCEPTS = ${tsConst(keywordRouterConcepts)} as const;
export const GENERATED_CLI_ROUTE_GROUPS = ${tsConst(routeGroups)} as const satisfies Record<string, GeneratedCliRouteGroup>;
export const GENERATED_STABLE_CLI_COMMANDS = ${tsConst(stableCommands)} as const;
export const GENERATED_COLLECTION_ALIASES = ${tsConst(collectionAliases)} as const;
export const GENERATED_REMOVED_PUBLIC_COMMANDS = ${tsConst(Object.fromEntries(REMOVED_PUBLIC_COMMANDS))} as const;
export const GENERATED_REMOVED_RUNTIME_COMMANDS = ${tsConst(["queue", "job", "event", "retention"])} as const;
export const GENERATED_REMOVED_V1_CRUD_COMMANDS = ${tsConst(["upsert", "list", "get", "delete"])} as const;
export const GENERATED_PUBLIC_PORTAL_HELP_ONLY = ${tsConst(PUBLIC_PORTAL_HELP_ONLY)} as const;
export const GENERATED_JSON_HELP_REQUIRED_COMMANDS = ${tsConst(JSON_HELP_REQUIRED_COMMANDS)} as const;
`;

if (check) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (existing !== generated) {
    printErrors([`${path.relative(rootDir, outputPath)} is stale. Run: node --import tsx ./scripts/generate-cli-router.mjs`]);
    process.exit(1);
  }
  process.exit(0);
}

fs.writeFileSync(outputPath, generated);
