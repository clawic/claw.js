import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "crypto";

import type {
  Attachment,
  AuthState,
  BindingDefinition,
  ChannelDescriptor,
  ChannelAccountDescriptor,
  ChannelAgentBinding,
  ChannelEventRecord,
  ChannelListenerDescriptor,
  ChannelMessageRecord,
  ChannelPermission,
  ChannelProcessorDescriptor,
  ChannelTargetDescriptor,
  ClawManifest,
  SessionPolicy,
  SessionSearchInput,
  SessionSearchResult,
  SessionTransport,
  DefaultModelRef,
  DocumentRecord,
  DocumentRef,
  DocumentSearchResult,
  IntentDomain,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  RuntimeFeatureDescriptor,
  ObservedDomain,
  PromptContextBlock,
  ProviderDescriptor,
  ProviderCatalog,
  ProviderAuthSummary,
  RuntimeCapabilitySupport,
  RuntimeAdapterId,
  RuntimeFileDescriptor,
  SchedulerDescriptor,
  SkillCatalogEntry,
  SkillDescriptor,
  SkillInstallResult,
  SkillSearchResult,
  SkillSourceDescriptor,
  SubscriptionFilter,
  SlackChannelSummary,
  TelegramChatSummary,
  TelegramCommand,
  TelegramMemberSummary,
  TelegramTransportStatus,
  TelegramUpdateEnvelope,
  WorkspaceConfig,
  NotificationAudience,
  NotificationContext,
  NotificationDeepLink,
  NotificationDeliveryMode,
  NotificationPriority,
  NotificationReceiptPolicy,
  TemporalExecution,
  TemporalItem,
  TemporalRunLogEntry,
  HomeDescriptor,
  AreaDescriptor,
  ThingDescriptor,
  IoTStateSnapshot,
  IoTActionRequest,
  IoTActionResult,
  SceneRecord,
  AutomationRecord,
  PolicyRecord,
  ApprovalRecord,
  ConnectorDescriptor,
  RawIoTInvocation,
  IoTPolicyEvaluation,
  IoTEventRecord,
  LibraryAsset,
  LibraryAssignment,
  LibraryResolveResult,
  LibrarySyncResult,
  ContextPackListInput,
  ContextPackPrepareInput,
  ContextPackRecord,
  CommitmentAddInput,
  CommitmentCaptureInput,
  CommitmentCaptureResult,
  CommitmentLinkInput,
  CommitmentListInput,
  CommitmentOutcomeInput,
  CommitmentRecord,
  JudgmentImpact,
  JudgmentLinkInput,
  JudgmentListInput,
  JudgmentRecord,
  JudgmentRecordInput,
  LearningAddInput,
  LearningEvidenceInput,
  LearningListInput,
  LearningPromotionResult,
  LearningPromotionTarget,
  LearningRecord,
  OutcomeAddInput,
  OutcomeCaptureResult,
  OutcomeLinkInput,
  OutcomeListInput,
  OutcomeRecord,
  MediaGalleryShare,
  MediaKind,
  MediaListInput,
  MediaRecord,
  MediaSearchResult,
  SkillContextCapsule,
  SkillContextResolveResult,
  SkillCreateInput as SkillsV2CreateInput,
  SkillImportReport,
  SkillKind as SkillsV2Kind,
  SkillListFilter as SkillsV2ListFilter,
  SkillResolveContext as SkillsV2ResolveContext,
  SkillScope as SkillsV2Scope,
  SkillSpec as SkillsV2Spec,
  SkillSyncReport,
  SkillSyncTarget as SkillsV2SyncTarget,
  SkillUpdate as SkillsV2Update,
  SkillAssignment as SkillsV2Assignment,
  SoulAssignment,
  SoulCompileResult,
  SoulSpec,
  SoulValidationResult,
  UserAssignment,
  UserCompileProfile,
  UserCompileResult,
  UserCustomFact,
  UserDomainId,
  UserDomainState,
  UserEntity,
  UserEntityType,
  UserFact,
  UserFactSensitivity,
  UserFactValue,
  UserLink,
  UserMergeProposal,
  UserPackId,
  UserPackState,
  UserProposal,
  UserRecord,
  UserRecordType,
  UserSpec,
  UserValidationResult,
  RuleInput,
  RuleRecord,
  RuleScope,
  RuleScopeInput,
  RulesCompileInput,
  RulesCompileResult,
} from "@clawjs/core";
import {
  createTtsPlaybackPlan,
  segmentTextForTts,
  stripMarkdownForTts,
  type TtsPlaybackPlan,
} from "@clawjs/core";

import { WorkspaceAuditLog } from "./host/audit.ts";
import { NodeFileSystemHost } from "./host/filesystem.ts";
import { NodeProcessHost } from "./host/process.ts";
import { expandHome, resolveClawGlobalDataRoot, resolveClawWorkspaceSurfacePath } from "./surface-paths.ts";
import { applyTemplatePack, type ApplyTemplatePackOptions } from "./files/template-pack.ts";
import { listManagedBlockProblems } from "./files/managed-blocks.ts";
import { syncBinding } from "./bindings/sync.ts";
import { renderSettingsTemplate } from "./bindings/render.ts";
import { updateBindingSettings } from "./bindings/update.ts";
import {
  readBindingStore,
  readSettingsSchemaRecord,
  readSettingsValuesRecord,
  resolveBindingsPath,
  resolveSettingsSchemaPath,
  resolveSettingsValuesPath,
  validateSettingsUpdate,
  writeBindingStore,
  writeSettingsSchemaRecord,
  writeSettingsValuesRecord,
} from "./bindings/store.ts";
import { readWorkspaceManifest, resolveManifestPath } from "./workspace/manifest.ts";
import { buildOrchestrationSnapshot } from "./orchestration.ts";
import { readCompatSnapshot, writeCompatSnapshot, resolveCompatSnapshotPath } from "./compat/store.ts";
import { buildCompatDriftReport } from "./compat/drift.ts";
import {
  readCapabilityReport,
  readChannelsStateSnapshot,
  readMemoryStateSnapshot,
  readProviderStateSnapshot,
  readSchedulerStateSnapshot,
  readSkillsStateSnapshot,
  readSlackStateSnapshot,
  readTelegramStateSnapshot,
  readWhatsAppStateSnapshot,
  readWorkspaceStateSnapshot,
  resolveCapabilityReportPath,
  resolveChannelsStatePath,
  resolveMemoryStatePath,
  resolveProviderStatePath,
  resolveSchedulerStatePath,
  resolveSkillsStatePath,
  resolveTelegramStatePath,
  resolveWorkspaceStatePath,
  writeCapabilityReport,
  writeChannelsStateSnapshot,
  writeMemoryStateSnapshot,
  writeProviderStateSnapshot,
  writeSchedulerStateSnapshot,
  writeSkillsStateSnapshot,
  writeWorkspaceStateSnapshot,
} from "./state/store.ts";
import { watchWorkspaceFile } from "./watch/index.ts";
import { watchSessionTranscript } from "./watch/transcript.ts";
import { ClawEventBus, type ClawEvent, type EventListener } from "./watch/events.ts";
import { watchProviderStatus, watchRuntimeStatus, type PollWatchOptions } from "./watch/status.ts";
import { SessionStore } from "./sessions/store.ts";
import { createSoulStore } from "./soul/store.ts";
import { createUserStore } from "./user/store.ts";
import { createContextStore } from "./context/store.ts";
import { createCommitmentStore } from "./commitments/store.ts";
import { createJudgmentStore } from "./judgment/store.ts";
import { createLearningStore } from "./learning/store.ts";
import { createOutcomeStore } from "./outcomes/store.ts";
import { ChannelRunStore } from "./channel-runs/index.ts";
import type { ChannelRunOptions, ChannelRunTarget, ChannelRunMessage } from "./channel-runs/index.ts";
import { streamRuntimeSession, streamRuntimeSessionEvents, type SessionStreamEvent } from "./sessions/stream.ts";
import { generateRuntimeSessionTitle } from "./sessions/title.ts";
import { createWorkspaceDataStore, type WorkspaceDataStore } from "./data/store.ts";
import { createDocumentStore, resolveLegacyDocumentRefs } from "./documents/store.ts";
import { createMediaStore, type RegisterMediaInput } from "./media/store.ts";
import {
  createDriveStorageShareAdapter,
  createLocalStorageStore,
  type StorageDriveIndexAdapter,
  type LocalStorageStore,
  type StorageGetResult,
  type StorageGrant,
  type StorageListInput,
  type StorageObject,
  type StoragePutInput,
  type StorageRef,
  type StorageScopedToken,
  type StorageShare,
} from "./storage/index.ts";
import { generateRuntimeText, type GenerateTextInput, type GenerateTextResult } from "./inference/generate-text.ts";
import {
  createGenerationStore,
  type CreateGenerationInput,
  type GenerationBackendDescriptor,
  type GenerationListOptions,
  type GenerationRecord,
  type RegisterCommandGenerationBackendInput,
} from "./generations/store.ts";
import {
  createImageLibraryStore,
  OPENAI_BACKEND_ID,
  type ImageCreateInput,
  type ImageEditInput,
  type ImageImportInput,
  type ImageListOptions,
  type ImageRecord,
} from "./images/store.ts";
import {
  attachWorkspace,
  buildWorkspaceResetPlan,
  initializeWorkspace,
  inspectManagedWorkspaceFile,
  inspectWorkspaceFile,
  listManagedFiles,
  previewWorkspaceFile,
  readWorkspaceFile,
  repairWorkspace,
  resetWorkspace,
  resolveRuntimeFilePath,
  validateWorkspace,
  writeWorkspaceFile,
  writeWorkspaceFilePreservingManagedBlocks,
  type PreserveManagedBlocksWriteOptions,
} from "./workspace/manager.ts";
import { buildCombinedDoctorReport } from "./doctor/run.ts";
import {
  getRuntimeAdapter,
  getOpenClawGatewayStatus,
  restartOpenClawGateway,
  startOpenClawGateway,
  stopOpenClawGateway,
  waitForOpenClawGateway,
  callOpenClawGateway,
  discoverOpenClawAppContext,
  detachOpenClawAppContext,
  runOpenClawMemorySearch,
  type OpenClawAppContext,
  resolveOpenClawContext,
  type DiscoverOpenClawAppContextOptions,
  type DetachOpenClawAppContextOptions,
  type OpenClawRuntimeContext,
  type OpenClawGatewayStatus,
  type AuthDiagnostics,
  type AuthLoginPlan,
  type AuthLoginProgressEvent,
  type AuthLoginResult,
  type RuntimeAdapterOptions,
  type RuntimeCommandSpec,
  type RuntimeProgressEvent,
  type RuntimeProgressPlan,
  type RuntimeProgressSink,
  type RuntimeProbeStatus,
  type SaveApiKeyResult,
} from "./runtime/index.ts";
import { withOpenClawCommandEnv, withOpenClawCommandRunner } from "./runtime/openclaw-command.ts";
import { mergeProcessEnv } from "./runtime/env.ts";
import {
  disableManagedOpenClawPlugins,
  doctorOpenClawPlugins,
  enableManagedOpenClawPlugins,
  ensureOpenClawPluginBridge,
  getOpenClawPluginBridgeStatus,
  installManagedOpenClawPlugins,
  listOpenClawHooks,
  listOpenClawPlugins,
  resolveOpenClawPluginBridgePolicy,
  updateManagedOpenClawPlugins,
  type OpenClawPluginBridgeMode,
  type OpenClawManagedPluginTarget,
} from "./runtime/plugins.ts";
import {
  getSkillSource,
  listSkillSources,
  normalizeInstallRef,
  resolveSkillSourceFromRef,
  type SkillSourceAdapter,
} from "./skills/index.ts";
import {
  SkillsImporter,
  SkillsStore as SkillsV2Store,
  SkillsSyncEngine,
  compileSkills as compileSkillsV2,
  createSkillsStore,
  generateBuiltinSkills as generateSkillsV2Builtins,
  migrateLegacyState as migrateSkillsV2LegacyState,
} from "./skills-v2/index.ts";
import { callTelegramApi, createTelegramService, downloadTelegramFile, type TelegramConnectBotInput, type TelegramSendMediaInput, type TelegramSendMessageInput, type TelegramStatusResult, type TelegramWebhookConfigInput, type TelegramSyncUpdatesOptions, type TelegramBanOrRestrictInput, type TelegramInviteLinkOptions } from "./telegram/index.ts";
import { createChannelsRegistry, type GrantChannelBindingInput, type ReadChannelMessagesInput, type RegisterChannelProcessorInput, type RegisterChannelTargetInput, type RegisterTelegramBotAccountInput, type SendChannelMessageInput, type UpsertChannelListenerInput } from "./channels/index.ts";
import { invokeChannelProcessor, type ChannelProcessorAction } from "./channels/processors.ts";
import {
  callTelegramAccountBooleanMethod,
  callTelegramAccountRecordMethod,
  configureTelegramAccountWebhook,
  connectTelegramAccount,
  disableTelegramAccountWebhook,
  getTelegramAccountChat,
  getTelegramAccountCommands,
  listTelegramAccountChats,
  refreshTelegramAccountStatus,
  sendTelegramAccountMessage,
  setTelegramAccountCommands,
  syncTelegramAccount,
  telegramBanOrRestrictParams,
  telegramInviteLinkParams,
} from "./channels/telegram.ts";
import { createSlackService, type SlackConnectBotInput, type SlackSendMessageInput, type SlackStatusResult } from "./slack/index.ts";
import { createWhatsAppService, type WhatsAppConnectInput, type WhatsAppSendMessageInput, type WhatsAppStatusResult } from "./whatsapp/index.ts";
import {
  brokerSecretHttp,
  describeSecret,
  doctorKeychain,
  ensureHttpSecretReference,
  ensureTelegramBotSecretReference,
  getSecretCapabilities,
  listSecretActions,
  listSecretLeases,
  listSecrets,
  listSecretTypes,
  runSecretAction,
  type EnsureSecretReferenceInput,
  type EnsureSecretReferenceResult,
  type SecretBrokerHttpInput,
  type SecretBrokerHttpResult,
  type SecretCapabilityStatus,
  type SecretDoctorResult,
  type SecretLeaseRecord,
  type SecretProxyMetadata,
  type SecretTypeDescriptor,
  type SecretTypedActionDescriptor,
} from "./secrets/index.ts";

import { applyTextMutation, mergeManagedBlocks, type MergeManagedBlocksOptions } from "./files/managed-blocks.ts";
import {
  createLocalLibraryStore,
  libraryProjectionTargetFile,
  normalizeLibraryId,
  type LibraryAssetInput,
  type LibraryAssetUpdate,
  type LibraryAssignInput,
  type LibraryResolveInput,
} from "./library/store.ts";
import { createLocalRulesStore } from "./rules/store.ts";
import {
  synthesize,
  listTtsProviders,
  getTtsCatalog,
  normalizeTtsConfig,
  type TtsCatalog,
  type TtsProviderConfig,
  type TtsSynthesizeInput,
  type TtsSynthesizeResult,
  type TtsProvider,
} from "./tts/index.ts";
import {
  listSttProviders,
  normalizeSttConfig,
  transcribe as transcribeAudio,
  type SttProviderConfig,
  type SttTranscribeInput,
  type SttTranscribeResult,
} from "./stt/index.ts";
import {
  createVoiceNoteStore,
  type CreateVoiceNoteInput,
  type RegisterVoiceNotePathInput,
  type VoiceNoteListInput,
  type VoiceNoteRecord,
} from "./voice-notes/index.ts";
import {
  patchIntentDomain,
  readAllIntentDomains,
  readIntentDomain,
  resolveIntentDomainPath,
  writeIntentDomain,
} from "./intents/store.ts";
import { requiresExplicitProviderEnable } from "./auth/openclaw-auth.ts";
import {
  readAllObservedDomains,
  readObservedDomain,
  resolveObservedDomainPath,
  writeObservedDomain,
} from "./observed/store.ts";
import { NotifyClient, type SendNotificationInput, type UpsertSubscriptionInput } from "./notify/index.ts";
import { IotClient } from "./iot/index.ts";
import {
  EmbeddedTimeEngine,
  TimeClient,
  type CreateTemporalItemInput,
  type TemporalHeartbeatAgentRunner,
  type TemporalHeartbeatCheckProvider,
  type TimeServiceLike,
  type UpdateTemporalItemInput,
} from "./time/index.ts";
import {
  ContentClient,
  type ContentApprovalRequest,
  type ContentAssetRef,
  type ContentBrand,
  type ContentCampaign,
  type ContentDestination,
  type ContentEntry,
  type ContentOperation,
  type ContentPublishPlan,
  type ContentPublicationRun,
  type ContentScopedTokenRecord,
  type ContentVariant,
} from "./content/index.ts";

function defaultClawjsMainDbPath(): string {
  const explicit = process.env.CLAW_DB_PATH;
  if (explicit) return expandHome(explicit);
  return path.join(defaultClawjsDataRoot(), "core.sqlite");
}

function defaultClawjsDataRoot(): string {
  return resolveClawGlobalDataRoot();
}

const TELEGRAM_CODEX_BRIDGE_COMMANDS: TelegramCommand[] = [
  { command: "new", description: "Start a fresh session" },
  { command: "reset", description: "Reset this session" },
  { command: "status", description: "Show session status" },
  { command: "queue", description: "Show queued messages" },
  { command: "stop", description: "Stop current run" },
  { command: "continue", description: "Process queued messages" },
  { command: "compact", description: "Compact session context" },
  { command: "summary", description: "Show active summary" },
  { command: "debug", description: "Show debug status" },
];

import type { CreateClawOptions, ClawFactory, TemporalListFilters, TemporalNaturalCreateInput, TemporalReminderAfterInput, TemporalTarget, TemporalWatchInput } from "./create-claw-options.ts";
import type { ClawInstance } from "./create-claw-instance.ts";
import { createClawKnowledgeFacades } from "./create-claw-knowledge-facades.ts";
import { createClawChannelFacades } from "./create-claw-channel-facades.ts";
import { createClawMediaSessionHelpers } from "./create-claw-media-session-helpers.ts";
import { createClawGenerationImageHelpers } from "./create-claw-generation-image-helpers.ts";
import { createClawSkillProviderHelpers } from "./create-claw-skill-provider-helpers.ts";
import { createClawChannelRuntimeHelpers } from "./create-claw-channel-runtime-helpers.ts";
import { createClawContentIotFacades } from "./create-claw-content-iot-facades.ts";

function parseTemporalTarget(target: string): Required<Pick<TemporalTarget, "anchorType" | "anchorId">> {
  const separatorIndex = target.indexOf(":");
  const rawType = separatorIndex === -1 ? "standalone" : target.slice(0, separatorIndex);
  const anchorId = separatorIndex === -1 ? target : target.slice(separatorIndex + 1);
  const allowed = new Set(["thread", "task", "project", "goal", "event", "execution", "standalone"]);
  if (!allowed.has(rawType) || !anchorId.trim()) {
    throw new Error(`Invalid watch target "${target}". Use values like thread:123 or task:123.`);
  }
  return {
    anchorType: rawType as NonNullable<TemporalItem["anchorType"]>,
    anchorId: anchorId.trim(),
  };
}

function resolveTemporalWatchTitle(input: TemporalWatchInput): string {
  if (input.title?.trim()) return input.title.trim();
  if (typeof input.then === "string" && input.then.trim()) return input.then.trim();
  if (typeof input.then === "object" && input.then.kind === "remind" && input.then.title.trim()) return input.then.title.trim();
  return `Watch ${input.target}`;
}

function buildCanonicalPathMap(workspaceDir: string, runtimeFiles: RuntimeFileDescriptor[]): Record<string, string> {
  return Object.fromEntries(
    runtimeFiles.map((descriptor) => [descriptor.key, resolveRuntimeFilePath(workspaceDir, descriptor.path)]),
  );
}

function extractSessionIdFromSourcePath(sourcePath?: string): string | null {
  const trimmed = sourcePath?.trim();
  if (!trimmed) return null;
  const fileName = path.basename(trimmed);
  if (!fileName.endsWith(".jsonl")) return null;
  return fileName.slice(0, -".jsonl".length) || null;
}

function extractDocumentIdFromSourcePath(sourcePath?: string): string | null {
  const trimmed = sourcePath?.trim();
  if (!trimmed) return null;
  const fileName = path.basename(trimmed);
  if (!fileName.endsWith(".md")) return null;
  return fileName.slice(0, -".md".length) || null;
}

export async function createClaw(options: CreateClawOptions): Promise<ClawInstance> {
  const filesystem = new NodeFileSystemHost();
  const baseProcessHost = new NodeProcessHost();
  const audit = new WorkspaceAuditLog(filesystem);
  const workspaceDir = options.workspace.rootDir;
  const logicalAgentId = options.workspace.logicalAgentId ?? options.workspace.agentId;
  const runtimeAgentId = options.workspace.runtimeAgentId ?? logicalAgentId;
  const sessionStore = new SessionStore(workspaceDir, { filesystem });
  const contextStore = createContextStore({ workspaceDir, filesystem });
  const commitmentStore = createCommitmentStore({ workspaceDir, filesystem });
  const judgmentStore = createJudgmentStore({ workspaceDir, filesystem });
  const learningStore = createLearningStore({ workspaceDir, filesystem });
  const outcomeStore = createOutcomeStore({ workspaceDir, filesystem });
  const channelRunStore = new ChannelRunStore(workspaceDir, sessionStore, { filesystem });
  const dataStore = createWorkspaceDataStore(workspaceDir, filesystem);
  const storageStore = createLocalStorageStore({
    workspaceDir,
    agentId: logicalAgentId,
    filesystem,
    grants: options.storage?.grants,
    driveIndexAdapter: options.storage?.driveIndex,
    shareAdapter: options.storage?.share
      ? createDriveStorageShareAdapter({
          baseUrl: options.storage.share.driveBaseUrl,
          token: options.storage.share.token,
        })
      : undefined,
  });
  const documentStore = createDocumentStore(workspaceDir, filesystem, { storage: storageStore });
  const mediaStore = createMediaStore({
    dataStore,
    storage: storageStore,
    workspaceId: options.workspace.workspaceId,
    ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
    agentId: logicalAgentId,
  });
  const voiceNoteStore = createVoiceNoteStore({
    dataStore,
    storage: storageStore,
    transcribe: async (input) => transcribeAudio(resolveSttInput(input)),
  });
  const adapter = getRuntimeAdapter(options.runtime.adapter);
  const runtimeEnv = adapter.id === "openclaw"
    ? withOpenClawCommandEnv(options.runtime.env, {
        binaryPath: options.runtime.binaryPath,
        homeDir: options.runtime.homeDir,
        configPath: options.runtime.configPath,
      })
    : options.runtime.env;
  const secretsEnv = mergeProcessEnv(
    runtimeEnv,
    options.secrets?.env,
    {
      ...(options.secrets?.backend ? { CLAW_SECRETS_BACKEND: options.secrets.backend } : {}),
      ...(options.secrets?.baseUrl ? { CLAW_SECRETS_BASE_URL: options.secrets.baseUrl } : {}),
      ...(options.secrets?.credential ? { CLAW_SECRETS_TOKEN: options.secrets.credential } : {}),
      ...(options.secrets?.tenantId ? { CLAW_SECRETS_TENANT_ID: options.secrets.tenantId } : {}),
      ...(options.secrets?.sidecarPath ? { CLAW_SECRETS_SIDECAR_PATH: options.secrets.sidecarPath } : {}),
    },
  );
  const processHost = adapter.id === "openclaw"
    ? withOpenClawCommandRunner(baseProcessHost, {
        binaryPath: options.runtime.binaryPath,
        homeDir: options.runtime.homeDir,
        configPath: options.runtime.configPath,
        env: runtimeEnv,
      })
    : baseProcessHost;
  const generationStore = createGenerationStore({
    workspaceDir,
    runtimeAdapter: options.runtime.adapter,
    filesystem,
    processHost,
    dataStore,
    storage: storageStore,
    env: runtimeEnv,
  });
  const imageStore = createImageLibraryStore({
    rootDir: options.images?.rootDir ?? workspaceDir,
    env: mergeProcessEnv(runtimeEnv, options.images?.env),
    scope: {
      project: options.workspace.appId,
      workspaceId: options.workspace.workspaceId,
      agentId: logicalAgentId,
    },
    allowEnvCredentials: options.images?.allowEnvCredentials,
    openaiBaseUrl: options.images?.openaiBaseUrl,
    filesystem,
    storage: storageStore,
    brokerHttp: (input) => brokerSecretHttp(processHost, input, { env: secretsEnv }),
  });
  const libraryStore = createLocalLibraryStore({
    rootDir: options.library?.rootDir,
    env: options.library?.env ?? runtimeEnv,
    filesystem,
  });
  const rulesStore = createLocalRulesStore({
    rootDir: options.rules?.rootDir,
    env: options.rules?.env ?? runtimeEnv,
    filesystem,
  });
  const soulStore = createSoulStore({
    workspaceDir,
    filesystem,
  });
  // Skills-v2: unified central store at ~/.claw/skills (or $CLAW_HOME).
  const skillsV2Store = createSkillsStore({
    homeDir: options.skills?.homeDir,
    env: options.skills?.env ?? runtimeEnv,
    filesystem,
  });
  const skillsV2SyncEngine = new SkillsSyncEngine({ store: skillsV2Store, filesystem });
  const skillsV2Importer = new SkillsImporter({ store: skillsV2Store, filesystem });
  // Auto-migrate any legacy state (souls.json / library / skills.json) on startup.
  // Idempotent via .skills-v2.migrated marker.
  try {
    migrateSkillsV2LegacyState({
      workspaceDir,
      store: skillsV2Store,
      filesystem,
      renderSoulMarkdown: (spec) => soulStore.renderMarkdown(spec),
    });
  } catch {
    // best-effort, do not block claw initialization
  }
  // Auto-import external skills directories (silent on missing dirs).
  if (options.skills?.autoImport !== false) {
    void skillsV2Importer.importExternal().catch(() => undefined);
  }
  const userStore = createUserStore({
    workspaceDir,
    filesystem,
  });
  const eventBus = new ClawEventBus();
  const runtimeOptions: RuntimeAdapterOptions = {
    adapter: adapter.id,
    binaryPath: options.runtime.binaryPath,
    agentId: runtimeAgentId,
    agentDir: options.runtime.agentDir,
    provider: options.runtime.provider,
    model: options.runtime.model,
    wire: options.runtime.wire,
    baseUrl: options.runtime.baseUrl,
    secretRef: options.runtime.secretRef,
    envKey: options.runtime.envKey,
    headers: options.runtime.headers,
    permissionMode: options.runtime.permissionMode,
    homeDir: options.runtime.homeDir,
    configPath: options.runtime.configPath,
    workspacePath: options.runtime.workspacePath ?? workspaceDir,
    authStorePath: options.runtime.authStorePath,
    gateway: options.runtime.gateway,
    env: runtimeEnv,
  };
  const resolvedLocations = adapter.resolveLocations(runtimeOptions);
  const resolvedRuntimeOptions: RuntimeAdapterOptions = {
    ...runtimeOptions,
    homeDir: runtimeOptions.homeDir ?? resolvedLocations.homeDir,
    configPath: runtimeOptions.configPath ?? resolvedLocations.configPath,
    workspacePath: runtimeOptions.workspacePath ?? resolvedLocations.workspacePath,
    authStorePath: runtimeOptions.authStorePath ?? resolvedLocations.authStorePath,
    gateway: {
      ...options.runtime.gateway,
      configPath: options.runtime.gateway?.configPath ?? resolvedLocations.gatewayConfigPath,
    },
  };
  const pluginBridgePolicy = resolveOpenClawPluginBridgePolicy(adapter.id, options.runtime.pluginBridge);
  const sessionAdapter = adapter.createSessionAdapter(resolvedRuntimeOptions);
  const runtimeContext = adapter.id === "openclaw"
    ? resolveOpenClawContext({
        agentId: runtimeAgentId,
        configPath: resolvedRuntimeOptions.gateway?.configPath ?? resolvedRuntimeOptions.configPath,
        stateDir: resolvedRuntimeOptions.homeDir,
        workspaceDir,
        agentDir: resolvedRuntimeOptions.agentDir,
        env: resolvedRuntimeOptions.env,
        ...(resolvedRuntimeOptions.gateway ?? {}),
      })
    : null;
  const telegram = createTelegramService({
    workspaceDir,
    dataStore,
    sessionStore,
    runner: processHost,
    env: secretsEnv,
    filesystem,
  });
  const slack = createSlackService({
    workspaceDir,
    dataStore,
    sessionStore,
    runner: processHost,
    env: secretsEnv,
    filesystem,
  });
  const whatsapp = createWhatsAppService({
    workspaceDir,
    dataStore,
    sessionStore,
    runner: processHost,
    env: secretsEnv,
    filesystem,
  });
  const channelsRegistry = createChannelsRegistry({
    workspaceDir,
    filesystem,
  });
  const sourceNotifyClient = options.notify?.baseUrl
    ? new NotifyClient({
      baseUrl: options.notify.baseUrl,
      token: options.notify.sourceToken,
    })
    : null;
  const clientNotifyClient = options.notify?.baseUrl
    ? new NotifyClient({
      baseUrl: options.notify.baseUrl,
      token: options.notify.clientToken,
    })
    : null;
  const embeddedTimeEngine = options.time?.baseUrl
    ? null
    : new EmbeddedTimeEngine({
        dbPath: options.time?.dbPath ?? defaultClawjsMainDbPath(),
        defaultTimeZone: options.time?.defaultTimeZone ?? "UTC",
        schedulerIntervalMs: options.time?.schedulerIntervalMs,
        notifyBaseUrl: options.time?.notifyBaseUrl,
        notifySourceToken: options.time?.notifySourceToken,
        heartbeatChecks: options.time?.heartbeatChecks,
        heartbeatAgent: options.time?.heartbeatAgent,
      });
  embeddedTimeEngine?.startScheduler();
  const timeClient: TimeServiceLike | null = options.time?.baseUrl
    ? new TimeClient({
        baseUrl: options.time.baseUrl,
        token: options.time.token,
      })
    : embeddedTimeEngine;
  const contentClient = options.content?.baseUrl
    ? new ContentClient({
        baseUrl: options.content.baseUrl,
        token: options.content.token,
      })
    : null;
  const iotClient = options.iot?.baseUrl
    ? new IotClient({
      baseUrl: options.iot.baseUrl,
      token: options.iot.token,
    })
    : null;

  function gatewayConfigOptions() {
    return {
      configPath: runtimeContext?.configPath ?? resolvedRuntimeOptions.gateway?.configPath ?? resolvedRuntimeOptions.configPath,
      env: resolvedRuntimeOptions.env,
      ...(resolvedRuntimeOptions.gateway ?? {}),
    };
  }

  function assertOpenClawGatewaySupport(): void {
    if (adapter.id !== "openclaw") {
      throw new Error(`runtime.gateway is only supported for the openclaw adapter, received ${adapter.id}`);
    }
  }

  function appendAuditEvent(event: string, capability: Parameters<WorkspaceAuditLog["append"]>[1]["capability"], detail?: Record<string, unknown>) {
    audit.append(workspaceDir, {
      timestamp: new Date().toISOString(),
      event,
      capability,
      detail,
    });
  }

  function requireNotifyClient(kind: "source" | "client"): NotifyClient {
    const client = kind === "source" ? sourceNotifyClient : clientNotifyClient;
    if (!client) {
      throw new Error(`notify ${kind} client is not configured. Set CreateClawOptions.notify with baseUrl and the required token.`);
    }
    return client;
  }

  function requireTimeClient(): TimeServiceLike {
    if (!timeClient) {
      throw new Error("time client is not configured.");
    }
    return timeClient;
  }

  function requireContentClient(): ContentClient {
    if (!contentClient) {
      throw new Error("content client is not configured. Set CreateClawOptions.content with baseUrl.");
    }
    return contentClient;
  }

  function requireIotClient(): IotClient {
    if (!iotClient) {
      throw new Error("iot client is not configured. Set CreateClawOptions.iot with baseUrl.");
    }
    return iotClient;
  }

  const {
    listWorkspaceSkillPaths,
    diffWorkspaceSkillPaths,
    readSkillSources,
    resolveReadySkillSource,
    searchSkillCatalog,
    installSkillFromSource,
    readProviderAuth,
    readDefaultModel,
    readProviderCatalog,
    resolveRequestedAuthProvider,
    prepareAuthLogin,
    readModelCatalog,
    readAuthState,
    readSchedulers,
    readMemory,
    readSkills,
    readChannels,
  } = createClawSkillProviderHelpers({
    workspaceDir,
    processHost,
    resolvedRuntimeOptions,
    adapter,
    telegram,
    slack,
    whatsapp,
    channelsRegistry,
    filesystem,
    persistSkillsState,
    appendAuditEvent,
    eventBus,
    patchSkillIntentEntry,
    readTelegramStateSnapshot,
    readSlackStateSnapshot,
    readWhatsAppStateSnapshot,
    listSkillSources,
    getSkillSource,
    normalizeInstallRef,
    resolveSkillSourceFromRef,
  });

  const {
    searchSessionsLocally,
    mediaKindFromMime,
    mediaKindFromTelegram,
    mediaKindFromChannel,
    parseMediaStorageUrl,
    readDocumentIndexText,
    registerDocumentMedia,
    registerGeneratedMedia,
    registerImageMedia,
    registerVoiceNoteMedia,
    registerOutboundChannelMedia,
    registerInboundTelegramMedia,
    prepareMessageDocuments,
    sanitizeSessionPart,
    hashSessionPart,
    resolveChannelSessionKey,
    resolveChannelSessionId,
    resolveChannelMessageId,
    appendChannelSessionMessage,
    backfillChannelSession,
    resolveSessionDocumentAssets,
    searchDocumentsLocally,
    searchDocumentsWithOpenClawMemory,
    searchDocuments,
    searchSessionsWithOpenClawMemory,
    searchSessions,
  } = createClawMediaSessionHelpers({
    sessionStore,
    mediaStore,
    documentStore,
    workspaceDir,
    options,
    logicalAgentId,
    runtimeAgentId,
    processHost,
    resolvedRuntimeOptions,
    adapter,
    channelsRegistry,
    extractSessionIdFromSourcePath,
    extractDocumentIdFromSourcePath,
    runOpenClawMemorySearch,
  });

  const {
    registerGenerationBackend,
    removeGenerationBackend,
    createGenerationRecord,
    removeGenerationRecord,
    createTypedGenerationFacade,
    mapGenerationToImageRecord,
    isNativeImageBackend,
    shouldUseNativeImageBackend,
    imageBackends,
    importGenerationRecord,
    createImageRecord,
    editImageRecord,
    listImageRecords,
    getImageRecord,
    removeImageRecord,
  } = createClawGenerationImageHelpers({
    generationStore,
    imageStore,
    options,
    logicalAgentId,
    appendAuditEvent,
    eventBus,
    registerGeneratedMedia,
    registerImageMedia,
  });

  function persistWorkspaceState(validation: ReturnType<typeof validateWorkspace>) {
    return writeWorkspaceStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      appId: options.workspace.appId,
      workspaceId: options.workspace.workspaceId,
      agentId: options.workspace.agentId,
      rootDir: workspaceDir,
      manifestPresent: !!validation.manifest,
      missingFiles: validation.missingFiles,
      missingDirectories: validation.missingDirectories,
      ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
      ...(logicalAgentId ? { logicalAgentId } : {}),
      ...(runtimeAgentId ? { runtimeAgentId } : {}),
      ...(typeof options.workspace.materializationVersion === "number"
        ? { materializationVersion: options.workspace.materializationVersion }
        : {}),
    }, filesystem);
  }

  function persistProviderState(providers: Record<string, ProviderAuthSummary>, missingProvidersInUse: string[] = []) {
    return writeProviderStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      providers,
      ...(missingProvidersInUse.length > 0 ? { missingProvidersInUse } : {}),
    }, filesystem);
  }

  function persistSchedulerState(schedulers: SchedulerDescriptor[]) {
    return writeSchedulerStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      schedulers,
    }, filesystem);
  }

  function persistMemoryState(memory: MemoryDescriptor[]) {
    return writeMemoryStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      memory,
    }, filesystem);
  }

  function persistSkillsState(skills: SkillDescriptor[]) {
    return writeSkillsStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      skills,
    }, filesystem);
  }

  function persistChannelsState(channels: ChannelDescriptor[]) {
    const current = readChannelsStateSnapshot(workspaceDir, filesystem);
    return writeChannelsStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      channels,
      ...(current?.accounts ? { accounts: current.accounts } : {}),
      ...(current?.targets ? { targets: current.targets } : {}),
      ...(current?.messages ? { messages: current.messages } : {}),
      ...(current?.bindings ? { bindings: current.bindings } : {}),
      ...(current?.processors ? { processors: current.processors } : {}),
      ...(current?.listeners ? { listeners: current.listeners } : {}),
      ...(current?.events ? { events: current.events } : {}),
      ...(current?.details ? { details: current.details } : {}),
    }, filesystem);
  }

  function patchTelegramChannelIntent(
    patch: {
      enabled?: boolean;
      secretRef?: string;
      config?: Record<string, unknown>;
    },
  ) {
    const current = readIntent("channels") as {
      channels?: Record<string, {
        enabled?: boolean;
        secretRef?: string;
        config?: Record<string, unknown>;
      }>;
    };
    const existingChannels = current.channels ?? {};
    const existingTelegram = existingChannels.telegram ?? {};
    const existingConfig = existingTelegram.config ?? {};
    return patchIntent("channels", {
      channels: {
        ...existingChannels,
        telegram: {
          ...existingTelegram,
          ...patch,
          config: {
            ...existingConfig,
            ...(patch.config ?? {}),
          },
        },
      },
    });
  }

  function recordTelegramStatusInChannels(
    status: TelegramStatusResult,
    input?: {
      accountId?: string;
      label?: string;
      secretName?: string;
    },
  ) {
    const secretName = input?.secretName ?? status.secretName;
    if (!secretName) {
      return null;
    }
    const channelStatus = status.channel.status;
    const account = channelsRegistry.accounts.registerTelegramBot({
      accountId: input?.accountId,
      label: input?.label,
      secretName,
      status: channelStatus,
      botProfile: status.botProfile ?? null,
      transport: status.transport,
      metadata: {
        apiBaseUrl: status.apiBaseUrl,
        commands: status.commands.length,
        recentErrors: status.recentErrors,
      },
    });
    for (const chat of status.knownChats) {
      channelsRegistry.targets.register({
        provider: "telegram",
        accountId: account.accountId,
        targetId: chat.id,
        kind: chat.type === "private" ? "dm" : chat.type,
        label: chat.title ?? chat.username ?? chat.firstName ?? chat.id,
        title: chat.title,
        username: chat.username,
        lastSeenAt: chat.lastSeenAt,
        metadata: {
          isForum: chat.isForum,
          inviteLink: chat.inviteLink,
        },
      });
    }
    return account;
  }

  function patchSkillIntentEntry(entry: {
    id: string;
    enabled: boolean;
    installRef?: string;
    source?: string;
    label?: string;
  }) {
    const current = readIntent("skills") as {
      skills?: Array<Record<string, unknown>>;
    };
    const existing = Array.isArray(current.skills) ? current.skills : [];
    return patchIntent("skills", {
      skills: [
        ...existing.filter((skill) => skill.id !== entry.id),
        entry,
      ],
    });
  }

  function copyLibrarySkillPath(asset: LibraryAsset): string | null {
    const sourcePath = asset.source?.path?.trim();
    if (!sourcePath) return null;
    const absoluteSource = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(libraryStore.rootDir, sourcePath);
    if (!fs.existsSync(absoluteSource)) {
      throw new Error(`Library skill source path does not exist for ${asset.id}.`);
    }

    const targetDir = path.join(workspaceDir, "skills", asset.id);
    filesystem.ensureDir(targetDir);
    const stat = fs.statSync(absoluteSource);
    if (stat.isDirectory()) {
      fs.cpSync(absoluteSource, targetDir, { recursive: true, force: true });
      return targetDir;
    }

    const targetPath = path.join(targetDir, path.basename(absoluteSource));
    fs.copyFileSync(absoluteSource, targetPath);
    return targetDir;
  }

  async function materializeLibrarySkill(asset: LibraryAsset): Promise<SkillDescriptor[]> {
    const copiedPath = copyLibrarySkillPath(asset);
    if (!copiedPath && asset.source?.installRef) {
      await installSkillFromSource(asset.source.installRef, { source: asset.source.source });
    }

    patchSkillIntentEntry({
      id: asset.id,
      enabled: true,
      installRef: asset.source?.installRef ?? asset.id,
      source: asset.source?.source ?? (copiedPath ? "library" : undefined),
      label: asset.title,
    });
    const skills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
    persistSkillsState(skills);
    appendAuditEvent("library.skill_synced", "skills", { id: asset.id, runtimeAdapter: adapter.id });
    eventBus.emit("library.skill_synced", { id: asset.id, runtimeAdapter: adapter.id });
    return skills;
  }

  function materializeLibraryInstruction(asset: LibraryAsset): LibrarySyncResult["writtenInstructionBlocks"][number] | null {
    if (asset.kind !== "instruction") return null;
    const projection = asset.projection ?? { target: "agents" as const };
    const targetFile = libraryProjectionTargetFile(projection.target);
    const blockId = projection.blockId ?? `library-${normalizeLibraryId(asset.id)}`;
    const content = libraryStore.readContent(asset) ?? "";
    const before = readWorkspaceFile(workspaceDir, targetFile, filesystem) ?? "";
    const after = applyTextMutation({
      originalContent: before,
      mode: "managed_block",
      blockId,
      content,
    });
    const result = writeWorkspaceFile(workspaceDir, targetFile, after, filesystem);
    appendAuditEvent("library.instruction_synced", "files", { id: asset.id, targetFile, blockId, changed: result.changed });
    eventBus.emit("library.instruction_synced", { id: asset.id, targetFile, blockId, changed: result.changed });
    return {
      assetId: asset.id,
      targetFile,
      blockId,
      changed: result.changed,
    };
  }

  async function syncLibraryAssets(input: LibraryResolveInput & { allowMissingSecrets?: boolean } = {}): Promise<LibrarySyncResult> {
    const resolved = libraryStore.resolve({
      agentId: input.agentId ?? logicalAgentId,
      workspaceId: input.workspaceId ?? options.workspace.workspaceId,
      tags: input.tags,
      availableSecrets: input.availableSecrets,
    });
    if (resolved.missingSecrets.length > 0 && !input.allowMissingSecrets) {
      const missing = resolved.missingSecrets.map((secret) => `${secret.assetId}:${secret.name}`).join(", ");
      throw new Error(`Missing required library secrets: ${missing}`);
    }

    let syncedSkills: SkillDescriptor[] = [];
    const writtenInstructionBlocks: LibrarySyncResult["writtenInstructionBlocks"] = [];
    for (const asset of resolved.assets) {
      if (asset.kind === "skill") {
        syncedSkills = await materializeLibrarySkill(asset);
      }
      if (asset.kind === "instruction") {
        const written = materializeLibraryInstruction(asset);
        if (written) writtenInstructionBlocks.push(written);
      }
    }

    if (syncedSkills.length === 0) {
      syncedSkills = await readSkills();
      persistSkillsState(syncedSkills);
    }

    return {
      resolved,
      syncedSkills,
      writtenInstructionBlocks,
    };
  }

  function patchManagedPluginIntent(target: OpenClawManagedPluginTarget, enabled: boolean) {
    const current = readIntent("plugins") as {
      plugins?: Record<string, Record<string, unknown>>;
    };
    const existingPlugins = current.plugins ?? {};
    const ids = target === "context"
      ? ["clawjs-context"]
      : target === "all"
        ? ["clawjs", "clawjs-context"]
        : ["clawjs"];
    const nextPlugins = { ...existingPlugins };
    for (const pluginId of ids) {
      nextPlugins[pluginId] = {
        ...(nextPlugins[pluginId] ?? {}),
        enabled,
      };
    }
    return patchIntent("plugins", { plugins: nextPlugins });
  }

  function patchProviderIntent(
    provider: string,
    patch: {
      enabled?: boolean;
      preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
      secretRef?: string | null;
      profileId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    const current = readIntent("providers") as {
      providers?: Record<string, {
        enabled?: boolean;
        preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
        secretRef?: string | null;
        profileId?: string | null;
        metadata?: Record<string, unknown>;
      }>;
    };
    const existingProviders = current.providers ?? {};
    const existingProvider = existingProviders[provider] ?? {};
    return patchIntent("providers", {
      providers: {
        ...existingProviders,
        [provider]: {
          ...existingProvider,
          ...patch,
          ...(patch.metadata
            ? {
              metadata: {
                ...(existingProvider.metadata ?? {}),
                ...patch.metadata,
              },
            }
            : {}),
        },
      },
    });
  }

  function readSpeechConfig(): TtsProviderConfig {
    const current = readIntent("speech") as {
      tts?: TtsProviderConfig | null;
    };
    return normalizeTtsConfig(current.tts);
  }

  function writeSpeechConfig(input?: TtsProviderConfig | null): TtsProviderConfig {
    const normalized = normalizeTtsConfig(input);
    patchIntent("speech", { tts: normalized });
    return normalized;
  }

  function readSttConfig(): SttProviderConfig {
    const current = readIntent("speech") as {
      stt?: SttProviderConfig | null;
    };
    return normalizeSttConfig(current.stt);
  }

  function writeSttConfig(input?: SttProviderConfig | null): SttProviderConfig {
    const normalized = normalizeSttConfig(input);
    patchIntent("speech", { stt: normalized });
    return normalized;
  }

  function resolveSttInput(input: SttTranscribeInput): SttTranscribeInput {
    const defaults = readSttConfig();
    return {
      ...input,
      provider: "local-whisper",
      binaryPath: input.binaryPath ?? defaults.binaryPath,
      ffmpegPath: input.ffmpegPath ?? defaults.ffmpegPath,
      modelPath: input.modelPath ?? defaults.modelPath,
      language: input.language ?? defaults.language,
      translate: input.translate ?? defaults.translate,
      threads: input.threads ?? defaults.threads,
    };
  }

  function resolveTtsInput(input: TtsSynthesizeInput): TtsSynthesizeInput {
    const defaults = readSpeechConfig();
    return {
      ...input,
      provider: input.provider ?? defaults.provider,
      apiKey: input.apiKey ?? defaults.apiKey,
      voice: input.voice ?? defaults.voice,
      model: input.model ?? defaults.model,
      speed: input.speed ?? defaults.speed,
      stability: input.stability ?? defaults.stability,
      similarityBoost: input.similarityBoost ?? defaults.similarityBoost,
    };
  }

  async function refreshChannelSnapshots() {
    persistChannelsState(await readChannels());
  }

  async function ensureWorkspaceInitialized(): Promise<void> {
    initializeWorkspace(options.workspace, adapter.id, filesystem, options.templates?.pack, adapter.workspaceFiles);
    persistWorkspaceState(validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles));
    appendAuditEvent("workspace.initialized", "workspace", {
      workspaceId: options.workspace.workspaceId,
      runtimeAdapter: adapter.id,
    });
    eventBus.emit("workspace.initialized", {
      workspaceId: options.workspace.workspaceId,
      rootDir: workspaceDir,
      runtimeAdapter: adapter.id,
    });
  }

  function handleRuntimeProgress(onProgress?: RuntimeProgressSink): RuntimeProgressSink {
    return (event: RuntimeProgressEvent) => {
      appendAuditEvent("runtime.progress", event.capability, {
        operation: event.operation,
        phase: event.phase,
        status: event.status,
        percent: event.percent,
      });
      eventBus.emit("runtime.progress", event);
      onProgress?.(event);
    };
  }

  function emitAuthProgress(
    phase: string,
    status: "start" | "complete" | "error",
    provider: string,
    detail?: Record<string, unknown>,
  ): void {
    const payload = {
      phase,
      status,
      provider,
      timestamp: new Date().toISOString(),
      ...(detail ?? {}),
    };
    appendAuditEvent("auth.progress", "auth", payload);
    eventBus.emit("auth.progress", payload);
  }

  function emitAuthLoginProgress(
    event: AuthLoginProgressEvent,
    onProgress?: (event: AuthLoginProgressEvent) => void,
  ): void {
    emitAuthProgress(event.phase, event.status, event.provider, {
      ...(event.step ? { step: event.step } : {}),
      ...(event.result ? { result: event.result } : {}),
      ...(event.launchMode ? { launchMode: event.launchMode } : {}),
      ...(typeof event.pid === "number" ? { pid: event.pid } : {}),
      ...(event.command ? { command: event.command } : {}),
      ...(event.args ? { args: event.args } : {}),
      ...(event.message ? { message: event.message } : {}),
      ...(event.error ? { error: event.error } : {}),
    });
    onProgress?.(event);
  }

  function openClawContextDefaults() {
    return {
      agentId: runtimeAgentId,
      configPath: resolvedRuntimeOptions.gateway?.configPath ?? resolvedRuntimeOptions.configPath,
      stateDir: resolvedRuntimeOptions.homeDir,
      workspaceDir,
      agentDir: resolvedRuntimeOptions.agentDir,
      sessionsDir: runtimeContext?.sessionsDir,
      env: resolvedRuntimeOptions.env,
      ...(resolvedRuntimeOptions.gateway ?? {}),
    };
  }

  function assertOpenClawPluginBridgeSupport(): void {
    if (adapter.id !== "openclaw") {
      throw new Error(`runtime.plugins is only supported for the openclaw adapter, received ${adapter.id}`);
    }
  }

  async function pluginBridgeStatus() {
    return getOpenClawPluginBridgeStatus(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
  }

  async function augmentRuntimeStatusWithPluginBridge(status: RuntimeProbeStatus): Promise<RuntimeProbeStatus> {
    if (adapter.id !== "openclaw") return status;

    const bridgeStatus = await pluginBridgeStatus();
    const pluginDiagnostics = [...bridgeStatus.diagnostics];

    if (!bridgeStatus.supported) {
      return {
        ...status,
        capabilityMap: {
          ...status.capabilityMap,
          plugins: {
            supported: false,
            status: "unsupported",
            strategy: "unsupported",
            diagnostics: {
              mode: bridgeStatus.mode,
              diagnostics: pluginDiagnostics,
            },
          },
        },
      };
    }

    let pluginCapabilityStatus: RuntimeCapabilitySupport["status"] = bridgeStatus.basePlugin.loaded ? "ready" : "degraded";
    if (pluginBridgePolicy.mode === "off") {
      pluginCapabilityStatus = bridgeStatus.basePlugin.loaded ? "ready" : "detected";
    } else if (pluginBridgePolicy.mode === "detect-only") {
      pluginCapabilityStatus = bridgeStatus.basePlugin.loaded ? "ready" : "degraded";
    } else if (!bridgeStatus.basePlugin.installed || !bridgeStatus.basePlugin.enabled) {
      pluginCapabilityStatus = "degraded";
    }

    return {
      ...status,
      capabilityMap: {
        ...status.capabilityMap,
        plugins: {
          supported: true,
          status: pluginCapabilityStatus,
          strategy: "native",
          diagnostics: {
            mode: bridgeStatus.mode,
            bridgePackage: bridgeStatus.basePlugin.packageSpec,
            basePluginInstalled: bridgeStatus.basePlugin.installed,
            basePluginEnabled: bridgeStatus.basePlugin.enabled,
            basePluginLoaded: bridgeStatus.basePlugin.loaded,
            contextPluginInstalled: bridgeStatus.contextPlugin.installed,
            contextPluginEnabled: bridgeStatus.contextPlugin.enabled,
            contextSelected: bridgeStatus.contextPlugin.selected,
            contextEngineId: bridgeStatus.contextPlugin.selectedEngineId,
            diagnostics: pluginDiagnostics,
          },
        },
      },
    };
  }

  async function ensureManagedPluginBridgeIfNeeded() {
    if (pluginBridgePolicy.mode !== "managed") return null;
    return ensureOpenClawPluginBridge(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
  }

  async function callManagedClawJsBridge(method: string, params: Record<string, unknown> = {}, callOptions: { timeoutMs?: number } = {}) {
    assertOpenClawPluginBridgeSupport();
    if (pluginBridgePolicy.mode === "managed") {
      await ensureManagedPluginBridgeIfNeeded();
    }
    return callOpenClawGateway(method, params, {
      runner: processHost,
      ...gatewayConfigOptions(),
      ...callOptions,
    });
  }

  function describeFeatures(): RuntimeFeatureDescriptor[] {
    return adapter.describeFeatures(resolvedRuntimeOptions);
  }

  function defaultSessionPolicy(): SessionPolicy {
    return describeFeatures().find((feature) => feature.featureId === "sessions")?.sessionPolicy ?? "managed";
  }

  function featureForDomain(domain: IntentDomain): RuntimeFeatureDescriptor {
    return describeFeatures().find((feature) => feature.featureId === domain) ?? {
      featureId: domain,
      ownership: "mirrored",
      supported: false,
    };
  }

  function defaultIntentState(domain: IntentDomain): Record<string, unknown> {
    switch (domain) {
      case "runtime":
        return {
          adapter: adapter.id,
          locations: resolvedLocations,
        };
      case "models":
        return {
          defaultModel: null,
          logicalDefaults: {},
        };
      case "providers":
        return { providers: {} };
      case "channels":
        return { channels: {} };
      case "skills":
        return { skills: [] };
      case "plugins":
        return { plugins: {}, slots: {} };
      case "files":
        return { values: {} };
      case "sessions":
        return { policy: defaultSessionPolicy() };
      case "speech":
        return { tts: {}, stt: {} };
    }
  }

  function readIntent(domain?: IntentDomain): unknown {
    if (!domain) {
      return readAllIntentDomains(workspaceDir, filesystem);
    }
    return readIntentDomain(workspaceDir, domain, filesystem) ?? {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      ...defaultIntentState(domain),
    };
  }

  function writeIntent(domain: IntentDomain, value: Record<string, unknown>): unknown {
    return writeIntentDomain(workspaceDir, domain, {
      ...value,
    }, filesystem);
  }

  function patchIntent(domain: IntentDomain, value: Record<string, unknown>): unknown {
    return patchIntentDomain(workspaceDir, domain, value, defaultIntentState(domain), filesystem);
  }

  async function refreshObservedDomain(domain: ObservedDomain): Promise<unknown> {
    switch (domain) {
      case "runtime": {
        const status = await augmentRuntimeStatusWithPluginBridge(await adapter.getStatus(processHost, resolvedRuntimeOptions));
        return writeObservedDomain(workspaceDir, "runtime", {
          runtime: {
            ...status,
            diagnostics: status.diagnostics,
          },
        }, filesystem);
      }
      case "workspace": {
        const validation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        return persistWorkspaceState(validation);
      }
      case "models": {
        const catalog = await readModelCatalog();
        const defaultModel = await readDefaultModel();
        return writeObservedDomain(workspaceDir, "models", {
          catalog,
          defaultModel,
        }, filesystem);
      }
      case "providers": {
        const providers = await readProviderAuth();
        return persistProviderState(providers, []);
      }
      case "channels": {
        const channels = await readChannels();
        return persistChannelsState(channels);
      }
      case "skills": {
        const skills = await readSkills();
        return persistSkillsState(skills);
      }
      case "memory": {
        const memory = await readMemory();
        return persistMemoryState(memory);
      }
      case "scheduler": {
        const schedulers = await readSchedulers();
        return persistSchedulerState(schedulers);
      }
      case "plugins": {
        if (adapter.id === "openclaw") {
          const status = await pluginBridgeStatus();
          return writeObservedDomain(workspaceDir, "plugins", {
            plugins: {
              [status.basePlugin.id]: {
                installed: status.basePlugin.installed,
                enabled: status.basePlugin.enabled,
                loaded: status.basePlugin.loaded,
                status: status.basePlugin.status,
                version: status.basePlugin.version,
                error: status.basePlugin.error,
              },
              [status.contextPlugin.id]: {
                installed: status.contextPlugin.installed,
                enabled: status.contextPlugin.enabled,
                loaded: status.contextPlugin.loaded,
                status: status.contextPlugin.status,
                version: status.contextPlugin.version,
                error: status.contextPlugin.error,
              },
            },
            slots: {
              contextEngine: status.contextPlugin.selectedEngineId,
            },
            diagnostics: status.diagnostics,
          }, filesystem);
        }
        return writeObservedDomain(workspaceDir, "plugins", {
          plugins: {},
          slots: {},
          diagnostics: [],
        }, filesystem);
      }
      case "sessions": {
        return writeObservedDomain(workspaceDir, "sessions", {
          policy: defaultSessionPolicy(),
          sessionCount: sessionStore.listSessions().length,
          runtimePath: runtimeContext?.sessionsDir ?? null,
        }, filesystem);
      }
    }
  }

  async function refreshObserved(options: { domains?: ObservedDomain[] } = {}): Promise<Record<string, unknown>> {
    const domains = options.domains ?? ["runtime", "workspace", "models", "providers", "channels", "skills", "plugins", "memory", "scheduler", "sessions"];
    const result: Record<string, unknown> = {};
    for (const domain of domains) {
      result[domain] = await refreshObservedDomain(domain);
    }
    return result;
  }

  async function diffIntent(options: { domains?: IntentDomain[] } = {}) {
    const domains = options.domains ?? ["runtime", "models", "providers", "channels", "skills", "plugins", "files", "sessions", "speech"];
    const issues: Array<{ domain: IntentDomain; path: string; message: string; expected?: unknown; actual?: unknown }> = [];

    for (const domain of domains) {
      const intent = readIntent(domain) as Record<string, unknown>;
      switch (domain) {
        case "runtime": {
          const observed = readObservedDomain(workspaceDir, "runtime", filesystem) as { runtime?: { adapter?: string } } | null;
          const expected = intent.adapter;
          const actual = observed?.runtime?.adapter ?? adapter.id;
          if (expected && expected !== actual) {
            issues.push({ domain, path: "adapter", message: "Selected runtime adapter does not match observed runtime.", expected, actual });
          }
          break;
        }
        case "models": {
          const observed = readObservedDomain(workspaceDir, "models", filesystem) as { defaultModel?: { modelId?: string | null } | null } | null;
          const expected = intent.defaultModel ?? null;
          const actual = observed?.defaultModel?.modelId ?? null;
          if (expected !== actual) {
            issues.push({ domain, path: "defaultModel", message: "Default model intent differs from observed runtime model.", expected, actual });
          }
          break;
        }
        case "providers": {
          const observed = readProviderStateSnapshot(workspaceDir, filesystem);
          const providers = (intent.providers ?? {}) as Record<string, {
            enabled?: boolean;
            preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
            secretRef?: string | null;
            profileId?: string | null;
          }>;
          for (const [provider, config] of Object.entries(providers)) {
            const actual = observed?.providers?.[provider];
            if (config.enabled === false) {
              if (actual?.hasAuth) {
                issues.push({ domain, path: `providers.${provider}.enabled`, message: `Provider ${provider} is disabled in intent but still has observed auth.`, expected: false, actual: true });
              }
              continue;
            }
            if (!actual?.hasAuth) {
              issues.push({ domain, path: `providers.${provider}`, message: `Provider ${provider} is desired but has no observed auth.` });
            }
            if (config.preferredAuthMode && config.preferredAuthMode !== "secret_ref" && actual?.authType && config.preferredAuthMode !== actual.authType) {
              issues.push({
                domain,
                path: `providers.${provider}.preferredAuthMode`,
                message: `Provider ${provider} auth mode differs from observed auth mode.`,
                expected: config.preferredAuthMode,
                actual: actual.authType,
              });
            }
            if (config.secretRef && !actual?.hasAuth) {
              issues.push({
                domain,
                path: `providers.${provider}.secretRef`,
                message: `Provider ${provider} declares a secret reference but no observed auth has been materialized.`,
                expected: config.secretRef,
              });
            }
            if (config.profileId) {
              const diagnostics = adapter.diagnostics(provider, resolvedRuntimeOptions) as { profiles?: Array<{ profileId?: string }> };
              const actualProfileIds = Array.isArray(diagnostics.profiles)
                ? diagnostics.profiles
                  .map((entry) => entry.profileId)
                  .filter((entry): entry is string => typeof entry === "string")
                : [];
              if (actualProfileIds.length > 0 && !actualProfileIds.includes(config.profileId)) {
                issues.push({
                  domain,
                  path: `providers.${provider}.profileId`,
                  message: `Provider ${provider} expects profile ${config.profileId} but it is not present in runtime diagnostics.`,
                  expected: config.profileId,
                  actual: actualProfileIds,
                });
              }
            }
          }
          break;
        }
        case "channels": {
          const observed = readChannelsStateSnapshot(workspaceDir, filesystem);
          const channels = (intent.channels ?? {}) as Record<string, { enabled?: boolean }>;
          for (const [channelId, config] of Object.entries(channels)) {
            if (!config.enabled) continue;
            const channel = observed?.channels.find((entry) => entry.id === channelId);
            if (!channel || channel.status === "disconnected") {
              issues.push({ domain, path: `channels.${channelId}`, message: `Channel ${channelId} is enabled in intent but not connected/configured.` });
            }
          }
          break;
        }
        case "skills": {
          const observed = readSkillsStateSnapshot(workspaceDir, filesystem);
          const skills = Array.isArray(intent.skills) ? intent.skills as Array<{ id: string; enabled: boolean }> : [];
          for (const skill of skills.filter((entry) => entry.enabled)) {
            if (!observed?.skills.some((entry) => entry.id === skill.id)) {
              issues.push({ domain, path: `skills.${skill.id}`, message: `Skill ${skill.id} is desired but not observed.` });
            }
          }
          break;
        }
        case "plugins": {
          const observed = readObservedDomain(workspaceDir, "plugins", filesystem) as { plugins?: Record<string, { enabled?: boolean; installed?: boolean }> } | null;
          const plugins = (intent.plugins ?? {}) as Record<string, { enabled?: boolean }>;
          for (const [pluginId, config] of Object.entries(plugins)) {
            const actual = observed?.plugins?.[pluginId];
            if (config.enabled === true && (!actual?.installed || !actual.enabled)) {
              issues.push({ domain, path: `plugins.${pluginId}`, message: `Plugin ${pluginId} is enabled in intent but not active in observed state.` });
            }
            if (config.enabled === false && actual?.enabled) {
              issues.push({ domain, path: `plugins.${pluginId}`, message: `Plugin ${pluginId} is disabled in intent but still enabled in observed state.` });
            }
          }
          break;
        }
        case "sessions": {
          const observed = readObservedDomain(workspaceDir, "sessions", filesystem) as { policy?: SessionPolicy } | null;
          const expected = (intent.policy as SessionPolicy | undefined) ?? defaultSessionPolicy();
          const actual = observed?.policy ?? defaultSessionPolicy();
          if (expected !== actual) {
            issues.push({ domain, path: "policy", message: "Session policy differs from observed policy.", expected, actual });
          }
          break;
        }
        case "speech": {
          const actual = (intent.tts ?? {}) as TtsProviderConfig | null;
          const expected = normalizeTtsConfig(actual);
          if (JSON.stringify(actual ?? {}) !== JSON.stringify(expected)) {
            issues.push({
              domain,
              path: "tts",
              message: "Speech intent is not normalized.",
              expected,
              actual,
            });
          }
          break;
        }
        default:
          break;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      domains,
      drifted: issues.length > 0,
      issues,
    };
  }

  async function applyIntent(options: { domains?: IntentDomain[]; dryRun?: boolean } = {}) {
    const domains = options.domains ?? ["runtime", "models", "providers", "channels", "skills", "plugins", "files", "sessions", "speech"];
    const dryRun = options.dryRun === true;
    const actions: Array<{
      domain: IntentDomain;
      featureId: string;
      ownership: RuntimeFeatureDescriptor["ownership"];
      supported: boolean;
      status: "planned" | "applied" | "skipped" | "unsupported";
      message: string;
    }> = [];

    for (const domain of domains) {
      const feature = featureForDomain(domain);
      if (!feature.supported) {
        actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: false, status: "unsupported", message: `Feature ${domain} is unsupported for ${adapter.id}.` });
        continue;
      }

      const intent = readIntent(domain) as Record<string, unknown>;
      if (dryRun) {
        actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: true, status: "planned", message: `Planned apply for ${domain}.` });
        continue;
      }

      switch (domain) {
        case "runtime":
          patchIntent("runtime", {
            adapter: adapter.id,
            locations: resolvedLocations,
          });
          await refreshObservedDomain("runtime");
          break;
        case "models":
          if (typeof intent.defaultModel === "string" && intent.defaultModel.trim()) {
            await adapter.setDefaultModel(intent.defaultModel.trim(), processHost, resolvedRuntimeOptions);
          }
          await refreshObservedDomain("models");
          break;
        case "providers":
          for (const [provider, config] of Object.entries((intent.providers ?? {}) as Record<string, { enabled?: boolean }>)) {
            if (config.enabled === false) {
              adapter.removeProvider(provider, {
                ...resolvedRuntimeOptions,
              });
            }
          }
          await refreshObservedDomain("providers");
          break;
        case "channels": {
          const channels = (intent.channels ?? {}) as Record<string, { enabled?: boolean; secretRef?: string; config?: Record<string, unknown> }>;
          const telegramIntent = channels.telegram;
          if (telegramIntent?.enabled && telegramIntent.secretRef) {
            const config = telegramIntent.config ?? {};
            await telegram.connectBot({
              secretName: telegramIntent.secretRef,
              apiBaseUrl: typeof config.apiBaseUrl === "string" ? config.apiBaseUrl : undefined,
              webhookUrl: typeof config.webhookUrl === "string" ? config.webhookUrl : undefined,
              webhookSecretToken: typeof config.webhookSecretToken === "string" ? config.webhookSecretToken : undefined,
              allowedUpdates: Array.isArray(config.allowedUpdates) ? config.allowedUpdates.filter((value): value is string => typeof value === "string") : undefined,
              dropPendingUpdates: typeof config.dropPendingUpdates === "boolean" ? config.dropPendingUpdates : undefined,
            });
            if (Array.isArray(config.commands)) {
              await telegram.setCommands(config.commands as TelegramCommand[]);
            }
          }
          await refreshObservedDomain("channels");
          break;
        }
        case "skills": {
          const desired = Array.isArray(intent.skills) ? intent.skills as Array<{ id: string; enabled: boolean; installRef?: string; source?: string }> : [];
          const observed = readSkillsStateSnapshot(workspaceDir, filesystem);
          for (const skill of desired.filter((entry) => entry.enabled && entry.installRef && entry.source)) {
            if (!observed?.skills.some((entry) => entry.id === skill.id)) {
              await installSkillFromSource(skill.installRef!, { source: skill.source });
            }
          }
          await adapter.syncSkills(processHost, resolvedRuntimeOptions);
          await refreshObservedDomain("skills");
          break;
        }
        case "plugins":
          if (adapter.id === "openclaw") {
            const plugins = (intent.plugins ?? {}) as Record<string, { enabled?: boolean }>;
            const targets = Object.entries(plugins)
              .filter(([, config]) => config.enabled)
              .map(([pluginId]) => pluginId)
              .filter((pluginId): pluginId is "clawjs" | "clawjs-context" => pluginId === "clawjs" || pluginId === "clawjs-context");
            for (const target of targets) {
              await enableManagedOpenClawPlugins(target === "clawjs-context" ? "context" : "clawjs", processHost, resolvedRuntimeOptions, pluginBridgePolicy);
            }
            for (const [pluginId, config] of Object.entries(plugins)) {
              if (config.enabled !== false) continue;
              if (pluginId === "clawjs" || pluginId === "clawjs-context") {
                await disableManagedOpenClawPlugins(pluginId === "clawjs-context" ? "context" : "clawjs", processHost, resolvedRuntimeOptions, pluginBridgePolicy);
              }
            }
          }
          await refreshObservedDomain("plugins");
          break;
        case "files":
          break;
        case "sessions":
          await refreshObservedDomain("sessions");
          break;
        case "speech":
          writeSpeechConfig((intent.tts ?? {}) as TtsProviderConfig | null);
          writeSttConfig((intent.stt ?? {}) as SttProviderConfig | null);
          break;
      }

      actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: true, status: "applied", message: `Applied ${domain} intent.` });
    }

    return {
      appliedAt: new Date().toISOString(),
      domains,
      dryRun,
      actions,
    };
  }

  async function planIntent(options: { domains?: IntentDomain[]; dryRun?: boolean } = {}) {
    const diff = await diffIntent({ domains: options.domains });
    const domains = diff.domains;
    return {
      generatedAt: new Date().toISOString(),
      domains,
      dryRun: options.dryRun === true,
      actions: domains.map((domain) => {
        const feature = featureForDomain(domain);
        const relatedIssues = diff.issues.filter((issue) => issue.domain === domain);
        return {
          domain,
          featureId: feature.featureId,
          ownership: feature.ownership,
          supported: feature.supported,
          needsApply: relatedIssues.length > 0,
          message: relatedIssues[0]?.message ?? `No drift detected for ${domain}.`,
        };
      }),
    };
  }

  const {
    sleep,
    appendChannelListenerLog,
    applyChannelProcessorActions,
    extractTelegramVoiceMedia,
    extractTelegramLanguageHint,
    ingestTelegramVoiceNote,
    ensureTelegramCodexBridgeCommands,
    runChannelListener,
  } = createClawChannelRuntimeHelpers({
    invokeChannelProcessor,
    appendChannelSessionMessage,
    filesystem,
    channelsRegistry,
    registerInboundTelegramMedia,
    registerOutboundChannelMedia,
    transcribeAudio,
    resolveSttInput,
    voiceNoteStore,
    registerVoiceNoteMedia,
    sendTelegramAccountMessage,
    processHost,
    secretsEnv,
    syncTelegramAccount,
    refreshChannelSnapshots,
    eventBus,
    readSttConfig,
    callTelegramApi,
    downloadTelegramFile,
    telegram,
    setTelegramAccountCommands,
    TELEGRAM_CODEX_BRIDGE_COMMANDS,
  });

  function mergeRulesContextBlocks(input: {
    sessionMessages: Array<{ role: string; content: string }>;
    contextBlocks?: PromptContextBlock[];
    ruleHints?: Omit<RulesCompileInput, "prompt">;
  }): PromptContextBlock[] | undefined {
    const userPrompt = [...input.sessionMessages]
      .reverse()
      .find((message) => message.role === "user")?.content ?? "";
    const compiled = rulesStore.compile({
      ...(input.ruleHints ?? {}),
      prompt: userPrompt,
      agent: input.ruleHints?.agent ?? logicalAgentId,
      limit: input.ruleHints?.limit ?? 20,
    });
    if (!compiled.block) return input.contextBlocks;
    return [...(input.contextBlocks ?? []), compiled.block];
  }

  const temporalDefaults = () => ({
    workspaceId: options.workspace.workspaceId,
    agentId: logicalAgentId,
  });

  const calendarFacade: ClawInstance["calendar"] = {
    configured: Boolean(timeClient),
    list: async (filters = {}) => requireTimeClient().list({ ...filters, kind: "event" }),
    get: async (id) => requireTimeClient().get(id),
    create: async (input) => requireTimeClient().create({
      ...temporalDefaults(),
      ...input,
      kind: "event",
    }),
    update: async (id, input) => requireTimeClient().update(id, input),
    delete: async (id) => requireTimeClient().delete(id),
    at: async (input) => requireTimeClient().create({
      ...temporalDefaults(),
      ...input,
      kind: "event",
      natural: {
        command: "at",
        expression: input.expression,
        timezone: input.timezone,
      },
    }),
    view: async (input) => requireTimeClient().calendarView(input),
  };

  const routinesFacade: ClawInstance["routines"] = {
    configured: Boolean(timeClient),
    list: async (filters = {}) => requireTimeClient().list({ ...filters, kind: "routine" }),
    get: async (id) => requireTimeClient().get(id),
    create: async (input) => requireTimeClient().create({
      ...temporalDefaults(),
      ...input,
      kind: "routine",
    }),
    update: async (id, input) => requireTimeClient().update(id, input),
    delete: async (id) => requireTimeClient().delete(id),
    every: async (input) => requireTimeClient().create({
      ...temporalDefaults(),
      ...input,
      kind: "routine",
      natural: {
        command: "every",
        expression: input.expression,
        timezone: input.timezone,
      },
    }),
    enable: async (id) => requireTimeClient().resume(id),
    disable: async (id) => requireTimeClient().pause(id),
    run: async (id) => requireTimeClient().runNow(id),
    history: async (itemId) => requireTimeClient().listExecutions(itemId),
  };

  const temporalRemindersFacade: ClawInstance["reminders"] = {
    after: async (input) => requireTimeClient().create({
      ...temporalDefaults(),
      ...input,
      kind: "reminder",
      natural: {
        command: "after",
        expression: input.after,
        timezone: input.timezone,
        anchorType: input.anchorType ?? "standalone",
        anchorId: input.anchorId ?? "standalone",
        anchorAt: input.anchorAt ?? new Date().toISOString(),
      },
    }),
  };

  const watchFacade: Pick<ClawInstance["watch"], "configured" | "list" | "get" | "create" | "enable" | "disable" | "delete"> = {
    configured: Boolean(timeClient),
    list: async (filters = {}) => requireTimeClient().list({ ...filters, kind: "follow_up" }),
    get: async (id) => requireTimeClient().get(id),
    create: async (input) => {
      if (input.ifNo && input.ifNo !== "reply") {
        throw new Error(`Unsupported watch condition "if no ${input.ifNo}". Only "reply" is supported today.`);
      }
      const target = parseTemporalTarget(input.target);
      return requireTimeClient().create({
        ...temporalDefaults(),
        ...input,
        kind: "follow_up",
        title: resolveTemporalWatchTitle(input),
        natural: {
          command: "after",
          expression: input.ifNo === "reply" ? `${input.after} if no reply` : input.after,
          timezone: input.timezone,
          anchorType: input.anchorType ?? target.anchorType,
          anchorId: input.anchorId ?? target.anchorId,
          anchorAt: input.anchorAt ?? new Date().toISOString(),
        },
      });
    },
    enable: async (id) => requireTimeClient().resume(id),
    disable: async (id) => requireTimeClient().pause(id),
    delete: async (id) => requireTimeClient().delete(id),
  };

  function prepareContextPack(input: ContextPackPrepareInput): ContextPackRecord {
    const rules = rulesStore.compile({
      prompt: input.query,
      domain: input.domain,
      agent: logicalAgentId,
    });
    const session = input.sessionId ? sessionStore.getSession(input.sessionId) : null;
    const pack = contextStore.prepare({
      ...input,
      agentId: input.agentId ?? logicalAgentId,
      workspaceId: input.workspaceId ?? options.workspace.workspaceId,
    }, {
      rules: rules.included,
      learnings: learningStore.list({ status: "active" }),
      user: userStore.resolve({ agentId: logicalAgentId }),
      soul: soulStore.resolve({ agentId: logicalAgentId }),
      session,
    });
    appendAuditEvent("context.prepared", "context", {
      contextPackId: pack.id,
      purpose: pack.purpose,
      domain: pack.domain,
      itemCount: pack.items.length,
    });
    eventBus.emit("context.prepared", {
      contextPackId: pack.id,
      purpose: pack.purpose,
      domain: pack.domain,
      itemCount: pack.items.length,
    });
    return pack;
  }

  async function projectCommitmentReminder(commitment: CommitmentRecord): Promise<CommitmentRecord> {
    if (!commitment.remindAt || commitment.links.reminders.length > 0) return commitment;
    const reminder = await requireTimeClient().create({
      ...temporalDefaults(),
      kind: "reminder",
      title: commitment.claim,
      startsAt: commitment.remindAt,
      anchorType: "standalone",
      anchorId: commitment.id,
      sourceProvider: "commitments",
    });
    return commitmentStore.link(commitment.id, { reminder: reminder.item.id });
  }

  return {
    runtime: {
      context: () => runtimeContext,
      status: async () => {
        const baseStatus = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const status = await augmentRuntimeStatusWithPluginBridge(baseStatus);
        const telegramStatus = await telegram.status();
        const channelsSupport: RuntimeCapabilitySupport = telegramStatus.channel.status === "disconnected"
          ? status.capabilityMap.channels
          : {
            supported: true,
            status: telegramStatus.channel.status === "degraded" ? "degraded" : "ready",
            strategy: "bridge" as const,
            diagnostics: {
              provider: "telegram",
              mode: telegramStatus.transport.mode,
            },
          };
        return {
          ...status,
          capabilityMap: {
            ...status.capabilityMap,
            channels: channelsSupport,
          },
        };
      },
      gateway: {
        status: async () => {
          assertOpenClawGatewaySupport();
          return getOpenClawGatewayStatus(processHost, gatewayConfigOptions());
        },
        start: async () => {
          assertOpenClawGatewaySupport();
          await startOpenClawGateway(processHost, gatewayConfigOptions());
        },
        stop: async () => {
          assertOpenClawGatewaySupport();
          await stopOpenClawGateway(processHost, gatewayConfigOptions());
        },
        restart: async () => {
          assertOpenClawGatewaySupport();
          await restartOpenClawGateway(processHost, gatewayConfigOptions());
        },
        waitUntilReady: async (waitOptions = {}) => {
          assertOpenClawGatewaySupport();
          return waitForOpenClawGateway(processHost, {
            runner: processHost,
            ...gatewayConfigOptions(),
            ...waitOptions,
          });
        },
        call: async (method, params = {}, callOptions = {}) => {
          assertOpenClawGatewaySupport();
          return callOpenClawGateway(method, params, {
            runner: processHost,
            ...gatewayConfigOptions(),
            ...callOptions,
          });
        },
      },
      plugins: {
        status: async () => pluginBridgeStatus(),
        list: async () => {
          assertOpenClawPluginBridgeSupport();
          return listOpenClawPlugins(processHost, resolvedRuntimeOptions);
        },
        doctor: async () => {
          assertOpenClawPluginBridgeSupport();
          return doctorOpenClawPlugins(processHost, resolvedRuntimeOptions);
        },
        install: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await installManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        enable: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await enableManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        disable: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, false);
          const result = await disableManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        update: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await updateManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        ensure: async () => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent("all", true);
          const result = await ensureOpenClawPluginBridge(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        claw: {
          status: async () => callManagedClawJsBridge("clawjs.status"),
          events: {
            list: async (input = {}) => callManagedClawJsBridge("clawjs.events.list", input),
          },
    sessions: {
            inspect: async (input) => callManagedClawJsBridge("clawjs.sessions.inspect", input),
          },
          subagent: {
            run: async (input) => callManagedClawJsBridge("clawjs.subagent.run", input),
            wait: async (input) => callManagedClawJsBridge("clawjs.subagent.wait", input),
            messages: async (input) => callManagedClawJsBridge("clawjs.subagent.messages", input),
          },
          hooks: {
            status: async () => callManagedClawJsBridge("clawjs.hooks.status"),
            list: async () => {
              assertOpenClawPluginBridgeSupport();
              return listOpenClawHooks(processHost, resolvedRuntimeOptions);
            },
          },
          context: {
            status: async () => callManagedClawJsBridge("clawjs.context.status"),
          },
          doctor: async () => callManagedClawJsBridge("clawjs.doctor"),
        },
        get clawjs() {
          return this.claw;
        },
      },
      openclaw: {
        sessions: {
          list: async (input = {}) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("sessions.list", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          preview: async (input = {}) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("sessions.preview", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          resolve: async (input = {}) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("sessions.resolve", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
        },
        chat: {
          history: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.history", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          send: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.send", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          inject: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.inject", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
          abort: async (input) => {
            assertOpenClawGatewaySupport();
            return callOpenClawGateway("chat.abort", input, {
              runner: processHost,
              ...gatewayConfigOptions(),
            });
          },
        },
      },
      install: async (installer = "npm", onProgress) => {
        await adapter.install(processHost, installer, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.installed", "runtime", { installer, runtimeAdapter: adapter.id });
        eventBus.emit("runtime.installed", { installer, runtimeAdapter: adapter.id });
      },
      uninstall: async (installer = "npm", onProgress) => {
        await adapter.uninstall(processHost, installer, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.uninstalled", "runtime", { installer, runtimeAdapter: adapter.id });
        eventBus.emit("runtime.uninstalled", { installer, runtimeAdapter: adapter.id });
      },
      repair: async (onProgress) => {
        await adapter.repair(processHost, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.repaired", "runtime", { runtimeAdapter: adapter.id });
        eventBus.emit("runtime.repaired", { runtimeAdapter: adapter.id });
      },
      setupWorkspace: async (onProgress) => {
        await adapter.setupWorkspace({
          agentId: runtimeAgentId,
          workspaceDir,
        }, processHost, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.workspace_setup", "runtime", {
          agentId: runtimeAgentId,
          workspaceDir,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("runtime.workspace_setup", {
          agentId: runtimeAgentId,
          workspaceDir,
          runtimeAdapter: adapter.id,
        });
      },
      installCommand: (installer = "npm") => adapter.buildInstallCommand(installer),
      uninstallCommand: (installer = "npm") => adapter.buildUninstallCommand(installer),
      repairCommand: () => adapter.buildRepairCommand(),
      setupWorkspaceCommand: () => adapter.buildWorkspaceSetupCommand({
        agentId: runtimeAgentId,
        workspaceDir,
      }),
      installPlan: (installer = "npm") => adapter.buildProgressPlan("install", undefined, installer),
      uninstallPlan: (installer = "npm") => adapter.buildProgressPlan("uninstall", undefined, installer),
      repairPlan: () => adapter.buildProgressPlan("repair"),
      setupWorkspacePlan: () => adapter.buildProgressPlan("setup", {
        agentId: runtimeAgentId,
        workspaceDir,
      }),
      discoverContext: (discoverOptions = {}) => adapter.id === "openclaw"
        ? discoverOpenClawAppContext({
          ...openClawContextDefaults(),
          ...discoverOptions,
        })
        : null,
      detachWorkspace: async (detachOptions = {}) => adapter.id === "openclaw"
        ? detachOpenClawAppContext({
          ...openClawContextDefaults(),
          ...detachOptions,
        })
        : null,
    },
    workspace: {
      init: async () => {
        await ensureWorkspaceInitialized();
      },
      attach: async () => attachWorkspace(workspaceDir, filesystem),
      validate: async () => {
        const validation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        persistWorkspaceState(validation);
        return validation;
      },
      repair: async () => {
        const repaired = repairWorkspace(options.workspace, adapter.id, filesystem, options.templates?.pack, adapter.workspaceFiles);
        persistWorkspaceState(validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles));
        appendAuditEvent("workspace.repaired", "workspace", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotMigrated: repaired.compatSnapshotMigrated,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.repaired", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotMigrated: repaired.compatSnapshotMigrated,
          runtimeAdapter: adapter.id,
        });
        return repaired;
      },
      previewReset: async (resetOptions) => buildWorkspaceResetPlan(workspaceDir, resetOptions, filesystem, adapter.workspaceFiles),
      reset: async (resetOptions) => {
        const result = resetWorkspace(workspaceDir, resetOptions, filesystem, adapter.workspaceFiles);
        appendAuditEvent("workspace.reset", "workspace", {
          ...result.options,
          removedPaths: result.removedPaths.length,
          preservedPaths: result.preservedPaths.length,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.reset", {
          workspaceId: options.workspace.workspaceId,
          ...result.options,
          removedPaths: result.removedPaths.length,
          preservedPaths: result.preservedPaths.length,
          runtimeAdapter: adapter.id,
        });
        return result;
      },
      listManagedFiles: async () => listManagedFiles(workspaceDir, adapter.workspaceFiles),
      canonicalPaths: () => buildCanonicalPathMap(workspaceDir, adapter.workspaceFiles),
      inspect: async () => ({
        manifestPath: resolveManifestPath(workspaceDir),
        compatSnapshotPath: resolveCompatSnapshotPath(workspaceDir),
        capabilityReportPath: resolveCapabilityReportPath(workspaceDir),
        bindingsPath: resolveBindingsPath(workspaceDir),
        settingsSchemaPath: resolveSettingsSchemaPath(workspaceDir),
        settingsValuesPath: resolveSettingsValuesPath(workspaceDir),
        workspaceStatePath: resolveWorkspaceStatePath(workspaceDir),
        providerStatePath: resolveProviderStatePath(workspaceDir),
        schedulerStatePath: resolveSchedulerStatePath(workspaceDir),
        memoryStatePath: resolveMemoryStatePath(workspaceDir),
        skillsStatePath: resolveSkillsStatePath(workspaceDir),
        channelsStatePath: resolveChannelsStatePath(workspaceDir),
        telegramStatePath: resolveTelegramStatePath(workspaceDir),
        intentPaths: {
          runtime: resolveIntentDomainPath(workspaceDir, "runtime"),
          models: resolveIntentDomainPath(workspaceDir, "models"),
          providers: resolveIntentDomainPath(workspaceDir, "providers"),
          channels: resolveIntentDomainPath(workspaceDir, "channels"),
          skills: resolveIntentDomainPath(workspaceDir, "skills"),
          plugins: resolveIntentDomainPath(workspaceDir, "plugins"),
          files: resolveIntentDomainPath(workspaceDir, "files"),
          sessions: resolveIntentDomainPath(workspaceDir, "sessions"),
          speech: resolveIntentDomainPath(workspaceDir, "speech"),
        },
        observedPaths: {
          runtime: resolveObservedDomainPath(workspaceDir, "runtime"),
          workspace: resolveObservedDomainPath(workspaceDir, "workspace"),
          models: resolveObservedDomainPath(workspaceDir, "models"),
          providers: resolveObservedDomainPath(workspaceDir, "providers"),
          channels: resolveObservedDomainPath(workspaceDir, "channels"),
          skills: resolveObservedDomainPath(workspaceDir, "skills"),
          plugins: resolveObservedDomainPath(workspaceDir, "plugins"),
          memory: resolveObservedDomainPath(workspaceDir, "memory"),
          scheduler: resolveObservedDomainPath(workspaceDir, "scheduler"),
          sessions: resolveObservedDomainPath(workspaceDir, "sessions"),
        },
        manifest: readWorkspaceManifest(workspaceDir, filesystem),
        compatSnapshot: readCompatSnapshot(workspaceDir, filesystem),
        capabilityReport: readCapabilityReport(workspaceDir, filesystem),
        workspaceState: readWorkspaceStateSnapshot(workspaceDir, filesystem),
        providerState: readProviderStateSnapshot(workspaceDir, filesystem),
        schedulerState: readSchedulerStateSnapshot(workspaceDir, filesystem),
        memoryState: readMemoryStateSnapshot(workspaceDir, filesystem),
        skillsState: readSkillsStateSnapshot(workspaceDir, filesystem),
        channelsState: readChannelsStateSnapshot(workspaceDir, filesystem),
        telegramState: readTelegramStateSnapshot(workspaceDir, filesystem),
        slackState: readSlackStateSnapshot(workspaceDir, filesystem),
        whatsappState: readWhatsAppStateSnapshot(workspaceDir, filesystem),
        intents: readAllIntentDomains(workspaceDir, filesystem),
        observed: readAllObservedDomains(workspaceDir, filesystem),
      }),
    },
    intent: {
      get: (domain) => readIntent(domain),
      set: (domain, value) => writeIntent(domain, value),
      patch: (domain, patch) => patchIntent(domain, patch),
      plan: async (planOptions) => planIntent(planOptions),
      apply: async (applyOptions) => applyIntent(applyOptions),
      diff: async (diffOptions) => diffIntent(diffOptions),
    },
    observed: {
      read: (domain) => domain
        ? readObservedDomain(workspaceDir, domain, filesystem)
        : readAllObservedDomains(workspaceDir, filesystem),
      refresh: async (refreshOptions) => refreshObserved(refreshOptions),
    },
    features: {
      describe: () => describeFeatures(),
    },
    files: {
      applyTemplatePack: async (templatePackPath = options.templates?.pack, applyOptions = {}) => {
        if (!templatePackPath) {
          throw new Error("templatePackPath is required");
        }
        const backupDir = resolveClawWorkspaceSurfacePath("claw.workspace.backups", workspaceDir);
        const result = applyTemplatePack(templatePackPath, {
          workspaceDir,
          backupDir,
          filesystem,
          ...applyOptions,
        });
        appendAuditEvent("files.template_pack_applied", "templates", { templatePackPath, changes: result.filter((entry) => entry.changed).length });
        eventBus.emit("files.template_pack_applied", {
          templatePackPath,
          changedCount: result.filter((entry) => entry.changed).length,
        });
        return result;
      },
      diffBinding: (binding, settings, render) => syncBinding({
        workspaceDir,
        binding,
        settings,
        render,
        filesystem,
        dryRun: true,
      }),
      syncBinding: (binding, settings, render) => {
        const result = syncBinding({
          workspaceDir,
          binding,
          settings,
          render,
          filesystem,
          backupDir: resolveClawWorkspaceSurfacePath("claw.workspace.backups", workspaceDir),
        });
        appendAuditEvent("files.binding_synced", "file_sync", {
          bindingId: binding.id,
          filePath: result.filePath,
          changed: result.changed,
        });
        eventBus.emit("files.binding_synced", {
          bindingId: binding.id,
          filePath: result.filePath,
          changed: result.changed,
        });
        return result;
      },
      readBindingStore: () => readBindingStore(workspaceDir, filesystem),
      writeBindingStore: (bindings) => writeBindingStore(workspaceDir, bindings, filesystem),
      readSettingsSchema: () => readSettingsSchemaRecord(workspaceDir, filesystem),
      writeSettingsSchema: (settingsSchema) => writeSettingsSchemaRecord(workspaceDir, settingsSchema, filesystem),
      readSettingsValues: () => readSettingsValuesRecord(workspaceDir, filesystem),
      writeSettingsValues: (values) => writeSettingsValuesRecord(workspaceDir, values, filesystem),
      validateSettings: (values) => validateSettingsUpdate(readSettingsSchemaRecord(workspaceDir, filesystem).settingsSchema, values),
      renderTemplate: (template, values) => renderSettingsTemplate(template, values),
      updateSettings: (values, updateOptions) => {
        const result = updateBindingSettings({
          workspaceDir,
          bindings: readBindingStore(workspaceDir, filesystem).bindings,
          settingsSchema: readSettingsSchemaRecord(workspaceDir, filesystem).settingsSchema,
          values,
          renderers: updateOptions.renderers ?? {},
          autoSync: updateOptions.autoSync,
          reenableOptionalBindings: updateOptions.reenableOptionalBindings,
          filesystem,
        });
        appendAuditEvent("files.settings_updated", "file_sync", {
          autoSync: !!updateOptions.autoSync,
          syncCount: result.syncResults.length,
        });
        eventBus.emit("files.settings_updated", {
          autoSync: !!updateOptions.autoSync,
          syncCount: result.syncResults.length,
        });
        return result;
      },
      readWorkspaceFile: (relativePath) => readWorkspaceFile(workspaceDir, relativePath, filesystem),
      writeWorkspaceFile: (relativePath, content) => {
        const result = writeWorkspaceFile(workspaceDir, relativePath, content, filesystem);
        appendAuditEvent("files.workspace_written", "file_sync", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
        });
        eventBus.emit("files.workspace_written", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
        });
        return result;
      },
      writeWorkspaceFilePreservingManagedBlocks: (relativePath, content, preserveOptions = {}) => {
        const result = writeWorkspaceFilePreservingManagedBlocks(workspaceDir, relativePath, content, preserveOptions, filesystem);
        appendAuditEvent("files.workspace_written", "file_sync", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
          preservedManagedBlocks: true,
        });
        eventBus.emit("files.workspace_written", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
          preservedManagedBlocks: true,
        });
        return result;
      },
      previewWorkspaceFile: (relativePath, content) => previewWorkspaceFile(workspaceDir, relativePath, content, filesystem),
      inspectWorkspaceFile: (relativePath) => inspectWorkspaceFile(workspaceDir, relativePath, filesystem),
      inspectManagedBlock: (relativePath, blockId) => inspectManagedWorkspaceFile(workspaceDir, relativePath, blockId, filesystem),
      mergeManagedBlocks: (originalContent, editedContent, mergeOptions = {}) => mergeManagedBlocks(originalContent, editedContent, mergeOptions),
    },
    ...createClawKnowledgeFacades({ soulStore, userStore, appendAuditEvent, logicalAgentId, eventBus, adapter, processHost, resolvedRuntimeOptions, writeCompatSnapshot, workspaceDir, filesystem, writeCapabilityReport, persistWorkspaceState, persistProviderState, persistSchedulerState, readSchedulers, persistMemoryState, readMemory, persistSkillsState, readSkills, persistChannelsState, readChannels, augmentRuntimeStatusWithPluginBridge, pluginBridgeStatus, pluginBridgePolicy, validateWorkspace, readCompatSnapshot, buildCompatDriftReport, readProviderAuth, listManagedFiles, listManagedBlockProblems, buildCombinedDoctorReport, readModelCatalog, readDefaultModel, patchIntent, applyIntent, readProviderCatalog, readAuthState, prepareAuthLogin, emitAuthLoginProgress, patchProviderIntent, refreshObservedDomain, emitAuthProgress, requiresExplicitProviderEnable, outcomeStore, options, judgmentStore, sessionStore, contextStore, commitmentStore, projectCommitmentReminder, prepareContextPack, rulesStore, learningStore, libraryStore, dataStore }),
    rules: {
      status: () => rulesStore.status(),
      list: (input = {}) => rulesStore.list(input),
      get: (id) => rulesStore.get(id),
      scopes: () => rulesStore.scopes(),
      upsertScope: (input) => rulesStore.upsertScope(input),
      propose: (input) => rulesStore.propose(input),
      approve: (id) => rulesStore.approve(id),
      archive: (id) => rulesStore.archive(id),
      compile: (input) => rulesStore.compile({
        ...input,
        agent: input.agent ?? logicalAgentId,
      }),
    },
    skills: {
      list: async () => {
        const skills = await readSkills();
        persistSkillsState(skills);
        return skills;
      },
      sync: async () => {
        const skills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
        persistSkillsState(skills);
        appendAuditEvent("skills.synced", "skills", { count: skills.length, runtimeAdapter: adapter.id });
        eventBus.emit("skills.synced", { count: skills.length, runtimeAdapter: adapter.id });
        return skills;
      },
      sources: async () => readSkillSources(),
      search: async (query, options = {}) => searchSkillCatalog(query, options),
      install: async (ref, options = {}) => {
        const result = await installSkillFromSource(ref, options);
        patchSkillIntentEntry({
          id: result.slug,
          enabled: true,
          installRef: result.installRef,
          source: result.source,
          label: result.label,
        });
        await refreshObservedDomain("skills");
        return result;
      },

      // ─── Skills v2 (unified, agentskills.io-compatible) ────────────────
      listV2: (filter) => skillsV2Store.list(filter),
      get: (slug) => skillsV2Store.get(slug),
      searchV2: (query, options) => skillsV2Store.search(query, options),
      resolveActive: (ctx = {}) => skillsV2Store.resolveActive(ctx),
      create: (input) => {
        const created = skillsV2Store.create(input);
        eventBus.emit("skills.created", { slug: created.slug, kind: created.kind });
        return created;
      },
      update: (slug, patch) => {
        const updated = skillsV2Store.update(slug, patch);
        eventBus.emit("skills.updated", { slug: updated.slug });
        return updated;
      },
      removeV2: (slug) => {
        const removed = skillsV2Store.remove(slug);
        if (removed) eventBus.emit("skills.removed", { slug });
        return removed;
      },
      activate: (slug, scope, opts = {}) => {
        const assignment = skillsV2Store.activate(slug, scope, opts);
        eventBus.emit("skills.activated", { slug, scope: scope.kind });
        return assignment;
      },
      deactivate: (slug, scope) => {
        const removed = skillsV2Store.deactivate(slug, scope);
        if (removed) eventBus.emit("skills.deactivated", { slug, scope: scope.kind });
        return removed;
      },
      instantiate: (templateSlug, params, opts = {}) => skillsV2Store.instantiate(templateSlug, params, opts),
      freeze: (instanceSlug) => skillsV2Store.freeze(instanceSlug),
      syncV2: (opts = {}) => skillsV2SyncEngine.sync(opts),
      syncTargets: () => skillsV2Store.syncTargets(),
      registerSyncTarget: (target) => skillsV2Store.registerSyncTarget(target),
      importExternal: (opts = {}) => skillsV2Importer.importExternal(opts),
      compile: (slugs) => compileSkillsV2(skillsV2Store, slugs),
      initBuiltins: () => generateSkillsV2Builtins(skillsV2Store, soulStore),
    },
    library: {
      list: () => libraryStore.list(),
      get: (id) => libraryStore.get(id),
      create: (input) => libraryStore.create(input),
      update: (id, patch) => libraryStore.update(id, patch),
      remove: (id) => libraryStore.remove(id),
      importSkill: (ref, importOptions = {}) => libraryStore.importSkill(ref, importOptions),
      createInstruction: (input) => libraryStore.createInstruction(input),
      createBundle: (input) => libraryStore.createBundle(input),
      assign: (input) => libraryStore.assign(input),
      unassign: (input) => libraryStore.unassign(input),
      resolve: (input = {}) => libraryStore.resolve({
        agentId: input.agentId ?? logicalAgentId,
        workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        tags: input.tags,
        availableSecrets: input.availableSecrets,
      }),
      resolveSkillCapsules: (input = {}) => libraryStore.resolveSkillCapsules({
        agentId: input.agentId ?? logicalAgentId,
        workspaceId: input.workspaceId ?? options.workspace.workspaceId,
        tags: input.tags,
        availableSecrets: input.availableSecrets,
        includeDefault: input.includeDefault,
      }),
      sync: (input = {}) => syncLibraryAssets(input),
    },
    generations: {
      backends: () => generationStore.listBackends(),
      registerCommandBackend: (input) => registerGenerationBackend(input),
      removeBackend: (id) => removeGenerationBackend(id),
      create: async (input) => createGenerationRecord(input),
      list: (query) => generationStore.list(query),
      get: (id) => generationStore.get(id),
      remove: (id) => removeGenerationRecord(id),
    },
    image: {
      backends: () => imageBackends(),
      create: (input) => createImageRecord(input),
      generate: (input) => createImageRecord(input),
      edit: (input) => editImageRecord(input),
      import: (input) => {
        const image = imageStore.importImage({
          ...input,
          workspaceId: options.workspace.workspaceId,
          agentId: logicalAgentId,
        });
        registerImageMedia(image);
        return image;
      },
      list: (query) => listImageRecords(query),
      search: (query) => listImageRecords(query),
      get: (id) => getImageRecord(id),
      remove: (id) => removeImageRecord(id),
    },
    audio: createTypedGenerationFacade("audio"),
    video: createTypedGenerationFacade("video"),
    tts: {
      synthesize: async (input) => {
        const resolvedInput = resolveTtsInput(input);
        const result = await synthesize(resolvedInput);
        appendAuditEvent("tts.synthesized", "channels", {
          provider: resolvedInput.provider ?? "local",
          textLength: resolvedInput.text.length,
        });
        eventBus.emit("tts.synthesized", {
          provider: resolvedInput.provider ?? "local",
          textLength: resolvedInput.text.length,
        });
        return result;
      },
      config: () => readSpeechConfig(),
      setConfig: (input) => writeSpeechConfig(input),
      providers: () => listTtsProviders(),
      catalog: () => getTtsCatalog(),
      normalizeConfig: (input) => normalizeTtsConfig(input),
      stripMarkdown: (text) => stripMarkdownForTts(text),
      segmentText: (text, options) => segmentTextForTts(text, options),
      createPlaybackPlan: (input) => createTtsPlaybackPlan(input),
    },
    stt: {
      transcribe: async (input) => transcribeAudio(resolveSttInput(input)),
      config: () => readSttConfig(),
      setConfig: (input) => writeSttConfig(input),
      providers: () => listSttProviders(),
      normalizeConfig: (input) => normalizeSttConfig(input),
    },
    voiceNotes: {
      create: (input) => {
        const note = voiceNoteStore.create(input);
        registerVoiceNoteMedia(note);
        return note;
      },
      registerPath: (input) => {
        const note = voiceNoteStore.registerPath(input);
        registerVoiceNoteMedia(note);
        return note;
      },
      list: (input) => voiceNoteStore.list(input),
      get: (id) => voiceNoteStore.get(id),
      download: (id) => voiceNoteStore.download(id),
      transcribe: async (id, input) => {
        const note = await voiceNoteStore.transcribe(id, input);
        registerVoiceNoteMedia(note);
        return note;
      },
    },
    ...createClawChannelFacades({ readChannels, persistChannelsState, channelsRegistry, patchTelegramChannelIntent, connectTelegramAccount, processHost, secretsEnv, ensureTelegramCodexBridgeCommands, refreshChannelSnapshots, appendAuditEvent, adapter, eventBus, refreshTelegramAccountStatus, runChannelListener, sendTelegramAccountMessage, registerOutboundChannelMedia, syncTelegramAccount, registerInboundTelegramMedia, ingestTelegramVoiceNote, setTelegramAccountCommands, getTelegramAccountCommands, ensureTelegramBotSecretReference, telegram, recordTelegramStatusInChannels, disableTelegramAccountWebhook, configureTelegramAccountWebhook, callTelegramApi, callTelegramAccountBooleanMethod, callTelegramAccountRecordMethod, downloadTelegramFile, getTelegramAccountChat, listTelegramAccountChats, telegramBanOrRestrictParams, telegramInviteLinkParams, slack, whatsapp }),
    inference: {
      generateText: async (input) => {
        if (!input.sessionId) {
          return generateRuntimeText({
            ...input,
            agentId: input.agentId ?? runtimeAgentId,
            contextBlocks: mergeRulesContextBlocks({
              sessionMessages: input.messages,
              contextBlocks: input.contextBlocks,
              ruleHints: input.ruleHints,
            }),
          }, {
            fetchImpl: input.transport === "cli" ? undefined : globalThis.fetch,
            runner: input.transport === "gateway" ? undefined : processHost,
            documentResolver: resolveSessionDocumentAssets,
            sessionAdapter: input.transport === "cli"
              ? { ...sessionAdapter, gateway: null }
              : sessionAdapter,
          });
        }

        for (const message of input.messages) {
          const preparedMessage = prepareMessageDocuments(input.sessionId, message);
          sessionStore.appendMessage(input.sessionId, preparedMessage);
        }
        const session = sessionStore.getSession(input.sessionId);
        const result = await generateRuntimeText({
          ...input,
          agentId: input.agentId ?? runtimeAgentId,
          messages: session?.messages ?? input.messages,
          contextBlocks: mergeRulesContextBlocks({
            sessionMessages: session?.messages ?? input.messages,
            contextBlocks: input.contextBlocks,
            ruleHints: input.ruleHints,
          }),
        }, {
          fetchImpl: input.transport === "cli" ? undefined : globalThis.fetch,
          runner: input.transport === "gateway" ? undefined : processHost,
          documentResolver: resolveSessionDocumentAssets,
          sessionAdapter: input.transport === "cli"
            ? { ...sessionAdapter, gateway: null }
            : sessionAdapter,
        });
        if (result.text) {
          sessionStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: result.text,
          });
        }
        return result;
      },
    },
    secrets: {
      list: async (search) => listSecrets(processHost, { search, env: secretsEnv }),
      describe: async (name) => describeSecret(processHost, { name, env: secretsEnv }),
      types: async (search) => listSecretTypes(processHost, { search, env: secretsEnv }),
      capabilities: async (name) => getSecretCapabilities(processHost, { name, env: secretsEnv }),
      actions: async (name) => listSecretActions(processHost, { name, env: secretsEnv }),
      brokerHttp: async (input) => brokerSecretHttp(processHost, input, { env: secretsEnv }),
      runAction: async (name, actionId) => runSecretAction(processHost, { name, actionId, env: secretsEnv }),
      leases: async () => listSecretLeases(processHost, { env: secretsEnv }),
      doctorKeychain: async () => doctorKeychain(processHost, { env: secretsEnv }),
      ensureHttpReference: async (input) => ensureHttpSecretReference(processHost, input, { env: secretsEnv }),
      ensureTelegramBotReference: async (input) => ensureTelegramBotSecretReference(processHost, input, { env: secretsEnv }),
    },
    notify: {
      send: async (input) => requireNotifyClient("source").send(input),
      cancel: async (notificationId) => requireNotifyClient("source").cancel(notificationId),
      receipt: async (receiptId) => {
        const client = sourceNotifyClient ?? clientNotifyClient;
        if (!client) {
          throw new Error("notify client is not configured. Set CreateClawOptions.notify with baseUrl and a token.");
        }
        return await client.receipt(receiptId);
      },
      feed: async (limit) => requireNotifyClient("client").feed(limit),
      markRead: async (notificationId) => requireNotifyClient("client").markRead(notificationId),
      acknowledgeReceipt: async (receiptId) => requireNotifyClient("client").acknowledgeReceipt(receiptId),
      updatePushToken: async (installationId, pushToken) => requireNotifyClient("client").updatePushToken(installationId, pushToken),
      putGlance: async (scope, input) => requireNotifyClient("source").putGlance(scope, input),
      subscriptions: {
        upsert: async (input) => requireNotifyClient("client").upsertSubscription(input),
        remove: async (id) => requireNotifyClient("client").deleteSubscription(id),
      },
    },
    time: {
      configured: Boolean(timeClient),
      list: async (filters) => requireTimeClient().list(filters),
      get: async (id) => requireTimeClient().get(id),
      create: async (input) => requireTimeClient().create(input),
      update: async (id, input) => requireTimeClient().update(id, input),
      delete: async (id) => requireTimeClient().delete(id),
      pause: async (id) => requireTimeClient().pause(id),
      resume: async (id) => requireTimeClient().resume(id),
      runNow: async (id) => requireTimeClient().runNow(id),
      listExecutions: async (itemId) => requireTimeClient().listExecutions(itemId),
      listRunLog: async (itemId, limit) => requireTimeClient().listRunLog(itemId, limit),
      calendarView: async (input) => requireTimeClient().calendarView(input),
      timelineView: async (input) => requireTimeClient().timelineView(input),
      signalAnchor: async (input) => requireTimeClient().signalAnchor(input),
    },
    calendar: calendarFacade,
    routines: routinesFacade,
    reminders: temporalRemindersFacade,
    ...createClawContentIotFacades({ contentClient, iotClient, requireContentClient, requireIotClient, options }),
    sessions: {
      createSession: (title) => {
        const session = sessionStore.createSession(title);
        appendAuditEvent("sessions.session_created", "sessions", {
          sessionId: session.sessionId,
          title: session.title,
        });
        eventBus.emit("sessions.session_created", {
          sessionId: session.sessionId,
          title: session.title,
        });
        return session;
      },
      appendMessage: (sessionId, message) => {
        const preparedMessage = prepareMessageDocuments(sessionId, message);
        const session = sessionStore.appendMessage(sessionId, preparedMessage);
        appendAuditEvent("sessions.message_appended", "sessions", {
          sessionId,
          role: message.role,
        });
        eventBus.emit("sessions.message_appended", {
          sessionId,
          role: message.role,
        });
        return session;
      },
      appendMessageOnce: (sessionId, message) => {
        const preparedMessage = prepareMessageDocuments(sessionId, message);
        const result = sessionStore.appendMessageOnce(sessionId, preparedMessage);
        if (result.appended) {
          appendAuditEvent("sessions.message_appended", "sessions", {
            sessionId,
            role: message.role,
            idempotent: true,
          });
          eventBus.emit("sessions.message_appended", {
            sessionId,
            role: message.role,
          });
        }
        return result;
      },
      resolveChannelSession: (input) => {
        const sessionId = resolveChannelSessionId(input);
        return {
          sessionId,
          session: sessionStore.getSession(sessionId),
        };
      },
      appendChannelMessage: (input) => {
        const result = appendChannelSessionMessage(input);
        if (result.appended) {
          appendAuditEvent("sessions.channel_message_appended", "sessions", {
            sessionId: result.sessionId,
            provider: input.provider,
            targetId: input.targetId,
          });
          eventBus.emit("sessions.channel_message_appended", {
            sessionId: result.sessionId,
            provider: input.provider,
            targetId: input.targetId,
          });
        }
        return result;
      },
      backfillChannelSession,
      listSessions: sessionStore.listSessions.bind(sessionStore),
      searchSessions: searchSessions,
      getSession: sessionStore.getSession.bind(sessionStore),
      updateSessionTitle: (sessionId, title) => {
        const updated = sessionStore.updateSessionTitle(sessionId, title);
        if (updated) {
          appendAuditEvent("sessions.title_updated", "sessions", {
            sessionId,
            title,
          });
          eventBus.emit("sessions.title_updated", {
            sessionId,
            title,
          });
        }
        return updated;
      },
      generateTitle: async (input) => {
        const session = sessionStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        const title = await generateRuntimeSessionTitle({
          messages: session.messages,
          sessionAdapter: input.transport === "cli" ? { ...sessionAdapter, gateway: null } : sessionAdapter,
          ...(input.transport === "gateway" ? { runner: undefined } : { agentId: runtimeAgentId, runner: processHost }),
          ...(input.transport === "cli" ? { fetchImpl: undefined } : { fetchImpl: globalThis.fetch }),
        });
        sessionStore.updateSessionTitle(input.sessionId, title);
        appendAuditEvent("sessions.title_generated", "sessions", {
          sessionId: input.sessionId,
          title,
        });
        eventBus.emit("sessions.title_generated", {
          sessionId: input.sessionId,
          title,
        });
        return title;
      },
      streamAssistantReplyEvents: async function* (input) {
        const session = sessionStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        if (!session.messages.some((message) => message.role === "user")) {
          throw new Error(`Session requires at least one user message: ${input.sessionId}`);
        }

        let fullText = "";
        let completed = false;
        let failed = false;

        for await (const event of streamRuntimeSessionEvents({
          sessionId: input.sessionId,
          agentId: runtimeAgentId,
          systemPrompt: input.systemPrompt,
          contextBlocks: mergeRulesContextBlocks({
            sessionMessages: session.messages,
            contextBlocks: input.contextBlocks,
            ruleHints: input.ruleHints,
          }),
          messages: session.messages,
          transport: input.transport,
          chunkSize: input.chunkSize,
          gatewayRetries: input.gatewayRetries,
          signal: input.signal,
        }, {
          sessionAdapter,
          runner: processHost,
          documentResolver: resolveSessionDocumentAssets,
        })) {
          if (event.type === "chunk") {
            fullText += event.chunk.delta;
          }
          if (event.type === "done") {
            completed = true;
          }
          if (event.type === "error" || event.type === "aborted") {
            failed = true;
          }
          if (event.type === "title") {
            sessionStore.updateSessionTitle(input.sessionId, event.title);
            appendAuditEvent("sessions.title_suggested", "sessions", {
              sessionId: input.sessionId,
              title: event.title,
              source: event.source,
            });
            eventBus.emit("sessions.title_suggested", {
              sessionId: input.sessionId,
              title: event.title,
              source: event.source,
            });
          }
          yield event;
        }

        if (completed && !failed && fullText.trim()) {
          sessionStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: fullText.trim(),
          });
          appendAuditEvent("sessions.assistant_stream_persisted", "sessions", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
          eventBus.emit("sessions.assistant_stream_persisted", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
        }
      },
      streamAssistantReply: async function* (input) {
        const session = sessionStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        if (!session.messages.some((message) => message.role === "user")) {
          throw new Error(`Session requires at least one user message: ${input.sessionId}`);
        }

        let fullText = "";

        for await (const chunk of streamRuntimeSession({
          sessionId: input.sessionId,
          agentId: runtimeAgentId,
          systemPrompt: input.systemPrompt,
          contextBlocks: mergeRulesContextBlocks({
            sessionMessages: session.messages,
            contextBlocks: input.contextBlocks,
            ruleHints: input.ruleHints,
          }),
          messages: session.messages,
          transport: input.transport,
          chunkSize: input.chunkSize,
          gatewayRetries: input.gatewayRetries,
          signal: input.signal,
        }, {
          sessionAdapter,
          runner: processHost,
          documentResolver: resolveSessionDocumentAssets,
        })) {
          if (!chunk.done) {
            fullText += chunk.delta;
          }
          yield chunk;
        }

        if (fullText.trim()) {
          sessionStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: fullText.trim(),
          });
          appendAuditEvent("sessions.assistant_stream_persisted", "sessions", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
          eventBus.emit("sessions.assistant_stream_persisted", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
        }
      },
    },
    channelRuns: {
      resolveOrCreateChannelRun: (input) => channelRunStore.resolveOrCreateChannelRun(input),
      enqueueChannelMessage: (runKey, message) => channelRunStore.enqueueChannelMessage(runKey, message),
      processChannelRun: (input) => channelRunStore.processChannelRun(input),
      getChannelRunStatus: (runKey) => channelRunStore.getChannelRunStatus(runKey),
      requestChannelRunStop: (runKey) => channelRunStore.requestChannelRunStop(runKey),
      compactChannelSession: (input) => channelRunStore.compactChannelSession(input),
      drainQueuedChannelMessages: (runKey) => channelRunStore.drainQueuedChannelMessages(runKey),
      resetChannelRun: (input) => channelRunStore.resetChannelRun(input),
    },
    conversations: {
      searchSessions,
    },
    documents: {
      list: async (options) => documentStore.list(options),
      get: async (documentId) => documentStore.get(documentId),
      search: async (input) => searchDocuments(input),
      upload: async (input) => {
        const document = documentStore.upload({
          ...input,
          workspaceId: options.workspace.workspaceId,
          ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
          agentId: options.workspace.agentId,
        });
        registerDocumentMedia(document);
        return document;
      },
      register: async (input) => {
        const document = documentStore.registerPath({
          ...input,
          workspaceId: options.workspace.workspaceId,
          ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
          agentId: options.workspace.agentId,
        });
        registerDocumentMedia(document);
        return document;
      },
      beginUpload: async (input) => documentStore.beginUpload({
        ...input,
        workspaceId: options.workspace.workspaceId,
        ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
        agentId: options.workspace.agentId,
      }),
      appendUploadChunk: async (uploadId, chunkBase64) => documentStore.appendUploadChunk(uploadId, chunkBase64),
      commitUpload: async (uploadId) => {
        const document = documentStore.commitUpload(uploadId);
        registerDocumentMedia(document);
        return document;
      },
      download: async (documentId) => documentStore.download(documentId),
      resolveRefs: async (documentIds) => documentStore.resolveRefs(documentIds),
    },
    media: {
      register: (input) => mediaStore.register(input),
      list: (input) => mediaStore.list(input),
      search: (input) => mediaStore.search(input),
      get: (mediaId) => mediaStore.get(mediaId),
      download: (mediaId) => mediaStore.download(mediaId),
      share: {
        create: async (input) => input.mediaId
          ? await mediaStore.createObjectShare({
              mediaId: input.mediaId,
              label: input.label,
              expiresAt: input.expiresAt,
              ttlMs: input.ttlMs,
            })
          : mediaStore.createGalleryShare({
              label: input.label,
              filters: input.filters,
              expiresAt: input.expiresAt,
              ttlMs: input.ttlMs,
            }),
        revoke: (id) => mediaStore.revokeShare(id),
        list: () => mediaStore.listShares(),
        resolveGallery: (id) => mediaStore.resolveGalleryShare(id),
      },
    },
    storage: {
      put: (input) => storageStore.put(input),
      get: (ref) => storageStore.get(ref),
      head: (ref) => storageStore.head(ref),
      list: (input) => storageStore.list(input),
      delete: (ref) => storageStore.delete(ref),
      readText: (ref) => storageStore.readText(ref),
      writeText: (input) => storageStore.writeText(input),
      exportToFile: (ref) => storageStore.exportToFile(ref),
      tokens: {
        issue: (input) => storageStore.issueToken(input),
        list: () => storageStore.listTokens(),
        revoke: (id) => storageStore.revokeToken(id),
      },
      share: {
        create: (input) => storageStore.createShare(input),
        revoke: (id) => storageStore.revokeShare(id),
        list: () => storageStore.listShares(),
      },
    },
    data: dataStore,
    orchestration: {
      snapshot: async () => {
        const status = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const compat = adapter.buildCompatReport(status);
        const doctor = adapter.buildDoctorReport(status);
        const manifest = readWorkspaceManifest(workspaceDir, filesystem);
        const workspaceValidation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        const authSummaries = await readProviderAuth() as Record<string, ProviderAuthSummary>;
        const authReady = Object.values(authSummaries).some((summary) => summary.hasAuth);
        const modelReady = !!(await readDefaultModel());

        return buildOrchestrationSnapshot({
          runtime: status,
          compat,
          doctor,
          workspaceReady: !!manifest && workspaceValidation.ok,
          authReady,
          modelReady,
          fileSyncReady: !!options.templates?.pack,
        });
      },
    },
    watch: {
      ...watchFacade,
      file: (fileName, callback, watchOptions) => watchWorkspaceFile(workspaceDir, fileName, callback, watchOptions),
      transcript: (sessionId, callback, watchOptions) => watchSessionTranscript(workspaceDir, sessionId, callback, watchOptions),
      runtimeStatus: (callback, watchOptions) => watchRuntimeStatus(
        () => adapter.getStatus(processHost, resolvedRuntimeOptions),
        callback,
        watchOptions,
      ),
      providerStatus: (callback, watchOptions) => watchProviderStatus(
        async () => {
          const summaries = await readProviderAuth();
          persistProviderState(summaries, []);
          return summaries;
        },
        callback,
        watchOptions,
      ),
      events: (type, listener) => eventBus.on(type, listener),
      eventsIterator: (type = "*") => eventBus.iterate(type),
    },
  };
}

export const Claw: ClawFactory = Object.assign(
  async (options: CreateClawOptions) => createClaw(options),
  { create: createClaw },
);
