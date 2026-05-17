import type * as LibraryRuleTypes from "./types-library-rules.ts";

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
  | "openclaude"
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
export type RuntimeAdapterStability = "stable" | "dev-only";
export type RuntimeAdapterSupportLevel = "production" | "dev-only";
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

export interface RuntimeDescriptor {
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
  sessionId?: string;
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

export * from "./types-workspace.ts";

export interface ProviderAuthSummary {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
  maskedCredential?: string | null;
  source?: "secrets" | "env" | "missing" | "disabled" | "runtime" | "config" | "store";
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

export * from "./types-library-rules.ts";

export * from "./types-human.ts";

export interface LibrarySyncResult {
  resolved: LibraryRuleTypes.LibraryResolveResult;
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
export type IoTDeviceKind =
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

export interface IoTDeviceDescriptor {
  id: string;
  homeId: string;
  areaId?: string;
  label: string;
  aliases?: string[];
  kind: IoTDeviceKind;
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
  family?: IoTDeviceKind | "scene" | "automation";
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
    kind: IoTDeviceKind;
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
    kind: IoTDeviceKind;
  }>;
}

export interface IoTPolicyEvaluation {
  decision: "allow" | "approval_required" | "deny" | "ambiguous";
  riskLevel: IoTRiskLevel;
  reasons: string[];
  candidates?: Array<{
    id: string;
    label: string;
    kind: IoTDeviceKind;
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
  things: IoTDeviceDescriptor[];
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
