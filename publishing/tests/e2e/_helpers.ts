import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../../src/server/app.ts";

export async function bootTestApp() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "publishing-test-"));
  const tokenStorePath = path.join(dataDir, "token");
  const built = await buildApp({
    config: {
      dataDir,
      dbPath: path.join(dataDir, "clawjs.sqlite"),
      tokenStorePath,
      host: "127.0.0.1",
      port: 0,
      pipelineEnabled: false, // tests drive the pipeline manually
      schedulerTickMs: 50,
      workerTickMs: 50,
    },
  });
  await built.app.listen({ host: "127.0.0.1", port: 0 });
  const address = built.app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    built,
    baseUrl: `http://127.0.0.1:${port}`,
    adminToken: built.services.auth.getEphemeralAdminToken(),
    cleanup: async () => {
      await built.shutdown();
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

export async function authedFetch(baseUrl: string, token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

export async function jsonFetch<T = unknown>(baseUrl: string, token: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await authedFetch(baseUrl, token, path, init);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
