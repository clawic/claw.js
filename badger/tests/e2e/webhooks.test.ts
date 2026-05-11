import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";

import { bootTestApp, jsonFetch } from "./_helpers.ts";

function startCollector(): Promise<{ port: number; receive: () => Promise<{ headers: Record<string, string>; body: string }>; stop: () => Promise<void> }> {
  return new Promise((resolve) => {
    const buffer: Array<{ headers: Record<string, string>; body: string }> = [];
    let resolveNext: ((v: { headers: Record<string, string>; body: string }) => void) | null = null;
    const server = createServer((req: IncomingMessage, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
        const entry = { headers, body };
        if (resolveNext) {
          resolveNext(entry);
          resolveNext = null;
        } else {
          buffer.push(entry);
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        port,
        receive: () =>
          new Promise((res2) => {
            const queued = buffer.shift();
            if (queued) res2(queued);
            else resolveNext = res2;
          }),
        stop: () => new Promise((res2) => server.close(() => res2())),
      });
    });
  });
}

test("webhooks: post.published fans out signed delivery", async () => {
  const collector = await startCollector();
  const { built, baseUrl, adminToken, cleanup } = await bootTestApp();
  try {
    const ws = await jsonFetch<{ workspace: { id: string } }>(baseUrl, adminToken, "/v1/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "wh-ws" }),
    });
    const workspaceId = ws.body.workspace.id;
    await jsonFetch(baseUrl, adminToken, `/v1/ws/${workspaceId}/webhooks`, {
      method: "POST",
      body: JSON.stringify({
        name: "collector",
        callback_url: `http://127.0.0.1:${collector.port}/`,
        events: ["post.*"],
      }),
    });
    const connect = await jsonFetch<{ account: { id: string } }>(baseUrl, adminToken, `/v1/ws/${workspaceId}/channels/connect/devnull`, {
      method: "POST",
      body: JSON.stringify({ display_name: "dev", provider_account_id: "w" }),
    });
    const accountId = connect.body.account.id;
    await jsonFetch(baseUrl, adminToken, `/v1/ws/${workspaceId}/posts`, {
      method: "POST",
      body: JSON.stringify({
        accounts: [accountId],
        editorial_status: "ready",
        schedule: { kind: "datetime", at: new Date(Date.now() - 1000).toISOString() },
        variants: [{ is_original: true, blocks: [{ body: "hi" }] }],
      }),
    });
    built.services.scheduler.tick();
    for (let i = 0; i < 5; i += 1) await built.services.worker.tick(20);
    const delivery = await collector.receive();
    assert.match(delivery.headers["x-badger-signature"] ?? "", /t=\d+,v1=[0-9a-f]+/);
    assert.equal(delivery.headers["x-badger-event"]?.startsWith("post."), true);
    const event = JSON.parse(delivery.body) as { name: string; workspace_id: string };
    assert.equal(event.workspace_id, workspaceId);
  } finally {
    await cleanup();
    await collector.stop();
  }
});
