import fs from "fs";
import path from "path";
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
  MediaGalleryShare,
  MediaKind,
  MediaListInput,
  MediaRecord,
  MediaSearchResult,
  SkillContextCapsule,
  SkillContextResolveResult,
  SoulAssignment,
  SoulCompileResult,
  SoulSpec,
  SoulValidationResult,
  UserAssignment,
  UserCompileResult,
  UserFact,
  UserFactValue,
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

export interface CreateClawOptions {
  runtime: {
    adapter: RuntimeAdapterId;
    binaryPath?: string;
    agentDir?: string;
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
    backend?: "local_proxy" | "vault";
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
  time?: {
    baseUrl?: string;
    token?: string;
    dbPath?: string;
    defaultTimeZone?: string;
    schedulerIntervalMs?: number;
    notifyBaseUrl?: string;
    notifySourceToken?: string;
    heartbeatChecks?: Record<string, TemporalHeartbeatCheckProvider>;
    heartbeatAgent?: TemporalHeartbeatAgentRunner;
  };
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

type TemporalListFilters = {
  status?: TemporalItem["status"];
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  ownerId?: string;
  sourceProvider?: string;
};

type TemporalTarget = {
  anchorType?: NonNullable<TemporalItem["anchorType"]>;
  anchorId?: string;
  anchorAt?: string;
};

type TemporalWatchInput = TemporalTarget & {
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

type TemporalReminderAfterInput = TemporalTarget & {
  after: string;
  title: string;
  timezone?: string;
  description?: string;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
};

type TemporalNaturalCreateInput = Omit<CreateTemporalItemInput, "kind" | "natural"> & {
  expression: string;
  timezone?: string;
};

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
    set: (input: { userId?: string; path: string; value: UserFactValue; source?: string; sensitivity?: "public" | "personal" | "sensitive"; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserFact;
    add: (input: { userId?: string; type: UserRecordType; title: string; fields?: Record<string, UserFactValue>; source?: string; sensitivity?: "public" | "personal" | "sensitive"; confidence?: number; validFrom?: string; validTo?: string; notes?: string; visibility?: "agent" | "public" | "private" }) => UserRecord;
    propose: (input: { userId?: string; path?: string; value?: UserFactValue; recordType?: UserRecordType; title?: string; fields?: Record<string, UserFactValue>; source?: string; sensitivity?: "public" | "personal" | "sensitive"; confidence?: number; notes?: string; visibility?: "agent" | "public" | "private" }) => UserProposal;
    verify: (proposalId: string, userId?: string) => UserProposal;
    assign: (input: { userId: string; agentId: string }) => UserAssignment;
    assignmentForAgent: (agentId: string) => UserAssignment | null;
    resolve: (input?: { userId?: string; agentId?: string }) => UserSpec;
    validate: (input?: UserSpec) => UserValidationResult;
    preview: (input?: { userId?: string; agentId?: string }) => UserCompileResult;
    compile: (input?: { userId?: string; agentId?: string; write?: boolean }) => UserCompileResult;
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
    list: () => Promise<SkillDescriptor[]>;
    sync: () => Promise<SkillDescriptor[]>;
    sources: () => Promise<SkillSourceDescriptor[]>;
    search: (query: string, options?: { source?: string; limit?: number }) => Promise<SkillSearchResult>;
    install: (ref: string, options?: { source?: string }) => Promise<SkillInstallResult & { syncedSkills?: SkillDescriptor[] }>;
  };
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

export interface ClawFactory {
  (options: CreateClawOptions): Promise<ClawInstance>;
  create: (options: CreateClawOptions) => Promise<ClawInstance>;
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
  const secretsEnv: NodeJS.ProcessEnv = {
    ...(runtimeEnv ?? {}),
    ...(options.secrets?.env ?? {}),
    ...(options.secrets?.backend ? { CLAWJS_SECRETS_BACKEND: options.secrets.backend } : {}),
    ...(options.secrets?.baseUrl ? { VAULT_BASE_URL: options.secrets.baseUrl } : {}),
    ...(options.secrets?.credential ? { VAULT_TOKEN: options.secrets.credential } : {}),
    ...(options.secrets?.tenantId ? { VAULT_TENANT_ID: options.secrets.tenantId } : {}),
    ...(options.secrets?.sidecarPath ? { CLAWJS_VAULT_SIDECAR_PATH: options.secrets.sidecarPath } : {}),
  };
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
    env: {
      ...(runtimeEnv ?? {}),
      ...(options.images?.env ?? {}),
    },
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
        dbPath: options.time?.dbPath ?? path.join(options.workspace.rootDir, ".clawjs", "data", "productivity.sqlite"),
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

  function registerGenerationBackend(input: RegisterCommandGenerationBackendInput): GenerationBackendDescriptor {
    const backend = generationStore.registerCommandBackend(input);
    appendAuditEvent("generations.backend_registered", "file_sync", {
      backendId: backend.id,
      supportedKinds: backend.supportedKinds.join(","),
    });
    eventBus.emit("generations.backend_registered", {
      backendId: backend.id,
      supportedKinds: backend.supportedKinds,
    });
    return backend;
  }

  function removeGenerationBackend(id: string): boolean {
    const removed = generationStore.removeBackend(id);
    if (removed) {
      appendAuditEvent("generations.backend_removed", "file_sync", { backendId: id });
      eventBus.emit("generations.backend_removed", { backendId: id });
    }
    return removed;
  }

  async function createGenerationRecord(input: CreateGenerationInput): Promise<GenerationRecord> {
    const record = await generationStore.create(input);
    registerGeneratedMedia(record);
    appendAuditEvent("generations.created", "file_sync", {
      generationId: record.id,
      kind: record.kind,
      backendId: record.backendId,
      status: record.status,
    });
    eventBus.emit("generations.created", {
      generationId: record.id,
      kind: record.kind,
      backendId: record.backendId,
      status: record.status,
    });
    return record;
  }

  function removeGenerationRecord(id: string): boolean {
    const removed = generationStore.remove(id);
    if (removed) {
      appendAuditEvent("generations.removed", "file_sync", { generationId: id });
      eventBus.emit("generations.removed", { generationId: id });
    }
    return removed;
  }

  function createTypedGenerationFacade(kind: "image" | "audio" | "video") {
    return {
      backends: () => generationStore.listBackends().filter((backend) => backend.supportedKinds.includes(kind)),
      generate: (input: Omit<CreateGenerationInput, "kind">) => createGenerationRecord({ ...input, kind }),
      list: (options: Omit<GenerationListOptions, "kind"> = {}) => generationStore.list({ ...options, kind }),
      get: (id: string) => {
        const record = generationStore.get(id);
        return record?.kind === kind ? record : null;
      },
      remove: (id: string) => {
        const record = generationStore.get(id);
        if (!record || record.kind !== kind) return false;
        return removeGenerationRecord(id);
      },
    };
  }

  function mapGenerationToImageRecord(record: GenerationRecord): ImageRecord {
    return {
      id: record.id,
      kind: "image",
      status: record.status,
      operation: "create",
      prompt: record.prompt,
      title: record.title,
      tags: [],
      collections: [],
      project: options.workspace.appId,
      workspaceId: options.workspace.workspaceId,
      agentId: logicalAgentId,
      backendId: record.backendId,
      backendLabel: record.backendLabel,
      provider: record.backendId.startsWith("openclaw-skill:openai") ? "openai" : undefined,
      ...(record.model ? { model: record.model } : {}),
      sourceImageIds: [],
      editDepth: 0,
      provenance: "command-backend",
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      output: record.output,
      ...(record.metadata ? { metadata: record.metadata } : {}),
      ...(record.error ? { error: record.error } : {}),
    };
  }

  function isNativeImageBackend(input: { backendId?: string; command?: string }): boolean {
    return !input.command?.trim() && (!input.backendId || input.backendId === OPENAI_BACKEND_ID || input.backendId === "openai");
  }

  function shouldUseNativeImageBackend(input: { backendId?: string; command?: string }): boolean {
    if (!isNativeImageBackend(input)) return false;
    if (input.backendId === OPENAI_BACKEND_ID || input.backendId === "openai") return true;
    return imageStore.listBackends().some((backend) => backend.id === OPENAI_BACKEND_ID && backend.available)
      || !generationStore.listBackends().some((backend) => backend.id !== "command" && backend.available && backend.supportedKinds.includes("image"));
  }

  function imageBackends(): GenerationBackendDescriptor[] {
    const nativeBackends = imageStore.listBackends().map((backend) => ({
      id: backend.id,
      label: backend.label,
      type: "command" as const,
      supportedKinds: ["image" as const],
      command: "",
      args: [],
      source: "builtin" as const,
      available: backend.available,
      ...(backend.reason ? { reason: backend.reason } : {}),
      supportedModels: backend.supportedModels,
      metadataSchema: backend.metadataSchema,
    }));
    return [
      ...nativeBackends,
      ...generationStore.listBackends().filter((backend) => backend.supportedKinds.includes("image")),
    ];
  }

  function importGenerationRecord(record: GenerationRecord, operation: "create" | "edit", input: {
    parentId?: string;
    sourceImageIds?: string[];
    imageType?: ImageImportInput["imageType"];
    tags?: string[];
    collections?: string[];
    project?: string;
    topic?: string;
    externalGenerator?: string;
    metadata?: Record<string, unknown>;
  } = {}): ImageRecord {
    if (!record.output?.filePath || !record.output.exists) {
      return mapGenerationToImageRecord(record);
    }
    const image = imageStore.importImage({
      filePath: record.output.filePath,
      prompt: record.prompt,
      title: record.title,
      model: record.model,
      provider: record.backendId.includes("openai") ? "openai" : undefined,
      project: input.project,
      workspaceId: options.workspace.workspaceId,
      agentId: logicalAgentId,
      topic: input.topic,
      imageType: input.imageType,
      tags: input.tags,
      collections: input.collections,
      parentId: input.parentId,
      sourceImageIds: input.sourceImageIds,
      operation,
      provenance: "command-backend",
      externalGenerator: input.externalGenerator,
      backendId: record.backendId,
      backendLabel: record.backendLabel,
      metadata: {
        ...(record.metadata ?? {}),
        ...(input.metadata ?? {}),
        generationId: record.id,
      },
    });
    registerImageMedia(image);
    return image;
  }

  async function createImageRecord(input: Omit<ImageCreateInput, "workspaceId" | "agentId"> & {
    backendId?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    outputExtension?: string;
    mimeType?: string;
  }): Promise<ImageRecord> {
    if (shouldUseNativeImageBackend(input)) {
      const image = await imageStore.create({
        ...input,
        workspaceId: options.workspace.workspaceId,
        agentId: logicalAgentId,
      });
      registerImageMedia(image);
      return image;
    }
    const record = await createGenerationRecord({
      kind: "image",
      prompt: input.prompt,
      title: input.title,
      backendId: input.backendId,
      model: input.model,
      metadata: input.metadata,
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      outputExtension: input.outputExtension,
      mimeType: input.mimeType,
    });
    return importGenerationRecord(record, "create", input);
  }

  async function editImageRecord(input: Omit<ImageEditInput, "workspaceId" | "agentId"> & {
    backendId?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    outputExtension?: string;
    mimeType?: string;
  }): Promise<ImageRecord> {
    if (shouldUseNativeImageBackend(input)) {
      const image = await imageStore.edit({
        ...input,
        workspaceId: options.workspace.workspaceId,
        agentId: logicalAgentId,
      });
      registerImageMedia(image);
      return image;
    }
    const parent = imageStore.get(input.parentId);
    const inputImages = [parent?.output?.filePath, ...(input.sourceImageIds ?? []).map((id) => imageStore.get(id)?.output?.filePath)]
      .filter((entry): entry is string => !!entry);
    const record = await createGenerationRecord({
      kind: "image",
      prompt: input.prompt,
      title: input.title,
      backendId: input.backendId,
      model: input.model,
      metadata: {
        ...(input.metadata ?? {}),
        inputImages,
        parentId: input.parentId,
      },
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      env: input.env,
      outputExtension: input.outputExtension,
      mimeType: input.mimeType,
    });
    return importGenerationRecord(record, "edit", {
      ...input,
      sourceImageIds: [input.parentId, ...(input.sourceImageIds ?? [])],
    });
  }

  function listImageRecords(queryOptions: Omit<GenerationListOptions, "kind"> & ImageListOptions = {}): ImageRecord[] {
    const scopedOptions = {
      ...queryOptions,
      workspaceId: queryOptions.workspaceId ?? options.workspace.workspaceId,
      agentId: queryOptions.agentId ?? logicalAgentId,
    };
    const native = imageStore.list(scopedOptions);
    const existingIds = new Set(native.map((record) => String(record.metadata?.generationId ?? record.id)));
    const legacy = generationStore.list({
      kind: "image",
      ...(scopedOptions.backendId ? { backendId: scopedOptions.backendId } : {}),
      ...(scopedOptions.status ? { status: scopedOptions.status } : {}),
    })
      .filter((record) => !existingIds.has(record.id))
      .map(mapGenerationToImageRecord);
    const query = scopedOptions.query?.trim().toLowerCase();
    const merged = [...native, ...legacy]
      .filter((record) => !scopedOptions.operation || record.operation === scopedOptions.operation)
      .filter((record) => !scopedOptions.provenance || record.provenance === scopedOptions.provenance)
      .filter((record) => !scopedOptions.imageType || record.imageType === scopedOptions.imageType)
      .filter((record) => !scopedOptions.project || record.project === scopedOptions.project)
      .filter((record) => !scopedOptions.provider || record.provider === scopedOptions.provider)
      .filter((record) => !scopedOptions.model || record.model === scopedOptions.model)
      .filter((record) => !scopedOptions.parentId || record.parentId === scopedOptions.parentId)
      .filter((record) => !scopedOptions.sourceImageId || record.sourceImageIds.includes(scopedOptions.sourceImageId))
      .filter((record) => !scopedOptions.tag || record.tags.includes(scopedOptions.tag))
      .filter((record) => !query || `${record.title} ${record.prompt} ${record.tags.join(" ")} ${record.provider ?? ""} ${record.model ?? ""}`.toLowerCase().includes(query))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return merged.slice(0, Math.max(1, scopedOptions.limit ?? Number.MAX_SAFE_INTEGER));
  }

  function getImageRecord(id: string): ImageRecord | null {
    const image = imageStore.get(id);
    if (image) return image;
    const generation = generationStore.get(id);
    return generation?.kind === "image" ? mapGenerationToImageRecord(generation) : null;
  }

  function removeImageRecord(id: string): boolean {
    return imageStore.remove(id) || removeGenerationRecord(id);
  }

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

  function listWorkspaceSkillPaths(): string[] {
    const skillsDir = path.join(workspaceDir, "skills");
    try {
      return fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => path.join(skillsDir, entry.name))
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  }

  function diffWorkspaceSkillPaths(before: string[], after: string[]): string[] {
    const beforeSet = new Set(before);
    return after.filter((entry) => !beforeSet.has(entry));
  }

  async function readSkillSources(): Promise<SkillSourceDescriptor[]> {
    return Promise.all(
      listSkillSources().map((source) => source.status({
        runner: processHost,
        workspaceDir,
        env: resolvedRuntimeOptions.env,
      }))
    );
  }

  async function resolveReadySkillSource(sourceId: string): Promise<SkillSourceAdapter> {
    return getSkillSource(sourceId);
  }

  async function searchSkillCatalog(query: string, options: { source?: string; limit?: number } = {}): Promise<SkillSearchResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        query: trimmedQuery,
        entries: [],
        sources: await readSkillSources(),
        warnings: ["Query is empty."],
      };
    }

    const descriptors = await readSkillSources();
    const requestedSource = options.source?.trim();
    const omittedSources: Array<{ source: string; reason: string }> = [];
    const warnings: string[] = [];
    const entries: SkillCatalogEntry[] = [];

    const targets = requestedSource
      ? descriptors.filter((descriptor) => descriptor.id === requestedSource)
      : descriptors;

    if (requestedSource && targets.length === 0) {
      throw new Error(`Unsupported skill source: ${requestedSource}`);
    }

    for (const descriptor of targets) {
      const source = getSkillSource(descriptor.id);

      if (source.search && descriptor.capabilities.search) {
        try {
          const result = await source.search(trimmedQuery, { limit: options.limit }, {
            runner: processHost,
            workspaceDir,
            env: resolvedRuntimeOptions.env,
          });
          entries.push(...result.entries);
          warnings.push(...(result.warnings ?? []));
        } catch (error) {
          omittedSources.push({
            source: descriptor.id,
            reason: error instanceof Error ? error.message : "Search failed.",
          });
        }
        continue;
      }

      if (requestedSource && source.resolveExact && descriptor.capabilities.resolveExact) {
        try {
          const resolved = await source.resolveExact(trimmedQuery, {
            runner: processHost,
            workspaceDir,
            env: resolvedRuntimeOptions.env,
          });
          if (resolved) {
            entries.push(resolved);
          } else {
            omittedSources.push({
              source: descriptor.id,
              reason: "This source supports exact refs only in v1.",
            });
          }
        } catch (error) {
          omittedSources.push({
            source: descriptor.id,
            reason: error instanceof Error ? error.message : "Exact resolution failed.",
          });
        }
        continue;
      }

      omittedSources.push({
        source: descriptor.id,
        reason: "General text search is not supported for this source in v1.",
      });
    }

    return {
      query: trimmedQuery,
      entries,
      sources: descriptors,
      ...(omittedSources.length > 0 ? { omittedSources } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async function installSkillFromSource(ref: string, options: { source?: string } = {}): Promise<SkillInstallResult & { syncedSkills?: SkillDescriptor[] }> {
    const normalizedRef = normalizeInstallRef(ref);
    if (!normalizedRef) {
      throw new Error("Skill ref is required.");
    }

    const sourceId = options.source?.trim() || resolveSkillSourceFromRef(ref)?.id;
    if (!sourceId) {
      throw new Error("Unable to infer a skill source from the ref. Pass { source } explicitly.");
    }

    const source = await resolveReadySkillSource(sourceId);
    const beforePaths = listWorkspaceSkillPaths();
    const result = await source.install(normalizedRef, {
      runner: processHost,
      workspaceDir,
      env: resolvedRuntimeOptions.env,
    });
    const afterPaths = listWorkspaceSkillPaths();
    const detectedPaths = diffWorkspaceSkillPaths(beforePaths, afterPaths);
    const installedPaths = result.installedPaths && result.installedPaths.length > 0
      ? result.installedPaths
      : detectedPaths;

    let runtimeVisibility = result.runtimeVisibility;
    if (installedPaths.length > 0) {
      runtimeVisibility = "runtime";
    }

    const finalResult: SkillInstallResult & { syncedSkills?: SkillDescriptor[] } = {
      ...result,
      runtimeVisibility,
      ...(installedPaths.length > 0 ? { installedPaths } : {}),
    };

    if (runtimeVisibility === "runtime" || runtimeVisibility === "unknown") {
      const syncedSkills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
      persistSkillsState(syncedSkills);
      appendAuditEvent("skills.synced", "skills", { count: syncedSkills.length, runtimeAdapter: adapter.id });
      eventBus.emit("skills.synced", { count: syncedSkills.length, runtimeAdapter: adapter.id });
      finalResult.syncedSkills = syncedSkills;
      if (syncedSkills.length > 0 && runtimeVisibility === "unknown") {
        finalResult.runtimeVisibility = "runtime";
      }
    }

    appendAuditEvent("skills.installed", "skills", {
      source: finalResult.source,
      slug: finalResult.slug,
      runtimeVisibility: finalResult.runtimeVisibility,
      runtimeAdapter: adapter.id,
    });
    eventBus.emit("skills.installed", {
      source: finalResult.source,
      slug: finalResult.slug,
      runtimeVisibility: finalResult.runtimeVisibility,
      runtimeAdapter: adapter.id,
    });

    return finalResult;
  }

  async function readProviderAuth(): Promise<Record<string, ProviderAuthSummary>> {
    try {
      return await adapter.getProviderAuth(processHost, resolvedRuntimeOptions);
    } catch {
      return {};
    }
  }

  async function readDefaultModel(): Promise<DefaultModelRef | null> {
    try {
      return await adapter.getDefaultModel(processHost, resolvedRuntimeOptions);
    } catch {
      return null;
    }
  }

  async function readProviderCatalog(): Promise<ProviderCatalog> {
    try {
      return await adapter.getProviderCatalog(processHost, resolvedRuntimeOptions);
    } catch {
      return { providers: [] };
    }
  }

  function resolveRequestedAuthProvider(provider: string): string {
    const requested = provider.trim();
    if (!requested) return requested;
    const diagnostics = adapter.diagnostics(requested, resolvedRuntimeOptions) as AuthDiagnostics & {
      resolvedOauthProvider?: string | null;
    };
    return diagnostics.resolvedOauthProvider?.trim() || requested;
  }

  async function prepareAuthLogin(provider: string): Promise<AuthLoginPlan> {
    const requestedProvider = provider.trim();
    const resolvedProvider = resolveRequestedAuthProvider(requestedProvider);

    if (typeof adapter.prepareLogin === "function") {
      const prepared = await adapter.prepareLogin(requestedProvider, processHost, resolvedRuntimeOptions).catch(() => null);
      if (prepared) {
        return prepared;
      }
    }

    const summaries = await readProviderAuth();
    const current = summaries[resolvedProvider] ?? summaries[requestedProvider];
    if (current?.hasAuth && current.hasSubscription) {
      return {
        requestedProvider,
        provider: current.provider,
        status: "reused",
        hasExistingAuth: true,
        launchMode: "none",
        message: "Existing provider auth is already available.",
      };
    }

    return {
      requestedProvider,
      provider: resolvedProvider,
      status: "launch_required",
      hasExistingAuth: false,
      launchMode: adapter.id === "openclaw" ? "browser" : "unknown",
      message: "Interactive sign-in is required.",
    };
  }

  async function readModelCatalog(): Promise<ModelCatalog> {
    try {
      return await adapter.getModelCatalog(processHost, resolvedRuntimeOptions);
    } catch {
      return { models: [], defaultModel: null };
    }
  }

  async function readAuthState(): Promise<AuthState> {
    try {
      return await adapter.getAuthState(processHost, resolvedRuntimeOptions);
    } catch {
      return { providers: {} };
    }
  }

  async function readSchedulers(): Promise<SchedulerDescriptor[]> {
    try {
      return await adapter.listSchedulers(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readMemory(): Promise<MemoryDescriptor[]> {
    try {
      return await adapter.listMemory(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readSkills(): Promise<SkillDescriptor[]> {
    try {
      return await adapter.listSkills(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readChannels(): Promise<ChannelDescriptor[]> {
    const telegramChannel = telegram.channel();
    const slackChannel = slack.channel();
    const whatsappChannel = whatsapp.channel();
    const registryChannels = channelsRegistry.accounts.descriptors();
    const registryChannelIds = new Set(registryChannels.map((channel) => channel.id));
    try {
      const channels = await adapter.listChannels(processHost, resolvedRuntimeOptions);
      const runtimeChannelMap = new Map(channels.map((channel) => [channel.id, channel]));
      const filtered = channels.filter((channel) => channel.id !== "telegram" && channel.id !== "slack" && channel.id !== "whatsapp" && !registryChannelIds.has(channel.id));
      const result = [...filtered, ...registryChannels.filter((channel) => channel.id !== "telegram")];
      const shouldUseLocalTelegram = telegramChannel.status !== "disconnected" || !!readTelegramStateSnapshot(workspaceDir, filesystem);
      const registryTelegram = registryChannels.find((channel) => channel.id === "telegram");
      if (registryTelegram) {
        result.push(registryTelegram);
      } else if (shouldUseLocalTelegram) {
        result.push(telegramChannel);
      } else if (runtimeChannelMap.has("telegram")) {
        result.push(runtimeChannelMap.get("telegram")!);
      }
      const shouldUseLocalSlack = slackChannel.status !== "disconnected" || !!readSlackStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalSlack) {
        result.push(slackChannel);
      } else if (runtimeChannelMap.has("slack")) {
        result.push(runtimeChannelMap.get("slack")!);
      }
      const shouldUseLocalWhatsApp = whatsappChannel.status !== "disconnected" || !!readWhatsAppStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalWhatsApp) {
        result.push(whatsappChannel);
      } else if (runtimeChannelMap.has("whatsapp")) {
        result.push(runtimeChannelMap.get("whatsapp")!);
      }
      return result;
    } catch {
      const result: ChannelDescriptor[] = [...registryChannels.filter((channel) => channel.id !== "telegram")];
      const registryTelegram = registryChannels.find((channel) => channel.id === "telegram");
      if (registryTelegram) {
        result.push(registryTelegram);
      } else if (telegramChannel.status !== "disconnected" || readTelegramStateSnapshot(workspaceDir, filesystem)) {
        result.push(telegramChannel);
      }
      if (slackChannel.status !== "disconnected" || readSlackStateSnapshot(workspaceDir, filesystem)) {
        result.push(slackChannel);
      }
      if (whatsappChannel.status !== "disconnected" || readWhatsAppStateSnapshot(workspaceDir, filesystem)) {
        result.push(whatsappChannel);
      }
      return result;
    }
  }

  function searchSessionsLocally(input: SessionSearchInput): SessionSearchResult[] {
    return sessionStore.searchSessions(input.query, {
      limit: input.limit,
      includeMessages: input.includeMessages,
    });
  }

  function mediaKindFromMime(mimeType: string): MediaKind {
    const lower = mimeType.toLowerCase();
    if (lower.startsWith("image/")) return "image";
    if (lower.startsWith("audio/")) return "audio";
    if (lower.startsWith("video/")) return "video";
    if (
      lower.startsWith("text/")
      || lower === "application/pdf"
      || lower.includes("document")
      || lower.includes("spreadsheet")
      || lower.includes("presentation")
      || lower === "application/json"
    ) return "document";
    return "other";
  }

  function mediaKindFromTelegram(type: TelegramSendMediaInput["type"]): MediaKind {
    if (type === "photo") return "image";
    if (type === "audio") return "audio";
    if (type === "video") return "video";
    if (type === "animation") return "animation";
    return "document";
  }

  function mediaKindFromChannel(type: SendChannelMessageInput["mediaType"]): MediaKind {
    if (type === "photo") return "image";
    if (type === "audio") return "audio";
    if (type === "video") return "video";
    if (type === "animation") return "animation";
    return "document";
  }

  function parseMediaStorageUrl(value: string | undefined): { bucket: string; key: string; url: string } | undefined {
    if (!value?.startsWith("storage://")) return undefined;
    const rest = value.slice("storage://".length);
    const slashIndex = rest.indexOf("/");
    if (slashIndex <= 0) return undefined;
    return {
      bucket: rest.slice(0, slashIndex),
      key: rest.slice(slashIndex + 1),
      url: value,
    };
  }

  function readDocumentIndexText(document: DocumentRecord): string | undefined {
    if (!document.textPath) return undefined;
    const indexPath = path.isAbsolute(document.textPath)
      ? document.textPath
      : path.resolve(workspaceDir, document.textPath);
    try {
      return fs.readFileSync(indexPath, "utf8");
    } catch {
      return undefined;
    }
  }

  function registerDocumentMedia(document: DocumentRecord, direction: "inbound" | "outbound" | "internal" = "internal"): MediaRecord {
    return mediaStore.register({
      name: document.name,
      mimeType: document.mimeType,
      kind: mediaKindFromMime(document.mimeType),
      workspaceId: document.workspaceId ?? options.workspace.workspaceId,
      projectId: document.projectId ?? options.workspace.projectId,
      agentId: document.agentId ?? logicalAgentId,
      sessionId: document.sessionId,
      messageId: document.createdByMessageId,
      origin: document.origin === "assistant_generated" ? "assistant_generated" : document.origin,
      direction,
      storage: parseMediaStorageUrl(document.storage.path),
      external: parseMediaStorageUrl(document.storage.path) ? undefined : { value: document.storage.path, kind: "opaque" },
      sourceText: readDocumentIndexText(document),
      sourceType: "document",
      sourceId: document.documentId,
      metadata: {
        documentId: document.documentId,
        indexStatus: document.indexStatus,
      },
    });
  }

  function registerGeneratedMedia(record: GenerationRecord): MediaRecord | null {
    if (record.status !== "succeeded" || !record.output) return null;
    return mediaStore.register({
      name: path.basename(record.output.relativePath),
      mimeType: record.output.mimeType ?? "application/octet-stream",
      kind: record.kind === "document" ? "document" : record.kind,
      filePath: record.output.filePath,
      workspaceId: options.workspace.workspaceId,
      projectId: options.workspace.projectId,
      agentId: logicalAgentId,
      origin: "generated",
      direction: "internal",
      sourceText: record.prompt,
      sourceType: "generation",
      sourceId: record.id,
      metadata: {
        generationId: record.id,
        backendId: record.backendId,
        title: record.title,
      },
    });
  }

  function registerImageMedia(record: ImageRecord): MediaRecord | null {
    if (record.status !== "succeeded" || !record.output) return null;
    return mediaStore.register({
      name: path.basename(record.output.relativePath),
      mimeType: record.output.mimeType ?? "image/*",
      kind: "image",
      filePath: record.output.filePath,
      workspaceId: record.workspaceId ?? options.workspace.workspaceId,
      projectId: options.workspace.projectId,
      agentId: record.agentId ?? logicalAgentId,
      origin: record.operation === "import" ? "imported" : "generated",
      direction: "internal",
      sourceText: [record.prompt, record.revisedPrompt, record.title, ...(record.tags ?? [])].filter(Boolean).join(" "),
      sourceType: "image",
      sourceId: record.id,
      metadata: {
        imageId: record.id,
        operation: record.operation,
        provider: record.provider,
        model: record.model,
      },
    });
  }

  function registerVoiceNoteMedia(note: VoiceNoteRecord): MediaRecord {
    return mediaStore.register({
      name: note.audio.fileName ?? `${note.id}.ogg`,
      mimeType: note.audio.mimeType,
      kind: "audio",
      storage: {
        bucket: note.audio.bucket,
        key: note.audio.key,
        url: note.audio.storageUrl,
      },
      agentId: logicalAgentId,
      origin: note.source.origin === "telegram" ? "channel_ingested" : "imported",
      direction: "inbound",
      channel: {
        provider: note.source.provider,
        accountId: note.source.accountId,
        targetId: note.source.targetId,
        ...(note.source.threadId !== undefined ? { threadId: String(note.source.threadId) } : {}),
        providerMessageId: note.source.providerMessageId,
      },
      sourceText: note.transcript?.text,
      sourceType: "voice-note",
      sourceId: note.id,
      metadata: {
        voiceNoteId: note.id,
        durationSeconds: note.audio.durationSeconds,
        status: note.status,
      },
    });
  }

  function registerOutboundChannelMedia(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    media: string;
    mediaType?: TelegramSendMediaInput["type"] | SendChannelMessageInput["mediaType"];
    text?: string;
    agentId?: string;
    response?: Record<string, unknown>;
    command?: string;
  }): MediaRecord {
    const providerMessageId = typeof input.response?.message_id === "number" || typeof input.response?.message_id === "string"
      ? String(input.response.message_id)
      : undefined;
    const mediaValue = input.media.trim();
    const localPath = mediaValue && fs.existsSync(mediaValue) ? mediaValue : undefined;
    const isUrl = /^https?:\/\//i.test(mediaValue);
    const mediaType = input.mediaType ?? "document";
    const kind = typeof mediaType === "string" && mediaType !== "document"
      ? mediaKindFromChannel(mediaType as SendChannelMessageInput["mediaType"])
      : "document";
    return mediaStore.register({
      name: localPath ? path.basename(localPath) : path.basename(new URL(isUrl ? mediaValue : "file:///media").pathname) || mediaValue,
      mimeType: kind === "image" ? "image/*" : kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "application/octet-stream",
      kind,
      filePath: localPath,
      external: localPath ? undefined : {
        provider: input.provider,
        value: mediaValue,
        kind: isUrl ? "url" : "provider_file_id",
      },
      workspaceId: options.workspace.workspaceId,
      projectId: options.workspace.projectId,
      agentId: input.agentId ?? logicalAgentId,
      command: input.command,
      origin: "assistant_generated",
      direction: "outbound",
      channel: {
        provider: input.provider,
        accountId: input.accountId ?? "default",
        targetId: input.targetId,
        ...(input.threadId !== undefined ? { threadId: String(input.threadId) } : {}),
        ...(providerMessageId ? { providerMessageId } : {}),
      },
      sourceText: input.text,
      sourceType: "channel-message",
      sourceId: [
        input.provider,
        input.accountId ?? "default",
        input.targetId,
        input.threadId,
        providerMessageId,
        mediaValue,
      ].filter((part) => part !== undefined && part !== null && String(part).trim()).map(String).join(":"),
      metadata: {
        mediaType,
      },
    });
  }

  function registerInboundTelegramMedia(message: ChannelMessageRecord): void {
    if (message.provider !== "telegram") return;
    const rawMessage = (message.raw?.message ?? message.raw?.edited_message) as Record<string, unknown> | undefined;
    if (!rawMessage) return;
    const candidates: Array<{ key: string; kind: MediaKind; mimeType: string; value: unknown }> = [
      { key: "photo", kind: "image", mimeType: "image/*", value: rawMessage.photo },
      { key: "document", kind: "document", mimeType: "application/octet-stream", value: rawMessage.document },
      { key: "audio", kind: "audio", mimeType: "audio/*", value: rawMessage.audio },
      { key: "voice", kind: "audio", mimeType: "audio/ogg", value: rawMessage.voice },
      { key: "video", kind: "video", mimeType: "video/*", value: rawMessage.video },
      { key: "animation", kind: "animation", mimeType: "image/gif", value: rawMessage.animation },
    ];
    for (const candidate of candidates) {
      const value = Array.isArray(candidate.value)
        ? [...candidate.value].reverse().find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined
        : candidate.value as Record<string, unknown> | undefined;
      if (!value || typeof value !== "object") continue;
      const fileId = typeof value.file_id === "string" ? value.file_id : "";
      if (!fileId) continue;
      const fileName = typeof value.file_name === "string" ? value.file_name : `${candidate.key}-${fileId.slice(0, 12)}`;
      mediaStore.register({
        name: fileName,
        mimeType: typeof value.mime_type === "string" ? value.mime_type : candidate.mimeType,
        kind: candidate.kind,
        external: {
          provider: "telegram",
          value: fileId,
          kind: "provider_file_id",
        },
        agentId: logicalAgentId,
        origin: "channel_ingested",
        direction: "inbound",
        channel: {
          provider: "telegram",
          accountId: message.accountId,
          targetId: message.targetId,
          threadId: message.threadId,
          providerMessageId: message.providerMessageId,
        },
        sourceText: message.text,
        sourceType: "channel-message",
        sourceId: [
          "telegram",
          message.accountId,
          message.targetId,
          message.threadId,
          message.providerMessageId,
          fileId,
        ].filter(Boolean).join(":"),
        metadata: {
          telegramMediaType: candidate.key,
          fileUniqueId: typeof value.file_unique_id === "string" ? value.file_unique_id : undefined,
        },
      });
    }
  }

  function prepareMessageDocuments(
    sessionId: string,
    message: Parameters<SessionStore["appendMessage"]>[1],
  ): Parameters<SessionStore["appendMessage"]>[1] {
    const directDocuments = Array.isArray(message.documents) ? [...message.documents] : [];
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length === 0) {
      return {
        ...message,
        ...(directDocuments.length > 0 ? { documents: directDocuments } : {}),
      };
    }

    const uploadedDocuments: DocumentRef[] = [];
    const legacyAttachments: Attachment[] = [];

    for (const attachment of attachments) {
      if (typeof attachment.data === "string" && attachment.data.trim()) {
        const document = documentStore.upload({
          name: attachment.name,
          mimeType: attachment.mimeType,
          data: attachment.data,
          origin: "user_upload",
          workspaceId: options.workspace.workspaceId,
          ...(options.workspace.projectId ? { projectId: options.workspace.projectId } : {}),
          agentId: options.workspace.agentId,
          sessionId,
        });
        registerDocumentMedia(document, message.role === "assistant" ? "outbound" : message.role === "user" ? "inbound" : "internal");
        uploadedDocuments.push({
          documentId: document.documentId,
          name: document.name,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          ...(document.sha256 ? { sha256: document.sha256 } : {}),
        });
        continue;
      }
      legacyAttachments.push(attachment);
    }

    const legacyDocuments = legacyAttachments.length > 0
      ? resolveLegacyDocumentRefs(message.id ?? `legacy-${sessionId}`, legacyAttachments)
      : [];

    return {
      ...message,
      ...(legacyAttachments.length > 0 ? { attachments: legacyAttachments } : {}),
      documents: [...directDocuments, ...uploadedDocuments, ...legacyDocuments],
    };
  }

  function sanitizeSessionPart(value: string): string {
    return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "default";
  }

  function hashSessionPart(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
  }

  function resolveChannelSessionKey(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
  }): string {
    return [
      input.provider,
      input.accountId ?? "default",
      input.targetId,
      input.threadId === undefined ? "chat" : `topic:${String(input.threadId)}`,
    ].join(":");
  }

  function resolveChannelSessionId(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
  }): string {
    const key = resolveChannelSessionKey(input);
    return `channel-${sanitizeSessionPart(input.provider)}-${sanitizeSessionPart(input.targetId)}-${hashSessionPart(key)}`;
  }

  function resolveChannelMessageId(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    direction: "inbound" | "outbound";
    providerMessageId?: string;
    content: string;
  }): string {
    const stablePart = input.providerMessageId?.trim()
      || hashSessionPart(`${input.direction}:${input.content}`);
    return `channel-${hashSessionPart([
      resolveChannelSessionKey(input),
      input.direction,
      stablePart,
    ].join(":"))}`;
  }

  function appendChannelSessionMessage(input: {
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
  }): ReturnType<SessionStore["appendMessageOnce"]> & { sessionId: string } {
    const sessionId = resolveChannelSessionId(input);
    if (input.direction === "outbound" && input.providerMessageId) {
      const existing = sessionStore.getSession(sessionId);
      const duplicate = existing?.messages.some((message) => (
        message.role === (input.role ?? "assistant")
        && message.content.trim() === input.content.trim()
        && message.metadata?.provider === input.provider
        && message.metadata?.accountId === (input.accountId ?? "default")
        && message.metadata?.targetId === input.targetId
        && message.metadata?.direction === "outbound"
        && (input.threadId === undefined || message.metadata?.threadId === String(input.threadId))
      ));
      if (duplicate && existing) {
        return { sessionId, session: existing, appended: false };
      }
    }
    const id = resolveChannelMessageId(input);
    const message = prepareMessageDocuments(sessionId, {
      id,
      role: input.role ?? (input.direction === "outbound" ? "assistant" : "user"),
      content: input.content,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      metadata: {
        source: "channel",
        provider: input.provider,
        accountId: input.accountId ?? "default",
        targetId: input.targetId,
        ...(input.threadId !== undefined ? { threadId: String(input.threadId) } : {}),
        direction: input.direction,
        ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        ...(input.senderId ? { senderId: input.senderId } : {}),
        ...(input.senderLabel ? { senderLabel: input.senderLabel } : {}),
        ...(input.metadata ?? {}),
      },
    });
    return {
      sessionId,
      ...sessionStore.appendMessageOnce(sessionId, message),
    };
  }

  function backfillChannelSession(input: {
    provider: string;
    accountId?: string;
    targetId: string;
    threadId?: string | number;
    limit?: number;
    excludeProviderMessageIds?: string[];
  }): ReturnType<SessionStore["getSession"]> {
    const sessionId = resolveChannelSessionId(input);
    const threadKey = input.threadId === undefined ? undefined : String(input.threadId);
    const excludedProviderMessageIds = new Set(input.excludeProviderMessageIds ?? []);
    const records = channelsRegistry.messages.read({
      provider: input.provider,
      accountId: input.accountId,
      targetId: input.targetId,
      limit: input.limit ?? 50,
    })
      .filter((message) => (
        message.threadId === threadKey
        && !!message.text?.trim()
        && !(message.providerMessageId && excludedProviderMessageIds.has(message.providerMessageId))
      ))
      .reverse();

    for (const record of records) {
      const parsedCreatedAt = Date.parse(record.receivedAt ?? record.sentAt ?? record.createdAt);
      appendChannelSessionMessage({
        provider: record.provider,
        accountId: record.accountId,
        targetId: record.targetId,
        ...(record.threadId !== undefined ? { threadId: record.threadId } : {}),
        direction: record.direction,
        content: record.text?.trim() ?? "",
        ...(record.providerMessageId ? { providerMessageId: record.providerMessageId } : {}),
        ...(record.senderId ? { senderId: record.senderId } : {}),
        ...(record.senderLabel ? { senderLabel: record.senderLabel } : {}),
        ...(!Number.isNaN(parsedCreatedAt) ? { createdAt: parsedCreatedAt } : {}),
        metadata: {
          backfilled: true,
        },
      });
    }

    return sessionStore.getSession(sessionId);
  }

  async function resolveSessionDocumentAssets(documents: DocumentRef[]): Promise<Array<{
    name: string;
    mimeType: string;
    data: string;
  }>> {
    const assets: Array<{ name: string; mimeType: string; data: string }> = [];
    for (const document of documents) {
      const downloaded = documentStore.download(document.documentId);
      if (!downloaded) continue;
      assets.push({
        name: downloaded.document.name,
        mimeType: downloaded.document.mimeType,
        data: downloaded.buffer.toString("base64"),
      });
    }
    return assets;
  }

  function searchDocumentsLocally(input: { query: string; limit?: number; sessionId?: string }): DocumentSearchResult[] {
    return documentStore.search(input);
  }

  async function searchDocumentsWithOpenClawMemory(input: { query: string; limit?: number; sessionId?: string }): Promise<DocumentSearchResult[]> {
    const hits = await runOpenClawMemorySearch(input.query, processHost, {
      agentId: runtimeAgentId,
      limit: input.limit,
      env: resolvedRuntimeOptions.env,
    });

    const bestHitByDocument = new Map<string, DocumentSearchResult>();
    for (const hit of hits) {
      const documentId = extractDocumentIdFromSourcePath(hit.path);
      if (!documentId) continue;
      const document = documentStore.get(documentId);
      if (!document) continue;
      if (input.sessionId && document.sessionId !== input.sessionId) continue;

      const candidate: DocumentSearchResult = {
        ...document,
        snippet: hit.text,
        score: hit.score ?? 0,
        ...(hit.path ? { sourcePath: hit.path } : {}),
        ...(typeof hit.startLine === "number" ? { startLine: hit.startLine } : {}),
        ...(typeof hit.endLine === "number" ? { endLine: hit.endLine } : {}),
      };

      const existing = bestHitByDocument.get(documentId);
      if (!existing || candidate.score > existing.score) {
        bestHitByDocument.set(documentId, candidate);
      }
    }

    return [...bestHitByDocument.values()]
      .sort((left, right) => (
        right.score - left.score
        || right.createdAt - left.createdAt
        || left.documentId.localeCompare(right.documentId)
      ))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  async function searchDocuments(input: { query: string; limit?: number; sessionId?: string }): Promise<DocumentSearchResult[]> {
    const normalizedQuery = input.query.trim();
    if (!normalizedQuery) return [];
    if (adapter.id === "openclaw") {
      try {
        const memoryHits = await searchDocumentsWithOpenClawMemory({ ...input, query: normalizedQuery });
        if (memoryHits.length > 0) return memoryHits;
      } catch {
        // Fall back to local index search when OpenClaw memory is unavailable or not configured.
      }
    }
    return searchDocumentsLocally({ ...input, query: normalizedQuery });
  }

  async function searchSessionsWithOpenClawMemory(input: SessionSearchInput): Promise<SessionSearchResult[]> {
    const hits = await runOpenClawMemorySearch(input.query, processHost, {
      agentId: runtimeAgentId,
      limit: input.limit,
      minScore: input.minScore,
      env: resolvedRuntimeOptions.env,
    });

    const bestHitBySession = new Map<string, SessionSearchResult>();
    for (const hit of hits) {
      const sessionId = extractSessionIdFromSourcePath(hit.path);
      if (!sessionId) continue;
      const session = sessionStore.getSession(sessionId);
      if (!session) continue;

      const candidate: SessionSearchResult = {
        sessionId: session.sessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        preview: session.preview,
        snippet: hit.text,
        score: hit.score ?? 0,
        strategy: "openclaw-memory",
        matchedFields: ["memory"],
        ...(hit.path ? { sourcePath: hit.path } : {}),
        ...(typeof hit.startLine === "number" ? { startLine: hit.startLine } : {}),
        ...(typeof hit.endLine === "number" ? { endLine: hit.endLine } : {}),
      };

      const existing = bestHitBySession.get(sessionId);
      if (!existing || candidate.score > existing.score) {
        bestHitBySession.set(sessionId, candidate);
      }
    }

    return [...bestHitBySession.values()]
      .sort((left, right) => (
        right.score - left.score
        || right.updatedAt - left.updatedAt
        || right.createdAt - left.createdAt
        || right.sessionId.localeCompare(left.sessionId)
      ))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  async function searchSessions(input: SessionSearchInput): Promise<SessionSearchResult[]> {
    const normalizedInput: SessionSearchInput = {
      strategy: "auto",
      includeMessages: true,
      fallbackToLocal: true,
      limit: 20,
      ...input,
      query: input.query.trim(),
    };

    if (!normalizedInput.query) {
      return [];
    }

    const strategy = normalizedInput.strategy ?? "auto";
    if (strategy === "local") {
      return searchSessionsLocally(normalizedInput);
    }

    if (strategy === "openclaw-memory" || strategy === "auto") {
      const canUseOpenClawMemory = adapter.id === "openclaw";
      if (canUseOpenClawMemory) {
        try {
          const results = await searchSessionsWithOpenClawMemory(normalizedInput);
          if (results.length > 0 || normalizedInput.fallbackToLocal === false) {
            return results;
          }
        } catch (error) {
          if (strategy === "openclaw-memory" && normalizedInput.fallbackToLocal === false) {
            throw error;
          }
        }
      } else if (strategy === "openclaw-memory" && normalizedInput.fallbackToLocal === false) {
        throw new Error(`openclaw-memory search requires the openclaw adapter, received ${adapter.id}`);
      }
    }

    return searchSessionsLocally(normalizedInput);
  }

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

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function appendChannelListenerLog(logPath: string | undefined, message: string): void {
    if (!logPath) return;
    filesystem.ensureDir(path.dirname(logPath));
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  }

  async function applyChannelProcessorActions(
    actions: ChannelProcessorAction[],
    context: {
      provider: string;
      accountId: string;
      message: ChannelMessageRecord;
      processorId?: string;
      processorAgentId?: string;
    },
  ): Promise<void> {
    for (const action of actions) {
      if (action.type === "ignore") continue;
      if (action.type === "register_target") {
        channelsRegistry.targets.register({
          provider: action.provider ?? context.provider,
          accountId: action.accountId ?? context.accountId,
          targetId: action.targetId,
          kind: action.kind ?? "unknown",
          label: action.label,
          title: action.title,
          username: action.username,
          parentTargetId: action.parentTargetId,
          threadId: action.threadId,
          metadata: action.metadata,
        });
        continue;
      }
      if (action.type === "grant_permission") {
        channelsRegistry.bindings.grant({
          agentId: action.agentId,
          provider: action.provider ?? context.provider,
          accountId: action.accountId ?? context.accountId,
          targetId: action.targetId,
          permissions: action.permissions,
          priority: action.priority,
          metadata: action.metadata,
        });
        continue;
      }
      if (action.type === "send_message") {
        const agentId = action.agentId ?? context.processorAgentId ?? context.processorId;
        const targetId = action.targetId ?? context.message.targetId;
        if (!channelsRegistry.bindings.can(agentId, "write", { provider: context.provider, accountId: context.accountId, targetId })) {
          throw new Error(`processor ${context.processorId ?? "unknown"} does not have write permission for ${context.provider}:${targetId}`);
        }
        await sendTelegramAccountMessage({
          registry: channelsRegistry,
          runner: processHost,
          env: secretsEnv,
        }, {
          provider: context.provider,
          accountId: context.accountId,
          targetId,
          text: action.text,
          media: action.media,
          mediaType: action.mediaType,
          threadId: action.threadId ?? context.message.threadId,
          parseMode: action.parseMode,
          agentId,
          metadata: {
            ...(action.metadata ?? {}),
            processorId: context.processorId,
          },
        });
      }
    }
  }

  function extractTelegramVoiceMedia(message: ChannelMessageRecord): {
    kind: "voice" | "audio";
    fileId: string;
    fileUniqueId?: string;
    mimeType?: string;
    durationSeconds?: number;
    fileName?: string;
  } | null {
    const rawMessage = (message.raw?.message ?? message.raw?.edited_message) as Record<string, unknown> | undefined;
    const voice = rawMessage?.voice as Record<string, unknown> | undefined;
    const audio = rawMessage?.audio as Record<string, unknown> | undefined;
    const media = voice ?? audio;
    if (!media || typeof media.file_id !== "string") return null;
    return {
      kind: voice ? "voice" : "audio",
      fileId: media.file_id,
      fileUniqueId: typeof media.file_unique_id === "string" ? media.file_unique_id : undefined,
      mimeType: typeof media.mime_type === "string" ? media.mime_type : undefined,
      durationSeconds: typeof media.duration === "number" ? media.duration : undefined,
      fileName: typeof media.file_name === "string" ? media.file_name : undefined,
    };
  }

  function extractTelegramLanguageHint(message: ChannelMessageRecord): string | undefined {
    const rawMessage = (message.raw?.message ?? message.raw?.edited_message) as Record<string, unknown> | undefined;
    const from = rawMessage?.from as Record<string, unknown> | undefined;
    const languageCode = typeof from?.language_code === "string" ? from.language_code.trim().toLowerCase() : "";
    const normalized = languageCode.split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(normalized) ? normalized : undefined;
  }

  async function ingestTelegramVoiceNote(message: ChannelMessageRecord): Promise<ChannelMessageRecord> {
    if (message.provider !== "telegram" || message.text?.trim()) return message;
    const media = extractTelegramVoiceMedia(message);
    if (!media) return message;
    const account = channelsRegistry.accounts.get("telegram", message.accountId);
    if (!account?.secretRef) return message;
    const apiBaseUrl = typeof account.metadata?.apiBaseUrl === "string" && account.metadata.apiBaseUrl.trim()
      ? account.metadata.apiBaseUrl
      : "https://api.telegram.org";
    const fileInfo = await callTelegramApi<Record<string, unknown>>(
      processHost,
      secretsEnv,
      account.secretRef,
      apiBaseUrl,
      "getFile",
      { file_id: media.fileId },
    );
    const telegramFilePath = typeof fileInfo.file_path === "string" ? fileInfo.file_path : null;
    if (!telegramFilePath) throw new Error("Telegram getFile did not return file_path");
    const buffer = await downloadTelegramFile(processHost, secretsEnv, account.secretRef, apiBaseUrl, telegramFilePath);
    const note = voiceNoteStore.create({
      data: buffer,
      mimeType: media.mimeType ?? (media.kind === "voice" ? "audio/ogg" : "application/octet-stream"),
      fileName: media.fileName ?? path.basename(telegramFilePath),
      durationSeconds: media.durationSeconds,
      source: {
        origin: "telegram",
        provider: "telegram",
        accountId: message.accountId,
        targetId: message.targetId,
        threadId: message.threadId,
        providerMessageId: message.providerMessageId,
        senderId: message.senderId,
        senderLabel: message.senderLabel,
        receivedAt: message.receivedAt,
        metadata: {
          fileId: media.fileId,
          fileUniqueId: media.fileUniqueId,
          kind: media.kind,
        },
      },
    });
    registerVoiceNoteMedia(note);
    const config = readSttConfig();
    const languageHint = config.language === "auto" || !config.language ? extractTelegramLanguageHint(message) : undefined;
    const transcriptionConfig = languageHint ? { ...config, language: languageHint } : config;
    const transcribed = config.enabled === false && !config.modelPath
      ? note
      : await voiceNoteStore.transcribe(note.id, transcriptionConfig);
    registerVoiceNoteMedia(transcribed);
    const transcript = transcribed.transcript?.text?.trim();
    if (!transcript) return message;
    return {
      ...message,
      text: transcript,
      metadata: {
        ...(message.metadata ?? {}),
        voiceNoteId: transcribed.id,
        voiceNoteStatus: transcribed.status,
        transcriptProvider: transcribed.transcript?.provider,
      },
    };
  }

  async function ensureTelegramCodexBridgeCommands(accountId?: string): Promise<void> {
    const account = channelsRegistry.accounts.get("telegram", accountId);
    const existingCommands = account?.metadata?.commands;
    if (
      Array.isArray(existingCommands) &&
      existingCommands.length === TELEGRAM_CODEX_BRIDGE_COMMANDS.length &&
      existingCommands.every((command, index) => {
        const expected = TELEGRAM_CODEX_BRIDGE_COMMANDS[index];
        return command.command === expected?.command && command.description === expected.description;
      })
    ) return;
    await setTelegramAccountCommands({
      registry: channelsRegistry,
      runner: processHost,
      env: secretsEnv,
    }, accountId, TELEGRAM_CODEX_BRIDGE_COMMANDS);
    await refreshChannelSnapshots();
  }

  async function runChannelListener(input: {
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
  } = {}): Promise<ChannelListenerDescriptor> {
    const provider = input.provider ?? "telegram";
    const accountId = input.accountId ?? "default";
    if (provider !== "telegram") {
      throw new Error(`unsupported channel provider: ${provider}`);
    }
    const listenerId = `${provider}:${accountId}`;
    const configuredProcessor = input.processorId ? channelsRegistry.processors.get(input.processorId) : null;
    if (input.processorId && !configuredProcessor) {
      throw new Error(`channel processor not found: ${input.processorId}`);
    }
    if (provider === "telegram" && configuredProcessor?.id === "telegram-codex") {
      await ensureTelegramCodexBridgeCommands(accountId);
    }
    const resolveProcessorForMessage = (message: ChannelMessageRecord): ChannelProcessorDescriptor | null => {
      if (configuredProcessor) return configuredProcessor;
      const assignment = channelsRegistry.bindings.list({ provider, accountId })
        .filter((binding) => {
          if (!binding.enabled) return false;
          if (binding.targetId && binding.targetId !== message.targetId) return false;
          return binding.metadata?.assignmentType === "channel-agent";
        })
        .sort((left, right) => right.priority - left.priority)[0];
      const processorId = typeof assignment?.metadata?.processorId === "string"
        ? assignment.metadata.processorId
        : assignment?.agentId;
      return processorId ? channelsRegistry.processors.get(processorId) : null;
    };
    const startedAt = new Date().toISOString();
    if (input.pidPath) {
      filesystem.ensureDir(path.dirname(input.pidPath));
      filesystem.writeTextAtomic(input.pidPath, `${process.pid}\n`);
    }
    if (input.stopPath && fs.existsSync(input.stopPath)) {
      fs.rmSync(input.stopPath, { force: true });
    }
    let listener = channelsRegistry.listeners.upsert({
      id: listenerId,
      provider,
      accountId,
      processorId: configuredProcessor?.id,
      mode: input.mode ?? "foreground",
      status: "running",
      pid: process.pid,
      pidPath: input.pidPath,
      logPath: input.logPath,
      stopPath: input.stopPath,
      startedAt,
      lastHeartbeatAt: startedAt,
    });
    channelsRegistry.events.record({ type: "channel.listener.started", provider, accountId, processorId: configuredProcessor?.id, status: "ok" });
    eventBus.emit("channel.listener.started", { provider, accountId, processorId: configuredProcessor?.id, pid: process.pid });
    appendChannelListenerLog(input.logPath, `listener started provider=${provider} account=${accountId} processor=${configuredProcessor?.id ?? "assigned"}`);

    while (true) {
      if (input.stopPath && fs.existsSync(input.stopPath)) break;
      try {
        listener = channelsRegistry.listeners.upsert({
          id: listenerId,
          provider,
          accountId,
          processorId: configuredProcessor?.id,
          mode: input.mode ?? "foreground",
          status: "running",
          pid: process.pid,
          pidPath: input.pidPath,
          logPath: input.logPath,
          stopPath: input.stopPath,
          startedAt,
          lastHeartbeatAt: new Date().toISOString(),
        });
        const messages = await syncTelegramAccount({
          registry: channelsRegistry,
          runner: processHost,
          env: secretsEnv,
        }, {
          accountId,
          limit: 100,
          timeoutSeconds: input.timeoutSeconds ?? 1,
        });
        appendChannelListenerLog(input.logPath, `synced ${messages.length} messages`);
        for (const message of messages) {
          const processor = resolveProcessorForMessage(message);
          if (!processor) continue;
          try {
            const processorMessage = await ingestTelegramVoiceNote(message);
            const result = await invokeChannelProcessor(processor, {
              type: "channel.message.received",
              provider,
              accountId,
              targetId: processorMessage.targetId,
              message: processorMessage,
              processorId: processor.id,
            }, { env: secretsEnv, timeoutMs: input.processorTimeoutMs ?? 120_000 });
            channelsRegistry.events.record({
              type: "channel.processor.invoked",
              provider,
              accountId,
              targetId: processorMessage.targetId,
              messageId: processorMessage.id,
              processorId: processor.id,
              status: result.actions.length > 0 ? "ok" : "ignored",
              payload: { actionCount: result.actions.length },
            });
            await applyChannelProcessorActions(result.actions, {
              provider,
              accountId,
              message: processorMessage,
              processorId: processor.id,
              processorAgentId: processor.agentId,
            });
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            channelsRegistry.events.record({
              type: "channel.processor.invoked",
              provider,
              accountId,
              targetId: message.targetId,
              messageId: message.id,
              processorId: processor.id,
              status: "error",
              payload: { error: messageText },
            });
            appendChannelListenerLog(input.logPath, `processor error ${messageText}`);
          }
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        channelsRegistry.events.record({ type: "channel.listener.error", provider, accountId, processorId: configuredProcessor?.id, status: "error", payload: { error: messageText } });
        listener = channelsRegistry.listeners.upsert({
          id: listenerId,
          provider,
          accountId,
          processorId: configuredProcessor?.id,
          mode: input.mode ?? "foreground",
          status: "error",
          pid: process.pid,
          pidPath: input.pidPath,
          logPath: input.logPath,
          stopPath: input.stopPath,
          startedAt,
          lastHeartbeatAt: new Date().toISOString(),
          lastError: messageText,
        });
        appendChannelListenerLog(input.logPath, `listener error ${messageText}`);
        await sleep(Math.max(1_000, Math.min(input.intervalMs ?? 2_000, 10_000)));
      }
      if (input.once) break;
      await sleep(input.intervalMs ?? 2_000);
    }

    listener = channelsRegistry.listeners.upsert({
      id: listenerId,
      provider,
      accountId,
      processorId: configuredProcessor?.id,
      mode: input.mode ?? "foreground",
      status: "stopped",
      pid: process.pid,
      pidPath: input.pidPath,
      logPath: input.logPath,
      stopPath: input.stopPath,
      startedAt,
      stoppedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    });
    channelsRegistry.events.record({ type: "channel.listener.stopped", provider, accountId, processorId: configuredProcessor?.id, status: "ok" });
    eventBus.emit("channel.listener.stopped", { provider, accountId, processorId: configuredProcessor?.id, pid: process.pid });
    appendChannelListenerLog(input.logPath, `listener stopped provider=${provider} account=${accountId}`);
    return listener;
  }

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
        clawjs: {
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
        const backupDir = path.join(workspaceDir, ".clawjs", "backups");
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
          backupDir: path.join(workspaceDir, ".clawjs", "backups"),
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
    soul: {
      list: () => soulStore.list(),
      get: (id) => soulStore.get(id),
      init: (input = {}) => soulStore.init(input),
      assign: (input) => soulStore.assign(input),
      assignmentForAgent: (targetAgentId) => soulStore.assignmentForAgent(targetAgentId),
      resolve: (input = {}) => soulStore.resolve(input),
      validate: (input) => soulStore.validate(input),
      preview: (input = {}) => soulStore.preview({ ...input, write: false }),
      compile: (input = {}) => {
        const result = soulStore.compile(input);
        appendAuditEvent("soul.compiled", "file_sync", {
          soulId: result.soulId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        eventBus.emit("soul.compiled", {
          soulId: result.soulId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        return result;
      },
      inspect: (id, targetAgentId) => soulStore.inspect(id, targetAgentId),
    },
    user: {
      list: () => userStore.list(),
      get: (id) => userStore.get(id),
      init: (input = {}) => userStore.init(input),
      set: (input) => userStore.set(input),
      add: (input) => userStore.addRecord(input),
      propose: (input) => userStore.propose(input),
      verify: (proposalId, targetUserId) => userStore.verify(proposalId, targetUserId),
      assign: (input) => userStore.assign(input),
      assignmentForAgent: (targetAgentId) => userStore.assignmentForAgent(targetAgentId),
      resolve: (input = {}) => userStore.resolve(input),
      validate: (input) => userStore.validate(input),
      preview: (input = {}) => userStore.preview({ ...input, write: false }),
      compile: (input = {}) => {
        const result = userStore.compile(input);
        appendAuditEvent("user.compiled", "file_sync", {
          userId: result.userId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        eventBus.emit("user.compiled", {
          userId: result.userId,
          agentId: result.agentId ?? logicalAgentId,
          changed: result.changed,
        });
        return result;
      },
      inspect: (id, targetAgentId) => userStore.inspect(id, targetAgentId),
    },
    compat: {
      refresh: async () => {
        const status = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const compat = adapter.buildCompatReport(status);
        const snapshot = writeCompatSnapshot(workspaceDir, status, compat, filesystem);
        writeCapabilityReport(workspaceDir, {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          runtimeAdapter: compat.runtimeAdapter,
          runtimeVersion: compat.runtimeVersion,
          degraded: compat.degraded,
          capabilities: compat.capabilities,
          capabilityMap: compat.capabilityMap,
          issues: compat.issues,
          ...(compat.diagnostics ? { diagnostics: compat.diagnostics } : {}),
        }, filesystem);
        persistSchedulerState(await readSchedulers());
        persistMemoryState(await readMemory());
        persistSkillsState(await readSkills());
        persistChannelsState(await readChannels());
        appendAuditEvent("compat.refreshed", "compat", {
          degraded: compat.degraded,
          issueCount: compat.issues.length,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("compat.refreshed", {
          degraded: compat.degraded,
          issueCount: compat.issues.length,
          runtimeAdapter: adapter.id,
        });
        return snapshot;
      },
      read: () => readCompatSnapshot(workspaceDir, filesystem),
    },
    doctor: {
      run: async () => {
        const baseStatus = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const status = await augmentRuntimeStatusWithPluginBridge(baseStatus);
        const compat = adapter.buildCompatReport(status);
        const runtimeDoctor = adapter.buildDoctorReport(status);
        if (adapter.id === "openclaw") {
          const bridgeStatus = await pluginBridgeStatus();
          if (pluginBridgePolicy.mode === "managed" && bridgeStatus.supported) {
            if (!bridgeStatus.basePlugin.installed) {
              runtimeDoctor.issues.push("Managed ClawJS OpenClaw plugin is not installed.");
              runtimeDoctor.suggestedRepairs.push(`Install ${bridgeStatus.basePlugin.packageSpec} or call runtime.plugins.ensure().`);
            } else if (!bridgeStatus.basePlugin.enabled) {
              runtimeDoctor.issues.push("Managed ClawJS OpenClaw plugin is installed but disabled.");
              runtimeDoctor.suggestedRepairs.push("Enable the `clawjs` OpenClaw plugin or call runtime.plugins.ensure().");
            }
            if (pluginBridgePolicy.enableContextEngine && bridgeStatus.contextPlugin.selectedEngineId !== "clawjs-context") {
              runtimeDoctor.issues.push("Managed ClawJS context engine is not selected in plugins.slots.contextEngine.");
              runtimeDoctor.suggestedRepairs.push("Select `clawjs-context` in plugins.slots.contextEngine or call runtime.plugins.ensure().");
            }
          }
        }
        const workspace = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        const compatSnapshot = readCompatSnapshot(workspaceDir, filesystem);
        const compatDrift = buildCompatDriftReport(compatSnapshot, status, compat);
        const providerSummaries = await readProviderAuth();
        const schedulers = await readSchedulers();
        const memory = await readMemory();
        const skills = await readSkills();
        const channels = await readChannels();
        persistWorkspaceState(workspace);
        persistProviderState(providerSummaries, []);
        persistSchedulerState(schedulers);
        persistMemoryState(memory);
        persistSkillsState(skills);
        persistChannelsState(channels);
        const managedBlockProblems = Array.from(new Set(
          listManagedFiles(workspaceDir, adapter.workspaceFiles)
            .flatMap((filePath) => listManagedBlockProblems(filesystem.tryReadText(filePath)).map((problem) => ({
              ...problem,
              message: `${path.basename(filePath)}: ${problem.message}`,
            }))),
        ));
        return buildCombinedDoctorReport({
          runtime: status,
          compat,
          runtimeDoctor,
          workspace,
          compatSnapshot,
          compatDrift,
          managedBlockProblems,
          missingProvidersInUse: [],
          providerSummaries,
        });
      },
    },
    models: {
      list: async () => {
        try {
          return await adapter.listModels(processHost, resolvedRuntimeOptions);
        } catch {
          return [];
        }
      },
      catalog: async () => readModelCatalog(),
      getDefault: async () => readDefaultModel(),
      setDefault: async (model) => {
        patchIntent("models", {
          defaultModel: model,
        });
        const result = await applyIntent({ domains: ["models"] });
        const modelId = await readDefaultModel();
        appendAuditEvent("models.default_set", "models", { modelId, runtimeAdapter: adapter.id });
        eventBus.emit("models.default_set", { modelId, runtimeAdapter: adapter.id });
        if (result.actions.some((action) => action.domain === "models" && action.status === "unsupported")) {
          throw new Error(`Model intents are unsupported for adapter ${adapter.id}`);
        }
        return modelId?.modelId ?? model;
      },
    },
    providers: {
      list: async () => (await readProviderCatalog()).providers,
      catalog: async () => readProviderCatalog(),
      authState: async () => {
        const state = await readAuthState();
        persistProviderState(state.providers, []);
        return state;
      },
    },
    auth: {
      status: async () => {
        const summaries = await readProviderAuth();
        persistProviderState(summaries, []);
        return summaries;
      },
      diagnostics: (provider) => adapter.diagnostics(provider, resolvedRuntimeOptions),
      prepareLogin: async (provider) => prepareAuthLogin(provider),
      login: async (provider, loginOptions = {}) => {
        const requestedProvider = provider.trim();
        emitAuthLoginProgress({
          phase: "auth.login",
          status: "start",
          provider: requestedProvider,
          timestamp: new Date().toISOString(),
          step: "checking_existing_auth",
          message: "Checking whether an existing provider auth can be reused.",
        }, loginOptions.onProgress);
        try {
          const plan = await prepareAuthLogin(requestedProvider);
          if (plan.status === "reused") {
            patchProviderIntent(plan.provider, {
              enabled: true,
              preferredAuthMode: "oauth",
              metadata: {
                lastLoginStartedAt: new Date().toISOString(),
                lastLoginReuseAt: new Date().toISOString(),
              },
            });
            const reused: AuthLoginResult = {
              requestedProvider: plan.requestedProvider,
              provider: plan.provider,
              status: "reused",
              launchMode: "none",
              message: plan.message,
            };
            emitAuthLoginProgress({
              phase: "auth.login",
              status: "complete",
              provider: reused.provider,
              timestamp: new Date().toISOString(),
              step: "reused_existing_auth",
              result: reused.status,
              launchMode: reused.launchMode,
              message: reused.message,
            }, loginOptions.onProgress);
            return reused;
          }

          const launched = await adapter.login(requestedProvider, processHost, {
            ...resolvedRuntimeOptions,
            setDefault: loginOptions.setDefault,
            cwd: workspaceDir,
            env: loginOptions.env ?? resolvedRuntimeOptions.env,
          });
          patchProviderIntent(launched.provider, {
            enabled: true,
            preferredAuthMode: "oauth",
            metadata: {
              lastLoginStartedAt: new Date().toISOString(),
            },
          });
          appendAuditEvent("auth.login_started", "auth", {
            provider: launched.provider,
            pid: launched.pid,
            launchMode: launched.launchMode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.login_started", {
            provider: launched.provider,
            pid: launched.pid,
            launchMode: launched.launchMode,
            runtimeAdapter: adapter.id,
          });
          emitAuthLoginProgress({
            phase: "auth.login",
            status: "complete",
            provider: launched.provider,
            timestamp: new Date().toISOString(),
            step: "launching_interactive_flow",
            result: launched.status,
            launchMode: launched.launchMode,
            ...(typeof launched.pid === "number" ? { pid: launched.pid } : {}),
            ...(launched.command ? { command: launched.command } : {}),
            ...(launched.args ? { args: launched.args } : {}),
            ...(launched.message ? { message: launched.message } : {}),
          }, loginOptions.onProgress);
          return launched;
        } catch (error) {
          emitAuthLoginProgress({
            phase: "auth.login",
            status: "error",
            provider: requestedProvider,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : "login failed",
          }, loginOptions.onProgress);
          throw error;
        }
      },
      setApiKey: (provider, key, profileId) => {
        emitAuthProgress("auth.api_key.save", "start", provider);
        try {
          const summary = adapter.setApiKey(provider, key, {
            ...resolvedRuntimeOptions,
            ...(profileId ? { profileId } : {}),
          });
          patchProviderIntent(provider, {
            enabled: true,
            preferredAuthMode: "api_key",
            profileId: summary.profileId,
          });
          refreshObservedDomain("providers").catch(() => undefined);
          appendAuditEvent("auth.api_key_saved", "auth", {
            provider,
            profileId: summary.profileId,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.api_key_saved", {
            provider,
            profileId: summary.profileId,
            runtimeAdapter: adapter.id,
          });
          emitAuthProgress("auth.api_key.save", "complete", provider, {
            profileId: summary.profileId,
            mode: "store",
          });
          return summary;
        } catch (error) {
          emitAuthProgress("auth.api_key.save", "error", provider, {
            message: error instanceof Error ? error.message : "save failed",
          });
          throw error;
        }
      },
      saveApiKey: async (provider, key, saveOptions = {}) => {
        emitAuthProgress("auth.api_key.save", "start", provider);
        try {
          const persisted = await adapter.saveApiKey(provider, key, processHost, {
            ...resolvedRuntimeOptions,
            ...(saveOptions.profileId ? { profileId: saveOptions.profileId } : {}),
            ...(saveOptions.runtimeCommand ? { runtimeCommand: saveOptions.runtimeCommand } : {}),
          });
          patchProviderIntent(provider, {
            enabled: true,
            preferredAuthMode: "api_key",
            profileId: persisted.summary.profileId,
          });
          await refreshObservedDomain("providers");
          appendAuditEvent("auth.api_key_saved", "auth", {
            provider,
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.api_key_saved", {
            provider,
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
            runtimeAdapter: adapter.id,
          });
          emitAuthProgress("auth.api_key.save", "complete", provider, {
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
          });
          return persisted;
        } catch (error) {
          emitAuthProgress("auth.api_key.save", "error", provider, {
            message: error instanceof Error ? error.message : "save failed",
          });
          throw error;
        }
      },
      setProviderEnabled: async (provider, enabled, intentOptions = {}) => {
        const patch: {
          enabled: boolean;
          preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
          secretRef?: string | null;
          profileId?: string | null;
          metadata?: Record<string, unknown>;
        } = { enabled };
        if ("preferredAuthMode" in intentOptions) {
          patch.preferredAuthMode = intentOptions.preferredAuthMode ?? null;
        }
        if ("secretRef" in intentOptions) {
          patch.secretRef = intentOptions.secretRef ?? null;
        }
        if ("profileId" in intentOptions) {
          patch.profileId = intentOptions.profileId ?? null;
        }
        if (intentOptions.metadata) {
          patch.metadata = intentOptions.metadata;
        }

        patchProviderIntent(provider, patch);
        if (!enabled && !requiresExplicitProviderEnable(provider)) {
          adapter.removeProvider(provider, resolvedRuntimeOptions);
        }
        await refreshObservedDomain("providers");
        appendAuditEvent("auth.provider_intent_updated", "auth", {
          provider,
          enabled,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("auth.provider_intent_updated", {
          provider,
          enabled,
          runtimeAdapter: adapter.id,
        });
      },
      removeProvider: (provider) => {
        emitAuthProgress("auth.remove", "start", provider);
        const removed = adapter.removeProvider(provider, resolvedRuntimeOptions);
        patchProviderIntent(provider, {
          enabled: false,
        });
        refreshObservedDomain("providers").catch(() => undefined);
        if (removed > 0) {
          appendAuditEvent("auth.provider_removed", "auth", {
            provider,
            removed,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.provider_removed", {
            provider,
            removed,
            runtimeAdapter: adapter.id,
          });
        }
        emitAuthProgress("auth.remove", "complete", provider, { removed });
        return removed;
      },
    },
    scheduler: {
      list: async () => {
        const schedulers = await readSchedulers();
        persistSchedulerState(schedulers);
        return schedulers;
      },
      run: async (id) => {
        await adapter.runScheduler(id, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.run", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.run", { id, runtimeAdapter: adapter.id });
      },
      enable: async (id) => {
        await adapter.setSchedulerEnabled(id, true, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.enabled", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.enabled", { id, runtimeAdapter: adapter.id });
      },
      disable: async (id) => {
        await adapter.setSchedulerEnabled(id, false, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.disabled", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.disabled", { id, runtimeAdapter: adapter.id });
      },
    },
    memory: {
      list: async () => {
        const memory = await readMemory();
        persistMemoryState(memory);
        return memory;
      },
      search: async (query) => {
        const memory = await adapter.searchMemory(query, processHost, resolvedRuntimeOptions);
        persistMemoryState(memory);
        return memory;
      },
    },
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
    channels: {
      list: async () => {
        const channels = await readChannels();
        persistChannelsState(channels);
        return channels;
      },
      accounts: {
        registerTelegramBot: async (input) => {
          const { accountId, label, ...telegramInput } = input;
          patchTelegramChannelIntent({
            enabled: true,
            secretRef: telegramInput.secretName,
            config: {
              accountId: accountId ?? "default",
              ...(telegramInput.apiBaseUrl ? { apiBaseUrl: telegramInput.apiBaseUrl } : {}),
              ...(telegramInput.webhookUrl ? { webhookUrl: telegramInput.webhookUrl } : {}),
              ...(telegramInput.webhookSecretToken ? { webhookSecretToken: telegramInput.webhookSecretToken } : {}),
              ...(telegramInput.allowedUpdates ? { allowedUpdates: telegramInput.allowedUpdates } : {}),
              ...(typeof telegramInput.dropPendingUpdates === "boolean" ? { dropPendingUpdates: telegramInput.dropPendingUpdates } : {}),
            },
          });
          const account = await connectTelegramAccount({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, {
            ...telegramInput,
            accountId,
            label,
          });
          await ensureTelegramCodexBridgeCommands(account.accountId);
          await refreshChannelSnapshots();
          appendAuditEvent("telegram.connected", "channels", {
            secretName: telegramInput.secretName,
            accountId: account.accountId,
            mode: (account.transport as TelegramTransportStatus | null)?.mode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("telegram.connected", {
            secretName: telegramInput.secretName,
            accountId: account.accountId,
            mode: (account.transport as TelegramTransportStatus | null)?.mode,
            runtimeAdapter: adapter.id,
          });
          return account;
        },
        list: (provider) => channelsRegistry.accounts.list(provider),
        get: (provider, accountId) => channelsRegistry.accounts.get(provider, accountId),
        status: async (provider) => {
          if (!provider || provider === "telegram") {
            const accounts = channelsRegistry.accounts.list("telegram");
            for (const account of accounts) {
              await refreshTelegramAccountStatus({
                registry: channelsRegistry,
                runner: processHost,
                env: secretsEnv,
              }, account.accountId);
            }
            await refreshChannelSnapshots();
          }
          return channelsRegistry.accounts.list(provider);
        },
        remove: async (provider, accountId) => {
          channelsRegistry.accounts.remove(provider, accountId);
          await refreshChannelSnapshots();
          return channelsRegistry.accounts.list(provider);
        },
      },
      targets: {
        register: (input) => channelsRegistry.targets.register(input),
        list: (input) => channelsRegistry.targets.list(input),
        get: (provider, accountId, targetId, threadId) => channelsRegistry.targets.get(provider, accountId, targetId, threadId),
      },
      bindings: {
        grant: (input) => channelsRegistry.bindings.grant(input),
        revoke: (id) => channelsRegistry.bindings.revoke(id),
        list: (input) => channelsRegistry.bindings.list(input),
        can: (agentId, permission, selector) => channelsRegistry.bindings.can(agentId, permission, selector),
      },
      processors: {
        register: (input) => channelsRegistry.processors.register(input),
        list: () => channelsRegistry.processors.list(),
        get: (id) => channelsRegistry.processors.get(id),
        remove: (id) => channelsRegistry.processors.remove(id),
      },
      listeners: {
        upsert: (input) => channelsRegistry.listeners.upsert(input),
        list: (input) => channelsRegistry.listeners.list(input),
        get: (provider, accountId) => channelsRegistry.listeners.get(provider, accountId),
        remove: (provider, accountId) => channelsRegistry.listeners.remove(provider, accountId),
      },
      events: {
        list: (input) => channelsRegistry.events.list(input),
      },
      listen: {
        run: (input) => runChannelListener(input),
      },
      messages: {
        send: async (input) => {
          const provider = input.provider ?? "telegram";
          const accountId = input.accountId ?? "default";
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          if (!channelsRegistry.bindings.can(input.agentId, "write", { provider, accountId, targetId: input.targetId })) {
            throw new Error(`agent ${input.agentId} does not have write permission for ${provider}:${input.targetId}`);
          }
          const message = await sendTelegramAccountMessage({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, {
            ...input,
            provider,
            accountId,
          });
          if (input.media) {
            registerOutboundChannelMedia({
              provider,
              accountId,
              targetId: input.targetId,
              threadId: input.threadId,
              media: input.media,
              mediaType: input.mediaType,
              text: input.text,
              agentId: input.agentId,
              response: message.raw as Record<string, unknown> | undefined,
              command: "channels messages send",
            });
          }
          return message;
        },
        read: (input) => channelsRegistry.messages.read(input),
        sync: async (input = {}) => {
          const provider = input.provider ?? "telegram";
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          const records = await syncTelegramAccount({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, input);
          const processedRecords = [];
          for (const record of records) {
            registerInboundTelegramMedia(record);
            processedRecords.push(await ingestTelegramVoiceNote(record));
          }
          await refreshChannelSnapshots();
          return processedRecords;
        },
      },
      commands: {
        set: async (provider, commands, input) => {
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          const saved = await setTelegramAccountCommands({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, input?.accountId, commands);
          await refreshChannelSnapshots();
          return saved;
        },
        get: async (provider, input) => {
          if (provider !== "telegram") {
            throw new Error(`unsupported channel provider: ${provider}`);
          }
          return getTelegramAccountCommands({
            registry: channelsRegistry,
            runner: processHost,
            env: secretsEnv,
          }, input?.accountId);
        },
      },
    },
    telegram: {
      provisionSecretReference: async (input) => ensureTelegramBotSecretReference(processHost, {
        name: input.secretName,
        apiBaseUrl: input.apiBaseUrl,
        notes: input.notes,
        readOnly: input.readOnly,
      }, { env: secretsEnv }),
      connectBot: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          secretRef: input.secretName,
          config: {
            ...(input.apiBaseUrl ? { apiBaseUrl: input.apiBaseUrl } : {}),
            ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
            ...(input.webhookSecretToken ? { webhookSecretToken: input.webhookSecretToken } : {}),
            ...(input.allowedUpdates ? { allowedUpdates: input.allowedUpdates } : {}),
            ...(typeof input.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.connectBot(input);
        recordTelegramStatusInChannels(status, { secretName: input.secretName });
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.connected", "channels", {
          secretName: input.secretName,
          mode: status.transport.mode,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("telegram.connected", {
          secretName: input.secretName,
          mode: status.transport.mode,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await telegram.status();
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        return status;
      },
      configureWebhook: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            webhookUrl: input.url,
            ...(input.secretToken ? { webhookSecretToken: input.secretToken } : {}),
            ...(input.allowedUpdates ? { allowedUpdates: input.allowedUpdates } : {}),
            ...(typeof input.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.configureWebhook(input);
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.webhook_configured", "channels", {
          url: input.url,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("telegram.webhook_configured", {
          url: input.url,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      disableWebhook: async (input) => {
        patchTelegramChannelIntent({
          config: {
            webhookUrl: null,
            ...(typeof input?.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.disableWebhook(input);
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.webhook_disabled", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.webhook_disabled", { runtimeAdapter: adapter.id });
        return status;
      },
      startPolling: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            polling: true,
            ...(typeof input?.limit === "number" ? { limit: input.limit } : {}),
            ...(typeof input?.timeoutSeconds === "number" ? { timeoutSeconds: input.timeoutSeconds } : {}),
            ...(typeof input?.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.startPolling(input);
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.polling_started", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.polling_started", { runtimeAdapter: adapter.id });
        return status;
      },
      stopPolling: async () => {
        patchTelegramChannelIntent({
          config: {
            polling: false,
          },
        });
        const status = await telegram.stopPolling();
        recordTelegramStatusInChannels(status);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.polling_stopped", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.polling_stopped", { runtimeAdapter: adapter.id });
        return status;
      },
      setCommands: async (commands) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            commands,
          },
        });
        const saved = await telegram.setCommands(commands);
        appendAuditEvent("telegram.commands_set", "channels", { count: saved.length, runtimeAdapter: adapter.id });
        eventBus.emit("telegram.commands_set", { count: saved.length, runtimeAdapter: adapter.id });
        return saved;
      },
      getCommands: () => telegram.getCommands(),
      sendMessage: async (input) => {
        const response = await telegram.sendMessage(input);
        channelsRegistry.messages.recordTelegramOutbound({
          provider: "telegram",
          accountId: "default",
          targetId: String(input.chatId),
          text: input.text,
          threadId: input.messageThreadId,
        }, response);
        return response;
      },
      sendMedia: async (input) => {
        const response = await telegram.sendMedia(input);
        channelsRegistry.messages.recordTelegramOutbound({
          provider: "telegram",
          accountId: "default",
          targetId: String(input.chatId),
          text: input.caption,
          media: input.media,
          threadId: input.messageThreadId,
        }, response);
        registerOutboundChannelMedia({
          provider: "telegram",
          accountId: "default",
          targetId: String(input.chatId),
          threadId: input.messageThreadId,
          media: input.media,
          mediaType: input.type,
          text: input.caption,
          response,
          command: "telegram send",
        });
        return response;
      },
      listChats: (query) => telegram.listChats(query),
      getChat: (chatId) => telegram.getChat(chatId),
      getChatAdministrators: (chatId) => telegram.getChatAdministrators(chatId),
      getChatMember: (chatId, userId) => telegram.getChatMember(chatId, userId),
      setChatPermissions: (chatId, permissions) => telegram.setChatPermissions(chatId, permissions),
      banOrRestrictMember: (input) => telegram.banOrRestrictMember(input),
      createInviteLink: (chatId, options) => telegram.createInviteLink(chatId, options),
      revokeInviteLink: (chatId, inviteLink) => telegram.revokeInviteLink(chatId, inviteLink),
      syncUpdates: async (input) => {
        const updates = await telegram.syncUpdates(input);
        for (const envelope of updates) {
          const record = channelsRegistry.messages.recordTelegramUpdate(envelope);
          if (record) registerInboundTelegramMedia(record);
        }
        await refreshChannelSnapshots();
        if (updates.length > 0) {
          appendAuditEvent("telegram.updates_synced", "channels", { count: updates.length, runtimeAdapter: adapter.id });
          eventBus.emit("telegram.updates_synced", { count: updates.length, runtimeAdapter: adapter.id });
        }
        return updates;
      },
      ingestUpdate: async (update) => {
        const envelope = await telegram.ingestUpdate(update);
        if (envelope) {
          channelsRegistry.messages.recordTelegramUpdate(envelope);
        }
        await refreshChannelSnapshots();
        if (envelope) {
          appendAuditEvent("telegram.update_ingested", "channels", { updateId: envelope.updateId, type: envelope.type, runtimeAdapter: adapter.id });
          eventBus.emit("telegram.update_ingested", { updateId: envelope.updateId, type: envelope.type, runtimeAdapter: adapter.id });
        }
        return envelope;
      },
    },
    slack: {
      connectBot: async (input) => {
        const status = await slack.connectBot(input);
        await refreshChannelSnapshots();
        appendAuditEvent("slack.connected", "channels", {
          secretName: input.secretName,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("slack.connected", {
          secretName: input.secretName,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await slack.status();
        await refreshChannelSnapshots();
        return status;
      },
      sendMessage: (input) => slack.sendMessage(input),
      listChannels: (query) => slack.listChannels(query),
      getChannel: (channelId) => slack.getChannel(channelId),
    },
    whatsapp: {
      connect: async (input) => {
        const status = await whatsapp.connect(input);
        await refreshChannelSnapshots();
        appendAuditEvent("whatsapp.connected", "channels", {
          mode: input.mode,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("whatsapp.connected", {
          mode: input.mode,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await whatsapp.status();
        await refreshChannelSnapshots();
        return status;
      },
      sendMessage: (input) => whatsapp.sendMessage(input),
      disconnect: async () => {
        const status = await whatsapp.disconnect();
        await refreshChannelSnapshots();
        appendAuditEvent("whatsapp.disconnected", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("whatsapp.disconnected", { runtimeAdapter: adapter.id });
        return status;
      },
    },
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
      calendarView: async (input) => requireTimeClient().calendarView(input),
      timelineView: async (input) => requireTimeClient().timelineView(input),
      signalAnchor: async (input) => requireTimeClient().signalAnchor(input),
    },
    calendar: calendarFacade,
    routines: routinesFacade,
    reminders: temporalRemindersFacade,
    content: {
      configured: Boolean(contentClient),
      brands: {
        list: async () => requireContentClient().listBrands(),
        create: async (input) => requireContentClient().createBrand(input),
        update: async (id, input) => requireContentClient().updateBrand(id, input),
      },
      destinations: {
        list: async (filters) => requireContentClient().listDestinations(filters),
        create: async (input) => requireContentClient().createDestination(input),
        update: async (id, input) => requireContentClient().updateDestination(id, input),
        testConnection: async (id) => requireContentClient().testConnection(id),
        view: async () => requireContentClient().destinationsReadModel(),
      },
      campaigns: {
        list: async (filters) => requireContentClient().listCampaigns(filters),
        create: async (input) => requireContentClient().createCampaign(input),
        update: async (id, input) => requireContentClient().updateCampaign(id, input),
      },
      entries: {
        list: async (filters) => requireContentClient().listEntries(filters),
        get: async (id) => requireContentClient().getEntry(id),
        create: async (input) => requireContentClient().createEntry(input),
        update: async (id, input) => requireContentClient().updateEntry(id, input),
        archive: async (id) => requireContentClient().archiveEntry(id),
        attachAsset: async (id, input) => requireContentClient().attachAsset(id, input),
        generateVariants: async (id, input) => requireContentClient().generateVariants(id, input),
      },
      variants: {
        list: async (filters) => requireContentClient().listVariants(filters),
        create: async (input) => requireContentClient().createVariant(input),
        update: async (id, input) => requireContentClient().updateVariant(id, input),
      },
      approvals: {
        list: async (filters) => requireContentClient().listApprovals(filters),
        approve: async (id, input) => requireContentClient().approve(id, input),
        reject: async (id, input) => requireContentClient().reject(id, input),
        cancel: async (id) => requireContentClient().cancelApproval(id),
        view: async () => requireContentClient().approvalsReadModel(),
      },
      calendar: {
        view: async () => requireContentClient().calendar(),
      },
      publish: {
        listPlans: async (filters) => requireContentClient().listPlans(filters),
        createPlan: async (input) => requireContentClient().createPlan(input),
        cancelPlan: async (id) => requireContentClient().cancelPlan(id),
        runNow: async (id) => requireContentClient().runPlan(id),
        schedulerRun: async () => requireContentClient().schedulerRun(),
        listRuns: async () => requireContentClient().listPublications(),
        getRun: async (id) => requireContentClient().getPublication(id),
        retryRun: async (id) => requireContentClient().retryPublication(id),
        view: async () => requireContentClient().publicationsReadModel(),
      },
      app: {
        frontendContract: async () => requireContentClient().frontendContract(),
        screens: async () => requireContentClient().screens(),
        dashboard: async () => requireContentClient().dashboard(),
        pipeline: async () => requireContentClient().pipeline(),
        composer: async (entryId) => requireContentClient().composer(entryId),
        form: async (formId) => requireContentClient().form(formId),
      },
      tokens: {
        list: async () => requireContentClient().listTokens(),
        issue: async (input) => requireContentClient().issueToken(input),
      },
    },
    iot: {
      inventory: {
        homes: {
          list: async () => requireIotClient().listHomes(),
          get: async (homeId) => requireIotClient().getHome(homeId ?? options.iot?.homeId),
        },
        areas: {
          list: async (homeId) => requireIotClient().listAreas(homeId ?? options.iot?.homeId),
        },
        things: {
          list: async (input = {}) => requireIotClient().listThings({
            ...input,
            homeId: input.homeId ?? options.iot?.homeId,
          }),
          get: async (thingId, homeId) => requireIotClient().getThing(thingId, homeId ?? options.iot?.homeId),
          search: async (query, input = {}) => requireIotClient().searchThings(query, {
            ...input,
            homeId: input.homeId ?? options.iot?.homeId,
          }),
        },
      },
      state: {
        get: async (homeId) => requireIotClient().getState(homeId ?? options.iot?.homeId),
        history: async (homeId, queryOptions) => requireIotClient().history(homeId ?? options.iot?.homeId, queryOptions),
        watch: async function* (homeId) {
          for await (const event of requireIotClient().watch(homeId ?? options.iot?.homeId)) {
            yield event;
          }
        },
      },
      actions: {
        run: async (input, homeId) => requireIotClient().runAction(input, homeId ?? options.iot?.homeId),
        lights: {
          off: async (area, homeId) => requireIotClient().runAction({ family: "light", action: "off", ...(area ? { area } : {}) }, homeId ?? options.iot?.homeId),
          on: async (area, homeId) => requireIotClient().runAction({ family: "light", action: "on", ...(area ? { area } : {}) }, homeId ?? options.iot?.homeId),
        },
        climate: {
          set: async (selector, temperature, homeId) => requireIotClient().runAction({
            family: "climate",
            selector,
            action: "set",
            value: temperature,
          }, homeId ?? options.iot?.homeId),
        },
      },
      scenes: {
        list: async (homeId) => requireIotClient().listScenes(homeId ?? options.iot?.homeId),
        activate: async (sceneId, homeId) => requireIotClient().activateScene(sceneId, homeId ?? options.iot?.homeId),
      },
      automations: {
        list: async (homeId) => requireIotClient().listAutomations(homeId ?? options.iot?.homeId),
        create: async (input, homeId) => requireIotClient().createAutomation(input, homeId ?? options.iot?.homeId),
        enable: async (automationId, homeId) => requireIotClient().enableAutomation(automationId, homeId ?? options.iot?.homeId),
        disable: async (automationId, homeId) => requireIotClient().disableAutomation(automationId, homeId ?? options.iot?.homeId),
        run: async (automationId, homeId) => requireIotClient().runAutomation(automationId, homeId ?? options.iot?.homeId),
      },
      policies: {
        evaluate: async (input, homeId) => requireIotClient().evaluatePolicy(input, homeId ?? options.iot?.homeId),
        list: async () => [],
        listApprovals: async (homeId) => requireIotClient().listApprovals(homeId ?? options.iot?.homeId),
        approve: async (approvalId, homeId) => requireIotClient().approve(approvalId, homeId ?? options.iot?.homeId),
        deny: async (approvalId, homeId) => requireIotClient().deny(approvalId, homeId ?? options.iot?.homeId),
      },
      raw: {
        invoke: async (input) => requireIotClient().rawInvoke(input),
      },
    },
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
        const authSummaries = await readProviderAuth();
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
