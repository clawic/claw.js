import {
  INSTRUCTION_BODY_FIELDS,
  describeInstructionTarget,
  resolveInstructionsForEvent,
  type ClawInstruction,
  type InstructionBodyField,
  type InstructionEvent,
  type InstructionTrigger,
} from "./cli-instructions.ts";

export type RenderTier = "skeleton" | "compact" | "full";

export interface RenderOptions {
  tier?: RenderTier;
  budgetTokens?: number;
  binName?: string;
}

export interface RenderRulePayload {
  id: string;
  source: string;
  provenance: ClawInstruction["provenance"];
  severity: ClawInstruction["severity"];
  priority: number;
  target: ClawInstruction["target"];
  trigger: InstructionTrigger;
  fields: Partial<Record<InstructionBodyField, string>>;
}

export interface RenderPayload {
  tier: RenderTier;
  scope: string;
  trigger: InstructionTrigger;
  rules: RenderRulePayload[];
  truncated: string[];
  breadcrumbs: string[];
  budgetTokens: number;
  estimatedTokens: number;
  disclaimer: string;
}

const DEFAULT_BUDGET_TOKENS = 2048;
const CHARS_PER_TOKEN = 4;
const DEFAULT_BIN_NAME = "claw";

const DISCLAIMER =
  "These rules complement, never override, CONSTITUTION.md and AGENTS.md.";

function severityRank(severity: ClawInstruction["severity"]): number {
  switch (severity) {
    case "block":
      return 2;
    case "warn":
      return 1;
    case "info":
      return 0;
  }
}

function ruleToPayload(rule: ClawInstruction): RenderRulePayload {
  const fields: Partial<Record<InstructionBodyField, string>> = {};
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const value = rule[field];
    if (typeof value === "string" && value.length > 0) {
      fields[field] = value;
    }
  }
  return {
    id: rule.id,
    source: rule.source ?? rule.id,
    provenance: rule.provenance,
    severity: rule.severity,
    priority: rule.priority,
    target: rule.target,
    trigger: rule.trigger,
    fields,
  };
}

function estimateRuleTokens(rule: RenderRulePayload): number {
  let chars = 0;
  for (const field of INSTRUCTION_BODY_FIELDS) {
    const value = rule.fields[field];
    if (typeof value === "string") chars += value.length + field.length + 4;
  }
  chars += rule.id.length + rule.source.length + 32;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

function tierShouldDrop(tier: RenderTier, rule: RenderRulePayload): boolean {
  if (tier === "skeleton") return true;
  if (tier === "compact") {
    if (rule.severity === "block") return false;
    if (rule.priority >= 70) return false;
    return true;
  }
  return false;
}

function rulesForScope(
  resolved: ClawInstruction[],
  tier: RenderTier,
  budgetTokens: number,
): { rules: RenderRulePayload[]; truncated: string[]; estimatedTokens: number } {
  const payloads = resolved.map(ruleToPayload).sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    return b.priority - a.priority;
  });
  const rules: RenderRulePayload[] = [];
  const truncated: string[] = [];
  let tokens = 0;
  for (const rule of payloads) {
    const ruleTokens = estimateRuleTokens(rule);
    const drop = tierShouldDrop(tier, rule);
    if (drop || tokens + ruleTokens > budgetTokens) {
      truncated.push(rule.source);
      continue;
    }
    rules.push(rule);
    tokens += ruleTokens;
  }
  return { rules, truncated, estimatedTokens: tokens };
}

function breadcrumbsForTruncated(
  truncated: string[],
  trigger: InstructionTrigger,
  binName: string,
  observed: ClawInstruction["target"],
): string[] {
  if (truncated.length === 0) return [];
  const cmd = observed.command;
  const action = observed.action;
  const lines: string[] = [];
  if (cmd && action && action !== "*") {
    lines.push(`For full guidance on ${cmd} ${action}, run: ${binName} prompt for-action ${cmd} ${action} --tier=full`);
  } else if (cmd) {
    lines.push(`For full guidance on ${cmd}, run: ${binName} prompt for-action ${cmd} --tier=full`);
  } else {
    lines.push(`For full guidance run: ${binName} prompt session-start --tier=full`);
  }
  if (trigger !== "surface-action") {
    lines.push(`Trigger-specific guidance: ${binName} prompt ${trigger} --tier=full`);
  }
  return lines;
}

export function renderInstructionsPayload(
  resolved: ClawInstruction[],
  event: InstructionEvent,
  options: RenderOptions = {},
): RenderPayload {
  const tier = options.tier ?? "compact";
  const budgetTokens = Math.max(0, options.budgetTokens ?? DEFAULT_BUDGET_TOKENS);
  const binName = options.binName ?? DEFAULT_BIN_NAME;
  const { rules, truncated, estimatedTokens } = rulesForScope(resolved, tier, budgetTokens);
  return {
    tier,
    scope: describeInstructionTarget(event.target),
    trigger: event.trigger,
    rules,
    truncated,
    breadcrumbs: breadcrumbsForTruncated(truncated, event.trigger, binName, event.target),
    budgetTokens,
    estimatedTokens,
    disclaimer: DISCLAIMER,
  };
}

export function renderInstructionsMarkdown(payload: RenderPayload): string {
  const lines: string[] = [];
  lines.push(`# Claw instructions — ${payload.scope} (trigger=${payload.trigger}, tier=${payload.tier})`);
  lines.push("");
  lines.push(`> ${payload.disclaimer}`);
  lines.push("");
  if (payload.rules.length === 0) {
    lines.push("No active rules apply at this tier.");
  }
  for (const rule of payload.rules) {
    const header = `## ${rule.severity.toUpperCase()} · ${rule.id} — priority ${rule.priority}`;
    lines.push(header);
    lines.push(`- Source: ${rule.source}`);
    lines.push(`- Target: ${describeInstructionTarget(rule.target)}`);
    for (const field of INSTRUCTION_BODY_FIELDS) {
      const value = rule.fields[field];
      if (typeof value !== "string" || value.length === 0) continue;
      lines.push(`- ${field}: ${value}`);
    }
    lines.push("");
  }
  if (payload.breadcrumbs.length > 0) {
    lines.push("---");
    for (const breadcrumb of payload.breadcrumbs) {
      lines.push(`- ${breadcrumb}`);
    }
    lines.push("");
  }
  if (payload.truncated.length > 0) {
    lines.push(`Truncated ${payload.truncated.length} rules to honor tier=${payload.tier} budget=${payload.budgetTokens} tokens.`);
  }
  return lines.join("\n").trimEnd();
}

export function resolveAndRender(
  instructions: ReadonlyArray<ClawInstruction>,
  event: InstructionEvent,
  options: RenderOptions = {},
): { payload: RenderPayload; markdown: string } {
  const resolved = resolveInstructionsForEvent(instructions, event);
  const payload = renderInstructionsPayload(resolved, event, options);
  return { payload, markdown: renderInstructionsMarkdown(payload) };
}
