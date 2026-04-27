import path from "path";
import { createHash, randomUUID } from "crypto";

import {
  judgmentRecordSchema,
  judgmentStateSchema,
  type JudgmentContextRefs,
  type JudgmentImpact,
  type JudgmentLinkInput,
  type JudgmentListInput,
  type JudgmentOptionScore,
  type JudgmentPrepareInput,
  type JudgmentRecommendation,
  type JudgmentRecord,
  type JudgmentRecordInput,
  type JudgmentState,
  type LearningRecord,
  type RuleRecord,
  type RulesCompileMatch,
  type SessionRecord,
  type SoulSpec,
  type UserSpec,
} from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAWJS_DIR } from "../workspace/manifest.ts";

export const JUDGMENT_STATE_FILE = "judgment.json";

export interface JudgmentPrepareContext {
  rules: RulesCompileMatch[];
  learnings: LearningRecord[];
  user?: UserSpec | null;
  soul?: SoulSpec | null;
  session?: SessionRecord | null;
}

export interface JudgmentStoreOptions {
  workspaceDir: string;
  filesystem?: NodeFileSystemHost;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function emptyContext(): JudgmentContextRefs {
  return {
    rules: [],
    learnings: [],
    user: [],
    soul: [],
    sessions: [],
    decisions: [],
    artifacts: [],
    plans: [],
    tasks: [],
  };
}

function questionTokens(value: string): string[] {
  return normalizeKey(value)
    .split(" ")
    .filter((token) => token.length > 3)
    .slice(0, 16);
}

function containsOption(value: string, option: string): boolean {
  const haystack = normalizeKey(value);
  const needle = normalizeKey(option);
  return Boolean(needle) && (haystack === needle || haystack.includes(needle));
}

function tokenOverlap(value: string, tokens: string[]): number {
  const haystack = normalizeKey(value);
  return tokens.filter((token) => haystack.includes(token)).length;
}

function userRefs(user: UserSpec | null | undefined, option: string): string[] {
  if (!user) return [];
  const refs: string[] = [];
  for (const [facet, facts] of Object.entries(user.facets)) {
    for (const fact of facts) {
      if (containsOption(`${fact.key} ${JSON.stringify(fact.value)}`, option)) refs.push(`user:${facet}:${fact.id}`);
    }
  }
  for (const fact of user.customFacts) {
    if (containsOption(`${fact.title} ${JSON.stringify(fact.value)}`, option)) refs.push(`user:custom:${fact.id}`);
  }
  for (const proposal of user.proposals) {
    if (containsOption(`${proposal.title ?? ""} ${proposal.path ?? ""} ${JSON.stringify(proposal.value ?? proposal.fields ?? "")}`, option)) {
      refs.push(`user:proposal:${proposal.id}`);
    }
  }
  return refs;
}

function soulRefs(soul: SoulSpec | null | undefined, option: string): string[] {
  if (!soul) return [];
  return containsOption(JSON.stringify(soul), option) ? [soul.id] : [];
}

function sessionText(session: SessionRecord | null | undefined): string {
  return session?.messages.map((message) => message.content).join("\n") ?? "";
}

function scoreOption(
  option: string,
  question: string,
  context: JudgmentPrepareContext,
): JudgmentOptionScore {
  const tokens = questionTokens(question);
  let score = 0;
  const evidence: string[] = [];

  for (const match of context.rules) {
    const text = `${match.rule.title} ${match.rule.content}`;
    if (containsOption(text, option)) {
      const overlap = tokenOverlap(text, tokens);
      score += 0.34 + Math.min(0.16, overlap * 0.04);
      evidence.push(`rule:${match.rule.id}`);
    }
  }

  for (const learning of context.learnings) {
    if (!containsOption(learning.claim, option)) continue;
    const positive = learning.evidence.filter((entry) => entry.sentiment === "positive").length;
    const negative = learning.evidence.filter((entry) => entry.sentiment === "negative").length;
    const net = Math.max(-1, Math.min(1, positive - negative));
    score += learning.confidence * 0.34 * (net >= 0 ? 1 : -1);
    evidence.push(`learning:${learning.id}`);
  }

  const userMatches = userRefs(context.user, option);
  if (userMatches.length) {
    score += 0.12;
    evidence.push(...userMatches);
  }

  const soulMatches = soulRefs(context.soul, option);
  if (soulMatches.length) {
    score += 0.06;
    evidence.push(...soulMatches.map((id) => `soul:${id}`));
  }

  const text = sessionText(context.session);
  if (text && containsOption(text, option)) {
    score += 0.08;
    evidence.push(`session:${context.session?.sessionId}`);
  }

  return {
    option,
    score: clamp01(score),
    evidence: unique(evidence),
  };
}

function recommendationFor(input: {
  impact: JudgmentImpact;
  confidence: number;
  hasContradiction: boolean;
  hasOptions: boolean;
}): JudgmentRecommendation {
  if (!input.hasOptions) return input.impact === "critical" ? "block" : "ask_user";
  if (input.impact === "critical" && input.confidence < 0.75) return "block";
  if (input.impact === "high" && input.confidence < 0.7) return "ask_user";
  if (input.hasContradiction || input.confidence < 0.55) return "ask_user";
  return "act";
}

function buildRationale(input: {
  recommendation: JudgmentRecommendation;
  recommendedOption?: string;
  context: JudgmentContextRefs;
  hasContradiction: boolean;
  confidence: number;
}): string {
  const sources = [
    input.context.rules.length ? "rules" : "",
    input.context.learnings.length ? "learnings" : "",
    input.context.user.length ? "user" : "",
    input.context.soul.length ? "soul" : "",
    input.context.sessions.length ? "sessions" : "",
  ].filter(Boolean);
  if (input.recommendation === "act" && input.recommendedOption) {
    return `Evidence from ${sources.join(", ") || "available context"} supports ${input.recommendedOption} with confidence ${input.confidence.toFixed(2)}.`;
  }
  if (input.recommendation === "block") {
    return "Impact is too high for the available evidence; block is recommended until more context is available.";
  }
  if (input.hasContradiction) {
    return "Available evidence is contradictory; ask the user before committing to an option.";
  }
  return "Available evidence is not strong enough; ask the user or gather more context before deciding.";
}

function contextRefs(
  input: JudgmentPrepareInput,
  context: JudgmentPrepareContext,
  optionScores: JudgmentOptionScore[],
): JudgmentContextRefs {
  const refs = emptyContext();
  refs.rules = unique(context.rules.map((match) => match.rule.id));
  refs.learnings = unique(context.learnings.map((learning) => learning.id));
  refs.sessions = input.sessionId ? [input.sessionId] : [];
  refs.user = unique(optionScores.flatMap((score) => score.evidence.filter((entry) => entry.startsWith("user:"))));
  refs.soul = unique(optionScores.flatMap((score) => score.evidence.filter((entry) => entry.startsWith("soul:")).map((entry) => entry.slice("soul:".length))));
  return refs;
}

function mergeLinks(context: JudgmentContextRefs, links: JudgmentLinkInput): JudgmentContextRefs {
  return {
    ...context,
    rules: unique([...context.rules, ...(links.rule ? [links.rule] : [])]),
    learnings: unique([...context.learnings, ...(links.learning ? [links.learning] : [])]),
    sessions: unique([...context.sessions, ...(links.session ? [links.session] : [])]),
    decisions: unique([...context.decisions, ...(links.decision ? [links.decision] : [])]),
    artifacts: unique([...context.artifacts, ...(links.artifact ? [links.artifact] : [])]),
    plans: unique([...context.plans, ...(links.plan ? [links.plan] : [])]),
    tasks: unique([...context.tasks, ...(links.task ? [links.task] : [])]),
  };
}

export class JudgmentStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: JudgmentStoreOptions) {
    this.workspaceDir = options.workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  get statePath(): string {
    return path.join(this.workspaceDir, CLAWJS_DIR, JUDGMENT_STATE_FILE);
  }

  readState(): JudgmentState {
    try {
      return judgmentStateSchema.parse(JSON.parse(this.filesystem.readText(this.statePath))) as JudgmentState;
    } catch {
      return { schemaVersion: 1, judgments: [], updatedAt: nowIso() };
    }
  }

  writeState(state: JudgmentState): JudgmentState {
    const next = judgmentStateSchema.parse({
      schemaVersion: 1,
      judgments: [...state.judgments].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      updatedAt: nowIso(),
    }) as JudgmentState;
    this.filesystem.ensureDir(path.dirname(this.statePath));
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath), () => {
      this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  list(input: JudgmentListInput = {}): JudgmentRecord[] {
    return this.readState().judgments
      .filter((judgment) => !input.status || judgment.status === input.status)
      .filter((judgment) => !input.domain || judgment.domain === input.domain);
  }

  get(id: string): JudgmentRecord | null {
    return this.readState().judgments.find((judgment) => judgment.id === id) ?? null;
  }

  prepare(input: JudgmentPrepareInput, context: JudgmentPrepareContext): JudgmentRecord {
    const question = normalizeText(input.question);
    const domain = normalizeText(input.domain);
    if (!question) throw new Error("Judgment question is required.");
    if (!domain) throw new Error("Judgment domain is required.");
    const options = unique(input.options ?? []);
    const impact = input.impact ?? "medium";
    const optionScores = options.map((option) => scoreOption(option, question, context)).sort((left, right) => right.score - left.score);
    const best = optionScores[0];
    const second = optionScores[1];
    const hasContradiction = Boolean(best && second && best.score > 0 && second.score > 0 && best.score - second.score < 0.15);
    const confidence = clamp01(best ? 0.35 + best.score * 0.65 - (hasContradiction ? 0.2 : 0) : 0.25);
    const recommendation = recommendationFor({ impact, confidence, hasContradiction, hasOptions: options.length > 0 });
    const recommendedOption = recommendation === "act" || recommendation === "delegate" ? best?.option : best && confidence >= 0.55 ? best.option : undefined;
    const refs = contextRefs(input, context, optionScores);
    const rationale = buildRationale({ recommendation, recommendedOption, context: refs, hasContradiction, confidence });
    const timestamp = nowIso();
    const id = `judgment_${shortHash(`${question}:${domain}:${timestamp}:${randomUUID()}`)}`;
    const judgment = judgmentRecordSchema.parse({
      id,
      question,
      domain,
      impact,
      status: "prepared",
      options,
      recommendation,
      ...(recommendedOption ? { recommendedOption } : {}),
      confidence,
      rationale,
      context: refs,
      optionScores,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }) as JudgmentRecord;
    const state = this.readState();
    this.writeState({ ...state, judgments: [...state.judgments, judgment] });
    return judgment;
  }

  record(id: string, input: JudgmentRecordInput): JudgmentRecord {
    const state = this.readState();
    const current = state.judgments.find((judgment) => judgment.id === id);
    if (!current) throw new Error(`Judgment not found: ${id}`);
    const timestamp = nowIso();
    const next = judgmentRecordSchema.parse({
      ...current,
      status: "decided",
      chosenOption: normalizeText(input.chosen),
      rationale: normalizeText(input.rationale),
      ...(input.confidence !== undefined ? { confidence: clamp01(input.confidence) } : {}),
      ...(input.outcome ? { outcome: normalizeText(input.outcome) } : {}),
      decidedAt: timestamp,
      updatedAt: timestamp,
    }) as JudgmentRecord;
    this.writeState({ ...state, judgments: state.judgments.map((judgment) => judgment.id === id ? next : judgment) });
    return next;
  }

  link(id: string, links: JudgmentLinkInput): JudgmentRecord {
    const state = this.readState();
    const current = state.judgments.find((judgment) => judgment.id === id);
    if (!current) throw new Error(`Judgment not found: ${id}`);
    const next = judgmentRecordSchema.parse({
      ...current,
      context: mergeLinks(current.context, links),
      updatedAt: nowIso(),
    }) as JudgmentRecord;
    this.writeState({ ...state, judgments: state.judgments.map((judgment) => judgment.id === id ? next : judgment) });
    return next;
  }

  archive(id: string, reason?: string): JudgmentRecord {
    const state = this.readState();
    const current = state.judgments.find((judgment) => judgment.id === id);
    if (!current) throw new Error(`Judgment not found: ${id}`);
    const timestamp = nowIso();
    const next = judgmentRecordSchema.parse({
      ...current,
      status: "archived",
      ...(reason ? { archiveReason: normalizeText(reason) } : {}),
      archivedAt: timestamp,
      updatedAt: timestamp,
    }) as JudgmentRecord;
    this.writeState({ ...state, judgments: state.judgments.map((judgment) => judgment.id === id ? next : judgment) });
    return next;
  }
}

export function createJudgmentStore(options: JudgmentStoreOptions): JudgmentStore {
  return new JudgmentStore(options);
}
