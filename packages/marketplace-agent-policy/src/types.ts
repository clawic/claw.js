// Agent policy types.
//
// A policy lives on a Block (or on a Group, or globally) and declares what
// the daemon's autonomous agent is allowed to do without human review.
// Everything autonomous is gated and produces an audit record so the user can
// inspect what happened after the fact.

import type { CborValue } from "@clawjs/marketplace/cbor";
import type { Block, Group } from "@clawjs/profile";

export type PolicyScope = "block" | "group" | "global";

export interface PolicyCondition {
  /** Field path on the Block's overlay/content/fields. e.g. "price_hint_eur". */
  field: string;
  /** Comparison operator. */
  op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "in" | "exists";
  value?: CborValue;
}

export type PolicyConditions = PolicyCondition[];

export interface AutoPublishRule {
  allowed: boolean;
  /** Earliest time of day (HH:MM, 24h, UTC) to publish at. */
  earliestUtc?: string;
  /** Conditions that must hold against the block being published. */
  conditions?: PolicyConditions;
}

export interface AutoRespondRule {
  allowed: boolean;
  templateId?: string;
  /** Don't auto-respond more than once every N minutes per (peer, block). */
  cooldownMinutes?: number;
  conditions?: PolicyConditions;
}

export interface AutoAcceptInterestRule {
  allowed: boolean;
  minReputation?: number;
  /** Auto-accept only when the peer already shares a group with the owner. */
  requireSharedGroup?: boolean;
  conditions?: PolicyConditions;
}

export interface AutoLowerPriceRule {
  allowed: boolean;
  /** Cap on the percentage reduction relative to the original price. */
  capPercent: number;
  /** Frequency at which the rule may fire. */
  frequencyDays: number;
}

export interface AgentPolicySpec {
  scope: PolicyScope;
  autoPublish?: AutoPublishRule;
  autoRespond?: AutoRespondRule;
  autoAcceptInterest?: AutoAcceptInterestRule;
  autoLowerPrice?: AutoLowerPriceRule;
}

export type AutonomousAction =
  | "auto_publish"
  | "auto_respond"
  | "auto_accept_interest"
  | "auto_lower_price";

export interface EvaluationContext {
  block: Block;
  groups: Group[];
  /** The peer this evaluation is about, if any (used by auto_respond / auto_accept_interest). */
  peerRootPubkey?: Uint8Array;
  /** Recent autonomous actions on this block, used for cooldown / frequency checks. */
  recentActions: AuditEntry[];
  /** Current time, epoch seconds. Defaults to `Date.now()`. */
  now?: number;
}

export interface EvaluationResult {
  action: AutonomousAction;
  allowed: boolean;
  reasons: string[];
}

// ---- audit ----

export interface AuditEntry {
  id: string;                       // ULID / UUID
  action: AutonomousAction;
  blockId: Uint8Array;
  peerRootPubkey?: Uint8Array;
  decidedAt: number;
  result: "allowed" | "blocked";
  reasons: string[];
}
