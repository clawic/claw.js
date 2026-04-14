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
    return await this.request<{ accessToken: string; admin: { id: string; email: string } }>("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async listBrands() {
    return await this.request<{ brands: ContentBrand[] }>("/v1/brands");
  }

  async createBrand(input: Record<string, unknown>) {
    return await this.request<{ brand: ContentBrand }>("/v1/brands", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listDestinations(query?: Record<string, string | undefined>) {
    return await this.request<{ destinations: ContentDestination[] }>(appendQuery("/v1/destinations", query));
  }

  async createDestination(input: Record<string, unknown>) {
    return await this.request<{ destination: ContentDestination }>("/v1/destinations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async testDestination(destinationId: string) {
    return await this.request<{ ok: boolean; destination: ContentDestination }>(`/v1/destinations/${encodeURIComponent(destinationId)}/test-connection`, {
      method: "POST",
    });
  }

  async listCampaigns(query?: Record<string, string | undefined>) {
    return await this.request<{ campaigns: ContentCampaign[] }>(appendQuery("/v1/campaigns", query));
  }

  async createCampaign(input: Record<string, unknown>) {
    return await this.request<{ campaign: ContentCampaign }>("/v1/campaigns", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listEntries(query?: Record<string, string | undefined>) {
    return await this.request<{ entries: ContentEntry[] }>(appendQuery("/v1/entries", query));
  }

  async createEntry(input: Record<string, unknown>) {
    return await this.request<{ entry: ContentEntry }>("/v1/entries", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateEntry(entryId: string, input: Record<string, unknown>) {
    return await this.request<{ entry: ContentEntry }>(`/v1/entries/${encodeURIComponent(entryId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async attachAsset(entryId: string, input: Record<string, unknown>) {
    return await this.request<{ asset: Record<string, unknown> }>(`/v1/entries/${encodeURIComponent(entryId)}/assets`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async generateVariants(entryId: string, input: Record<string, unknown>) {
    return await this.request<{ variants: ContentVariant[] }>(`/v1/entries/${encodeURIComponent(entryId)}/variants:generate`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listVariants(query?: Record<string, string | undefined>) {
    return await this.request<{ variants: ContentVariant[] }>(appendQuery("/v1/variants", query));
  }

  async createVariant(input: Record<string, unknown>) {
    return await this.request<{ variant: ContentVariant }>("/v1/variants", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateVariant(variantId: string, input: Record<string, unknown>) {
    return await this.request<{ variant: ContentVariant }>(`/v1/variants/${encodeURIComponent(variantId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  async listApprovals(query?: Record<string, string | undefined>) {
    return await this.request<{ approvals: ContentApprovalRequest[] }>(appendQuery("/v1/approvals", query));
  }

  async approve(approvalId: string, input: Record<string, unknown> = {}) {
    return await this.request<{ approval: ContentApprovalRequest }>(`/v1/approvals/${encodeURIComponent(approvalId)}/approve`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async reject(approvalId: string, input: Record<string, unknown>) {
    return await this.request<{ approval: ContentApprovalRequest }>(`/v1/approvals/${encodeURIComponent(approvalId)}/reject`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listPlans(query?: Record<string, string | undefined>) {
    return await this.request<{ plans: ContentPublishPlan[] }>(appendQuery("/v1/plans", query));
  }

  async createPlan(input: Record<string, unknown>) {
    return await this.request<{ plan: ContentPublishPlan; approval?: ContentApprovalRequest | null }>("/v1/plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async runPlan(planId: string) {
    return await this.request<{ plan: ContentPublishPlan; run: ContentPublicationRun }>(`/v1/plans/${encodeURIComponent(planId)}/run`, {
      method: "POST",
    });
  }

  async cancelPlan(planId: string) {
    return await this.request<{ plan: ContentPublishPlan }>(`/v1/plans/${encodeURIComponent(planId)}/cancel`, {
      method: "POST",
    });
  }

  async listPublications(query?: Record<string, string | undefined>) {
    return await this.request<{ runs: Array<ContentPublicationRun & { canRetry: boolean }> }>(appendQuery("/v1/publications", query));
  }

  async retryPublication(runId: string) {
    return await this.request<{ plan: ContentPublishPlan; run: ContentPublicationRun }>(`/v1/publications/${encodeURIComponent(runId)}/retry`, {
      method: "POST",
    });
  }

  async listTokens() {
    return await this.request<{ tokens: ContentScopedTokenRecord[] }>("/v1/tokens");
  }

  async issueToken(input: { label: string; operations: ContentOperation[] }) {
    return await this.request<{ token: string; record: ContentScopedTokenRecord }>("/v1/tokens", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
