import { z } from "zod";

export const capabilityStatusSchema = z.enum([
  "unknown",
  "unsupported",
  "unavailable",
  "detected",
  "installing",
  "installed",
  "configuring",
  "ready",
  "degraded",
  "repairable",
  "error",
]);

export const runtimeCapabilityStrategySchema = z.enum([
  "native",
  "cli",
  "gateway",
  "config",
  "derived",
  "hosted",
  "bridge",
  "unsupported",
]);

export const runtimeCapabilitySupportSchema = z.object({
  supported: z.boolean(),
  status: capabilityStatusSchema,
  strategy: runtimeCapabilityStrategySchema,
  diagnostics: z.record(z.unknown()).optional(),
  limitations: z.array(z.string()).optional(),
});

export const manifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  appId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  runtimeAdapter: z.string().min(1),
  rootDir: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  templatePackPath: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  logicalAgentId: z.string().min(1).optional(),
  runtimeAgentId: z.string().min(1).optional(),
  materializationVersion: z.number().int().positive().optional(),
});

export const compatSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  runtimeAdapter: z.string().min(1),
  runtimeVersion: z.string().nullable(),
  probedAt: z.string().min(1),
  capabilities: z.record(z.boolean()),
  capabilityMap: z.record(runtimeCapabilitySupportSchema).optional(),
  diagnostics: z.record(z.unknown()).optional(),
});

export const capabilityReportSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().min(1),
  runtimeAdapter: z.string().min(1),
  runtimeVersion: z.string().nullable(),
  degraded: z.boolean(),
  capabilities: z.record(z.boolean()),
  capabilityMap: z.record(runtimeCapabilitySupportSchema).optional(),
  issues: z.array(z.string()),
  diagnostics: z.record(z.unknown()).optional(),
});

export const workspaceStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  appId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  rootDir: z.string().min(1),
  manifestPresent: z.boolean(),
  missingFiles: z.array(z.string()),
  missingDirectories: z.array(z.string()),
  projectId: z.string().min(1).optional(),
  logicalAgentId: z.string().min(1).optional(),
  runtimeAgentId: z.string().min(1).optional(),
  materializationVersion: z.number().int().positive().optional(),
});

export const providerStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  providers: z.record(z.object({
    provider: z.string().min(1),
    hasAuth: z.boolean(),
    hasSubscription: z.boolean(),
    hasApiKey: z.boolean(),
    hasProfileApiKey: z.boolean(),
    hasEnvKey: z.boolean(),
    authType: z.enum(["oauth", "token", "api_key", "env"]).nullable(),
    maskedCredential: z.string().nullable().optional(),
  })),
  missingProvidersInUse: z.array(z.string()).optional(),
});

export const schedulerStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  schedulers: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    status: z.enum(["idle", "running", "paused", "unknown"]),
    kind: z.enum(["cron", "routine", "job", "daemon", "workflow"]).optional(),
  })),
});

export const memoryStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  memory: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["file", "store", "index", "session", "knowledge"]),
    path: z.string().min(1).optional(),
    summary: z.string().optional(),
    updatedAt: z.string().optional(),
  })),
});

export const skillsStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  skills: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    scope: z.enum(["workspace", "runtime", "global"]).optional(),
    path: z.string().min(1).optional(),
  })),
});

export const skillSourceCapabilitiesSchema = z.object({
  search: z.boolean(),
  install: z.boolean(),
  resolveExact: z.boolean(),
});

export const skillSourceDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["ready", "degraded", "unsupported"]),
  capabilities: skillSourceCapabilitiesSchema,
  summary: z.string().min(1).optional(),
  warnings: z.array(z.string()).optional(),
});

export const skillCatalogEntrySchema = z.object({
  source: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().optional(),
  installRef: z.string().min(1),
  homepage: z.string().min(1).optional(),
});

export const skillSearchResultSchema = z.object({
  query: z.string().min(1),
  entries: z.array(skillCatalogEntrySchema),
  sources: z.array(skillSourceDescriptorSchema),
  omittedSources: z.array(z.object({
    source: z.string().min(1),
    reason: z.string().min(1),
  })).optional(),
  warnings: z.array(z.string()).optional(),
});

export const skillInstallResultSchema = z.object({
  source: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  installRef: z.string().min(1),
  homepage: z.string().min(1).optional(),
  installedPaths: z.array(z.string().min(1)).optional(),
  runtimeVisibility: z.enum(["runtime", "external", "unknown"]),
  warnings: z.array(z.string()).optional(),
});

export const libraryRequiredSecretSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1).optional(),
  allowedHosts: z.array(z.string().min(1)).optional(),
  allowedHeaders: z.array(z.string().min(1)).optional(),
  readOnly: z.boolean().optional(),
  notes: z.string().optional(),
});

export const skillContextCapsuleSchema = z.object({
  capsule: z.string().min(1).max(300),
  priority: z.number().int().default(100),
  readWhen: z.array(z.string().min(1)).optional(),
});

export const libraryAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["skill", "instruction", "bundle"]),
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string().min(1)).default([]),
  version: z.string().min(1).default("0.1.0"),
  source: z.object({
    source: z.string().min(1).optional(),
    installRef: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
  }).optional(),
  context: skillContextCapsuleSchema.optional(),
  projection: z.object({
    target: z.enum(["soul", "identity", "agents", "tools", "heartbeat", "user"]),
    blockId: z.string().min(1).optional(),
  }).optional(),
  requiredSecrets: z.array(libraryRequiredSecretSchema).default([]),
  autoApplyTags: z.array(z.string().min(1)).optional(),
  bundleAssetIds: z.array(z.string().min(1)).optional(),
  contentPath: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const libraryAssignmentSchema = z.object({
  assetId: z.string().min(1),
  scope: z.enum(["agent", "workspace"]),
  targetId: z.string().min(1),
  mode: z.enum(["include", "exclude"]),
  order: z.number().int().nonnegative().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const libraryStateSchema = z.object({
  schemaVersion: z.number().int().positive(),
  assets: z.array(libraryAssetSchema),
  assignments: z.array(libraryAssignmentSchema),
  updatedAt: z.string().min(1),
});

export const libraryResolveResultSchema = z.object({
  agentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)),
  assets: z.array(libraryAssetSchema.extend({
    includedBy: z.array(z.enum(["explicit", "tag", "bundle"])),
  })),
  missingSecrets: z.array(z.object({
    assetId: z.string().min(1),
    name: z.string().min(1),
    label: z.string().min(1).optional(),
  })),
});

export const ruleScopeKindSchema = z.enum([
  "user",
  "organization",
  "brand",
  "client",
  "project",
  "domain",
  "service",
  "task",
  "output",
]);

export const ruleKindSchema = z.enum(["directive", "default", "resource"]);
export const ruleStatusSchema = z.enum(["pending", "active", "archived"]);

export const ruleScopeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const ruleReferenceSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  label: z.string().min(1).optional(),
});

export const ruleApplyWhenSchema = z.object({
  keywords: z.array(z.string().min(1)).optional(),
  taskTypes: z.array(z.string().min(1)).optional(),
  outputFormats: z.array(z.string().min(1)).optional(),
  domains: z.array(z.string().min(1)).optional(),
  services: z.array(z.string().min(1)).optional(),
  projects: z.array(z.string().min(1)).optional(),
  agents: z.array(z.string().min(1)).optional(),
  channels: z.array(z.string().min(1)).optional(),
}).strict();

export const ruleRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: ruleKindSchema,
  status: ruleStatusSchema,
  scopeId: z.string().min(1),
  content: z.string().min(1),
  applyWhen: ruleApplyWhenSchema.optional(),
  aliases: z.array(z.string().min(1)).default([]),
  priority: z.number().int().default(100),
  key: z.string().min(1).optional(),
  references: z.array(ruleReferenceSchema).default([]),
  agentIds: z.array(z.string().min(1)).optional(),
  channelIds: z.array(z.string().min(1)).optional(),
  source: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  approvedAt: z.string().min(1).optional(),
  archivedAt: z.string().min(1).optional(),
});

export const rulesStateSchema = z.object({
  schemaVersion: z.literal(1),
  scopes: z.array(ruleScopeSchema),
  rules: z.array(ruleRecordSchema),
  updatedAt: z.string().min(1),
});

export const learningTargetSchema = z.enum(["user", "agent", "project", "workflow", "runtime", "ui"]);
export const learningKindSchema = z.enum(["preference", "observation", "correction", "workflow", "failure"]);
export const learningStatusSchema = z.enum(["active", "archived", "promoted"]);
export const learningEvidenceSentimentSchema = z.enum(["positive", "negative", "neutral"]);
export const learningPromotionTargetSchema = z.enum(["rule", "user", "soul", "skill", "memory"]);

export const learningEvidenceSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  sentiment: learningEvidenceSentimentSchema,
  note: z.string().min(1),
  quote: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});

export const learningPromotionSchema = z.object({
  target: learningPromotionTargetSchema,
  dryRun: z.boolean(),
  applied: z.boolean(),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  createdAt: z.string().min(1),
});

export const learningRecordSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  target: learningTargetSchema,
  kind: learningKindSchema,
  status: learningStatusSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(learningEvidenceSchema),
  promotions: z.array(learningPromotionSchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
  archiveReason: z.string().min(1).optional(),
  promotedAt: z.string().min(1).optional(),
  promotedTo: learningPromotionTargetSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const learningStateSchema = z.object({
  schemaVersion: z.literal(1),
  learnings: z.array(learningRecordSchema),
  updatedAt: z.string().min(1),
});

export const outcomeResultSchema = z.enum(["worked", "failed", "mixed"]);
export const outcomeStatusSchema = z.enum(["active", "archived"]);

export const outcomeLinksSchema = z.object({
  judgments: z.array(z.string().min(1)).default([]),
  sessions: z.array(z.string().min(1)).default([]),
  learnings: z.array(z.string().min(1)).default([]),
  tasks: z.array(z.string().min(1)).default([]),
  artifacts: z.array(z.string().min(1)).default([]),
});

export const outcomeRecordSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  result: outcomeResultSchema,
  score: z.number().min(0).max(1),
  note: z.string().min(1),
  status: outcomeStatusSchema,
  links: outcomeLinksSchema,
  expectedConfidence: z.number().min(0).max(1).optional(),
  confidenceGap: z.number().min(-1).max(1).optional(),
  agentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
  archiveReason: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const outcomeStateSchema = z.object({
  schemaVersion: z.literal(1),
  outcomes: z.array(outcomeRecordSchema),
  updatedAt: z.string().min(1),
});

export const contextPackStatusSchema = z.enum(["active", "archived"]);
export const contextPackPurposeSchema = z.enum(["judgment", "prompt", "task", "session", "manual"]);
export const contextPackSourceSchema = z.enum(["rule", "learning", "user", "soul", "session", "memory"]);
export const contextPackSensitivitySchema = z.enum(["public", "personal", "sensitive", "internal"]);

export const contextPackItemSchema = z.object({
  id: z.string().min(1),
  source: contextPackSourceSchema,
  sourceId: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
  reason: z.string().min(1),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  sensitivity: contextPackSensitivitySchema,
  metadata: z.record(z.unknown()).optional(),
});

export const contextPackBudgetSchema = z.object({
  maxItems: z.number().int().positive(),
  maxChars: z.number().int().positive(),
  itemCount: z.number().int().min(0),
  charCount: z.number().int().min(0),
});

export const contextPackRecordSchema = z.object({
  id: z.string().min(1),
  status: contextPackStatusSchema,
  purpose: contextPackPurposeSchema,
  query: z.string().min(1),
  domain: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  summary: z.string().min(1),
  items: z.array(contextPackItemSchema),
  sourceCounts: z.record(contextPackSourceSchema, z.number().int().min(0)),
  budget: contextPackBudgetSchema,
  agentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
  archiveReason: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const contextPackStateSchema = z.object({
  schemaVersion: z.literal(1),
  packs: z.array(contextPackRecordSchema),
  updatedAt: z.string().min(1),
});

export const commitmentKindSchema = z.enum(["promise", "follow_up", "delivery"]);
export const commitmentStatusSchema = z.enum(["active", "fulfilled", "missed", "cancelled"]);
export const commitmentSourceSchema = z.enum(["manual", "session_capture"]);
export const commitmentPartyKindSchema = z.enum(["agent", "user"]);

export const commitmentPartySchema = z.object({
  kind: commitmentPartyKindSchema,
  id: z.string().min(1).optional(),
});

export const commitmentEvidenceSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  note: z.string().min(1),
  quote: z.string().min(1).optional(),
  artifactId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
});

export const commitmentLinksSchema = z.object({
  sessions: z.array(z.string().min(1)).default([]),
  judgments: z.array(z.string().min(1)).default([]),
  decisions: z.array(z.string().min(1)).default([]),
  learnings: z.array(z.string().min(1)).default([]),
  tasks: z.array(z.string().min(1)).default([]),
  reminders: z.array(z.string().min(1)).default([]),
  deadlines: z.array(z.string().min(1)).default([]),
  artifacts: z.array(z.string().min(1)).default([]),
});

export const commitmentRecordSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  kind: commitmentKindSchema,
  status: commitmentStatusSchema,
  source: commitmentSourceSchema,
  owner: commitmentPartySchema,
  beneficiary: commitmentPartySchema,
  evidence: z.array(commitmentEvidenceSchema),
  links: commitmentLinksSchema,
  remindAt: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  outcome: z.string().min(1).optional(),
  missReason: z.string().min(1).optional(),
  cancelReason: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  fulfilledAt: z.string().min(1).optional(),
  missedAt: z.string().min(1).optional(),
  cancelledAt: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const commitmentStateSchema = z.object({
  schemaVersion: z.literal(1),
  commitments: z.array(commitmentRecordSchema),
  updatedAt: z.string().min(1),
});

export const judgmentStatusSchema = z.enum(["prepared", "decided", "superseded", "archived"]);
export const judgmentRecommendationSchema = z.enum(["act", "ask_user", "delegate", "block"]);
export const judgmentImpactSchema = z.enum(["low", "medium", "high", "critical"]);

export const judgmentContextRefsSchema = z.object({
  rules: z.array(z.string().min(1)).default([]),
  learnings: z.array(z.string().min(1)).default([]),
  user: z.array(z.string().min(1)).default([]),
  soul: z.array(z.string().min(1)).default([]),
  sessions: z.array(z.string().min(1)).default([]),
  decisions: z.array(z.string().min(1)).default([]),
  artifacts: z.array(z.string().min(1)).default([]),
  plans: z.array(z.string().min(1)).default([]),
  tasks: z.array(z.string().min(1)).default([]),
  commitments: z.array(z.string().min(1)).default([]),
});

export const judgmentOptionScoreSchema = z.object({
  option: z.string().min(1),
  score: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export const judgmentRecordSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  domain: z.string().min(1),
  impact: judgmentImpactSchema,
  status: judgmentStatusSchema,
  options: z.array(z.string().min(1)),
  recommendation: judgmentRecommendationSchema,
  recommendedOption: z.string().min(1).optional(),
  chosenOption: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  outcome: z.string().min(1).optional(),
  contextPackId: z.string().min(1).optional(),
  context: judgmentContextRefsSchema,
  optionScores: z.array(judgmentOptionScoreSchema),
  agentId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  decidedAt: z.string().min(1).optional(),
  archivedAt: z.string().min(1).optional(),
  archiveReason: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const judgmentStateSchema = z.object({
  schemaVersion: z.literal(1),
  judgments: z.array(judgmentRecordSchema),
  updatedAt: z.string().min(1),
});

export const soulSliderValueSchema = z.enum(["very_low", "low", "medium", "high", "very_high"]);
export const soulModuleModeSchema = z.enum(["disabled", "normal", "strong"]);
const soulModuleBaseSchema = z.object({
  mode: soulModuleModeSchema.optional(),
  principles: z.array(z.string().min(1)).optional(),
}).strict();

export const soulModulesSchema = z.object({
  identity: soulModuleBaseSchema.extend({
    name: z.string().min(1).optional(),
    role: z.string().min(1).optional(),
    archetype: z.string().min(1).optional(),
    selfConcept: z.string().min(1).optional(),
    relationshipToUser: z.string().min(1).optional(),
    continuityStyle: z.enum(["session_only", "workspace_memory", "long_running_identity"]).optional(),
    signatureBehaviors: z.array(z.string().min(1)).optional(),
  }).strict(),
  mission: soulModuleBaseSchema.extend({
    primaryPurpose: z.string().min(1).optional(),
    successCriteria: z.array(z.string().min(1)).optional(),
    priorities: z.array(z.string().min(1)).optional(),
    antiGoals: z.array(z.string().min(1)).optional(),
    defaultPosture: z.enum(["assist", "lead", "coach", "execute", "analyze"]).optional(),
    timeHorizon: z.enum(["immediate", "daily", "strategic"]).optional(),
  }).strict(),
  values: soulModuleBaseSchema.extend({
    honesty: soulSliderValueSchema.optional(),
    privacy: soulSliderValueSchema.optional(),
    usefulness: soulSliderValueSchema.optional(),
    independence: soulSliderValueSchema.optional(),
    rigor: soulSliderValueSchema.optional(),
    care: soulSliderValueSchema.optional(),
    values: z.array(z.string().min(1)).optional(),
    hardLines: z.array(z.string().min(1)).optional(),
  }).strict(),
  temperament: soulModuleBaseSchema.extend({
    warmth: soulSliderValueSchema.optional(),
    energy: soulSliderValueSchema.optional(),
    patience: soulSliderValueSchema.optional(),
    humor: soulSliderValueSchema.optional(),
    confidence: soulSliderValueSchema.optional(),
    intensity: soulSliderValueSchema.optional(),
    emotionalRange: z.enum(["reserved", "natural", "expressive"]).optional(),
  }).strict(),
  communication: soulModuleBaseSchema.extend({
    directness: soulSliderValueSchema.optional(),
    detail: soulSliderValueSchema.optional(),
    formality: z.enum(["casual", "neutral", "formal"]).optional(),
    verbosity: z.enum(["minimal", "concise", "balanced", "thorough"]).optional(),
    disagreementStyle: z.enum(["direct", "diplomatic", "socratic"]).optional(),
    questionFrequency: soulSliderValueSchema.optional(),
    structurePreference: z.enum(["prose", "bullets", "mixed"]).optional(),
    languagePolicy: z.enum(["mirror_user", "workspace_default", "english", "spanish"]).optional(),
    forbiddenPhrases: z.array(z.string().min(1)).optional(),
  }).strict(),
  cognition: soulModuleBaseSchema.extend({
    rigor: soulSliderValueSchema.optional(),
    creativity: soulSliderValueSchema.optional(),
    skepticism: soulSliderValueSchema.optional(),
    speedVsAccuracy: z.enum(["speed", "balanced", "accuracy"]).optional(),
    uncertaintyPolicy: z.enum(["state_confidence", "ask_clarifying", "research_first", "make_reasonable_assumption"]).optional(),
    planningStyle: z.enum(["act_first", "plan_first", "ask_first"]).optional(),
    researchDepth: soulSliderValueSchema.optional(),
    abstractionLevel: z.enum(["concrete", "balanced", "abstract"]).optional(),
  }).strict(),
  autonomy: soulModuleBaseSchema.extend({
    askPolicy: z.enum(["act", "ask_when_uncertain", "ask_before_external", "ask_first"]).optional(),
    riskTolerance: z.enum(["low", "medium", "high"]).optional(),
    initiative: soulSliderValueSchema.optional(),
    externalActionPolicy: z.enum(["never", "ask_first", "allowed_when_authorized"]).optional(),
    spendingPolicy: z.enum(["never", "ask_first"]).optional(),
    publicVoicePolicy: z.enum(["never_impersonate", "draft_only", "allowed_when_authorized"]).optional(),
    reversibleChanges: z.enum(["act", "ask_when_uncertain", "ask_first"]).optional(),
  }).strict(),
  memory: soulModuleBaseSchema.extend({
    persistence: z.enum(["none", "workspace_files", "structured_memory"]).optional(),
    updatePolicy: z.enum(["never", "ask_first", "stable_facts", "proactive"]).optional(),
    rememberPreferences: z.boolean().optional(),
    rememberPeople: z.boolean().optional(),
    rememberProjects: z.boolean().optional(),
    forgetPolicy: z.enum(["on_request", "expiry", "manual_review"]).optional(),
    sensitiveDataPolicy: z.enum(["avoid", "minimize", "allowed_if_needed"]).optional(),
  }).strict(),
  boundaries: soulModuleBaseSchema.extend({
    privacyBoundary: soulSliderValueSchema.optional(),
    medicalLegalFinancialBoundary: z.enum(["disclaim", "refer_out", "general_info_only"]).optional(),
    manipulationBoundary: z.enum(["refuse", "redirect", "ask_intent"]).optional(),
    secretsPolicy: z.enum(["never_reveal", "reference_only"]).optional(),
    minorsPolicy: z.enum(["extra_care", "standard"]).optional(),
    prohibitedActions: z.array(z.string().min(1)).optional(),
  }).strict(),
  tools: soulModuleBaseSchema.extend({
    toolEagerness: soulSliderValueSchema.optional(),
    inspectBeforeAsking: z.boolean().optional(),
    shellPolicy: z.enum(["avoid", "allowed", "preferred_for_local_truth"]).optional(),
    browserPolicy: z.enum(["when_current_needed", "avoid", "always_verify"]).optional(),
    fileEditPolicy: z.enum(["minimal", "normal", "proactive"]).optional(),
    validationPolicy: z.enum(["none", "targeted", "e2e_required"]).optional(),
    preferredTools: z.array(z.string().min(1)).optional(),
  }).strict(),
  social: soulModuleBaseSchema.extend({
    userAddressStyle: z.enum(["mirror", "name", "informal", "formal"]).optional(),
    groupChatPosture: z.enum(["quiet", "helpful", "active"]).optional(),
    thirdPartyTone: z.enum(["neutral", "warm", "professional"]).optional(),
    conflictStyle: z.enum(["deescalate", "direct", "mediate"]).optional(),
    boundariesWithUser: z.enum(["service", "collaborator", "companion"]).optional(),
  }).strict(),
  domain: soulModuleBaseSchema.extend({
    primaryDomains: z.array(z.string().min(1)).optional(),
    secondaryDomains: z.array(z.string().min(1)).optional(),
    weakDomains: z.array(z.string().min(1)).optional(),
    learningPolicy: z.enum(["admit_limits", "research", "ask_expert"]).optional(),
    expertiseVoice: z.enum(["humble", "confident", "expert"]).optional(),
  }).strict(),
  operations: soulModuleBaseSchema.extend({
    executionStyle: z.enum(["minimal_change", "balanced", "comprehensive"]).optional(),
    debuggingStyle: z.enum(["diagnose_first", "fast_iteration", "hypothesis_driven"]).optional(),
    reportingStyle: z.enum(["brief", "structured", "detailed"]).optional(),
    qualityGate: z.enum(["none", "tests", "e2e"]).optional(),
    commitStyle: z.enum(["none", "conventional", "project_policy"]).optional(),
    rollbackPolicy: z.enum(["never_without_permission", "allowed_for_own_changes"]).optional(),
  }).strict(),
  vibe: soulModuleBaseSchema.extend({
    descriptors: z.array(z.string().min(1)).optional(),
    avoidDescriptors: z.array(z.string().min(1)).optional(),
    aesthetic: z.enum(["plain", "warm", "sharp", "playful", "calm"]).optional(),
    humanity: soulSliderValueSchema.optional(),
    edge: soulSliderValueSchema.optional(),
  }).strict(),
}).strict();

export const soulSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  presetId: z.string().min(1).optional(),
  modules: soulModulesSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const soulAssignmentSchema = z.object({
  agentId: z.string().min(1),
  soulId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const soulStateSchema = z.object({
  schemaVersion: z.literal(1),
  specs: z.array(soulSpecSchema),
  assignments: z.array(soulAssignmentSchema),
  updatedAt: z.string().min(1),
}).strict();

export const userFactStatusSchema = z.enum(["pending", "verified", "archived"]);
export const userFactSensitivitySchema = z.enum([
  "public",
  "personal",
  "sensitive",
  "medical",
  "financial",
  "legal",
  "location",
  "intimate",
  "child",
  "official_id",
  "account",
]);
export const userFactVisibilitySchema = z.enum(["agent", "public", "private"]);
export const userCompileProfileSchema = z.enum(["general", "work", "family", "travel", "wellbeing"]);
export const userDomainIdSchema = z.enum([
  "career.projects",
  "career.employment",
  "career.education",
  "career.skills",
  "family.household",
  "family.relationships",
  "travel.documents",
  "travel.places",
  "health.sleep",
  "health.routines",
  "health.conditions",
  "legal.documents",
  "finance.profile",
  "location.places",
  "accounts.public",
]);

export const userFactMetadataSchema = z.object({
  status: userFactStatusSchema.default("verified"),
  schemaVersion: z.number().int().positive().default(1),
  domain: userDomainIdSchema.optional(),
  supersedes: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  verifiedAt: z.string().min(1).optional(),
  sensitivity: userFactSensitivitySchema.default("personal"),
  confidence: z.number().min(0).max(1).optional(),
  validFrom: z.string().min(1).optional(),
  validTo: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  visibility: userFactVisibilitySchema.default("agent"),
}).strict();

export const userFacetKeySchema = z.enum([
  "identity", "biography", "residence", "languages", "publicContact", "work", "education",
  "projects", "skills", "interests", "tastes", "family", "relationships", "home", "routines",
  "health", "legal", "finances", "travel", "culture", "devices",
]);

export const userRecordTypeSchema = z.enum([
  "education", "employment", "project", "relationship", "residence", "life_event", "achievement",
  "certification", "skill", "language", "affiliation", "descriptive_preference", "health_condition",
  "routine", "pet", "administrative_document",
]);

export const userPackIdSchema = z.enum(["practical", "professional", "wellbeing"]);
export const userEntityTypeSchema = z.enum(["person", "organization", "place", "asset", "pet", "document", "account"]);

export const userFactValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.record(z.unknown()),
]);

export const userFactSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  value: userFactValueSchema,
  metadata: userFactMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userRecordSchema = z.object({
  id: z.string().min(1),
  type: userRecordTypeSchema,
  title: z.string().min(1),
  fields: z.record(userFactValueSchema).default({}),
  metadata: userFactMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userCustomFactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  value: userFactValueSchema,
  metadata: userFactMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userPackStateSchema = z.object({
  id: userPackIdSchema,
  schemaVersion: z.number().int().positive().default(1),
  enabled: z.boolean(),
  enabledAt: z.string().min(1).optional(),
  disabledAt: z.string().min(1).optional(),
  sensitivity: userFactSensitivitySchema.default("personal"),
  visibility: userFactVisibilitySchema.default("agent"),
}).strict();

export const userDomainStateSchema = z.object({
  id: userDomainIdSchema,
  schemaVersion: z.number().int().positive().default(1),
  enabled: z.boolean(),
  enabledAt: z.string().min(1).optional(),
  disabledAt: z.string().min(1).optional(),
  sensitivity: userFactSensitivitySchema.default("personal"),
  visibility: userFactVisibilitySchema.default("agent"),
}).strict();

export const userEntitySchema = z.object({
  id: z.string().min(1),
  type: userEntityTypeSchema,
  title: z.string().min(1),
  fields: z.record(userFactValueSchema).default({}),
  metadata: userFactMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userLinkSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  relation: z.string().min(1),
  to: z.string().min(1),
  metadata: userFactMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userTombstoneSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["fact", "record", "custom_fact", "proposal", "entity", "link", "merge_proposal"]),
  userId: z.string().min(1),
  deletedAt: z.string().min(1),
  reason: z.string().min(1).optional(),
}).strict();

export const userMergeProposalSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  decidedAt: z.string().min(1).optional(),
}).strict();

export const userProposalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["fact", "record", "custom_fact"]),
  userId: z.string().min(1),
  path: z.string().min(1).optional(),
  recordType: userRecordTypeSchema.optional(),
  title: z.string().min(1).optional(),
  value: userFactValueSchema.optional(),
  fields: z.record(userFactValueSchema).optional(),
  domain: userDomainIdSchema.optional(),
  source: z.string().min(1).optional(),
  sensitivity: userFactSensitivitySchema.default("personal"),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().min(1).optional(),
  visibility: userFactVisibilitySchema.default("agent"),
  status: z.enum(["pending", "verified", "rejected"]).default("pending"),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  verifiedAt: z.string().min(1).optional(),
}).strict();

export const userAssignmentSchema = z.object({
  agentId: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  displayName: z.string().min(1),
  isDefault: z.boolean().default(false),
  facets: z.record(userFacetKeySchema, z.array(userFactSchema)).default({}),
  packs: z.array(userPackStateSchema).default([]),
  domains: z.array(userDomainStateSchema).default([]),
  entities: z.array(userEntitySchema).default([]),
  links: z.array(userLinkSchema).default([]),
  records: z.array(userRecordSchema).default([]),
  customFacts: z.array(userCustomFactSchema).default([]),
  proposals: z.array(userProposalSchema).default([]),
  tombstones: z.array(userTombstoneSchema).default([]),
  mergeProposals: z.array(userMergeProposalSchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const userStateSchema = z.object({
  schemaVersion: z.literal(1),
  specs: z.array(userSpecSchema),
  assignments: z.array(userAssignmentSchema),
  updatedAt: z.string().min(1),
}).strict();

export const channelsStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  channels: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["chat", "email", "webhook", "voice", "social", "unknown"]),
    status: z.enum(["connected", "disconnected", "configured", "degraded", "unknown"]),
    endpoint: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    lastSyncAt: z.string().min(1).optional(),
    lastError: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })),
  accounts: z.array(z.object({
    id: z.string().min(1),
    provider: z.string().min(1),
    accountId: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    status: z.enum(["connected", "disconnected", "configured", "degraded", "unknown"]),
    secretRef: z.string().nullable().optional(),
    maskedCredential: z.string().nullable().optional(),
    profile: z.record(z.unknown()).nullable().optional(),
    transport: z.record(z.unknown()).nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  targets: z.array(z.object({
    id: z.string().min(1),
    provider: z.string().min(1),
    accountId: z.string().min(1),
    targetId: z.string().min(1),
    kind: z.enum(["dm", "group", "supergroup", "channel", "topic", "unknown"]),
    label: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    parentTargetId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
    lastSeenAt: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  messages: z.array(z.object({
    id: z.string().min(1),
    provider: z.string().min(1),
    accountId: z.string().min(1),
    targetId: z.string().min(1),
    direction: z.enum(["inbound", "outbound"]),
    status: z.enum(["received", "sent", "failed", "pending"]),
    text: z.string().optional(),
    providerMessageId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
    senderId: z.string().min(1).optional(),
    senderLabel: z.string().min(1).optional(),
    receivedAt: z.string().min(1).optional(),
    sentAt: z.string().min(1).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
    raw: z.record(z.unknown()).optional(),
  })).optional(),
  bindings: z.array(z.object({
    id: z.string().min(1),
    agentId: z.string().min(1),
    provider: z.string().min(1).optional(),
    accountId: z.string().min(1).optional(),
    targetId: z.string().min(1).optional(),
    permissions: z.array(z.enum(["read", "write", "ingest", "admin"])),
    priority: z.number().int(),
    enabled: z.boolean(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  processors: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    command: z.string().min(1),
    cwd: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    enabled: z.boolean(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  listeners: z.array(z.object({
    id: z.string().min(1),
    provider: z.string().min(1),
    accountId: z.string().min(1),
    processorId: z.string().min(1).optional(),
    mode: z.enum(["foreground", "background"]),
    status: z.enum(["running", "stopped", "stale", "error"]),
    pid: z.number().int().positive().optional(),
    pidPath: z.string().min(1).optional(),
    logPath: z.string().min(1).optional(),
    stopPath: z.string().min(1).optional(),
    startedAt: z.string().min(1).optional(),
    stoppedAt: z.string().min(1).optional(),
    lastHeartbeatAt: z.string().min(1).optional(),
    lastError: z.string().nullable().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  events: z.array(z.object({
    id: z.string().min(1),
    type: z.enum([
      "channel.message.received",
      "channel.message.sent",
      "channel.target.discovered",
      "channel.listener.started",
      "channel.listener.stopped",
      "channel.listener.error",
      "channel.processor.invoked",
    ]),
    provider: z.string().min(1),
    accountId: z.string().min(1),
    targetId: z.string().min(1).optional(),
    messageId: z.string().min(1).optional(),
    processorId: z.string().min(1).optional(),
    status: z.enum(["ok", "error", "ignored"]).optional(),
    createdAt: z.string().min(1),
    payload: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })).optional(),
  details: z.record(z.unknown()).optional(),
});

export const homeDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  isDefault: z.boolean(),
  createdAt: z.string().min(1),
});

export const areaDescriptorSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  label: z.string().min(1),
  aliases: z.array(z.string()).optional(),
});

export const connectorDescriptorSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["bridge", "protocol", "vendor"]),
  status: z.enum(["ready", "degraded", "offline"]),
  capabilities: z.array(z.string()),
});

export const capabilityDescriptorSchema = z.object({
  id: z.string().min(1),
  thingId: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  writable: z.boolean(),
  readable: z.boolean(),
  unit: z.string().min(1).optional(),
  observedValue: z.unknown().optional(),
  desiredValue: z.unknown().optional(),
  observedAt: z.string().min(1),
});

export const thingDescriptorSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  areaId: z.string().min(1).optional(),
  label: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  kind: z.enum(["light", "switch", "climate", "cover", "lock", "sensor", "camera", "media", "vacuum", "appliance", "presence", "energy"]),
  risk: z.enum(["safe", "caution", "restricted"]),
  connectorId: z.string().min(1),
  targetRef: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  capabilities: z.array(capabilityDescriptorSchema),
});

export const iotActionRequestSchema = z.object({
  homeId: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  area: z.string().min(1).optional(),
  family: z.enum(["light", "switch", "climate", "cover", "lock", "sensor", "camera", "media", "vacuum", "appliance", "presence", "energy", "scene", "automation"]).optional(),
  capability: z.string().min(1).optional(),
  action: z.enum(["on", "off", "toggle", "set", "open", "close", "lock", "unlock", "arm", "disarm", "start", "stop", "pause", "resume", "activate"]),
  value: z.unknown().optional(),
  targets: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const iotActionResultSchema = z.object({
  status: z.enum(["executed", "approval_required", "ambiguous", "denied"]),
  homeId: z.string().min(1),
  decision: z.enum(["allow", "approval_required", "deny", "ambiguous"]),
  reasons: z.array(z.string()),
  updatedAt: z.string().min(1),
  targets: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: thingDescriptorSchema.shape.kind,
    areaId: z.string().min(1).optional(),
  })),
  capabilityUpdates: z.array(z.object({
    thingId: z.string().min(1),
    capability: z.string().min(1),
    observedValue: z.unknown().optional(),
    desiredValue: z.unknown().optional(),
  })),
  approvalId: z.string().min(1).optional(),
  candidates: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: thingDescriptorSchema.shape.kind,
  })).optional(),
});

export const iotPolicyEvaluationSchema = z.object({
  decision: z.enum(["allow", "approval_required", "deny", "ambiguous"]),
  riskLevel: z.enum(["safe", "caution", "restricted"]),
  reasons: z.array(z.string()),
  candidates: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: thingDescriptorSchema.shape.kind,
  })).optional(),
  resolvedTargetIds: z.array(z.string().min(1)).optional(),
});

export const sceneRecordSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  actions: z.array(iotActionRequestSchema),
});

export const automationRecordSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
  trigger: z.record(z.unknown()),
  conditions: z.array(z.record(z.unknown())),
  actions: z.array(iotActionRequestSchema),
});

export const policyRecordSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  label: z.string().min(1),
  riskLevel: z.enum(["safe", "caution", "restricted"]).optional(),
  requiresApproval: z.boolean(),
  localOnly: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const approvalRecordSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  status: z.enum(["pending", "approved", "denied", "executed"]),
  reason: z.string().min(1),
  action: iotActionRequestSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const iotEventRecordSchema = z.object({
  id: z.string().min(1),
  homeId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  createdAt: z.string().min(1),
});

export const iotStateSnapshotSchema = z.object({
  home: homeDescriptorSchema,
  areas: z.array(areaDescriptorSchema),
  connectors: z.array(connectorDescriptorSchema),
  things: z.array(thingDescriptorSchema),
  updatedAt: z.string().min(1),
});

export const rawIotInvocationSchema = z.object({
  connector: z.string().min(1),
  homeId: z.string().min(1).optional(),
  target: z.string().min(1),
  action: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

export const telegramBotProfileSchema = z.object({
  id: z.string().min(1),
  isBot: z.boolean(),
  username: z.string().min(1).optional(),
  firstName: z.string().min(1),
  canJoinGroups: z.boolean().optional(),
  canReadAllGroupMessages: z.boolean().optional(),
  supportsInlineQueries: z.boolean().optional(),
});

export const telegramWebhookStatusSchema = z.object({
  url: z.string().min(1).optional(),
  hasCustomCertificate: z.boolean().optional(),
  pendingUpdateCount: z.number().int().nonnegative().optional(),
  ipAddress: z.string().min(1).optional(),
  lastErrorDate: z.number().int().nonnegative().optional(),
  lastErrorMessage: z.string().min(1).optional(),
  lastSynchronizationErrorDate: z.number().int().nonnegative().optional(),
  maxConnections: z.number().int().positive().optional(),
  allowedUpdates: z.array(z.string()).optional(),
  secretTokenConfigured: z.boolean().optional(),
});

export const telegramTransportStatusSchema = z.object({
  mode: z.enum(["webhook", "polling", "disabled"]),
  active: z.boolean(),
  webhook: telegramWebhookStatusSchema.nullable().optional(),
  lastSyncAt: z.string().min(1).optional(),
  lastUpdateId: z.number().int().nonnegative().optional(),
  pendingUpdateCount: z.number().int().nonnegative().optional(),
  pollerPid: z.number().int().positive().nullable().optional(),
});

export const telegramChatSummarySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["private", "group", "supergroup", "channel"]),
  title: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isForum: z.boolean().optional(),
  inviteLink: z.string().min(1).optional(),
  lastSeenAt: z.string().min(1).optional(),
});

export const telegramMemberSummarySchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["creator", "administrator", "member", "restricted", "left", "kicked"]),
  username: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isBot: z.boolean().optional(),
  canBeEdited: z.boolean().optional(),
  permissions: z.record(z.boolean()).optional(),
});

export const telegramUpdateEnvelopeSchema = z.object({
  updateId: z.number().int().nonnegative(),
  type: z.enum(["message", "edited_message", "callback_query", "my_chat_member", "chat_member", "unknown"]),
  chatId: z.string().min(1).optional(),
  messageId: z.number().int().nonnegative().optional(),
  chatType: z.string().min(1).optional(),
  receivedAt: z.string().min(1),
  raw: z.record(z.unknown()).optional(),
});

export const telegramCommandSchema = z.object({
  command: z.string().min(1),
  description: z.string().min(1),
});

export const telegramStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  connected: z.boolean(),
  apiBaseUrl: z.string().min(1).optional(),
  secretName: z.string().min(1).optional(),
  maskedCredential: z.string().nullable().optional(),
  botProfile: telegramBotProfileSchema.nullable().optional(),
  transport: telegramTransportStatusSchema,
  commands: z.array(telegramCommandSchema),
  recentErrors: z.array(z.string()),
  knownChats: z.array(telegramChatSummarySchema),
});

// ── Slack schemas ────────────────────────────────────────────────────

export const slackBotProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  teamName: z.string().min(1).optional(),
  botUserId: z.string().min(1).optional(),
  appId: z.string().min(1).optional(),
  icons: z.record(z.string()).optional(),
});

export const slackChannelSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["channel", "group", "im", "mpim"]),
  topic: z.string().optional(),
  purpose: z.string().optional(),
  memberCount: z.number().int().nonnegative().optional(),
  isArchived: z.boolean().optional(),
  isMember: z.boolean().optional(),
  lastMessageAt: z.string().min(1).optional(),
});

export const slackTransportStatusSchema = z.object({
  mode: z.enum(["socket", "events-api", "disabled"]),
  active: z.boolean(),
  eventsUrl: z.string().nullable().optional(),
  lastSyncAt: z.string().min(1).optional(),
  lastError: z.string().nullable().optional(),
});

export const slackStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  connected: z.boolean(),
  secretName: z.string().min(1).optional(),
  maskedCredential: z.string().nullable().optional(),
  botProfile: slackBotProfileSchema.nullable().optional(),
  transport: slackTransportStatusSchema,
  recentErrors: z.array(z.string()),
  knownChannels: z.array(slackChannelSummarySchema),
});

// ── WhatsApp schemas ─────────────────────────────────────────────────

export const whatsappBotProfileSchema = z.object({
  phoneNumber: z.string().min(1),
  displayName: z.string().min(1),
  platform: z.enum(["business-api", "wacli-bridge"]),
  verified: z.boolean().optional(),
});

export const whatsappTransportStatusSchema = z.object({
  mode: z.enum(["wacli", "business-api", "disabled"]),
  active: z.boolean(),
  authenticated: z.boolean().optional(),
  lastSyncAt: z.string().min(1).optional(),
  lastError: z.string().nullable().optional(),
  qrText: z.string().nullable().optional(),
});

export const whatsappStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  connected: z.boolean(),
  secretName: z.string().min(1).optional(),
  maskedCredential: z.string().nullable().optional(),
  botProfile: whatsappBotProfileSchema.nullable().optional(),
  transport: whatsappTransportStatusSchema,
  recentErrors: z.array(z.string()),
  canSendMessages: z.boolean(),
});

export * from "./schemas-report.ts";
export * from "./schemas-workspace.ts";
export const auditEventSchema = z.object({
  timestamp: z.string().min(1),
  event: z.string().min(1),
  capability: z.enum([
    "runtime",
    "workspace",
    "orchestration",
    "templates",
    "file_sync",
    "providers",
    "models",
    "auth",
    "sessions",
    "watchers",
    "compat",
    "doctor",
    "cli",
    "scheduler",
    "memory",
    "skills",
    "channels",
    "sandbox",
    "plugins",
    "areas",
    "lists",
    "sections",
    "tasks",
    "goals",
    "projects",
    "comments",
    "attachments",
    "saved_views",
    "recurrences",
    "cycles",
    "epics",
    "custom_fields",
    "field_values",
    "templates",
    "milestones",
    "activity",
    "reminders",
    "deadlines",
    "notes",
    "people",
    "inbox",
    "events",
    "workspace_search",
    "workspace_context",
    "workspace_ui",
  ]).optional(),
  detail: z.record(z.unknown()).optional(),
});

export const templateMutationSchema = z.object({
  targetFile: z.string().min(1),
  mode: z.enum([
    "seed_if_missing",
    "replace_full",
    "prepend",
    "append",
    "insert_before_anchor",
    "insert_after_anchor",
    "managed_block",
  ]),
  content: z.string().optional(),
  anchor: z.string().optional(),
  blockId: z.string().optional(),
  visibleToUser: z.boolean().optional(),
  required: z.boolean().optional(),
});

export const templatePackSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  mutations: z.array(templateMutationSchema),
});

export const bindingDefinitionSchema = z.object({
  id: z.string().min(1),
  targetFile: z.string().min(1),
  mode: z.enum([
    "managed_block",
    "insert_before_anchor",
    "insert_after_anchor",
    "append",
    "prepend",
  ]),
  blockId: z.string().optional(),
  anchor: z.string().optional(),
  required: z.boolean().optional(),
  visibleToUser: z.boolean().optional(),
  settingsPath: z.string().min(1),
});
