// Exported TS types for SDK consumers and internal use.

export type EditorialStatus =
  | "idea"
  | "drafting"
  | "in_review"
  | "ready"
  | "archived"
  | "published";

export type PublishStatus =
  | "unscheduled"
  | "scheduled"
  | "queued"
  | "publishing"
  | "partially_published"
  | "published"
  | "failed"
  | "cancelled"
  | "deleted";

export type ChannelGroup =
  | "social"
  | "chat"
  | "long_form"
  | "forum"
  | "forum_federated"
  | "feed"
  | "email"
  | "video"
  | "audio"
  | "event"
  | "dev"
  | "doc"
  | "generic";

export type ChannelAuthKind =
  | "oauth2"
  | "oauth1a"
  | "api_key"
  | "app_password"
  | "bearer_static"
  | "basic"
  | "webhook_signed"
  | "none";

export type ContentKind =
  | "text"
  | "photo"
  | "video"
  | "gif"
  | "carousel"
  | "story"
  | "reel"
  | "short"
  | "thread"
  | "poll"
  | "link_card"
  | "document"
  | "audio";

export interface PostBlock {
  body: string;
  url?: string;
  media_ids?: string[];
  video_thumb_overrides?: { media_id: string; thumb_media_id: string }[];
  poll?: { question: string; options: string[]; duration_seconds: number };
  mentions?: { handle: string; provider_id?: string; range: [number, number] }[];
  hashtags?: string[];
  link_card?: { title?: string; description?: string; image_media_id?: string; fetched_at?: string };
}

export interface PostVariantSpec {
  is_original?: boolean;
  channel_account_id?: string | null;
  locale?: string | null;
  blocks: PostBlock[];
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PostSpec {
  idempotency_key?: string | null;
  campaign_id?: string | null;
  template_id?: string | null;
  labels?: string[];
  accounts: string[];
  editorial_status?: EditorialStatus;
  schedule?:
    | { kind: "datetime"; at: string; timezone?: string }
    | { kind: "now" }
    | { kind: "queue"; queue_id: string }
    | { kind: "unscheduled" };
  approval?: { workflow_id?: string | null };
  variants: PostVariantSpec[];
}

interface OptionDescriptor {
  kind: "string" | "number" | "boolean" | "enum" | "object" | "array";
  required?: boolean;
  enum?: string[];
  default?: unknown;
  description?: string;
}

interface MediaCaps {
  min: number;
  max: number;
  mimeTypes: string[];
  maxBytes: number;
  maxDurationMs?: number;
  minDurationMs?: number;
  aspectRatios?: string[];
}

export interface CapabilityDescriptor {
  contentKinds: ContentKind[];
  text: {
    minChars?: number;
    maxChars: number;
    supportsMarkdown: boolean;
    supportsMentions: boolean;
    supportsHashtags: boolean;
  };
  media: {
    photo?: MediaCaps;
    video?: MediaCaps;
    gif?: MediaCaps;
    document?: { mimeTypes: string[]; maxBytes: number };
    audio?: { mimeTypes: string[]; maxBytes: number; maxDurationMs: number };
    mixedAllowed: boolean;
  };
  thread: { supported: boolean; maxBlocks?: number };
  scheduling: {
    nativeSchedulingSupported: boolean;
    queueSupported: boolean;
    minLeadSeconds?: number;
    maxLeadDays?: number;
  };
  options: Record<string, OptionDescriptor>;
  rateLimit: { dailyPosts?: number; hourlyPosts?: number; hint: "global" | "per_account" | "unknown" };
  multiVariant: "never" | "per_account" | "per_locale" | "both";
  audienceTargeting: boolean;
  firstComment: boolean;
  geo: { tagSupported: boolean; named: boolean; coords: boolean };
  deletion: { byProviderPostId: boolean };
  attribution: { utmAllowed: boolean; linkInPostBody: boolean; linkInBio: boolean };
}

export interface ChannelFamilyDescriptor {
  id: string;
  name: string;
  group: ChannelGroup;
  authKind: ChannelAuthKind;
  capabilities: CapabilityDescriptor;
  capabilitySchemaVersion?: number;
}

interface ValidationIssue {
  code: string;
  message: string;
  blocking: boolean;
  blockIndex?: number;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface RequestedConversion {
  mediaId: string;
  conversion: string;
}

export interface PublishResult {
  ok: boolean;
  providerPostId?: string;
  providerData?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  retryAfterSeconds?: number;
  unauthorized?: boolean;
}

export interface HealthProbeResult {
  status: "ok" | "degraded" | "unauthorized" | "rate_limited" | "provider_outage";
  details?: Record<string, unknown>;
}

export interface MetricsSnapshot {
  metrics: Record<string, number>;
}

export interface ImportedPostShape {
  providerPostId: string;
  body: string;
  mediaRefs?: Record<string, unknown>[];
  publishedAt: string;
  metricsSnapshot?: Record<string, number>;
}

export interface InboxBatch {
  threads: Array<{
    providerThreadId: string;
    kind: "dm" | "mention" | "comment" | "review";
    messages: Array<{
      providerMessageId: string;
      direction: "inbound" | "outbound";
      sender: Record<string, unknown>;
      body: string;
      createdAt: string;
    }>;
  }>;
}

export interface CanonicalEvent {
  id: string;
  name: string;
  workspace_id: string;
  occurred_at: string;
  actor: { kind: "user" | "token" | "system"; id?: string };
  data: Record<string, unknown>;
  previous_data?: Record<string, unknown>;
}
