import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { clawDatabaseApiRoutes } from "@clawjs/core/catalogs";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface DatabaseCliOptions {
  baseUrl: string;
  token?: string;
}

export class DatabaseApiClient {
  private readonly options: DatabaseCliOptions;

  constructor(options: DatabaseCliOptions) {
    this.options = options;
  }

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
    return await this.request(clawDatabaseApiRoutes.adminLogin, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async listNamespaces(): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaces);
  }

  async createNamespace(input: { id?: string; displayName: string }): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaces, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listCollections(namespaceId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaceCollections(namespaceId));
  }

  async getCollection(namespaceId: string, collectionName: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.collection(namespaceId, collectionName));
  }

  async createCollection(namespaceId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaceCollections(namespaceId), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateCollection(namespaceId: string, collectionName: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.collection(namespaceId, collectionName), {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async listRecords(namespaceId: string, collectionName: string, options: { filter?: string; sort?: string; limit?: number; offset?: number } = {}): Promise<JsonValue> {
    const url = new URL(clawDatabaseApiRoutes.records(namespaceId, collectionName), this.options.baseUrl);
    if (options.filter) url.searchParams.set("filter", options.filter);
    if (options.sort) url.searchParams.set("sort", options.sort);
    if (options.limit !== undefined) url.searchParams.set("limit", String(options.limit));
    if (options.offset !== undefined) url.searchParams.set("offset", String(options.offset));
    return await this.request(url.pathname + url.search);
  }

  async storageMetrics(): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.storageMetrics);
  }

  async createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.records(namespaceId, collectionName), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getRecord(namespaceId: string, collectionName: string, recordId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.record(namespaceId, collectionName, recordId));
  }

  async updateRecord(namespaceId: string, collectionName: string, recordId: string, payload: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.record(namespaceId, collectionName, recordId), {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async deleteRecord(namespaceId: string, collectionName: string, recordId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.record(namespaceId, collectionName, recordId), {
      method: "DELETE",
    });
  }

  async listTokens(namespaceId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaceTokens(namespaceId));
  }

  async createToken(namespaceId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaceTokens(namespaceId), {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async revokeToken(namespaceId: string, tokenId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.revokeToken(namespaceId, tokenId), {
      method: "POST",
    });
  }

  async listFiles(namespaceId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.namespaceFiles(namespaceId));
  }

  async uploadFile(input: {
    namespaceId: string;
    filePath: string;
    collectionName?: string;
    recordId?: string;
    contentType?: string;
  }): Promise<JsonValue> {
    const stat = fs.statSync(input.filePath);
    return await this.uploadFileStream({
      namespaceId: input.namespaceId,
      stream: fs.createReadStream(input.filePath),
      filename: input.filePath.split("/").pop() || "upload.bin",
      contentType: input.contentType ?? "application/octet-stream",
      sizeBytes: stat.size,
      collectionName: input.collectionName,
      recordId: input.recordId,
    });
  }

  async uploadFileStream(input: {
    namespaceId: string;
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
    sizeBytes: number;
    collectionName?: string;
    recordId?: string;
  }): Promise<JsonValue> {
    const boundary = `----ClawDatabaseBoundary${randomUUID()}`;
    const fields: Array<[string, string]> = [["namespaceId", input.namespaceId]];
    if (input.collectionName) fields.push(["collectionName", input.collectionName]);
    if (input.recordId) fields.push(["recordId", input.recordId]);
    const prefix = [
      ...fields.flatMap(([name, value]) => [
        `--${boundary}\r\n`,
        `Content-Disposition: form-data; name="${escapeMultipartValue(name)}"\r\n\r\n`,
        `${value}\r\n`,
      ]),
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${escapeMultipartValue(input.filename)}"\r\n`,
      `Content-Type: ${input.contentType || "application/octet-stream"}\r\n\r\n`,
    ].join("");
    const suffix = `\r\n--${boundary}--\r\n`;
    const contentLength = Buffer.byteLength(prefix) + input.sizeBytes + Buffer.byteLength(suffix);
    const body = Readable.from((async function* () {
      yield Buffer.from(prefix);
      for await (const chunk of input.stream) {
        yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Buffer | string);
      }
      yield Buffer.from(suffix);
    })());
    return await this.request(clawDatabaseApiRoutes.files, {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(contentLength),
      },
      body: body as unknown as BodyInit,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
  }

  async deleteFile(fileId: string): Promise<JsonValue> {
    return await this.request(clawDatabaseApiRoutes.file(fileId), {
      method: "DELETE",
    });
  }
}

function escapeMultipartValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r|\n/g, "_");
}
