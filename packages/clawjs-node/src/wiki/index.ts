export type {
  WikiPage,
  WikiComment,
  WikiLink,
  WikiRevision,
  WikiSearchResult,
  WikiPageStatus,
  WikiLinkType,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  WikiSearchOptions,
  WikiCommentInput,
  WikiListPagesOptions,
  WikiClientOptions,
} from "./types.ts";

import type {
  WikiPage,
  WikiComment,
  WikiLink,
  WikiSearchResult,
  WikiClientOptions,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  WikiSearchOptions,
  WikiCommentInput,
  WikiListPagesOptions,
} from "./types.ts";

export class WikiClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: WikiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    const payload = await response.json() as T;
    if (!response.ok) {
      throw new Error(JSON.stringify(payload));
    }
    return payload;
  }

  async search(query: string, options: WikiSearchOptions = {}): Promise<WikiSearchResult[]> {
    const result = await this.request<{ items: WikiSearchResult[] }>("/v1/search", {
      method: "POST",
      body: JSON.stringify({
        query,
        ...options,
      }),
    });
    return result.items;
  }

  async create(spaceSlug: string, page: CreateWikiPageInput): Promise<WikiPage> {
    return await this.request<WikiPage>(`/v1/spaces/${spaceSlug}/pages`, {
      method: "POST",
      body: JSON.stringify(page),
    });
  }

  async update(spaceSlug: string, slug: string, changes: UpdateWikiPageInput): Promise<WikiPage> {
    return await this.request<WikiPage>(`/v1/spaces/${spaceSlug}/pages/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
  }

  async delete(spaceSlug: string, slug: string): Promise<{ ok: boolean }> {
    return await this.request<{ ok: boolean }>(`/v1/spaces/${spaceSlug}/pages/${slug}`, {
      method: "DELETE",
    });
  }

  async getPage(spaceSlug: string, slug: string): Promise<WikiPage> {
    return await this.request<WikiPage>(`/v1/spaces/${spaceSlug}/pages/${slug}`);
  }

  async listPages(spaceSlug: string, options: WikiListPagesOptions = {}): Promise<{ items: WikiPage[]; total: number }> {
    const url = new URL(`/v1/spaces/${spaceSlug}/pages`, this.baseUrl);
    if (options.parentPageId !== undefined) {
      url.searchParams.set("parentPageId", options.parentPageId ?? "");
    }
    if (options.status) url.searchParams.set("status", options.status);
    if (options.tag) url.searchParams.set("tag", options.tag);
    if (options.limit !== undefined) url.searchParams.set("limit", String(options.limit));
    if (options.offset !== undefined) url.searchParams.set("offset", String(options.offset));
    return await this.request<{ items: WikiPage[]; total: number }>(url.pathname + url.search);
  }

  async comment(spaceSlug: string, slug: string, body: string, options: WikiCommentInput = {}): Promise<WikiComment> {
    return await this.request<WikiComment>(`/v1/spaces/${spaceSlug}/pages/${slug}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, ...options }),
    });
  }

  async link(sourcePageId: string, targetPageId: string, linkType?: string): Promise<WikiLink> {
    return await this.request<WikiLink>("/v1/links", {
      method: "POST",
      body: JSON.stringify({ sourcePageId, targetPageId, linkType: linkType ?? "related" }),
    });
  }

  async getBacklinks(spaceSlug: string, slug: string): Promise<{ items: WikiPage[]; links: WikiLink[] }> {
    return await this.request<{ items: WikiPage[]; links: WikiLink[] }>(
      `/v1/spaces/${spaceSlug}/pages/${slug}/backlinks`,
    );
  }
}
