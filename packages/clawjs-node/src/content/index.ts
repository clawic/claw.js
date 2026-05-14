import { clawApiPath } from "@clawjs/core";
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

export type ContentDestinationKind = "website_page" | "blog_post" | "webhook" | "linkedin_post" | "bluesky_post" | "mastodon_post";
export type ContentPublishPolicy = "manual" | "autopublish" | "conditional";
export type ContentEntryStatus = "draft" | "in_review" | "approved" | "scheduled" | "publishing" | "published" | "partially_published" | "failed" | "archived";
export type ContentVariantStatus = "draft" | "ready" | "blocked" | "approved" | "scheduled" | "published" | "failed";
export type ContentPlanStatus = "queued" | "scheduled" | "running" | "succeeded" | "failed" | "cancelled";
export type ContentType = "article" | "post" | "thread" | "announcement" | "campaign";
export type ContentFormat = "markdown" | "rich_text" | "plain_text" | "json_blocks";

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

export interface ContentAssetRef {
  id: string;
  entryId: string;
  variantId: string | null;
  driveItemId: string;
  assetKind: "image" | "video" | "document" | "audio";
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
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
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
  status: "running" | "succeeded" | "failed" | "cancelled";
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

export interface ContentClientOptions {
  baseUrl: string;
  token?: string;
}

function appendQuery(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export class ContentClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: ContentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => null) as T & { error?: { message?: string } } | null;
    if (!response.ok) {
      throw new Error(payload && typeof payload === "object" && payload.error?.message
        ? String(payload.error.message)
        : `content request failed: ${response.status}`);
    }
    return payload as T;
  }

  async listBrands() { return await this.request<{ brands: ContentBrand[] }>(clawApiPath("brands")); }
  async createBrand(input: Record<string, unknown>) { return await this.request<{ brand: ContentBrand }>(clawApiPath("brands"), { method: "POST", body: JSON.stringify(input) }); }
  async updateBrand(id: string, input: Record<string, unknown>) { return await this.request<{ brand: ContentBrand }>(clawApiPath(`brands/${encodeURIComponent(id)}`), { method: "PUT", body: JSON.stringify(input) }); }
  async listDestinations(filters?: { brandId?: string }) { return await this.request<{ destinations: ContentDestination[] }>(appendQuery(clawApiPath("destinations"), filters)); }
  async createDestination(input: Record<string, unknown>) { return await this.request<{ destination: ContentDestination }>(clawApiPath("destinations"), { method: "POST", body: JSON.stringify(input) }); }
  async updateDestination(id: string, input: Record<string, unknown>) { return await this.request<{ destination: ContentDestination }>(clawApiPath(`destinations/${encodeURIComponent(id)}`), { method: "PUT", body: JSON.stringify(input) }); }
  async testConnection(id: string) { return await this.request<{ ok: boolean; destination: ContentDestination }>(clawApiPath(`destinations/${encodeURIComponent(id)}/test-connection`), { method: "POST" }); }
  async listCampaigns(filters?: { brandId?: string }) { return await this.request<{ campaigns: ContentCampaign[] }>(appendQuery(clawApiPath("campaigns"), filters)); }
  async createCampaign(input: Record<string, unknown>) { return await this.request<{ campaign: ContentCampaign }>(clawApiPath("campaigns"), { method: "POST", body: JSON.stringify(input) }); }
  async updateCampaign(id: string, input: Record<string, unknown>) { return await this.request<{ campaign: ContentCampaign }>(clawApiPath(`campaigns/${encodeURIComponent(id)}`), { method: "PUT", body: JSON.stringify(input) }); }
  async listEntries(filters?: { brandId?: string; campaignId?: string; status?: string }) { return await this.request<{ entries: ContentEntry[] }>(appendQuery(clawApiPath("entries"), filters)); }
  async getEntry(id: string) { return await this.request<Record<string, unknown>>(clawApiPath(`entries/${encodeURIComponent(id)}`)); }
  async createEntry(input: Record<string, unknown>) { return await this.request<{ entry: ContentEntry }>(clawApiPath("entries"), { method: "POST", body: JSON.stringify(input) }); }
  async updateEntry(id: string, input: Record<string, unknown>) { return await this.request<{ entry: ContentEntry }>(clawApiPath(`entries/${encodeURIComponent(id)}`), { method: "PUT", body: JSON.stringify(input) }); }
  async archiveEntry(id: string) { return await this.request<{ entry: ContentEntry }>(clawApiPath(`entries/${encodeURIComponent(id)}/archive`), { method: "POST" }); }
  async attachAsset(id: string, input: Record<string, unknown>) { return await this.request<{ asset: ContentAssetRef }>(clawApiPath(`entries/${encodeURIComponent(id)}/assets`), { method: "POST", body: JSON.stringify(input) }); }
  async generateVariants(id: string, input: { destinationIds: string[] }) { return await this.request<{ variants: ContentVariant[] }>(clawApiPath(`entries/${encodeURIComponent(id)}/variants:generate`), { method: "POST", body: JSON.stringify(input) }); }
  async listVariants(filters?: { entryId?: string; destinationId?: string; status?: string }) { return await this.request<{ variants: ContentVariant[] }>(appendQuery(clawApiPath("variants"), filters)); }
  async createVariant(input: Record<string, unknown>) { return await this.request<{ variant: ContentVariant }>(clawApiPath("variants"), { method: "POST", body: JSON.stringify(input) }); }
  async updateVariant(id: string, input: Record<string, unknown>) { return await this.request<{ variant: ContentVariant }>(clawApiPath(`variants/${encodeURIComponent(id)}`), { method: "PUT", body: JSON.stringify(input) }); }
  async listApprovals(filters?: { status?: string }) { return await this.request<{ approvals: ContentApprovalRequest[] }>(appendQuery(clawApiPath("approvals"), filters)); }
  async approve(approvalId: string, input?: Record<string, unknown>) { return await this.request<{ approval: ContentApprovalRequest }>(clawApiPath(`approvals/${encodeURIComponent(approvalId)}/approve`), { method: "POST", body: JSON.stringify(input ?? {}) }); }
  async reject(approvalId: string, input: { comment: string }) { return await this.request<{ approval: ContentApprovalRequest }>(clawApiPath(`approvals/${encodeURIComponent(approvalId)}/reject`), { method: "POST", body: JSON.stringify(input) }); }
  async cancelApproval(approvalId: string) { return await this.request<{ approval: ContentApprovalRequest }>(clawApiPath(`approvals/${encodeURIComponent(approvalId)}/cancel`), { method: "POST" }); }
  async listPlans(filters?: { status?: string }) { return await this.request<{ plans: ContentPublishPlan[] }>(appendQuery(clawApiPath("plans"), filters)); }
  async createPlan(input: Record<string, unknown>) { return await this.request<{ plan: ContentPublishPlan; approval?: ContentApprovalRequest | null }>(clawApiPath("plans"), { method: "POST", body: JSON.stringify(input) }); }
  async cancelPlan(planId: string) { return await this.request<{ plan: ContentPublishPlan }>(clawApiPath(`plans/${encodeURIComponent(planId)}/cancel`), { method: "POST" }); }
  async runPlan(planId: string) { return await this.request<{ plan: ContentPublishPlan; run: ContentPublicationRun }>(clawApiPath(`plans/${encodeURIComponent(planId)}/run`), { method: "POST" }); }
  async schedulerRun() { return await this.request<{ runs: ContentPublicationRun[] }>(clawApiPath("scheduler/run"), { method: "POST" }); }
  async listPublications() { return await this.request<{ runs: Array<ContentPublicationRun & { canRetry: boolean }> }>(clawApiPath("publications")); }
  async getPublication(runId: string) { return await this.request<Record<string, unknown>>(clawApiPath(`publications/${encodeURIComponent(runId)}`)); }
  async retryPublication(runId: string) { return await this.request<{ plan: ContentPublishPlan; run: ContentPublicationRun }>(clawApiPath(`publications/${encodeURIComponent(runId)}/retry`), { method: "POST" }); }
  async issueToken(input: { label: string; operations: ContentOperation[] }) { return await this.request<{ token: string; record: ContentScopedTokenRecord }>(clawApiPath("tokens"), { method: "POST", body: JSON.stringify(input) }); }
  async listTokens() { return await this.request<{ tokens: ContentScopedTokenRecord[] }>(clawApiPath("tokens")); }
  async frontendContract() { return await this.request<Record<string, unknown>>(clawApiPath("app/frontend-contract")); }
  async screens() { return await this.request<{ screens: Array<Record<string, unknown>> }>(clawApiPath("app/screens")); }
  async dashboard() { return await this.request<Record<string, unknown>>(clawApiPath("app/dashboard")); }
  async calendar() { return await this.request<Record<string, unknown>>(clawApiPath("app/calendar")); }
  async pipeline() { return await this.request<Record<string, unknown>>(clawApiPath("app/pipeline")); }
  async composer(entryId: string) { return await this.request<Record<string, unknown>>(clawApiPath(`app/composer/${encodeURIComponent(entryId)}`)); }
  async destinationsReadModel() { return await this.request<Record<string, unknown>>(clawApiPath("app/destinations")); }
  async approvalsReadModel() { return await this.request<Record<string, unknown>>(clawApiPath("app/approvals")); }
  async publicationsReadModel() { return await this.request<Record<string, unknown>>(clawApiPath("app/publications")); }
  async form(formId: "entry.create" | "variant.edit" | "destination.create" | "publish-plan.create") { return await this.request<Record<string, unknown>>(clawApiPath(`app/forms/${encodeURIComponent(formId)}`)); }
}
