import {
  INSTRUCTION_BODY_FIELDS,
  evaluateRuleValidations,
  isInstructionTrigger,
  listMaterializedSeedInstructions,
  resolveInstructionsForEvent,
  type ClawInstruction,
  type InstructionEvent,
  type InstructionTarget,
  type InstructionTrigger,
  type RuleValidationFailure,
} from "@clawjs/core/catalogs";

import { CLI_EXIT_FAILURE } from "./cli-errors.ts";
import { openMainDataStore } from "./v1-data-core.ts";

export const CLI_EXIT_INSTRUCTION_BLOCK = 76;

export type InstructionsMode = "off" | "preamble" | "strict";

const VALID_MODES: InstructionsMode[] = ["off", "preamble", "strict"];

export function resolveInstructionsMode(env: NodeJS.ProcessEnv = process.env, flagValue?: string): InstructionsMode {
  const raw = (flagValue ?? env.CLAW_INSTRUCTIONS ?? "preamble").trim().toLowerCase();
  if ((VALID_MODES as string[]).includes(raw)) return raw as InstructionsMode;
  return "preamble";
}

export interface PreambleContext {
  target: InstructionTarget;
  trigger?: InstructionTrigger;
  binName: string;
  mode?: InstructionsMode;
  payload?: Record<string, unknown>;
}

export interface PreambleResult {
  mode: InstructionsMode;
  rules: ClawInstruction[];
  blocked: ClawInstruction[];
  validationFailures: RuleValidationFailure[];
  preamble: string;
  exitCode?: number;
}

function loadStoredInstructions(): ClawInstruction[] {
  let store: ReturnType<typeof openMainDataStore> | undefined;
  try {
    store = openMainDataStore();
    const { items } = store.listRecords("main", "instructions", { limit: 10_000 });
    return items.map((envelope) => {
      const data = envelope as Record<string, unknown>;
      const target: InstructionTarget = {};
      if (typeof data.targetAlias === "string") target.alias = data.targetAlias;
      if (typeof data.targetFamily === "string") target.family = data.targetFamily;
      if (typeof data.targetCommand === "string") target.command = data.targetCommand;
      if (typeof data.targetSubcommand === "string") target.subcommand = data.targetSubcommand;
      if (typeof data.targetCollection === "string") target.collection = data.targetCollection;
      if (typeof data.targetAction === "string") target.action = data.targetAction as InstructionTarget["action"];
      return {
        id: envelope.id,
        schemaVersion: 1,
        target,
        trigger: (data.trigger as InstructionTrigger) ?? "surface-action",
        activation: (data.activation as ClawInstruction["activation"]) ?? "on",
        priority: typeof data.priority === "number" ? data.priority : 50,
        severity: (data.severity as ClawInstruction["severity"]) ?? "info",
        useWhen: typeof data.useWhen === "string" ? data.useWhen : undefined,
        useNot: typeof data.useNot === "string" ? data.useNot : undefined,
        readPolicy: typeof data.readPolicy === "string" ? data.readPolicy : undefined,
        writePolicy: typeof data.writePolicy === "string" ? data.writePolicy : undefined,
        before: typeof data.before === "string" ? data.before : undefined,
        after: typeof data.after === "string" ? data.after : undefined,
        forbid: typeof data.forbid === "string" ? data.forbid : undefined,
        notes: typeof data.notes === "string" ? data.notes : undefined,
        provenance: (data.provenance as ClawInstruction["provenance"]) ?? "user",
        state: (data.state as ClawInstruction["state"]) ?? "active",
        confidence: typeof data.confidence === "number" ? data.confidence : undefined,
        proposedFrom: typeof data.proposedFrom === "string" ? data.proposedFrom : undefined,
        source: typeof data.source === "string" ? data.source : undefined,
        validations: Array.isArray(data.validations) ? data.validations as ClawInstruction["validations"] : undefined,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
      };
    });
  } catch {
    return [];
  } finally {
    store?.close();
  }
}

function ruleSummaryLine(rule: ClawInstruction): string[] {
  const lines: string[] = [];
  lines.push(`- [${rule.severity}/${rule.priority}] ${rule.source ?? rule.id}`);
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const value = rule[field];
    if (typeof value !== "string" || value.length === 0) continue;
    lines.push(`    ${field}: ${value}`);
  }
  return lines;
}

function buildPreambleText(rules: ClawInstruction[], event: InstructionEvent, binName: string): string {
  if (rules.length === 0) return "";
  const lines: string[] = [];
  const cmd = event.target.command;
  const action = event.target.action;
  const breadcrumb =
    cmd && action && action !== "*"
      ? `${binName} prompt for-action ${cmd} ${action}`
      : cmd
        ? `${binName} prompt for-action ${cmd}`
        : `${binName} prompt session-start`;
  lines.push(`--- instructions (${breadcrumb}) ---`);
  for (const rule of rules) {
    for (const line of ruleSummaryLine(rule)) {
      lines.push(line);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export function buildInstructionsPreamble(context: PreambleContext): PreambleResult {
  const mode = context.mode ?? resolveInstructionsMode();
  const trigger = context.trigger && isInstructionTrigger(context.trigger) ? context.trigger : "surface-action";
  const event: InstructionEvent = { target: context.target, trigger };

  if (mode === "off") {
    return { mode, rules: [], blocked: [], validationFailures: [], preamble: "" };
  }

  const seeds = listMaterializedSeedInstructions();
  const overrides = loadStoredInstructions();
  const resolved = resolveInstructionsForEvent([...seeds, ...overrides], event);
  const renderable = resolved.filter((rule) => rule.severity !== "info");
  const validationFailures = context.payload
    ? resolved.flatMap((rule) => evaluateRuleValidations(rule, context.payload ?? {}))
    : [];
  const blocked = resolved.filter((rule) => {
    if (rule.severity !== "block") return false;
    if (!rule.validations || rule.validations.length === 0) return true;
    if (!context.payload) return true;
    return validationFailures.some((failure) => failure.ruleId === rule.id);
  });

  if (mode === "strict" && blocked.length > 0) {
    return {
      mode,
      rules: renderable,
      blocked,
      validationFailures,
      preamble: buildPreambleText(renderable, event, context.binName),
      exitCode: CLI_EXIT_INSTRUCTION_BLOCK,
    };
  }

  return {
    mode,
    rules: renderable,
    blocked,
    validationFailures,
    preamble: buildPreambleText(renderable, event, context.binName),
  };
}

export interface EmitOptions {
  context: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  wantsJson?: boolean;
  jsonMeta?: Record<string, unknown>;
}

export function emitInstructionsPreamble(result: PreambleResult, options: EmitOptions): number | undefined {
  if (result.mode === "off") return undefined;
  if (result.preamble.length === 0 && result.blocked.length === 0) return undefined;
  if (options.wantsJson) {
    return result.exitCode;
  }
  if (result.preamble.length > 0) {
    options.context.stderr.write(`${result.preamble}\n`);
  }
  return result.exitCode;
}

export function instructionsJsonMeta(result: PreambleResult): Record<string, unknown> {
  return {
    instructions: {
      mode: result.mode,
      rules: result.rules.map((rule) => ({
        id: rule.id,
        source: rule.source ?? null,
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
      blocked: result.blocked.map((rule) => rule.id),
      validationFailures: result.validationFailures,
    },
  };
}

export function failureExitForBlocked(result: PreambleResult): number {
  return result.exitCode ?? CLI_EXIT_FAILURE;
}
