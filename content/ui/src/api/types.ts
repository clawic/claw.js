/* ── Status enums ── */
export type EntryStatus =
  | "draft" | "in_review" | "approved" | "scheduled"
  | "publishing" | "published" | "partially_published"
  | "failed" | "archived";

export type VariantStatus =
  | "draft" | "ready" | "blocked" | "approved"
  | "scheduled" | "published" | "failed";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type DestinationKind = "website_page" | "blog_post" | "webhook" | "linkedin_post" | "bluesky_post" | "mastodon_post";
export type PublishPolicy = "manual" | "autopublish" | "conditional";
export type DestinationStatus = "active" | "paused" | "error";
export type CampaignStatus = "draft" | "active" | "completed" | "archived";
export type ContentFormat = "markdown" | "rich_text" | "plain_text" | "json_blocks";
export type ContentType = "article" | "post" | "thread" | "announcement" | "campaign";

export type BadgeVariant = "neutral" | "warning" | "info" | "accent" | "success" | "danger" | "muted";

export const STATUS_BADGE_MAP: Record<EntryStatus, BadgeVariant> = {
  draft: "neutral",
  in_review: "warning",
  approved: "info",
  scheduled: "accent",
  publishing: "accent",
  published: "success",
  partially_published: "warning",
  failed: "danger",
  archived: "muted",
};

/* ── Capability Map ── */
export interface CapabilityMap {
  supportsImmediatePublish: boolean;
  supportsScheduling: boolean;
  supportsText: boolean;
  supportsImages: boolean;
  supportsVideo: boolean;
  supportsThread: boolean;
  supportsLinkCard: boolean;
  supportsRichBlocks: boolean;
  maxTextLength: number;
  maxAssetCount: number;
  requiresApprovalByDefault: boolean;
}

/* ── Domain Models ── */
export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string;
  defaultLocale: string;
  voiceSummary: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  description: string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Entry {
  id: string;
  brandId: string;
  campaignId: string | null;
  contentType: ContentType;
  canonicalFormat: ContentFormat;
  title: string;
  summary: string;
  canonicalBody: string;
  status: EntryStatus;
  tags: string[];
  ownerId: string | null;
  authorId: string | null;
  currentRevisionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
  id: string;
  entryId: string;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
}

export interface Variant {
  id: string;
  entryId: string;
  destinationId: string;
  format: ContentFormat;
  title: string;
  body: string;
  status: VariantStatus;
  validationErrors: string[];
  mediaPlan: Record<string, unknown>;
  publishConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /* enriched by composer */
  destinationKind?: DestinationKind;
  destinationName?: string;
}

export interface AssetRef {
  id: string;
  entryId?: string;
  driveItemId: string;
  assetKind: "image" | "video" | "document" | "audio";
  name: string;
  altText: string | null;
  sortOrder?: number;
  createdAt?: string;
}

export interface Destination {
  id: string;
  brandId: string;
  name: string;
  kind: DestinationKind;
  publishPolicy: PublishPolicy;
  status: DestinationStatus;
  capabilityMap: CapabilityMap;
  secretRef: string | null;
  externalAccountLabel: string | null;
  config: Record<string, unknown>;
  conditionalRules: {
    requireApprovalWithAssets: boolean;
    requireApprovalWhenScheduled: boolean;
  };
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  /* enriched by /v1/app/destinations */
  variantCount?: number;
  pendingApprovalCount?: number;
}

export interface ApprovalRequest {
  id: string;
  entryId: string;
  variantId: string;
  destinationId: string;
  status: ApprovalStatus;
  requestedBy: string | null;
  reviewedBy: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  comment: string | null;
  /* enriched */
  entry?: Entry;
  destination?: Destination;
  latestRevision?: Revision | null;
  previousRevision?: Revision | null;
}

export interface PublishPlan {
  id: string;
  entryId: string;
  variantId: string;
  destinationId: string;
  status: string;
  scheduledAt: string | null;
  destinationSnapshot: Record<string, unknown>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicationRun {
  id: string;
  planId: string;
  entryId: string;
  variantId: string;
  destinationId: string;
  status: RunStatus;
  attemptNumber: number;
  externalId: string | null;
  providerMessage: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  /* enriched */
  destination?: Destination;
  entry?: Entry;
  canRetry?: boolean;
}

/* ── Read Model Payloads ── */
export interface DashboardPayload {
  metrics: {
    drafts: number;
    scheduled: number;
    published: number;
    failed: number;
    pendingApprovals: number;
    healthyDestinations: number;
    assetsAttached: number;
    activeCampaigns: number;
  };
  upcoming: Array<{
    planId: string;
    title: string;
    scheduledAt: string;
    destination: string;
  }>;
  activity: Array<{
    id: string;
    type: string;
    label: string;
    at: string;
  }>;
}

export interface CalendarItem {
  planId: string;
  entryId: string;
  title: string;
  scheduledAt: string;
  destination: { id: string; name: string; kind: DestinationKind };
  approvalStatus: ApprovalStatus | "none";
  planStatus: string;
  canReschedule: boolean;
}

export interface PipelineColumn {
  id: string;
  items: Array<{
    id: string;
    title: string;
    status: EntryStatus;
    destinationSummary: number;
    assetCount: number;
    latestRunStatus: RunStatus | null;
    updatedAt: string;
  }>;
}

export interface ComposerPayload {
  entry: Entry;
  revisions: Revision[];
  variants: Variant[];
  assets: AssetRef[];
  approvals: ApprovalRequest[];
  plans: PublishPlan[];
}

/* ── Form Schema ── */
export interface FormField {
  key: string;
  label: string;
  component: string;
  required: boolean;
  group: string;
  order: number;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | number | boolean | null;
}

export interface FormSchema {
  id: string;
  title: string;
  submitLabel: string;
  fields: FormField[];
  validations: Record<string, string>;
  visibilityRules: Array<Record<string, unknown>>;
  sideEffects: string[];
}

/* ── API Error ── */
export interface ApiError {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details: unknown;
  };
}

/* ── WebSocket Events ── */
export type WsEventType =
  | "ready"
  | "brand.created" | "brand.updated"
  | "destination.created" | "destination.updated"
  | "campaign.created" | "campaign.updated"
  | "entry.created" | "entry.updated" | "entry.archived"
  | "asset.attached"
  | "variant.created" | "variant.updated" | "variant.generated"
  | "approval.created" | "approval.reviewed"
  | "plan.created" | "plan.cancelled" | "plan.executed"
  | "publication.completed" | "publication.failed";

export interface WsEvent {
  type: WsEventType;
  payload: Record<string, unknown>;
  at: string;
}
