import path from "path";

import {
  soulSpecSchema,
  soulStateSchema,
  type SoulAssignment,
  type SoulCompileResult,
  type SoulModuleKey,
  type SoulModules,
  type SoulSpec,
  type SoulState,
  type SoulValidationIssue,
  type SoulValidationResult,
} from "@clawjs/core";

import { applyTextMutation } from "../files/managed-blocks.ts";
import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { CLAWJS_DIR } from "../workspace/manifest.ts";
import { readWorkspaceFile, writeWorkspaceFile } from "../workspace/manager.ts";

export const SOUL_STATE_FILE = "souls.json";
export const SOUL_MANAGED_BLOCK_ID = "soul-spec";
export const SOUL_TARGET_FILE = "SOUL.md";
export const DEFAULT_SOUL_ID = "default";

const MODULE_KEYS: SoulModuleKey[] = [
  "identity", "mission", "values", "temperament", "communication", "cognition", "autonomy",
  "memory", "boundaries", "tools", "social", "domain", "operations", "vibe",
];

const SLIDER_VALUES = new Set(["very_low", "low", "medium", "high", "very_high"]);
const PRESET_IDS = [
  "balanced", "operator", "engineer", "researcher", "analyst", "creative", "tutor", "product",
  "support", "sales", "writing", "executive", "companion", "personal-assistant",
] as const;

function nowIso(): string { return new Date().toISOString(); }
function titleFromId(id: string): string {
  return id.split(/[._-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || id;
}
function unique(values: string[] = []): string[] { return [...new Set(values.filter(Boolean))]; }
function modules(input: Partial<SoulModules> = {}): SoulModules {
  return {
    identity: {}, mission: {}, values: {}, temperament: {}, communication: {}, cognition: {}, autonomy: {},
    memory: {}, boundaries: {}, tools: {}, social: {}, domain: {}, operations: {}, vibe: {}, ...input,
  };
}
function makeSpec(id: string, title: string, patch: Partial<SoulModules>, description?: string, presetId?: string): SoulSpec {
  const timestamp = nowIso();
  return { schemaVersion: 1, id, title, ...(description ? { description } : {}), ...(presetId ? { presetId } : {}), modules: modules(patch), createdAt: timestamp, updatedAt: timestamp };
}

function baseBalanced(id = "balanced", title = "Balanced Soul"): SoulSpec {
  return makeSpec(id, title, {
    identity: { role: "general-purpose agent", archetype: "balanced operator", continuityStyle: "workspace_memory", relationshipToUser: "trusted collaborator" },
    mission: { primaryPurpose: "Help the user make concrete progress with clear judgment and minimal friction.", defaultPosture: "assist", timeHorizon: "daily", priorities: ["usefulness", "clarity", "safe execution"] },
    values: { honesty: "high", privacy: "very_high", usefulness: "very_high", independence: "medium", rigor: "high", care: "medium", values: ["be useful", "be honest", "respect private context"] },
    temperament: { warmth: "medium", energy: "medium", patience: "high", humor: "low", confidence: "medium", intensity: "medium", emotionalRange: "natural" },
    communication: { directness: "high", detail: "medium", formality: "neutral", verbosity: "concise", disagreementStyle: "direct", questionFrequency: "low", structurePreference: "mixed", languagePolicy: "mirror_user", forbiddenPhrases: ["Great question", "I'd be happy to"] },
    cognition: { rigor: "high", creativity: "medium", skepticism: "medium", speedVsAccuracy: "balanced", uncertaintyPolicy: "state_confidence", planningStyle: "plan_first", researchDepth: "medium", abstractionLevel: "balanced" },
    autonomy: { askPolicy: "ask_before_external", riskTolerance: "medium", initiative: "high", externalActionPolicy: "ask_first", spendingPolicy: "ask_first", publicVoicePolicy: "draft_only", reversibleChanges: "act" },
    memory: { persistence: "workspace_files", updatePolicy: "stable_facts", rememberPreferences: true, rememberPeople: true, rememberProjects: true, forgetPolicy: "on_request", sensitiveDataPolicy: "minimize" },
    boundaries: { privacyBoundary: "very_high", medicalLegalFinancialBoundary: "general_info_only", manipulationBoundary: "refuse", secretsPolicy: "reference_only", minorsPolicy: "extra_care", prohibitedActions: ["reveal secrets", "act externally without authorization"] },
    tools: { toolEagerness: "high", inspectBeforeAsking: true, shellPolicy: "preferred_for_local_truth", browserPolicy: "when_current_needed", fileEditPolicy: "minimal", validationPolicy: "targeted" },
    social: { userAddressStyle: "mirror", groupChatPosture: "helpful", thirdPartyTone: "professional", conflictStyle: "direct", boundariesWithUser: "collaborator" },
    domain: { primaryDomains: ["general assistance", "software", "operations"], learningPolicy: "research", expertiseVoice: "confident" },
    operations: { executionStyle: "minimal_change", debuggingStyle: "diagnose_first", reportingStyle: "brief", qualityGate: "tests", commitStyle: "project_policy", rollbackPolicy: "never_without_permission" },
    vibe: { descriptors: ["direct", "competent", "calm"], avoidDescriptors: ["sycophantic", "corporate", "performative"], aesthetic: "plain", humanity: "medium", edge: "low" },
  }, "Default pragmatic operating posture.", id === "balanced" ? undefined : "balanced");
}

function preset(id: string): SoulSpec {
  const spec = baseBalanced(id, `${titleFromId(id)} Soul`);
  spec.presetId = id;
  const m = spec.modules;
  if (id === "operator") { m.identity.archetype = "decisive operator"; m.autonomy.initiative = "very_high"; m.operations.executionStyle = "minimal_change"; }
  if (id === "engineer") { m.identity.role = "software engineering agent"; m.domain.primaryDomains = ["software engineering", "debugging", "systems design"]; m.operations.qualityGate = "e2e"; }
  if (id === "researcher") { m.cognition.researchDepth = "very_high"; m.cognition.speedVsAccuracy = "accuracy"; m.domain.primaryDomains = ["research", "synthesis", "evidence review"]; }
  if (id === "analyst") { m.cognition.rigor = "very_high"; m.communication.detail = "high"; m.domain.primaryDomains = ["analysis", "metrics", "decision support"]; }
  if (id === "creative") { m.cognition.creativity = "very_high"; m.temperament.energy = "high"; m.vibe.descriptors = ["inventive", "sharp", "tasteful"]; }
  if (id === "tutor") { m.mission.defaultPosture = "coach"; m.communication.questionFrequency = "medium"; m.temperament.patience = "very_high"; }
  if (id === "product") { m.domain.primaryDomains = ["product strategy", "user experience", "prioritization"]; m.mission.timeHorizon = "strategic"; }
  if (id === "support") { m.temperament.warmth = "high"; m.communication.disagreementStyle = "diplomatic"; m.domain.primaryDomains = ["customer support", "triage", "issue resolution"]; }
  if (id === "sales") { m.social.thirdPartyTone = "warm"; m.domain.primaryDomains = ["sales", "positioning", "objection handling"]; m.boundaries.manipulationBoundary = "redirect"; }
  if (id === "writing") { m.communication.verbosity = "balanced"; m.domain.primaryDomains = ["writing", "editing", "voice matching"]; m.vibe.descriptors = ["clear", "specific", "natural"]; }
  if (id === "executive") { m.mission.timeHorizon = "strategic"; m.communication.directness = "very_high"; m.domain.primaryDomains = ["strategy", "leadership", "prioritization"]; }
  if (id === "companion") { m.temperament.warmth = "very_high"; m.social.boundariesWithUser = "companion"; m.autonomy.riskTolerance = "low"; }
  if (id === "personal-assistant") { m.identity.role = "personal assistant"; m.memory.rememberPreferences = true; m.domain.primaryDomains = ["personal operations", "scheduling", "communications"]; }
  return spec;
}

export const BUILTIN_SOUL_PRESETS: SoulSpec[] = PRESET_IDS.map((id) => id === "balanced" ? baseBalanced() : preset(id));

export interface SoulStoreOptions { workspaceDir: string; filesystem?: NodeFileSystemHost; }
export interface SoulInitInput { id?: string; title?: string; description?: string; presetId?: string; extends?: string[]; modules?: Partial<SoulModules>; }
export interface SoulCompileOptions { soulId?: string; agentId?: string; write?: boolean; }

type LegacyModule = { directives?: string[]; notes?: string[]; settings?: Record<string, unknown>; enabled?: boolean } & Record<string, unknown>;
type LegacySpec = Omit<SoulSpec, "modules"> & { extends?: string[]; modules?: Record<string, LegacyModule> };

function camelSetting(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
function migrateLegacySpec(raw: LegacySpec): SoulSpec {
  const base = raw.presetId ? preset(raw.presetId) : raw.extends?.[0] ? preset(raw.extends[0]) : baseBalanced(raw.id || DEFAULT_SOUL_ID, raw.title || "Default Soul");
  const next = makeSpec(raw.id || base.id, raw.title || base.title, base.modules, raw.description || base.description, raw.presetId || raw.extends?.[0] || base.presetId);
  next.createdAt = raw.createdAt || next.createdAt;
  next.updatedAt = raw.updatedAt || nowIso();
  for (const key of MODULE_KEYS) {
    const legacy = raw.modules?.[key];
    if (!legacy) continue;
    const target = next.modules[key] as Record<string, unknown>;
    for (const [settingKey, value] of Object.entries(legacy.settings ?? {})) target[camelSetting(settingKey)] = value;
    if (legacy.directives?.length) target.principles = unique([...(target.principles as string[] ?? []), ...legacy.directives]);
    if (legacy.notes?.length) target.principles = unique([...(target.principles as string[] ?? []), ...legacy.notes]);
  }
  return next;
}
function normalizeState(raw: unknown): SoulState {
  const parsed = raw as { schemaVersion?: number; specs?: LegacySpec[]; assignments?: Array<Record<string, unknown>>; updatedAt?: string };
  const normalizeSpec = (spec: LegacySpec): SoulSpec => {
    const maybeModern = soulSpecSchema.safeParse(spec);
    return maybeModern.success ? maybeModern.data : migrateLegacySpec(spec);
  };
  const state: SoulState = {
    schemaVersion: 1,
    specs: (parsed.specs ?? []).map(normalizeSpec),
    assignments: (parsed.assignments ?? []).map((a) => ({ agentId: String(a.agentId || ""), soulId: String(a.soulId || DEFAULT_SOUL_ID), createdAt: String(a.createdAt || nowIso()), updatedAt: String(a.updatedAt || nowIso()) })).filter((a) => a.agentId),
    updatedAt: parsed.updatedAt || nowIso(),
  };
  return soulStateSchema.parse(state);
}
function applyModules(base: SoulModules, patch: Partial<SoulModules> = {}): SoulModules {
  const next = modules(base);
  for (const key of MODULE_KEYS) next[key] = { ...next[key], ...(patch[key] ?? {}) } as never;
  return next;
}
function effectivePreset(id?: string): SoulSpec { return BUILTIN_SOUL_PRESETS.find((p) => p.id === id) ?? baseBalanced(); }
function listText(values?: string[]): string { return unique(values).join(", "); }
function levelText(value?: string): string | null {
  if (!value) return null;
  return value.replace(/_/g, " ");
}
function sentence(lines: string[], value: string | null | undefined): void { if (value) lines.push(value.endsWith(".") ? value : `${value}.`); }

/**
 * @deprecated SoulStore is a compatibility shim. Souls are now modeled as
 * skills-v2 entries with `kind: personality`. Use `claw.skills.create({ kind: "personality", ... })`
 * and `claw.skills.compile([slug])` for new code. SoulStore continues to work
 * for the duration of the deprecation window.
 */
export class SoulStore {
  readonly workspaceDir: string;
  private readonly filesystem: NodeFileSystemHost;
  constructor(options: SoulStoreOptions) { this.workspaceDir = options.workspaceDir; this.filesystem = options.filesystem ?? new NodeFileSystemHost(); }
  get statePath(): string { return path.join(this.workspaceDir, CLAWJS_DIR, SOUL_STATE_FILE); }
  readState(): SoulState {
    if (!this.filesystem.exists(this.statePath)) return { schemaVersion: 1, specs: [baseBalanced(DEFAULT_SOUL_ID, "Default Soul")], assignments: [], updatedAt: nowIso() };
    const state = normalizeState(JSON.parse(this.filesystem.readText(this.statePath)) as unknown);
    if (!state.specs.some((spec) => spec.id === DEFAULT_SOUL_ID)) state.specs.unshift(baseBalanced(DEFAULT_SOUL_ID, "Default Soul"));
    return state;
  }
  writeState(state: SoulState): SoulState {
    const next = soulStateSchema.parse({ ...state, updatedAt: nowIso() });
    this.filesystem.withLock(resolveFileLockPath(this.statePath), () => this.filesystem.writeTextAtomic(this.statePath, `${JSON.stringify(next, null, 2)}\n`));
    return next;
  }
  list(): SoulSpec[] { return this.readState().specs; }
  get(id: string): SoulSpec | null { return this.readState().specs.find((spec) => spec.id === id) ?? null; }
  init(input: SoulInitInput = {}): SoulSpec {
    const state = this.readState();
    const id = input.id?.trim() || DEFAULT_SOUL_ID;
    const presetId = input.presetId || input.extends?.[0] || (id === DEFAULT_SOUL_ID ? "balanced" : undefined);
    const base = effectivePreset(presetId);
    const existing = state.specs.find((spec) => spec.id === id);
    const timestamp = nowIso();
    const next: SoulSpec = existing ? { ...existing } : { ...base, id, title: input.title?.trim() || titleFromId(id), createdAt: timestamp, updatedAt: timestamp };
    next.title = input.title?.trim() || next.title;
    if (input.description !== undefined) next.description = input.description;
    if (presetId) next.presetId = presetId;
    next.modules = applyModules(existing ? next.modules : base.modules, input.modules);
    next.updatedAt = timestamp;
    const specs = existing ? state.specs.map((spec) => spec.id === id ? next : spec) : [...state.specs, next];
    this.writeState({ ...state, specs });
    return next;
  }
  assign(input: { soulId: string; agentId: string }): SoulAssignment {
    if (!this.get(input.soulId)) throw new Error(`Soul not found: ${input.soulId}`);
    const state = this.readState();
    const timestamp = nowIso();
    const existing = state.assignments.find((a) => a.agentId === input.agentId);
    const next = { agentId: input.agentId, soulId: input.soulId, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp };
    this.writeState({ ...state, assignments: existing ? state.assignments.map((a) => a.agentId === input.agentId ? next : a) : [...state.assignments, next] });
    return next;
  }
  assignmentForAgent(agentId: string): SoulAssignment | null { return this.readState().assignments.find((a) => a.agentId === agentId) ?? null; }
  resolve(input: { soulId?: string; agentId?: string } = {}): SoulSpec {
    const state = this.readState();
    const assignment = input.soulId ? null : input.agentId ? state.assignments.find((a) => a.agentId === input.agentId) ?? null : null;
    const id = input.soulId || assignment?.soulId || DEFAULT_SOUL_ID;
    const spec = state.specs.find((s) => s.id === id) ?? state.specs.find((s) => s.id === DEFAULT_SOUL_ID) ?? baseBalanced(DEFAULT_SOUL_ID, "Default Soul");
    return soulSpecSchema.parse(spec);
  }
  validate(input?: SoulSpec): SoulValidationResult {
    const parsed = soulSpecSchema.safeParse(input ?? this.resolve());
    const issues: SoulValidationIssue[] = parsed.success ? [] : parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "$", message: issue.message }));
    return { ok: issues.length === 0, issues };
  }
  renderMarkdown(spec: SoulSpec): string {
    const m = spec.modules;
    const lines = [`# ${spec.title}`, "", "<!-- Generated from ClawJS SoulSpec. Edit the structured soul source, not this block. -->", ""];
    sentence(lines, spec.description);
    sentence(lines, `You are ${m.identity.name ? `${m.identity.name}, ` : ""}${m.identity.role || "an agent"}${m.identity.archetype ? ` with the posture of a ${m.identity.archetype}` : ""}`);
    sentence(lines, m.identity.relationshipToUser ? `Relate to the user as ${m.identity.relationshipToUser}` : null);
    sentence(lines, m.mission.primaryPurpose || null);
    if (m.mission.priorities?.length) sentence(lines, `Prioritize ${listText(m.mission.priorities)}`);
    sentence(lines, `Communicate with ${levelText(m.communication.directness) || "balanced"} directness, ${m.communication.verbosity || "balanced"} detail, and a ${m.communication.formality || "neutral"} tone`);
    sentence(lines, m.communication.languagePolicy === "mirror_user" ? "Reply in the same language the user uses" : null);
    sentence(lines, `Think with ${levelText(m.cognition.rigor) || "high"} rigor, ${levelText(m.cognition.creativity) || "medium"} creativity, and prefer ${String(m.cognition.uncertaintyPolicy || "state_confidence").replace(/_/g, " ")} when uncertain`);
    sentence(lines, `Use autonomy policy ${String(m.autonomy.askPolicy || "ask_before_external").replace(/_/g, " ")}; external actions are ${String(m.autonomy.externalActionPolicy || "ask_first").replace(/_/g, " ")}`);
    sentence(lines, `Treat memory as ${String(m.memory.persistence || "workspace_files").replace(/_/g, " ")} and update it under the ${String(m.memory.updatePolicy || "stable_facts").replace(/_/g, " ")} policy`);
    sentence(lines, `Never reveal secrets; handle private context with ${levelText(m.boundaries.privacyBoundary) || "very high"} care`);
    if (m.tools.inspectBeforeAsking) sentence(lines, "Inspect available local context before asking questions that can be answered directly");
    sentence(lines, `Operate with a ${String(m.operations.executionStyle || "minimal_change").replace(/_/g, " ")} execution style and ${String(m.operations.debuggingStyle || "diagnose_first").replace(/_/g, " ")} debugging`);
    if (m.domain.primaryDomains?.length) sentence(lines, `Strong domains: ${listText(m.domain.primaryDomains)}`);
    if (m.vibe.descriptors?.length) sentence(lines, `The overall feel should be ${listText(m.vibe.descriptors)}`);
    const principles = MODULE_KEYS.flatMap((key) => m[key].principles ?? []);
    if (principles.length) lines.push("", "Core principles:", ...unique(principles).map((p) => `- ${p}`));
    return lines.join("\n").trimEnd();
  }
  preview(options: SoulCompileOptions = {}): SoulCompileResult {
    const spec = this.resolve({ soulId: options.soulId, agentId: options.agentId });
    const validation = this.validate(spec);
    if (!validation.ok) throw new Error(`Invalid SoulSpec: ${validation.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    const markdown = this.renderMarkdown(spec);
    const before = readWorkspaceFile(this.workspaceDir, SOUL_TARGET_FILE, this.filesystem) ?? "";
    const after = applyTextMutation({ originalContent: before, mode: "managed_block", blockId: SOUL_MANAGED_BLOCK_ID, content: markdown });
    return { soulId: spec.id, ...(options.agentId ? { agentId: options.agentId } : {}), markdown: after, targetFile: SOUL_TARGET_FILE, blockId: SOUL_MANAGED_BLOCK_ID, changed: before.replace(/\r\n/g, "\n") !== after };
  }
  compile(options: SoulCompileOptions = {}): SoulCompileResult { const result = this.preview(options); if (options.write !== false) writeWorkspaceFile(this.workspaceDir, SOUL_TARGET_FILE, result.markdown, this.filesystem); return result; }
  inspect(id?: string, agentId?: string): { state: SoulState; spec: SoulSpec | null; resolved: SoulSpec | null; validation: SoulValidationResult } {
    const state = this.readState();
    const resolved = agentId ? this.resolve({ agentId }) : id ? this.resolve({ soulId: id }) : null;
    const spec = id ? state.specs.find((entry) => entry.id === id) ?? null : resolved;
    return { state, spec, resolved, validation: resolved ? this.validate(resolved) : { ok: true, issues: [] } };
  }
}
export function createSoulStore(options: SoulStoreOptions): SoulStore { return new SoulStore(options); }
