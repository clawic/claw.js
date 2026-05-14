export type SoulModuleKey =
  | "identity"
  | "mission"
  | "values"
  | "temperament"
  | "communication"
  | "cognition"
  | "autonomy"
  | "memory"
  | "boundaries"
  | "tools"
  | "social"
  | "domain"
  | "operations"
  | "vibe";

export type SoulSliderValue = "very_low" | "low" | "medium" | "high" | "very_high";
export type SoulAskPolicy = "act" | "ask_when_uncertain" | "ask_before_external" | "ask_first";
export type SoulUncertaintyPolicy = "state_confidence" | "ask_clarifying" | "research_first" | "make_reasonable_assumption";
export type SoulRiskTolerance = "low" | "medium" | "high";
export type SoulFormality = "casual" | "neutral" | "formal";
export type SoulVerbosity = "minimal" | "concise" | "balanced" | "thorough";
export type SoulTruthStyle = "direct" | "diplomatic" | "socratic";
export type SoulPlanningStyle = "act_first" | "plan_first" | "ask_first";
export type SoulModuleMode = "disabled" | "normal" | "strong";

export interface SoulModuleBase {
  mode?: SoulModuleMode;
  principles?: string[];
}

export interface SoulIdentityModule extends SoulModuleBase {
  name?: string;
  role?: string;
  archetype?: string;
  selfConcept?: string;
  relationshipToUser?: string;
  continuityStyle?: "session_only" | "workspace_memory" | "long_running_identity";
  signatureBehaviors?: string[];
}

export interface SoulMissionModule extends SoulModuleBase {
  primaryPurpose?: string;
  successCriteria?: string[];
  priorities?: string[];
  antiGoals?: string[];
  defaultPosture?: "assist" | "lead" | "coach" | "execute" | "analyze";
  timeHorizon?: "immediate" | "daily" | "strategic";
}

export interface SoulValuesModule extends SoulModuleBase {
  honesty?: SoulSliderValue;
  privacy?: SoulSliderValue;
  usefulness?: SoulSliderValue;
  independence?: SoulSliderValue;
  rigor?: SoulSliderValue;
  care?: SoulSliderValue;
  values?: string[];
  hardLines?: string[];
}

export interface SoulTemperamentModule extends SoulModuleBase {
  warmth?: SoulSliderValue;
  energy?: SoulSliderValue;
  patience?: SoulSliderValue;
  humor?: SoulSliderValue;
  confidence?: SoulSliderValue;
  intensity?: SoulSliderValue;
  emotionalRange?: "reserved" | "natural" | "expressive";
}

export interface SoulCommunicationModule extends SoulModuleBase {
  directness?: SoulSliderValue;
  detail?: SoulSliderValue;
  formality?: SoulFormality;
  verbosity?: SoulVerbosity;
  disagreementStyle?: SoulTruthStyle;
  questionFrequency?: SoulSliderValue;
  structurePreference?: "prose" | "bullets" | "mixed";
  languagePolicy?: "mirror_user" | "workspace_default" | "english" | "spanish";
  forbiddenPhrases?: string[];
}

export interface SoulCognitionModule extends SoulModuleBase {
  rigor?: SoulSliderValue;
  creativity?: SoulSliderValue;
  skepticism?: SoulSliderValue;
  speedVsAccuracy?: "speed" | "balanced" | "accuracy";
  uncertaintyPolicy?: SoulUncertaintyPolicy;
  planningStyle?: SoulPlanningStyle;
  researchDepth?: SoulSliderValue;
  abstractionLevel?: "concrete" | "balanced" | "abstract";
}

export interface SoulAutonomyModule extends SoulModuleBase {
  askPolicy?: SoulAskPolicy;
  riskTolerance?: SoulRiskTolerance;
  initiative?: SoulSliderValue;
  externalActionPolicy?: "never" | "ask_first" | "allowed_when_authorized";
  spendingPolicy?: "never" | "ask_first";
  publicVoicePolicy?: "never_impersonate" | "draft_only" | "allowed_when_authorized";
  reversibleChanges?: "act" | "ask_when_uncertain" | "ask_first";
}

export interface SoulMemoryModule extends SoulModuleBase {
  persistence?: "none" | "workspace_files" | "structured_memory";
  updatePolicy?: "never" | "ask_first" | "stable_facts" | "proactive";
  rememberPreferences?: boolean;
  rememberPeople?: boolean;
  rememberProjects?: boolean;
  forgetPolicy?: "on_request" | "expiry" | "manual_review";
  sensitiveDataPolicy?: "avoid" | "minimize" | "allowed_if_needed";
}

export interface SoulBoundariesModule extends SoulModuleBase {
  privacyBoundary?: SoulSliderValue;
  medicalLegalFinancialBoundary?: "disclaim" | "refer_out" | "general_info_only";
  manipulationBoundary?: "refuse" | "redirect" | "ask_intent";
  secretsPolicy?: "never_reveal" | "reference_only";
  minorsPolicy?: "extra_care" | "standard";
  prohibitedActions?: string[];
}

export interface SoulToolsModule extends SoulModuleBase {
  toolEagerness?: SoulSliderValue;
  inspectBeforeAsking?: boolean;
  shellPolicy?: "avoid" | "allowed" | "preferred_for_local_truth";
  browserPolicy?: "when_current_needed" | "avoid" | "always_verify";
  fileEditPolicy?: "minimal" | "normal" | "proactive";
  validationPolicy?: "none" | "targeted" | "e2e_required";
  preferredTools?: string[];
}

export interface SoulSocialModule extends SoulModuleBase {
  userAddressStyle?: "mirror" | "name" | "informal" | "formal";
  groupChatPosture?: "quiet" | "helpful" | "active";
  thirdPartyTone?: "neutral" | "warm" | "professional";
  conflictStyle?: "deescalate" | "direct" | "mediate";
  boundariesWithUser?: "service" | "collaborator" | "companion";
}

export interface SoulDomainModule extends SoulModuleBase {
  primaryDomains?: string[];
  secondaryDomains?: string[];
  weakDomains?: string[];
  learningPolicy?: "admit_limits" | "research" | "ask_expert";
  expertiseVoice?: "humble" | "confident" | "expert";
}

export interface SoulOperationsModule extends SoulModuleBase {
  executionStyle?: "minimal_change" | "balanced" | "comprehensive";
  debuggingStyle?: "diagnose_first" | "fast_iteration" | "hypothesis_driven";
  reportingStyle?: "brief" | "structured" | "detailed";
  qualityGate?: "none" | "tests" | "e2e";
  commitStyle?: "none" | "conventional" | "project_policy";
  rollbackPolicy?: "never_without_permission" | "allowed_for_own_changes";
}

export interface SoulVibeModule extends SoulModuleBase {
  descriptors?: string[];
  avoidDescriptors?: string[];
  aesthetic?: "plain" | "warm" | "sharp" | "playful" | "calm";
  humanity?: SoulSliderValue;
  edge?: SoulSliderValue;
}

export interface SoulModules {
  identity: SoulIdentityModule;
  mission: SoulMissionModule;
  values: SoulValuesModule;
  temperament: SoulTemperamentModule;
  communication: SoulCommunicationModule;
  cognition: SoulCognitionModule;
  autonomy: SoulAutonomyModule;
  memory: SoulMemoryModule;
  boundaries: SoulBoundariesModule;
  tools: SoulToolsModule;
  social: SoulSocialModule;
  domain: SoulDomainModule;
  operations: SoulOperationsModule;
  vibe: SoulVibeModule;
}

export type SoulModule = SoulModules[SoulModuleKey];

export interface SoulSpec {
  schemaVersion: 1;
  id: string;
  title: string;
  description?: string;
  presetId?: string;
  modules: SoulModules;
  createdAt: string;
  updatedAt: string;
}

export interface SoulAssignment {
  agentId: string;
  soulId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SoulState {
  schemaVersion: 1;
  specs: SoulSpec[];
  assignments: SoulAssignment[];
  updatedAt: string;
}

export interface SoulValidationIssue {
  path: string;
  message: string;
}

export interface SoulValidationResult {
  ok: boolean;
  issues: SoulValidationIssue[];
}

export interface SoulCompileResult {
  soulId: string;
  agentId?: string;
  markdown: string;
  targetFile: "SOUL.md";
  blockId: string;
  changed: boolean;
}

export type UserFactStatus = "pending" | "verified" | "archived";
export type UserFactSensitivity =
  | "public"
  | "personal"
  | "sensitive"
  | "medical"
  | "financial"
  | "legal"
  | "location"
  | "intimate"
  | "child"
  | "official_id"
  | "account";
export type UserFactVisibility = "agent" | "public" | "private";
export type UserCompileProfile = "general" | "work" | "family" | "travel" | "wellbeing";
export type UserFacetKey =
  | "identity"
  | "biography"
  | "residence"
  | "languages"
  | "publicContact"
  | "work"
  | "education"
  | "projects"
  | "skills"
  | "interests"
  | "tastes"
  | "family"
  | "relationships"
  | "home"
  | "routines"
  | "health"
  | "legal"
  | "finances"
  | "travel"
  | "culture"
  | "devices";
export type UserRecordType =
  | "education"
  | "employment"
  | "project"
  | "relationship"
  | "residence"
  | "life_event"
  | "achievement"
  | "certification"
  | "skill"
  | "language"
  | "affiliation"
  | "descriptive_preference"
  | "health_condition"
  | "routine"
  | "pet"
  | "administrative_document";
export type UserPackId = "practical" | "professional" | "wellbeing";
export type UserDomainId =
  | "career.projects"
  | "career.employment"
  | "career.education"
  | "career.skills"
  | "family.household"
  | "family.relationships"
  | "travel.documents"
  | "travel.places"
  | "health.sleep"
  | "health.routines"
  | "health.conditions"
  | "legal.documents"
  | "finance.profile"
  | "location.places"
  | "accounts.public";
export type UserEntityType = "person" | "organization" | "place" | "asset" | "pet" | "document" | "account";
export type UserFactValue = string | number | boolean | null | Array<string | number | boolean | null> | Record<string, unknown>;

export interface UserFactMetadata {
  status: UserFactStatus;
  schemaVersion: number;
  domain?: UserDomainId;
  supersedes?: string;
  source?: string;
  verifiedAt?: string;
  sensitivity: UserFactSensitivity;
  confidence?: number;
  validFrom?: string;
  validTo?: string;
  notes?: string;
  visibility: UserFactVisibility;
}

export interface UserFact {
  id: string;
  key: string;
  value: UserFactValue;
  metadata: UserFactMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  type: UserRecordType;
  title: string;
  fields: Record<string, UserFactValue>;
  metadata: UserFactMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface UserCustomFact {
  id: string;
  title: string;
  value: UserFactValue;
  metadata: UserFactMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface UserPackState {
  id: UserPackId;
  schemaVersion: number;
  enabled: boolean;
  enabledAt?: string;
  disabledAt?: string;
  sensitivity: UserFactSensitivity;
  visibility: UserFactVisibility;
}

export interface UserDomainState {
  id: UserDomainId;
  schemaVersion: number;
  enabled: boolean;
  enabledAt?: string;
  disabledAt?: string;
  sensitivity: UserFactSensitivity;
  visibility: UserFactVisibility;
}

export interface UserEntity {
  id: string;
  type: UserEntityType;
  title: string;
  fields: Record<string, UserFactValue>;
  metadata: UserFactMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface UserLink {
  id: string;
  from: string;
  relation: string;
  to: string;
  metadata: UserFactMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface UserTombstone {
  id: string;
  kind: "fact" | "record" | "custom_fact" | "proposal" | "entity" | "link" | "merge_proposal";
  userId: string;
  deletedAt: string;
  reason?: string;
}

export interface UserMergeProposal {
  id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
}

export interface UserProposal {
  id: string;
  kind: "fact" | "record" | "custom_fact";
  userId: string;
  path?: string;
  recordType?: UserRecordType;
  title?: string;
  value?: UserFactValue;
  fields?: Record<string, UserFactValue>;
  domain?: UserDomainId;
  source?: string;
  sensitivity: UserFactSensitivity;
  confidence?: number;
  notes?: string;
  visibility: UserFactVisibility;
  status: "pending" | "verified" | "rejected";
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
}

export interface UserAssignment {
  agentId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSpec {
  schemaVersion: 1;
  id: string;
  displayName: string;
  isDefault: boolean;
  facets: Partial<Record<UserFacetKey, UserFact[]>>;
  packs: UserPackState[];
  domains: UserDomainState[];
  entities: UserEntity[];
  links: UserLink[];
  records: UserRecord[];
  customFacts: UserCustomFact[];
  proposals: UserProposal[];
  tombstones: UserTombstone[];
  mergeProposals: UserMergeProposal[];
  createdAt: string;
  updatedAt: string;
}

export interface UserState {
  schemaVersion: 1;
  specs: UserSpec[];
  assignments: UserAssignment[];
  updatedAt: string;
}

export interface UserValidationIssue {
  path: string;
  message: string;
}

export interface UserValidationResult {
  ok: boolean;
  issues: UserValidationIssue[];
}

export interface UserCompileResult {
  userId: string;
  agentId?: string;
  markdown: string;
  targetFile: "USER.md";
  blockId: string;
  changed: boolean;
}
