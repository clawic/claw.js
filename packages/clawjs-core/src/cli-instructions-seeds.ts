import {
  type ClawInstruction,
  type InstructionEvent,
  type InstructionTarget,
  type SeedInstruction,
  clawInstructionsSchemaVersion,
  compareResolvedInstructions,
  instructionMatchesEvent,
  isInstructionActive,
} from "./cli-instructions.ts";

export interface CatalogSeedEntry {
  source: string;
  seed: SeedInstruction;
}

const PRIORITY_BLOCK = 90;
const PRIORITY_WARN = 75;
const PRIORITY_INFO = 50;

function entry(source: string, seed: SeedInstruction): CatalogSeedEntry {
  return { source, seed };
}

function policy(
  source: string,
  target: InstructionTarget,
  priority: number,
  severity: SeedInstruction["severity"],
  body: Pick<
    SeedInstruction,
    "useWhen" | "useNot" | "readPolicy" | "writePolicy" | "before" | "after" | "forbid" | "notes"
  >,
): CatalogSeedEntry {
  return entry(source, {
    schemaVersion: clawInstructionsSchemaVersion,
    target,
    trigger: "surface-action",
    activation: "auto",
    priority,
    severity,
    ...body,
  });
}

function hook(
  source: string,
  trigger: SeedInstruction["trigger"],
  target: InstructionTarget,
  priority: number,
  severity: SeedInstruction["severity"],
  body: Pick<
    SeedInstruction,
    "useWhen" | "useNot" | "readPolicy" | "writePolicy" | "before" | "after" | "forbid" | "notes"
  >,
): CatalogSeedEntry {
  return entry(source, {
    schemaVersion: clawInstructionsSchemaVersion,
    target,
    trigger,
    activation: "auto",
    priority,
    severity,
    ...body,
  });
}

export const CATALOG_SEED_INSTRUCTIONS: ReadonlyArray<CatalogSeedEntry> = [
  policy(
    "catalog:tasks.write",
    { command: "tasks", action: "write" },
    PRIORITY_BLOCK,
    "warn",
    {
      useWhen: "The user states a concrete action they want done. Capture the smallest doable step.",
      useNot: "Do not capture decisions, references, or notes here. Those have dedicated commands.",
      writePolicy: "Each task should be doable in under 10 minutes unless the user explicitly asks for a larger scope.",
      before: "If the user states an outcome, restate it as the smallest concrete action before writing.",
    },
  ),
  policy(
    "catalog:tasks.read",
    { command: "tasks", action: "read" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Prefer `claw tasks list --status=open --json` over scanning raw collection rows.",
      before: "When the user asks what they should do next, read open tasks before suggesting work.",
    },
  ),
  policy(
    "catalog:tasks.list",
    { command: "tasks", action: "list" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Filter by status before rendering long lists. Default to open tasks; archived only when asked.",
    },
  ),

  policy(
    "catalog:decisions.write",
    { command: "decisions", action: "write" },
    PRIORITY_BLOCK,
    "block",
    {
      useWhen: "The user is committing to a course of action with reasoning, alternatives considered, and trade-offs.",
      useNot: "Do not record one-off preferences as decisions. Use memory for preferences and tasks for actions.",
      writePolicy: "A decision row must capture context, the chosen option, alternatives considered, and a short justification.",
      forbid: "Never create a decision without an explicit user commitment phrase.",
    },
  ),
  policy(
    "catalog:decisions.read",
    { command: "decisions", action: "read" },
    PRIORITY_WARN,
    "warn",
    {
      readPolicy: "Read decisions before recommending a path that contradicts a recent commitment.",
      before: "Cite the decision id (and updatedAt) when reusing one in a recommendation.",
    },
  ),

  policy(
    "catalog:notes.write",
    { command: "notes", action: "write" },
    PRIORITY_WARN,
    "warn",
    {
      useWhen: "The user shares context, references, or knowledge that does not commit to action.",
      useNot: "Do not stash tasks here. If the content describes work to be done, use tasks instead.",
      writePolicy: "Keep notes self-contained: title, context, and the durable insight in the body.",
    },
  ),
  policy(
    "catalog:notes.read",
    { command: "notes", action: "read" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Prefer `claw notes search <terms>` over listing the whole collection.",
    },
  ),

  policy(
    "catalog:inbox.read",
    { command: "inbox", action: "read" },
    PRIORITY_WARN,
    "warn",
    {
      readPolicy: "Triage inbox items before starting open-ended work; the user may have unprocessed signals.",
      before: "Surface the count of unprocessed items in your first sentence when relevant.",
    },
  ),
  policy(
    "catalog:inbox.write",
    { command: "inbox", action: "write" },
    PRIORITY_INFO,
    "info",
    {
      useWhen: "The user shares raw input that has not yet been classified into a dedicated surface.",
      after: "After capturing to inbox, surface the option to triage it now.",
    },
  ),

  policy(
    "catalog:agenda.read",
    { command: "agenda", action: "read" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Read the agenda before recommending time blocks or scheduling work.",
    },
  ),

  policy(
    "catalog:people.write",
    { command: "people", action: "write" },
    PRIORITY_WARN,
    "warn",
    {
      useWhen: "The user mentions a new contact by name with at least one durable attribute.",
      useNot: "Do not create person rows for one-off mentions without identifying details.",
      writePolicy: "Always include the source of the contact (where you met / how you know them) when known.",
      forbid: "Never store sensitive credentials, identifiers, or health attributes in people rows.",
    },
  ),

  policy(
    "catalog:memory.read",
    { command: "memory", action: "read" },
    PRIORITY_WARN,
    "warn",
    {
      readPolicy: "Search memory before answering anything that depends on durable user preferences.",
      before: "Cite the memory source when applying a preference (file path or memory id).",
    },
  ),
  policy(
    "catalog:memory.write",
    { command: "memory", action: "write" },
    PRIORITY_WARN,
    "warn",
    {
      useWhen: "The user explicitly states a durable preference, fact about themselves, or a correction worth remembering.",
      useNot: "Do not infer preferences from silence; require explicit confirmation or repeated evidence.",
      writePolicy: "Memory entries are tiered. Promote to HOT only after the same lesson has applied 3 or more times.",
    },
  ),

  policy(
    "catalog:db.write",
    { command: "db", action: "write" },
    PRIORITY_BLOCK,
    "block",
    {
      useWhen: "Working with a collection that has no dedicated command yet.",
      useNot: "If a dedicated command exists (claw tasks, claw notes, claw decisions, claw inbox, ...), use it.",
      forbid: "Never use claw db to bypass policies attached to the dedicated command for the same collection.",
    },
  ),
  policy(
    "catalog:db.read",
    { command: "db", action: "read" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Prefer the dedicated command when it exists; claw db is a fallback for schema and migration work.",
    },
  ),

  hook(
    "catalog:session-start.bootstrap",
    "session-start",
    { alias: "productivity" },
    PRIORITY_WARN,
    "info",
    {
      before: "At session start, list open tasks and unprocessed inbox items before proposing new work.",
      notes:
        "When the user starts a session, the productivity surfaces (tasks, inbox, agenda) are the highest-signal context. Read them first.",
    },
  ),

  policy(
    "catalog:agent-rules.commands.command-output.read",
    { command: "commands", action: "read" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Prefer --json for agent-readable output when inspecting Claw state or command results.",
      notes: "Core discovery commands include info, doctor, workspace inspect, and features describe.",
    },
  ),
  policy(
    "catalog:agent-rules.commands.command-safety.write",
    { command: "commands", action: "write" },
    PRIORITY_BLOCK,
    "block",
    {
      useWhen: "A command may touch real services, paid APIs, production data, installs, auth, or destructive flows.",
      forbid: "Do not run those commands unless isolated or explicitly approved.",
    },
  ),
  policy(
    "catalog:agent-rules.channels.channels.write",
    { command: "channels", action: "write" },
    PRIORITY_WARN,
    "warn",
    {
      useWhen: "Configuring external message ingestion, listener flows, bridges, or reply routing.",
      writePolicy: "Preserve channel session context and respect owner authorization, topic authorization, reply policy, queue, stop, compact, and status commands.",
    },
  ),
  policy(
    "catalog:agent-rules.reporting.report-flow.write",
    { command: "report", action: "write" },
    PRIORITY_BLOCK,
    "block",
    {
      useWhen: "Helping a user send feedback, bug reports, features, translations, or security reports to GitHub.",
      writePolicy: "Draft, check, dedupe, preview, and publish only after explicit user confirmation through the Claw GitHub connector.",
    },
  ),
  policy(
    "catalog:agent-rules.reporting.report-safety.write",
    { command: "report", action: "write" },
    PRIORITY_BLOCK,
    "block",
    {
      forbid: "Never publish raw logs, secrets, local usernames, private URLs, auth headers, tokens, production data, or public security findings.",
      useNot: "Do not create automatic pull requests or publish when a report lacks enough actionable information.",
    },
  ),
  policy(
    "catalog:agent-rules.reporting.report-retention.delete",
    { command: "report", action: "delete" },
    PRIORITY_BLOCK,
    "block",
    {
      useWhen: "Managing report retention, pruning, or cleanup.",
      writePolicy: "Use report export, delete, and prune only for manual retention.",
      forbid: "Do not close, lock, suppress, or upload attachments automatically.",
    },
  ),
  policy(
    "catalog:agent-rules.rules-skills-library.rules.read",
    { command: "rules", action: "read" },
    PRIORITY_INFO,
    "info",
    {
      readPolicy: "Choose the smallest durable mechanism: rules for always-on behavior, skills for procedures, library for reusable assets, and soul for identity.",
      before: "Use rules list/compile, skills search, or library resolve/sync before expanding always-loaded instructions.",
    },
  ),
  policy(
    "catalog:agent-rules.runtime.state-inspection.read",
    { command: "runtime", action: "read" },
    PRIORITY_WARN,
    "warn",
    {
      readPolicy: "Inspect runtime, auth, models, and provider auth state before changing runtime state.",
      before: "For host-dependent issues, validate in the same execution mode the user uses.",
    },
  ),
  policy(
    "catalog:agent-rules.runtime.state-repair.write",
    { command: "runtime", action: "write" },
    PRIORITY_WARN,
    "warn",
    {
      writePolicy: "Use runtime repair and runtime setup-workspace before manual file edits.",
      before: "Use dry-run for install, uninstall, repair, and setup plans when available.",
    },
  ),
  policy(
    "catalog:agent-rules.secrets.secret-values.write",
    { command: "secrets", action: "write" },
    PRIORITY_BLOCK,
    "block",
    {
      useWhen: "Working with secret references, connector config, plugin config, CLI calls, or model code.",
      writePolicy: "Use secretName references, brokered HTTP, or typed actions; never resolve secretRefs into plaintext.",
      forbid: "Do not ask for, print, store, or log master passwords, Secret Keys, recovery phrases, Emergency Kits, signed-host tokens, or host assertion keys.",
    },
  ),
  policy(
    "catalog:agent-rules.secrets.secret-metadata.read",
    { command: "secrets", action: "read" },
    PRIORITY_WARN,
    "warn",
    {
      readPolicy: "Discover only metadata with secrets list, describe, types, and capabilities.",
      forbid: "Missing principal, host, placement, risk, capability, approval, or policy context means stop and fail closed.",
    },
  ),
  policy(
    "catalog:agent-rules.service-surfaces.surfaces.write",
    { command: "surfaces", action: "write" },
    PRIORITY_WARN,
    "warn",
    {
      writePolicy: "Use the product surface that owns the domain instead of routing through a generic fallback.",
      notes: "Dedicated surfaces include Relay, media, time, notify, content, IoT, database, ERP, drive, execution, and delegation.",
    },
  ),
  policy(
    "catalog:agent-rules.workspace-loop.workspace.read",
    { command: "workspace", action: "read" },
    PRIORITY_WARN,
    "warn",
    {
      readPolicy: "Search workspace state before unmanaged files and use my-work or team-work for coordination loops.",
      before: "Use tasks, projects, goals, blockers, decisions, and notes before creating loose local records.",
    },
  ),
];

export function listCatalogSeedInstructions(): ReadonlyArray<CatalogSeedEntry> {
  return CATALOG_SEED_INSTRUCTIONS;
}

export function materializeSeedAsInstruction(catalogEntry: CatalogSeedEntry, now: string): ClawInstruction {
  return {
    id: `seed:${catalogEntry.source}`,
    schemaVersion: clawInstructionsSchemaVersion,
    target: { ...catalogEntry.seed.target },
    trigger: catalogEntry.seed.trigger,
    activation: catalogEntry.seed.activation,
    priority: catalogEntry.seed.priority,
    severity: catalogEntry.seed.severity,
    useWhen: catalogEntry.seed.useWhen,
    useNot: catalogEntry.seed.useNot,
    readPolicy: catalogEntry.seed.readPolicy,
    writePolicy: catalogEntry.seed.writePolicy,
    before: catalogEntry.seed.before,
    after: catalogEntry.seed.after,
    forbid: catalogEntry.seed.forbid,
    notes: catalogEntry.seed.notes,
    provenance: "seed",
    state: "active",
    source: catalogEntry.source,
    createdAt: now,
    updatedAt: now,
  };
}

const STATIC_NOW = "1970-01-01T00:00:00.000Z";

const MATERIALIZED_SEEDS: ReadonlyArray<ClawInstruction> = CATALOG_SEED_INSTRUCTIONS.map((catalogEntry) =>
  materializeSeedAsInstruction(catalogEntry, STATIC_NOW),
);

export function listMaterializedSeedInstructions(): ReadonlyArray<ClawInstruction> {
  return MATERIALIZED_SEEDS;
}

export function resolveCatalogSeedsForEvent(event: InstructionEvent): ClawInstruction[] {
  const matches = MATERIALIZED_SEEDS.filter((entry) => isInstructionActive(entry) && instructionMatchesEvent(entry, event));
  return [...matches].sort(compareResolvedInstructions);
}
