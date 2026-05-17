export type ContentOperation =
  | "brands:list"
  | "brands:create"
  | "brands:update"
  | "destinations:list"
  | "destinations:create"
  | "destinations:update"
  | "campaigns:list"
  | "campaigns:create"
  | "campaigns:update"
  | "entries:list"
  | "entries:read"
  | "entries:create"
  | "entries:update"
  | "entries:archive"
  | "entries:assets:write"
  | "variants:list"
  | "variants:create"
  | "variants:update"
  | "variants:generate"
  | "approvals:list"
  | "approvals:review"
  | "plans:list"
  | "plans:create"
  | "plans:cancel"
  | "plans:run"
  | "publications:list"
  | "publications:retry"
  | "app:read"
  | "tokens:issue"
  | "tokens:revoke";

export type ContentDestinationKind =
  | "website_page"
  | "blog_post"
  | "webhook"
  | "linkedin_post"
  | "bluesky_post"
  | "mastodon_post";

export type ContentPublishPolicy = "manual" | "autopublish" | "conditional";
type ContentEntryStatus = "draft" | "in_review" | "approved" | "scheduled" | "publishing" | "published" | "partially_published" | "failed" | "archived";
type ContentVariantStatus = "draft" | "ready" | "blocked" | "approved" | "scheduled" | "published" | "failed";
type ContentApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";
export type ContentPlanStatus = "queued" | "scheduled" | "running" | "succeeded" | "failed" | "cancelled";
type ContentRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type ContentType = "article" | "post" | "thread" | "announcement" | "campaign";
export type ContentFormat = "markdown" | "rich_text" | "plain_text" | "json_blocks";
export type ContentAssetKind = "image" | "video" | "document" | "audio";

export interface ContentCapabilityMap {
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

export interface ContentBrand {
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

export interface ContentDestination {
  id: string;
  brandId: string;
  name: string;
  kind: ContentDestinationKind;
  publishPolicy: ContentPublishPolicy;
  status: "active" | "paused" | "error";
  capabilityMap: ContentCapabilityMap;
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
}

export interface ContentCampaign {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentEntry {
  id: string;
  brandId: string;
  campaignId: string | null;
  contentType: ContentType;
  canonicalFormat: ContentFormat;
  title: string;
  summary: string;
  canonicalBody: string;
  status: ContentEntryStatus;
  tags: string[];
  ownerId: string | null;
  authorId: string | null;
  currentRevisionNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentRevision {
  id: string;
  entryId: string;
  revisionNumber: number;
  title: string;
  summary: string;
  canonicalBody: string;
  snapshot: Record<string, unknown>;
  createdAt: string;
  authorId: string | null;
}

export interface ContentAssetRef {
  id: string;
  entryId: string;
  variantId: string | null;
  driveItemId: string;
  assetKind: ContentAssetKind;
  name: string;
  altText: string | null;
  orderIndex: number;
  createdAt: string;
}

export interface ContentVariant {
  id: string;
  entryId: string;
  destinationId: string;
  format: ContentFormat;
  title: string;
  body: string;
  status: ContentVariantStatus;
  validationErrors: string[];
  mediaPlan: Record<string, unknown>;
  publishConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentApprovalRequest {
  id: string;
  entryId: string;
  variantId: string;
  destinationId: string;
  status: ContentApprovalStatus;
  requestedBy: string | null;
  reviewedBy: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  comment: string | null;
}

export interface ContentPublishPlan {
  id: string;
  entryId: string;
  variantId: string;
  destinationId: string;
  status: ContentPlanStatus;
  scheduledAt: string | null;
  temporalItemId: string | null;
  destinationSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPublicationRun {
  id: string;
  planId: string;
  entryId: string;
  variantId: string;
  destinationId: string;
  status: ContentRunStatus;
  attemptNumber: number;
  externalId: string | null;
  providerMessage: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ContentScopedTokenRecord {
  id: string;
  label: string;
  operations: ContentOperation[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ContentChangeEvent {
  type:
    | "brand.created"
    | "brand.updated"
    | "destination.created"
    | "destination.updated"
    | "campaign.created"
    | "campaign.updated"
    | "entry.created"
    | "entry.updated"
    | "entry.archived"
    | "asset.attached"
    | "variant.created"
    | "variant.updated"
    | "variant.generated"
    | "approval.created"
    | "approval.reviewed"
    | "plan.created"
    | "plan.cancelled"
    | "plan.executed"
    | "publication.completed"
    | "publication.failed";
  payload: Record<string, unknown>;
  at: string;
}
