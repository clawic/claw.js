import { clawApiPath } from "@clawjs/core";
import type {
  ContentBrand,
  ContentCampaign,
  ContentDestination,
  ContentOperation,
  ContentPublishPlan,
  ContentPublicationRun,
  ContentScopedTokenRecord,
  ContentVariant,
  ContentApprovalRequest,
  ContentEntry,
} from "../shared/types.ts";

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

export class ContentApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: { baseUrl: string; token?: string }) {
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
      const message = payload && typeof payload === "object" && "error" in payload && payload.error?.message
        ? payload.error.message
        : `content request failed: ${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }

  async login(email: string, password: string) {
    return await this.request<{ accessToken: string; admin: { id: string; email: string } }>(clawApiPath("auth/admin/login"), {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async listBrands() {
    return await this.request<{ brands: ContentBrand[] }>(clawApiPath("brands"));
  }

  async createBrand(input: Record<string, unknown>) {
    return await this.request<{ brand: ContentBrand }>(clawApiPath("brands"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listDestinations(query?: Record<string, string | undefined>) {
    return await this.request<{ destinations: ContentDestination[] }>(appendQuery(clawApiPath("destinations"), query));
  }

  async createDestination(input: Record<string, unknown>) {
    return await this.request<{ destination: ContentDestination }>(clawApiPath("destinations"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async testDestination(destinationId: string) {
    return await this.request<{ ok: boolean; destination: ContentDestination }>(clawApiPath(`destinations/${encodeURIComponent(destinationId)}/test-connection`), {
      method: "POST",
    });
  }

  async listCampaigns(query?: Record<string, string | undefined>) {
    return await this.request<{ campaigns: ContentCampaign[] }>(appendQuery(clawApiPath("campaigns"), query));
  }

  async createCampaign(input: Record<string, unknown>) {
    return await this.request<{ campaign: ContentCampaign }>(clawApiPath("campaigns"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listEntries(query?: Record<string, string | undefined>) {
    return await this.request<{ entries: ContentEntry[] }>(appendQuery(clawApiPath("entries"), query));
  }

  async createEntry(input: Record<string, unknown>) {
    return await this.request<{ entry: ContentEntry }>(clawApiPath("entries"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateEntry(entryId: string, input: Record<string, unknown>) {
    return await this.request<{ entry: ContentEntry }>(clawApiPath(`entries/${encodeURIComponent(entryId)}`), {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async attachAsset(entryId: string, input: Record<string, unknown>) {
    return await this.request<{ asset: Record<string, unknown> }>(clawApiPath(`entries/${encodeURIComponent(entryId)}/assets`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async generateVariants(entryId: string, input: Record<string, unknown>) {
    return await this.request<{ variants: ContentVariant[] }>(clawApiPath(`entries/${encodeURIComponent(entryId)}/variants:generate`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listVariants(query?: Record<string, string | undefined>) {
    return await this.request<{ variants: ContentVariant[] }>(appendQuery(clawApiPath("variants"), query));
  }

  async createVariant(input: Record<string, unknown>) {
    return await this.request<{ variant: ContentVariant }>(clawApiPath("variants"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateVariant(variantId: string, input: Record<string, unknown>) {
    return await this.request<{ variant: ContentVariant }>(clawApiPath(`variants/${encodeURIComponent(variantId)}`), {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async listApprovals(query?: Record<string, string | undefined>) {
    return await this.request<{ approvals: ContentApprovalRequest[] }>(appendQuery(clawApiPath("approvals"), query));
  }

  async approve(approvalId: string, input: Record<string, unknown> = {}) {
    return await this.request<{ approval: ContentApprovalRequest }>(clawApiPath(`approvals/${encodeURIComponent(approvalId)}/approve`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async reject(approvalId: string, input: Record<string, unknown>) {
    return await this.request<{ approval: ContentApprovalRequest }>(clawApiPath(`approvals/${encodeURIComponent(approvalId)}/reject`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listPlans(query?: Record<string, string | undefined>) {
    return await this.request<{ plans: ContentPublishPlan[] }>(appendQuery(clawApiPath("plans"), query));
  }

  async createPlan(input: Record<string, unknown>) {
    return await this.request<{ plan: ContentPublishPlan; approval?: ContentApprovalRequest | null }>(clawApiPath("plans"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async runPlan(planId: string) {
    return await this.request<{ plan: ContentPublishPlan; run: ContentPublicationRun }>(clawApiPath(`plans/${encodeURIComponent(planId)}/run`), {
      method: "POST",
    });
  }

  async cancelPlan(planId: string) {
    return await this.request<{ plan: ContentPublishPlan }>(clawApiPath(`plans/${encodeURIComponent(planId)}/cancel`), {
      method: "POST",
    });
  }

  async listPublications(query?: Record<string, string | undefined>) {
    return await this.request<{ runs: Array<ContentPublicationRun & { canRetry: boolean }> }>(appendQuery(clawApiPath("publications"), query));
  }

  async retryPublication(runId: string) {
    return await this.request<{ plan: ContentPublishPlan; run: ContentPublicationRun }>(clawApiPath(`publications/${encodeURIComponent(runId)}/retry`), {
      method: "POST",
    });
  }

  async listTokens() {
    return await this.request<{ tokens: ContentScopedTokenRecord[] }>(clawApiPath("tokens"));
  }

  async issueToken(input: { label: string; operations: ContentOperation[] }) {
    return await this.request<{ token: string; record: ContentScopedTokenRecord }>(clawApiPath("tokens"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
