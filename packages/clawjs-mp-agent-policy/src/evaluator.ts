// Pure evaluator for agent policies.

import type { CborValue } from "@clawjs/mp/cbor";
import type {
  AgentPolicySpec, AutoLowerPriceRule, AutoPublishRule, AutoRespondRule,
  AutoAcceptInterestRule, AutonomousAction, AuditEntry,
  EvaluationContext, EvaluationResult, PolicyCondition,
} from "./types.ts";

export function evaluate(spec: AgentPolicySpec, action: AutonomousAction, ctx: EvaluationContext): EvaluationResult {
  const now = ctx.now ?? Math.floor(Date.now() / 1000);
  switch (action) {
    case "auto_publish": return evaluateAutoPublish(spec.autoPublish, ctx, now);
    case "auto_respond": return evaluateAutoRespond(spec.autoRespond, ctx, now);
    case "auto_accept_interest": return evaluateAutoAcceptInterest(spec.autoAcceptInterest, ctx);
    case "auto_lower_price": return evaluateAutoLowerPrice(spec.autoLowerPrice, ctx, now);
  }
}

function evaluateAutoPublish(rule: AutoPublishRule | undefined, ctx: EvaluationContext, now: number): EvaluationResult {
  if (!rule?.allowed) return deny("auto_publish", ["rule disabled"]);
  if (rule.earliestUtc) {
    const cur = new Date(now * 1000);
    const [hh, mm] = rule.earliestUtc.split(":").map(Number);
    const minNow = cur.getUTCHours() * 60 + cur.getUTCMinutes();
    const minRule = hh * 60 + mm;
    if (minNow < minRule) return deny("auto_publish", [`before earliestUtc=${rule.earliestUtc}`]);
  }
  const condRes = evaluateConditions(rule.conditions, ctx);
  if (!condRes.ok) return deny("auto_publish", condRes.reasons);
  return allow("auto_publish");
}

function evaluateAutoRespond(rule: AutoRespondRule | undefined, ctx: EvaluationContext, now: number): EvaluationResult {
  if (!rule?.allowed) return deny("auto_respond", ["rule disabled"]);
  if (rule.cooldownMinutes && ctx.peerRootPubkey) {
    const last = lastActionFor("auto_respond", ctx, ctx.peerRootPubkey);
    if (last && now - last.decidedAt < rule.cooldownMinutes * 60) {
      return deny("auto_respond", [`cooldown active for ${rule.cooldownMinutes}m`]);
    }
  }
  const condRes = evaluateConditions(rule.conditions, ctx);
  if (!condRes.ok) return deny("auto_respond", condRes.reasons);
  return allow("auto_respond");
}

function evaluateAutoAcceptInterest(rule: AutoAcceptInterestRule | undefined, ctx: EvaluationContext): EvaluationResult {
  if (!rule?.allowed) return deny("auto_accept_interest", ["rule disabled"]);
  if (rule.requireSharedGroup && ctx.peerRootPubkey) {
    const shared = ctx.groups.some((g) => g.members.some((m) => bytesEqual(m, ctx.peerRootPubkey!)));
    if (!shared) return deny("auto_accept_interest", ["peer not in any shared group"]);
  }
  const condRes = evaluateConditions(rule.conditions, ctx);
  if (!condRes.ok) return deny("auto_accept_interest", condRes.reasons);
  return allow("auto_accept_interest");
}

function evaluateAutoLowerPrice(rule: AutoLowerPriceRule | undefined, ctx: EvaluationContext, now: number): EvaluationResult {
  if (!rule?.allowed) return deny("auto_lower_price", ["rule disabled"]);
  const last = ctx.recentActions
    .filter((a) => a.action === "auto_lower_price" && bytesEqual(a.blockId, ctx.block.blockId))
    .sort((a, b) => b.decidedAt - a.decidedAt)[0];
  if (last && now - last.decidedAt < rule.frequencyDays * 86400) {
    return deny("auto_lower_price", [`frequency window of ${rule.frequencyDays}d not elapsed`]);
  }
  return allow("auto_lower_price");
}

function lastActionFor(action: AutonomousAction, ctx: EvaluationContext, peer: Uint8Array): AuditEntry | undefined {
  return ctx.recentActions
    .filter((a) => a.action === action && a.peerRootPubkey && bytesEqual(a.peerRootPubkey, peer))
    .sort((a, b) => b.decidedAt - a.decidedAt)[0];
}

function evaluateConditions(conditions: PolicyCondition[] | undefined, ctx: EvaluationContext): { ok: boolean; reasons: string[] } {
  if (!conditions || conditions.length === 0) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  for (const c of conditions) {
    const v = lookupField(ctx.block, c.field);
    if (!matches(v, c)) reasons.push(`condition failed: ${c.field} ${c.op} ${JSON.stringify(c.value)}`);
  }
  return { ok: reasons.length === 0, reasons };
}

function lookupField(block: EvaluationContext["block"], path: string): CborValue | undefined {
  const overlay = block.overlay?.[path];
  if (overlay !== undefined) return overlay;
  return block.content?.[path];
}

function matches(value: CborValue | undefined, c: PolicyCondition): boolean {
  switch (c.op) {
    case "exists": return value !== undefined && value !== null;
    case "eq": return value === c.value;
    case "neq": return value !== c.value;
    case "lt": return typeof value === "number" && typeof c.value === "number" && value < c.value;
    case "lte": return typeof value === "number" && typeof c.value === "number" && value <= c.value;
    case "gt": return typeof value === "number" && typeof c.value === "number" && value > c.value;
    case "gte": return typeof value === "number" && typeof c.value === "number" && value >= c.value;
    case "in": return Array.isArray(c.value) && c.value.includes(value as never);
    default: return false;
  }
}

function allow(action: AutonomousAction): EvaluationResult { return { action, allowed: true, reasons: [] }; }
function deny(action: AutonomousAction, reasons: string[]): EvaluationResult { return { action, allowed: false, reasons }; }

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
