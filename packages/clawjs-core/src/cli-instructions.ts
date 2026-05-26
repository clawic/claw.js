export const clawInstructionsSchemaVersion = 1;

export type InstructionAction =
  | "read"
  | "write"
  | "edit"
  | "delete"
  | "list"
  | "search"
  | "*";

export const INSTRUCTION_ACTIONS: InstructionAction[] = [
  "read",
  "write",
  "edit",
  "delete",
  "list",
  "search",
  "*",
];

export type InstructionInputKind =
  | "audio"
  | "image"
  | "video"
  | "file"
  | "url"
  | "text";

export const INSTRUCTION_INPUT_KINDS: InstructionInputKind[] = [
  "audio",
  "image",
  "video",
  "file",
  "url",
  "text",
];

export type InstructionTrigger =
  | "surface-action"
  | "session-start"
  | "user-turn"
  | "pre-tool-call"
  | "post-tool-call"
  | "correction-detected"
  | `input-kind:${InstructionInputKind}`;

export const INSTRUCTION_TRIGGER_BASES: ReadonlyArray<Exclude<InstructionTrigger, `input-kind:${InstructionInputKind}`>> = [
  "surface-action",
  "session-start",
  "user-turn",
  "pre-tool-call",
  "post-tool-call",
  "correction-detected",
];

export type InstructionActivation = "on" | "off" | "auto";
export const INSTRUCTION_ACTIVATIONS: InstructionActivation[] = ["on", "off", "auto"];

export type InstructionSeverity = "info" | "warn" | "block";
export const INSTRUCTION_SEVERITIES: InstructionSeverity[] = ["info", "warn", "block"];

export type InstructionProvenance = "seed" | "user" | "agent";
export const INSTRUCTION_PROVENANCES: InstructionProvenance[] = ["seed", "user", "agent"];

export type InstructionState = "proposed" | "active" | "archived";
export const INSTRUCTION_STATES: InstructionState[] = ["proposed", "active", "archived"];

export interface InstructionTarget {
  alias?: string;
  family?: string;
  command?: string;
  subcommand?: string;
  collection?: string;
  action?: InstructionAction;
}

export const INSTRUCTION_TARGET_AXES = [
  "alias",
  "family",
  "command",
  "subcommand",
  "collection",
  "action",
] as const;

export type InstructionTargetAxis = (typeof INSTRUCTION_TARGET_AXES)[number];

export interface ClawInstruction {
  id: string;
  schemaVersion: 1;
  target: InstructionTarget;
  trigger: InstructionTrigger;
  activation: InstructionActivation;
  priority: number;
  severity: InstructionSeverity;
  useWhen?: string;
  useNot?: string;
  readPolicy?: string;
  writePolicy?: string;
  before?: string;
  after?: string;
  forbid?: string;
  notes?: string;
  provenance: InstructionProvenance;
  state: InstructionState;
  confidence?: number;
  proposedFrom?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export type InstructionBodyField =
  | "useWhen"
  | "useNot"
  | "readPolicy"
  | "writePolicy"
  | "before"
  | "after"
  | "forbid"
  | "notes";

export const INSTRUCTION_BODY_FIELDS: InstructionBodyField[] = [
  "useWhen",
  "useNot",
  "readPolicy",
  "writePolicy",
  "before",
  "after",
  "forbid",
  "notes",
];

export const INSTRUCTION_BODY_CAPS: Readonly<Record<InstructionBodyField, number>> = Object.freeze({
  useWhen: 240,
  useNot: 240,
  readPolicy: 240,
  writePolicy: 240,
  before: 180,
  after: 180,
  forbid: 180,
  notes: 500,
});

export const INSTRUCTION_PRIORITY_MIN = 0;
export const INSTRUCTION_PRIORITY_MAX = 100;
export const INSTRUCTION_PRIORITY_DEFAULT = 50;

export type SeedInstruction = Omit<
  ClawInstruction,
  "id" | "createdAt" | "updatedAt" | "provenance" | "state" | "source"
>;

export interface InstructionValidationIssue {
  field: string;
  message: string;
}

export interface InstructionValidationResult {
  ok: boolean;
  issues: InstructionValidationIssue[];
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value;
}

function isInputKindTrigger(value: string): value is `input-kind:${InstructionInputKind}` {
  if (!value.startsWith("input-kind:")) return false;
  const kind = value.slice("input-kind:".length);
  return (INSTRUCTION_INPUT_KINDS as string[]).includes(kind);
}

export function isInstructionTrigger(value: unknown): value is InstructionTrigger {
  if (typeof value !== "string") return false;
  if ((INSTRUCTION_TRIGGER_BASES as string[]).includes(value)) return true;
  return isInputKindTrigger(value);
}

export function validateInstructionBody(input: Partial<Pick<ClawInstruction, InstructionBodyField>>): InstructionValidationResult {
  const issues: InstructionValidationIssue[] = [];
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      issues.push({ field, message: `Field ${field} must be a string.` });
      continue;
    }
    const cap = INSTRUCTION_BODY_CAPS[field];
    if (value.length > cap) {
      issues.push({ field, message: `Field ${field} exceeds cap of ${cap} characters (got ${value.length}).` });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateInstructionTarget(target: InstructionTarget): InstructionValidationResult {
  const issues: InstructionValidationIssue[] = [];
  const seen = INSTRUCTION_TARGET_AXES.filter((axis) => target[axis] !== undefined);
  if (seen.length === 0) {
    issues.push({ field: "target", message: "Instruction target must declare at least one axis." });
  }
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const value = target[axis];
    if (value === undefined) continue;
    if (axis === "action") {
      if (!(INSTRUCTION_ACTIONS as string[]).includes(value)) {
        issues.push({ field: `target.${axis}`, message: `Unknown action ${String(value)}.` });
      }
      continue;
    }
    if (typeof value !== "string" || value.length === 0) {
      issues.push({ field: `target.${axis}`, message: `Target axis ${axis} must be a non-empty string.` });
    } else if (!/^[a-z0-9._-]+$/.test(value)) {
      issues.push({ field: `target.${axis}`, message: `Target axis ${axis} must be lowercase ascii letters, digits, dot, underscore or dash.` });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateInstructionShape(input: Partial<ClawInstruction>): InstructionValidationResult {
  const issues: InstructionValidationIssue[] = [];
  if (input.schemaVersion !== undefined && input.schemaVersion !== clawInstructionsSchemaVersion) {
    issues.push({ field: "schemaVersion", message: `Unsupported schemaVersion ${String(input.schemaVersion)}.` });
  }
  if (!input.target) {
    issues.push({ field: "target", message: "Missing target." });
  } else {
    issues.push(...validateInstructionTarget(input.target).issues);
  }
  if (input.trigger !== undefined && !isInstructionTrigger(input.trigger)) {
    issues.push({ field: "trigger", message: `Unknown trigger ${String(input.trigger)}.` });
  }
  if (input.activation !== undefined && !(INSTRUCTION_ACTIVATIONS as string[]).includes(input.activation)) {
    issues.push({ field: "activation", message: `Unknown activation ${String(input.activation)}.` });
  }
  if (input.severity !== undefined && !(INSTRUCTION_SEVERITIES as string[]).includes(input.severity)) {
    issues.push({ field: "severity", message: `Unknown severity ${String(input.severity)}.` });
  }
  if (input.provenance !== undefined && !(INSTRUCTION_PROVENANCES as string[]).includes(input.provenance)) {
    issues.push({ field: "provenance", message: `Unknown provenance ${String(input.provenance)}.` });
  }
  if (input.state !== undefined && !(INSTRUCTION_STATES as string[]).includes(input.state)) {
    issues.push({ field: "state", message: `Unknown state ${String(input.state)}.` });
  }
  if (input.priority !== undefined) {
    if (!isFiniteInteger(input.priority) || input.priority < INSTRUCTION_PRIORITY_MIN || input.priority > INSTRUCTION_PRIORITY_MAX) {
      issues.push({ field: "priority", message: `Priority must be integer in [${INSTRUCTION_PRIORITY_MIN}, ${INSTRUCTION_PRIORITY_MAX}].` });
    }
  }
  if (input.confidence !== undefined) {
    if (typeof input.confidence !== "number" || input.confidence < 0 || input.confidence > 1) {
      issues.push({ field: "confidence", message: "Confidence must be a number in [0, 1]." });
    }
  }
  issues.push(...validateInstructionBody(input).issues);
  return { ok: issues.length === 0, issues };
}

export function targetSpecificity(target: InstructionTarget): number {
  let count = 0;
  for (const axis of INSTRUCTION_TARGET_AXES) {
    if (target[axis] !== undefined) count += 1;
  }
  return count;
}

export interface InstructionEvent {
  target: InstructionTarget;
  trigger: InstructionTrigger;
}

export function targetMatchesEvent(declared: InstructionTarget, observed: InstructionTarget): boolean {
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const declaredValue = declared[axis];
    if (declaredValue === undefined) continue;
    const observedValue = observed[axis];
    if (axis === "action") {
      if (declaredValue === "*") continue;
      if (observedValue === undefined) return false;
      if (declaredValue !== observedValue) return false;
      continue;
    }
    if (observedValue === undefined) return false;
    if (declaredValue !== observedValue) return false;
  }
  return true;
}

export function instructionMatchesEvent(instruction: Pick<ClawInstruction, "target" | "trigger">, event: InstructionEvent): boolean {
  if (instruction.trigger !== event.trigger) return false;
  return targetMatchesEvent(instruction.target, event.target);
}

export interface ResolveOptions {
  includeProposed?: boolean;
  defaultsActive?: boolean;
}

export function isInstructionActive(instruction: ClawInstruction, options: ResolveOptions = {}): boolean {
  if (instruction.state === "archived") return false;
  if (instruction.state === "proposed" && !options.includeProposed) return false;
  if (instruction.activation === "off") return false;
  if (instruction.activation === "auto") {
    return options.defaultsActive !== false;
  }
  return instruction.activation === "on";
}

export function compareResolvedInstructions(a: ClawInstruction, b: ClawInstruction): number {
  const specA = targetSpecificity(a.target);
  const specB = targetSpecificity(b.target);
  if (specA !== specB) return specB - specA;
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return 0;
}

export function resolveInstructionsForEvent(
  instructions: ReadonlyArray<ClawInstruction>,
  event: InstructionEvent,
  options: ResolveOptions = {},
): ClawInstruction[] {
  const matches = instructions.filter((entry) =>
    isInstructionActive(entry, options) && instructionMatchesEvent(entry, event),
  );
  return [...matches].sort(compareResolvedInstructions);
}

export interface MergedInstructionView {
  fields: Partial<Record<InstructionBodyField, { value: string; source: string }>>;
  contributors: ClawInstruction[];
  highestSeverity: InstructionSeverity;
  blocking: ClawInstruction[];
}

function severityRank(value: InstructionSeverity): number {
  switch (value) {
    case "block":
      return 2;
    case "warn":
      return 1;
    case "info":
      return 0;
  }
}

export function mergeResolvedInstructions(resolved: ReadonlyArray<ClawInstruction>): MergedInstructionView {
  const view: MergedInstructionView = {
    fields: {},
    contributors: [...resolved],
    highestSeverity: "info",
    blocking: [],
  };
  let highestRank = -1;
  for (const entry of resolved) {
    const rank = severityRank(entry.severity);
    if (rank > highestRank) {
      highestRank = rank;
      view.highestSeverity = entry.severity;
    }
    if (entry.severity === "block") view.blocking.push(entry);
    for (const field of INSTRUCTION_BODY_FIELDS) {
      const value = entry[field];
      if (typeof value !== "string" || value.length === 0) continue;
      if (view.fields[field] !== undefined) continue;
      view.fields[field] = {
        value,
        source: entry.source ?? entry.id,
      };
    }
  }
  return view;
}

export function describeInstructionTarget(target: InstructionTarget): string {
  const parts: string[] = [];
  for (const axis of INSTRUCTION_TARGET_AXES) {
    const value = target[axis];
    if (value === undefined) continue;
    parts.push(`${axis}=${value}`);
  }
  return parts.length === 0 ? "<empty>" : parts.join(" ");
}
