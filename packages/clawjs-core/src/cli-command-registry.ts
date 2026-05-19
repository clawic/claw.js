import { BUILTIN_COLLECTIONS_BY_ALIAS } from "./builtins/index.ts";
import { MAC_CONTROL_COMMAND_ROOTS, type MacControlCommandRoot } from "./mac-control-plane.ts";

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
  relatedSurfaces?: string[];
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
const DISCOVERY_ADR = "docs/adr/0017-discoverability-and-meta-code-routing.md";
const COMMAND_INTENT_ADR = "docs/adr/0018-cli-action-intent-registry.md";
const DEFAULT_TESTS = [
  "packages/clawjs/src/index.test.ts",
  "packages/clawjs/src/inspect-cli.test.ts",
];
const DEFAULT_SOURCE: ClawCliCommandSource = {
  file: "packages/clawjs/src/index.ts",
  symbol: "runCli",
};
const MAC_CONTROL_DOCS = ["docs/cli.md", "docs/mac-control-plane.md"];
const MAC_CONTROL_ADRS = [...CLI_ADRS, "docs/adr/0023-mac-control-plane-v1.md", "docs/adr/0024-mac-permission-broker-v1.md"];
const MAC_CONTROL_TESTS = ["packages/clawjs-core/src/mac-control-plane.test.ts", "packages/clawjs/src/cli-mac-control-command.test.ts"];
const EXISTING_MAC_COLLISION_ROOTS = new Set(["audio"]);

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

function macControlCommand(root: MacControlCommandRoot): ClawCliCommandRegistryEntry {
  const usage = root.root === "mac"
    ? "mac atlas|coverage|doctor|audit|plan|revert|permissions"
    : root.root === "permissions"
      ? "permissions list|show|check|request|audit|doctor|explain|coverage"
      : `${root.root} status|list|plan|coverage [--dry-run]`;
  return command({
    name: root.root,
    kind: "canonical",
    summary: root.summary,
    usage,
    family: "mac-control",
    securityPolicy: "signed_host_broker",
    docs: MAC_CONTROL_DOCS,
    adrs: MAC_CONTROL_ADRS,
    tests: MAC_CONTROL_TESTS,
    source: { file: "packages/clawjs/src/cli-mac-control-command.ts", symbol: "runMacControlCli" },
    relatedSurfaces: root.relatedSurfaces,
  });
}

export const clawCliCommandRegistry: ClawCliCommandRegistry = {
  version: clawCliCommandRegistryVersion,
  commands: [
    command({ name: "setup", kind: "canonical", summary: "Reviewable progressive setup for minimal, normal and advanced modes.", usage: "setup [minimal|normal|advanced] [--apply] [--workspace PATH]", family: "diagnostics", securityPolicy: "local_write", docs: ["docs/cli.md"], adrs: [...CLI_ADRS, "docs/adr/0031-progressive-modularity-and-zero-surprise-install.md"], tests: ["packages/clawjs/src/cli-modules-command.test.ts"], source: { file: "packages/clawjs/src/cli-modules-command.ts", symbol: "runSetupCli" } }),
    command({ name: "modules", kind: "canonical", summary: "List, enable, disable and explicitly install progressive capabilities and areas.", usage: "modules list|status|enable|disable|install [module-id] [--available] [--workspace PATH]", family: "diagnostics", securityPolicy: "local_write", docs: ["docs/cli.md"], adrs: [...CLI_ADRS, "docs/adr/0031-progressive-modularity-and-zero-surprise-install.md"], tests: ["packages/clawjs/src/cli-modules-command.test.ts"], source: { file: "packages/clawjs/src/cli-modules-command.ts", symbol: "runModulesCli" } }),
    command({ name: "host", kind: "canonical", summary: "Host registry, status, services, capabilities, permissions, logs, doctor, daemon lifecycle and domains.", usage: "host list|register|use|status|doctor|domains", securityPolicy: "signed_host_broker", source: { file: "packages/clawjs/src/cli-host-command.ts", symbol: "runHostCli" }, relatedSurfaces: ["system capabilities"] }),
    command({ name: "system", kind: "canonical", summary: "Read-only system telemetry, signed-host snapshots, metric history, rules, widgets, provider catalog, plan-first controls and preserved capabilities alias.", usage: "system snapshot [--source host]|metrics list|history|watch|rules|widgets|providers|controls|capabilities", securityPolicy: "local_read", source: { file: "packages/clawjs/src/cli-system-command.ts", symbol: "runSystemCli" }, relatedSurfaces: ["claw host capabilities", "claw monitor"] }),
    ...MAC_CONTROL_COMMAND_ROOTS.filter((root) => !EXISTING_MAC_COLLISION_ROOTS.has(root.root)).map(macControlCommand),
    command({ name: "database", kind: "canonical", summary: "Local database admin surface.", usage: "database serve|login|namespace|collection|record|token|file", securityPolicy: "local_write", source: { file: "packages/clawjs/src/cli-delegated-domains.ts", symbol: "runDelegatedDatabaseCli" } }),
    command({ name: "db", kind: "alias", target: "database", summary: "Exact alias for local-first database CRUD.", usage: "db <collection> list|get|create|update|delete|schema|query", securityPolicy: "local_write", source: { file: "packages/clawjs/src/cli-productivity-command.ts", symbol: "runCoreProductivityDbCli" } }),
    command({ name: "collections", kind: "alias", target: "database", summary: "Database collections shortcut.", usage: "collections list|<collection> list|get|schema", securityPolicy: "local_write" }),
    command({ name: "records", kind: "alias", target: "database", summary: "Database records shortcut.", usage: "records <collection> list|get|create|update|delete", securityPolicy: "local_write" }),
    command({ name: "contacts", kind: "alias", target: "database", summary: "Contacts collection shortcut with host broker forwarding when a signed host is active.", usage: "contacts list|get|create|update|delete|schema", family: "profile", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/index-host.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/database-magic.ts", symbol: "runMagicDbCli" }, relatedSurfaces: ["claw permissions show contacts"] }),
    command({ name: "inspect", kind: "canonical", summary: "Read-only stable surface inspection.", usage: "inspect tree|list|show|neighbors|routes|route|agent|edges|why|commands|governance|codebase|connectors|aliases|database|storage|prefs|contracts|apis|private-apis|protocols|events|schemas|ids|cli|env|packages|native|formats|provider-mappings|external|render", adrs: [...CLI_ADRS, "docs/adr/0012-surface-route-graph.md", DISCOVERY_ADR], source: { file: "packages/clawjs/src/inspect-cli.ts", symbol: "runInspectCli" } }),
    command({ name: "remote", kind: "canonical", summary: "Remote surface classification, compatibility adapters, route inspection, E2E plans, and conformance checks for Coordinator/Gateway/Connector access.", usage: "remote classify|check|routes|conformance|offline-command|pending|validation-checklist|validation-template|validation-artifact|validation-runbook|validation-readiness|validation-approval-request|validation-report|source-qa-template|decision-review|closure-gate|contracts|e2e-plan|compat", family: "runtime", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/relay.md"], adrs: [...CLI_ADRS, "docs/adr/0022-remote-gateway-sync-redesign.md"], tests: ["packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/cli-remote-sync-command.ts", symbol: "runRemoteCli" } }),
    command({ name: "sync", kind: "canonical", summary: "Sync manifests, status, planning, durable local queues, encrypted client cache snapshots, reconciliation, driver-application receipts, execution dry-runs, and conflict inspection across hosts and resources.", usage: "sync manifest|status|plan|run|reconcile|apply|conflicts|cache", family: "runtime", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/relay.md"], adrs: [...CLI_ADRS, "docs/adr/0022-remote-gateway-sync-redesign.md"], tests: ["packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/cli-remote-sync-command.ts", symbol: "runSyncCli" } }),
    command({ name: "nodes", kind: "canonical", summary: "Node identity, pairing, trust, invitation, acceptance, scoped sharing, revocation, and heartbeat surfaces for the user's mesh.", usage: "nodes list|pair|trust|revoke|invite|accept|share|heartbeat", family: "runtime", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/relay.md"], adrs: [...CLI_ADRS, "docs/adr/0022-remote-gateway-sync-redesign.md"], tests: ["packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/cli-remote-sync-command.ts", symbol: "runNodesCli" } }),
    command({ name: "gateway", kind: "canonical", summary: "Gateway service projection, agent service receipts, secret leases, provider receipts, and hosted/self-hosted conformance for headless or remote hosts.", usage: "gateway serve|project|conformance|agent-service|secret-lease|secret-provider", family: "runtime", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/relay.md"], adrs: [...CLI_ADRS, "docs/adr/0022-remote-gateway-sync-redesign.md"], tests: ["packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/cli-remote-sync-command.ts", symbol: "runGatewayCli" } }),
    command({ name: "dense-fixtures", kind: "canonical", summary: "Seed dense-data acceptance fixtures into local core.sqlite for DB and CLI coverage checks.", usage: "dense-fixtures seed", family: "database", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/dense-data-decision-matrix.md"], adrs: [...CLI_ADRS, "docs/adr/0021-dense-data-operating-system.md"], tests: ["packages/clawjs/src/cli-discovery.test.ts"], source: { file: "packages/clawjs/src/cli-dense-data-command.ts", symbol: "runDenseDataCli" } }),
    command({ name: "dense-fixture", kind: "alias", target: "dense-fixtures", summary: "Singular alias for dense-data fixture seeding.", usage: "dense-fixture seed", family: "database", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/dense-data-decision-matrix.md"], adrs: [...CLI_ADRS, "docs/adr/0021-dense-data-operating-system.md"], tests: ["packages/clawjs/src/cli-discovery.test.ts"], source: { file: "packages/clawjs/src/cli-dense-data-command.ts", symbol: "runDenseDataCli" } }),
    command({ name: "search", kind: "canonical", summary: "Framework-wide Search, source registry, service lifecycle, saved searches, monitors, actions, audit, profiles and deterministic local discovery.", usage: "search query|sources|status|service|rebuild|changes|saved|monitors|actions|audit|profiles|explain", docs: ["docs/cli.md", "skills/docs-alignment-update/SKILL.md", "skills/decision-map-maintenance/SKILL.md", "skills/adr-to-guardrail/SKILL.md"], adrs: [...CLI_ADRS, DISCOVERY_ADR], source: { file: "packages/clawjs/src/index.ts", symbol: "runCliUnsafe" } }),
    command({ name: "signals", kind: "canonical", summary: "Signal catalog, verticals and observations backed by the core signals tables.", usage: "signals catalog|seed-catalog|observe|list|delete", family: "signals", securityPolicy: "local_write", source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "life", kind: "alias", target: "signals", summary: "Life verticals alias backed by the signals catalog and observations.", usage: "life catalog|seed-catalog|observe|list|delete", family: "signals", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "report", kind: "canonical", summary: "Agent-originated GitHub report governance with redaction, quality gates, dedupe, preview approval, and safe submission planning.", usage: "report draft|bug|feature|translation|security|check|dedupe|preview|submit|status|triage|templates|github|export|delete|prune|budget", family: "agent", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/agent-rules/reporting.md"], adrs: [...CLI_ADRS, "docs/adr/0011-report-governance-v1.md"], tests: ["packages/clawjs/src/cli-report.test.ts"], source: { file: "packages/clawjs/src/cli-report-command.ts", symbol: "runReportCli" } }),
    command({ name: "needs", kind: "canonical", summary: "Need Route Lab for composable human need scenarios, dry-run evaluation, opportunity dedupe, and approval-gated promotion.", usage: "needs dimensions|pilots|generate|evaluate|opportunities", family: "agent", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/need-route-lab.md"], adrs: [...CLI_ADRS, "docs/adr/0014-need-route-lab-v1.md"], tests: ["packages/clawjs-core/src/need-route-lab.test.ts", "packages/clawjs/src/cli-needs.test.ts"], source: { file: "packages/clawjs/src/cli-needs-command.ts", symbol: "runNeedsCli" } }),
    command({ name: "commands", kind: "canonical", summary: "Actionable CLI command-intent registry, explicit local ledger, deterministic resolution, Need-compatible opportunities, and report promotion packets.", usage: "commands resolve|record|list|opportunities|promote", family: "agent", securityPolicy: "local_write", docs: ["docs/cli.md"], adrs: [...CLI_ADRS, DISCOVERY_ADR, COMMAND_INTENT_ADR], tests: ["packages/clawjs-core/src/cli-command-intents.test.ts", "packages/clawjs/src/cli-commands.test.ts", "packages/clawjs/src/cli-discovery.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/cli-commands-command.ts", symbol: "runCommandsCli" } }),
    command({ name: "evolution", kind: "canonical", summary: "Compatibility evolution ledger, migration planning, rescue diagnostics, redacted receipts, and repair operator surface.", usage: "evolution list|show|diff|plan|dry-run|apply|verify|doctor|repair|rollback|backup|receipt|report", family: "diagnostics", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/evolution/README.md"], adrs: [...CLI_ADRS, "docs/adr/0030-post-v1-evolution-rescue-backbone.md"], tests: ["packages/clawjs-core/src/index.test.ts", "packages/clawjs/src/index.test.ts", "scripts/evolution-governance-check.mjs"], source: { file: "packages/clawjs/src/cli-evolution-command.ts", symbol: "runEvolutionCli" } }),
    command({ name: "safety", kind: "canonical", summary: "Regulated domain safety policy, classifications, checks, explanations, disclaimers, and output labels.", usage: "safety domains|classify|check|explain|disclaimers", family: "agent", securityPolicy: "local_read", docs: ["docs/cli.md", "docs/regulated-domain-safety.md"], adrs: [...CLI_ADRS, "docs/adr/0026-regulated-domain-safety-liability-boundary.md"], tests: ["packages/clawjs-core/src/regulated-domain-safety.test.ts", "packages/clawjs/src/cli-safety.test.ts"], source: { file: "packages/clawjs/src/cli-safety-command.ts", symbol: "runSafetyCli" } }),
    command({ name: "work", kind: "canonical", summary: "Work umbrella: tasks, notes, projects, goals, inbox, decisions, assignments, handoffs, approvals and snapshots.", usage: "work agenda|review|export|import|backup", securityPolicy: "local_write" }),
    command({ name: "project", kind: "canonical", summary: "Project folder manifest, attach/detach, safe handoff, and path-mutable project identity.", usage: "project inspect|attach|detach|export|import|sync-handoff", family: "work", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/workspace.md"], adrs: [...CLI_ADRS, "docs/adr/0027-governance-identity-scope-model.md", "docs/adr/0028-workspace-project-folder-manifest.md"], tests: ["packages/clawjs/src/cli-project-command.test.ts"], source: { file: "packages/clawjs/src/cli-project-command.ts", symbol: "runProjectManifestCli" } }),
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
    command({ name: "agents", kind: "canonical", summary: "Canonical Agents V1 definitions, assignments, execution profiles, grants, memory policies, dispatch plans, context packs, tool catalogs, creation reviews, storage audits, audit coverage, operational snapshots, control panels, privacy lifecycle plans, optional Paperclip imports, budgets, runs, gated access, assignment routing, memory isolation, and external identity projection.", usage: "agents list|get|upsert|delete|schema|evaluate-access|delegation-check|supervisor-check|route-check|resolve-external-identity|project-support-inbox|memory-check|budget-check|action-severity|autonomy-check|dispatch-plan|context-pack|tool-catalog|creation-review|storage-audit|audit-coverage|operational-snapshot|control-panel|privacy-plan|paperclip-import|surface-projection|config-revision|incident|activity-feed|blueprint|evaluation|retirement-plan", family: "agent", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts", "packages/clawjs-core/src/agents-v1.test.ts"], source: { file: "packages/clawjs/src/v1-data-agent-entities.ts", symbol: "runAgentsCommand" } }),
    command({ name: "personalities", kind: "canonical", summary: "Reusable framework personality prompts.", usage: "personalities list|get|upsert|delete", family: "agent", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data-agent-entities.ts", symbol: "runPersonalitiesCommand" } }),
    command({ name: "skills", kind: "canonical", summary: "Skill catalog and assignment.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "skill-collections", kind: "canonical", summary: "Reusable framework skill collection records.", usage: "skill-collections list|get|upsert|delete", family: "agent", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data-agent-entities.ts", symbol: "runSkillCollectionsCommand" } }),
    command({ name: "connections", kind: "canonical", summary: "Framework connection records with opaque host secret refs.", usage: "connections list|get|upsert|delete", family: "agent", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data-agent-entities.ts", symbol: "runConnectionsCommand" } }),
    command({ name: "snippets", kind: "canonical", summary: "Framework snippets, prompts, templates and slash command bindings.", usage: "snippets list|upsert|delete", family: "agent", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data-agent-config.ts", symbol: "runSnippetsCommand" } }),
    command({ name: "models", kind: "canonical", summary: "Model list/defaults.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "providers", kind: "canonical", summary: "Provider catalog, auth state, routing and enabled settings.", usage: "providers list|catalog|auth-state|routing|settings", family: "runtime", securityPolicy: "local_write", tests: ["packages/clawjs/src/index.test.ts", "packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data-agent-config.ts", symbol: "runProviderRoutingCommand" } }),
    command({ name: "auth", kind: "canonical", summary: "Authentication status and login.", family: "runtime", securityPolicy: "auth_required" }),
    command({ name: "time", kind: "canonical", summary: "Time umbrella for calendar, reminders, deadlines, routines, schedule, watch, agenda, timeline and review.", securityPolicy: "local_write" }),
    command({ name: "calendar", kind: "canonical", summary: "Framework calendar event records and host calendar projection.", usage: "calendar create|list|get|update|delete", family: "time", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" }, relatedSurfaces: ["claw permissions show calendar"] }),
    command({ name: "reminders", kind: "canonical", summary: "Reminders.", family: "time", securityPolicy: "local_write", relatedSurfaces: ["claw permissions show reminders"] }),
    command({ name: "deadlines", kind: "canonical", summary: "Deadlines.", family: "time", securityPolicy: "local_write" }),
    command({ name: "routines", kind: "canonical", summary: "Recurring routines.", family: "time", securityPolicy: "local_write" }),
    command({ name: "schedule", kind: "canonical", summary: "Natural scheduling verb.", family: "time", securityPolicy: "local_write" }),
    command({ name: "watch", kind: "canonical", summary: "Watch rules.", family: "time", securityPolicy: "local_write" }),
    command({ name: "agenda", kind: "canonical", summary: "Agenda view.", family: "time", source: { file: "packages/clawjs/src/cli-productivity-primary-command.ts", symbol: "runPrimaryProductivityCli" } }),
    command({ name: "timeline", kind: "canonical", summary: "Timeline view.", family: "time", source: { file: "packages/clawjs/src/cli-productivity-primary-command.ts", symbol: "runPrimaryProductivityCli" } }),
    command({ name: "review", kind: "canonical", summary: "Daily/weekly review.", family: "time", source: { file: "packages/clawjs/src/cli-productivity-primary-command.ts", symbol: "runPrimaryProductivityCli" } }),
    command({ name: "channels", kind: "canonical", summary: "Communication channels.", family: "channels", securityPolicy: "auth_required" }),
    command({ name: "telegram", kind: "canonical", summary: "Telegram channel shortcut.", family: "channels", securityPolicy: "auth_required", docs: ["docs/cli.md", "docs/integration-qa-lab.md"], tests: ["packages/clawjs/src/index-telegram.test.ts", "tests/e2e/telegram-codex-bridge.spec.ts", "scripts/verify-integration-qa-scenarios.mjs"] }),
    command({ name: "notify", kind: "canonical", summary: "Send and cancel notifications.", family: "channels", securityPolicy: "signed_host_broker", relatedSurfaces: ["claw notification"] }),
    command({ name: "messages", kind: "canonical", summary: "Messages resource.", family: "channels", securityPolicy: "auth_required" }),
    command({ name: "connectors", kind: "canonical", summary: "Strict third-party connector control plane and governed context authority.", usage: "connectors list|inspect|capabilities|policy|budgets|audit|operation|operations|context|ctx", family: "runtime", securityPolicy: "signed_host_broker", docs: ["docs/cli.md", "docs/connector-control-plane.md"], adrs: [...CLI_ADRS, "docs/adr/0015-connector-control-plane-v1.md", "docs/adr/0029-connector-governed-context-v1.md"], tests: ["packages/clawjs-core/src/connector-control-plane.test.ts", "packages/clawjs-core/src/connector-governed-context.test.ts", "packages/clawjs/src/cli-connector-context.test.ts", "packages/clawjs/src/inspect-cli.test.ts"] }),
    command({ name: "integrations", kind: "alias", target: "connectors", summary: "Discovery alias delegated to connectors.", family: "runtime", securityPolicy: "auth_required", docs: ["docs/cli.md", "docs/connector-control-plane.md"], adrs: [...CLI_ADRS, "docs/adr/0015-connector-control-plane-v1.md"] }),
    command({ name: "media", kind: "canonical", summary: "Media umbrella.", family: "media", securityPolicy: "local_write" }),
    command({ name: "docs", kind: "canonical", summary: "Public Markdown docs.", usage: "docs page list|get|upsert|delete", family: "media", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/search.md"], tests: ["packages/clawjs/src/cli-search-index.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "documents", kind: "canonical", summary: "Documents.", family: "media", securityPolicy: "local_write" }),
    command({ name: "files", kind: "canonical", summary: "Workspace files.", family: "media", securityPolicy: "local_write", relatedSurfaces: ["claw permissions show files"] }),
    command({ name: "images", kind: "canonical", summary: "Image generation and media.", target: "image", aliases: ["image"], family: "media", securityPolicy: "external_cost_risk" }),
    command({ name: "audio", kind: "canonical", summary: "Framework audio catalog, transcripts and generated audio records.", usage: "audio index|transcript|artifact list|get|delete", family: "media", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" }, relatedSurfaces: ["claw mac coverage audio"] }),
    command({ name: "video", kind: "canonical", summary: "Video media.", family: "media", securityPolicy: "external_cost_risk" }),
    command({ name: "slides", kind: "canonical", summary: "Slide decks.", family: "media", securityPolicy: "local_write" }),
    command({ name: "sheets", kind: "canonical", summary: "Workbook manifests.", usage: "sheets workbook list|get|upsert|delete", family: "media", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/search.md"], tests: ["packages/clawjs/src/cli-search-manifest-sources.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "generations", kind: "canonical", summary: "Generated media records.", family: "media", securityPolicy: "local_write" }),
    command({ name: "templates", kind: "canonical", summary: "Template resources.", target: "template", aliases: ["template"], family: "media", securityPolicy: "local_write" }),
    command({ name: "styles", kind: "canonical", summary: "Style resources.", target: "style", aliases: ["style"], family: "media", securityPolicy: "local_write" }),
    command({ name: "references", kind: "canonical", summary: "Reference resources.", target: "ref", aliases: ["ref"], family: "media", securityPolicy: "local_write" }),
    command({ name: "drive", kind: "portal", summary: "Portal to files, documents, media and integrations.", family: "media" }),
    command({ name: "design", kind: "canonical", summary: "Framework design resource registry.", usage: "design list|upsert|delete", family: "media", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "apps", kind: "canonical", summary: "Framework app catalog and openable surface records.", usage: "apps list|upsert|delete", family: "apps", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" }, relatedSurfaces: ["claw app"] }),
    command({ name: "marketplace", kind: "canonical", summary: "Framework marketplace choices and install decision records.", usage: "marketplace choice upsert|list|get|delete", family: "apps", securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "packages/clawjs/src/inspect-cli.test.ts"], source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
    command({ name: "content", kind: "canonical", summary: "Editorial, publishing and CMS control plane.", usage: "content brand|destination|campaign|entry|approval|publish", family: "content", securityPolicy: "local_write", tests: ["packages/clawjs/src/cli-discovery.test.ts", "packages/clawjs/src/inspect-cli.test.ts", "packages/clawjs-core/src/domain-surface-registry.test.ts"], source: { file: "packages/clawjs/src/cli-delegated-domains.ts", symbol: "runDelegatedContentCli" } }),
    command({ name: "knowledge", kind: "portal", summary: "Knowledge portal backed by the private memory implementation.", family: "knowledge" }),
    command({ name: "profile", kind: "portal", summary: "Profile portal backed by the private user model.", family: "profile" }),
    command({ name: "health", kind: "portal", summary: "User health domain.", family: "profile" }),
    command({ name: "travel", kind: "portal", summary: "User travel domain.", family: "profile" }),
    command({ name: "career", kind: "portal", summary: "User career domain.", family: "profile" }),
    command({ name: "family", kind: "portal", summary: "User family domain.", family: "profile" }),
    command({ name: "legal", kind: "portal", summary: "User legal domain.", family: "profile" }),
    command({ name: "finance", kind: "portal", summary: "User finance domain.", family: "profile" }),
    command({ name: "location", kind: "portal", summary: "User location domain.", family: "profile", relatedSurfaces: ["claw permissions show location"] }),
    command({ name: "accounts", kind: "canonical", summary: "Human-facing governed accounts, provider resources, defaults, policies and context checks.", usage: "accounts list|show|schema|upsert|edit|link-secret|defaults|doctor|validate|explain|export|activate|pause|block|retire|audit", family: "profile", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/connector-governed-context.md"], adrs: [...CLI_ADRS, "docs/adr/0029-connector-governed-context-v1.md"], tests: ["packages/clawjs-core/src/connector-governed-context.test.ts", "packages/clawjs/src/cli-connector-context.test.ts"], source: { file: "packages/clawjs/src/cli-connector-context-command.ts", symbol: "runConnectorContextCli" } }),
    command({ name: "acct", kind: "alias", target: "accounts", summary: "Short alias for governed accounts context.", usage: "acct list|show|schema|upsert|edit|link-secret|defaults|doctor|validate|explain|export", family: "profile", securityPolicy: "local_write", docs: ["docs/cli.md", "docs/connector-governed-context.md"], adrs: [...CLI_ADRS, "docs/adr/0029-connector-governed-context-v1.md"], tests: ["packages/clawjs/src/cli-connector-context.test.ts"], source: { file: "packages/clawjs/src/cli-connector-context-command.ts", symbol: "runConnectorContextCli" } }),
    command({ name: "business", kind: "portal", summary: "Business portal.", family: "business" }),
    command({ name: "social", kind: "portal", target: "content/channels", summary: "Social portal.", family: "social" }),
    command({ name: "runtime", kind: "canonical", summary: "Runtime adapters and setup.", family: "runtime", securityPolicy: "local_write" }),
    command({ name: "monitor", kind: "canonical", summary: "Continuous health, uptime and incident monitoring.", family: "diagnostics", advanced: true }),
    command({ name: "logs", kind: "portal", summary: "Global logs portal.", family: "diagnostics" }),
    command({ name: "doctor", kind: "canonical", summary: "Diagnostics and repair checks.", family: "diagnostics" }),
    command({ name: "diagnostics", kind: "portal", target: "doctor", summary: "Diagnostics portal.", family: "diagnostics" }),
    command({ name: "mcp", kind: "canonical", summary: "MCP server catalog.", usage: "mcp list|get|upsert|delete|config-path", family: "runtime", securityPolicy: "local_write", source: { file: "packages/clawjs/src/v1-data.ts", symbol: "runV1DataCli" } }),
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
    command({ name: "iot", kind: "canonical", summary: "IoT config records and brokered home automation service.", usage: "iot config|serve|homes|things|state|lights|climate|scenes|automations|approvals", family: "apps", advanced: true, securityPolicy: "local_write", tests: ["packages/clawjs/src/index-data.test.ts", "iot/tests/e2e/cli.e2e.test.ts", "iot/tests/e2e/backend.e2e.test.ts"], source: { file: "packages/clawjs/src/cli-delegated-domains.ts", symbol: "runDelegatedIotCli" } }),
    command({ name: "tts", kind: "canonical", summary: "Text-to-speech.", family: "media", advanced: true, securityPolicy: "external_cost_risk", relatedSurfaces: ["claw speech", "claw microphone"] }),
    command({ name: "stt", kind: "canonical", summary: "Speech-to-text.", family: "media", advanced: true, securityPolicy: "external_cost_risk", relatedSurfaces: ["claw speech", "claw microphone"] }),
    command({ name: "voice-notes", kind: "canonical", summary: "Voice notes.", family: "media", advanced: true, securityPolicy: "local_write", relatedSurfaces: ["claw microphone", "claw speech"] }),
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
    const shadowedByCommand = clawCliCommandsByName.has(alias) ? alias : undefined;
    aliases.push({ alias, canonicalName, kind: "alias", source: "collection", ...(shadowedByCommand ? { shadowedByCommand } : {}) });
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
    for (const relatedSurface of entry.relatedSurfaces ?? []) {
      const relatedScore = scoreText(query, relatedSurface);
      if (relatedScore > 0) results.push({ type: "alias", name: relatedSurface, canonicalName: entry.name, score: relatedScore + 6, summary: `Related surface for ${entry.name}.`, command: entry });
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
