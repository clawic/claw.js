import type { Attachment, AuthState, BindingDefinition, ChannelDescriptor, ChannelAccountDescriptor, ChannelAgentBinding, ChannelEventRecord, ChannelListenerDescriptor, ChannelMessageRecord, ChannelPermission, ChannelProcessorDescriptor, ChannelTargetDescriptor, ClawManifest, SessionPolicy, SessionSearchInput, SessionSearchResult, SessionTransport, DefaultModelRef, DocumentRecord, DocumentRef, DocumentSearchResult, IntentDomain, MemoryDescriptor, ModelCatalog, ModelDescriptor, RuntimeFeatureDescriptor, ObservedDomain, PromptContextBlock, ProviderDescriptor, ProviderCatalog, ProviderAuthSummary, RuntimeCapabilitySupport, RuntimeAdapterId, RuntimeFileDescriptor, SchedulerDescriptor, SkillCatalogEntry, SkillDescriptor, SkillInstallResult, SkillSearchResult, SkillSourceDescriptor, SubscriptionFilter, SlackChannelSummary, TelegramChatSummary, TelegramCommand, TelegramMemberSummary, TelegramTransportStatus, TelegramUpdateEnvelope, WorkspaceConfig, NotificationAudience, NotificationContext, NotificationDeepLink, NotificationDeliveryMode, NotificationPriority, NotificationReceiptPolicy, TemporalExecution, TemporalItem, TemporalRunLogEntry, HomeDescriptor, AreaDescriptor, IoTDeviceDescriptor, IoTStateSnapshot, IoTActionRequest, IoTActionResult, SceneRecord, AutomationRecord, PolicyRecord, ApprovalRecord, ConnectorDescriptor, RawIoTInvocation, IoTPolicyEvaluation, IoTEventRecord, LibraryAsset, LibraryAssignment, LibraryResolveResult, LibrarySyncResult, ContextPackListInput, ContextPackPrepareInput, ContextPackRecord, CommitmentAddInput, CommitmentCaptureInput, CommitmentCaptureResult, CommitmentLinkInput, CommitmentListInput, CommitmentOutcomeInput, CommitmentRecord, JudgmentImpact, JudgmentLinkInput, JudgmentListInput, JudgmentRecord, JudgmentRecordInput, LearningAddInput, LearningEvidenceInput, LearningListInput, LearningPromotionResult, LearningPromotionTarget, LearningRecord, OutcomeAddInput, OutcomeCaptureResult, OutcomeLinkInput, OutcomeListInput, OutcomeRecord, MediaGalleryShare, MediaKind, MediaListInput, MediaRecord, MediaSearchResult, SkillContextCapsule, SkillContextResolveResult, SkillCreateInput as SkillsV2CreateInput, SkillImportReport, SkillKind as SkillsV2Kind, SkillListFilter as SkillsV2ListFilter, SkillResolveContext as SkillsV2ResolveContext, SkillScope as SkillsV2Scope, SkillSpec as SkillsV2Spec, SkillSyncReport, SkillSyncTarget as SkillsV2SyncTarget, SkillUpdate as SkillsV2Update, SkillAssignment as SkillsV2Assignment, SoulAssignment, SoulCompileResult, SoulSpec, SoulValidationResult, UserAssignment, UserCompileProfile, UserCompileResult, UserCustomFact, UserDomainId, UserDomainState, UserEntity, UserEntityType, UserFact, UserFactSensitivity, UserFactValue, UserLink, UserMergeProposal, UserPackId, UserPackState, UserProposal, UserRecord, UserRecordType, UserSpec, UserValidationResult, RuleInput, RuleRecord, RuleScope, RuleScopeInput, RulesCompileInput, RulesCompileResult, } from "@clawjs/core";
import type { createTtsPlaybackPlan, segmentTextForTts, stripMarkdownForTts, TtsPlaybackPlan, } from "@clawjs/core";
import type { WorkspaceAuditLog } from "./host/audit.ts";
import type { NodeFileSystemHost } from "./host/filesystem.ts";
import type { NodeProcessHost } from "./host/process.ts";
import type { expandHome, resolveClawGlobalDataRoot, resolveClawWorkspaceSurfacePath } from "./surface-paths.ts";
import type { applyTemplatePack, ApplyTemplatePackOptions } from "./files/template-pack.ts";
import type { listManagedBlockProblems } from "./files/managed-blocks.ts";
import type { syncBinding } from "./bindings/sync.ts";
import type { renderSettingsTemplate } from "./bindings/render.ts";
import type { updateBindingSettings } from "./bindings/update.ts";
import type { readBindingStore, readSettingsSchemaRecord, readSettingsValuesRecord, resolveBindingsPath, resolveSettingsSchemaPath, resolveSettingsValuesPath, validateSettingsUpdate, writeBindingStore, writeSettingsSchemaRecord, writeSettingsValuesRecord, } from "./bindings/store.ts";
import type { readWorkspaceManifest, resolveManifestPath } from "./workspace/manifest.ts";
import type { buildOrchestrationSnapshot } from "./orchestration.ts";
import type { readCompatSnapshot, writeCompatSnapshot, resolveCompatSnapshotPath } from "./compat/store.ts";
import type { buildCompatDriftReport } from "./compat/drift.ts";
import type { readCapabilityReport, readChannelsStateSnapshot, readMemoryStateSnapshot, readProviderStateSnapshot, readSchedulerStateSnapshot, readSkillsStateSnapshot, readSlackStateSnapshot, readTelegramStateSnapshot, readWhatsAppStateSnapshot, readWorkspaceStateSnapshot, resolveCapabilityReportPath, resolveChannelsStatePath, resolveMemoryStatePath, resolveProviderStatePath, resolveSchedulerStatePath, resolveSkillsStatePath, resolveTelegramStatePath, resolveWorkspaceStatePath, writeCapabilityReport, writeChannelsStateSnapshot, writeMemoryStateSnapshot, writeProviderStateSnapshot, writeSchedulerStateSnapshot, writeSkillsStateSnapshot, writeWorkspaceStateSnapshot, } from "./state/store.ts";
import type { watchWorkspaceFile } from "./watch/index.ts";
import type { watchSessionTranscript } from "./watch/transcript.ts";
import type { ClawEventBus, ClawEvent, EventListener } from "./watch/events.ts";
import type { watchProviderStatus, watchRuntimeStatus, PollWatchOptions } from "./watch/status.ts";
import type { SessionStore } from "./sessions/store.ts";
import type { createSoulStore } from "./soul/store.ts";
import type { createUserStore } from "./user/store.ts";
import type { createContextStore } from "./context/store.ts";
import type { createCommitmentStore } from "./commitments/store.ts";
import type { createJudgmentStore } from "./judgment/store.ts";
import type { createLearningStore } from "./learning/store.ts";
import type { createOutcomeStore } from "./outcomes/store.ts";
import type { ChannelRunStore } from "./channel-runs/index.ts";
import type { ChannelRunOptions, ChannelRunTarget, ChannelRunMessage } from "./channel-runs/index.ts";
import type { streamRuntimeSession, streamRuntimeSessionEvents, SessionStreamEvent } from "./sessions/stream.ts";
import type { generateRuntimeSessionTitle } from "./sessions/title.ts";
import type { createDocumentStore } from "./documents/store.ts";
import type { createMediaStore, RegisterMediaInput } from "./media/store.ts";
import type { createDriveStorageShareAdapter, createLocalStorageStore, StorageDriveIndexAdapter, LocalStorageStore, StorageGetResult, StorageGrant, StorageListInput, StorageObject, StoragePutInput, StorageRef, StorageScopedToken, StorageShare, } from "./storage/index.ts";
import type { generateRuntimeText, GenerateTextInput, GenerateTextResult } from "./inference/generate-text.ts";
import type { createGenerationStore, CreateGenerationInput, GenerationBackendDescriptor, GenerationListOptions, GenerationRecord, RegisterCommandGenerationBackendInput, } from "./generations/store.ts";
import type { createImageLibraryStore, OPENAI_BACKEND_ID, ImageCreateInput, ImageEditInput, ImageImportInput, ImageListOptions, ImageRecord, } from "./images/store.ts";
import type { attachWorkspace, buildWorkspaceResetPlan, initializeWorkspace, inspectManagedWorkspaceFile, inspectWorkspaceFile, listManagedFiles, previewWorkspaceFile, readWorkspaceFile, repairWorkspace, resetWorkspace, resolveRuntimeFilePath, validateWorkspace, writeWorkspaceFile, writeWorkspaceFilePreservingManagedBlocks, PreserveManagedBlocksWriteOptions, } from "./workspace/manager.ts";
import type { buildCombinedDoctorReport } from "./doctor/run.ts";
import type { getRuntimeAdapter, getOpenClawGatewayStatus, restartOpenClawGateway, startOpenClawGateway, stopOpenClawGateway, waitForOpenClawGateway, callOpenClawGateway, discoverOpenClawAppContext, detachOpenClawAppContext, runOpenClawMemorySearch, OpenClawAppContext, resolveOpenClawContext, DiscoverOpenClawAppContextOptions, DetachOpenClawAppContextOptions, OpenClawRuntimeContext, OpenClawGatewayStatus, AuthDiagnostics, AuthLoginPlan, AuthLoginProgressEvent, AuthLoginResult, RuntimeAdapterOptions, RuntimeCommandSpec, RuntimeProgressEvent, RuntimeProgressPlan, RuntimeProgressSink, RuntimeProbeStatus, SaveApiKeyResult, } from "./runtime/index.ts";
import type { withOpenClawCommandEnv, withOpenClawCommandRunner } from "./runtime/openclaw-command.ts";
import type { mergeProcessEnv } from "./runtime/env.ts";
import type { disableManagedOpenClawPlugins, doctorOpenClawPlugins, enableManagedOpenClawPlugins, ensureOpenClawPluginBridge, getOpenClawPluginBridgeStatus, installManagedOpenClawPlugins, listOpenClawHooks, listOpenClawPlugins, resolveOpenClawPluginBridgePolicy, updateManagedOpenClawPlugins, OpenClawPluginBridgeMode, OpenClawManagedPluginTarget, } from "./runtime/plugins.ts";
import type { getSkillSource, listSkillSources, normalizeInstallRef, resolveSkillSourceFromRef, SkillSourceAdapter, } from "./skills/index.ts";
import type { SkillsImporter, SkillsStore as SkillsV2Store, SkillsSyncEngine, compileSkills as compileSkillsV2, createSkillsStore, generateBuiltinSkills as generateSkillsV2Builtins, } from "./skills-v2/index.ts";
import type { callTelegramApi, createTelegramService, downloadTelegramFile, TelegramConnectBotInput, TelegramSendMediaInput, TelegramSendMessageInput, TelegramStatusResult, TelegramWebhookConfigInput, TelegramSyncUpdatesOptions, TelegramBanOrRestrictInput, TelegramInviteLinkOptions } from "./telegram/index.ts";
import type { createChannelsRegistry, GrantChannelBindingInput, ReadChannelMessagesInput, RegisterChannelProcessorInput, RegisterChannelTargetInput, RegisterTelegramBotAccountInput, SendChannelMessageInput, UpsertChannelListenerInput } from "./channels/index.ts";
import type { invokeChannelProcessor, ChannelProcessorAction } from "./channels/processors.ts";
import type { callTelegramAccountBooleanMethod, callTelegramAccountRecordMethod, configureTelegramAccountWebhook, connectTelegramAccount, disableTelegramAccountWebhook, getTelegramAccountChat, getTelegramAccountCommands, listTelegramAccountChats, refreshTelegramAccountStatus, sendTelegramAccountMessage, setTelegramAccountCommands, syncTelegramAccount, telegramBanOrRestrictParams, telegramInviteLinkParams, } from "./channels/telegram.ts";
import type { createSlackService, SlackConnectBotInput, SlackSendMessageInput, SlackStatusResult } from "./slack/index.ts";
import type { createWhatsAppService, WhatsAppConnectInput, WhatsAppSendMessageInput, WhatsAppStatusResult } from "./whatsapp/index.ts";
import type { brokerSecretHttp, describeSecret, doctorKeychain, ensureHttpSecretReference, ensureTelegramBotSecretReference, getSecretCapabilities, listSecretActions, listSecretLeases, listSecrets, listSecretTypes, runSecretAction, EnsureSecretReferenceInput, EnsureSecretReferenceResult, SecretBrokerHttpInput, SecretBrokerHttpResult, SecretCapabilityStatus, SecretDoctorResult, SecretLeaseRecord, SecretProxyMetadata, SecretTypeDescriptor, SecretTypedActionDescriptor, } from "./secrets/index.ts";
import type { applyTextMutation, mergeManagedBlocks, MergeManagedBlocksOptions } from "./files/managed-blocks.ts";
import type { createLocalLibraryStore, libraryProjectionTargetFile, normalizeLibraryId, LibraryAssetInput, LibraryAssetUpdate, LibraryAssignInput, LibraryResolveInput, } from "./library/store.ts";
import type { createLocalRulesStore } from "./rules/store.ts";
import type { synthesize, listTtsProviders, getTtsCatalog, normalizeTtsConfig, TtsCatalog, TtsProviderConfig, TtsSynthesizeInput, TtsSynthesizeResult, TtsProvider, } from "./tts/index.ts";
import type { listSttProviders, normalizeSttConfig, transcribe as transcribeAudio, SttProviderConfig, SttTranscribeInput, SttTranscribeResult, } from "./stt/index.ts";
import type { createVoiceNoteStore, CreateVoiceNoteInput, RegisterVoiceNotePathInput, VoiceNoteListInput, VoiceNoteRecord, } from "./voice-notes/index.ts";
import type { patchIntentDomain, readAllIntentDomains, readIntentDomain, resolveIntentDomainPath, writeIntentDomain, } from "./intents/store.ts";
import type { requiresExplicitProviderEnable } from "./auth/openclaw-auth.ts";
import type { readAllObservedDomains, readObservedDomain, resolveObservedDomainPath, writeObservedDomain, } from "./observed/store.ts";
import type { NotifyClient, SendNotificationInput, UpsertSubscriptionInput } from "./notify/index.ts";
import type { IotClient } from "./iot/index.ts";
import type { EmbeddedTimeEngine, TimeClient, CreateTemporalItemInput, TemporalHeartbeatAgentRunner, TemporalHeartbeatCheckProvider, TimeServiceLike, UpdateTemporalItemInput, } from "./time/index.ts";
import type { ContentClient, ContentApprovalRequest, ContentAssetRef, ContentBrand, ContentCampaign, ContentDestination, ContentEntry, ContentOperation, ContentPublishPlan, ContentPublicationRun, ContentScopedTokenRecord, ContentVariant, } from "./content/index.ts";

import type { ClawInstance } from "./create-claw-instance.ts";

export type CreateClawTimeOptions =
  | { mode: "disabled" }
  | {
      mode: "client";
      baseUrl: string;
      token?: string;
    }
  | {
      mode: "embedded-on-demand";
      dbPath?: string;
      defaultTimeZone?: string;
      schedulerIntervalMs?: number;
      maxCatchUpPerCycle?: number;
      missedJobStaggerMs?: number;
      runLogLimit?: number;
      notifyBaseUrl?: string;
      notifySourceToken?: string;
      heartbeatChecks?: Record<string, TemporalHeartbeatCheckProvider>;
      heartbeatAgent?: TemporalHeartbeatAgentRunner;
    }
  | {
      mode: "scheduler";
      dbPath?: string;
      defaultTimeZone?: string;
      schedulerIntervalMs?: number;
      maxCatchUpPerCycle?: number;
      missedJobStaggerMs?: number;
      runLogLimit?: number;
      notifyBaseUrl?: string;
      notifySourceToken?: string;
      heartbeatChecks?: Record<string, TemporalHeartbeatCheckProvider>;
      heartbeatAgent?: TemporalHeartbeatAgentRunner;
    };

export interface CreateClawOptions {
  runtime: {
    adapter: RuntimeAdapterId;
    binaryPath?: string;
    agentDir?: string;
    provider?: string;
    model?: string;
    wire?: "chat_completions" | "responses";
    baseUrl?: string;
    secretRef?: string;
    envKey?: string;
    headers?: Record<string, string>;
    permissionMode?: "read-only" | "workspace-write" | "danger-full-access";
    homeDir?: string;
    configPath?: string;
    workspacePath?: string;
    authStorePath?: string;
    gateway?: {
      url?: string;
      token?: string;
      port?: number;
      configPath?: string;
    };
    pluginBridge?: {
      mode?: OpenClawPluginBridgeMode;
      packageSpec?: string;
      contextEnginePackageSpec?: string;
      installSource?: "npm";
      enableContextEngine?: boolean;
    };
    env?: NodeJS.ProcessEnv;
  };
  workspace: WorkspaceConfig;
  templates?: {
    pack?: string;
  };
  library?: {
    rootDir?: string;
    env?: NodeJS.ProcessEnv;
  };
  rules?: {
    rootDir?: string;
    env?: NodeJS.ProcessEnv;
  };
  guidance?: {
    rootDir?: string;
    env?: NodeJS.ProcessEnv;
  };
  resources?: {
    rootDir?: string;
    env?: NodeJS.ProcessEnv;
  };
  /**
   * Skills-v2 (unified SKILL.md) configuration. Defaults: ~/.claw as home,
   * auto-import enabled. Overridable via `CLAW_HOME` env var.
   */
  skills?: {
    homeDir?: string;
    env?: NodeJS.ProcessEnv;
    autoImport?: boolean;
  };
  images?: {
    rootDir?: string;
    env?: NodeJS.ProcessEnv;
    allowEnvCredentials?: boolean;
    openaiBaseUrl?: string;
  };
  storage?: {
    grants?: StorageGrant[];
    driveIndex?: StorageDriveIndexAdapter;
    share?: {
      driveBaseUrl: string;
      token: string;
    };
  };
  secrets?: {
    backend?: "local_proxy" | "secrets";
    baseUrl?: string;
    credential?: string;
    tenantId?: string;
    sidecarPath?: string;
    env?: NodeJS.ProcessEnv;
  };
  notify?: {
    baseUrl: string;
    sourceToken?: string;
    clientToken?: string;
  };
  time?: CreateClawTimeOptions;
  content?: {
    baseUrl: string;
    token?: string;
  };
  iot?: {
    baseUrl: string;
    token?: string;
    homeId?: string;
  };
}

export type TemporalListFilters = {
  status?: TemporalItem["status"];
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  ownerId?: string;
  sourceProvider?: string;
};

export type TemporalTarget = {
  anchorType?: NonNullable<TemporalItem["anchorType"]>;
  anchorId?: string;
  anchorAt?: string;
};

export type TemporalWatchInput = TemporalTarget & {
  target: string;
  after: string;
  ifNo?: "reply";
  title?: string;
  then?: string | { kind: "remind"; title: string };
  timezone?: string;
  description?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
};

export type TemporalReminderAfterInput = TemporalTarget & {
  after: string;
  title: string;
  timezone?: string;
  description?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
};

export type TemporalNaturalCreateInput = Omit<CreateTemporalItemInput, "kind" | "natural"> & {
  expression: string;
  timezone?: string;
};

export interface ClawFactory {
  (options: CreateClawOptions): Promise<ClawInstance>;
  create: (options: CreateClawOptions) => Promise<ClawInstance>;
}
