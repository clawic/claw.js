import type {
  CapabilityDescriptor,
  ChannelFamilyDescriptor,
  HealthProbeResult,
  ImportedPostShape,
  InboxBatch,
  MetricsSnapshot,
  PostBlock,
  PublishResult,
  RequestedConversion,
  ValidationResult,
} from "../../shared/types.ts";

export interface ChannelAccountState {
  id: string;
  workspaceId: string;
  familyId: string;
  providerAccountId: string;
  displayName: string;
  handle: string | null;
  metadata: Record<string, unknown>;
  credentialsVaultRef: string | null;
  scopes: string[];
  authorized: boolean;
}

export interface AdapterVariant {
  blocks: PostBlock[];
  options: Record<string, unknown>;
  locale: string | null;
  isOriginal: boolean;
}

export interface OAuthStartResult {
  authorizationUrl: string;
  state: string;
  codeVerifier?: string;
}

export interface ChannelAccountInit {
  providerAccountId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  metadata?: Record<string, unknown>;
  credentialsVaultRef: string;
  scopes?: string[];
  tokenExpiresAt?: number | null;
}

export interface TokenRefreshResult {
  credentialsVaultRef: string;
  tokenExpiresAt?: number | null;
}

export interface EntityCandidate {
  entityId: string;
  displayName: string;
  handle?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AdapterContext {
  workspaceId: string;
  logger: { info: (msg: string, data?: unknown) => void; warn: (msg: string, data?: unknown) => void; error: (msg: string, data?: unknown) => void };
  fetch: typeof fetch;
  now(): number;
  vault: {
    get(ref: string): Promise<string | null>;
    put(ref: string | undefined, value: string): Promise<string>;
    delete(ref: string): Promise<void>;
  };
  rateLimiter: {
    /** Block dispatch for this family/account for N seconds. */
    backoff(scope: { family: string; accountId?: string }, seconds: number): void;
    /** Returns ms until allowed, or 0 if free. */
    until(scope: { family: string; accountId?: string }): number;
  };
  idempotency: {
    /** Return the last successful provider_post_id for this key, or null. */
    lookup(key: string): Promise<string | null>;
    record(key: string, providerPostId: string): Promise<void>;
  };
}

export interface ChannelAdapter {
  startOAuth?(ctx: AdapterContext, params: Record<string, unknown>): Promise<OAuthStartResult>;
  completeOAuth?(ctx: AdapterContext, params: Record<string, unknown>): Promise<ChannelAccountInit>;
  connectStatic?(ctx: AdapterContext, params: Record<string, unknown>): Promise<ChannelAccountInit>;
  refreshToken?(ctx: AdapterContext, account: ChannelAccountState): Promise<TokenRefreshResult>;
  revoke?(ctx: AdapterContext, account: ChannelAccountState): Promise<void>;
  probeHealth(ctx: AdapterContext, account: ChannelAccountState): Promise<HealthProbeResult>;

  listEntities?(ctx: AdapterContext, account: ChannelAccountState): Promise<EntityCandidate[]>;
  pickEntity?(ctx: AdapterContext, account: ChannelAccountState, entityId: string): Promise<ChannelAccountInit>;

  inspectCapabilities(ctx: AdapterContext, account: ChannelAccountState): Promise<CapabilityDescriptor>;

  validate(ctx: AdapterContext, account: ChannelAccountState, variant: AdapterVariant): Promise<ValidationResult>;
  requiredConversions(ctx: AdapterContext, account: ChannelAccountState, variant: AdapterVariant): Promise<RequestedConversion[]>;

  publish(ctx: AdapterContext, account: ChannelAccountState, variant: AdapterVariant): Promise<PublishResult>;

  delete?(ctx: AdapterContext, account: ChannelAccountState, providerPostId: string): Promise<void>;
  fetchPost?(ctx: AdapterContext, account: ChannelAccountState, providerPostId: string): Promise<ImportedPostShape | null>;
  fetchInsightsDaily?(ctx: AdapterContext, account: ChannelAccountState, date: string): Promise<MetricsSnapshot | null>;
  fetchAudienceDaily?(ctx: AdapterContext, account: ChannelAccountState, date: string): Promise<{ total: number } | null>;
  fetchInboxSince?(ctx: AdapterContext, account: ChannelAccountState, since: number): Promise<InboxBatch | null>;
}

export interface AdapterModule {
  family: ChannelFamilyDescriptor;
  adapter: ChannelAdapter;
}

export function notImplemented(): PublishResult {
  return { ok: false, errorCode: "not_implemented", errorMessage: "adapter publish not implemented in this version" };
}
