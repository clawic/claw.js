export type CapabilityName =
  | "runtime"
  | "workspace"
  | "orchestration"
  | "templates"
  | "file_sync"
  | "providers"
  | "models"
  | "auth"
  | "sessions"
  | "watchers"
  | "compat"
  | "doctor"
  | "cli"
  | "scheduler"
  | "memory"
  | "skills"
  | "channels"
  | "sandbox"
  | "plugins"
  | "areas"
  | "lists"
  | "sections"
  | "tasks"
  | "goals"
  | "projects"
  | "comments"
  | "attachments"
  | "saved_views"
  | "recurrences"
  | "cycles"
  | "epics"
  | "custom_fields"
  | "field_values"
  | "templates"
  | "milestones"
  | "activity"
  | "reminders"
  | "deadlines"
  | "notes"
  | "people"
  | "inbox"
  | "events"
  | "workspace_search"
  | "workspace_context"
  | "workspace_ui";

export type CapabilityStatus =
  | "unknown"
  | "unsupported"
  | "unavailable"
  | "detected"
  | "installing"
  | "installed"
  | "configuring"
  | "ready"
  | "degraded"
  | "repairable"
  | "error";

export type FileMutationMode =
  | "seed_if_missing"
  | "replace_full"
  | "prepend"
  | "append"
  | "insert_before_anchor"
  | "insert_after_anchor"
  | "managed_block";

export type KnownRuntimeAdapterId =
  | "demo"
  | "claw"
  | "openclaw"
  | "codex"
  | "zeroclaw"
  | "picoclaw"
  | "nanobot"
  | "nanoclaw"
  | "nullclaw"
  | "ironclaw"
  | "nemoclaw"
  | "hermes";
export type RuntimeAdapterId = KnownRuntimeAdapterId | (string & {});
export type RuntimeAdapterStability = "stable" | "experimental" | "demo";
export type RuntimeAdapterSupportLevel = "production" | "experimental" | "demo";
export type RuntimeFileSeedPolicy = "seed_if_missing" | "never";
export type RuntimeCapabilityKey =
  | "runtime"
  | "workspace"
  | "auth"
  | "models"
  | "session_cli"
  | "session_gateway"
  | "streaming"
  | "scheduler"
  | "memory"
  | "skills"
  | "channels"
  | "sandbox"
  | "plugins"
  | "doctor"
  | "compat";
export type RuntimeCapabilityStrategy = "native" | "cli" | "gateway" | "config" | "derived" | "hosted" | "bridge" | "unsupported";

export interface CapabilityState {
  name: CapabilityName;
  status: CapabilityStatus;
  checkedAt?: string;
  lastError?: string | null;
  progressPhase?: string | null;
  recommendedActions?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface RuntimeCapabilityDiagnostics {
  source?: "runtime" | "config" | "derived" | "fixture" | "workspace" | "gateway";
  probeMethod?: "cli" | "gateway" | "config" | "filesystem" | "derived" | "fixture" | "none";
  transport?: SessionTransport["kind"] | "none";
  sessionModel?: "ephemeral" | "workspace" | "runtime" | "agent";
  inventoryFreshness?: "live" | "cached" | "derived" | "static";
  [key: string]: unknown;
}

export interface RuntimeCapabilitySupport {
  supported: boolean;
  status: CapabilityStatus;
  strategy: RuntimeCapabilityStrategy;
  diagnostics?: RuntimeCapabilityDiagnostics;
  limitations?: string[];
}

export type RuntimeCapabilityMap = Record<RuntimeCapabilityKey, RuntimeCapabilitySupport> &
  Record<string, RuntimeCapabilitySupport>;

export interface RuntimeInfo {
  adapter: RuntimeAdapterId;
  runtimeName: string;
  version: string | null;
  capabilities: Record<string, boolean>;
  capabilityMap: RuntimeCapabilityMap;
  installed?: boolean;
}

export interface RuntimeFileDescriptor {
  key: string;
  path: string;
  required: boolean;
  visibleToUser: boolean;
  managedByRuntime?: boolean;
  seedPolicy?: RuntimeFileSeedPolicy;
}

export interface RuntimeLocations {
  homeDir?: string;
  configPath?: string;
  workspacePath?: string;
  authStorePath?: string;
  gatewayConfigPath?: string;
}

export interface RuntimeWorkspaceContract {
  files: RuntimeFileDescriptor[];
}

export interface ProjectResourceRef {
  id: string;
  label?: string;
  uri?: string;
  mode?: "allow" | "deny";
  metadata?: Record<string, unknown>;
}

export interface ProjectSecretRef {
  id: string;
  label?: string;
  secretName?: string;
  mode?: "allow" | "deny";
  metadata?: Record<string, unknown>;
}

export interface EffectiveAccessPolicy {
  resources: ProjectResourceRef[];
  secrets: ProjectSecretRef[];
}

export interface Project {
  projectId: string;
  displayName: string;
  description?: string;
  instructions?: string;
  resourceRefs?: ProjectResourceRef[];
  secretRefs?: ProjectSecretRef[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentAssignment {
  projectId: string;
  agentId: string;
  workspaceId: string;
  runtimeAgentId: string;
  displayName?: string;
  instructions?: string;
  effectiveAccessPolicy?: EffectiveAccessPolicy;
  createdAt: string;
  updatedAt: string;
}

export type NotificationDeliveryMode = "alert" | "silent" | "glance";
export type NotificationPriority = "passive" | "normal" | "time-sensitive" | "critical";
export type DeliveryState = "queued" | "delivered" | "read" | "acked" | "cancelled" | "expired" | "failed";

export interface NotificationContext {
  tenantId: string;
  projectId?: string;
  agentId?: string;
  workspaceId?: string;
  threadId?: string;
  automationId?: string;
  eventType?: string;
  severity?: string;
}

export interface NotificationAudience {
  userIds?: string[];
  installationIds?: string[];
  useSubscriptions?: boolean;
}

export interface NotificationDeepLink {
  targetClientAppId?: string;
  route?: string;
  params?: Record<string, string>;
  fallbackUrl?: string;
}

export interface NotificationReceiptPolicy {
  kind: "none" | "critical";
  retrySec?: number;
  expireSec?: number;
}

export interface QuietHoursPolicy {
  enabled: boolean;
  timeZone: string;
  startMinute: number;
  endMinute: number;
  allowCritical?: boolean;
}

export interface UserNotificationPreferences {
  tenantId: string;
  userId: string;
  criticalOnly: boolean;
  quietHours?: QuietHoursPolicy | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionFilter {
  sourceAppId?: string;
  clientAppId?: string;
  projectId?: string;
  agentId?: string;
  workspaceId?: string;
  eventType?: string;
  severity?: string;
  minPriority?: NotificationPriority;
  action?: "allow" | "mute";
}

export interface DeviceInstallation {
  id: string;
  tenantId: string;
  userId: string;
  clientAppId: string;
  platform: "ios" | "android";
  deviceName: string;
  pushToken: string | null;
  pushTokenUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

/**
 * A workspace is the isolated ClawJS context.
 * `agentId` identifies the agent operating inside that workspace and is not
 * conceptually the same field even when examples use the same string value.
 */
export interface WorkspaceConfig {
  appId: string;
  workspaceId: string;
  agentId: string;
  rootDir: string;
  projectId?: string;
  logicalAgentId?: string;
  runtimeAgentId?: string;
  materializationVersion?: number;
}

export interface ClawManifest {
  schemaVersion: number;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapter: string;
  rootDir: string;
  createdAt: string;
  updatedAt: string;
  templatePackPath?: string;
  projectId?: string;
  logicalAgentId?: string;
  runtimeAgentId?: string;
  materializationVersion?: number;
}

export interface CompatSnapshot {
  schemaVersion: number;
  runtimeAdapter: string;
  runtimeVersion: string | null;
  probedAt: string;
  capabilities: Record<string, boolean>;
  capabilityMap?: RuntimeCapabilityMap;
  diagnostics?: Record<string, unknown>;
}

export interface CapabilityReport {
  schemaVersion: number;
  generatedAt: string;
  runtimeAdapter: string;
  runtimeVersion: string | null;
  degraded: boolean;
  capabilities: Record<string, boolean>;
  capabilityMap?: RuntimeCapabilityMap;
  issues: string[];
  diagnostics?: Record<string, unknown>;
}

export interface WorkspaceStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  rootDir: string;
  manifestPresent: boolean;
  missingFiles: string[];
  missingDirectories: string[];
  projectId?: string;
  logicalAgentId?: string;
  runtimeAgentId?: string;
  materializationVersion?: number;
}

export interface ProviderStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  providers: Record<string, ProviderAuthSummary>;
  missingProvidersInUse?: string[];
}

export interface SchedulerStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  schedulers: SchedulerDescriptor[];
}

export interface MemoryStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  memory: MemoryDescriptor[];
}

export interface SkillsStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  skills: SkillDescriptor[];
}

export interface ChannelsStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  channels: ChannelDescriptor[];
  accounts?: ChannelAccountDescriptor[];
  targets?: ChannelTargetDescriptor[];
  messages?: ChannelMessageRecord[];
  bindings?: ChannelAgentBinding[];
  processors?: ChannelProcessorDescriptor[];
  listeners?: ChannelListenerDescriptor[];
  events?: ChannelEventRecord[];
  details?: Record<string, unknown>;
}

export interface TelegramStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  connected: boolean;
  apiBaseUrl?: string;
  secretName?: string;
  maskedCredential?: string | null;
  botProfile?: TelegramBotProfile | null;
  transport: TelegramTransportStatus;
  commands: TelegramCommand[];
  recentErrors: string[];
  knownChats: TelegramChatSummary[];
}

export type IntentDomain =
  | "runtime"
  | "models"
  | "providers"
  | "channels"
  | "skills"
  | "plugins"
  | "files"
  | "sessions"
  | "speech";

export type ObservedDomain =
  | "runtime"
  | "workspace"
  | "models"
  | "providers"
  | "channels"
  | "skills"
  | "plugins"
  | "memory"
  | "scheduler"
  | "sessions";

export type FeatureOwnership = "sdk-owned" | "runtime-owned" | "mirrored";
export type SessionPolicy = "managed" | "mirror" | "native";

export interface RuntimeIntentState {
  schemaVersion: number;
  updatedAt: string;
  adapter: RuntimeAdapterId;
  locations?: Partial<RuntimeLocations>;
}

export interface ModelsIntentState {
  schemaVersion: number;
  updatedAt: string;
  defaultModel: string | null;
  logicalDefaults?: Record<string, string>;
}

export interface ProviderIntentConfig {
  enabled?: boolean;
  preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
  secretRef?: string | null;
  profileId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProvidersIntentState {
  schemaVersion: number;
  updatedAt: string;
  providers: Record<string, ProviderIntentConfig>;
}

export interface ChannelIntentConfig {
  enabled?: boolean;
  kind?: ChannelDescriptor["kind"];
  provider?: string;
  secretRef?: string | null;
  mode?: string | null;
  config?: Record<string, unknown>;
}

export interface ChannelsIntentState {
  schemaVersion: number;
  updatedAt: string;
  channels: Record<string, ChannelIntentConfig>;
}

export interface DesiredSkillRecord {
  id: string;
  enabled: boolean;
  source?: string;
  installRef?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillsIntentState {
  schemaVersion: number;
  updatedAt: string;
  skills: DesiredSkillRecord[];
}

export interface PluginIntentConfig {
  enabled?: boolean;
  packageSpec?: string;
  config?: Record<string, unknown>;
}

export interface PluginsIntentState {
  schemaVersion: number;
  updatedAt: string;
  plugins: Record<string, PluginIntentConfig>;
  slots?: Record<string, string | null>;
}

export interface FilesIntentState {
  schemaVersion: number;
  updatedAt: string;
  values: Record<string, unknown>;
}

export interface SessionsIntentState {
  schemaVersion: number;
  updatedAt: string;
  policy?: SessionPolicy | null;
}

export interface SpeechIntentState {
  schemaVersion: number;
  updatedAt: string;
  tts?: Record<string, unknown>;
  stt?: Record<string, unknown>;
}

export interface RuntimeObservedState {
  schemaVersion: number;
  updatedAt: string;
  runtime: RuntimeInfo & {
    installed?: boolean;
    cliAvailable?: boolean;
    gatewayAvailable?: boolean;
    diagnostics?: Record<string, unknown>;
  };
}

export interface ModelsObservedState {
  schemaVersion: number;
  updatedAt: string;
  catalog: ModelCatalog;
  defaultModel: DefaultModelRef | null;
}

export interface PluginsObservedState {
  schemaVersion: number;
  updatedAt: string;
  plugins: Record<string, {
    installed: boolean;
    enabled: boolean;
    loaded?: boolean;
    status?: string | null;
    version?: string | null;
    error?: string | null;
  }>;
  slots?: Record<string, string | null>;
  diagnostics?: string[];
}

export interface SessionsObservedState {
  schemaVersion: number;
  updatedAt: string;
  policy: SessionPolicy;
  sessionCount: number;
  runtimePath?: string | null;
}

export interface RuntimeFeatureDescriptor {
  featureId: string;
  ownership: FeatureOwnership;
  supported: boolean;
  sessionPolicy?: SessionPolicy;
  limitations?: string[];
}

export interface AuditEvent {
  timestamp: string;
  event: string;
  capability?: CapabilityName;
  detail?: Record<string, unknown>;
}

export type WorkspaceDomain =
  | "areas"
  | "lists"
  | "sections"
  | "tasks"
  | "goals"
  | "projects"
  | "comments"
  | "attachments"
  | "saved_views"
  | "recurrences"
  | "cycles"
  | "epics"
  | "custom_fields"
  | "field_values"
  | "templates"
  | "milestones"
  | "activity"
  | "blockers"
  | "artifacts"
  | "decisions"
  | "work_sessions"
  | "assignments"
  | "handoffs"
  | "approvals"
  | "capacity"
  | "agents"
  | "releases"
  | "incidents"
  | "feedback"
  | "checks"
  | "reminders"
  | "deadlines"
  | "notes"
  | "people"
  | "inbox"
  | "events";

export type WorkspaceSearchStrategy =
  | "auto"
  | "keyword"
  | "semantic"
  | "hybrid";

export type LinkedEntityDomain =
  | "area"
  | "list"
  | "section"
  | "task"
  | "goal"
  | "project"
  | "comment"
  | "attachment"
  | "saved_view"
  | "recurrence"
  | "cycle"
  | "epic"
  | "custom_field"
  | "field_value"
  | "template"
  | "milestone"
  | "activity_entry"
  | "blocker"
  | "artifact"
  | "decision"
  | "work_session"
  | "assignment"
  | "handoff"
  | "approval"
  | "capacity"
  | "agent"
  | "release"
  | "incident"
  | "feedback_item"
  | "operational_check"
  | "reminder"
  | "deadline"
  | "note"
  | "person"
  | "inbox_thread"
  | "inbox_message"
  | "event";

export interface LinkedEntityRef {
  domain: LinkedEntityDomain;
  id: string;
  label?: string;
  relationship?: string;
}

export interface WorkspaceEntitySource {
  kind: "local" | "channel" | "imported" | "derived";
  channel?: string;
  externalId?: string;
}

export interface WorkspaceRecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  source: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface AreaRecord extends WorkspaceRecordBase {
  name: string;
  description?: string;
  status: "active" | "paused" | "archived";
  color?: string;
  ownerPersonId?: string;
}

export interface TaskRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  type?: "todo" | "task" | "bug" | "story" | "feature" | "chore";
  priority: "low" | "medium" | "high" | "urgent";
  rank?: number;
  labels: string[];
  areaId?: string;
  listId?: string;
  sectionId?: string;
  assigneePersonId?: string;
  reporterPersonId?: string;
  watcherPersonIds: string[];
  startAt?: string;
  deferUntil?: string;
  dueAt?: string;
  deadlineAt?: string;
  snoozedUntil?: string;
  recurrenceRule?: string;
  estimateMinutes?: number;
  actualMinutes?: number;
  storyPoints?: number;
  blockedReason?: string;
  waitingOn?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  scheduledEventId?: string;
  eventId?: string;
  projectId?: string;
  goalId?: string;
  cycleId?: string;
  epicId?: string;
  parentTaskId?: string;
  childTaskIds: string[];
  dependsOnTaskIds: string[];
  commentIds: string[];
  attachmentIds: string[];
  createdBy?: string;
  updatedBy?: string;
  assignedToAgentId?: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  blockedByIds: string[];
  evidenceIds: string[];
  decisionIds: string[];
  assignmentIds: string[];
  handoffIds: string[];
  approvalIds: string[];
  sourceItemId?: string;
  confidence?: number;
  handoffTo?: string;
  approvedBy?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  checklist: TaskChecklistItem[];
}

export interface GoalRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "paused" | "done";
  level?: "company" | "team" | "personal";
  areaId?: string;
  projectId?: string;
  parentId?: string;
  parentGoalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  metricKey?: string;
  metricLabel?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  period?: string;
  timeframeStart?: string;
  timeframeEnd?: string;
  reviewCadence?: "daily" | "weekly" | "monthly" | "quarterly";
  metricDirection?: "increase" | "decrease" | "maintain";
  healthStatus?: "green" | "yellow" | "red" | "unknown";
}

export interface ProjectRecord extends WorkspaceRecordBase {
  name: string;
  description?: string;
  status: "draft" | "in_progress" | "paused" | "done" | "archived";
  areaId?: string;
  goalId?: string;
  ownerPersonId?: string;
  leadAgentId?: string;
  companyId?: string;
  portfolioId?: string;
  portfolioItemId?: string;
  color?: string;
  kind?: "delivery" | "growth" | "ops" | "research" | "migration" | "other";
  rank?: number;
  statusCategory?: "active" | "someday" | "planned" | "done" | "archived";
  healthStatus?: "green" | "yellow" | "red" | "unknown";
  startAt?: string;
  startDate?: string;
  targetDate?: string;
  deadlineAt?: string;
  milestoneIds: string[];
  defaultSectionIds: string[];
  templateId?: string;
  reviewAt?: string;
  reviewCadence?: "daily" | "weekly" | "monthly" | "quarterly";
  archiveReason?: string;
  completedAt?: string;
}

export interface ListRecord extends WorkspaceRecordBase {
  title: string;
  kind: "inbox" | "today" | "upcoming" | "anytime" | "someday" | "backlog" | "project" | "custom";
  status: "active" | "archived";
  description?: string;
  areaId?: string;
  projectId?: string;
  rank?: number;
  filter?: Record<string, unknown>;
}

export interface SectionRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "archived";
  description?: string;
  listId?: string;
  projectId?: string;
  areaId?: string;
  rank?: number;
}

export type ProductivityCommentEntityType = "task" | "project" | "goal" | "epic" | "cycle" | "note" | "inbox_thread" | "event";

export interface CommentRecord extends WorkspaceRecordBase {
  entityType: ProductivityCommentEntityType;
  entityId: string;
  body: string;
  authorPersonId?: string;
  authorAgentId?: string;
  visibility?: "internal" | "shared";
}

export interface AttachmentRecord extends WorkspaceRecordBase {
  title: string;
  entityType: ProductivityCommentEntityType;
  entityId: string;
  name?: string;
  mimeType?: string;
  uri?: string;
  path?: string;
  sizeBytes?: number;
  preview?: string;
  uploadedBy?: string;
}

export interface SavedViewRecord extends WorkspaceRecordBase {
  name: string;
  domain: "tasks" | "projects" | "goals" | "inbox" | "events" | "workspace";
  query?: string;
  filters?: Record<string, unknown>;
  sort?: Record<string, unknown>;
  groupBy?: string;
  favorite?: boolean;
  rank?: number;
}

export interface RecurrenceRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "paused" | "ended";
  rule: string;
  timezone?: string;
  anchorType?: "task" | "project" | "goal" | "event" | "standalone";
  anchorId?: string;
  nextRunAt?: string;
  lastRunAt?: string;
}

export interface CycleRecord extends WorkspaceRecordBase {
  name: string;
  status: "planned" | "active" | "completed" | "archived";
  description?: string;
  teamId?: string;
  projectId?: string;
  goalId?: string;
  startsAt?: string;
  endsAt?: string;
  capacityPoints?: number;
  taskIds: string[];
}

export interface EpicRecord extends WorkspaceRecordBase {
  title: string;
  status: "planned" | "active" | "done" | "archived";
  kind: "epic" | "initiative";
  description?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  rank?: number;
  targetDate?: string;
  healthStatus?: "green" | "yellow" | "red" | "unknown";
  taskIds: string[];
}

export interface CustomFieldRecord extends WorkspaceRecordBase {
  name: string;
  entityType: "task" | "project" | "goal" | "epic" | "cycle" | "person";
  fieldType: "text" | "number" | "boolean" | "date" | "select" | "multi_select" | "person" | "relation" | "url" | "json";
  description?: string;
  options?: unknown[];
  required?: boolean;
  rank?: number;
}

export interface FieldValueRecord extends WorkspaceRecordBase {
  fieldId: string;
  entityType: "task" | "project" | "goal" | "epic" | "cycle" | "person";
  entityId: string;
  value?: unknown;
}

export interface TemplateRecord extends WorkspaceRecordBase {
  name: string;
  entityType: "task" | "project" | "goal" | "epic" | "cycle" | "note";
  status: "active" | "archived";
  description?: string;
  body?: Record<string, unknown>;
  rank?: number;
}

export interface MilestoneRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "planned" | "active" | "done" | "archived";
  areaId?: string;
  projectId?: string;
  goalId?: string;
  targetDate?: string;
  completedAt?: string;
}

export interface ActivityEntryRecord extends WorkspaceRecordBase {
  entityType: LinkedEntityDomain;
  entityId: string;
  kind: "created" | "updated" | "completed" | "archived" | "processed" | "commented";
  title: string;
  content?: string;
  areaId?: string;
  projectId?: string;
  goalId?: string;
  milestoneId?: string;
  taskId?: string;
  threadId?: string;
  actor?: string;
}

export interface BlockerRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "resolved" | "cancelled";
  kind: "waiting_human" | "waiting_agent" | "waiting_system" | "missing_context" | "policy_block";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  dependencyTaskIds: string[];
  evidenceIds: string[];
  resolvedAt?: string;
  confidence?: number;
}

export interface ArtifactRecord extends WorkspaceRecordBase {
  title: string;
  kind: "link" | "file" | "command" | "test" | "screenshot" | "message" | "note";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  threadId?: string;
  decisionId?: string;
  uri?: string;
  summary?: string;
  content?: string;
  confidence?: number;
}

export interface DecisionRecord extends WorkspaceRecordBase {
  title: string;
  summary?: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  ownerPersonId?: string;
  ownerAgentId?: string;
  outcome?: string;
  rationale?: string;
  alternatives: string[];
  artifactIds: string[];
  confidence?: number;
}

export interface WorkSessionRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "completed" | "cancelled";
  objective?: string;
  taskIds: string[];
  blockerIds: string[];
  startedAt: string;
  endedAt?: string;
  outcome?: string;
  timeboxMinutes?: number;
  ownerAgentId?: string;
  confidence?: number;
}

export interface AssignmentRecord extends WorkspaceRecordBase {
  title: string;
  status: "proposed" | "accepted" | "rejected" | "released" | "completed";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  assignedToAgentId: string;
  assignedBy?: string;
  delegatedBy?: string;
  reviewerAgentId?: string;
  rationale?: string;
  rejectionReason?: string;
  acceptedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
  dueAt?: string;
  priority?: TaskRecord["priority"];
  confidence?: number;
}

export interface HandoffRecord extends WorkspaceRecordBase {
  title: string;
  status: "proposed" | "accepted" | "rejected" | "returned" | "completed";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  fromAgentId: string;
  toAgentId: string;
  objective?: string;
  currentState?: string;
  contextSummary?: string;
  nextStep?: string;
  riskSummary?: string;
  artifactIds: string[];
  blockerIds: string[];
  approvalId?: string;
  rejectionReason?: string;
  acceptedAt?: string;
  completedAt?: string;
  confidence?: number;
}

export interface ProductivityApprovalRecord extends WorkspaceRecordBase {
  title: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  kind: "deploy" | "publish" | "delete" | "external_send" | "spend" | "policy_gate" | "other";
  taskId?: string;
  projectId?: string;
  goalId?: string;
  handoffId?: string;
  requestedByAgentId?: string;
  approverAgentId?: string;
  policyReason: string;
  evidenceIds: string[];
  decisionIds: string[];
  approvedBy?: string;
  outcome?: string;
  approvedAt?: string;
  rejectedAt?: string;
  confidence?: number;
}

export interface CapacityRecord extends WorkspaceRecordBase {
  title: string;
  status: "active" | "limited" | "overloaded" | "offline";
  agentId: string;
  teamId?: string;
  role?: string;
  availability: "available" | "busy" | "away" | "offline";
  maxWip?: number;
  currentWip: number;
  queueDepth: number;
  blockedCount: number;
  overdueCount: number;
  responseLatencyMinutes?: number;
  utilization?: number;
  assignedTaskIds: string[];
  pendingApprovalIds: string[];
  pendingHandoffIds: string[];
  snapshotAt?: string;
  confidence?: number;
}

export interface AgentRecord extends WorkspaceRecordBase {
  name: string;
  status: "active" | "limited" | "offline";
  role: string;
  teamId?: string;
  domains: string[];
  shift?: string;
  availability: "available" | "busy" | "away" | "offline";
  autonomyLevel: "observe" | "suggest" | "act_limited" | "act_full";
  permissions: string[];
  policyGate: "none" | "approval_required" | "restricted";
  currentFocus?: string;
  linkedTaskIds: string[];
  confidence?: number;
}

export interface ReleaseRecord extends WorkspaceRecordBase {
  title: string;
  status: "planned" | "active" | "at_risk" | "released" | "cancelled";
  projectId?: string;
  goalId?: string;
  ownerAgentId?: string;
  targetDate?: string;
  shippedAt?: string;
  riskSummary?: string;
  linkedTaskIds: string[];
  incidentIds: string[];
  approvalIds: string[];
  confidence?: number;
}

export interface IncidentRecord extends WorkspaceRecordBase {
  title: string;
  status: "open" | "investigating" | "mitigating" | "resolved" | "closed";
  severity: "sev1" | "sev2" | "sev3" | "sev4";
  projectId?: string;
  goalId?: string;
  taskId?: string;
  releaseId?: string;
  ownerAgentId?: string;
  summary?: string;
  customerImpact?: string;
  blockerIds: string[];
  feedbackIds: string[];
  startedAt?: string;
  resolvedAt?: string;
  confidence?: number;
}

export interface FeedbackRecord extends WorkspaceRecordBase {
  title: string;
  status: "new" | "triaged" | "planned" | "closed";
  origin: "customer" | "agent" | "system" | "sales" | "support" | "ops";
  priority: "low" | "medium" | "high" | "urgent";
  projectId?: string;
  goalId?: string;
  taskId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  summary?: string;
  followUpTaskId?: string;
  confidence?: number;
}

export interface OperationalCheckRecord extends WorkspaceRecordBase {
  title: string;
  status: "pending" | "passing" | "failing" | "snoozed";
  kind: "release_readiness" | "incident_followup" | "sla" | "quality" | "compliance" | "ops";
  projectId?: string;
  goalId?: string;
  releaseId?: string;
  incidentId?: string;
  ownerAgentId?: string;
  cadence?: "hourly" | "daily" | "weekly" | "monthly";
  lastRunAt?: string;
  nextRunAt?: string;
  resultSummary?: string;
  playbook?: string;
  confidence?: number;
}

export type ProductivityAnchorType =
  | "task"
  | "project"
  | "goal"
  | "event"
  | "thread"
  | "standalone";

export interface ReminderRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "paused" | "done" | "cancelled";
  triggerAt: string;
  anchorType?: ProductivityAnchorType;
  anchorId?: string;
  channel?: string;
}

export interface DeadlineRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "active" | "paused" | "done" | "cancelled";
  dueAt: string;
  anchorType?: ProductivityAnchorType;
  anchorId?: string;
}

export interface NoteBlock {
  id: string;
  type: "paragraph" | "heading" | "bullet_list" | "checklist" | "quote" | "code";
  text: string;
}

export interface NoteRecord extends WorkspaceRecordBase {
  title: string;
  blocks: NoteBlock[];
  tags: string[];
  summary?: string;
  attachments?: Attachment[];
  linkedEntityIds: string[];
  searchText: string;
}

export interface PersonIdentity {
  channel: string;
  handle: string;
  externalId?: string;
  label?: string;
}

export interface PersonRecord extends WorkspaceRecordBase {
  displayName: string;
  kind: "human" | "agent" | "org";
  identities: PersonIdentity[];
  emails: string[];
  phones: string[];
  handles: string[];
  role?: string;
  organization?: string;
}

export interface InboxReplyTarget {
  channel: string;
  threadId?: string;
  messageId?: string;
  address?: string;
}

export interface InboxThreadRecord extends WorkspaceRecordBase {
  channel: string;
  subject?: string;
  externalThreadId?: string;
  participantPersonIds: string[];
  status: "unread" | "read" | "archived";
  replyTarget?: InboxReplyTarget;
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  latestMessageAt?: string;
  preview?: string;
}

export interface InboxMessageRecord extends WorkspaceRecordBase {
  threadId: string;
  channel: string;
  externalThreadId?: string;
  externalMessageId?: string;
  participantPersonIds: string[];
  direction: "inbound" | "outbound" | "system";
  status: "unread" | "read" | "archived" | "draft" | "sent" | "failed";
  replyTarget?: InboxReplyTarget;
  attachments?: Attachment[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  content: string;
}

export interface EventReminder {
  id: string;
  minutesBeforeStart: number;
  channel?: string;
}

export interface EventRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: EventReminder[];
}

export interface TemporalParticipant {
  id: string;
  kind: "human" | "agent" | "org" | "external";
  label: string;
  personId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface TemporalAction {
  id: string;
  kind: "notify" | "agent_prompt" | "workflow" | "create_task" | "calendar_sync";
  target?: string;
  payload?: Record<string, unknown>;
}

export interface TemporalOccurrenceOverride {
  originalStartAt: string;
  startsAt?: string;
  endsAt?: string;
  cancelled?: boolean;
}

export interface TemporalSchedule {
  mode: "one_off" | "cron" | "rrule" | "relative";
  timezone: string;
  startsAt?: string;
  cron?: string;
  rrule?: string;
  staggerMs?: number;
  relative?: {
    anchorType: "thread" | "task" | "project" | "goal" | "event" | "execution" | "standalone";
    anchorId: string;
    anchorAt: string;
    offsetMs: number;
    cancelOn?: "reply_received" | "task_completed" | "event_started" | "execution_succeeded";
  };
  overrides?: TemporalOccurrenceOverride[];
  cancelledOccurrences?: string[];
}

export interface TemporalProjection {
  id: string;
  itemId: string;
  target: "workspace_events" | "relay_routines" | "google_calendar" | "runtime_scheduler" | "notify";
  status: "pending" | "active" | "synced" | "failed";
  provider?: string;
  externalId?: string;
  detail?: Record<string, unknown>;
  updatedAt: string;
}

export interface TemporalExecution {
  id: string;
  itemId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  scheduledFor: string;
  startedAt?: string;
  completedAt?: string;
  triggeredBy: "scheduler" | "manual" | "system";
  output?: string;
  error?: string;
}

export interface TemporalRunLogEntry {
  id: string;
  itemId: string;
  status: "succeeded" | "failed" | "cancelled" | "noop";
  scheduledFor: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  triggeredBy: "scheduler" | "manual" | "system";
  summary?: string;
  error?: string;
  agentResult?: TemporalHeartbeatAgentResult;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface TemporalHeartbeatMatch {
  source: string;
  id: string;
  title?: string;
  updatedAt?: string;
  payload?: Record<string, unknown>;
}

export interface TemporalHeartbeatAgentResult {
  status: "done" | "continue" | "disable" | "error" | "noop";
  summary?: string;
  error?: string;
  usage?: TemporalRunLogEntry["usage"];
}

export interface TemporalHeartbeatState {
  lastEvaluatedAt?: string;
  lastWakeAt?: string;
  lastSkipAt?: string;
  skipCount: number;
  lastSkipReason?: string;
  lastNoopAt?: string;
  lastCompletedAt?: string;
  lastMatches?: TemporalHeartbeatMatch[];
  lastResult?: TemporalHeartbeatAgentResult & { at: string };
  wakeTimestamps?: string[];
}

export interface TemporalHeartbeatPolicy {
  when: string[];
  stopWhen?: string[];
  context: "diff";
  limit: number;
  target?: "main" | "isolated";
  deliver?: boolean | { target?: string; mode?: "summary" | "none" };
  activeHours?: {
    start: string;
    end: string;
    timezone?: string;
  };
  cooldownMs?: number;
  maxWakesPerWindow?: {
    count: number;
    windowMs: number;
  };
  staggerMs?: number;
  prompt?: string;
  gate?: {
    path?: string;
    policy?: Record<string, unknown>;
  };
  allowedCustomChecks?: string[];
  state?: TemporalHeartbeatState;
}

export interface TemporalRuntimeState {
  runningExecutionId?: string;
  runningAt?: string;
  consecutiveErrors?: number;
  lastErrorAt?: string;
  lastError?: string;
  nextRetryAt?: string;
  lastDurationMs?: number;
}

export interface TemporalNaturalInput {
  command: "at" | "every" | "after";
  expression: string;
  timezone?: string;
  anchorType?: "thread" | "task" | "project" | "goal" | "event" | "execution" | "standalone";
  anchorId?: string;
  anchorAt?: string;
}

export interface TemporalItem {
  id: string;
  kind: "event" | "routine" | "reminder" | "deadline" | "follow_up";
  status: "active" | "paused" | "cancelled" | "completed";
  title: string;
  description?: string;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  dueAt?: string;
  timezone: string;
  schedule: TemporalSchedule;
  participants: TemporalParticipant[];
  actions: TemporalAction[];
  projections: TemporalProjection[];
  heartbeat?: TemporalHeartbeatPolicy;
  runtime?: TemporalRuntimeState;
  ownerId?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sourceProvider?: string;
  anchorType?: "thread" | "task" | "project" | "goal" | "event" | "execution" | "standalone";
  anchorId?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSearchQuery {
  query: string;
  domains?: WorkspaceDomain[];
  strategy?: WorkspaceSearchStrategy;
  limit?: number;
  includeArchived?: boolean;
}

export interface WorkspaceSearchResult {
  domain: WorkspaceDomain;
  id: string;
  title: string;
  snippet: string;
  score: number;
  strategy: Exclude<WorkspaceSearchStrategy, "auto">;
  matchedFields: string[];
  links?: LinkedEntityRef[];
  updatedAt?: string;
}

export interface ProductivityAgendaItem {
  domain: "tasks" | "milestones" | "reminders" | "deadlines" | "events" | "activity";
  id: string;
  title: string;
  when: string;
  status: string;
  overdue: boolean;
  areaId?: string;
  projectId?: string;
  goalId?: string;
  milestoneId?: string;
  taskId?: string;
}

export interface ProductivityAgenda {
  start: string;
  end: string;
  generatedAt: string;
  items: ProductivityAgendaItem[];
  summary: {
    overdue: number;
    dueToday: number;
    upcoming: number;
  };
}

export interface ProductivityReview {
  cadence: "daily" | "weekly";
  generatedAt: string;
  summary: {
    blockedTasks: number;
    overdueTasks: number;
    activeGoals: number;
    activeProjects: number;
    pendingMilestones: number;
    unreadThreads: number;
    dueDeadlines: number;
    pendingReminders: number;
    upcomingEvents: number;
    activeBlockers: number;
    pendingDecisions: number;
    activeWorkSessions: number;
  };
  blockedTasks: TaskRecord[];
  overdueTasks: TaskRecord[];
  activeGoals: GoalRecord[];
  activeProjects: ProjectRecord[];
  pendingMilestones: MilestoneRecord[];
  unreadThreads: InboxThreadRecord[];
  dueDeadlines: DeadlineRecord[];
  pendingReminders: ReminderRecord[];
  upcomingEvents: EventRecord[];
  activeBlockers: BlockerRecord[];
  pendingDecisions: DecisionRecord[];
  activeWorkSessions: WorkSessionRecord[];
}

export interface ProductivityMyWork {
  generatedAt: string;
  summary: {
    triageThreads: number;
    readyTasks: number;
    blockedTasks: number;
    activeBlockers: number;
    pendingDecisions: number;
    activeWorkSessions: number;
    recentArtifacts: number;
  };
  triageThreads: InboxThreadRecord[];
  readyTasks: TaskRecord[];
  blockedTasks: TaskRecord[];
  activeBlockers: BlockerRecord[];
  pendingDecisions: DecisionRecord[];
  activeWorkSession: WorkSessionRecord | null;
  recentArtifacts: ArtifactRecord[];
}

export interface ProductivityTeamWork {
  generatedAt: string;
  summary: {
    activeAssignments: number;
    pendingHandoffs: number;
    pendingApprovals: number;
    overloadedAgents: number;
    agentsAtRisk: number;
  };
  activeAssignments: AssignmentRecord[];
  pendingHandoffs: HandoffRecord[];
  pendingApprovals: ProductivityApprovalRecord[];
  capacity: CapacityRecord[];
}

export interface ProductivityOperationsAgent {
  agent: AgentRecord;
  capacity: CapacityRecord | null;
  openIncidentIds: string[];
  pendingApprovalIds: string[];
  activeReleaseIds: string[];
}

export interface ProductivityOperationsCockpit {
  generatedAt: string;
  summary: {
    activeGoals: number;
    activeProjects: number;
    activeReleases: number;
    atRiskReleases: number;
    openIncidents: number;
    criticalIncidents: number;
    failingChecks: number;
    newFeedback: number;
    activeAgents: number;
    approvalGatedAgents: number;
  };
  portfolio: {
    activeGoals: GoalRecord[];
    activeProjects: ProjectRecord[];
    atRiskProjects: ProjectRecord[];
  };
  releases: ReleaseRecord[];
  incidents: IncidentRecord[];
  feedback: FeedbackRecord[];
  checks: OperationalCheckRecord[];
  agents: ProductivityOperationsAgent[];
}

export interface WorkspaceSurfaceDescriptor {
  id: WorkspaceDomain;
  title: string;
  route: string;
  icon?: string;
  badgeId?: string;
  order: number;
}

export interface WorkspaceBadgeSummary {
  id: string;
  value: number;
  label: string;
}

export interface WorkspaceContextRequest {
  query?: string;
  domains?: WorkspaceDomain[];
  strategy?: Exclude<WorkspaceSearchStrategy, "semantic"> | "semantic";
  limit?: number;
  includeDoneTasks?: boolean;
  sessionId?: string;
  threadId?: string;
}

export interface WorkspaceContextBundle {
  request: WorkspaceContextRequest;
  generatedAt: string;
  blocks: PromptContextBlock[];
  results: WorkspaceSearchResult[];
}

export interface WorkspaceToolDescriptor {
  id: string;
  title: string;
  description: string;
  domain: WorkspaceDomain | "workspace";
}

export interface ProviderAuthSummary {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
  maskedCredential?: string | null;
  source?: "vault" | "env" | "missing" | "disabled" | "runtime" | "config" | "store";
}

export interface AuthProfileSummary {
  profileId: string;
  provider: string;
  authType: "oauth" | "token" | "api_key" | "env";
  credentialSource: "runtime" | "config" | "store" | "env";
  maskedCredential?: string | null;
}

export interface CredentialSource {
  kind: "runtime" | "config" | "store" | "env";
  key?: string;
  location?: string;
}

export interface ProviderAlias {
  alias: string;
  canonicalProvider: string;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  local?: boolean;
  aliases?: ProviderAlias[];
  envVars?: string[];
  auth?: {
    supportsOAuth?: boolean;
    supportsToken?: boolean;
    supportsApiKey?: boolean;
    supportsEnv?: boolean;
  };
  credentialSources?: CredentialSource[];
}

export interface ProviderCatalog {
  providers: ProviderDescriptor[];
}

export interface ModelSummary {
  id: string;
  modelId?: string;
  provider: string;
  label: string;
  available?: boolean;
  isDefault?: boolean;
}

export interface ModelDescriptor extends ModelSummary {
  ref?: DefaultModelRef;
  source?: "runtime" | "config" | "workspace" | "derived";
}

export interface ModelCatalog {
  models: ModelDescriptor[];
  defaultModel?: DefaultModelRef | null;
}

export interface DefaultModelRef {
  provider?: string;
  modelId: string;
  label?: string;
}

export interface AuthState {
  providers: Record<string, ProviderAuthSummary>;
  diagnostics?: Record<string, unknown>;
}

export interface SessionTransport {
  kind: "cli" | "gateway" | "hybrid";
  streaming: boolean;
  gatewayKind?: "openai-chat-completions" | "openai-responses" | "openclaw-gateway" | "codex-app-server" | "claw-runtime" | "sse" | "ws";
  primaryTransport?: "cli" | "gateway";
  fallbackTransport?: "cli" | "gateway" | "none";
  sessionPersistence?: "ephemeral" | "workspace" | "runtime" | "agent";
  streamingMode?: "none" | "cli" | "gateway" | "hybrid";
}

export interface SchedulerDescriptor {
  id: string;
  label: string;
  enabled: boolean;
  status: "idle" | "running" | "paused" | "unknown";
  kind?: "cron" | "routine" | "job" | "daemon" | "workflow";
}

export interface SchedulerCatalog {
  schedulers: SchedulerDescriptor[];
}

export interface MemoryDescriptor {
  id: string;
  label: string;
  kind: "file" | "store" | "index" | "session" | "knowledge";
  path?: string;
  summary?: string;
  updatedAt?: string;
}

export interface MemoryCatalog {
  memory: MemoryDescriptor[];
}

export interface SkillDescriptor {
  id: string;
  label: string;
  enabled: boolean;
  scope?: "workspace" | "runtime" | "global";
  path?: string;
}

export interface SkillCatalog {
  skills: SkillDescriptor[];
}

export interface SkillSourceCapabilities {
  search: boolean;
  install: boolean;
  resolveExact: boolean;
}

export interface SkillSourceDescriptor {
  id: string;
  label: string;
  status: "ready" | "degraded" | "unsupported";
  capabilities: SkillSourceCapabilities;
  summary?: string;
  warnings?: string[];
}

export interface SkillCatalogEntry {
  source: string;
  slug: string;
  label: string;
  summary?: string;
  installRef: string;
  homepage?: string;
}

export interface SkillSearchResult {
  query: string;
  entries: SkillCatalogEntry[];
  sources: SkillSourceDescriptor[];
  omittedSources?: Array<{
    source: string;
    reason: string;
  }>;
  warnings?: string[];
}

export interface SkillInstallResult {
  source: string;
  slug: string;
  label: string;
  installRef: string;
  homepage?: string;
  installedPaths?: string[];
  runtimeVisibility: "runtime" | "external" | "unknown";
  warnings?: string[];
}

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
  block: PromptContextBlock | null;
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
export type UserFactSensitivity = "public" | "personal" | "sensitive";
export type UserFactVisibility = "agent" | "public" | "private";
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
export type UserEntityType = "person" | "organization" | "place" | "asset" | "pet" | "document" | "account";
export type UserFactValue = string | number | boolean | null | Array<string | number | boolean | null> | Record<string, unknown>;

export interface UserFactMetadata {
  status: UserFactStatus;
  schemaVersion: number;
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

export interface UserProposal {
  id: string;
  kind: "fact" | "record" | "custom_fact";
  userId: string;
  path?: string;
  recordType?: UserRecordType;
  title?: string;
  value?: UserFactValue;
  fields?: Record<string, UserFactValue>;
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
  entities: UserEntity[];
  links: UserLink[];
  records: UserRecord[];
  customFacts: UserCustomFact[];
  proposals: UserProposal[];
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

export interface LibrarySyncResult {
  resolved: LibraryResolveResult;
  syncedSkills: SkillDescriptor[];
  writtenInstructionBlocks: Array<{
    assetId: string;
    targetFile: string;
    blockId: string;
    changed: boolean;
  }>;
}

export interface ChannelDescriptor {
  id: string;
  label: string;
  kind: "chat" | "email" | "webhook" | "voice" | "social" | "unknown";
  status: "connected" | "disconnected" | "configured" | "degraded" | "unknown";
  endpoint?: string;
  provider?: string;
  lastSyncAt?: string;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChannelCatalog {
  channels: ChannelDescriptor[];
}

export type ChannelPermission = "read" | "write" | "ingest" | "admin";

export interface ChannelAccountDescriptor {
  id: string;
  provider: string;
  accountId: string;
  label: string;
  enabled: boolean;
  status: ChannelDescriptor["status"];
  secretRef?: string | null;
  maskedCredential?: string | null;
  profile?: Record<string, unknown> | null;
  transport?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelTargetDescriptor {
  id: string;
  provider: string;
  accountId: string;
  targetId: string;
  kind: "dm" | "group" | "supergroup" | "channel" | "topic" | "unknown";
  label?: string;
  title?: string;
  username?: string;
  parentTargetId?: string;
  threadId?: string;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelMessageRecord {
  id: string;
  provider: string;
  accountId: string;
  targetId: string;
  direction: "inbound" | "outbound";
  status: "received" | "sent" | "failed" | "pending";
  text?: string;
  providerMessageId?: string;
  threadId?: string;
  senderId?: string;
  senderLabel?: string;
  receivedAt?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
}

export interface ChannelAgentBinding {
  id: string;
  agentId: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  permissions: ChannelPermission[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelProcessorDescriptor {
  id: string;
  label?: string;
  command: string;
  cwd?: string;
  agentId?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelListenerDescriptor {
  id: string;
  provider: string;
  accountId: string;
  processorId?: string;
  mode: "foreground" | "background";
  status: "running" | "stopped" | "stale" | "error";
  pid?: number;
  pidPath?: string;
  logPath?: string;
  stopPath?: string;
  startedAt?: string;
  stoppedAt?: string;
  lastHeartbeatAt?: string;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelEventRecord {
  id: string;
  type:
    | "channel.message.received"
    | "channel.message.sent"
    | "channel.target.discovered"
    | "channel.listener.started"
    | "channel.listener.stopped"
    | "channel.listener.error"
    | "channel.processor.invoked";
  provider: string;
  accountId: string;
  targetId?: string;
  messageId?: string;
  processorId?: string;
  status?: "ok" | "error" | "ignored";
  createdAt: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RuntimePluginDescriptor {
  id: string;
  label: string;
  enabled?: boolean;
  version?: string | null;
  status?: "ready" | "degraded" | "unsupported" | "unknown";
  metadata?: Record<string, unknown>;
}

export interface PluginCatalog {
  plugins: RuntimePluginDescriptor[];
}

// ── IoT types ────────────────────────────────────────────────────────

export type IoTRiskLevel = "safe" | "caution" | "restricted";
export type IoTThingKind =
  | "light"
  | "switch"
  | "climate"
  | "cover"
  | "lock"
  | "sensor"
  | "camera"
  | "media"
  | "vacuum"
  | "appliance"
  | "presence"
  | "energy";

export interface HomeDescriptor {
  id: string;
  label: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AreaDescriptor {
  id: string;
  homeId: string;
  label: string;
  aliases?: string[];
}

export interface ConnectorDescriptor {
  id: string;
  homeId: string;
  label: string;
  kind: "bridge" | "protocol" | "vendor";
  status: "ready" | "degraded" | "offline";
  capabilities: string[];
}

export interface CapabilityDescriptor {
  id: string;
  thingId: string;
  key: string;
  label: string;
  writable: boolean;
  readable: boolean;
  unit?: string;
  observedValue?: unknown;
  desiredValue?: unknown;
  observedAt: string;
}

export interface ThingDescriptor {
  id: string;
  homeId: string;
  areaId?: string;
  label: string;
  aliases?: string[];
  kind: IoTThingKind;
  risk: IoTRiskLevel;
  connectorId: string;
  targetRef: string;
  metadata?: Record<string, unknown>;
  capabilities: CapabilityDescriptor[];
}

export interface IoTActionRequest {
  homeId?: string;
  selector?: string;
  area?: string;
  family?: IoTThingKind | "scene" | "automation";
  capability?: string;
  action: "on" | "off" | "toggle" | "set" | "open" | "close" | "lock" | "unlock" | "arm" | "disarm" | "start" | "stop" | "pause" | "resume" | "activate";
  value?: unknown;
  targets?: string[];
  metadata?: Record<string, unknown>;
}

export interface IoTActionResult {
  status: "executed" | "approval_required" | "ambiguous" | "denied";
  homeId: string;
  decision: "allow" | "approval_required" | "deny" | "ambiguous";
  reasons: string[];
  updatedAt: string;
  targets: Array<{
    id: string;
    label: string;
    kind: IoTThingKind;
    areaId?: string;
  }>;
  capabilityUpdates: Array<{
    thingId: string;
    capability: string;
    observedValue?: unknown;
    desiredValue?: unknown;
  }>;
  approvalId?: string;
  candidates?: Array<{
    id: string;
    label: string;
    kind: IoTThingKind;
  }>;
}

export interface IoTPolicyEvaluation {
  decision: "allow" | "approval_required" | "deny" | "ambiguous";
  riskLevel: IoTRiskLevel;
  reasons: string[];
  candidates?: Array<{
    id: string;
    label: string;
    kind: IoTThingKind;
  }>;
  resolvedTargetIds?: string[];
}

export interface SceneRecord {
  id: string;
  homeId: string;
  label: string;
  description?: string;
  actions: IoTActionRequest[];
}

export interface AutomationRecord {
  id: string;
  homeId: string;
  label: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  actions: IoTActionRequest[];
}

export interface PolicyRecord {
  id: string;
  homeId: string;
  label: string;
  riskLevel?: IoTRiskLevel;
  requiresApproval: boolean;
  localOnly?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRecord {
  id: string;
  homeId: string;
  status: "pending" | "approved" | "denied" | "executed";
  reason: string;
  action: IoTActionRequest;
  createdAt: string;
  updatedAt: string;
}

export interface IoTEventRecord {
  id: string;
  homeId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface IoTStateSnapshot {
  home: HomeDescriptor;
  areas: AreaDescriptor[];
  connectors: ConnectorDescriptor[];
  things: ThingDescriptor[];
  updatedAt: string;
}

export interface RawIoTInvocation {
  connector: string;
  homeId?: string;
  target: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface TelegramBotProfile {
  id: string;
  isBot: boolean;
  username?: string;
  firstName: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

export interface TelegramWebhookStatus {
  url?: string;
  hasCustomCertificate?: boolean;
  pendingUpdateCount?: number;
  ipAddress?: string;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  lastSynchronizationErrorDate?: number;
  maxConnections?: number;
  allowedUpdates?: string[];
  secretTokenConfigured?: boolean;
}

export interface TelegramTransportStatus {
  mode: "webhook" | "polling" | "disabled";
  active: boolean;
  webhook?: TelegramWebhookStatus | null;
  lastSyncAt?: string;
  lastUpdateId?: number;
  pendingUpdateCount?: number;
  pollerPid?: number | null;
}

export interface TelegramChatSummary {
  id: string;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isForum?: boolean;
  inviteLink?: string;
  lastSeenAt?: string;
}

export interface TelegramMemberSummary {
  userId: string;
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  username?: string;
  firstName?: string;
  lastName?: string;
  isBot?: boolean;
  canBeEdited?: boolean;
  permissions?: Record<string, boolean>;
}

export interface TelegramUpdateEnvelope {
  updateId: number;
  type: "message" | "edited_message" | "callback_query" | "my_chat_member" | "chat_member" | "unknown";
  chatId?: string;
  messageId?: number;
  chatType?: string;
  receivedAt: string;
  raw?: Record<string, unknown>;
}

export interface TelegramCommand {
  command: string;
  description: string;
}

export interface TelegramForumTopicIconSticker {
  customEmojiId: string;
  emoji?: string;
}

export interface TelegramForumTopic {
  messageThreadId: number;
  name: string;
  iconColor?: number;
  iconCustomEmojiId?: string;
}

export interface TelegramForumReadiness {
  ready: boolean;
  chat: TelegramChatSummary;
  bot: TelegramMemberSummary;
  missing: string[];
}

// ── Slack types ──────────────────────────────────────────────────────

export interface SlackBotProfile {
  id: string;
  name: string;
  teamId: string;
  teamName?: string;
  botUserId?: string;
  appId?: string;
  icons?: Record<string, string>;
}

export interface SlackChannelSummary {
  id: string;
  name: string;
  type: "channel" | "group" | "im" | "mpim";
  topic?: string;
  purpose?: string;
  memberCount?: number;
  isArchived?: boolean;
  isMember?: boolean;
  lastMessageAt?: string;
}

export interface SlackTransportStatus {
  mode: "socket" | "events-api" | "disabled";
  active: boolean;
  eventsUrl?: string | null;
  lastSyncAt?: string;
  lastError?: string | null;
}

export interface SlackStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  connected: boolean;
  secretName?: string;
  maskedCredential?: string | null;
  botProfile?: SlackBotProfile | null;
  transport: SlackTransportStatus;
  recentErrors: string[];
  knownChannels: SlackChannelSummary[];
}

// ── WhatsApp bot types ───────────────────────────────────────────────

export interface WhatsAppBotProfile {
  phoneNumber: string;
  displayName: string;
  platform: "business-api" | "wacli-bridge";
  verified?: boolean;
}

export interface WhatsAppTransportStatus {
  mode: "wacli" | "business-api" | "disabled";
  active: boolean;
  authenticated?: boolean;
  lastSyncAt?: string;
  lastError?: string | null;
  qrText?: string | null;
}

export interface WhatsAppStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  connected: boolean;
  secretName?: string;
  maskedCredential?: string | null;
  botProfile?: WhatsAppBotProfile | null;
  transport: WhatsAppTransportStatus;
  recentErrors: string[];
  canSendMessages: boolean;
}

export interface Attachment {
  name: string;
  mimeType: string;
  data?: string;
  preview?: string;
}

export type DocumentOrigin = "user_upload" | "assistant_generated" | "channel_ingested" | "imported";
export type DocumentIndexStatus = "pending" | "indexed" | "unsupported" | "error";

export interface DocumentStorageDescriptor {
  kind: "workspace_path" | "blob";
  path: string;
}

export interface DocumentRef {
  documentId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
}

export interface DocumentRecord extends DocumentRef {
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  origin: DocumentOrigin;
  storage: DocumentStorageDescriptor;
  createdAt: number;
  createdByMessageId?: string;
  sessionId?: string;
  indexStatus: DocumentIndexStatus;
  textPath?: string;
}

export interface DocumentSearchResult extends DocumentRecord {
  snippet: string;
  score: number;
  sourcePath?: string;
  startLine?: number;
  endLine?: number;
}

export type MediaKind = "image" | "document" | "audio" | "video" | "animation" | "other";
export type MediaOrigin = "user_upload" | "assistant_generated" | "channel_ingested" | "imported" | "generated";
export type MediaDirection = "inbound" | "outbound" | "internal";

export interface MediaStorageRef {
  bucket: string;
  key: string;
  url: string;
}

export interface MediaExternalRef {
  provider?: string;
  value: string;
  kind: "url" | "provider_file_id" | "opaque";
}

export interface MediaChannelContext {
  provider?: string;
  accountId?: string;
  targetId?: string;
  threadId?: string;
  providerMessageId?: string;
}

export interface MediaRecord {
  mediaId: string;
  name: string;
  mimeType: string;
  kind: MediaKind;
  sizeBytes?: number;
  sha256?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  messageId?: string;
  command?: string;
  origin: MediaOrigin;
  direction: MediaDirection;
  channel?: MediaChannelContext;
  storage?: MediaStorageRef;
  external?: MediaExternalRef;
  sourceText?: string;
  sourceType?: string;
  sourceId?: string;
  shareIds: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface MediaListInput {
  query?: string;
  kind?: MediaKind;
  direction?: MediaDirection;
  origin?: MediaOrigin;
  agentId?: string;
  workspaceId?: string;
  projectId?: string;
  sessionId?: string;
  provider?: string;
  accountId?: string;
  targetId?: string;
  threadId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface MediaSearchResult extends MediaRecord {
  snippet: string;
  score: number;
}

export interface MediaGalleryShare {
  id: string;
  label: string;
  url: string;
  filters: MediaListInput;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

export interface ContextChip {
  type: string;
  id: string;
  label: string;
  emoji?: string;
}

export interface PromptContextBlock {
  title: string;
  content: string;
  id?: string;
}

export interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  documents?: DocumentRef[];
  contextChips?: ContextChip[];
  metadata?: Record<string, unknown>;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface SessionRecord extends SessionSummary {
  messages: Message[];
}

export type SessionSearchStrategy = "auto" | "local" | "openclaw-memory";
export type SessionSearchField = "title" | "preview" | "message" | "memory";

export interface SessionSearchInput {
  query: string;
  strategy?: SessionSearchStrategy;
  limit?: number;
  includeMessages?: boolean;
  fallbackToLocal?: boolean;
  minScore?: number;
}

export interface SessionSearchResult extends SessionSummary {
  snippet: string;
  score: number;
  strategy: Exclude<SessionSearchStrategy, "auto">;
  matchedFields: SessionSearchField[];
  sourcePath?: string;
  startLine?: number;
  endLine?: number;
}

export interface StreamChunk {
  sessionId: string;
  messageId?: string;
  delta: string;
  done: boolean;
  reasoningDelta?: string;
  toolCalls?: Array<{
    id?: string;
    index?: number;
    type?: string;
    name?: string;
    arguments?: string;
  }>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ProgressEvent {
  capability: CapabilityName;
  phase: string;
  message?: string;
  percent?: number;
  timestamp: string;
}

export interface TemplateMutation {
  targetFile: string;
  mode: FileMutationMode;
  content?: string;
  anchor?: string;
  blockId?: string;
  visibleToUser?: boolean;
  required?: boolean;
}

export interface TemplatePack {
  schemaVersion: number;
  id: string;
  name: string;
  mutations: TemplateMutation[];
}

export interface BindingDefinition {
  id: string;
  targetFile: string;
  mode: Extract<FileMutationMode, "managed_block" | "insert_before_anchor" | "insert_after_anchor" | "append" | "prepend">;
  blockId?: string;
  anchor?: string;
  required?: boolean;
  visibleToUser?: boolean;
  settingsPath: string;
}

export interface OrchestrationReadiness {
  overallStatus: CapabilityStatus;
  runtimeReady: boolean;
  workspaceReady: boolean;
  authReady: boolean;
  modelReady: boolean;
  fileSyncReady: boolean;
  recommendedActions: string[];
}
