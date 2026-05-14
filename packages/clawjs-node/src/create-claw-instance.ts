import type { Attachment, AuthState, BindingDefinition, ChannelDescriptor, ChannelAccountDescriptor, ChannelAgentBinding, ChannelEventRecord, ChannelListenerDescriptor, ChannelMessageRecord, ChannelPermission, ChannelProcessorDescriptor, ChannelTargetDescriptor, ClawManifest, SessionPolicy, SessionSearchInput, SessionSearchResult, SessionTransport, DefaultModelRef, DocumentRecord, DocumentRef, DocumentSearchResult, IntentDomain, MemoryDescriptor, ModelCatalog, ModelDescriptor, RuntimeFeatureDescriptor, ObservedDomain, PromptContextBlock, ProviderDescriptor, ProviderCatalog, ProviderAuthSummary, RuntimeCapabilitySupport, RuntimeAdapterId, RuntimeFileDescriptor, SchedulerDescriptor, SkillCatalogEntry, SkillDescriptor, SkillInstallResult, SkillSearchResult, SkillSourceDescriptor, SubscriptionFilter, SlackChannelSummary, TelegramChatSummary, TelegramCommand, TelegramMemberSummary, TelegramTransportStatus, TelegramUpdateEnvelope, WorkspaceConfig, NotificationAudience, NotificationContext, NotificationDeepLink, NotificationDeliveryMode, NotificationPriority, NotificationReceiptPolicy, TemporalExecution, TemporalItem, TemporalRunLogEntry, HomeDescriptor, AreaDescriptor, ThingDescriptor, IoTStateSnapshot, IoTActionRequest, IoTActionResult, SceneRecord, AutomationRecord, PolicyRecord, ApprovalRecord, ConnectorDescriptor, RawIoTInvocation, IoTPolicyEvaluation, IoTEventRecord, LibraryAsset, LibraryAssignment, LibraryResolveResult, LibrarySyncResult, ContextPackListInput, ContextPackPrepareInput, ContextPackRecord, CommitmentAddInput, CommitmentCaptureInput, CommitmentCaptureResult, CommitmentLinkInput, CommitmentListInput, CommitmentOutcomeInput, CommitmentRecord, JudgmentImpact, JudgmentLinkInput, JudgmentListInput, JudgmentRecord, JudgmentRecordInput, LearningAddInput, LearningEvidenceInput, LearningListInput, LearningPromotionResult, LearningPromotionTarget, LearningRecord, OutcomeAddInput, OutcomeCaptureResult, OutcomeLinkInput, OutcomeListInput, OutcomeRecord, MediaGalleryShare, MediaKind, MediaListInput, MediaRecord, MediaSearchResult, SkillContextCapsule, SkillContextResolveResult, SkillCreateInput as SkillsV2CreateInput, SkillImportReport, SkillKind as SkillsV2Kind, SkillListFilter as SkillsV2ListFilter, SkillResolveContext as SkillsV2ResolveContext, SkillScope as SkillsV2Scope, SkillSpec as SkillsV2Spec, SkillSyncReport, SkillSyncTarget as SkillsV2SyncTarget, SkillUpdate as SkillsV2Update, SkillAssignment as SkillsV2Assignment, SoulAssignment, SoulCompileResult, SoulSpec, SoulValidationResult, UserAssignment, UserCompileProfile, UserCompileResult, UserCustomFact, UserDomainId, UserDomainState, UserEntity, UserEntityType, UserFact, UserFactSensitivity, UserFactValue, UserLink, UserMergeProposal, UserPackId, UserPackState, UserProposal, UserRecord, UserRecordType, UserSpec, UserValidationResult, RuleInput, RuleRecord, RuleScope, RuleScopeInput, RulesCompileInput, RulesCompileResult, } from "@clawjs/core";
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
import type { createWorkspaceDataStore, WorkspaceDataStore } from "./data/store.ts";
import type { createDocumentStore, resolveLegacyDocumentRefs } from "./documents/store.ts";
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
import type { SkillsImporter, SkillsStore as SkillsV2Store, SkillsSyncEngine, compileSkills as compileSkillsV2, createSkillsStore, generateBuiltinSkills as generateSkillsV2Builtins, migrateLegacyState as migrateSkillsV2LegacyState, } from "./skills-v2/index.ts";
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

import type { TemporalListFilters, TemporalNaturalCreateInput, TemporalReminderAfterInput, TemporalWatchInput } from "./create-claw-options.ts";

export interface ClawInstance {
  runtime: {
    context: () => OpenClawRuntimeContext | null;
    status: () => Promise<RuntimeProbeStatus>;
    gateway: {
      status: () => Promise<OpenClawGatewayStatus>;
      start: () => Promise<void>;
      stop: () => Promise<void>;
      restart: () => Promise<void>;
      waitUntilReady: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<OpenClawGatewayStatus>;
      call: (method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }) => Promise<unknown>;
    };
    plugins: {
      status: () => Promise<{
        supported: boolean;
        mode: OpenClawPluginBridgeMode;
        installSource: "npm";
        configPath?: string;
        diagnostics: string[];
        plugins: object[];
        basePlugin: object;
        contextPlugin: object;
      }>;
      list: () => Promise<{
        workspaceDir?: string;
        plugins: object[];
        diagnostics: Array<{ level?: string; message?: string } | string>;
      }>;
      doctor: () => Promise<{
        ok: boolean;
        output: string;
        issues: string[];
      }>;
      install: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      enable: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      disable: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      update: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      ensure: () => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      claw: {
        status: () => Promise<unknown>;
        events: {
          list: (input?: { limit?: number; kind?: string; name?: string; sessionKey?: string; runId?: string }) => Promise<unknown>;
        };
        sessions: {
          inspect: (input: { sessionKey: string }) => Promise<unknown>;
        };
        subagent: {
          run: (input: {
            sessionKey: string;
            message: string;
            extraSystemPrompt?: string;
            lane?: string;
            deliver?: boolean;
            idempotencyKey?: string;
          }) => Promise<unknown>;
          wait: (input: { runId: string; timeoutMs?: number }) => Promise<unknown>;
          messages: (input: { sessionKey: string; limit?: number }) => Promise<unknown>;
        };
        hooks: {
          status: () => Promise<unknown>;
          list: () => Promise<unknown>;
        };
        context: {
          status: () => Promise<unknown>;
        };
        doctor: () => Promise<unknown>;
      };
      clawjs: {
        status: () => Promise<unknown>;
        events: {
          list: (input?: { limit?: number; kind?: string; name?: string; sessionKey?: string; runId?: string }) => Promise<unknown>;
        };
        sessions: {
          inspect: (input: { sessionKey: string }) => Promise<unknown>;
        };
        subagent: {
          run: (input: {
            sessionKey: string;
            message: string;
            extraSystemPrompt?: string;
            lane?: string;
            deliver?: boolean;
            idempotencyKey?: string;
          }) => Promise<unknown>;
          wait: (input: { runId: string; timeoutMs?: number }) => Promise<unknown>;
          messages: (input: { sessionKey: string; limit?: number }) => Promise<unknown>;
        };
        hooks: {
          status: () => Promise<unknown>;
          list: () => Promise<unknown>;
        };
        context: {
          status: () => Promise<unknown>;
        };
        doctor: () => Promise<unknown>;
      };
    };
    openclaw: {
      sessions: {
        list: (input?: Record<string, unknown>) => Promise<unknown>;
        preview: (input?: Record<string, unknown>) => Promise<unknown>;
        resolve: (input?: Record<string, unknown>) => Promise<unknown>;
      };
      chat: {
        history: (input: Record<string, unknown>) => Promise<unknown>;
        send: (input: Record<string, unknown>) => Promise<unknown>;
        inject: (input: Record<string, unknown>) => Promise<unknown>;
        abort: (input: Record<string, unknown>) => Promise<unknown>;
      };
    };
    install: (installer?: "npm" | "pnpm", onProgress?: RuntimeProgressSink) => Promise<void>;
    uninstall: (installer?: "npm" | "pnpm", onProgress?: RuntimeProgressSink) => Promise<void>;
    repair: (onProgress?: RuntimeProgressSink) => Promise<void>;
    setupWorkspace: (onProgress?: RuntimeProgressSink) => Promise<void>;
    installCommand: (installer?: "npm" | "pnpm") => RuntimeCommandSpec;
    uninstallCommand: (installer?: "npm" | "pnpm") => RuntimeCommandSpec;
    repairCommand: () => RuntimeCommandSpec;
    setupWorkspaceCommand: () => RuntimeCommandSpec;
      installPlan: (installer?: "npm" | "pnpm") => RuntimeProgressPlan;
      uninstallPlan: (installer?: "npm" | "pnpm") => RuntimeProgressPlan;
      repairPlan: () => RuntimeProgressPlan;
      setupWorkspacePlan: () => RuntimeProgressPlan;
      discoverContext: (options?: Omit<DiscoverOpenClawAppContextOptions, "configPath" | "stateDir" | "workspaceDir" | "agentDir" | "sessionsDir" | "env">) => OpenClawAppContext | null;
      detachWorkspace: (options?: Omit<DetachOpenClawAppContextOptions, "configPath" | "stateDir" | "workspaceDir" | "agentDir" | "sessionsDir" | "env">) => Promise<Awaited<ReturnType<typeof detachOpenClawAppContext>> | null>;
    };
  workspace: {
    init: () => Promise<void>;
    attach: () => Promise<ClawManifest | null>;
    validate: () => Promise<ReturnType<typeof validateWorkspace>>;
    repair: () => Promise<ReturnType<typeof repairWorkspace>>;
    previewReset: (options?: Parameters<typeof buildWorkspaceResetPlan>[1]) => Promise<ReturnType<typeof buildWorkspaceResetPlan>>;
    reset: (options?: Parameters<typeof resetWorkspace>[1]) => Promise<ReturnType<typeof resetWorkspace>>;
    listManagedFiles: () => Promise<string[]>;
    canonicalPaths: () => Record<string, string>;
    inspect: () => Promise<{
      manifestPath: string;
      compatSnapshotPath: string;
      capabilityReportPath: string;
      bindingsPath: string;
      settingsSchemaPath: string;
      settingsValuesPath: string;
      workspaceStatePath: string;
      providerStatePath: string;
      schedulerStatePath: string;
      memoryStatePath: string;
      skillsStatePath: string;
      channelsStatePath: string;
      telegramStatePath: string;
      intentPaths: Record<IntentDomain, string>;
      observedPaths: Record<ObservedDomain, string>;
      manifest: ReturnType<typeof readWorkspaceManifest>;
      compatSnapshot: ReturnType<typeof readCompatSnapshot>;
      capabilityReport: ReturnType<typeof readCapabilityReport>;
      workspaceState: ReturnType<typeof readWorkspaceStateSnapshot>;
      providerState: ReturnType<typeof readProviderStateSnapshot>;
      schedulerState: ReturnType<typeof readSchedulerStateSnapshot>;
      memoryState: ReturnType<typeof readMemoryStateSnapshot>;
      skillsState: ReturnType<typeof readSkillsStateSnapshot>;
      channelsState: ReturnType<typeof readChannelsStateSnapshot>;
      telegramState: ReturnType<typeof readTelegramStateSnapshot>;
      slackState: ReturnType<typeof readSlackStateSnapshot>;
      whatsappState: ReturnType<typeof readWhatsAppStateSnapshot>;
      intents: ReturnType<typeof readAllIntentDomains>;
      observed: ReturnType<typeof readAllObservedDomains>;
    }>;
  };
  intent: {
    get: (domain?: IntentDomain) => unknown;
    set: (domain: IntentDomain, value: Record<string, unknown>) => unknown;
    patch: (domain: IntentDomain, patch: Record<string, unknown>) => unknown;
    plan: (options?: { domains?: IntentDomain[]; dryRun?: boolean }) => Promise<{
      generatedAt: string;
      domains: IntentDomain[];
      dryRun: boolean;
      actions: Array<{
        domain: IntentDomain;
        featureId: string;
        ownership: RuntimeFeatureDescriptor["ownership"];
        supported: boolean;
        needsApply: boolean;
        message: string;
      }>;
    }>;
    apply: (options?: { domains?: IntentDomain[]; dryRun?: boolean }) => Promise<{
      appliedAt: string;
      domains: IntentDomain[];
      dryRun: boolean;
      actions: Array<{
        domain: IntentDomain;
        featureId: string;
        ownership: RuntimeFeatureDescriptor["ownership"];
        supported: boolean;
        status: "planned" | "applied" | "skipped" | "unsupported";
        message: string;
      }>;
    }>;
    diff: (options?: { domains?: IntentDomain[] }) => Promise<{
      generatedAt: string;
      domains: IntentDomain[];
      drifted: boolean;
      issues: Array<{
        domain: IntentDomain;
        path: string;
        message: string;
        expected?: unknown;
        actual?: unknown;
      }>;
    }>;
  };
  observed: {
    read: (domain?: ObservedDomain) => unknown;
    refresh: (options?: { domains?: ObservedDomain[] }) => Promise<unknown>;
  };
  features: {
    describe: () => RuntimeFeatureDescriptor[];
  };
  files: {
    applyTemplatePack: (templatePackPath?: string, options?: Omit<ApplyTemplatePackOptions, "workspaceDir">) => Promise<ReturnType<typeof applyTemplatePack>>;
    diffBinding: <TSettings>(binding: BindingDefinition, settings: TSettings, render: (settings: TSettings) => string) => ReturnType<typeof syncBinding<TSettings>>;
    syncBinding: <TSettings>(binding: BindingDefinition, settings: TSettings, render: (settings: TSettings) => string) => ReturnType<typeof syncBinding<TSettings>>;
    readBindingStore: () => ReturnType<typeof readBindingStore>;
    writeBindingStore: (bindings: BindingDefinition[]) => ReturnType<typeof writeBindingStore>;
    readSettingsSchema: () => ReturnType<typeof readSettingsSchemaRecord>;
    writeSettingsSchema: (settingsSchema: Record<string, unknown>) => ReturnType<typeof writeSettingsSchemaRecord>;
    readSettingsValues: () => ReturnType<typeof readSettingsValuesRecord>;
    writeSettingsValues: (values: Record<string, unknown>) => ReturnType<typeof writeSettingsValuesRecord>;
    validateSettings: (values: Record<string, unknown>) => ReturnType<typeof validateSettingsUpdate>;
    renderTemplate: (template: string, values: Record<string, unknown>) => string;
    updateSettings: (
      values: Record<string, unknown>,
      options: {
        autoSync?: boolean;
        renderers?: Record<string, (settings: Record<string, unknown>) => string>;
        reenableOptionalBindings?: string[];
      },
    ) => ReturnType<typeof updateBindingSettings>;
    readWorkspaceFile: (relativePath: string) => ReturnType<typeof readWorkspaceFile>;
    writeWorkspaceFile: (relativePath: string, content: string) => ReturnType<typeof writeWorkspaceFile>;
    writeWorkspaceFilePreservingManagedBlocks: (
      relativePath: string,
      content: string,
      options?: PreserveManagedBlocksWriteOptions,
    ) => ReturnType<typeof writeWorkspaceFilePreservingManagedBlocks>;
    previewWorkspaceFile: (relativePath: string, content: string) => ReturnType<typeof previewWorkspaceFile>;
    inspectWorkspaceFile: (relativePath: string) => ReturnType<typeof inspectWorkspaceFile>;
    inspectManagedBlock: (relativePath: string, blockId: string) => ReturnType<typeof inspectManagedWorkspaceFile>;
    mergeManagedBlocks: (originalContent: string, editedContent: string, options?: MergeManagedBlocksOptions) => string;
  };
  /**
   * @deprecated Souls are now skills-v2 entries with `kind: personality`.
   * Use `claw.skills.create / activate / compile` for new code. The
   * `claw.soul.*` API is preserved as a compatibility shim.
   */
  soul: {
    list: () => SoulSpec[];
    get: (id: string) => SoulSpec | null;
    init: (input?: { id?: string; title?: string; description?: string; presetId?: string; extends?: string[]; modules?: Partial<SoulSpec["modules"]> }) => SoulSpec;
    assign: (input: { soulId: string; agentId: string }) => SoulAssignment;
    assignmentForAgent: (agentId: string) => SoulAssignment | null;
    resolve: (input?: { soulId?: string; agentId?: string }) => SoulSpec;
    validate: (input?: SoulSpec) => SoulValidationResult;
    preview: (input?: { soulId?: string; agentId?: string }) => SoulCompileResult;
    compile: (input?: { soulId?: string; agentId?: string; write?: boolean }) => SoulCompileResult;
    inspect: (id?: string, agentId?: string) => ReturnType<ReturnType<typeof createSoulStore>["inspect"]>;
  };
  user: {
    list: () => UserSpec[];
    get: (id: string) => UserSpec | null;
    init: (input?: { id?: string; displayName?: string; isDefault?: boolean }) => UserSpec;
    packs: (userId?: string) => Array<UserPackState & { availableFacets: string[]; availableRecords: string[]; availableEntities: string[] }>;
    enablePack: (input: { userId?: string; id: UserPackId }) => UserPackState;
    disablePack: (input: { userId?: string; id: UserPackId }) => UserPackState;
    domains: (userId?: string) => Array<UserDomainState & { pack: UserPackId; availableFacets: string[]; availableRecords: string[]; availableEntities: string[] }>;
    enableDomain: (input: { userId?: string; id: UserDomainId }) => UserDomainState;
    disableDomain: (input: { userId?: string; id: UserDomainId }) => UserDomainState;
    set: (input: { userId?: string; path: string; value: UserFactValue; domain?: UserDomainId; supersedes?: string; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserFact;
    add: (input: { userId?: string; type: UserRecordType; title: string; fields?: Record<string, UserFactValue>; domain?: UserDomainId; supersedes?: string; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserRecord;
    wizard: (input: { userId?: string; domain: UserPackId | UserDomainId; title: string; fields?: Record<string, UserFactValue>; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserProposal;
    addEntity: (input: { userId?: string; type: UserEntityType; title: string; fields?: Record<string, UserFactValue>; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserEntity;
    getEntity: (id: string, userId?: string) => UserEntity | null;
    listEntities: (input?: { userId?: string; type?: UserEntityType }) => UserEntity[];
    link: (input: { userId?: string; from: string; relation: string; to: string; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserLink;
    query: (input?: { userId?: string; domain?: UserPackId | UserDomainId; type?: string; status?: string; sensitivity?: UserFactSensitivity; source?: string; date?: string; text?: string }) => ReturnType<ReturnType<typeof createUserStore>["query"]>;
    delete: (id: string, userId?: string) => { id: string; deleted: boolean };
    review: {
      list: (input?: { userId?: string; status?: UserProposal["status"] }) => UserProposal[];
      show: (id: string, userId?: string) => UserProposal;
      approve: (id: string, userId?: string) => UserProposal;
      reject: (id: string, userId?: string, reason?: string) => UserProposal;
      edit: (id: string, patch: Partial<UserProposal>, userId?: string) => UserProposal;
      approveMany: (ids: string[], userId?: string) => UserProposal[];
    };
    merge: {
      propose: (input?: { userId?: string; sourceId?: string; targetId?: string }) => UserMergeProposal[];
      approve: (id: string, userId?: string) => UserMergeProposal;
      reject: (id: string, userId?: string) => UserMergeProposal;
    };
    supersede: (id: string, input: { userId?: string; value?: UserFactValue; title?: string; fields?: Record<string, UserFactValue>; notes?: string; validFrom?: string; visibility?: "agent" | "public" | "private" }) => UserFact | UserRecord | UserCustomFact;
    classify: (text: string) => ReturnType<ReturnType<typeof createUserStore>["classify"]>;
    extractMemory: (input: { userId?: string; source: string }) => UserProposal[];
    propose: (input: { userId?: string; path?: string; value?: UserFactValue; recordType?: UserRecordType; title?: string; fields?: Record<string, UserFactValue>; domain?: UserDomainId; source?: string; sensitivity?: UserFactSensitivity; confidence?: number; notes?: string; visibility?: "agent" | "public" | "private" }) => UserProposal;
    verify: (proposalId: string, userId?: string) => UserProposal;
    assign: (input: { userId: string; agentId: string }) => UserAssignment;
    assignmentForAgent: (agentId: string) => UserAssignment | null;
    resolve: (input?: { userId?: string; agentId?: string }) => UserSpec;
    validate: (input?: UserSpec) => UserValidationResult;
    preview: (input?: { userId?: string; agentId?: string; profile?: UserCompileProfile }) => UserCompileResult;
    compile: (input?: { userId?: string; agentId?: string; write?: boolean; profile?: UserCompileProfile }) => UserCompileResult;
    inspect: (id?: string, agentId?: string) => ReturnType<ReturnType<typeof createUserStore>["inspect"]>;
  };
  compat: {
    refresh: () => Promise<ReturnType<typeof writeCompatSnapshot>>;
    read: () => ReturnType<typeof readCompatSnapshot>;
  };
  doctor: {
    run: () => Promise<ReturnType<typeof buildCombinedDoctorReport>>;
  };
  models: {
    list: () => Promise<ModelDescriptor[]>;
    catalog: () => Promise<ModelCatalog>;
    getDefault: () => Promise<DefaultModelRef | null>;
    setDefault: (model: string) => Promise<string>;
  };
  providers: {
    list: () => Promise<ProviderDescriptor[]>;
    catalog: () => Promise<ProviderCatalog>;
    authState: () => Promise<AuthState>;
  };
  auth: {
    status: () => Promise<Record<string, ProviderAuthSummary>>;
    diagnostics: (provider?: string) => AuthDiagnostics;
    prepareLogin: (provider: string) => Promise<AuthLoginPlan>;
    login: (provider: string, options?: {
      setDefault?: boolean;
      env?: NodeJS.ProcessEnv;
      onProgress?: (event: AuthLoginProgressEvent) => void;
    }) => Promise<AuthLoginResult>;
    setApiKey: (provider: string, key: string, profileId?: string) => {
      profileId: string;
      provider: string;
      authType: string;
      maskedCredential?: string | null;
    };
    saveApiKey: (
      provider: string,
      key: string,
      options?: {
        profileId?: string;
        runtimeCommand?: RuntimeCommandSpec;
      },
    ) => Promise<SaveApiKeyResult>;
    setProviderEnabled: (
      provider: string,
      enabled: boolean,
      options?: {
        preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
        secretRef?: string | null;
        profileId?: string | null;
        metadata?: Record<string, unknown>;
      },
    ) => Promise<void>;
    removeProvider: (provider: string) => number;
  };
  scheduler: {
    list: () => Promise<SchedulerDescriptor[]>;
    run: (id: string) => Promise<void>;
    enable: (id: string) => Promise<void>;
    disable: (id: string) => Promise<void>;
  };
  memory: {
    list: () => Promise<MemoryDescriptor[]>;
    search: (query: string) => Promise<MemoryDescriptor[]>;
  };
  learning: {
    capture: (input: { sessionId: string }) => ReturnType<ReturnType<typeof createLearningStore>["captureSession"]>;
    add: (input: LearningAddInput) => LearningRecord;
    list: (input?: LearningListInput) => LearningRecord[];
    show: (id: string) => LearningRecord | null;
    addEvidence: (id: string, input: LearningEvidenceInput) => LearningRecord;
    promote: (id: string, input: { to: LearningPromotionTarget; dryRun?: boolean; apply?: boolean }) => LearningPromotionResult;
    archive: (id: string, reason?: string) => LearningRecord;
  };
  outcomes: {
    add: (input: OutcomeAddInput) => OutcomeRecord;
    capture: (input: { sessionId: string }) => OutcomeCaptureResult;
    list: (input?: OutcomeListInput) => OutcomeRecord[];
    show: (id: string) => OutcomeRecord | null;
    link: (id: string, input: OutcomeLinkInput) => OutcomeRecord;
    archive: (id: string, reason?: string) => OutcomeRecord;
  };
  context: {
    prepare: (input: ContextPackPrepareInput) => ContextPackRecord;
    list: (input?: ContextPackListInput) => ContextPackRecord[];
    show: (id: string) => ContextPackRecord | null;
    archive: (id: string, reason?: string) => ContextPackRecord;
  };
  commitments: {
    capture: (input: CommitmentCaptureInput) => CommitmentCaptureResult;
    add: (input: CommitmentAddInput) => Promise<CommitmentRecord>;
    list: (input?: CommitmentListInput) => CommitmentRecord[];
    show: (id: string) => CommitmentRecord | null;
    fulfill: (id: string, input: CommitmentOutcomeInput) => CommitmentRecord;
    miss: (id: string, input: CommitmentOutcomeInput) => CommitmentRecord;
    cancel: (id: string, reason?: string) => CommitmentRecord;
    link: (id: string, input: CommitmentLinkInput) => CommitmentRecord;
  };
  judgment: {
    prepare: (input: { question: string; domain: string; impact?: JudgmentImpact; options?: string[]; sessionId?: string; metadata?: Record<string, unknown> }) => JudgmentRecord;
    record: (id: string, input: JudgmentRecordInput) => JudgmentRecord;
    list: (input?: JudgmentListInput) => JudgmentRecord[];
    show: (id: string) => JudgmentRecord | null;
    link: (id: string, input: JudgmentLinkInput) => JudgmentRecord;
    archive: (id: string, reason?: string) => JudgmentRecord;
  };
  rules: {
    status: () => ReturnType<ReturnType<typeof createLocalRulesStore>["status"]>;
    list: (options?: { status?: RuleRecord["status"]; scopeId?: string }) => RuleRecord[];
    get: (id: string) => RuleRecord | null;
    scopes: () => RuleScope[];
    upsertScope: (input: RuleScopeInput) => RuleScope;
    propose: (input: RuleInput) => RuleRecord;
    approve: (id: string) => RuleRecord;
    archive: (id: string) => RuleRecord;
    compile: (input: RulesCompileInput) => RulesCompileResult;
  };
  skills: {
    /** @deprecated v1 skill descriptors. Use `listV2()` for the unified Skill model. */
    list: () => Promise<SkillDescriptor[]>;
    /** @deprecated v1 sync via runtime adapter. Use `syncV2()` for the unified sync engine. */
    sync: () => Promise<SkillDescriptor[]>;
    /** @deprecated v1 source adapters. */
    sources: () => Promise<SkillSourceDescriptor[]>;
    /** @deprecated v1 search via source adapters. Use `searchV2()` for central skill search. */
    search: (query: string, options?: { source?: string; limit?: number }) => Promise<SkillSearchResult>;
    /** @deprecated v1 install via source adapters. */
    install: (ref: string, options?: { source?: string }) => Promise<SkillInstallResult & { syncedSkills?: SkillDescriptor[] }>;

    // ───── Skills v2 (unified SKILL.md / agentskills.io) ──────────────────
    /** List all skills under ~/.claw/skills (skills-v2 unified model). */
    listV2: (filter?: SkillsV2ListFilter) => SkillsV2Spec[];
    /** Get a single skill by slug. */
    get: (slug: string) => SkillsV2Spec | null;
    /** Free-text search over name+description+tags+body. */
    searchV2: (query: string, options?: { kinds?: SkillsV2Kind[]; tags?: string[] }) => SkillsV2Spec[];
    /** Resolve active skills for a given context (chat > project > tag > global). */
    resolveActive: (ctx?: SkillsV2ResolveContext) => SkillsV2Spec[];
    create: (input: SkillsV2CreateInput) => SkillsV2Spec;
    update: (slug: string, patch: SkillsV2Update) => SkillsV2Spec;
    removeV2: (slug: string) => boolean;
    activate: (slug: string, scope: SkillsV2Scope, opts?: { priority?: number; params?: Record<string, unknown> }) => SkillsV2Assignment;
    deactivate: (slug: string, scope: SkillsV2Scope) => boolean;
    instantiate: (templateSlug: string, params: Record<string, unknown>, opts?: { saveAs?: string; freeze?: boolean }) => SkillsV2Spec;
    freeze: (instanceSlug: string) => SkillsV2Spec;
    /** Materialize syncTo metadata into filesystem entries in registered targets. */
    syncV2: (opts?: { targets?: string[] }) => Promise<SkillSyncReport>;
    syncTargets: () => SkillsV2SyncTarget[];
    registerSyncTarget: (target: SkillsV2SyncTarget) => SkillsV2SyncTarget;
    importExternal: (opts?: { dirs?: string[] }) => Promise<SkillImportReport>;
    /** Compile a set of skill slugs into a single system-prompt fragment. */
    compile: (slugs: string[]) => string;
    /** Generate the built-in skills (14 personality presets + 20 procedures). Idempotent. */
    initBuiltins: () => { personalitiesCreated: number; proceduresCreated: number; skipped: number };
  };
  /**
   * @deprecated Library assets (skills, instructions, bundles) are unified
   * under skills-v2. Use `claw.skills.create / compile / activate` for new
   * code. The `claw.library.*` API is preserved as a compatibility shim.
   */
  library: {
    list: () => LibraryAsset[];
    get: (id: string) => LibraryAsset | null;
    create: (input: LibraryAssetInput) => LibraryAsset;
    update: (id: string, patch: LibraryAssetUpdate) => LibraryAsset;
    remove: (id: string) => boolean;
    importSkill: (ref: string, options?: { id?: string; title?: string; source?: string; path?: string; tags?: string[]; context?: SkillContextCapsule }) => LibraryAsset;
    createInstruction: (input: Omit<LibraryAssetInput, "kind"> & { content: string; projection: NonNullable<LibraryAssetInput["projection"]> }) => LibraryAsset;
    createBundle: (input: Omit<LibraryAssetInput, "kind"> & { bundleAssetIds: string[] }) => LibraryAsset;
    assign: (input: LibraryAssignInput) => LibraryAssignment;
    unassign: (input: LibraryAssignInput) => boolean;
    resolve: (input?: LibraryResolveInput) => LibraryResolveResult;
    resolveSkillCapsules: (input?: LibraryResolveInput & { includeDefault?: boolean }) => SkillContextResolveResult;
    sync: (input?: LibraryResolveInput & { allowMissingSecrets?: boolean }) => Promise<LibrarySyncResult>;
  };
  generations: {
    backends: () => GenerationBackendDescriptor[];
    registerCommandBackend: (input: RegisterCommandGenerationBackendInput) => GenerationBackendDescriptor;
    removeBackend: (id: string) => boolean;
    create: (input: CreateGenerationInput) => Promise<GenerationRecord>;
    list: (options?: GenerationListOptions) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  image: {
    backends: () => GenerationBackendDescriptor[];
    create: (input: Omit<ImageCreateInput, "workspaceId" | "agentId"> & { backendId?: string; command?: string; args?: string[]; cwd?: string; env?: Record<string, string>; outputExtension?: string; mimeType?: string }) => Promise<ImageRecord>;
    generate: (input: Omit<CreateGenerationInput, "kind"> & Partial<ImageCreateInput>) => Promise<ImageRecord>;
    edit: (input: Omit<ImageEditInput, "workspaceId" | "agentId"> & { backendId?: string; command?: string; args?: string[]; cwd?: string; env?: Record<string, string>; outputExtension?: string; mimeType?: string }) => Promise<ImageRecord>;
    import: (input: Omit<ImageImportInput, "workspaceId" | "agentId">) => ImageRecord;
    list: (options?: Omit<GenerationListOptions, "kind"> & ImageListOptions) => ImageRecord[];
    search: (options?: ImageListOptions) => ImageRecord[];
    get: (id: string) => ImageRecord | null;
    remove: (id: string) => boolean;
  };
  audio: {
    backends: () => GenerationBackendDescriptor[];
    generate: (input: Omit<CreateGenerationInput, "kind">) => Promise<GenerationRecord>;
    list: (options?: Omit<GenerationListOptions, "kind">) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  video: {
    backends: () => GenerationBackendDescriptor[];
    generate: (input: Omit<CreateGenerationInput, "kind">) => Promise<GenerationRecord>;
    list: (options?: Omit<GenerationListOptions, "kind">) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  tts: {
    synthesize: (input: TtsSynthesizeInput) => Promise<TtsSynthesizeResult>;
    config: () => TtsProviderConfig;
    setConfig: (input?: TtsProviderConfig | null) => TtsProviderConfig;
    providers: () => ReturnType<typeof listTtsProviders>;
    catalog: () => TtsCatalog;
    normalizeConfig: (input?: TtsProviderConfig | null) => TtsProviderConfig;
    stripMarkdown: (text: string) => string;
    segmentText: (text: string, options?: { maxSegmentLength?: number }) => string[];
    createPlaybackPlan: (input: { text: string; maxSegmentLength?: number }) => TtsPlaybackPlan;
  };
  stt: {
    transcribe: (input: SttTranscribeInput) => Promise<SttTranscribeResult>;
    config: () => SttProviderConfig;
    setConfig: (input?: SttProviderConfig | null) => SttProviderConfig;
    providers: () => ReturnType<typeof listSttProviders>;
    normalizeConfig: (input?: SttProviderConfig | null) => SttProviderConfig;
  };
  voiceNotes: {
    create: (input: CreateVoiceNoteInput) => VoiceNoteRecord;
    registerPath: (input: RegisterVoiceNotePathInput) => VoiceNoteRecord;
    list: (input?: VoiceNoteListInput) => VoiceNoteRecord[];
    get: (id: string) => VoiceNoteRecord | null;
    download: (id: string) => { note: VoiceNoteRecord; filePath: string; buffer: Buffer } | null;
    transcribe: (id: string, input?: SttProviderConfig) => Promise<VoiceNoteRecord>;
  };
  channels: {
    list: () => Promise<ChannelDescriptor[]>;
    accounts: {
      registerTelegramBot: (input: RegisterTelegramBotAccountInput & Omit<TelegramConnectBotInput, "secretName">) => Promise<ChannelAccountDescriptor>;
      list: (provider?: string) => ChannelAccountDescriptor[];
      get: (provider: string, accountId?: string) => ChannelAccountDescriptor | null;
      status: (provider?: string) => Promise<ChannelAccountDescriptor[]>;
      remove: (provider: string, accountId?: string) => Promise<ChannelAccountDescriptor[]>;
    };
    targets: {
      register: (input: RegisterChannelTargetInput) => ChannelTargetDescriptor;
      list: (input?: { provider?: string; accountId?: string; query?: string }) => ChannelTargetDescriptor[];
      get: (provider: string, accountId: string | undefined, targetId: string, threadId?: string | number) => ChannelTargetDescriptor | null;
    };
    bindings: {
      grant: (input: GrantChannelBindingInput) => ChannelAgentBinding;
      revoke: (id: string) => boolean;
      list: (input?: { agentId?: string; provider?: string; accountId?: string; targetId?: string }) => ChannelAgentBinding[];
      can: (agentId: string | undefined, permission: ChannelPermission, selector: { provider: string; accountId?: string; targetId?: string }) => boolean;
    };
    processors: {
      register: (input: RegisterChannelProcessorInput) => ChannelProcessorDescriptor;
      list: () => ChannelProcessorDescriptor[];
      get: (id?: string) => ChannelProcessorDescriptor | null;
      remove: (id: string) => boolean;
    };
    listeners: {
      upsert: (input: UpsertChannelListenerInput) => ChannelListenerDescriptor;
      list: (input?: { provider?: string; accountId?: string; processorId?: string }) => ChannelListenerDescriptor[];
      get: (provider: string, accountId?: string) => ChannelListenerDescriptor | null;
      remove: (provider: string, accountId?: string) => boolean;
    };
    events: {
      list: (input?: { provider?: string; accountId?: string; targetId?: string; processorId?: string; limit?: number }) => ChannelEventRecord[];
    };
    listen: {
      run: (input?: {
        provider?: string;
        accountId?: string;
        processorId?: string;
        once?: boolean;
        intervalMs?: number;
        timeoutSeconds?: number;
        processorTimeoutMs?: number;
        stopPath?: string;
        pidPath?: string;
        logPath?: string;
        mode?: "foreground" | "background";
      }) => Promise<ChannelListenerDescriptor>;
    };
    messages: {
      send: (input: SendChannelMessageInput) => Promise<ChannelMessageRecord>;
      read: (input?: ReadChannelMessagesInput) => ChannelMessageRecord[];
      sync: (input?: TelegramSyncUpdatesOptions & { provider?: string; accountId?: string }) => Promise<ChannelMessageRecord[]>;
    };
    commands: {
      set: (provider: "telegram", commands: TelegramCommand[], input?: { accountId?: string }) => Promise<TelegramCommand[]>;
      get: (provider: "telegram", input?: { accountId?: string }) => Promise<TelegramCommand[]>;
    };
  };
  telegram: {
    provisionSecretReference: (input: { secretName: string; apiBaseUrl?: string; notes?: string; readOnly?: boolean }) => Promise<EnsureSecretReferenceResult>;
    connectBot: (input: TelegramConnectBotInput) => Promise<TelegramStatusResult>;
    status: () => Promise<TelegramStatusResult>;
    configureWebhook: (input: TelegramWebhookConfigInput) => Promise<TelegramStatusResult>;
    disableWebhook: (options?: { dropPendingUpdates?: boolean }) => Promise<TelegramStatusResult>;
    startPolling: (options?: TelegramSyncUpdatesOptions & { dropPendingUpdates?: boolean }) => Promise<TelegramStatusResult>;
    stopPolling: () => Promise<TelegramStatusResult>;
    setCommands: (commands: TelegramCommand[]) => Promise<TelegramCommand[]>;
    getCommands: () => Promise<TelegramCommand[]>;
    sendMessage: (input: TelegramSendMessageInput) => Promise<Record<string, unknown>>;
    sendMedia: (input: TelegramSendMediaInput) => Promise<Record<string, unknown>>;
    listChats: (query?: string) => Promise<TelegramChatSummary[]>;
    getChat: (chatId: string | number) => Promise<TelegramChatSummary>;
    getChatAdministrators: (chatId: string | number) => Promise<TelegramMemberSummary[]>;
    getChatMember: (chatId: string | number, userId: string | number) => Promise<TelegramMemberSummary>;
    setChatPermissions: (chatId: string | number, permissions: Record<string, boolean>) => Promise<boolean>;
    banOrRestrictMember: (input: TelegramBanOrRestrictInput) => Promise<boolean>;
    createInviteLink: (chatId: string | number, options?: TelegramInviteLinkOptions) => Promise<Record<string, unknown>>;
    revokeInviteLink: (chatId: string | number, inviteLink: string) => Promise<Record<string, unknown>>;
    syncUpdates: (options?: TelegramSyncUpdatesOptions) => Promise<TelegramUpdateEnvelope[]>;
    ingestUpdate: (update: Record<string, unknown>) => Promise<TelegramUpdateEnvelope | null>;
  };
  slack: {
    connectBot: (input: SlackConnectBotInput) => Promise<SlackStatusResult>;
    status: () => Promise<SlackStatusResult>;
    sendMessage: (input: SlackSendMessageInput) => Promise<Record<string, unknown>>;
    listChannels: (query?: string) => Promise<SlackChannelSummary[]>;
    getChannel: (channelId: string) => Promise<SlackChannelSummary>;
  };
  whatsapp: {
    connect: (input: WhatsAppConnectInput) => Promise<WhatsAppStatusResult>;
    status: () => Promise<WhatsAppStatusResult>;
    sendMessage: (input: WhatsAppSendMessageInput) => Promise<Record<string, unknown>>;
    disconnect: () => Promise<WhatsAppStatusResult>;
  };
  inference: {
    generateText: (input: GenerateTextInput) => Promise<GenerateTextResult>;
  };
  secrets: {
    list: (search?: string) => Promise<SecretProxyMetadata[]>;
    describe: (name: string) => Promise<SecretProxyMetadata | null>;
    types: (search?: string) => Promise<SecretTypeDescriptor[]>;
    capabilities: (name: string) => Promise<{ secret: SecretProxyMetadata; capabilities: SecretCapabilityStatus[] }>;
    actions: (name: string) => Promise<{ secret: SecretProxyMetadata; actions: SecretTypedActionDescriptor[] }>;
    brokerHttp: (input: SecretBrokerHttpInput) => Promise<SecretBrokerHttpResult>;
    runAction: (name: string, actionId: string) => Promise<{ action: SecretTypedActionDescriptor; result: SecretBrokerHttpResult }>;
    leases: () => Promise<SecretLeaseRecord[]>;
    doctorKeychain: () => Promise<SecretDoctorResult>;
    ensureHttpReference: (input: EnsureSecretReferenceInput) => Promise<EnsureSecretReferenceResult>;
    ensureTelegramBotReference: (input: { name: string; apiBaseUrl?: string; notes?: string; readOnly?: boolean }) => Promise<EnsureSecretReferenceResult>;
  };
  notify: {
    send: (input: SendNotificationInput) => Promise<{
      created: boolean;
      notification: { id: string };
      deliveries: Array<{ id: string; installationId: string; state: string }>;
      receipt: { id: string; status: string } | null;
    }>;
    cancel: (notificationId: string) => Promise<{
      notification: { id: string; status: string };
      deliveries: Array<{ id: string; state: string }>;
    }>;
    receipt: (receiptId: string) => Promise<{
      receipt: { id: string; status: string };
      notification: { id: string } | null;
    }>;
    feed: (limit?: number) => Promise<{
      installation: { id: string } | null;
      items: Array<{
        delivery: { state: string };
        notification: { id: string };
        receipt: { id: string; status: string } | null;
      }>;
      glances: Array<{ scope: string; data: Record<string, unknown> }>;
    }>;
    markRead: (notificationId: string) => Promise<{ delivery: { state: string } }>;
    acknowledgeReceipt: (receiptId: string) => Promise<{ receipt: { id: string; status: string } }>;
    updatePushToken: (installationId: string, pushToken: string) => Promise<{ installation: { id: string; pushToken: string } }>;
    putGlance: (scope: string, input: { tenantId?: string; userId?: string; clientAppId?: string; data: Record<string, unknown> }) => Promise<{ glance: { id: string; scope: string } }>;
    subscriptions: {
      upsert: (input: UpsertSubscriptionInput) => Promise<{ subscription: { id: string } }>;
      remove: (id: string) => Promise<{ ok: boolean }>;
    };
  };
  time: {
    configured: boolean;
    list: (filters?: {
      kind?: TemporalItem["kind"];
      status?: TemporalItem["status"];
      workspaceId?: string;
      projectId?: string;
      agentId?: string;
      ownerId?: string;
      sourceProvider?: string;
    }) => Promise<{ items: TemporalItem[] }>;
    get: (id: string) => Promise<{ item: TemporalItem }>;
    create: (input: CreateTemporalItemInput) => Promise<{ item: TemporalItem }>;
    update: (id: string, input: UpdateTemporalItemInput) => Promise<{ item: TemporalItem }>;
    delete: (id: string) => Promise<{ ok: boolean }>;
    pause: (id: string) => Promise<{ item: TemporalItem }>;
    resume: (id: string) => Promise<{ item: TemporalItem }>;
    runNow: (id: string) => Promise<{ item: TemporalItem; execution: TemporalExecution }>;
    listExecutions: (itemId?: string) => Promise<{ executions: TemporalExecution[] }>;
    listRunLog: (itemId?: string, limit?: number) => Promise<{ entries: TemporalRunLogEntry[] }>;
    calendarView: (input?: { start?: string; end?: string }) => Promise<{ items: TemporalItem[]; entries: Array<Record<string, unknown>> }>;
    timelineView: (input?: { start?: string; end?: string }) => Promise<{ items: TemporalItem[] }>;
    signalAnchor: (input: { anchorId: string; signal: "reply_received" | "task_completed" | "event_started" | "execution_succeeded" }) => Promise<{ items: TemporalItem[] }>;
  };
  calendar: {
    configured: boolean;
    list: (filters?: TemporalListFilters) => Promise<{ items: TemporalItem[] }>;
    get: (id: string) => Promise<{ item: TemporalItem }>;
    create: (input: Omit<CreateTemporalItemInput, "kind">) => Promise<{ item: TemporalItem }>;
    update: (id: string, input: UpdateTemporalItemInput) => Promise<{ item: TemporalItem }>;
    delete: (id: string) => Promise<{ ok: boolean }>;
    at: (input: TemporalNaturalCreateInput) => Promise<{ item: TemporalItem }>;
    view: (input?: { start?: string; end?: string }) => Promise<{ items: TemporalItem[]; entries: Array<Record<string, unknown>> }>;
  };
  routines: {
    configured: boolean;
    list: (filters?: TemporalListFilters) => Promise<{ items: TemporalItem[] }>;
    get: (id: string) => Promise<{ item: TemporalItem }>;
    create: (input: Omit<CreateTemporalItemInput, "kind">) => Promise<{ item: TemporalItem }>;
    update: (id: string, input: UpdateTemporalItemInput) => Promise<{ item: TemporalItem }>;
    delete: (id: string) => Promise<{ ok: boolean }>;
    every: (input: TemporalNaturalCreateInput) => Promise<{ item: TemporalItem }>;
    enable: (id: string) => Promise<{ item: TemporalItem }>;
    disable: (id: string) => Promise<{ item: TemporalItem }>;
    run: (id: string) => Promise<{ item: TemporalItem; execution: TemporalExecution }>;
    history: (itemId?: string) => Promise<{ executions: TemporalExecution[] }>;
  };
  reminders: {
    after: (input: TemporalReminderAfterInput) => Promise<{ item: TemporalItem }>;
  };
  content: {
    configured: boolean;
    brands: {
      list: () => Promise<{ brands: ContentBrand[] }>;
      create: (input: Record<string, unknown>) => Promise<{ brand: ContentBrand }>;
      update: (id: string, input: Record<string, unknown>) => Promise<{ brand: ContentBrand }>;
    };
    destinations: {
      list: (filters?: { brandId?: string }) => Promise<{ destinations: ContentDestination[] }>;
      create: (input: Record<string, unknown>) => Promise<{ destination: ContentDestination }>;
      update: (id: string, input: Record<string, unknown>) => Promise<{ destination: ContentDestination }>;
      testConnection: (id: string) => Promise<{ ok: boolean; destination: ContentDestination }>;
      view: () => Promise<Record<string, unknown>>;
    };
    campaigns: {
      list: (filters?: { brandId?: string }) => Promise<{ campaigns: ContentCampaign[] }>;
      create: (input: Record<string, unknown>) => Promise<{ campaign: ContentCampaign }>;
      update: (id: string, input: Record<string, unknown>) => Promise<{ campaign: ContentCampaign }>;
    };
    entries: {
      list: (filters?: { brandId?: string; campaignId?: string; status?: string }) => Promise<{ entries: ContentEntry[] }>;
      get: (id: string) => Promise<Record<string, unknown>>;
      create: (input: Record<string, unknown>) => Promise<{ entry: ContentEntry }>;
      update: (id: string, input: Record<string, unknown>) => Promise<{ entry: ContentEntry }>;
      archive: (id: string) => Promise<{ entry: ContentEntry }>;
      attachAsset: (id: string, input: Record<string, unknown>) => Promise<{ asset: ContentAssetRef }>;
      generateVariants: (id: string, input: { destinationIds: string[] }) => Promise<{ variants: ContentVariant[] }>;
    };
    variants: {
      list: (filters?: { entryId?: string; destinationId?: string; status?: string }) => Promise<{ variants: ContentVariant[] }>;
      create: (input: Record<string, unknown>) => Promise<{ variant: ContentVariant }>;
      update: (id: string, input: Record<string, unknown>) => Promise<{ variant: ContentVariant }>;
    };
    approvals: {
      list: (filters?: { status?: string }) => Promise<{ approvals: ContentApprovalRequest[] }>;
      approve: (id: string, input?: Record<string, unknown>) => Promise<{ approval: ContentApprovalRequest }>;
      reject: (id: string, input: { comment: string }) => Promise<{ approval: ContentApprovalRequest }>;
      cancel: (id: string) => Promise<{ approval: ContentApprovalRequest }>;
      view: () => Promise<Record<string, unknown>>;
    };
    calendar: {
      view: () => Promise<Record<string, unknown>>;
    };
    publish: {
      listPlans: (filters?: { status?: string }) => Promise<{ plans: ContentPublishPlan[] }>;
      createPlan: (input: Record<string, unknown>) => Promise<{ plan: ContentPublishPlan; approval?: ContentApprovalRequest | null }>;
      cancelPlan: (id: string) => Promise<{ plan: ContentPublishPlan }>;
      runNow: (id: string) => Promise<{ plan: ContentPublishPlan; run: ContentPublicationRun }>;
      schedulerRun: () => Promise<{ runs: ContentPublicationRun[] }>;
      listRuns: () => Promise<{ runs: Array<ContentPublicationRun & { canRetry: boolean }> }>;
      getRun: (id: string) => Promise<Record<string, unknown>>;
      retryRun: (id: string) => Promise<{ plan: ContentPublishPlan; run: ContentPublicationRun }>;
      view: () => Promise<Record<string, unknown>>;
    };
    app: {
      frontendContract: () => Promise<Record<string, unknown>>;
      screens: () => Promise<{ screens: Array<Record<string, unknown>> }>;
      dashboard: () => Promise<Record<string, unknown>>;
      pipeline: () => Promise<Record<string, unknown>>;
      composer: (entryId: string) => Promise<Record<string, unknown>>;
      form: (formId: "entry.create" | "variant.edit" | "destination.create" | "publish-plan.create") => Promise<Record<string, unknown>>;
    };
    tokens: {
      list: () => Promise<{ tokens: ContentScopedTokenRecord[] }>;
      issue: (input: { label: string; operations: ContentOperation[] }) => Promise<{ token: string; record: ContentScopedTokenRecord }>;
    };
  };
  iot: {
    inventory: {
      homes: {
        list: () => Promise<HomeDescriptor[]>;
        get: (homeId?: string) => Promise<HomeDescriptor>;
      };
      areas: {
        list: (homeId?: string) => Promise<AreaDescriptor[]>;
      };
      things: {
        list: (options?: { homeId?: string; kind?: string; query?: string; area?: string }) => Promise<ThingDescriptor[]>;
        get: (thingId: string, homeId?: string) => Promise<ThingDescriptor | null>;
        search: (query: string, options?: { homeId?: string; kind?: string; area?: string }) => Promise<ThingDescriptor[]>;
      };
    };
    state: {
      get: (homeId?: string) => Promise<IoTStateSnapshot>;
      history: (homeId?: string, options?: { limit?: number }) => Promise<IoTEventRecord[]>;
      watch: (homeId?: string) => AsyncGenerator<IoTEventRecord>;
    };
    actions: {
      run: (input: IoTActionRequest, homeId?: string) => Promise<IoTActionResult>;
      lights: {
        off: (area?: string, homeId?: string) => Promise<IoTActionResult>;
        on: (area?: string, homeId?: string) => Promise<IoTActionResult>;
      };
      climate: {
        set: (selector: string, temperature: number, homeId?: string) => Promise<IoTActionResult>;
      };
    };
    scenes: {
      list: (homeId?: string) => Promise<SceneRecord[]>;
      activate: (sceneId: string, homeId?: string) => Promise<{ scene: SceneRecord; results: IoTActionResult[] }>;
    };
    automations: {
      list: (homeId?: string) => Promise<AutomationRecord[]>;
      create: (input: { label: string; enabled?: boolean; trigger?: Record<string, unknown>; conditions?: Array<Record<string, unknown>>; actions: IoTActionRequest[] }, homeId?: string) => Promise<AutomationRecord>;
      enable: (automationId: string, homeId?: string) => Promise<AutomationRecord>;
      disable: (automationId: string, homeId?: string) => Promise<AutomationRecord>;
      run: (automationId: string, homeId?: string) => Promise<{ automation: AutomationRecord; results: IoTActionResult[] }>;
    };
    policies: {
      evaluate: (input: IoTActionRequest, homeId?: string) => Promise<IoTPolicyEvaluation>;
      list: (homeId?: string) => Promise<PolicyRecord[]>;
      listApprovals: (homeId?: string) => Promise<ApprovalRecord[]>;
      approve: (approvalId: string, homeId?: string) => Promise<{ approval: ApprovalRecord; result: IoTActionResult }>;
      deny: (approvalId: string, homeId?: string) => Promise<ApprovalRecord>;
    };
    raw: {
      invoke: (input: RawIoTInvocation) => Promise<RawIoTInvocation & { acceptedAt: string }>;
    };
  };
  sessions: {
    createSession: (title?: string) => ReturnType<SessionStore["createSession"]>;
    appendMessage: (sessionId: string, message: Parameters<SessionStore["appendMessage"]>[1]) => ReturnType<SessionStore["appendMessage"]>;
    appendMessageOnce: (sessionId: string, message: Parameters<SessionStore["appendMessage"]>[1]) => ReturnType<SessionStore["appendMessageOnce"]>;
    resolveChannelSession: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
    }) => { sessionId: string; session: ReturnType<SessionStore["getSession"]> };
    appendChannelMessage: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
      direction: "inbound" | "outbound";
      role?: "user" | "assistant";
      content: string;
      providerMessageId?: string;
      senderId?: string;
      senderLabel?: string;
      metadata?: Record<string, unknown>;
      createdAt?: number;
    }) => ReturnType<SessionStore["appendMessageOnce"]> & { sessionId: string };
    backfillChannelSession: (input: {
      provider: string;
      accountId?: string;
      targetId: string;
      threadId?: string | number;
      limit?: number;
      excludeProviderMessageIds?: string[];
    }) => ReturnType<SessionStore["getSession"]>;
    listSessions: SessionStore["listSessions"];
    searchSessions: (input: SessionSearchInput) => Promise<SessionSearchResult[]>;
    getSession: SessionStore["getSession"];
    updateSessionTitle: SessionStore["updateSessionTitle"];
    generateTitle: (input: {
      sessionId: string;
      transport?: "auto" | "gateway" | "cli";
    }) => Promise<string>;
    streamAssistantReplyEvents: (input: {
      sessionId: string;
      systemPrompt?: string;
      contextBlocks?: PromptContextBlock[];
      ruleHints?: Omit<RulesCompileInput, "prompt">;
      transport?: "auto" | "gateway" | "cli";
      chunkSize?: number;
      gatewayRetries?: number;
      signal?: AbortSignal;
    }) => AsyncGenerator<SessionStreamEvent>;
    streamAssistantReply: (input: {
      sessionId: string;
      systemPrompt?: string;
      contextBlocks?: PromptContextBlock[];
      ruleHints?: Omit<RulesCompileInput, "prompt">;
      transport?: "auto" | "gateway" | "cli";
      chunkSize?: number;
      gatewayRetries?: number;
      signal?: AbortSignal;
    }) => AsyncGenerator<{ sessionId: string; messageId?: string; delta: string; done: boolean }>;
  };
  channelRuns: {
    resolveOrCreateChannelRun: (input: ChannelRunTarget & { sessionId: string; options?: ChannelRunOptions }) => ReturnType<ChannelRunStore["resolveOrCreateChannelRun"]>;
    enqueueChannelMessage: (runKey: string, message: Omit<ChannelRunMessage, "id" | "createdAt"> & { id?: string; createdAt?: number }) => ReturnType<ChannelRunStore["enqueueChannelMessage"]>;
    processChannelRun: (input: Parameters<ChannelRunStore["processChannelRun"]>[0]) => ReturnType<ChannelRunStore["processChannelRun"]>;
    getChannelRunStatus: (runKey: string) => ReturnType<ChannelRunStore["getChannelRunStatus"]>;
    requestChannelRunStop: (runKey: string) => ReturnType<ChannelRunStore["requestChannelRunStop"]>;
    compactChannelSession: (input: Parameters<ChannelRunStore["compactChannelSession"]>[0]) => ReturnType<ChannelRunStore["compactChannelSession"]>;
    drainQueuedChannelMessages: (runKey: string) => ReturnType<ChannelRunStore["drainQueuedChannelMessages"]>;
    resetChannelRun: (input: ChannelRunTarget & { sessionId: string; options?: ChannelRunOptions }) => ReturnType<ChannelRunStore["resetChannelRun"]>;
  };
  conversations: {
    searchSessions: (input: SessionSearchInput) => Promise<SessionSearchResult[]>;
  };
  documents: {
    list: (options?: { sessionId?: string }) => Promise<DocumentRecord[]>;
    get: (documentId: string) => Promise<DocumentRecord | null>;
    search: (input: { query: string; limit?: number; sessionId?: string }) => Promise<DocumentSearchResult[]>;
    upload: (input: {
      name: string;
      mimeType: string;
      data: string | Uint8Array;
      origin?: DocumentRecord["origin"];
      sessionId?: string;
      createdByMessageId?: string;
    }) => Promise<DocumentRecord>;
    register: (input: {
      filePath: string;
      name?: string;
      mimeType?: string;
      origin?: DocumentRecord["origin"];
      sessionId?: string;
      createdByMessageId?: string;
    }) => Promise<DocumentRecord>;
    beginUpload: (input: {
      name: string;
      mimeType: string;
      origin?: DocumentRecord["origin"];
      sessionId?: string;
      createdByMessageId?: string;
    }) => Promise<{ uploadId: string }>;
    appendUploadChunk: (uploadId: string, chunkBase64: string) => Promise<{ uploadId: string; appended: number }>;
    commitUpload: (uploadId: string) => Promise<DocumentRecord>;
    download: (documentId: string) => Promise<{ document: DocumentRecord; filePath: string; buffer: Buffer } | null>;
    resolveRefs: (documentIds: string[]) => Promise<DocumentRef[]>;
  };
  media: {
    register: (input: RegisterMediaInput) => MediaRecord;
    list: (input?: MediaListInput) => MediaRecord[];
    search: (input: MediaListInput & { query: string }) => MediaSearchResult[];
    get: (mediaId: string) => MediaRecord | null;
    download: (mediaId: string) => { media: MediaRecord; filePath: string; buffer: Buffer } | null;
    share: {
      create: (input: { mediaId?: string; label?: string; filters?: MediaListInput; expiresAt?: string | null; ttlMs?: number }) => Promise<StorageShare | MediaGalleryShare>;
      revoke: (id: string) => Promise<boolean>;
      list: () => Array<StorageShare | MediaGalleryShare>;
      resolveGallery: (id: string) => { share: MediaGalleryShare; items: MediaRecord[] } | null;
    };
  };
  storage: {
    put: (input: StoragePutInput) => StorageObject;
    get: (ref: Partial<StorageRef> & { key: string }) => StorageGetResult | null;
    head: (ref: Partial<StorageRef> & { key: string }) => StorageObject | null;
    list: (input?: StorageListInput) => StorageObject[];
    delete: (ref: Partial<StorageRef> & { key: string }) => boolean;
    readText: (ref: Partial<StorageRef> & { key: string }) => string | null;
    writeText: (input: { bucket?: string; key: string; content: string; contentType?: string; metadata?: Record<string, unknown>; visibility?: StoragePutInput["visibility"] }) => StorageObject;
    exportToFile: (ref: Partial<StorageRef> & { key: string; filePath: string }) => StorageObject | null;
    tokens: {
      issue: (input: { label?: string; grants: StorageGrant[] }) => { record: StorageScopedToken; token: string };
      list: () => StorageScopedToken[];
      revoke: (id: string) => boolean;
    };
    share: {
      create: (input: { bucket?: string; key: string; label?: string; expiresAt?: string | null; ttlMs?: number }) => Promise<StorageShare>;
      revoke: (id: string) => Promise<boolean>;
      list: () => StorageShare[];
    };
  };
  data: WorkspaceDataStore;
  orchestration: {
    snapshot: () => Promise<ReturnType<typeof buildOrchestrationSnapshot>>;
  };
  watch: {
    configured: boolean;
    list: (filters?: TemporalListFilters) => Promise<{ items: TemporalItem[] }>;
    get: (id: string) => Promise<{ item: TemporalItem }>;
    create: (input: TemporalWatchInput) => Promise<{ item: TemporalItem }>;
    enable: (id: string) => Promise<{ item: TemporalItem }>;
    disable: (id: string) => Promise<{ item: TemporalItem }>;
    delete: (id: string) => Promise<{ ok: boolean }>;
    file: (
      fileName: string,
      callback: Parameters<typeof watchWorkspaceFile>[2],
      options?: Parameters<typeof watchWorkspaceFile>[3],
    ) => ReturnType<typeof watchWorkspaceFile>;
    transcript: (
      sessionId: string,
      callback: Parameters<typeof watchSessionTranscript>[2],
      options?: Parameters<typeof watchSessionTranscript>[3],
    ) => ReturnType<typeof watchSessionTranscript>;
    runtimeStatus: (
      callback: (status: RuntimeProbeStatus) => void,
      options?: PollWatchOptions,
    ) => ReturnType<typeof watchRuntimeStatus>;
    providerStatus: (
      callback: (providers: Record<string, ProviderAuthSummary>) => void,
      options?: PollWatchOptions,
    ) => ReturnType<typeof watchProviderStatus>;
    events: (type: string, listener: EventListener) => () => void;
    eventsIterator: (type?: string) => AsyncIterable<ClawEvent>;
  };
}
