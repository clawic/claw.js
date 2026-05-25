import assert from "node:assert/strict";
import http from "node:http";
import { test } from "vitest";

import { startRelayServiceProxy } from "./local.ts";

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return `http://127.0.0.1:${address!.port}`;
}

async function postSlowBody(url: string, delayMs: number): Promise<{ statusCode: number | undefined; body: string }> {
  return await new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request({
      method: "POST",
      hostname: target.hostname,
      port: Number(target.port),
      path: `${target.pathname}${target.search}`,
      headers: { "content-type": "application/octet-stream" },
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk.toString(); });
      response.on("end", () => resolve({ statusCode: response.statusCode, body }));
    });
    request.on("error", reject);
    request.write(Buffer.alloc(1024, "a"));
    setTimeout(() => {
      request.end(Buffer.alloc(1024, "b"));
    }, delayMs);
  });
}

test("local service proxy streams request bodies upstream without full buffering", async () => {
  let firstChunkMs = Number.POSITIVE_INFINITY;
  let elapsedMs = 0;
  let started = 0;
  const upstream = http.createServer((request, response) => {
    let size = 0;
    request.once("data", () => {
      firstChunkMs = performance.now() - started;
    });
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
    });
    request.on("end", () => {
      elapsedMs = performance.now() - started;
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ size }));
    });
  });
  const upstreamUrl = await listen(upstream);
  const bridge = await startRelayServiceProxy({
    relayUrl: "http://127.0.0.1:1",
    tenantId: "demo-tenant",
    serviceId: "example-service",
    email: "user@relay.local",
    password: "relay-user",
    uiUrl: upstreamUrl,
  });
  try {
    started = performance.now();
    const response = await postSlowBody(`${bridge.url}/slow-upload`, 150);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { size: 2048 });
    assert.ok(firstChunkMs < 100, `first upstream chunk waited ${firstChunkMs}ms`);
    assert.ok(elapsedMs >= 140, `slow upload fixture finished too quickly: ${elapsedMs}ms`);
  } finally {
    await bridge.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
