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
