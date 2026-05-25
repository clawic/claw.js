import { resolveClawCliCommand, searchClawCliRegistry } from "./cli-command-registry.ts";
import type { ClawCliCommandRegistryEntry, ClawCliSearchResult } from "./cli-command-registry.ts";
import { resolveBuiltinCollectionName } from "./builtins/index.ts";
import { resolveClawProfessionalRecordsIntent } from "./dense-data-os.ts";
import type { ClawProfessionalRecordsIntentResolution, ClawProfessionalRecordsIntentStatus } from "./dense-data-os.ts";
import { scoreNeedOpportunity } from "./need-route-lab.ts";
import type { NeedOpportunity, NeedOpportunityKind, NeedRouteMaturityState } from "./need-route-lab.ts";

export type ClawCliCommandIntentStatus =
  | "covered"
  | "candidate_alias"
  | "gap"
  | "future"
  | "blocked"
  | "external_pending";

export type ClawCliCommandIntentSource = "registry" | "ledger";

export type ClawCliCommandIntentRisk =
  | "local_read"
  | "local_write"
  | "destructive"
  | "cost"
  | "native_permission"
  | "secret"
  | "physical_world"
  | "external_service";

export interface ClawCliCommandIntentEntry {
  schemaVersion: 1;
  id: string;
  phrase: string;
  normalizedPhrase: string;
  language: string;
  purpose: string;
  status: ClawCliCommandIntentStatus;
  source: ClawCliCommandIntentSource;
  mappedCommand?: string;
  relatedCommands: string[];
  risk: ClawCliCommandIntentRisk[];
  evidence: string[];
  nextSteps: string[];
  reportTarget: "none" | "github_discussions_ideas" | "github_discussions_feedback" | "github_issues";
  createdAt?: string;
  updatedAt?: string;
}

export interface ClawCliCommandIntentResolution {
  schemaVersion: 1;
  query: string;
  normalizedPhrase: string;
  status: ClawCliCommandIntentStatus;
  intent: ClawCliCommandIntentEntry;
  related: ClawCliSearchResult[];
  nextSteps: string[];
  execute: false;
}

export const CLAW_CLI_COMMAND_INTENT_STATUSES: ClawCliCommandIntentStatus[] = [
  "covered",
  "candidate_alias",
  "gap",
  "future",
  "blocked",
  "external_pending",
];

const registryEntries: ClawCliCommandIntentEntry[] = [
  intent("cmd_intent_tasks_list", "tasks list", "List workspace tasks.", "covered", {
    mappedCommand: "tasks",
    relatedCommands: ["tasks", "work"],
    risk: ["local_read"],
    evidence: ["Registered canonical command `tasks`."],
    nextSteps: ["Run `claw tasks list --json` or inspect `claw tasks --help`."],
  }),
  intent("cmd_intent_people_find", "find people", "Find people records.", "candidate_alias", {
    mappedCommand: "people",
    relatedCommands: ["people", "search"],
    risk: ["local_read"],
    evidence: ["`people` is covered; `find people` is a likely natural-language alias, not an activated alias."],
    nextSteps: ["Use `claw people query <text> --json` if available, or record the phrase with `claw commands record` before proposing an alias."],
  }),
  intent("cmd_intent_show_tasks", "show tasks", "Show current task records.", "candidate_alias", {
    mappedCommand: "tasks",
    relatedCommands: ["tasks", "work"],
    risk: ["local_read"],
    evidence: ["`tasks` is covered; `show tasks` is candidate alias vocabulary."],
    nextSteps: ["Use `claw tasks list --json`; candidate aliases stay inactive until promoted."],
  }),
  intent("cmd_intent_fix_doctor", "fix doctor", "Repair diagnostics found by doctor.", "candidate_alias", {
    mappedCommand: "doctor",
    relatedCommands: ["doctor", "diagnostics"],
    risk: ["local_write"],
    evidence: ["`doctor` is covered, but automatic repair needs explicit subcommand design."],
    nextSteps: ["Run `claw doctor --help`; promote as a feature if repair verbs need first-class coverage."],
  }),
  intent("cmd_intent_system_capabilities", "system capabilities", "Inspect or manage host capabilities through the system alias.", "covered", {
    mappedCommand: "host",
    relatedCommands: ["system", "host"],
    risk: ["native_permission"],
    evidence: ["`system capabilities` routes to the signed host capabilities surface."],
    nextSteps: ["Run `claw system capabilities list --json`."],
  }),
  intent("cmd_intent_image_create", "image create", "Generate or register image media.", "covered", {
    mappedCommand: "images",
    relatedCommands: ["images", "media"],
    risk: ["cost", "external_service"],
    evidence: ["`image` is an approved singular alias to `images`."],
    nextSteps: ["Run `claw images --help`; live provider generation remains policy-gated."],
  }),
  intent("cmd_intent_database_records", "database records", "Work with local database records.", "covered", {
    mappedCommand: "database",
    relatedCommands: ["database", "db", "records"],
    risk: ["local_write"],
    evidence: ["`database`, `db`, and `records` are registered CLI surfaces."],
    nextSteps: ["Run `claw database --help` or `claw db <collection> list --json`."],
  }),
  intent("cmd_intent_runtime_portal", "runtime ecosystem portal", "Discover native runtime ecosystem operations for OpenClaw, Codex, Hermes, and future runtimes.", "covered", {
    mappedCommand: "runtime <runtime-id>",
    relatedCommands: ["runtime", "openclaw", "codex", "hermes"],
    risk: ["local_read", "local_write", "external_service"],
    evidence: ["ADR 0047 defines `claw runtime <runtime-id> ... --json` as the native ecosystem portal, not top-level command sprawl."],
    nextSteps: ["Run `claw runtime openclaw commands --json`, `claw runtime codex commands --json`, or `claw runtime hermes commands --json`."],
  }),
  intent("cmd_intent_runtime_domains", "runtime domains", "List the manifest-backed domains projected by a runtime ecosystem portal.", "covered", {
    mappedCommand: "runtime <runtime-id> domains",
    relatedCommands: ["runtime", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["The runtime portal exposes manifest-exact domains with support policy, provenance, command matrix, and domainData projection metadata."],
    nextSteps: ["Run `claw runtime openclaw domains --json`, `claw runtime codex domains --json`, or `claw runtime hermes domains --json`."],
  }),
  intent("cmd_intent_runtime_support", "runtime support", "Audit runtime ecosystem support claims, blockers, and evidence requirements without executing live or write actions.", "covered", {
    mappedCommand: "runtime <runtime-id> support",
    relatedCommands: ["runtime", "support", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["`runtime <runtime-id> support --json` aggregates domain support contracts, blocker classes, and evidence requirements so support claims are not inferred from adapter existence."],
    nextSteps: ["Run `claw runtime openclaw support --json`, `claw runtime codex support --json`, or `claw runtime hermes support --json` before promoting a runtime support claim."],
  }),
  intent("cmd_intent_runtime_resources", "runtime resources", "Read a single manifest domain from a runtime ecosystem portal without scanning unrelated domains.", "covered", {
    mappedCommand: "runtime <runtime-id> resources <domain>",
    relatedCommands: ["runtime", "resources", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["`runtime <runtime-id> resources <domain> --json` requires an explicit valid manifest domain and returns a stable JSON error envelope for missing or unknown domains."],
    nextSteps: ["Run `claw runtime <runtime-id> resources gateway --json` or another manifest domain such as `sessions`, `skills`, `auth`, `doctorCompat`, `sandboxPermissions`, or `configuration`."],
  }),
  intent("cmd_intent_runtime_domain", "runtime domain", "Inspect one runtime ecosystem domain by manifest name or supported alias.", "covered", {
    mappedCommand: "runtime <runtime-id> domain <domain>",
    relatedCommands: ["runtime", "domain", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["`runtime <runtime-id> domain <domain> --json` returns the selected domain payload and reports unknown domains as stable JSON usage errors under `--json`."],
    nextSteps: ["Run `claw runtime <runtime-id> domain sessions --json` for session inventory or `claw runtime <runtime-id> domain configuration --json` for redacted config projection."],
  }),
  intent("cmd_intent_runtime_sessions_list", "runtime sessions list", "List native runtime sessions through the runtime ecosystem portal.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions list",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["The runtime portal exposes session listing as a runtime-scoped action with authority and write policy in the JSON response."],
    nextSteps: ["Run `claw runtime openclaw sessions list --json`; use `codex` or `hermes` for runtime-path metadata projection where available."],
  }),
  intent("cmd_intent_runtime_sessions_preview", "runtime sessions preview", "Preview a native runtime session through the runtime ecosystem portal.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions preview",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["OpenClaw delegates preview to the official gateway; Codex/Hermes use bounded local session-path preview and require `--include-content` for content samples."],
    nextSteps: ["Run `claw runtime openclaw sessions preview --session-key <id> --json` or add `--include-content` only when a bounded local preview is intended."],
  }),
  intent("cmd_intent_runtime_sessions_resolve", "runtime sessions resolve", "Resolve a native runtime session identifier through the runtime ecosystem portal.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions resolve",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["OpenClaw delegates resolve to the official gateway; Codex/Hermes resolve configured session-path identifiers without reading transcript content or writing runtime state."],
    nextSteps: ["Run `claw runtime <runtime-id> sessions resolve --session-key <id> --json` to inspect the native identifier mapping and provenance."],
  }),
  intent("cmd_intent_runtime_sessions_history", "runtime sessions history", "Read native runtime session history through a bounded runtime-scoped contract.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions history",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes"],
    risk: ["local_read"],
    evidence: ["OpenClaw delegates history to the official gateway; Codex/Hermes use bounded redacted session-path history with metadata-only default and explicit `--include-content` for content samples."],
    nextSteps: ["Run `claw runtime <runtime-id> sessions history --session-key <id> --json`; add `--include-content` only for an intentional bounded redacted content sample."],
  }),
  intent("cmd_intent_runtime_sessions_send", "runtime sessions send", "Send a message through a native runtime session when an official write path exists.", "covered", {
    mappedCommand: "runtime openclaw sessions send",
    relatedCommands: ["runtime", "sessions", "openclaw"],
    risk: ["local_write", "external_service"],
    evidence: ["OpenClaw `sessions send` is exposed only through the official gateway wrapper and requires `--confirm-runtime-write` before writing to the runtime."],
    nextSteps: ["Run without `--confirm-runtime-write` first to receive the non-mutating confirmation plan; add the flag only for an intentional runtime write."],
  }),
  intent("cmd_intent_runtime_sessions_inject", "runtime sessions inject", "Inject a system note through a native runtime session when an official write path exists.", "covered", {
    mappedCommand: "runtime openclaw sessions inject",
    relatedCommands: ["runtime", "sessions", "openclaw"],
    risk: ["local_write", "external_service"],
    evidence: ["OpenClaw `sessions inject` is exposed only through the official gateway wrapper and requires `--confirm-runtime-write` before writing to the runtime."],
    nextSteps: ["Run without `--confirm-runtime-write` first to receive the non-mutating confirmation plan; add the flag only for an intentional runtime write."],
  }),
  intent("cmd_intent_runtime_sessions_abort", "runtime sessions abort", "Abort a native runtime session run when an official control path exists.", "covered", {
    mappedCommand: "runtime openclaw sessions abort",
    relatedCommands: ["runtime", "sessions", "openclaw"],
    risk: ["local_write", "external_service"],
    evidence: ["OpenClaw `sessions abort` is exposed only through the official gateway wrapper and requires `--confirm-runtime-write` before sending native control state."],
    nextSteps: ["Run without `--confirm-runtime-write` first to receive the non-mutating confirmation plan; add the flag only for an intentional runtime control action."],
  }),
  intent("cmd_intent_runtime_sessions_create", "runtime sessions create", "Request creation of a native runtime session only when an official create contract exists.", "blocked", {
    mappedCommand: "runtime <runtime-id> sessions create",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes"],
    risk: ["local_write", "external_service"],
    evidence: ["Runtime session create is recognized by the portal but returns a non-mutating create plan until an official runtime create API/CLI, fixture, and round-trip evidence exist."],
    nextSteps: ["Run `claw runtime <runtime-id> sessions create --title <title> --json` to inspect the blocked create plan; do not write directly to runtime stores or create a Claw portable session and label it native."],
  }),
  intent("cmd_intent_runtime_sessions_pin", "runtime sessions pin", "Pin a native runtime session in the local Clawix/ClawJS overlay without writing back to the runtime.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions pin",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes", "host"],
    risk: ["local_write"],
    evidence: ["Runtime session pins are stored through the ClawJS app-state overlay with `writesRuntime: false` because no official cross-runtime pin write-back contract exists."],
    nextSteps: ["Run `claw runtime <runtime-id> sessions pin --session-key <id> --json`; inspect `claw host app-state projection --json` for the local overlay receipt."],
  }),
  intent("cmd_intent_runtime_sessions_unpin", "runtime sessions unpin", "Remove a native runtime session pin from the local Clawix/ClawJS overlay without writing back to the runtime.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions unpin",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes", "host"],
    risk: ["local_write"],
    evidence: ["Runtime session unpin removes only the local app-state overlay and preserves runtime-owned pin state until an official runtime write-back contract exists."],
    nextSteps: ["Run `claw runtime <runtime-id> sessions unpin --session-key <id> --json`; inspect `claw host app-state projection --json` to confirm the overlay was removed."],
  }),
  intent("cmd_intent_runtime_sessions_conflicts", "runtime sessions conflicts", "Inspect local runtime-session overlays and divergence without writing back to the runtime.", "covered", {
    mappedCommand: "runtime <runtime-id> sessions conflicts",
    relatedCommands: ["runtime", "sessions", "openclaw", "codex", "hermes", "host"],
    risk: ["local_read"],
    evidence: ["Runtime session conflicts report local overlays, native row presence, write-back blockage, and `no_silent_overwrite` policy with `writesRuntime: false`."],
    nextSteps: ["Run `claw runtime <runtime-id> sessions conflicts --json` before deciding whether to remove a local overlay or wait for an official runtime write-back contract."],
  }),
  intent("cmd_intent_command_demand", "request command", "Ask for a command or alias that does not exist yet.", "gap", {
    mappedCommand: "commands",
    relatedCommands: ["commands", "needs", "report"],
    risk: ["local_write"],
    evidence: ["V1 adds command-intent records but not automatic alias activation."],
    nextSteps: ["Run `claw commands record --phrase <phrase> --purpose <purpose> --json`.", "Use `claw commands opportunities --json` to produce Need-compatible opportunities."],
  }),
  intent("cmd_intent_house_buy", "house buy", "Explore whether a future agent could help with buying a house.", "future", {
    relatedCommands: ["life", "finance", "legal", "location", "accounts"],
    risk: ["cost", "physical_world", "external_service"],
    evidence: ["Buying a house needs money, legal process, external services, and human approval. V1 must not execute it."],
    nextSteps: ["Treat this as future vocabulary only.", "Promote as a feature idea if the desired safe sub-surface becomes concrete."],
  }),
  intent("cmd_intent_delete_secrets", "delete secrets", "Delete secret material directly from the CLI.", "blocked", {
    relatedCommands: ["host", "auth", "approvals"],
    risk: ["secret", "destructive", "native_permission"],
    evidence: ["Direct secret deletion is sensitive and must remain brokered by signed host approvals."],
    nextSteps: ["Use approved host/auth flows only.", "Do not create executable shortcut aliases for this phrase."],
  }),
  intent("cmd_intent_turn_lights_on", "turn lights on", "Control physical lights from agent vocabulary.", "external_pending", {
    mappedCommand: "iot",
    relatedCommands: ["iot", "approvals"],
    risk: ["physical_world", "external_service", "native_permission"],
    evidence: ["Physical-device execution requires configured provider/device fixtures and approval gates."],
    nextSteps: ["Record as EXTERNAL PENDING until hardware/provider validation exists.", "Use `claw iot --help` for the bounded local control-plane surface."],
  }),
  intent("cmd_intent_buy_flight", "buy flight", "Purchase a flight ticket.", "blocked", {
    relatedCommands: ["travel", "finance", "approvals"],
    risk: ["cost", "external_service", "destructive"],
    evidence: ["Purchase execution is cost-bearing and outside V1 autonomous command-intent behavior."],
    nextSteps: ["Model research or planning separately; do not execute purchase verbs from intent resolution."],
  }),
  intent("cmd_intent_export_all", "export everything", "Export all user/workspace data.", "gap", {
    relatedCommands: ["work", "database", "files"],
    risk: ["local_read", "secret"],
    evidence: ["Top-level export/import/backup aliases are intentionally not approved as broad public commands."],
    nextSteps: ["Resolve the exact surface and privacy boundary before proposing a command."],
  }),
];

const COLLECTION_INTENT_ACTIONS = new Set(["list", "get", "create", "update", "delete", "query", "schema"]);

function intent(
  id: string,
  phrase: string,
  purpose: string,
  status: ClawCliCommandIntentStatus,
  overrides: Partial<Omit<ClawCliCommandIntentEntry, "schemaVersion" | "id" | "phrase" | "normalizedPhrase" | "language" | "purpose" | "status" | "source">> = {},
): ClawCliCommandIntentEntry {
  const reportTarget = status === "covered" || status === "candidate_alias"
    ? "none"
    : status === "blocked"
      ? "github_discussions_feedback"
      : "github_discussions_ideas";
  return {
    schemaVersion: 1,
    id,
    phrase,
    normalizedPhrase: normalizeClawCliCommandIntentPhrase(phrase),
    language: "en",
    purpose,
    status,
    source: "registry",
    relatedCommands: [],
    risk: ["local_read"],
    evidence: [],
    nextSteps: [],
    reportTarget,
    ...overrides,
  };
}

export function normalizeClawCliCommandIntentPhrase(phrase: string): string {
  return phrase
    .trim()
    .replace(/^claw\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function listClawCliCommandIntentRegistry(): ClawCliCommandIntentEntry[] {
  return registryEntries.map((entry) => ({ ...entry, relatedCommands: [...entry.relatedCommands], risk: [...entry.risk], evidence: [...entry.evidence], nextSteps: [...entry.nextSteps] }));
}

export function mergeClawCliCommandIntentEntries(ledgerEntries: ClawCliCommandIntentEntry[] = []): ClawCliCommandIntentEntry[] {
  const merged = new Map<string, ClawCliCommandIntentEntry>();
  for (const entry of listClawCliCommandIntentRegistry()) merged.set(entry.id, entry);
  for (const entry of ledgerEntries) merged.set(entry.id, normalizeCommandIntentEntry(entry, "ledger"));
  return [...merged.values()].sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || a.normalizedPhrase.localeCompare(b.normalizedPhrase));
}

export function normalizeCommandIntentEntry(entry: ClawCliCommandIntentEntry, source: ClawCliCommandIntentSource = entry.source): ClawCliCommandIntentEntry {
  return {
    schemaVersion: 1,
    id: entry.id,
    phrase: entry.phrase,
    normalizedPhrase: normalizeClawCliCommandIntentPhrase(entry.normalizedPhrase || entry.phrase),
    language: entry.language || "und",
    purpose: entry.purpose,
    status: CLAW_CLI_COMMAND_INTENT_STATUSES.includes(entry.status) ? entry.status : "gap",
    source,
    mappedCommand: entry.mappedCommand,
    relatedCommands: Array.isArray(entry.relatedCommands) ? [...entry.relatedCommands] : [],
    risk: Array.isArray(entry.risk) ? [...entry.risk] : ["local_read"],
    evidence: Array.isArray(entry.evidence) ? [...entry.evidence] : [],
    nextSteps: Array.isArray(entry.nextSteps) ? [...entry.nextSteps] : [],
    reportTarget: entry.reportTarget || "github_discussions_ideas",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function resolveClawCliCommandIntent(input: {
  phrase: string;
  ledgerEntries?: ClawCliCommandIntentEntry[];
  limit?: number;
}): ClawCliCommandIntentResolution {
  const normalizedPhrase = normalizeClawCliCommandIntentPhrase(input.phrase);
  const entries = mergeClawCliCommandIntentEntries(input.ledgerEntries);
  const exact = entries.find((entry) => entry.normalizedPhrase === normalizedPhrase);
  const related = searchClawCliRegistry(normalizedPhrase, { limit: input.limit ?? 5 });
  if (exact) {
    return {
      schemaVersion: 1,
      query: input.phrase,
      normalizedPhrase,
      status: exact.status,
      intent: exact,
      related,
      nextSteps: exact.nextSteps,
      execute: false,
    };
  }
  const firstToken = normalizedPhrase.split(" ")[0] ?? "";
  const command = firstToken ? resolveClawCliCommand(firstToken) : undefined;
  if (command) return resolutionFromCommand(input.phrase, normalizedPhrase, command, related);
  const collectionResolution = resolutionFromCollectionAlias(input.phrase, normalizedPhrase, related);
  const professionalRecordsIntent = resolveClawProfessionalRecordsIntent(input.phrase);
  if (collectionResolution && (professionalRecordsIntent.status === "data_gap" || professionalRecordsIntent.status === "external_pending")) return collectionResolution;
  if (professionalRecordsIntent.status !== "data_gap") return resolutionFromProfessionalRecordsIntent(input.phrase, normalizedPhrase, professionalRecordsIntent, related);
  if (collectionResolution) return collectionResolution;
  return resolutionFromRelated(input.phrase, normalizedPhrase, related);
}

export function commandIntentToNeedOpportunity(entry: ClawCliCommandIntentEntry): NeedOpportunity | null {
  if (entry.status === "covered") return null;
  const kind = kindForIntent(entry.status);
  const state = stateForIntent(entry.status);
  const title = `CLI command intent: ${entry.phrase}`;
  const affectedSurfaces = ["claw.cli.command.commands", "claw.cli.command.needs", "claw.cli.command.report", "claw.workspace.command_intents", ...entry.relatedCommands.map((command) => `claw.cli.command.${command}`)];
  return {
    schemaVersion: 1,
    id: `command_intent.${entry.id}`,
    title,
    kind,
    state,
    routeId: "cli.commandIntentResolution",
    pilotPackId: "cli_action_vocabulary_v1",
    summary: `${entry.purpose} Status: ${entry.status}.`,
    evidence: [...entry.evidence, `phrase=${entry.phrase}`, `status=${entry.status}`],
    affectedSurfaces,
    source: "known_discovery_gap",
    externalPending: entry.status === "external_pending",
    score: scoreNeedOpportunity({
      severity: entry.status === "blocked" ? 8 : 6,
      humanScope: 7,
      frequency: entry.status === "candidate_alias" ? 8 : 5,
      routeBlocker: entry.status === "gap" ? 7 : 4,
      constitutionalRisk: entry.risk.some((risk) => ["secret", "destructive", "cost", "physical_world"].includes(risk)) ? 8 : 5,
      effort: entry.status === "candidate_alias" ? 3 : 6,
      reuseLeverage: 8,
      confidence: entry.source === "registry" ? 8 : 6,
    }),
    relations: [],
    fingerprint: ["command_intent", entry.status, entry.normalizedPhrase, ...entry.relatedCommands].join("|").replace(/[^a-z0-9|]+/g, "_"),
  };
}

function resolutionFromCommand(query: string, normalizedPhrase: string, command: ClawCliCommandRegistryEntry, related: ClawCliSearchResult[]): ClawCliCommandIntentResolution {
  const canonical = command.kind === "alias" && command.target ? command.target : command.name;
  const entry = intent(`cmd_intent_dynamic_${normalizedPhrase.replace(/[^a-z0-9]+/g, "_")}`, query, `Resolve to registered CLI command ${canonical}.`, command.kind === "alias" ? "candidate_alias" : "covered", {
    mappedCommand: canonical,
    relatedCommands: [command.name, ...(command.target ? [command.target] : [])],
    evidence: [`First token matches registered ${command.kind} command \`${command.name}\`.`],
    nextSteps: command.kind === "alias"
      ? [`Use canonical command \`claw ${canonical} --help\`; this phrase is not promoted as a new alias by resolution alone.`]
      : [`Run \`claw ${canonical} --help\` for the supported command surface.`],
    reportTarget: "none",
  });
  return { schemaVersion: 1, query, normalizedPhrase, status: entry.status, intent: entry, related, nextSteps: entry.nextSteps, execute: false };
}

function resolutionFromProfessionalRecordsIntent(query: string, normalizedPhrase: string, professionalRecordsIntent: ClawProfessionalRecordsIntentResolution, related: ClawCliSearchResult[]): ClawCliCommandIntentResolution {
  const status = cliStatusForProfessionalRecordsStatus(professionalRecordsIntent.status);
  const mappedCommand = professionalRecordsIntent.center?.commandNoun ?? professionalRecordsIntent.system?.canonicalCommand;
  const relatedCommands = [
    professionalRecordsIntent.system?.canonicalCommand,
    ...(professionalRecordsIntent.system?.aliases ?? []),
    professionalRecordsIntent.center?.commandNoun,
    ...(professionalRecordsIntent.center?.commandAliases ?? []),
  ].filter((command): command is string => Boolean(command));
  const entry = intent(`cmd_intent_dense_${normalizedPhrase.replace(/[^a-z0-9]+/g, "_") || "empty"}`, query, `Resolve dense-data phrase through ${professionalRecordsIntent.system?.label ?? "the dense-data registry"}.`, status, {
    mappedCommand,
    relatedCommands,
    risk: professionalRecordsIntent.system?.sensitivityDefault === "high" ? ["local_read", "local_write"] : ["local_read"],
    evidence: [
      ...professionalRecordsIntent.reasons,
      ...(professionalRecordsIntent.matchedRoute ? [`matchedRoute=${professionalRecordsIntent.matchedRoute}`] : []),
      ...(professionalRecordsIntent.operation ? [`operation=${professionalRecordsIntent.operation.id}`] : []),
    ],
    nextSteps: professionalRecordsIntent.nextSteps,
    reportTarget: status === "covered" || status === "candidate_alias" ? "none" : status === "blocked" ? "github_discussions_feedback" : "github_discussions_ideas",
  });
  return { schemaVersion: 1, query, normalizedPhrase, status, intent: entry, related, nextSteps: entry.nextSteps, execute: false };
}

function resolutionFromCollectionAlias(query: string, normalizedPhrase: string, related: ClawCliSearchResult[]): ClawCliCommandIntentResolution | undefined {
  const tokens = normalizedPhrase.split(" ").filter(Boolean);
  const alias = tokens[0];
  if (!alias) return undefined;
  const collectionName = resolveBuiltinCollectionName(alias);
  if (!collectionName) return undefined;
  const rawAction = tokens[1];
  const action = rawAction ?? "list";
  if (!COLLECTION_INTENT_ACTIONS.has(action)) return undefined;
  const mappedCommand = `db ${collectionName} ${action}`;
  const entry = intent(`cmd_intent_collection_${collectionName}_${alias}_${action}`.replace(/[^a-z0-9_]+/g, "_"), query, `Resolve audited collection command ${alias} ${action} through the local database.`, "covered", {
    mappedCommand,
    relatedCommands: ["database", "db", collectionName, alias],
    risk: action === "list" || action === "get" || action === "query" || action === "schema" ? ["local_read"] : ["local_read", "local_write"],
    evidence: [`First token is an audited built-in collection alias for \`${collectionName}\`.`, `mappedCommand=claw ${mappedCommand}`],
    nextSteps: [`Run \`claw ${alias} ${action} --json\` or \`claw db ${collectionName} ${action} --json\`.`],
    reportTarget: "none",
  });
  return { schemaVersion: 1, query, normalizedPhrase, status: entry.status, intent: entry, related, nextSteps: entry.nextSteps, execute: false };
}

function resolutionFromRelated(query: string, normalizedPhrase: string, related: ClawCliSearchResult[]): ClawCliCommandIntentResolution {
  const likelyCommands = related.filter((entry) => entry.canonicalName).slice(0, 3).map((entry) => entry.canonicalName as string);
  const status: ClawCliCommandIntentStatus = likelyCommands.length ? "candidate_alias" : "gap";
  const entry = intent(`cmd_intent_unregistered_${normalizedPhrase.replace(/[^a-z0-9]+/g, "_") || "empty"}`, query, "Unregistered CLI action phrase resolved without execution.", status, {
    mappedCommand: likelyCommands[0],
    relatedCommands: likelyCommands,
    evidence: likelyCommands.length ? ["Deterministic discovery found nearby registered commands."] : ["No exact or nearby registered command matched this phrase."],
    nextSteps: likelyCommands.length
      ? [`Try \`claw ${likelyCommands[0]} --help\` or record this phrase with purpose before proposing an alias.`]
      : ["Record the phrase with `claw commands record --phrase <phrase> --purpose <purpose> --json`.", "Promote through `claw commands opportunities` if this is a repeatable agent need."],
  });
  return { schemaVersion: 1, query, normalizedPhrase, status, intent: entry, related, nextSteps: entry.nextSteps, execute: false };
}

function cliStatusForProfessionalRecordsStatus(status: ClawProfessionalRecordsIntentStatus): ClawCliCommandIntentStatus {
  if (status === "covered") return "covered";
  if (status === "partial" || status === "alias_candidate") return "candidate_alias";
  if (status === "external_pending") return "external_pending";
  if (status === "blocked") return "blocked";
  return "gap";
}

function statusOrder(status: ClawCliCommandIntentStatus): number {
  return CLAW_CLI_COMMAND_INTENT_STATUSES.indexOf(status);
}

function kindForIntent(status: ClawCliCommandIntentStatus): NeedOpportunityKind {
  if (status === "candidate_alias") return "surface";
  if (status === "blocked") return "security";
  if (status === "external_pending") return "validation";
  if (status === "gap") return "feature";
  return "research";
}

function stateForIntent(status: ClawCliCommandIntentStatus): NeedRouteMaturityState {
  if (status === "candidate_alias") return "candidate";
  if (status === "gap") return "observed_gap";
  if (status === "future") return "parked";
  if (status === "blocked") return "rejected";
  if (status === "external_pending") return "accepted";
  return "shipped";
}
