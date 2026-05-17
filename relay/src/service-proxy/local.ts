import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import WebSocket, { WebSocketServer } from "ws";

export interface RelayServiceProxyOptions {
  relayUrl: string;
  tenantId: string;
  serviceId: string;
  email: string;
  password: string;
  host?: string;
  port?: number;
  uiUrl?: string;
}

export interface RelayServiceProxyServer {
  url: string;
  close: () => Promise<void>;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function copyHeaders(input: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    if (!value || key.toLowerCase() === "host" || key.toLowerCase() === "content-length") continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

function shouldProxyToService(pathname: string): boolean {
  return pathname === "/v1"
    || pathname.startsWith("/v1/")
    || pathname === "/api"
    || pathname.startsWith("/api/");
}

export async function startRelayServiceProxy(options: RelayServiceProxyOptions): Promise<RelayServiceProxyServer> {
  let accessToken = "";
  let accessTokenExpiresAt = 0;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;

  const relayBase = options.relayUrl.replace(/\/$/, "");
  const uiBase = options.uiUrl?.replace(/\/$/, "");

  const relayToken = async (): Promise<string> => {
    if (accessToken && accessTokenExpiresAt > Date.now() + 30_000) return accessToken;
    const response = await fetch(`${relayBase}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId: options.tenantId, email: options.email, password: options.password }),
    });
    if (!response.ok) throw new Error(`Relay login failed: ${response.status}`);
    const payload = await response.json() as { accessToken: string; expiresInSec?: number };
    accessToken = payload.accessToken;
    accessTokenExpiresAt = Date.now() + (payload.expiresInSec ?? 900) * 1000;
    return accessToken;
  };

  const forwardHttp = async (request: IncomingMessage, response: ServerResponse, targetBase: string, headers: Record<string, string>) => {
    const body = await readBody(request);
    const upstream = await fetch(`${targetBase}${request.url ?? "/"}`, {
      method: request.method ?? "GET",
      headers,
      body: ["GET", "HEAD"].includes(request.method ?? "GET") ? undefined : body,
      redirect: "manual",
    });
    response.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-encoding") return;
      response.setHeader(key, value);
    });
    if (upstream.body) {
      for await (const chunk of upstream.body) {
        response.write(Buffer.from(chunk));
      }
    }
    response.end();
  };

  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://local").pathname;
      if (shouldProxyToService(pathname)) {
        const token = await relayToken();
        const targetBase = `${relayBase}/v1/tenants/${encodeURIComponent(options.tenantId)}/services/${encodeURIComponent(options.serviceId)}`;
        await forwardHttp(request, response, targetBase, {
          ...copyHeaders(request),
          "x-relay-authorization": `Bearer ${token}`,
        });
        return;
      }
      if (!uiBase) {
        response.statusCode = 404;
        response.end("not_found");
        return;
      }
      await forwardHttp(request, response, uiBase, copyHeaders(request));
    } catch (error) {
      response.statusCode = 502;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "relay_service_proxy_error", message: error instanceof Error ? error.message : String(error) }));
    }
  });

  const wsServer = new WebSocketServer({ noServer: true });
  server.on("upgrade", async (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://local").pathname;
    if (!shouldProxyToService(pathname)) {
      socket.destroy();
      return;
    }
    try {
      const token = await relayToken();
      wsServer.handleUpgrade(request, socket, head, (client) => {
        const url = new URL(`${relayBase}/v1/tenants/${encodeURIComponent(options.tenantId)}/services/${encodeURIComponent(options.serviceId)}/_ws${request.url ?? "/"}`);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const upstream = new WebSocket(url, {
          headers: {
            ...copyHeaders(request),
            "x-relay-authorization": `Bearer ${token}`,
            "x-relay-proxy-channel": randomUUID(),
          },
        });
        client.on("message", (data, isBinary) => {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
          else upstream.once("open", () => upstream.send(data, { binary: isBinary }));
        });
        upstream.on("message", (data, isBinary) => {
          if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
        });
        const closeBoth = () => {
          if (client.readyState === WebSocket.OPEN) client.close();
          if (upstream.readyState === WebSocket.OPEN) upstream.close();
        };
        client.once("close", closeBoth);
        upstream.once("close", closeBoth);
        upstream.once("error", closeBoth);
      });
    } catch {
      socket.destroy();
    }
  });

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
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
