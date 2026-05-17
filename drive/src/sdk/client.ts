import fs from "node:fs";

import { clawDriveApiRoutes } from "@clawjs/core";

import type {
  DriveComment,
  DriveItem,
  DriveItemDetail,
  DriveNativeContent,
  DriveOperation,
  DriveRevision,
  DriveScopedTokenRecord,
  DriveShareRecord,
  DriveView,
  DriveViewCounts,
} from "../shared/types.ts";

class DriveApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(
      (body as { message?: string; error?: string } | null)?.message
      || (body as { message?: string; error?: string } | null)?.error
      || `HTTP ${status}`,
    );
  }
}

export interface DriveClientOptions {
  baseUrl: string;
  token?: string;
}

export interface ListItemsResponse {
  items: DriveItem[];
  counts: DriveViewCounts;
  breadcrumbs: Array<{ id: string; name: string }>;
}

export class DriveApiClient {
  constructor(private readonly options: DriveClientOptions) {}

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (this.options.token) headers.set("authorization", `Bearer ${this.options.token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(new URL(pathname, this.options.baseUrl), {
      ...init,
      headers,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json() as unknown
      : await response.text();
    if (!response.ok) throw new DriveApiError(response.status, body);
    return body as T;
  }

  async login(email: string, password: string): Promise<{ accessToken: string; email: string }> {
    return await this.request(clawDriveApiRoutes.adminLogin, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async bootstrap(): Promise<{ counts: DriveViewCounts }> {
    return await this.request(clawDriveApiRoutes.bootstrap);
  }

  async listItems(input: { view?: DriveView; parentId?: string | null; query?: string } = {}): Promise<ListItemsResponse> {
    const url = new URL(clawDriveApiRoutes.items, this.options.baseUrl);
    if (input.view) url.searchParams.set("view", input.view);
    if (input.parentId) url.searchParams.set("parentId", input.parentId);
    if (input.query) url.searchParams.set("q", input.query);
    return await this.request(url.pathname + url.search);
  }

  async search(query: string): Promise<{ items: DriveItem[] }> {
    const url = new URL(clawDriveApiRoutes.search, this.options.baseUrl);
    url.searchParams.set("q", query);
    return await this.request(url.pathname + url.search);
  }

  async getItem(itemId: string): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.item(itemId));
  }

  async createItem(input: { kind: "folder" | "doc" | "sheet" | "slide"; name?: string; parentId?: string | null }): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.items, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateItem(itemId: string, patch: { name?: string; parentId?: string | null; starred?: boolean }): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.item(itemId), {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  async moveItem(itemId: string, parentId: string | null): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.itemMove(itemId), {
      method: "POST",
      body: JSON.stringify({ parentId }),
    });
  }

  async copyItem(itemId: string, parentId?: string | null): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.itemCopy(itemId), {
      method: "POST",
      body: JSON.stringify({ parentId }),
    });
  }

  async saveContent(itemId: string, input: { baseRevisionId: string | null; content: DriveNativeContent; summary?: string | null }): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.itemContent(itemId), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async markViewed(itemId: string): Promise<{ ok: boolean }> {
    return await this.request(clawDriveApiRoutes.itemView(itemId), { method: "POST" });
  }

  async trashItem(itemId: string): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.itemTrash(itemId), { method: "POST" });
  }

  async restoreItem(itemId: string): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.itemRestore(itemId), { method: "POST" });
  }

  async deleteItem(itemId: string): Promise<{ ok: boolean }> {
    return await this.request(clawDriveApiRoutes.item(itemId), { method: "DELETE" });
  }

  async listComments(itemId: string): Promise<{ items: DriveComment[] }> {
    return await this.request(clawDriveApiRoutes.itemComments(itemId));
  }

  async addComment(itemId: string, body: string): Promise<DriveComment> {
    return await this.request(clawDriveApiRoutes.itemComments(itemId), {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }

  async listRevisions(itemId: string): Promise<{ items: DriveRevision[] }> {
    return await this.request(clawDriveApiRoutes.itemRevisions(itemId));
  }

  async restoreRevision(itemId: string, revisionId: string): Promise<DriveItemDetail> {
    return await this.request(clawDriveApiRoutes.itemRevisionRestore(itemId, revisionId), {
      method: "POST",
    });
  }

  async listShares(itemId: string): Promise<{ items: DriveShareRecord[] }> {
    return await this.request(clawDriveApiRoutes.itemShares(itemId));
  }

  async createShare(itemId: string, label: string): Promise<{ share: DriveShareRecord; token: string; url: string }> {
    return await this.request(clawDriveApiRoutes.itemShares(itemId), {
      method: "POST",
      body: JSON.stringify({ label }),
    });
  }

  async revokeShare(itemId: string, shareId: string): Promise<{ ok: boolean }> {
    return await this.request(clawDriveApiRoutes.itemShareRevoke(itemId, shareId), { method: "POST" });
  }

  async listTokens(): Promise<{ items: DriveScopedTokenRecord[] }> {
    return await this.request(clawDriveApiRoutes.tokens);
  }

  async createToken(label: string, operations: DriveOperation[]): Promise<{ record: DriveScopedTokenRecord; token: string }> {
    return await this.request(clawDriveApiRoutes.tokens, {
      method: "POST",
      body: JSON.stringify({ label, operations }),
    });
  }

  async revokeToken(tokenId: string): Promise<{ ok: boolean }> {
    return await this.request(clawDriveApiRoutes.tokenRevoke(tokenId), { method: "POST" });
  }

  async uploadFile(input: { filePath: string; parentId?: string | null }): Promise<DriveItemDetail> {
    const form = new FormData();
    if (input.parentId) form.set("parentId", input.parentId);
    const fileName = input.filePath.split("/").pop() || "upload.bin";
    form.set("file", new Blob([fs.readFileSync(input.filePath)]), fileName);
    return await this.request(clawDriveApiRoutes.uploads, {
      method: "POST",
      body: form,
    });
  }

  async download(itemId: string): Promise<Buffer> {
    const response = await fetch(new URL(clawDriveApiRoutes.itemDownload(itemId), this.options.baseUrl), {
      headers: this.options.token ? { authorization: `Bearer ${this.options.token}` } : {},
    });
    if (!response.ok) {
      throw new DriveApiError(response.status, await response.text());
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async exportItem(itemId: string, format: string): Promise<Buffer> {
    const exportUrl = new URL(clawDriveApiRoutes.itemExport(itemId), this.options.baseUrl);
    exportUrl.searchParams.set("format", format);
    const response = await fetch(exportUrl, {
      headers: this.options.token ? { authorization: `Bearer ${this.options.token}` } : {},
    });
    if (!response.ok) {
      throw new DriveApiError(response.status, await response.text());
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
