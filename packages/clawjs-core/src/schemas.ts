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

export const intentDomainSchema = z.enum([
  "runtime",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "files",
  "sessions",
  "speech",
]);

export const observedDomainSchema = z.enum([
  "runtime",
  "workspace",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "memory",
  "scheduler",
  "sessions",
]);

export const featureOwnershipSchema = z.enum(["sdk-owned", "runtime-owned", "mirrored"]);
export const sessionPolicySchema = z.enum(["managed", "mirror", "native"]);

export const runtimeFeatureDescriptorSchema = z.object({
  featureId: z.string().min(1),
  ownership: featureOwnershipSchema,
  supported: z.boolean(),
  sessionPolicy: sessionPolicySchema.optional(),
  limitations: z.array(z.string()).optional(),
});

export const linkedEntityRefSchema = z.object({
  domain: z.enum(["area", "list", "section", "task", "goal", "project", "comment", "attachment", "saved_view", "recurrence", "cycle", "epic", "custom_field", "field_value", "template", "milestone", "activity_entry", "blocker", "artifact", "decision", "work_session", "assignment", "handoff", "approval", "capacity", "agent", "release", "incident", "feedback_item", "operational_check", "reminder", "deadline", "note", "person", "inbox_thread", "inbox_message", "event"]),
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
});

export const workspaceEntitySourceSchema = z.object({
  kind: z.enum(["local", "channel", "imported", "derived"]),
  channel: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});

const workspaceRecordBaseShape = {
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
  source: workspaceEntitySourceSchema,
  links: z.array(linkedEntityRefSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
} satisfies z.ZodRawShape;

export const taskChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  completed: z.boolean(),
});

export const areaRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "archived"]),
  color: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
});

export const taskRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
  type: z.enum(["todo", "task", "bug", "story", "feature", "chore"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  rank: z.number().optional(),
  labels: z.array(z.string()),
  areaId: z.string().min(1).optional(),
  listId: z.string().min(1).optional(),
  sectionId: z.string().min(1).optional(),
  assigneePersonId: z.string().min(1).optional(),
  reporterPersonId: z.string().min(1).optional(),
  watcherPersonIds: z.array(z.string()),
  startAt: z.string().min(1).optional(),
  deferUntil: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  deadlineAt: z.string().min(1).optional(),
  snoozedUntil: z.string().min(1).optional(),
  recurrenceRule: z.string().min(1).optional(),
  estimateMinutes: z.number().int().nonnegative().optional(),
  actualMinutes: z.number().int().nonnegative().optional(),
  storyPoints: z.number().nonnegative().optional(),
  blockedReason: z.string().min(1).optional(),
  waitingOn: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  cancelledAt: z.string().min(1).optional(),
  scheduledEventId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  cycleId: z.string().min(1).optional(),
  epicId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  childTaskIds: z.array(z.string()),
  dependsOnTaskIds: z.array(z.string()),
  commentIds: z.array(z.string()),
  attachmentIds: z.array(z.string()),
  createdBy: z.string().min(1).optional(),
  updatedBy: z.string().min(1).optional(),
  assignedToAgentId: z.string().min(1).optional(),
  assignedBy: z.string().min(1).optional(),
  delegatedBy: z.string().min(1).optional(),
  reviewerAgentId: z.string().min(1).optional(),
  blockedByIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  assignmentIds: z.array(z.string()),
  handoffIds: z.array(z.string()),
  approvalIds: z.array(z.string()),
  sourceItemId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  handoffTo: z.string().min(1).optional(),
  approvedBy: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  portfolioId: z.string().min(1).optional(),
  portfolioItemId: z.string().min(1).optional(),
  checklist: z.array(taskChecklistItemSchema),
});

export const goalRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "done"]),
  level: z.enum(["company", "team", "personal"]).optional(),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  parentGoalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  portfolioId: z.string().min(1).optional(),
  portfolioItemId: z.string().min(1).optional(),
  metricKey: z.string().min(1).optional(),
  metricLabel: z.string().min(1).optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  unit: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
  timeframeStart: z.string().min(1).optional(),
  timeframeEnd: z.string().min(1).optional(),
  reviewCadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  metricDirection: z.enum(["increase", "decrease", "maintain"]).optional(),
  healthStatus: z.enum(["green", "yellow", "red", "unknown"]).optional(),
});

export const projectRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["draft", "in_progress", "paused", "done", "archived"]),
  areaId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  leadAgentId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  portfolioId: z.string().min(1).optional(),
  portfolioItemId: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  kind: z.enum(["delivery", "growth", "ops", "research", "migration", "other"]).optional(),
  rank: z.number().optional(),
  statusCategory: z.enum(["active", "someday", "planned", "done", "archived"]).optional(),
  healthStatus: z.enum(["green", "yellow", "red", "unknown"]).optional(),
  startAt: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  targetDate: z.string().min(1).optional(),
  deadlineAt: z.string().min(1).optional(),
  milestoneIds: z.array(z.string()),
  defaultSectionIds: z.array(z.string()),
  templateId: z.string().min(1).optional(),
  reviewAt: z.string().min(1).optional(),
  reviewCadence: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  archiveReason: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
});

export const listRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  kind: z.enum(["inbox", "today", "upcoming", "anytime", "someday", "backlog", "project", "custom"]),
  status: z.enum(["active", "archived"]),
  description: z.string().optional(),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  rank: z.number().optional(),
  filter: z.record(z.unknown()).optional(),
});

export const sectionRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "archived"]),
  description: z.string().optional(),
  listId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
  rank: z.number().optional(),
});

const productivityCommentEntityTypeSchema = z.enum(["task", "project", "goal", "epic", "cycle", "note", "inbox_thread", "event"]);

export const commentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  entityType: productivityCommentEntityTypeSchema,
  entityId: z.string().min(1),
  body: z.string().min(1),
  authorPersonId: z.string().min(1).optional(),
  authorAgentId: z.string().min(1).optional(),
  visibility: z.enum(["internal", "shared"]).optional(),
});

export const attachmentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  entityType: productivityCommentEntityTypeSchema,
  entityId: z.string().min(1),
  name: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  preview: z.string().optional(),
  uploadedBy: z.string().min(1).optional(),
});

export const savedViewRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  domain: z.enum(["tasks", "projects", "goals", "inbox", "events", "workspace"]),
  query: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
  sort: z.record(z.unknown()).optional(),
  groupBy: z.string().min(1).optional(),
  favorite: z.boolean().optional(),
  rank: z.number().optional(),
});

export const recurrenceRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "paused", "ended"]),
  rule: z.string().min(1),
  timezone: z.string().min(1).optional(),
  anchorType: z.enum(["task", "project", "goal", "event", "standalone"]).optional(),
  anchorId: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  lastRunAt: z.string().min(1).optional(),
});

export const cycleRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  status: z.enum(["planned", "active", "completed", "archived"]),
  description: z.string().optional(),
  teamId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  capacityPoints: z.number().nonnegative().optional(),
  taskIds: z.array(z.string()),
});

export const epicRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["planned", "active", "done", "archived"]),
  kind: z.enum(["epic", "initiative"]),
  description: z.string().optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  rank: z.number().optional(),
  targetDate: z.string().min(1).optional(),
  healthStatus: z.enum(["green", "yellow", "red", "unknown"]).optional(),
  taskIds: z.array(z.string()),
});

export const customFieldRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  entityType: z.enum(["task", "project", "goal", "epic", "cycle", "person"]),
  fieldType: z.enum(["text", "number", "boolean", "date", "select", "multi_select", "person", "relation", "url", "json"]),
  description: z.string().optional(),
  options: z.array(z.unknown()).optional(),
  required: z.boolean().optional(),
  rank: z.number().optional(),
});

export const fieldValueRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  fieldId: z.string().min(1),
  entityType: z.enum(["task", "project", "goal", "epic", "cycle", "person"]),
  entityId: z.string().min(1),
  value: z.unknown().optional(),
});

export const productivityTemplateRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  entityType: z.enum(["task", "project", "goal", "epic", "cycle", "note"]),
  status: z.enum(["active", "archived"]),
  description: z.string().optional(),
  body: z.record(z.unknown()).optional(),
  rank: z.number().optional(),
});

export const milestoneRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["planned", "active", "done", "archived"]),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  targetDate: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
});

export const activityEntryRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  entityType: z.enum(["area", "list", "section", "task", "goal", "project", "comment", "attachment", "saved_view", "recurrence", "cycle", "epic", "custom_field", "field_value", "template", "milestone", "activity_entry", "blocker", "artifact", "decision", "work_session", "assignment", "handoff", "approval", "capacity", "agent", "release", "incident", "feedback_item", "operational_check", "reminder", "deadline", "note", "person", "inbox_thread", "inbox_message", "event"]),
  entityId: z.string().min(1),
  kind: z.enum(["created", "updated", "completed", "archived", "processed", "commented"]),
  title: z.string().min(1),
  content: z.string().optional(),
  areaId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  milestoneId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  actor: z.string().min(1).optional(),
});

export const blockerRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "resolved", "cancelled"]),
  kind: z.enum(["waiting_human", "waiting_agent", "waiting_system", "missing_context", "policy_block"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  dependencyTaskIds: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  resolvedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const artifactRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  kind: z.enum(["link", "file", "command", "test", "screenshot", "message", "note"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  decisionId: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const decisionRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  summary: z.string().optional(),
  status: z.enum(["proposed", "accepted", "rejected", "superseded"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerPersonId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  outcome: z.string().optional(),
  rationale: z.string().optional(),
  alternatives: z.array(z.string()),
  artifactIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export const workSessionRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "completed", "cancelled"]),
  objective: z.string().optional(),
  taskIds: z.array(z.string()),
  blockerIds: z.array(z.string()),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  outcome: z.string().optional(),
  timeboxMinutes: z.number().int().nonnegative().optional(),
  ownerAgentId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const assignmentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["proposed", "accepted", "rejected", "released", "completed"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  assignedToAgentId: z.string().min(1),
  assignedBy: z.string().min(1).optional(),
  delegatedBy: z.string().min(1).optional(),
  reviewerAgentId: z.string().min(1).optional(),
  rationale: z.string().optional(),
  rejectionReason: z.string().optional(),
  acceptedAt: z.string().min(1).optional(),
  rejectedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const handoffRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["proposed", "accepted", "rejected", "returned", "completed"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  objective: z.string().optional(),
  currentState: z.string().optional(),
  contextSummary: z.string().optional(),
  nextStep: z.string().optional(),
  riskSummary: z.string().optional(),
  artifactIds: z.array(z.string()),
  blockerIds: z.array(z.string()),
  approvalId: z.string().min(1).optional(),
  rejectionReason: z.string().optional(),
  acceptedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const productivityApprovalRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected", "cancelled"]),
  kind: z.enum(["deploy", "publish", "delete", "external_send", "spend", "policy_gate", "other"]),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  handoffId: z.string().min(1).optional(),
  requestedByAgentId: z.string().min(1).optional(),
  approverAgentId: z.string().min(1).optional(),
  policyReason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  decisionIds: z.array(z.string()),
  approvedBy: z.string().min(1).optional(),
  outcome: z.string().optional(),
  approvedAt: z.string().min(1).optional(),
  rejectedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const capacityRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["active", "limited", "overloaded", "offline"]),
  agentId: z.string().min(1),
  teamId: z.string().min(1).optional(),
  role: z.string().optional(),
  availability: z.enum(["available", "busy", "away", "offline"]),
  maxWip: z.number().int().nonnegative().optional(),
  currentWip: z.number().int().nonnegative(),
  queueDepth: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  responseLatencyMinutes: z.number().int().nonnegative().optional(),
  utilization: z.number().min(0).max(1).optional(),
  assignedTaskIds: z.array(z.string()),
  pendingApprovalIds: z.array(z.string()),
  pendingHandoffIds: z.array(z.string()),
  snapshotAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const agentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  name: z.string().min(1),
  status: z.enum(["active", "limited", "offline"]),
  role: z.string().min(1),
  teamId: z.string().min(1).optional(),
  domains: z.array(z.string()),
  shift: z.string().optional(),
  availability: z.enum(["available", "busy", "away", "offline"]),
  autonomyLevel: z.enum(["observe", "suggest", "act_limited", "act_full"]),
  permissions: z.array(z.string()),
  policyGate: z.enum(["none", "approval_required", "restricted"]),
  currentFocus: z.string().optional(),
  linkedTaskIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export const releaseRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["planned", "active", "at_risk", "released", "cancelled"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  targetDate: z.string().min(1).optional(),
  shippedAt: z.string().min(1).optional(),
  riskSummary: z.string().optional(),
  linkedTaskIds: z.array(z.string()),
  incidentIds: z.array(z.string()),
  approvalIds: z.array(z.string()),
  confidence: z.number().min(0).max(1).optional(),
});

export const incidentRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["open", "investigating", "mitigating", "resolved", "closed"]),
  severity: z.enum(["sev1", "sev2", "sev3", "sev4"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  releaseId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  summary: z.string().optional(),
  customerImpact: z.string().optional(),
  blockerIds: z.array(z.string()),
  feedbackIds: z.array(z.string()),
  startedAt: z.string().min(1).optional(),
  resolvedAt: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const feedbackRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["new", "triaged", "planned", "closed"]),
  origin: z.enum(["customer", "agent", "system", "sales", "support", "ops"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  summary: z.string().optional(),
  followUpTaskId: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const operationalCheckRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  status: z.enum(["pending", "passing", "failing", "snoozed"]),
  kind: z.enum(["release_readiness", "incident_followup", "sla", "quality", "compliance", "ops"]),
  projectId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  releaseId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  ownerAgentId: z.string().min(1).optional(),
  cadence: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
  lastRunAt: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  resultSummary: z.string().optional(),
  playbook: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const productivityAnchorTypeSchema = z.enum(["task", "project", "goal", "event", "thread", "standalone"]);

export const reminderRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "done", "cancelled"]),
  triggerAt: z.string().min(1),
  anchorType: productivityAnchorTypeSchema.optional(),
  anchorId: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
});

export const deadlineRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "done", "cancelled"]),
  dueAt: z.string().min(1),
  anchorType: productivityAnchorTypeSchema.optional(),
  anchorId: z.string().min(1).optional(),
});

export const noteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["paragraph", "heading", "bullet_list", "checklist", "quote", "code"]),
  text: z.string(),
});

export const noteRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  blocks: z.array(noteBlockSchema),
  tags: z.array(z.string()),
  summary: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string().min(1),
    mimeType: z.string().min(1),
    data: z.string().optional(),
    preview: z.string().optional(),
  })).optional(),
  linkedEntityIds: z.array(z.string()),
  searchText: z.string(),
});

export const personIdentitySchema = z.object({
  channel: z.string().min(1),
  handle: z.string().min(1),
  externalId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});

export const personRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  displayName: z.string().min(1),
  kind: z.enum(["human", "agent", "org"]),
  identities: z.array(personIdentitySchema),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  handles: z.array(z.string()),
  role: z.string().optional(),
  organization: z.string().optional(),
});

export const eventReminderSchema = z.object({
  id: z.string().min(1),
  minutesBeforeStart: z.number().int(),
  channel: z.string().min(1).optional(),
});

export const eventRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  location: z.string().optional(),
  attendeePersonIds: z.array(z.string()),
  linkedTaskIds: z.array(z.string()),
  linkedNoteIds: z.array(z.string()),
  reminders: z.array(eventReminderSchema),
});

export const temporalParticipantSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["human", "agent", "org", "external"]),
  label: z.string().min(1),
  personId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const temporalActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["notify", "agent_prompt", "workflow", "create_task", "calendar_sync"]),
  target: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const temporalOccurrenceOverrideSchema = z.object({
  originalStartAt: z.string().min(1),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  cancelled: z.boolean().optional(),
});

export const temporalScheduleSchema = z.object({
  mode: z.enum(["one_off", "cron", "rrule", "relative"]),
  timezone: z.string().min(1),
  startsAt: z.string().min(1).optional(),
  cron: z.string().min(1).optional(),
  rrule: z.string().min(1).optional(),
  relative: z.object({
    anchorType: z.enum(["thread", "task", "project", "goal", "event", "execution", "standalone"]),
    anchorId: z.string().min(1),
    anchorAt: z.string().min(1),
    offsetMs: z.number().int().nonnegative(),
    cancelOn: z.enum(["reply_received", "task_completed", "event_started", "execution_succeeded"]).optional(),
  }).optional(),
  overrides: z.array(temporalOccurrenceOverrideSchema).optional(),
  cancelledOccurrences: z.array(z.string()).optional(),
});

export const temporalProjectionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  target: z.enum(["workspace_events", "relay_routines", "google_calendar", "runtime_scheduler", "notify"]),
  status: z.enum(["pending", "active", "synced", "failed"]),
  provider: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
  detail: z.record(z.unknown()).optional(),
  updatedAt: z.string().min(1),
});

export const temporalExecutionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  status: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]),
  scheduledFor: z.string().min(1),
  startedAt: z.string().min(1).optional(),
  completedAt: z.string().min(1).optional(),
  triggeredBy: z.enum(["scheduler", "manual", "system"]),
  output: z.string().optional(),
  error: z.string().optional(),
});

export const temporalNaturalInputSchema = z.object({
  command: z.enum(["at", "every", "after"]),
  expression: z.string().min(1),
  timezone: z.string().min(1).optional(),
  anchorType: z.enum(["thread", "task", "project", "goal", "event", "execution", "standalone"]).optional(),
  anchorId: z.string().min(1).optional(),
  anchorAt: z.string().min(1).optional(),
});

export const temporalItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["event", "routine", "reminder", "deadline", "follow_up"]),
  status: z.enum(["active", "paused", "cancelled", "completed"]),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  startsAt: z.string().min(1).optional(),
  endsAt: z.string().min(1).optional(),
  dueAt: z.string().min(1).optional(),
  timezone: z.string().min(1),
  schedule: temporalScheduleSchema,
  participants: z.array(temporalParticipantSchema),
  actions: z.array(temporalActionSchema),
  projections: z.array(temporalProjectionSchema),
  ownerId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  sourceProvider: z.string().min(1).optional(),
  anchorType: z.enum(["thread", "task", "project", "goal", "event", "execution", "standalone"]).optional(),
  anchorId: z.string().min(1).optional(),
  nextRunAt: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workspaceSearchQuerySchema = z.object({
  query: z.string().min(1),
  domains: z.array(z.enum(["areas", "lists", "sections", "tasks", "goals", "projects", "comments", "attachments", "saved_views", "recurrences", "cycles", "epics", "custom_fields", "field_values", "templates", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"])).optional(),
  strategy: z.enum(["auto", "keyword", "semantic", "hybrid"]).optional(),
  limit: z.number().int().positive().optional(),
  includeArchived: z.boolean().optional(),
});

export const workspaceSearchResultSchema = z.object({
  domain: z.enum(["areas", "lists", "sections", "tasks", "goals", "projects", "comments", "attachments", "saved_views", "recurrences", "cycles", "epics", "custom_fields", "field_values", "templates", "milestones", "activity", "blockers", "artifacts", "decisions", "work_sessions", "assignments", "handoffs", "approvals", "capacity", "agents", "releases", "incidents", "feedback", "checks", "reminders", "deadlines", "notes", "people", "inbox", "events"]),
  id: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
  score: z.number(),
  strategy: z.enum(["keyword", "semantic", "hybrid"]),
  matchedFields: z.array(z.string()),
  links: z.array(linkedEntityRefSchema).optional(),
  updatedAt: z.string().min(1).optional(),
});

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
