import type {
  CapabilityName,
  ChannelDescriptor,
  DefaultModelRef,
  ModelCatalog,
  RuntimeAdapterId,
  RuntimeInfo,
  RuntimeLocations,
} from "./types.ts";

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
