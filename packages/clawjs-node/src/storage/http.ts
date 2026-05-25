import fs from "fs";
import http, { type IncomingMessage, type ServerResponse } from "http";
import path from "path";

import { clawStorageApiRoutes } from "@clawjs/core";

import type { LocalStorageStore, StorageShare } from "./store.ts";

export interface StorageOwnerTokenOptions {
  path: string;
  label?: string;
}

export interface StorageHttpServerOptions {
  store: LocalStorageStore;
  host?: string;
  port?: number;
  ownerToken?: StorageOwnerTokenOptions;
}

export interface StorageHttpServer {
  server: http.Server;
  url: string;
  close: () => Promise<void>;
}

export type StorageHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<unknown>;

function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, { error: message });
}

function parseStorageListLimit(url: URL): number | undefined {
  if (!url.searchParams.has("limit")) return undefined;
  const raw = url.searchParams.get("limit")?.trim() ?? "";
  if (!/^[0-9]+$/.test(raw)) throw new Error("invalid_storage_limit");
  const limit = Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("invalid_storage_limit");
  return limit;
}

function objectRoute(url: URL): { bucket: string; key: string } | null {
  const prefix = clawStorageApiRoutes.objectPrefix;
  if (!url.pathname.startsWith(prefix)) return null;
  const rest = url.pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  return {
    bucket: decodeURIComponent(rest.slice(0, slash)),
    key: decodeURIComponent(rest.slice(slash + 1)),
  };
}

function shareExpired(share: StorageShare): boolean {
  return Boolean(share.expiresAt && Date.parse(share.expiresAt) <= Date.now());
}

function isLoopbackRequest(request: IncomingMessage): boolean {
  const remote = request.socket.remoteAddress;
  if (!remote) return false;
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

export function ensureOwnerTokenFile(
  store: LocalStorageStore,
  options: StorageOwnerTokenOptions,
): string {
  const tokenPath = options.path;
  if (fs.existsSync(tokenPath)) {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing && store.isOwnerToken(existing)) return existing;
  }
  const issued = store.issueOwnerToken({ label: options.label });
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, issued.token, { mode: 0o600 });
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {
    // best effort on platforms without chmod
  }
  return issued.token;
}

export function createStorageHttpHandler(
  options: Pick<StorageHttpServerOptions, "store" | "ownerToken">,
): StorageHttpHandler {
  return async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    try {
      if (request.method === "GET" && url.pathname === clawStorageApiRoutes.ownerToken) {
        if (!options.ownerToken) return sendError(response, 404, "owner_token_disabled");
        if (!isLoopbackRequest(request)) return sendError(response, 403, "loopback_only");
        let token: string;
        try {
          token = fs.readFileSync(options.ownerToken.path, "utf8").trim();
        } catch {
          return sendError(response, 404, "owner_token_missing");
        }
        if (!token || !options.store.isOwnerToken(token)) {
          return sendError(response, 404, "owner_token_invalid");
        }
        return sendJson(response, 200, { token });
      }

      if (request.method === "GET" && url.pathname === clawStorageApiRoutes.buckets) {
        const token = bearerToken(request);
        if (!token) return sendError(response, 401, "missing_token");
        const scoped = options.store.scopedTokenStore(token);
        if (!scoped) return sendError(response, 401, "invalid_token");
        try {
          return sendJson(response, 200, { buckets: scoped.listBuckets() });
        } finally {
          scoped.close();
        }
      }

      if (request.method === "GET" && url.pathname === clawStorageApiRoutes.objects) {
        const token = bearerToken(request);
        if (!token) return sendError(response, 401, "missing_token");
        const scoped = options.store.scopedTokenStore(token);
        if (!scoped) return sendError(response, 401, "invalid_token");
        try {
          const items = scoped.list({
            bucket: url.searchParams.get("bucket") ?? undefined,
            prefix: url.searchParams.get("prefix") ?? undefined,
            limit: parseStorageListLimit(url),
          });
          return sendJson(response, 200, { items });
        } finally {
          scoped.close();
        }
      }

      const objectRef = objectRoute(url);
      if (objectRef) {
        const token = bearerToken(request);
        if (!token) return sendError(response, 401, "missing_token");
        const scoped = options.store.scopedTokenStore(token);
        if (!scoped) return sendError(response, 401, "invalid_token");
        try {
          if (request.method === "HEAD") {
            const object = scoped.head(objectRef);
            if (!object) {
              response.statusCode = 404;
              return response.end();
            }
            response.statusCode = 200;
            response.setHeader("content-type", object.contentType);
            response.setHeader("content-length", String(object.sizeBytes));
            response.setHeader("x-storage-sha256", object.sha256);
            return response.end();
          }
          if (request.method === "GET") {
            const object = scoped.get(objectRef);
            if (!object) return sendError(response, 404, "object_not_found");
            response.statusCode = 200;
            response.setHeader("content-type", object.contentType);
            response.setHeader("content-length", String(object.sizeBytes));
            response.setHeader("x-storage-sha256", object.sha256);
            return response.end(object.buffer);
          }
          if (request.method === "PUT") {
            const contentTypeHeader = request.headers["content-type"];
            const object = scoped.put({
              ...objectRef,
              data: await readBody(request),
              contentType: typeof contentTypeHeader === "string" ? contentTypeHeader : "application/octet-stream",
              visibility: request.headers["x-storage-visibility"] === "drive" ? "drive" : "internal",
            });
            return sendJson(response, 201, { object });
          }
          if (request.method === "DELETE") {
            return sendJson(response, 200, { ok: scoped.delete(objectRef) });
          }
        } finally {
          scoped.close();
        }
      }

      if (request.method === "POST" && url.pathname === clawStorageApiRoutes.shares) {
        const token = bearerToken(request);
        if (!token) return sendError(response, 401, "missing_token");
        const scoped = options.store.scopedTokenStore(token);
        if (!scoped) return sendError(response, 401, "invalid_token");
        try {
          const body = JSON.parse((await readBody(request)).toString("utf8") || "{}") as {
            bucket?: string;
            key?: string;
            label?: string;
            legalLabel?: string;
            approvalId?: string;
            expiresAt?: string | null;
            ttlMs?: number;
          };
          if (!body.key) return sendError(response, 400, "missing_key");
          const share = await scoped.createShare({
            bucket: body.bucket,
            key: body.key,
            label: body.label,
            legalLabel: body.legalLabel,
            approvalId: body.approvalId,
            expiresAt: body.expiresAt,
            ttlMs: body.ttlMs,
          });
          return sendJson(response, 201, { share });
        } finally {
          scoped.close();
        }
      }

      const revokeMatch = url.pathname.match(/^\/v1\/storage\/shares\/([^/]+)\/revoke$/);
      if (request.method === "POST" && revokeMatch) {
        const token = bearerToken(request);
        if (!token) return sendError(response, 401, "missing_token");
        const scoped = options.store.scopedTokenStore(token);
        if (!scoped) return sendError(response, 401, "invalid_token");
        try {
          return sendJson(response, 200, { ok: await scoped.revokeShare(decodeURIComponent(revokeMatch[1] ?? "")) });
        } finally {
          scoped.close();
        }
      }

      const share = url.pathname.match(/^\/shared\/storage\/([^/]+)$/);
      if (request.method === "GET" && share) {
        const record = options.store.getShare(decodeURIComponent(share[1] ?? ""));
        if (!record || record.revokedAt || shareExpired(record)) return sendError(response, 404, "share_not_found");
        return response.writeHead(302, { location: record.url }).end();
      }

      return sendError(response, 404, "not_found");
    } catch (error) {
      return sendError(response, 400, error instanceof Error ? error.message : String(error));
    }
  };
}

export async function startStorageHttpServer(options: StorageHttpServerOptions): Promise<StorageHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (options.ownerToken) {
    ensureOwnerTokenFile(options.store, options.ownerToken);
  }
  const server = http.createServer(createStorageHttpHandler(options));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
