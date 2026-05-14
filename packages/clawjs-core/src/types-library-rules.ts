export type LibraryAssetKind = "skill" | "instruction" | "bundle";
export type LibraryInstructionProjectionTarget = "soul" | "identity" | "agents" | "tools" | "heartbeat" | "user";

export interface LibraryRequiredSecret {
  name: string;
  label?: string;
  allowedHosts?: string[];
  allowedHeaders?: string[];
  readOnly?: boolean;
  notes?: string;
}

export interface LibrarySkillSource {
  source?: string;
  installRef?: string;
  path?: string;
}

export interface SkillContextCapsule {
  capsule: string;
  priority: number;
  readWhen?: string[];
}

export interface LibraryInstructionProjection {
  target: LibraryInstructionProjectionTarget;
  blockId?: string;
}

export interface LibraryAsset {
  id: string;
  kind: LibraryAssetKind;
  title: string;
  description?: string;
  tags: string[];
  version: string;
  source?: LibrarySkillSource;
  context?: SkillContextCapsule;
  projection?: LibraryInstructionProjection;
  requiredSecrets: LibraryRequiredSecret[];
  autoApplyTags?: string[];
  bundleAssetIds?: string[];
  contentPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryAssignment {
  assetId: string;
  scope: "agent" | "workspace";
  targetId: string;
  mode: "include" | "exclude";
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryState {
  schemaVersion: number;
  assets: LibraryAsset[];
  assignments: LibraryAssignment[];
  updatedAt: string;
}

export interface LibraryResolvedAsset extends LibraryAsset {
  includedBy: Array<"explicit" | "tag" | "bundle">;
  assignmentOrder?: number;
}

export interface LibraryMissingSecret {
  assetId: string;
  name: string;
  label?: string;
}

export interface LibraryResolveResult {
  agentId?: string;
  workspaceId?: string;
  tags: string[];
  assets: LibraryResolvedAsset[];
  missingSecrets: LibraryMissingSecret[];
}

export interface SkillContextCapsuleEntry extends SkillContextCapsule {
  assetId: string;
  title: string;
  sourcePath?: string;
  assignmentOrder: number;
  includedBy: Array<"explicit" | "tag" | "bundle" | "default">;
}

export interface SkillContextResolveResult {
  capsules: SkillContextCapsuleEntry[];
  prompt: string;
  warnings: string[];
}

export type RuleScopeKind =
  | "user"
  | "organization"
  | "brand"
  | "client"
  | "project"
  | "domain"
  | "service"
  | "task"
  | "output";

export type RuleKind = "directive" | "default" | "resource";
export type RuleStatus = "pending" | "active" | "archived";
export type RuleReferenceKind = "asset" | "secret" | "connection" | "url" | "file" | "note";

export interface RuleScope {
  id: string;
  kind: RuleScopeKind | (string & {});
  name: string;
  parentId?: string;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleReference {
  kind: RuleReferenceKind | (string & {});
  ref: string;
  label?: string;
}

export interface RuleApplyWhen {
  keywords?: string[];
  taskTypes?: string[];
  outputFormats?: string[];
  domains?: string[];
  services?: string[];
  projects?: string[];
  agents?: string[];
  channels?: string[];
}

export interface RuleRecord {
  id: string;
  title: string;
  kind: RuleKind;
  status: RuleStatus;
  scopeId: string;
  content: string;
  applyWhen?: RuleApplyWhen;
  aliases: string[];
  priority: number;
  key?: string;
  references: RuleReference[];
  agentIds?: string[];
  channelIds?: string[];
  source?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  archivedAt?: string;
}

export interface RulesState {
  schemaVersion: 1;
  scopes: RuleScope[];
  rules: RuleRecord[];
  updatedAt: string;
}

export interface RuleInput {
  id?: string;
  title: string;
  kind?: RuleKind;
  status?: RuleStatus;
  scopeId: string;
  content: string;
  applyWhen?: RuleApplyWhen;
  aliases?: string[];
  priority?: number;
  key?: string;
  references?: RuleReference[];
  agentIds?: string[];
  channelIds?: string[];
  source?: string;
}

export interface RuleScopeInput {
  id?: string;
  kind: RuleScope["kind"];
  name: string;
  parentId?: string;
  aliases?: string[];
}

export interface RulesCompileInput {
  prompt: string;
  user?: string;
  organization?: string;
  brand?: string;
  client?: string;
  project?: string;
  domain?: string;
  service?: string;
  taskType?: string;
  outputFormat?: string;
  agent?: string;
  channel?: string;
  limit?: number;
}

export interface RulesCompileMatch {
  rule: RuleRecord;
  scopePath: RuleScope[];
  reasons: string[];
  specificity: number;
}

export interface RulesCompileResult {
  input: RulesCompileInput;
  block: {
    title: string;
    content: string;
    id?: string;
  } | null;
  prompt: string;
  matched: RulesCompileMatch[];
  included: RulesCompileMatch[];
  overridden: Array<RulesCompileMatch & { overriddenBy: string }>;
  omitted: Array<{ rule: RuleRecord; reason: string }>;
  warnings: string[];
}

export type LearningTarget = "user" | "agent" | "project" | "workflow" | "runtime" | "ui";
export type LearningKind = "preference" | "observation" | "correction" | "workflow" | "failure";
export type LearningStatus = "active" | "archived" | "promoted";
export type LearningEvidenceSentiment = "positive" | "negative" | "neutral";
export type LearningPromotionTarget = "rule" | "user" | "soul" | "skill" | "memory";

export interface LearningEvidence {
  id: string;
  sessionId: string;
  sentiment: LearningEvidenceSentiment;
  note: string;
  quote?: string;
  createdAt: string;
}

export interface LearningPromotion {
  target: LearningPromotionTarget;
  dryRun: boolean;
  applied: boolean;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt: string;
}

export interface LearningRecord {
  id: string;
  claim: string;
  target: LearningTarget;
  kind: LearningKind;
  status: LearningStatus;
  confidence: number;
  evidence: LearningEvidence[];
  promotions: LearningPromotion[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  promotedAt?: string;
  promotedTo?: LearningPromotionTarget;
  metadata?: Record<string, unknown>;
}

export interface LearningState {
  schemaVersion: 1;
  learnings: LearningRecord[];
  updatedAt: string;
}

export interface LearningAddInput {
  claim: string;
  target: LearningTarget;
  kind: LearningKind;
  evidenceSessionId: string;
  sentiment?: LearningEvidenceSentiment;
  note?: string;
  quote?: string;
  metadata?: Record<string, unknown>;
}

export interface LearningEvidenceInput {
  sessionId: string;
  sentiment: LearningEvidenceSentiment;
  note: string;
  quote?: string;
}

export interface LearningListInput {
  target?: LearningTarget;
  kind?: LearningKind;
  status?: LearningStatus;
}

export interface LearningPromotionPreview {
  learning: LearningRecord;
  target: LearningPromotionTarget;
  payload: Record<string, unknown>;
  writable: boolean;
  warnings: string[];
}

export interface LearningPromotionResult extends LearningPromotionPreview {
  applied: boolean;
  result?: Record<string, unknown>;
}

export type OutcomeResult = "worked" | "failed" | "mixed";
export type OutcomeStatus = "active" | "archived";

export interface OutcomeLinks {
  judgments: string[];
  sessions: string[];
  learnings: string[];
  tasks: string[];
  artifacts: string[];
}

export interface OutcomeRecord {
  id: string;
  subject: string;
  result: OutcomeResult;
  score: number;
  note: string;
  status: OutcomeStatus;
  links: OutcomeLinks;
  expectedConfidence?: number;
  confidenceGap?: number;
  agentId?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  metadata?: Record<string, unknown>;
}

export interface OutcomeState {
  schemaVersion: 1;
  outcomes: OutcomeRecord[];
  updatedAt: string;
}

export interface OutcomeAddInput {
  subject: string;
  result: OutcomeResult;
  score: number;
  note: string;
  judgment?: string;
  session?: string;
  learning?: string;
  task?: string;
  artifact?: string;
  agentId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface OutcomeCaptureInput {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface OutcomeCaptureResult {
  sessionId: string;
  outcomes: OutcomeRecord[];
  ignored: boolean;
  reason?: string;
}

export interface OutcomeListInput {
  result?: OutcomeResult;
  status?: OutcomeStatus;
  judgment?: string;
}

export interface OutcomeLinkInput {
  judgment?: string;
  session?: string;
  learning?: string;
  task?: string;
  artifact?: string;
}

export type ContextPackStatus = "active" | "archived";
export type ContextPackPurpose = "judgment" | "prompt" | "task" | "session" | "manual";
export type ContextPackSource = "rule" | "learning" | "user" | "soul" | "session" | "memory";
export type ContextPackSensitivity = "public" | "personal" | "sensitive" | "internal";

export interface ContextPackItem {
  id: string;
  source: ContextPackSource;
  sourceId: string;
  title: string;
  snippet: string;
  reason: string;
  score: number;
  confidence: number;
  sensitivity: ContextPackSensitivity;
  metadata?: Record<string, unknown>;
}

export interface ContextPackBudget {
  maxItems: number;
  maxChars: number;
  itemCount: number;
  charCount: number;
}

export interface ContextPackRecord {
  id: string;
  status: ContextPackStatus;
  purpose: ContextPackPurpose;
  query: string;
  domain?: string;
  sessionId?: string;
  summary: string;
  items: ContextPackItem[];
  sourceCounts: Partial<Record<ContextPackSource, number>>;
  budget: ContextPackBudget;
  agentId?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  archiveReason?: string;
  metadata?: Record<string, unknown>;
}

export interface ContextPackState {
  schemaVersion: 1;
  packs: ContextPackRecord[];
  updatedAt: string;
}

export interface ContextPackPrepareInput {
  query: string;
  purpose?: ContextPackPurpose;
  domain?: string;
  sessionId?: string;
  maxItems?: number;
  maxChars?: number;
  agentId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ContextPackListInput {
  purpose?: ContextPackPurpose;
  status?: ContextPackStatus;
}

export type CommitmentKind = "promise" | "follow_up" | "delivery";
export type CommitmentStatus = "active" | "fulfilled" | "missed" | "cancelled";
export type CommitmentSource = "manual" | "session_capture";
export type CommitmentPartyKind = "agent" | "user";

export interface CommitmentParty {
  kind: CommitmentPartyKind;
  id?: string;
}

export interface CommitmentEvidence {
  id: string;
  sessionId?: string;
  note: string;
  quote?: string;
  artifactId?: string;
  createdAt: string;
}

export interface CommitmentLinks {
  sessions: string[];
  judgments: string[];
  decisions: string[];
  learnings: string[];
  tasks: string[];
  reminders: string[];
  deadlines: string[];
  artifacts: string[];
}

export interface CommitmentRecord {
  id: string;
  claim: string;
  kind: CommitmentKind;
  status: CommitmentStatus;
  source: CommitmentSource;
  owner: CommitmentParty;
  beneficiary: CommitmentParty;
  evidence: CommitmentEvidence[];
  links: CommitmentLinks;
  remindAt?: string;
  dueAt?: string;
  outcome?: string;
  missReason?: string;
  cancelReason?: string;
  agentId?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  fulfilledAt?: string;
  missedAt?: string;
  cancelledAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CommitmentState {
  schemaVersion: 1;
  commitments: CommitmentRecord[];
  updatedAt: string;
}

export interface CommitmentAddInput {
  claim: string;
  kind: CommitmentKind;
  ownerAgentId?: string;
  ownerUserId?: string;
  beneficiaryUserId?: string;
  beneficiaryAgentId?: string;
  sessionId?: string;
  remindAt?: string;
  dueAt?: string;
  taskId?: string;
  agentId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface CommitmentCaptureInput {
  sessionId: string;
  ownerAgentId?: string;
  beneficiaryUserId?: string;
  agentId?: string;
  workspaceId?: string;
}

export interface CommitmentCaptureResult {
  sessionId: string;
  commitments: CommitmentRecord[];
  ignored: boolean;
  reason?: string;
}

export interface CommitmentListInput {
  status?: CommitmentStatus;
  kind?: CommitmentKind;
  ownerAgentId?: string;
}

export interface CommitmentOutcomeInput {
  outcome?: string;
  reason?: string;
  evidenceSessionId?: string;
  artifactId?: string;
}

export interface CommitmentLinkInput {
  session?: string;
  judgment?: string;
  decision?: string;
  learning?: string;
  task?: string;
  reminder?: string;
  deadline?: string;
  artifact?: string;
}

export type JudgmentStatus = "prepared" | "decided" | "superseded" | "archived";
export type JudgmentRecommendation = "act" | "ask_user" | "delegate" | "block";
export type JudgmentImpact = "low" | "medium" | "high" | "critical";

export interface JudgmentContextRefs {
  rules: string[];
  learnings: string[];
  user: string[];
  soul: string[];
  sessions: string[];
  decisions: string[];
  artifacts: string[];
  plans: string[];
  tasks: string[];
  commitments: string[];
}

export interface JudgmentOptionScore {
  option: string;
  score: number;
  evidence: string[];
}

export interface JudgmentRecord {
  id: string;
  question: string;
  domain: string;
  impact: JudgmentImpact;
  status: JudgmentStatus;
  options: string[];
  recommendation: JudgmentRecommendation;
  recommendedOption?: string;
  chosenOption?: string;
  confidence: number;
  rationale: string;
  outcome?: string;
  contextPackId?: string;
  context: JudgmentContextRefs;
  optionScores: JudgmentOptionScore[];
  agentId?: string;
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  archivedAt?: string;
  archiveReason?: string;
  metadata?: Record<string, unknown>;
}

export interface JudgmentState {
  schemaVersion: 1;
  judgments: JudgmentRecord[];
  updatedAt: string;
}

export interface JudgmentPrepareInput {
  question: string;
  domain: string;
  impact?: JudgmentImpact;
  options?: string[];
  sessionId?: string;
  contextPackId?: string;
  agentId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface JudgmentRecordInput {
  chosen: string;
  rationale: string;
  confidence?: number;
  outcome?: string;
}

export interface JudgmentListInput {
  status?: JudgmentStatus;
  domain?: string;
}

export interface JudgmentLinkInput {
  learning?: string;
  rule?: string;
  session?: string;
  decision?: string;
  artifact?: string;
  plan?: string;
  task?: string;
}
