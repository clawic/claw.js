import { BUILTIN_COLLECTIONS_BY_ALIAS } from "./builtins/index.ts";

export const clawCliCommandRegistryVersion = 1;

export type ClawCliSurfaceKind = "canonical" | "portal" | "alias";

export type ClawCliSupportState =
  | "supported"
  | "unsupported"
  | "partial"
  | "external_pending"
  | "host_required"
  | "auth_required"
  | "cost_risk";

export type ClawCliSecurityPolicy =
  | "local_read"
  | "local_write"
  | "signed_host_broker"
  | "auth_required"
  | "external_cost_risk"
  | "unsupported";

export interface ClawCliSupportDeclaration {
  state: ClawCliSupportState;
  reason: string;
  scenario: string;
}

export interface ClawCliCommandSource {
  file: string;
  symbol?: string;
}

export interface ClawCliCommandRegistryEntry {
  name: string;
  kind: ClawCliSurfaceKind;
  summary: string;
  usage?: string;
  advanced?: boolean;
  target?: string;
  aliases?: string[];
  family?: string;
  schemaVersion: number;
  jsonSchemaId: string;
  support: ClawCliSupportDeclaration;
  securityPolicy: ClawCliSecurityPolicy;
  docs: string[];
  adrs: string[];
  tests: string[];
  source: ClawCliCommandSource;
}

export interface ClawCliCommandRegistry {
  version: number;
  commands: ClawCliCommandRegistryEntry[];
}

const DEFAULT_DOCS = ["docs/cli.md"];
const CLI_ADRS = [
  "docs/adr/0001-naming-and-stability-surfaces.md",
  "docs/adr/0004-persistent-surface-registry-and-inspection.md",
  "docs/adr/0007-cli-agent-interface.md",
];
const DEFAULT_TESTS = [
  "packages/clawjs/src/index.test.ts",
  "packages/clawjs/src/inspect-cli.test.ts",
];
const DEFAULT_SOURCE: ClawCliCommandSource = {
  file: "packages/clawjs/src/index.ts",
  symbol: "runCli",
};

function defaultSupportForPolicy(name: string, securityPolicy: ClawCliSecurityPolicy): ClawCliSupportDeclaration {
  if (securityPolicy === "signed_host_broker") {
    return {
      state: "host_required",
      reason: "Sensitive permissions or host-owned capabilities require the active signed host broker.",
      scenario: `claw ${name} --help`,
    };
  }
  if (securityPolicy === "auth_required") {
    return {
      state: "auth_required",
      reason: "The command can inspect local declarations, but live execution requires configured provider or connector authentication.",
      scenario: `claw ${name} --help`,
    };
  }
  if (securityPolicy === "external_cost_risk") {
    return {
      state: "cost_risk",
      reason: "Live execution may call external providers or consume paid resources and must be policy-gated.",
      scenario: `claw ${name} --help`,
    };
  }
  if (securityPolicy === "unsupported") {
    return {
      state: "unsupported",
      reason: "The command is registered for discovery but has no supported runtime path.",
      scenario: `claw ${name} --help`,
    };
  }
  return {
    state: "supported",
    reason: "Registered public CLI surface.",
    scenario: `claw ${name} --help`,
  };
}

function command(input: Omit<ClawCliCommandRegistryEntry, "schemaVersion" | "jsonSchemaId" | "support" | "securityPolicy" | "docs" | "adrs" | "tests" | "source"> & Partial<Pick<ClawCliCommandRegistryEntry, "support" | "securityPolicy" | "docs" | "adrs" | "tests" | "source">>): ClawCliCommandRegistryEntry {
  const securityPolicy = input.securityPolicy ?? "local_read";
  return {
    schemaVersion: 1,
    jsonSchemaId: `claw.cli.${input.name}.v1`,
    support: input.support ?? defaultSupportForPolicy(input.name, securityPolicy),
    securityPolicy,
    docs: input.docs ?? DEFAULT_DOCS,
    adrs: input.adrs ?? CLI_ADRS,
    tests: input.tests ?? DEFAULT_TESTS,
    source: input.source ?? DEFAULT_SOURCE,
    ...input,
  };
}

export const clawCliCommandRegistry: ClawCliCommandRegistry = {
  version: clawCliCommandRegistryVersion,
  commands: [
    command({ name: "host", kind: "canonical", summary: "Host registry, status, services, capabilities, permissions, logs, doctor, daemon lifecycle and domains.", usage: "host list|register|use|status|doctor|domains", securityPolicy: "signed_host_broker", source: { file: "packages/clawjs/src/cli-host-command.ts", symbol: "runHostCli" } }),
    command({ name: "system", kind: "alias", target: "host", summary: "System capabilities alias.", usage: "system capabilities list|grant|revoke", securityPolicy: "signed_host_broker", source: { file: "packages/clawjs/src/cli-host-forward.ts", symbol: "runSystemCapabilitiesCli" } }),
    command({ name: "database", kind: "canonical", summary: "Local database admin surface.", usage: "database serve|login|namespace|collection|record|token|file", securityPolicy: "local_write", source: { file: "packages/clawjs/src/cli-delegated-domains.ts", symbol: "runDelegatedDatabaseCli" } }),
    command({ name: "db", kind: "alias", target: "database", summary: "Exact alias for local-first database CRUD.", usage: "db <collection> list|get|create|update|delete|schema|query", securityPolicy: "local_write", source: { file: "packages/clawjs/src/cli-productivity-command.ts", symbol: "runCoreProductivityDbCli" } }),
    command({ name: "collections", kind: "alias", target: "database", summary: "Database collections shortcut.", usage: "collections list|<collection> list|get|schema", securityPolicy: "local_write" }),
    command({ name: "records", kind: "alias", target: "database", summary: "Database records shortcut.", usage: "records <collection> list|get|create|update|delete", securityPolicy: "local_write" }),
    command({ name: "inspect", kind: "canonical", summary: "Read-only stable surface inspection.", usage: "inspect tree|list|show|why|commands|codebase|connectors|aliases|database|storage|prefs|contracts|apis|private-apis|protocols|events|schemas|ids|cli|env|packages|native|formats|provider-mappings|external|render", source: { file: "packages/clawjs/src/inspect-cli.ts", symbol: "runInspectCli" } }),
    command({ name: "search", kind: "canonical", summary: "Deterministic local discovery across CLI, docs, ADRs, schemas and workspace search.", usage: "search <query>|query <workspace-query>|rebuild", source: { file: "packages/clawjs/src/index.ts", symbol: "runCliUnsafe" } }),
    command({ name: "signals", kind: "canonical", summary: "Signal catalog, verticals and observations backed by the core signals tables.", usage: "signals catalog|seed-catalog|observe|list|delete", family: "signals", securityPolicy: "local_write", source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "report", kind: "canonical", summary: "Agent-originated GitHub report governance with redaction, quality gates, dedupe, preview approval, and safe submission planning.", usage: "report draft|bug|feature|translation|security|check|dedupe|preview|submit|status|triage|templates|github|export|delete|prune|budget", family: "agent", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/agent-rules/reporting.md"], adrs: [...CLI_ADRS, "docs/adr/0011-report-governance-v1.md"], tests: ["packages/clawjs/src/cli-report.test.ts"], source: { file: "packages/clawjs/src/cli-report-command.ts", symbol: "runReportCli" } }),
    command({ name: "needs", kind: "canonical", summary: "Need Route Lab for composable human need scenarios, dry-run evaluation, opportunity dedupe, and approval-gated promotion.", usage: "needs dimensions|pilots|generate|evaluate|opportunities", family: "agent", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/need-route-lab.md"], adrs: [...CLI_ADRS, "docs/adr/0014-need-route-lab-v1.md"], tests: ["packages/clawjs-core/src/need-route-lab.test.ts", "packages/clawjs/src/cli-needs.test.ts"], source: { file: "packages/clawjs/src/cli-needs-command.ts", symbol: "runNeedsCli" } }),
    command({ name: "work", kind: "canonical", summary: "Work umbrella: tasks, notes, projects, goals, inbox, decisions, assignments, handoffs, approvals and snapshots.", usage: "work agenda|review|export|import|backup", securityPolicy: "local_write" }),
    command({ name: "projects", kind: "canonical", summary: "Unified Claw projects.", family: "work", securityPolicy: "local_write" }),
    command({ name: "tasks", kind: "canonical", summary: "Task records and local-first work items.", family: "work", securityPolicy: "local_write" }),
    command({ name: "notes", kind: "canonical", summary: "Notes and pages.", family: "work", securityPolicy: "local_write" }),
    command({ name: "people", kind: "canonical", summary: "People records.", family: "work", securityPolicy: "local_write" }),
    command({ name: "goals", kind: "canonical", summary: "Goal records.", family: "work", securityPolicy: "local_write" }),
    command({ name: "inbox", kind: "canonical", summary: "Inbox and triage.", family: "work", securityPolicy: "local_write" }),
    command({ name: "approvals", kind: "canonical", summary: "Work approvals.", family: "work", securityPolicy: "signed_host_broker" }),
    command({ name: "blockers", kind: "canonical", summary: "Blockers.", family: "work", securityPolicy: "local_write" }),
    command({ name: "decisions", kind: "canonical", summary: "Recorded work decisions.", family: "work", securityPolicy: "local_write" }),
    command({ name: "assignments", kind: "canonical", summary: "Assignments.", family: "work", securityPolicy: "local_write" }),
    command({ name: "handoffs", kind: "canonical", summary: "Handoffs.", family: "work", securityPolicy: "local_write" }),
    command({ name: "artifacts", kind: "canonical", summary: "Work artifacts.", family: "work", securityPolicy: "local_write" }),
    command({ name: "commitments", kind: "canonical", summary: "Promises and follow-ups.", family: "work", securityPolicy: "local_write" }),
    command({ name: "sessions", kind: "canonical", summary: "Agent sessions.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "skills", kind: "canonical", summary: "Skill catalog and assignment.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "models", kind: "canonical", summary: "Model list/defaults.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "providers", kind: "canonical", summary: "Provider catalog and auth state.", family: "runtime", securityPolicy: "auth_required" }),
    command({ name: "auth", kind: "canonical", summary: "Authentication status and login.", family: "runtime", securityPolicy: "auth_required" }),
    command({ name: "time", kind: "canonical", summary: "Time umbrella for calendar, reminders, deadlines, routines, schedule, watch, agenda, timeline and review.", securityPolicy: "local_write" }),
    command({ name: "calendar", kind: "canonical", summary: "Calendar items.", family: "time", securityPolicy: "local_write" }),
    command({ name: "reminders", kind: "canonical", summary: "Reminders.", family: "time", securityPolicy: "local_write" }),
    command({ name: "deadlines", kind: "canonical", summary: "Deadlines.", family: "time", securityPolicy: "local_write" }),
    command({ name: "routines", kind: "canonical", summary: "Recurring routines.", family: "time", securityPolicy: "local_write" }),
    command({ name: "schedule", kind: "canonical", summary: "Natural scheduling verb.", family: "time", securityPolicy: "local_write" }),
    command({ name: "watch", kind: "canonical", summary: "Watch rules.", family: "time", securityPolicy: "local_write" }),
    command({ name: "agenda", kind: "canonical", summary: "Agenda view.", family: "time", source: { file: "packages/clawjs/src/cli-productivity-primary-command.ts", symbol: "runPrimaryProductivityCli" } }),
    command({ name: "timeline", kind: "canonical", summary: "Timeline view.", family: "time", source: { file: "packages/clawjs/src/cli-productivity-primary-command.ts", symbol: "runPrimaryProductivityCli" } }),
    command({ name: "review", kind: "canonical", summary: "Daily/weekly review.", family: "time", source: { file: "packages/clawjs/src/cli-productivity-primary-command.ts", symbol: "runPrimaryProductivityCli" } }),
    command({ name: "channels", kind: "canonical", summary: "Communication channels.", family: "channels", securityPolicy: "auth_required" }),
    command({ name: "telegram", kind: "canonical", summary: "Telegram channel shortcut.", family: "channels", securityPolicy: "auth_required", docs: ["docs/cli.md", "docs/integration-qa-lab.md"], tests: ["packages/clawjs/src/index-telegram.test.ts", "tests/e2e/telegram-surface.spec.ts"] }),
    command({ name: "notify", kind: "canonical", summary: "Send and cancel notifications.", family: "channels", securityPolicy: "signed_host_broker" }),
    command({ name: "messages", kind: "canonical", summary: "Messages resource.", family: "channels", securityPolicy: "auth_required" }),
    command({ name: "integrations", kind: "canonical", summary: "External integrations.", family: "channels", securityPolicy: "auth_required" }),
    command({ name: "media", kind: "canonical", summary: "Media umbrella.", family: "media", securityPolicy: "local_write" }),
    command({ name: "documents", kind: "canonical", summary: "Documents.", family: "media", securityPolicy: "local_write" }),
    command({ name: "files", kind: "canonical", summary: "Workspace files.", family: "media", securityPolicy: "local_write" }),
    command({ name: "images", kind: "canonical", summary: "Image generation and media.", target: "image", aliases: ["image"], family: "media", securityPolicy: "external_cost_risk" }),
    command({ name: "audio", kind: "canonical", summary: "Audio media.", family: "media", securityPolicy: "external_cost_risk" }),
    command({ name: "video", kind: "canonical", summary: "Video media.", family: "media", securityPolicy: "external_cost_risk" }),
    command({ name: "slides", kind: "canonical", summary: "Slide decks.", family: "media", securityPolicy: "local_write" }),
    command({ name: "generations", kind: "canonical", summary: "Generated media records.", family: "media", securityPolicy: "local_write" }),
    command({ name: "templates", kind: "canonical", summary: "Template resources.", target: "template", aliases: ["template"], family: "media", securityPolicy: "local_write" }),
    command({ name: "styles", kind: "canonical", summary: "Style resources.", target: "style", aliases: ["style"], family: "media", securityPolicy: "local_write" }),
    command({ name: "references", kind: "canonical", summary: "Reference resources.", target: "ref", aliases: ["ref"], family: "media", securityPolicy: "local_write" }),
    command({ name: "drive", kind: "portal", summary: "Portal to files, documents, media and integrations.", family: "media" }),
    command({ name: "design", kind: "portal", summary: "Portal to styles, templates, references, slides and images.", family: "media" }),
    command({ name: "apps", kind: "portal", summary: "Portal/catalog of Claw apps and openable surfaces.", family: "apps" }),
    command({ name: "content", kind: "canonical", summary: "Editorial, publishing and CMS surface.", family: "content", securityPolicy: "local_write" }),
    command({ name: "posts", kind: "portal", target: "content", summary: "Content posts shortcut.", family: "content" }),
    command({ name: "campaigns", kind: "portal", target: "content", summary: "Content campaigns shortcut.", family: "content" }),
    command({ name: "publications", kind: "portal", target: "content", summary: "Content publications shortcut.", family: "content" }),
    command({ name: "knowledge", kind: "portal", summary: "Knowledge portal backed by the private memory implementation.", family: "knowledge" }),
    command({ name: "profile", kind: "portal", summary: "Profile portal backed by the private user model.", family: "profile" }),
    command({ name: "health", kind: "portal", summary: "User health domain.", family: "profile" }),
    command({ name: "travel", kind: "portal", summary: "User travel domain.", family: "profile" }),
    command({ name: "career", kind: "portal", summary: "User career domain.", family: "profile" }),
    command({ name: "family", kind: "portal", summary: "User family domain.", family: "profile" }),
    command({ name: "legal", kind: "portal", summary: "User legal domain.", family: "profile" }),
    command({ name: "finance", kind: "portal", summary: "User finance domain.", family: "profile" }),
    command({ name: "location", kind: "portal", summary: "User location domain.", family: "profile" }),
    command({ name: "accounts", kind: "portal", summary: "User accounts domain.", family: "profile" }),
    command({ name: "business", kind: "portal", summary: "Business portal.", family: "business" }),
    command({ name: "social", kind: "portal", target: "content/channels", summary: "Social portal.", family: "social" }),
    command({ name: "runtime", kind: "canonical", summary: "Runtime adapters and setup.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "monitor", kind: "canonical", summary: "Continuous health, uptime and incident monitoring.", family: "diagnostics", advanced: true }),
    command({ name: "logs", kind: "portal", summary: "Global logs portal.", family: "diagnostics" }),
    command({ name: "doctor", kind: "canonical", summary: "Diagnostics and repair checks.", family: "diagnostics" }),
    command({ name: "diagnostics", kind: "portal", target: "doctor", summary: "Diagnostics portal.", family: "diagnostics" }),
    command({ name: "mcp", kind: "canonical", summary: "MCP server catalog.", family: "runtime", advanced: true, securityPolicy: "local_write", source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "open", kind: "canonical", summary: "Open local dashboards and surfaces.", family: "diagnostics", securityPolicy: "local_write" }),
    command({ name: "context", kind: "canonical", summary: "Context packs.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "learning", kind: "canonical", summary: "Learning capture and promotion.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "judgment", kind: "canonical", summary: "Reasoned evaluations distinct from work decisions.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "outcomes", kind: "canonical", summary: "Outcome tracking.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "plan", kind: "canonical", summary: "Semantic planning gate.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "code", kind: "canonical", summary: "Engineering agent workflow.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "rules", kind: "canonical", summary: "Persistent agent rules.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "guidance", kind: "canonical", summary: "Compact just-in-time CLI guidance for agent and human command attempts.", usage: "guidance list|show|create|archive|match", family: "agent", securityPolicy: "local_write", adrs: [...CLI_ADRS, "docs/adr/0010-cli-jit-guidance-actor-assertions-resource-registry.md"], tests: ["packages/clawjs/src/cli-guidance-resources.test.ts", "packages/clawjs-node/src/guidance-resources-actor.test.ts"], source: { file: "packages/clawjs/src/cli-guidance-resources-command.ts", symbol: "runGuidanceResourcesCli" } }),
    command({ name: "resources", kind: "canonical", summary: "Explicit resource registry with opaque res_* identifiers and mutable locators.", usage: "resources list|register|show|resolve|read|status", family: "agent", securityPolicy: "local_write", adrs: [...CLI_ADRS, "docs/adr/0010-cli-jit-guidance-actor-assertions-resource-registry.md"], tests: ["packages/clawjs/src/cli-guidance-resources.test.ts", "packages/clawjs-node/src/guidance-resources-actor.test.ts"], source: { file: "packages/clawjs/src/cli-guidance-resources-command.ts", symbol: "runGuidanceResourcesCli" } }),
    command({ name: "library", kind: "canonical", summary: "Reusable local skills, instructions and bundles.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "soul", kind: "canonical", summary: "Agent identity, posture and persona.", family: "agent", advanced: true, securityPolicy: "local_write" }),
    command({ name: "erp", kind: "canonical", summary: "ERP service.", family: "apps", advanced: true, securityPolicy: "local_write" }),
    command({ name: "iot", kind: "canonical", summary: "IoT service.", family: "apps", advanced: true, securityPolicy: "local_write" }),
    command({ name: "tts", kind: "canonical", summary: "Text-to-speech.", family: "media", advanced: true, securityPolicy: "external_cost_risk" }),
    command({ name: "stt", kind: "canonical", summary: "Speech-to-text.", family: "media", advanced: true, securityPolicy: "external_cost_risk" }),
    command({ name: "voice-notes", kind: "canonical", summary: "Voice notes.", family: "media", advanced: true, securityPolicy: "local_write" }),
    command({ name: "inference", kind: "canonical", summary: "Generic model inference.", family: "runtime", advanced: true, securityPolicy: "external_cost_risk" }),
    command({ name: "preview", kind: "canonical", summary: "Preview sharing.", usage: "preview share --url http://127.0.0.1:PORT", family: "diagnostics", advanced: true, securityPolicy: "local_write" }),
    command({ name: "browser", kind: "canonical", summary: "Relay-backed browser sessions.", usage: "browser status|ensure|share", family: "diagnostics", advanced: true, securityPolicy: "local_write" }),
    command({ name: "compat", kind: "canonical", summary: "Advanced compatibility checks.", family: "diagnostics", advanced: true }),
  ],
};

export const clawCliCommandsByName: ReadonlyMap<string, ClawCliCommandRegistryEntry> =
  new Map(clawCliCommandRegistry.commands.map((entry) => [entry.name, entry]));

export function listClawCliCommands(options: { includeAdvanced?: boolean } = {}): ClawCliCommandRegistryEntry[] {
  return clawCliCommandRegistry.commands.filter((entry) => options.includeAdvanced || !entry.advanced);
}

export function resolveClawCliCommand(name: string | undefined): ClawCliCommandRegistryEntry | undefined {
  if (!name) return undefined;
  return clawCliCommandsByName.get(name);
}

export function isStableClawCliCommand(name: string | undefined): boolean {
  const entry = resolveClawCliCommand(name);
  return !!entry && entry.kind !== "alias";
}

export function listClawCliAliases(): Array<{ alias: string; canonicalName: string; kind: ClawCliSurfaceKind; source: "command" | "collection"; shadowedByCommand?: string }> {
  const aliases: Array<{ alias: string; canonicalName: string; kind: ClawCliSurfaceKind; source: "command" | "collection"; shadowedByCommand?: string }> = [];
  for (const entry of clawCliCommandRegistry.commands) {
    if (entry.kind === "alias" && entry.target) aliases.push({ alias: entry.name, canonicalName: entry.target, kind: entry.kind, source: "command" });
    for (const alias of entry.aliases ?? []) aliases.push({ alias, canonicalName: entry.name, kind: "alias", source: "command" });
  }
  for (const [alias, canonicalName] of BUILTIN_COLLECTIONS_BY_ALIAS) {
    aliases.push({ alias, canonicalName, kind: "alias", source: "collection", ...(clawCliCommandsByName.has(alias) ? { shadowedByCommand: alias } : {}) });
  }
  return aliases.sort((a, b) => a.alias.localeCompare(b.alias));
}

export interface ClawCliSearchResult {
  type: "command" | "alias" | "collection" | "doc" | "adr" | "test" | "source";
  name: string;
  canonicalName?: string;
  score: number;
  summary: string;
  command?: ClawCliCommandRegistryEntry;
  path?: string;
  source?: "command" | "collection";
  shadowedByCommand?: string;
}

function scoreText(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const value = text.toLowerCase();
  if (!q) return 0;
  if (value === q) return 100;
  if (value.startsWith(q)) return 80;
  if (value.includes(q)) return 50;
  const distance = editDistance(q, value);
  if (distance <= 1) return 45;
  if (distance <= 2 && Math.max(q.length, value.length) >= 5) return 35;
  const parts = q.split(/[\s._/-]+/).filter(Boolean);
  return parts.reduce((score, part) => score + (value.includes(part) ? 10 : 0), 0);
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

export function searchClawCliRegistry(query: string, options: { limit?: number } = {}): ClawCliSearchResult[] {
  const results: ClawCliSearchResult[] = [];
  for (const entry of clawCliCommandRegistry.commands) {
    const commandScore = Math.max(scoreText(query, entry.name), scoreText(query, entry.summary), scoreText(query, entry.family ?? ""));
    if (commandScore > 0) {
      results.push({ type: "command", name: entry.name, canonicalName: entry.target ?? entry.name, score: commandScore, summary: entry.summary, command: entry });
    }
    for (const alias of entry.aliases ?? []) {
      const aliasScore = scoreText(query, alias);
      if (aliasScore > 0) {
        results.push({ type: "alias", name: alias, canonicalName: entry.name, score: aliasScore + 5, summary: `Alias for ${entry.name}.`, command: entry });
      }
    }
    for (const doc of entry.docs) {
      const docScore = scoreText(query, doc);
      if (docScore > 0) results.push({ type: "doc", name: doc, canonicalName: entry.name, score: docScore, summary: `Documentation for ${entry.name}.`, command: entry, path: doc });
    }
    for (const adr of entry.adrs) {
      const adrScore = scoreText(query, adr);
      if (adrScore > 0) results.push({ type: "adr", name: adr, canonicalName: entry.name, score: adrScore, summary: `Decision source for ${entry.name}.`, command: entry, path: adr });
    }
    for (const test of entry.tests) {
      const testScore = scoreText(query, test);
      if (testScore > 0) results.push({ type: "test", name: test, canonicalName: entry.name, score: testScore, summary: `Validation for ${entry.name}.`, command: entry, path: test });
    }
    const sourceScore = scoreText(query, entry.source.file);
    if (sourceScore > 0) results.push({ type: "source", name: entry.source.file, canonicalName: entry.name, score: sourceScore, summary: `Implementation source for ${entry.name}.`, command: entry, path: entry.source.file });
  }
  for (const alias of listClawCliAliases().filter((record) => record.source === "collection")) {
    const score = Math.max(scoreText(query, alias.alias), scoreText(query, alias.canonicalName));
    if (score > 0) results.push({ type: "alias", name: alias.alias, canonicalName: alias.canonicalName, score: score + 4, summary: `Collection alias for ${alias.canonicalName}.`, source: "collection", shadowedByCommand: alias.shadowedByCommand });
  }
  return results
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
    .slice(0, options.limit ?? 10);
}
