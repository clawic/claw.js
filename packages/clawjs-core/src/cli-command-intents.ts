import { resolveClawCliCommand, searchClawCliRegistry } from "./cli-command-registry.ts";
import type { ClawCliCommandRegistryEntry, ClawCliSearchResult } from "./cli-command-registry.ts";
import { resolveClawDenseDataIntent } from "./dense-data-os.ts";
import type { ClawDenseDataIntentResolution, ClawDenseDataIntentStatus } from "./dense-data-os.ts";
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
  const denseDataIntent = resolveClawDenseDataIntent(input.phrase);
  if (denseDataIntent.status !== "data_gap") return resolutionFromDenseDataIntent(input.phrase, normalizedPhrase, denseDataIntent, related);
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

function resolutionFromDenseDataIntent(query: string, normalizedPhrase: string, denseDataIntent: ClawDenseDataIntentResolution, related: ClawCliSearchResult[]): ClawCliCommandIntentResolution {
  const status = cliStatusForDenseDataStatus(denseDataIntent.status);
  const mappedCommand = denseDataIntent.center?.commandNoun ?? denseDataIntent.system?.canonicalCommand;
  const relatedCommands = [
    denseDataIntent.system?.canonicalCommand,
    ...(denseDataIntent.system?.aliases ?? []),
    denseDataIntent.center?.commandNoun,
    ...(denseDataIntent.center?.commandAliases ?? []),
  ].filter((command): command is string => Boolean(command));
  const entry = intent(`cmd_intent_dense_${normalizedPhrase.replace(/[^a-z0-9]+/g, "_") || "empty"}`, query, `Resolve dense-data phrase through ${denseDataIntent.system?.label ?? "the dense-data registry"}.`, status, {
    mappedCommand,
    relatedCommands,
    risk: denseDataIntent.system?.sensitivityDefault === "high" ? ["local_read", "local_write"] : ["local_read"],
    evidence: [
      ...denseDataIntent.reasons,
      ...(denseDataIntent.matchedRoute ? [`matchedRoute=${denseDataIntent.matchedRoute}`] : []),
      ...(denseDataIntent.operation ? [`operation=${denseDataIntent.operation.id}`] : []),
    ],
    nextSteps: denseDataIntent.nextSteps,
    reportTarget: status === "covered" || status === "candidate_alias" ? "none" : status === "blocked" ? "github_discussions_feedback" : "github_discussions_ideas",
  });
  return { schemaVersion: 1, query, normalizedPhrase, status, intent: entry, related, nextSteps: entry.nextSteps, execute: false };
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

function cliStatusForDenseDataStatus(status: ClawDenseDataIntentStatus): ClawCliCommandIntentStatus {
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
