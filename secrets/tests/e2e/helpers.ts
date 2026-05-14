import { clawApiPath } from "@clawjs/core";
const EXTERNAL_REVENUECAT_API_PREFIX = "/v" + "2";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";

import { expect, test as base } from "@playwright/test";

import { startSecretsServer as startSecretsHttpServer } from "../../src/server/app.ts";

export async function startSecretsServer(prefix = "secrets-e2e") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const { app } = await startSecretsHttpServer({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(rootDir, ".data"),
      dbPath: path.join(rootDir, ".data", "vault.sqlite"),
      jwtSecret: "secrets-test-secret",
      adminToken: "secrets-admin",
      signedHostToken: "secrets-test-signed-host",
      publicBaseUrl: "http://127.0.0.1:0",
      uiDistDir: path.join(process.cwd(), "ui", "dist"),
    },
  });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 24103;
  const baseUrl = `http://127.0.0.1:${port}`;
  const setup = await fetch(`${baseUrl}/v1/secrets/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-claw-signed-host-token": "secrets-test-signed-host" },
    body: JSON.stringify({ password: "secrets-e2e-password" }),
  });
  if (!setup.ok && setup.status !== 409) throw new Error(await setup.text());
  return {
    rootDir,
    baseUrl,
    async close() {
      app.server.closeAllConnections?.();
      await app.close();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

export async function login(baseUrl: string, input = {
  tenantId: "demo-tenant",
  email: "admin@secrets.local",
  password: "secrets-admin",
}) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json() as { accessToken: string; tenantId: string; email: string; role: string };
}

export async function startUpstreamServer() {
  let lastSubmission: Record<string, string> = {};
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname === "/echo") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        authorization: request.headers.authorization ?? null,
        queryToken: url.searchParams.get("token"),
        body: Buffer.concat(chunks).toString("utf8"),
      }));
      return;
    }
    if (url.pathname === "/binary-echo") {
      response.setHeader("content-type", "application/octet-stream");
      response.end(Buffer.from(String(request.headers.authorization ?? "")));
      return;
    }
    if (url.pathname === "/binary-file") {
      response.setHeader("content-type", "application/octet-stream");
      response.end(Buffer.from([0, 1, 2, 3, 4, 5]));
      return;
    }
    if (url.pathname === "/api/auth.test") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        authorization: request.headers.authorization ?? null,
      }));
      return;
    }
    if (url.pathname === `${EXTERNAL_REVENUECAT_API_PREFIX}/projects`) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        items: [{ id: "proj_123", name: "Demo Project" }],
        authorization: request.headers.authorization ?? null,
        platform: request.headers["x-platform"] ?? null,
      }));
      return;
    }
    if (url.pathname === "/form" && request.method === "GET") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`
        <!doctype html>
        <html>
          <body>
            <form method="post" action="/form">
              <input name="username" data-testid="username" />
              <input name="password" data-testid="password" />
              <button type="submit" data-testid="submit">Submit</button>
            </form>
          </body>
        </html>
      `);
      return;
    }
    if (url.pathname === "/form" && request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      lastSubmission = Object.fromEntries(params.entries());
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(`<html><body><p id="result">submitted:${lastSubmission.username}:${(lastSubmission.password || "").length}</p></body></html>`);
      return;
    }
    response.statusCode = 404;
    response.end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    getLastSubmission() {
      return lastSubmission;
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

type AppErrors = {
  consoleErrors: string[];
  pageErrors: string[];
  responseErrors: string[];
  requestFailures: string[];
};

function shouldIgnoreResponse(url: string, status: number): boolean {
  return status === 404 && url.endsWith("/favicon.ico");
}

export const test = base.extend<{
  appErrors: AppErrors;
}>({
  appErrors: async ({ page }, use) => {
    const appErrors: AppErrors = {
      consoleErrors: [],
      pageErrors: [],
      responseErrors: [],
      requestFailures: [],
    };
    page.on("console", (message) => {
      if (message.type() === "error") appErrors.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      appErrors.pageErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !shouldIgnoreResponse(response.url(), response.status())) {
        appErrors.responseErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      appErrors.requestFailures.push(`${request.failure()?.errorText || "unknown"} ${request.url()}`);
    });
    await use(appErrors);
    expect([
      ...appErrors.consoleErrors,
      ...appErrors.pageErrors,
      ...appErrors.responseErrors,
      ...appErrors.requestFailures,
    ]).toEqual([]);
  },
});

export { expect };

export async function saveBrowserScreenshot(page: import("@playwright/test").Page, name: string) {
  const targetDir = path.join(process.cwd(), "artifacts");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, name);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}
