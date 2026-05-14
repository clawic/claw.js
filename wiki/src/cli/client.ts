import { clawApiPath } from "@clawjs/core";
import fs from "node:fs";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface WikiCliOptions {
  baseUrl: string;
  token?: string;
}

export class WikiApiClient {
  constructor(private readonly options: WikiCliOptions) {}

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

  // ── Spaces ───────────────────────────────────────────────────────────

  async listSpaces(): Promise<JsonValue> {
    return await this.request(clawApiPath("spaces"));
  }

  async createSpace(input: { name: string; slug?: string; description?: string }): Promise<JsonValue> {
    return await this.request(clawApiPath("spaces"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async deleteSpace(spaceId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}`), { method: "DELETE" });
  }

  // ── Pages ────────────────────────────────────────────────────────────

  async listPages(spaceId: string, options: { status?: string; tag?: string } = {}): Promise<JsonValue> {
    const url = new URL(clawApiPath(`spaces/${spaceId}/pages`), this.options.baseUrl);
    if (options.status) url.searchParams.set("status", options.status);
    if (options.tag) url.searchParams.set("tag", options.tag);
    return await this.request(url.pathname + url.search);
  }

  async getPage(spaceId: string, slug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}`));
  }

  async createPage(spaceId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updatePage(spaceId: string, slug: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}`), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async deletePage(spaceId: string, slug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}`), { method: "DELETE" });
  }

  // ── Comments ─────────────────────────────────────────────────────────

  async listComments(spaceId: string, slug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}/comments`));
  }

  async createComment(spaceId: string, slug: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}/comments`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  // ── Search ───────────────────────────────────────────────────────────

  async search(input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath("search"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async searchFts(query: string, spaceId?: string): Promise<JsonValue> {
    const url = new URL(clawApiPath("search/fts"), this.options.baseUrl);
    url.searchParams.set("q", query);
    if (spaceId) url.searchParams.set("spaceId", spaceId);
    return await this.request(url.pathname + url.search);
  }

  // ── Links ────────────────────────────────────────────────────────────

  async listLinks(spaceId: string, slug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}/links`));
  }

  async createLink(input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath("links"), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async deleteLink(linkId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`links/${linkId}`), { method: "DELETE" });
  }

  // ── Revisions ────────────────────────────────────────────────────────

  async listRevisions(spaceId: string, slug: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}/revisions`));
  }

  async getRevision(spaceId: string, slug: string, revisionNumber: number): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/pages/${slug}/revisions/${revisionNumber}`));
  }

  // ── Import / Export ──────────────────────────────────────────────────

  async importDir(spaceId: string, dirPath: string): Promise<JsonValue> {
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    const form = new FormData();
    for (const file of files) {
      const content = fs.readFileSync(`${dirPath}/${file}`);
      form.append("files", new Blob([content]), file);
    }
    return await this.request(clawApiPath(`import?spaceId=${spaceId}`), {
      method: "POST",
      body: form,
    });
  }

  async exportPages(spaceId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`export?spaceId=${spaceId}`));
  }

  // ── Tokens ───────────────────────────────────────────────────────────

  async listTokens(spaceId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/tokens`));
  }

  async createToken(spaceId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/tokens`), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async revokeToken(spaceId: string, tokenId: string): Promise<JsonValue> {
    return await this.request(clawApiPath(`spaces/${spaceId}/tokens/${tokenId}/revoke`), { method: "POST" });
  }
}
