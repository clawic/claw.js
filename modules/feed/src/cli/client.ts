import { clawApiPath } from "@clawjs/core";
type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface FeedCliOptions {
  baseUrl: string;
  token?: string;
}

export class FeedApiClient {
  constructor(private readonly options: FeedCliOptions) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    if (this.options.token) {
      headers.set("authorization", `Bearer ${this.options.token}`);
    }
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(new URL(path, this.options.baseUrl), {
      ...init,
      headers,
    });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() as JsonValue : await response.text();
    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    return payload;
  }

  async login(email: string, password: string): Promise<JsonValue> {
    return await this.request(clawApiPath("auth/admin/login"), {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // ── Sources ───────────────────────────────────────────────────────────

  async listSources(options: { type?: string; enabled?: string } = {}): Promise<JsonValue> {
    const url = new URL(clawApiPath("sources"), this.options.baseUrl);
    if (options.type) url.searchParams.set("type", options.type);
    if (options.enabled) url.searchParams.set("enabled", options.enabled);
    return await this.request(url.pathname + url.search);
  }

  async getSource(idOrSlug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`sources/${idOrSlug}`));
  }

  async createSource(input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath("sources"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateSource(idOrSlug: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`sources/${idOrSlug}`), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deleteSource(idOrSlug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`sources/${idOrSlug}`), { method: "DELETE" });
  }

  async pollSource(idOrSlug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`sources/${idOrSlug}/poll`), { method: "POST" });
  }

  async listSourceItems(idOrSlug: string, options: { status?: string; limit?: string } = {}): Promise<JsonValue> {
    const url = new URL(clawApiPath(`sources/${idOrSlug}/items`), this.options.baseUrl);
    if (options.status) url.searchParams.set("status", options.status);
    if (options.limit) url.searchParams.set("limit", options.limit);
    return await this.request(url.pathname + url.search);
  }

  // ── Items ─────────────────────────────────────────────────────────────

  async listItems(options: Record<string, string> = {}): Promise<JsonValue> {
    const url = new URL(clawApiPath("items"), this.options.baseUrl);
    for (const [key, value] of Object.entries(options)) {
      if (value) url.searchParams.set(key, value);
    }
    return await this.request(url.pathname + url.search);
  }

  async getItem(id: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${id}`));
  }

  async createItem(input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath("items"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateItem(id: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${id}`), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deleteItem(id: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${id}`), { method: "DELETE" });
  }

  async markRead(id: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${id}/read`), { method: "POST" });
  }

  async toggleStar(id: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${id}/star`), { method: "POST" });
  }

  async archiveItem(id: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${id}/archive`), { method: "POST" });
  }

  async bulkItems(action: string, itemIds: string[], tag?: string): Promise<JsonValue> {
    return await this.request(clawApiPath("items/bulk"), {
      method: "POST",
      body: JSON.stringify({ action, itemIds, tag }),
    });
  }

  // ── Annotations ───────────────────────────────────────────────────────

  async listAnnotations(itemId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${itemId}/annotations`));
  }

  async createAnnotation(itemId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`items/${itemId}/annotations`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async deleteAnnotation(annotationId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`annotations/${annotationId}`), { method: "DELETE" });
  }

  // ── Collections ───────────────────────────────────────────────────────

  async listCollections(): Promise<JsonValue> {
    return await this.request(clawApiPath("collections"));
  }

  async getCollection(idOrSlug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`collections/${idOrSlug}`));
  }

  async createCollection(input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath("collections"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateCollection(idOrSlug: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`collections/${idOrSlug}`), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deleteCollection(idOrSlug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`collections/${idOrSlug}`), { method: "DELETE" });
  }

  async listCollectionItems(idOrSlug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`collections/${idOrSlug}/items`));
  }

  async addItemsToCollection(idOrSlug: string, itemIds: string[]): Promise<JsonValue> {
    return await this.request(clawApiPath(`collections/${idOrSlug}/items`), {
      method: "POST",
      body: JSON.stringify({ itemIds }),
    });
  }

  async removeItemFromCollection(idOrSlug: string, itemId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`collections/${idOrSlug}/items/${itemId}`), { method: "DELETE" });
  }

  // ── Search ────────────────────────────────────────────────────────────

  async search(query: string, options: Record<string, string> = {}): Promise<JsonValue> {
    const url = new URL(clawApiPath("search"), this.options.baseUrl);
    url.searchParams.set("q", query);
    for (const [key, value] of Object.entries(options)) {
      if (value) url.searchParams.set(key, value);
    }
    return await this.request(url.pathname + url.search);
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  async stats(): Promise<JsonValue> {
    return await this.request(clawApiPath("stats"));
  }

  // ── Ingest ────────────────────────────────────────────────────────────

  async pollAll(): Promise<JsonValue> {
    return await this.request(clawApiPath("ingest/poll-all"), { method: "POST" });
  }

  // ── Tokens ────────────────────────────────────────────────────────────

  async listTokens(): Promise<JsonValue> {
    return await this.request(clawApiPath("tokens"));
  }

  async createToken(input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath("tokens"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async revokeToken(tokenId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`tokens/${tokenId}/revoke`), { method: "POST" });
  }
}
