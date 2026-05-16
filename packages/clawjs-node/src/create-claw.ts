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
import { createWorkspaceStorage, type WorkspaceStorage } from "./data/store.ts";
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
import { createLocalGuidanceStore } from "./guidance/store.ts"; import { createLocalResourceRegistryStore } from "./resources/store.ts";
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
import { createClawMediaSessionOperations } from "./create-claw-media-session-operations.ts";
import { createClawGenerationImageFacades } from "./create-claw-generation-image-facades.ts";
import { createClawSkillProviderFacades } from "./create-claw-skill-provider-facades.ts";
import { createClawChannelRuntimeOperations } from "./create-claw-channel-runtime-operations.ts";
import { createClawIntentFacades } from "./create-claw-intent-facades.ts";
import { createClawRuntimeWorkspaceFacades } from "./create-claw-runtime-workspace-facades.ts";
import { createClawContentIotFacades } from "./create-claw-content-iot-facades.ts";
import { createClawCapabilityFacades } from "./create-claw-capability-facades.ts";
import { createClawSessionFacades } from "./create-claw-session-facades.ts";
import { createClawDataWatchFacades } from "./create-claw-data-watch-facades.ts";

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
  const dataStore = createWorkspaceStorage(workspaceDir, filesystem);
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
  const rulesStore = createLocalRulesStore({ rootDir: options.rules?.rootDir, env: options.rules?.env ?? runtimeEnv, filesystem });
  const guidanceStore = createLocalGuidanceStore({ rootDir: options.guidance?.rootDir, env: options.guidance?.env ?? runtimeEnv, filesystem }); const resourceRegistryStore = createLocalResourceRegistryStore({ rootDir: options.resources?.rootDir, env: options.resources?.env ?? runtimeEnv, filesystem });
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
  } = createClawSkillProviderFacades({
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
  } = createClawMediaSessionOperations({
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
  } = createClawGenerationImageFacades({
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

  const {
    describeFeatures,
    readIntent,
    writeIntent,
    patchIntent,
    refreshObservedDomain,
    refreshObserved,
    diffIntent,
    applyIntent,
    planIntent,
  } = createClawIntentFacades({
    adapter,
    resolvedRuntimeOptions,
    resolvedLocations,
    workspaceDir,
    filesystem,
    readAllIntentDomains,
    readIntentDomain,
    writeIntentDomain,
    patchIntentDomain,
    augmentRuntimeStatusWithPluginBridge,
    processHost,
    writeObservedDomain,
    validateWorkspace,
    persistWorkspaceState,
    readModelCatalog,
    readDefaultModel,
    readProviderAuth,
    persistProviderState,
    readChannels,
    persistChannelsState,
    readSkills,
    persistSkillsState,
    readMemory,
    persistMemoryState,
    readSchedulers,
    persistSchedulerState,
    pluginBridgeStatus,
    sessionStore,
    runtimeContext,
    readObservedDomain,
    readProviderStateSnapshot,
    readChannelsStateSnapshot,
    readSkillsStateSnapshot,
    normalizeTtsConfig,
    telegram,
    installSkillFromSource,
    enableManagedOpenClawPlugins,
    disableManagedOpenClawPlugins,
    pluginBridgePolicy,
    writeSpeechConfig,
    writeSttConfig,
  });
  const {
    sleep,
    appendChannelListenerLog,
    applyChannelProcessorActions,
    extractTelegramVoiceMedia,
    extractTelegramLanguageHint,
    ingestTelegramVoiceNote,
    ensureTelegramCodexBridgeCommands,
    runChannelListener,
  } = createClawChannelRuntimeOperations({
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
    ...createClawRuntimeWorkspaceFacades({
      runtimeContext,
      adapter,
      processHost,
      resolvedRuntimeOptions,
      augmentRuntimeStatusWithPluginBridge,
      telegram,
      assertOpenClawGatewaySupport,
      getOpenClawGatewayStatus,
      gatewayConfigOptions,
      startOpenClawGateway,
      stopOpenClawGateway,
      restartOpenClawGateway,
      waitForOpenClawGateway,
      callOpenClawGateway,
      pluginBridgeStatus,
      assertOpenClawPluginBridgeSupport,
      listOpenClawPlugins,
      doctorOpenClawPlugins,
      patchManagedPluginIntent,
      installManagedOpenClawPlugins,
      enableManagedOpenClawPlugins,
      disableManagedOpenClawPlugins,
      updateManagedOpenClawPlugins,
      ensureOpenClawPluginBridge,
      pluginBridgePolicy,
      refreshObservedDomain,
      callManagedClawJsBridge,
      listOpenClawHooks,
      handleRuntimeProgress,
      appendAuditEvent,
      eventBus,
      runtimeAgentId,
      workspaceDir,
      discoverOpenClawAppContext,
      openClawContextDefaults,
      detachOpenClawAppContext,
      ensureWorkspaceInitialized,
      attachWorkspace,
      filesystem,
      validateWorkspace,
      persistWorkspaceState,
      repairWorkspace,
      options,
      buildWorkspaceResetPlan,
      resetWorkspace,
      listManagedFiles,
      buildCanonicalPathMap,
      resolveManifestPath,
      resolveCompatSnapshotPath,
      resolveCapabilityReportPath,
      resolveBindingsPath,
      resolveSettingsSchemaPath,
      resolveSettingsValuesPath,
      resolveWorkspaceStatePath,
      resolveProviderStatePath,
      resolveSchedulerStatePath,
      resolveMemoryStatePath,
      resolveSkillsStatePath,
      resolveChannelsStatePath,
      resolveTelegramStatePath,
      resolveIntentDomainPath,
      resolveObservedDomainPath,
      readWorkspaceManifest,
      readCompatSnapshot,
      readCapabilityReport,
      readWorkspaceStateSnapshot,
      readProviderStateSnapshot,
      readSchedulerStateSnapshot,
      readMemoryStateSnapshot,
      readSkillsStateSnapshot,
      readChannelsStateSnapshot,
      readTelegramStateSnapshot,
      readSlackStateSnapshot,
      readWhatsAppStateSnapshot,
      readAllIntentDomains,
      readAllObservedDomains,
      readIntent,
      writeIntent,
      patchIntent,
      planIntent,
      applyIntent,
      diffIntent,
      readObservedDomain,
      refreshObserved,
      describeFeatures,
      resolveClawWorkspaceSurfacePath,
      applyTemplatePack,
      syncBinding,
      readBindingStore,
      writeBindingStore,
      readSettingsSchemaRecord,
      writeSettingsSchemaRecord,
      readSettingsValuesRecord,
      writeSettingsValuesRecord,
      validateSettingsUpdate,
      renderSettingsTemplate,
      updateBindingSettings,
      readWorkspaceFile,
      writeWorkspaceFile,
      writeWorkspaceFilePreservingManagedBlocks,
      previewWorkspaceFile,
      inspectWorkspaceFile,
      inspectManagedWorkspaceFile,
      mergeManagedBlocks,
    }),
    ...createClawKnowledgeFacades({ soulStore, userStore, appendAuditEvent, logicalAgentId, eventBus, adapter, processHost, resolvedRuntimeOptions, writeCompatSnapshot, workspaceDir, filesystem, writeCapabilityReport, persistWorkspaceState, persistProviderState, persistSchedulerState, readSchedulers, persistMemoryState, readMemory, persistSkillsState, readSkills, persistChannelsState, readChannels, augmentRuntimeStatusWithPluginBridge, pluginBridgeStatus, pluginBridgePolicy, validateWorkspace, readCompatSnapshot, buildCompatDriftReport, readProviderAuth, listManagedFiles, listManagedBlockProblems, buildCombinedDoctorReport, readModelCatalog, readDefaultModel, patchIntent, applyIntent, readProviderCatalog, readAuthState, prepareAuthLogin, emitAuthLoginProgress, patchProviderIntent, refreshObservedDomain, emitAuthProgress, requiresExplicitProviderEnable, outcomeStore, options, judgmentStore, sessionStore, contextStore, commitmentStore, projectCommitmentReminder, prepareContextPack, rulesStore, learningStore, libraryStore, dataStore }),
    ...createClawCapabilityFacades({
      rulesStore,
      guidanceStore,
      resourceRegistryStore,
      logicalAgentId,
      readSkills,
      persistSkillsState,
      adapter,
      processHost,
      resolvedRuntimeOptions,
      appendAuditEvent,
      eventBus,
      readSkillSources,
      searchSkillCatalog,
      installSkillFromSource,
      patchSkillIntentEntry,
      refreshObservedDomain,
      skillsV2Store,
      skillsV2SyncEngine,
      skillsV2Importer,
      compileSkillsV2,
      generateSkillsV2Builtins,
      soulStore,
      libraryStore,
      options,
      syncLibraryAssets,
      generationStore,
      registerGenerationBackend,
      removeGenerationBackend,
      createGenerationRecord,
      removeGenerationRecord,
      imageBackends,
      createImageRecord,
      editImageRecord,
      imageStore,
      registerImageMedia,
      listImageRecords,
      getImageRecord,
      removeImageRecord,
      createTypedGenerationFacade,
      resolveTtsInput,
      synthesize,
      readSpeechConfig,
      writeSpeechConfig,
      listTtsProviders,
      getTtsCatalog,
      normalizeTtsConfig,
      stripMarkdownForTts,
      segmentTextForTts,
      createTtsPlaybackPlan,
      transcribeAudio,
      resolveSttInput,
      readSttConfig,
      writeSttConfig,
      listSttProviders,
      normalizeSttConfig,
      voiceNoteStore,
      registerVoiceNoteMedia,
      generateRuntimeText,
      runtimeAgentId,
      mergeRulesContextBlocks,
      resolveSessionDocumentAssets,
      sessionAdapter,
      prepareMessageDocuments,
      sessionStore,
      listSecrets,
      secretsEnv,
      describeSecret,
      listSecretTypes,
      getSecretCapabilities,
      listSecretActions,
      brokerSecretHttp,
      runSecretAction,
      listSecretLeases,
      doctorKeychain,
      ensureHttpSecretReference,
      ensureTelegramBotSecretReference,
      requireNotifyClient,
      sourceNotifyClient,
      clientNotifyClient,
      timeClient,
      requireTimeClient,
    }),
    ...createClawChannelFacades({ readChannels, persistChannelsState, channelsRegistry, patchTelegramChannelIntent, connectTelegramAccount, processHost, secretsEnv, ensureTelegramCodexBridgeCommands, refreshChannelSnapshots, appendAuditEvent, adapter, eventBus, refreshTelegramAccountStatus, runChannelListener, sendTelegramAccountMessage, registerOutboundChannelMedia, syncTelegramAccount, registerInboundTelegramMedia, ingestTelegramVoiceNote, setTelegramAccountCommands, getTelegramAccountCommands, ensureTelegramBotSecretReference, telegram, recordTelegramStatusInChannels, disableTelegramAccountWebhook, configureTelegramAccountWebhook, callTelegramApi, callTelegramAccountBooleanMethod, callTelegramAccountRecordMethod, downloadTelegramFile, getTelegramAccountChat, listTelegramAccountChats, telegramBanOrRestrictParams, telegramInviteLinkParams, slack, whatsapp }),
    calendar: calendarFacade,
    routines: routinesFacade,
    reminders: temporalRemindersFacade,
    ...createClawContentIotFacades({ contentClient, iotClient, requireContentClient, requireIotClient, options }),
    ...createClawSessionFacades({ sessionStore, appendAuditEvent, eventBus, prepareMessageDocuments, resolveChannelSessionId, appendChannelSessionMessage, backfillChannelSession, searchSessions, generateRuntimeSessionTitle, sessionAdapter, runtimeAgentId, processHost, streamRuntimeSessionEvents, mergeRulesContextBlocks, resolveSessionDocumentAssets, streamRuntimeSession }),
    ...createClawDataWatchFacades({ channelRunStore, searchSessions, documentStore, searchDocuments, options, registerDocumentMedia, mediaStore, storageStore, dataStore, adapter, processHost, resolvedRuntimeOptions, readWorkspaceManifest, workspaceDir, filesystem, validateWorkspace, readProviderAuth, readDefaultModel, buildOrchestrationSnapshot, watchFacade, watchWorkspaceFile, watchSessionTranscript, watchRuntimeStatus, watchProviderStatus, persistProviderState, eventBus }),
  };
}

export const Claw: ClawFactory = Object.assign(
  async (options: CreateClawOptions) => createClaw(options),
  { create: createClaw },
);
