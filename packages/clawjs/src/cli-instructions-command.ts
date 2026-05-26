import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  INSTRUCTION_ACTIONS,
  INSTRUCTION_ACTIVATIONS,
  INSTRUCTION_BODY_FIELDS,
  INSTRUCTION_PRIORITY_DEFAULT,
  INSTRUCTION_PROVENANCES,
  INSTRUCTION_SEVERITIES,
  INSTRUCTION_STATES,
  INSTRUCTION_TARGET_AXES,
  INSTRUCTION_TRIGGER_BASES,
  INSTRUCTION_INPUT_KINDS,
  clawInstructionsSchemaVersion,
  describeInstructionTarget,
  isInstructionTrigger,
  resolveInstructionsForEvent,
  validateInstructionShape,
  type ClawInstruction,
  type InstructionBodyField,
  type InstructionTarget,
  type InstructionTrigger,
} from "@clawjs/core/catalogs";
import { listMaterializedSeedInstructions } from "@clawjs/core/catalogs";
import type { DatabaseServiceStore } from "@clawjs/database";

import { CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk } from "./cli-json.ts";
import { openMainDataStore, resolveClawjsDataRoot } from "./v1-data-core.ts";

const NAMESPACE = "main";
const COLLECTION = "instructions";
const CANONICAL_COMMAND = "instructions";
const INSTRUCTIONS_SCHEMA_VERSION = 1;

const SUBCOMMANDS = [
  "list",
  "show",
  "add",
  "edit",
  "rm",
  "approve",
  "propose",
  "where",
  "reconcile",
] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

const SUBCOMMAND_SET = new Set<string>(SUBCOMMANDS);

export interface InstructionsCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
}

interface InstructionsRow {
  id: string;
  schemaVersion: number;
  targetAlias?: string;
  targetFamily?: string;
  targetCommand?: string;
  targetSubcommand?: string;
  targetCollection?: string;
  targetAction?: string;
  trigger: InstructionTrigger;
  activation: ClawInstruction["activation"];
  priority: number;
  severity: ClawInstruction["severity"];
  useWhen?: string;
  useNot?: string;
  readPolicy?: string;
  writePolicy?: string;
  before?: string;
  after?: string;
  forbid?: string;
  notes?: string;
  provenance: ClawInstruction["provenance"];
  state: ClawInstruction["state"];
  confidence?: number;
  proposedFrom?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

function usage(binName: string): string {
  return [
    `Usage: ${binName} instructions <${SUBCOMMANDS.join("|")}> [options]`,
    "",
    "Subcommands:",
    `  list                                  list instructions matching filters`,
    `  show <id>                             show one instruction`,
    `  add --target.command=X ...            add a user-authored instruction`,
    `  edit <id> --field=value ...           edit fields of an instruction`,
    `  rm <id>                               delete an instruction`,
    `  approve <id>                          promote a proposed instruction to active`,
    `  propose --from=<ev> ...               add an agent-proposed instruction (state=proposed)`,
    `  where <command> [<action>]            show seeds + overrides applicable to a target`,
    `  reconcile                             reconcile claw.global.root/instructions/manifest.yaml`,
    "",
    "Common flags:",
    "  --json                                emit a machine-readable envelope",
    "  --target.<axis>=<value>               filter or set a target axis (alias/family/command/subcommand/collection/action)",
    "  --trigger=<value>                     filter or set the trigger (surface-action/session-start/user-turn/input-kind:*/pre-tool-call/post-tool-call/correction-detected)",
    "  --state=proposed|active|archived      filter or set state",
  ].join("\n");
}

function parseFlagValue(flags: Record<string, string>, name: string): string | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseTargetFromFlags(flags: Record<string, string>): InstructionTarget {
  const target: InstructionTarget = {};
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const value = parseFlagValue(flags, `target.${axis}`);
    if (value === undefined) continue;
    if (axis === "action") {
      if (!(INSTRUCTION_ACTIONS as string[]).includes(value)) {
        throw new CliHandledError(
          "invalid_action",
          `Unknown target.action ${value}. Expected one of: ${INSTRUCTION_ACTIONS.join(", ")}.`,
          CLI_EXIT_USAGE,
        );
      }
      target.action = value as InstructionTarget["action"];
      continue;
    }
    target[axis] = value;
  }
  return target;
}

function parseBodyFromFlags(flags: Record<string, string>): Partial<Record<InstructionBodyField, string>> {
  const body: Partial<Record<InstructionBodyField, string>> = {};
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const value = parseFlagValue(flags, dashCase(field)) ?? parseFlagValue(flags, field);
    if (value === undefined) continue;
    body[field] = value;
  }
  return body;
}

function dashCase(value: string): string {
  return value.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function rowFromInstruction(instruction: ClawInstruction): Omit<InstructionsRow, "id" | "createdAt" | "updatedAt"> {
  return {
    schemaVersion: instruction.schemaVersion,
    targetAlias: instruction.target.alias,
    targetFamily: instruction.target.family,
    targetCommand: instruction.target.command,
    targetSubcommand: instruction.target.subcommand,
    targetCollection: instruction.target.collection,
    targetAction: instruction.target.action,
    trigger: instruction.trigger,
    activation: instruction.activation,
    priority: instruction.priority,
    severity: instruction.severity,
    useWhen: instruction.useWhen,
    useNot: instruction.useNot,
    readPolicy: instruction.readPolicy,
    writePolicy: instruction.writePolicy,
    before: instruction.before,
    after: instruction.after,
    forbid: instruction.forbid,
    notes: instruction.notes,
    provenance: instruction.provenance,
    state: instruction.state,
    confidence: instruction.confidence,
    proposedFrom: instruction.proposedFrom,
    source: instruction.source,
  };
}

function manifestPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveClawjsDataRoot(env), "instructions", "manifest.yaml");
}

function parseManifestScalar(raw: string): unknown {
  const value = raw.trim();
  if (value.length === 0) return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return value;
}

function parseInstructionsManifest(content: string): ClawInstruction[] {
  const lines = content.split(/\r?\n/);
  const instructions: Array<Record<string, unknown> & { target?: Record<string, unknown> }> = [];
  let schemaVersion: number | undefined;
  let inInstructions = false;
  let current: (Record<string, unknown> & { target?: Record<string, unknown> }) | undefined;
  let inTarget = false;

  for (const [index, line] of lines.entries()) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();
    if (indent === 0) {
      inTarget = false;
      if (trimmed === "instructions:") {
        inInstructions = true;
        continue;
      }
      const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
      if (!match) throw new CliHandledError("invalid_manifest", `Invalid manifest line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
      if (match[1] === "schemaVersion") schemaVersion = parseManifestScalar(match[2]) as number;
      continue;
    }
    if (!inInstructions) {
      throw new CliHandledError("invalid_manifest", `Unexpected nested manifest line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
    }
    if (indent === 2 && trimmed.startsWith("- ")) {
      current = {};
      instructions.push(current);
      inTarget = false;
      const rest = trimmed.slice(2).trim();
      if (rest.length > 0) {
        const match = rest.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
        if (!match) throw new CliHandledError("invalid_manifest", `Invalid instruction line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
        current[match[1]] = parseManifestScalar(match[2]);
      }
      continue;
    }
    if (!current) {
      throw new CliHandledError("invalid_manifest", `Manifest field before instruction at line ${index + 1}.`, CLI_EXIT_USAGE);
    }
    if (indent === 4 && trimmed === "target:") {
      current.target = {};
      inTarget = true;
      continue;
    }
    const match = trimmed.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match) throw new CliHandledError("invalid_manifest", `Invalid manifest line ${index + 1}: ${trimmed}`, CLI_EXIT_USAGE);
    if (indent === 6 && inTarget) {
      current.target ??= {};
      current.target[match[1]] = parseManifestScalar(match[2]);
    } else if (indent === 4) {
      inTarget = false;
      current[match[1]] = parseManifestScalar(match[2]);
    } else {
      throw new CliHandledError("invalid_manifest", `Unsupported indentation at line ${index + 1}.`, CLI_EXIT_USAGE);
    }
  }

  if (schemaVersion !== INSTRUCTIONS_SCHEMA_VERSION) {
    throw new CliHandledError("invalid_manifest", "Manifest schemaVersion must be 1.", CLI_EXIT_USAGE);
  }
  return instructions.map((entry, index) => {
    if (typeof entry.id !== "string" || entry.id.length === 0) {
      throw new CliHandledError("invalid_manifest", `Instruction ${index + 1} must declare id.`, CLI_EXIT_USAGE);
    }
    const instruction: ClawInstruction = {
      id: entry.id,
      schemaVersion: INSTRUCTIONS_SCHEMA_VERSION,
      target: (entry.target ?? {}) as InstructionTarget,
      trigger: (entry.trigger as InstructionTrigger | undefined) ?? "surface-action",
      activation: (entry.activation as ClawInstruction["activation"] | undefined) ?? "on",
      priority: typeof entry.priority === "number" ? entry.priority : INSTRUCTION_PRIORITY_DEFAULT,
      severity: (entry.severity as ClawInstruction["severity"] | undefined) ?? "info",
      useWhen: typeof entry.useWhen === "string" ? entry.useWhen : undefined,
      useNot: typeof entry.useNot === "string" ? entry.useNot : undefined,
      readPolicy: typeof entry.readPolicy === "string" ? entry.readPolicy : undefined,
      writePolicy: typeof entry.writePolicy === "string" ? entry.writePolicy : undefined,
      before: typeof entry.before === "string" ? entry.before : undefined,
      after: typeof entry.after === "string" ? entry.after : undefined,
      forbid: typeof entry.forbid === "string" ? entry.forbid : undefined,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
      provenance: "user",
      state: (entry.state as ClawInstruction["state"] | undefined) ?? "active",
      source: `manifest:${entry.id}`,
      createdAt: "",
      updatedAt: "",
    };
    const validation = validateInstructionShape(instruction);
    if (!validation.ok) {
      throw new CliHandledError(
        "invalid_manifest",
        `Manifest instruction ${entry.id} failed validation: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
        CLI_EXIT_USAGE,
      );
    }
    return instruction;
  });
}

function managedManifestKey(instruction: ClawInstruction): string | undefined {
  if (instruction.provenance !== "user") return undefined;
  if (typeof instruction.source !== "string" || !instruction.source.startsWith("manifest:")) return undefined;
  return instruction.source.slice("manifest:".length);
}

function sameManifestInstruction(current: ClawInstruction, next: ClawInstruction): boolean {
  const a = rowFromInstruction(current);
  const b = rowFromInstruction(next);
  return JSON.stringify(a) === JSON.stringify(b);
}

function instructionFromRow(row: Record<string, unknown>, fallbackId?: string): ClawInstruction {
  const target: InstructionTarget = {};
  if (typeof row.targetAlias === "string") target.alias = row.targetAlias;
  if (typeof row.targetFamily === "string") target.family = row.targetFamily;
  if (typeof row.targetCommand === "string") target.command = row.targetCommand;
  if (typeof row.targetSubcommand === "string") target.subcommand = row.targetSubcommand;
  if (typeof row.targetCollection === "string") target.collection = row.targetCollection;
  if (typeof row.targetAction === "string") target.action = row.targetAction as InstructionTarget["action"];

  return {
    id: typeof row.id === "string" ? row.id : fallbackId ?? "",
    schemaVersion: clawInstructionsSchemaVersion,
    target,
    trigger: (row.trigger as InstructionTrigger) ?? "surface-action",
    activation: (row.activation as ClawInstruction["activation"]) ?? "on",
    priority: typeof row.priority === "number" ? row.priority : INSTRUCTION_PRIORITY_DEFAULT,
    severity: (row.severity as ClawInstruction["severity"]) ?? "info",
    useWhen: typeof row.useWhen === "string" ? row.useWhen : undefined,
    useNot: typeof row.useNot === "string" ? row.useNot : undefined,
    readPolicy: typeof row.readPolicy === "string" ? row.readPolicy : undefined,
    writePolicy: typeof row.writePolicy === "string" ? row.writePolicy : undefined,
    before: typeof row.before === "string" ? row.before : undefined,
    after: typeof row.after === "string" ? row.after : undefined,
    forbid: typeof row.forbid === "string" ? row.forbid : undefined,
    notes: typeof row.notes === "string" ? row.notes : undefined,
    provenance: (row.provenance as ClawInstruction["provenance"]) ?? "user",
    state: (row.state as ClawInstruction["state"]) ?? "active",
    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    proposedFrom: typeof row.proposedFrom === "string" ? row.proposedFrom : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
}

function publicInstructionView(instruction: ClawInstruction): Record<string, unknown> {
  return {
    id: instruction.id,
    schemaVersion: instruction.schemaVersion,
    target: instruction.target,
    trigger: instruction.trigger,
    activation: instruction.activation,
    priority: instruction.priority,
    severity: instruction.severity,
    useWhen: instruction.useWhen,
    useNot: instruction.useNot,
    readPolicy: instruction.readPolicy,
    writePolicy: instruction.writePolicy,
    before: instruction.before,
    after: instruction.after,
    forbid: instruction.forbid,
    notes: instruction.notes,
    provenance: instruction.provenance,
    state: instruction.state,
    confidence: instruction.confidence,
    proposedFrom: instruction.proposedFrom,
    source: instruction.source,
    createdAt: instruction.createdAt,
    updatedAt: instruction.updatedAt,
  };
}

interface FilterOptions {
  target: InstructionTarget;
  trigger?: InstructionTrigger;
  state?: ClawInstruction["state"];
  provenance?: ClawInstruction["provenance"];
}

function rowMatchesFilter(row: ClawInstruction, filter: FilterOptions): boolean {
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const expected = filter.target[axis];
    if (expected === undefined) continue;
    if (row.target[axis] !== expected) return false;
  }
  if (filter.trigger && row.trigger !== filter.trigger) return false;
  if (filter.state && row.state !== filter.state) return false;
  if (filter.provenance && row.provenance !== filter.provenance) return false;
  return true;
}

function listStoredInstructions(store: DatabaseServiceStore): ClawInstruction[] {
  const { items } = store.listRecords(NAMESPACE, COLLECTION, { limit: 10_000 });
  return items.map((envelope) => instructionFromRow(envelope as Record<string, unknown>, envelope.id));
}

function parseFilter(flags: Record<string, string>): FilterOptions {
  const filter: FilterOptions = { target: parseTargetFromFlags(flags) };
  const trigger = parseFlagValue(flags, "trigger");
  if (trigger !== undefined) {
    if (!isInstructionTrigger(trigger)) {
      throw new CliHandledError(
        "invalid_trigger",
        `Unknown trigger ${trigger}. Expected one of: ${listKnownTriggers().join(", ")}.`,
        CLI_EXIT_USAGE,
      );
    }
    filter.trigger = trigger;
  }
  const state = parseFlagValue(flags, "state");
  if (state !== undefined) {
    if (!(INSTRUCTION_STATES as string[]).includes(state)) {
      throw new CliHandledError(
        "invalid_state",
        `Unknown state ${state}. Expected one of: ${INSTRUCTION_STATES.join(", ")}.`,
        CLI_EXIT_USAGE,
      );
    }
    filter.state = state as ClawInstruction["state"];
  }
  const provenance = parseFlagValue(flags, "provenance");
  if (provenance !== undefined) {
    if (!(INSTRUCTION_PROVENANCES as string[]).includes(provenance)) {
      throw new CliHandledError(
        "invalid_provenance",
        `Unknown provenance ${provenance}. Expected one of: ${INSTRUCTION_PROVENANCES.join(", ")}.`,
        CLI_EXIT_USAGE,
      );
    }
    filter.provenance = provenance as ClawInstruction["provenance"];
  }
  return filter;
}

function listKnownTriggers(): string[] {
  const base = [...INSTRUCTION_TRIGGER_BASES];
  const inputKinds = INSTRUCTION_INPUT_KINDS.map((kind) => `input-kind:${kind}`);
  return [...base, ...inputKinds];
}

interface CreateOptions {
  state: ClawInstruction["state"];
  provenance: ClawInstruction["provenance"];
  proposedFrom?: string;
}

function createInstruction(
  store: DatabaseServiceStore,
  flags: Record<string, string>,
  options: CreateOptions,
): ClawInstruction {
  const target = parseTargetFromFlags(flags);
  const trigger = (parseFlagValue(flags, "trigger") ?? "surface-action") as InstructionTrigger;
  if (!isInstructionTrigger(trigger)) {
    throw new CliHandledError(
      "invalid_trigger",
      `Unknown trigger ${trigger}. Expected one of: ${listKnownTriggers().join(", ")}.`,
      CLI_EXIT_USAGE,
    );
  }
  const activation = (parseFlagValue(flags, "activation") ?? "on") as ClawInstruction["activation"];
  if (!(INSTRUCTION_ACTIVATIONS as string[]).includes(activation)) {
    throw new CliHandledError("invalid_activation", `Unknown activation ${activation}.`, CLI_EXIT_USAGE);
  }
  const severity = (parseFlagValue(flags, "severity") ?? "info") as ClawInstruction["severity"];
  if (!(INSTRUCTION_SEVERITIES as string[]).includes(severity)) {
    throw new CliHandledError("invalid_severity", `Unknown severity ${severity}.`, CLI_EXIT_USAGE);
  }
  const priorityRaw = parseFlagValue(flags, "priority");
  let priority = INSTRUCTION_PRIORITY_DEFAULT;
  if (priorityRaw !== undefined) {
    const parsed = Number.parseInt(priorityRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new CliHandledError("invalid_priority", `--priority must be an integer in [0, 100].`, CLI_EXIT_USAGE);
    }
    priority = parsed;
  }
  const body = parseBodyFromFlags(flags);
  const confidenceRaw = parseFlagValue(flags, "confidence");
  let confidence: number | undefined;
  if (confidenceRaw !== undefined) {
    const parsed = Number.parseFloat(confidenceRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new CliHandledError("invalid_confidence", `--confidence must be a number in [0, 1].`, CLI_EXIT_USAGE);
    }
    confidence = parsed;
  }

  const draft: ClawInstruction = {
    id: `ins_${randomUUID()}`,
    schemaVersion: INSTRUCTIONS_SCHEMA_VERSION,
    target,
    trigger,
    activation,
    priority,
    severity,
    ...body,
    provenance: options.provenance,
    state: options.state,
    confidence,
    proposedFrom: options.proposedFrom,
    createdAt: "",
    updatedAt: "",
  };

  const validation = validateInstructionShape(draft);
  if (!validation.ok) {
    throw new CliHandledError(
      "invalid_instruction",
      `Instruction validation failed: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
      CLI_EXIT_USAGE,
    );
  }
  const payload = rowFromInstruction(draft);
  const envelope = store.createRecord(NAMESPACE, COLLECTION, payload as Record<string, unknown>);
  return instructionFromRow(envelope as Record<string, unknown>, envelope.id);
}

function findInstruction(store: DatabaseServiceStore, id: string): ClawInstruction | null {
  const envelope = store.getRecord(NAMESPACE, COLLECTION, id);
  if (!envelope) return null;
  return instructionFromRow(envelope as Record<string, unknown>, envelope.id);
}

function applyEditFlags(instruction: ClawInstruction, flags: Record<string, string>): ClawInstruction {
  const next: ClawInstruction = { ...instruction, target: { ...instruction.target } };
  const targetOverrides = parseTargetFromFlags(flags);
  for (const axis of INSTRUCTION_TARGET_AXES) {
    if (targetOverrides[axis] !== undefined) {
      (next.target[axis] as typeof targetOverrides[typeof axis]) = targetOverrides[axis] as never;
    }
  }
  const triggerFlag = parseFlagValue(flags, "trigger");
  if (triggerFlag !== undefined) {
    if (!isInstructionTrigger(triggerFlag)) {
      throw new CliHandledError("invalid_trigger", `Unknown trigger ${triggerFlag}.`, CLI_EXIT_USAGE);
    }
    next.trigger = triggerFlag;
  }
  const activationFlag = parseFlagValue(flags, "activation");
  if (activationFlag !== undefined) {
    if (!(INSTRUCTION_ACTIVATIONS as string[]).includes(activationFlag)) {
      throw new CliHandledError("invalid_activation", `Unknown activation ${activationFlag}.`, CLI_EXIT_USAGE);
    }
    next.activation = activationFlag as ClawInstruction["activation"];
  }
  const severityFlag = parseFlagValue(flags, "severity");
  if (severityFlag !== undefined) {
    if (!(INSTRUCTION_SEVERITIES as string[]).includes(severityFlag)) {
      throw new CliHandledError("invalid_severity", `Unknown severity ${severityFlag}.`, CLI_EXIT_USAGE);
    }
    next.severity = severityFlag as ClawInstruction["severity"];
  }
  const priorityFlag = parseFlagValue(flags, "priority");
  if (priorityFlag !== undefined) {
    const parsed = Number.parseInt(priorityFlag, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new CliHandledError("invalid_priority", `--priority must be an integer in [0, 100].`, CLI_EXIT_USAGE);
    }
    next.priority = parsed;
  }
  const body = parseBodyFromFlags(flags);
  for (const field of INSTRUCTION_BODY_FIELDS) {
    if (body[field] !== undefined) {
      next[field] = body[field];
    }
  }
  const stateFlag = parseFlagValue(flags, "state");
  if (stateFlag !== undefined) {
    if (!(INSTRUCTION_STATES as string[]).includes(stateFlag)) {
      throw new CliHandledError("invalid_state", `Unknown state ${stateFlag}.`, CLI_EXIT_USAGE);
    }
    next.state = stateFlag as ClawInstruction["state"];
  }
  const validation = validateInstructionShape(next);
  if (!validation.ok) {
    throw new CliHandledError(
      "invalid_instruction",
      `Instruction validation failed: ${validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ")}`,
      CLI_EXIT_USAGE,
    );
  }
  return next;
}

function runWhere(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const command = input.positionals[2];
  if (!command) {
    throw new CliHandledError("missing_command", `Usage: ${input.binName} instructions where <command> [<action>]`, CLI_EXIT_USAGE);
  }
  const action = input.positionals[3];
  if (action !== undefined && !(INSTRUCTION_ACTIONS as string[]).includes(action)) {
    throw new CliHandledError("invalid_action", `Unknown action ${action}.`, CLI_EXIT_USAGE);
  }
  const trigger: InstructionTrigger = (parseFlagValue(input.flags, "trigger") as InstructionTrigger) || "surface-action";
  if (!isInstructionTrigger(trigger)) {
    throw new CliHandledError("invalid_trigger", `Unknown trigger ${trigger}.`, CLI_EXIT_USAGE);
  }
  const target: InstructionTarget = { command };
  if (action) target.action = action as InstructionTarget["action"];

  const overrides = listStoredInstructions(store);
  const seeds = listMaterializedSeedInstructions();
  const all = [...seeds, ...overrides];
  const resolved = resolveInstructionsForEvent(all, { target, trigger });

  const payload = {
    target,
    trigger,
    appliedCount: resolved.length,
    rules: resolved.map((rule) => ({
      id: rule.id,
      source: rule.source ?? null,
      provenance: rule.provenance,
      severity: rule.severity,
      priority: rule.priority,
      target: rule.target,
      trigger: rule.trigger,
      useWhen: rule.useWhen,
      useNot: rule.useNot,
      readPolicy: rule.readPolicy,
      writePolicy: rule.writePolicy,
      before: rule.before,
      after: rule.after,
      forbid: rule.forbid,
      notes: rule.notes,
    })),
  };

  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "where" });
    return CLI_EXIT_OK;
  }

  const lines: string[] = [
    `Instructions applicable to ${describeInstructionTarget(target)} on trigger=${trigger}: ${resolved.length}`,
    "",
  ];
  for (const rule of resolved) {
    lines.push(`- [${rule.severity}/${rule.priority}] ${rule.id} ${rule.source ? `(${rule.source})` : ""}`);
    for (const field of INSTRUCTION_BODY_FIELDS) {
      const value = rule[field];
      if (typeof value === "string" && value.length > 0) {
        lines.push(`    ${field}: ${value}`);
      }
    }
  }
  input.context.stdout.write(`${lines.join("\n")}\n`);
  return CLI_EXIT_OK;
}

function runReconcile(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const pathToManifest = manifestPath();
  if (!fs.existsSync(pathToManifest)) {
    throw new CliHandledError(
      "manifest_not_found",
      `Instruction manifest not found at ${pathToManifest}.`,
      CLI_EXIT_FAILURE,
    );
  }
  const desired = parseInstructionsManifest(fs.readFileSync(pathToManifest, "utf8"));
  const desiredById = new Map(desired.map((instruction) => [instruction.id, instruction]));
  if (desiredById.size !== desired.length) {
    throw new CliHandledError("invalid_manifest", "Manifest instruction ids must be unique.", CLI_EXIT_USAGE);
  }

  const live = listStoredInstructions(store);
  const liveById = new Map(live.map((instruction) => [instruction.id, instruction]));
  const managedByKey = new Map<string, ClawInstruction>();
  for (const instruction of live) {
    const key = managedManifestKey(instruction);
    if (key) managedByKey.set(key, instruction);
  }

  let added = 0;
  let updated = 0;
  let archived = 0;
  let unchanged = 0;

  for (const instruction of desired) {
    const current = liveById.get(instruction.id);
    if (current && managedManifestKey(current) !== instruction.id) {
      throw new CliHandledError(
        "manifest_id_conflict",
        `Instruction id ${instruction.id} already exists outside manifest management.`,
        CLI_EXIT_USAGE,
      );
    }
    const payload = rowFromInstruction(instruction);
    if (!current) {
      store.putRecord({
        namespaceId: NAMESPACE,
        collectionName: COLLECTION,
        recordId: instruction.id,
        payload: payload as Record<string, unknown>,
      });
      added += 1;
    } else if (sameManifestInstruction(current, instruction)) {
      unchanged += 1;
    } else {
      store.putRecord({
        namespaceId: NAMESPACE,
        collectionName: COLLECTION,
        recordId: instruction.id,
        payload: payload as Record<string, unknown>,
        createdAt: current.createdAt,
      });
      updated += 1;
    }
  }

  for (const [key, instruction] of managedByKey) {
    if (desiredById.has(key) || instruction.state === "archived") continue;
    const next: ClawInstruction = { ...instruction, state: "archived" };
    store.putRecord({
      namespaceId: NAMESPACE,
      collectionName: COLLECTION,
      recordId: instruction.id,
      payload: rowFromInstruction(next) as Record<string, unknown>,
      createdAt: instruction.createdAt,
    });
    archived += 1;
  }

  const payload = {
    manifestPath: pathToManifest,
    counts: { added, updated, archived, unchanged },
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "reconcile" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(
    `Reconciled instructions manifest: added ${added}, updated ${updated}, archived ${archived}, unchanged ${unchanged}\n`,
  );
  return CLI_EXIT_OK;
}

function runList(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const filter = parseFilter(input.flags);
  const all = listStoredInstructions(store);
  const matches = all.filter((row) => rowMatchesFilter(row, filter));
  const payload = {
    total: matches.length,
    items: matches.map(publicInstructionView),
  };
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, payload, { canonicalCommand: CANONICAL_COMMAND, operation: "list" });
    return CLI_EXIT_OK;
  }
  if (matches.length === 0) {
    input.context.stdout.write("No instructions stored.\n");
    return CLI_EXIT_OK;
  }
  const lines = matches.map((row) =>
    `${row.id}\t[${row.state}/${row.severity}/${row.priority}]\t${describeInstructionTarget(row.target)}\ttrigger=${row.trigger}\tprov=${row.provenance}`,
  );
  input.context.stdout.write(`${lines.join("\n")}\n`);
  return CLI_EXIT_OK;
}

function runShow(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions show <id>`, CLI_EXIT_USAGE);
  }
  const instruction = findInstruction(store, id);
  if (!instruction) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(instruction), { canonicalCommand: CANONICAL_COMMAND, operation: "show" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${JSON.stringify(publicInstructionView(instruction), null, 2)}\n`);
  return CLI_EXIT_OK;
}

function runAdd(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const instruction = createInstruction(store, input.flags, { state: "active", provenance: "user" });
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(instruction), { canonicalCommand: CANONICAL_COMMAND, operation: "add" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${instruction.id}\n`);
  return CLI_EXIT_OK;
}

function runPropose(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const proposedFrom = parseFlagValue(input.flags, "from");
  if (!proposedFrom) {
    throw new CliHandledError("missing_from", `Usage: ${input.binName} instructions propose --from=<evidence-id> ...`, CLI_EXIT_USAGE);
  }
  const flagsWithProvenance = { ...input.flags, provenance: "agent" };
  const instruction = createInstruction(store, flagsWithProvenance, {
    state: "proposed",
    provenance: "agent",
    proposedFrom,
  });
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(instruction), { canonicalCommand: CANONICAL_COMMAND, operation: "propose" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${instruction.id} (proposed)\n`);
  return CLI_EXIT_OK;
}

function runEdit(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions edit <id> [--field=value ...]`, CLI_EXIT_USAGE);
  }
  const current = findInstruction(store, id);
  if (!current) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  const next = applyEditFlags(current, input.flags);
  const payload = rowFromInstruction(next);
  const envelope = store.updateRecord(NAMESPACE, COLLECTION, id, payload as Record<string, unknown>);
  const updated = instructionFromRow(envelope as Record<string, unknown>, envelope.id);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(updated), { canonicalCommand: CANONICAL_COMMAND, operation: "edit" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${updated.id} updated\n`);
  return CLI_EXIT_OK;
}

function runRm(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions rm <id>`, CLI_EXIT_USAGE);
  }
  const current = findInstruction(store, id);
  if (!current) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  store.deleteRecord(NAMESPACE, COLLECTION, id);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, { id, deleted: true }, { canonicalCommand: CANONICAL_COMMAND, operation: "rm" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${id} deleted\n`);
  return CLI_EXIT_OK;
}

function runApprove(input: InstructionsCliInput, store: DatabaseServiceStore): number {
  const id = input.positionals[2];
  if (!id) {
    throw new CliHandledError("missing_id", `Usage: ${input.binName} instructions approve <id>`, CLI_EXIT_USAGE);
  }
  const current = findInstruction(store, id);
  if (!current) {
    throw new CliHandledError("not_found", `Instruction ${id} not found.`, CLI_EXIT_FAILURE);
  }
  if (current.state !== "proposed") {
    throw new CliHandledError(
      "not_proposed",
      `Instruction ${id} is in state ${current.state}; only proposed instructions can be approved.`,
      CLI_EXIT_USAGE,
    );
  }
  const next: ClawInstruction = { ...current, state: "active" };
  const payload = rowFromInstruction(next);
  const envelope = store.updateRecord(NAMESPACE, COLLECTION, id, payload as Record<string, unknown>);
  const updated = instructionFromRow(envelope as Record<string, unknown>, envelope.id);
  if (input.wantsJson) {
    writeCommandJsonOk(input.context.stdout, CANONICAL_COMMAND, publicInstructionView(updated), { canonicalCommand: CANONICAL_COMMAND, operation: "approve" });
    return CLI_EXIT_OK;
  }
  input.context.stdout.write(`${updated.id} approved\n`);
  return CLI_EXIT_OK;
}

export async function runInstructionsCli(input: InstructionsCliInput): Promise<number> {
  const sub = input.positionals[1];
  if (!sub || !SUBCOMMAND_SET.has(sub)) {
    input.context.stderr.write(`${usage(input.binName)}\n`);
    return CLI_EXIT_USAGE;
  }
  const action = sub as Subcommand;

  let store: DatabaseServiceStore | undefined;
  try {
    store = openMainDataStore();
    switch (action) {
      case "list":
        return runList(input, store);
      case "show":
        return runShow(input, store);
      case "add":
        return runAdd(input, store);
      case "edit":
        return runEdit(input, store);
      case "rm":
        return runRm(input, store);
      case "approve":
        return runApprove(input, store);
      case "propose":
        return runPropose(input, store);
      case "where":
        return runWhere(input, store);
      case "reconcile":
        return runReconcile(input, store);
    }
  } catch (error) {
    if (input.wantsJson) {
      writeCommandJsonError(input.context.stdout, CANONICAL_COMMAND, error, { canonicalCommand: CANONICAL_COMMAND, operation: action });
      return error instanceof CliHandledError ? error.exitCode : CLI_EXIT_FAILURE;
    }
    if (error instanceof CliHandledError) {
      input.context.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    input.context.stderr.write(`${(error as Error).message}\n`);
    return CLI_EXIT_FAILURE;
  } finally {
    store?.close();
  }
}
