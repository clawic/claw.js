import path from "path";

import {
  rulesStateSchema,
  type PromptContextBlock,
  type RuleInput,
  type RuleRecord,
  type RuleScope,
  type RuleScopeInput,
  type RulesCompileInput,
  type RulesCompileMatch,
  type RulesCompileResult,
  type RulesState,
} from "@clawjs/core";

import { expandHome, resolveClawGlobalSurfacePath } from "../surface-paths.ts";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { BUILTIN_CLAW_RULE_SCOPES, BUILTIN_CLAW_RULES, isBuiltinClawJSRule } from "./builtin.ts";

export const RULES_STATE_FILE = "rules.json";

export interface RulesStoreOptions {
  rootDir?: string;
  filesystem?: NodeFileSystemHost;
  env?: NodeJS.ProcessEnv;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resolveRulesRoot(options: RulesStoreOptions = {}): string {
  const configured = options.rootDir?.trim()
    || options.env?.CLAW_RULES_DIR?.trim()
    || process.env.CLAW_RULES_DIR?.trim();
  if (configured) return expandHome(configured);
  return resolveClawGlobalSurfacePath("claw.global.rules", options.env);
}

export function normalizeRuleId(value: string, fallback = "rule"): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[./]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || fallback;
}

function uniqueStrings(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function phraseMatches(haystack: string, values: string[] = []): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized && haystack.includes(normalized)) return value;
  }
  return null;
}

function hintMatches(hint: string | undefined, values: string[] = []): string | null {
  const normalizedHint = normalizeText(hint);
  if (!normalizedHint) return null;
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized && (normalizedHint === normalized || normalizedHint.includes(normalized) || normalized.includes(normalizedHint))) {
      return value;
    }
  }
  return null;
}

function scopeHint(input: RulesCompileInput, scope: RuleScope): string | undefined {
  switch (scope.kind) {
    case "user": return input.user;
    case "organization": return input.organization;
    case "brand": return input.brand;
    case "client": return input.client;
    case "project": return input.project;
    case "domain": return input.domain;
    case "service": return input.service;
    case "task": return input.taskType;
    case "output": return input.outputFormat;
    default: return undefined;
  }
}

function arrayMatches(input: RulesCompileInput, field: keyof NonNullable<RuleRecord["applyWhen"]>, values: string[] | undefined, prompt: string): string | null {
  if (!values?.length) return null;
  const hint = field === "taskTypes"
    ? input.taskType
    : field === "outputFormats"
      ? input.outputFormat
      : field === "domains"
        ? input.domain
        : field === "services"
          ? input.service
          : field === "projects"
            ? input.project
            : field === "agents"
              ? input.agent
              : field === "channels"
                ? input.channel
                : undefined;
  return hintMatches(hint, values) ?? phraseMatches(prompt, values);
}

function ruleConflictKey(rule: RuleRecord): string {
  return normalizeRuleId(rule.key ?? `${rule.kind}:${rule.title}`, `${rule.kind}-rule`);
}

function renderRule(rule: RuleRecord): string {
  const references = rule.references.length
    ? ` References: ${rule.references.map((ref) => `${ref.kind}:${ref.label ?? ref.ref}`).join(", ")}.`
    : "";
  return `- ${rule.title}: ${rule.content.trim()}${references}`;
}

function renderPrompt(matches: RulesCompileMatch[]): string {
  if (matches.length === 0) return "";
  return [
    "Apply these Rules when working on this request:",
    ...matches.map((match) => renderRule(match.rule)),
  ].join("\n");
}

function mergeById<T extends { id: string }>(builtins: T[], locals: T[]): T[] {
  const localIds = new Set(locals.map((entry) => entry.id));
  return [
    ...builtins.filter((entry) => !localIds.has(entry.id)),
    ...locals,
  ];
}

export class LocalRulesStore {
  readonly rootDir: string;
  private readonly filesystem: NodeFileSystemHost;

  constructor(options: RulesStoreOptions = {}) {
    this.rootDir = resolveRulesRoot(options);
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  statePath(): string {
    return path.join(this.rootDir, RULES_STATE_FILE);
  }

  readState(): RulesState {
    try {
      const parsed = rulesStateSchema.safeParse(JSON.parse(this.filesystem.readText(this.statePath())));
      if (parsed.success) return parsed.data as RulesState;
    } catch {
      // Fall through to an empty state.
    }
    return {
      schemaVersion: 1,
      scopes: [],
      rules: [],
      updatedAt: nowIso(),
    };
  }

  readEffectiveState(): RulesState {
    const local = this.readState();
    return {
      schemaVersion: 1,
      scopes: mergeById(BUILTIN_CLAW_RULE_SCOPES, local.scopes),
      rules: mergeById(BUILTIN_CLAW_RULES, local.rules),
      updatedAt: local.updatedAt,
    };
  }

  writeState(state: RulesState): RulesState {
    const next: RulesState = {
      schemaVersion: 1,
      updatedAt: nowIso(),
      scopes: [...state.scopes].sort((left, right) => left.id.localeCompare(right.id)),
      rules: [...state.rules].sort((left, right) => left.id.localeCompare(right.id)),
    };
    this.filesystem.ensureDir(this.rootDir);
    this.filesystem.withLockRetry(resolveFileLockPath(this.statePath()), () => {
      this.filesystem.writeTextAtomic(this.statePath(), `${JSON.stringify(next, null, 2)}\n`);
    });
    return next;
  }

  status() {
    const local = this.readState();
    const state = this.readEffectiveState();
    const builtinRules = state.rules.filter(isBuiltinClawJSRule);
    const localRules = local.rules;
    return {
      rootDir: this.rootDir,
      scopes: state.scopes.length,
      rules: state.rules.length,
      pending: state.rules.filter((rule) => rule.status === "pending").length,
      active: state.rules.filter((rule) => rule.status === "active").length,
      archived: state.rules.filter((rule) => rule.status === "archived").length,
      builtin: builtinRules.length,
      local: localRules.length,
      updatedAt: state.updatedAt,
    };
  }

  list(options: { status?: RuleRecord["status"]; scopeId?: string } = {}): RuleRecord[] {
    return this.readEffectiveState().rules
      .filter((rule) => !options.status || rule.status === options.status)
      .filter((rule) => !options.scopeId || rule.scopeId === options.scopeId);
  }

  scopes(): RuleScope[] {
    return this.readEffectiveState().scopes;
  }

  get(id: string): RuleRecord | null {
    const ruleId = normalizeRuleId(id);
    return this.readEffectiveState().rules.find((rule) => rule.id === ruleId) ?? null;
  }

  upsertScope(input: RuleScopeInput): RuleScope {
    const state = this.readState();
    const id = normalizeRuleId(input.id ?? input.name, "scope");
    const now = nowIso();
    const current = state.scopes.find((scope) => scope.id === id);
    const next: RuleScope = {
      id,
      kind: input.kind,
      name: input.name.trim(),
      ...(input.parentId ? { parentId: normalizeRuleId(input.parentId) } : {}),
      aliases: uniqueStrings(input.aliases),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    const scopes = [...state.scopes.filter((scope) => scope.id !== id), next];
    this.writeState({ ...state, scopes });
    return next;
  }

  propose(input: RuleInput): RuleRecord {
    return this.saveRule({ ...input, status: input.status ?? "pending" });
  }

  saveRule(input: RuleInput): RuleRecord {
    const state = this.readState();
    const scopeId = normalizeRuleId(input.scopeId, "scope");
    const availableScopes = mergeById(BUILTIN_CLAW_RULE_SCOPES, state.scopes);
    if (!availableScopes.some((scope) => scope.id === scopeId)) {
      throw new Error(`Rule scope not found: ${input.scopeId}`);
    }
    const id = normalizeRuleId(input.id ?? input.title, "rule");
    const now = nowIso();
    const current = state.rules.find((rule) => rule.id === id);
    const status = input.status ?? current?.status ?? "pending";
    const next: RuleRecord = {
      id,
      title: input.title.trim(),
      kind: input.kind ?? current?.kind ?? "directive",
      status,
      scopeId,
      content: input.content.trim(),
      ...(input.applyWhen ? { applyWhen: normalizeApplyWhen(input.applyWhen) } : current?.applyWhen ? { applyWhen: current.applyWhen } : {}),
      aliases: uniqueStrings(input.aliases ?? current?.aliases),
      priority: input.priority ?? current?.priority ?? 100,
      ...(input.key ? { key: normalizeRuleId(input.key) } : current?.key ? { key: current.key } : {}),
      references: input.references ?? current?.references ?? [],
      ...(input.agentIds?.length ? { agentIds: uniqueStrings(input.agentIds) } : current?.agentIds ? { agentIds: current.agentIds } : {}),
      ...(input.channelIds?.length ? { channelIds: uniqueStrings(input.channelIds) } : current?.channelIds ? { channelIds: current.channelIds } : {}),
      ...(input.source ? { source: input.source } : current?.source ? { source: current.source } : {}),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...(status === "active" ? { approvedAt: current?.approvedAt ?? now } : {}),
      ...(status === "archived" ? { archivedAt: current?.archivedAt ?? now } : {}),
    };
    const rules = [...state.rules.filter((rule) => rule.id !== id), next];
    this.writeState({ ...state, rules });
    return next;
  }

  approve(id: string): RuleRecord {
    const current = this.get(id);
    if (!current) throw new Error(`Rule not found: ${id}`);
    return this.saveRule({ ...current, status: "active" });
  }

  archive(id: string): RuleRecord {
    const current = this.get(id);
    if (!current) throw new Error(`Rule not found: ${id}`);
    return this.saveRule({ ...current, status: "archived" });
  }

  compile(input: RulesCompileInput): RulesCompileResult {
    const state = this.readEffectiveState();
    const prompt = normalizeText(input.prompt);
    const scopesById = new Map(state.scopes.map((scope) => [scope.id, scope]));
    const omitted: RulesCompileResult["omitted"] = [];
    const warnings: string[] = [];
    const matched: RulesCompileMatch[] = [];

    for (const rule of state.rules) {
      if (rule.status !== "active") {
        omitted.push({ rule, reason: `status:${rule.status}` });
        continue;
      }
      const scopePath = this.scopePath(rule.scopeId, scopesById);
      if (scopePath.length === 0) {
        omitted.push({ rule, reason: "missing-scope" });
        continue;
      }
      const scopeMatch = this.matchScopePath(scopePath, input, prompt);
      if (!scopeMatch.ok) {
        omitted.push({ rule, reason: scopeMatch.reason });
        continue;
      }
      const applies = this.matchApplyWhen(rule, input, prompt);
      if (!applies.ok) {
        omitted.push({ rule, reason: applies.reason });
        continue;
      }
      matched.push({
        rule,
        scopePath,
        reasons: [...scopeMatch.reasons, ...applies.reasons],
        specificity: scopePath.length,
      });
    }

    const included: RulesCompileMatch[] = [];
    const overridden: RulesCompileResult["overridden"] = [];
    const byKey = new Map<string, RulesCompileMatch[]>();
    for (const match of matched) {
      const key = ruleConflictKey(match.rule);
      byKey.set(key, [...(byKey.get(key) ?? []), match]);
    }

    for (const [key, entries] of byKey) {
      const sorted = [...entries].sort((left, right) =>
        right.specificity - left.specificity
        || left.rule.priority - right.rule.priority
        || Number(isBuiltinClawJSRule(left.rule)) - Number(isBuiltinClawJSRule(right.rule))
        || left.rule.updatedAt.localeCompare(right.rule.updatedAt)
        || left.rule.id.localeCompare(right.rule.id));
      const winner = sorted[0]!;
      const tied = sorted.filter((entry) =>
        entry !== winner
        && entry.specificity === winner.specificity
        && entry.rule.priority === winner.rule.priority);
      if (tied.length > 0) {
        warnings.push(`Unresolved rule conflict for ${key}: ${[winner, ...tied].map((entry) => entry.rule.id).join(", ")}`);
        included.push(...sorted.filter((entry) => entry.specificity === winner.specificity && entry.rule.priority === winner.rule.priority));
        for (const entry of sorted.filter((entry) => entry.specificity !== winner.specificity || entry.rule.priority !== winner.rule.priority)) {
          overridden.push({ ...entry, overriddenBy: winner.rule.id });
        }
        continue;
      }
      included.push(winner);
      for (const entry of sorted.slice(1)) {
        overridden.push({ ...entry, overriddenBy: winner.rule.id });
      }
    }

    included.sort((left, right) =>
      right.specificity - left.specificity
      || left.rule.priority - right.rule.priority
      || left.rule.title.localeCompare(right.rule.title));
    const limited = included.slice(0, Math.max(1, input.limit ?? 20));
    const content = renderPrompt(limited);
    const block: PromptContextBlock | null = content ? { id: "clawjs-rules", title: "Applicable Rules", content } : null;
    return {
      input,
      block,
      prompt: content,
      matched,
      included: limited,
      overridden,
      omitted,
      warnings,
    };
  }

  private scopePath(scopeId: string, scopesById: Map<string, RuleScope>): RuleScope[] {
    const result: RuleScope[] = [];
    const seen = new Set<string>();
    let current = scopesById.get(scopeId);
    while (current && !seen.has(current.id)) {
      result.unshift(current);
      seen.add(current.id);
      current = current.parentId ? scopesById.get(current.parentId) : undefined;
    }
    return result;
  }

  private matchScopePath(scopePath: RuleScope[], input: RulesCompileInput, prompt: string): { ok: boolean; reasons: string[]; reason: string } {
    const reasons: string[] = [];
    for (const scope of scopePath) {
      const values = [scope.id, scope.name, ...scope.aliases];
      const hint = hintMatches(scopeHint(input, scope), values);
      if (hint) {
        reasons.push(`scope:${scope.kind}:${scope.id}:hint:${hint}`);
        continue;
      }
      const promptMatch = phraseMatches(prompt, values);
      if (promptMatch) {
        reasons.push(`scope:${scope.kind}:${scope.id}:prompt:${promptMatch}`);
        continue;
      }
      if (scope.kind === "user" && ["global", "default", "user"].includes(normalizeText(scope.name))) {
        reasons.push(`scope:${scope.kind}:${scope.id}:default`);
        continue;
      }
      return { ok: false, reasons, reason: `scope-not-matched:${scope.id}` };
    }
    return { ok: true, reasons, reason: "" };
  }

  private matchApplyWhen(rule: RuleRecord, input: RulesCompileInput, prompt: string): { ok: boolean; reasons: string[]; reason: string } {
    const reasons: string[] = [];
    if (rule.agentIds?.length && !hintMatches(input.agent, rule.agentIds)) {
      return { ok: false, reasons, reason: "agent-filter-not-matched" };
    }
    if (rule.channelIds?.length && !hintMatches(input.channel, rule.channelIds)) {
      return { ok: false, reasons, reason: "channel-filter-not-matched" };
    }
    const applyWhen = rule.applyWhen;
    if (!applyWhen) return { ok: true, reasons: ["apply:always"], reason: "" };

    for (const [field, values] of Object.entries(applyWhen) as Array<[keyof NonNullable<RuleRecord["applyWhen"]>, string[] | undefined]>) {
      if (!values?.length) continue;
      const match = field === "keywords" ? phraseMatches(prompt, values) : arrayMatches(input, field, values, prompt);
      if (!match) return { ok: false, reasons, reason: `apply-not-matched:${field}` };
      reasons.push(`apply:${field}:${match}`);
    }
    return { ok: true, reasons, reason: "" };
  }
}

function normalizeApplyWhen(input: NonNullable<RuleRecord["applyWhen"]>): NonNullable<RuleRecord["applyWhen"]> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, uniqueStrings(value as string[] | undefined)])
      .filter(([, value]) => Array.isArray(value) && value.length > 0),
  ) as NonNullable<RuleRecord["applyWhen"]>;
}

export function createLocalRulesStore(options: RulesStoreOptions = {}): LocalRulesStore {
  return new LocalRulesStore(options);
}
