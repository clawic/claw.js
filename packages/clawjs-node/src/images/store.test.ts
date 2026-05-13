import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
import { once } from "events";

import { createImageLibraryStore } from "./store.ts";

const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7KJcsAAAAASUVORK5CYII=";

async function createFakeOpenAIImageServer() {
  const requests: Array<{ pathname: string; body: Record<string, unknown> }> = [];
  const server = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      requests.push({ pathname: url.pathname, body });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: `req-${requests.length}`,
        data: [{
          b64_json: ONE_PIXEL_PNG,
          revised_prompt: `revised:${String(body.prompt ?? "")}`,
        }],
        usage: { images: 1 },
      }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address);
  const info = address as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${info.port}/v1`,
    requests,
    async close() {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

test("image library creates, edits, imports, and preserves immutable lineage", async () => {
  const server = await createFakeOpenAIImageServer();
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-image-library-"));
  const importPath = path.join(rootDir, "codex.png");
  fs.writeFileSync(importPath, Buffer.from(ONE_PIXEL_PNG, "base64"));

  try {
    const store = createImageLibraryStore({
      rootDir,
      allowEnvCredentials: true,
      openaiBaseUrl: server.baseUrl,
      env: { OPENAI_API_KEY: "test-key" },
      scope: { project: "demo", workspaceId: "workspace-a", agentId: "agent-a" },
    });

    const created = await store.create({
      prompt: "logo mark",
      imageType: "logo",
      tags: ["brand"],
      metadata: { size: "1024x1024" },
    });

    assert.equal(created.operation, "create");
    assert.equal(created.model, "gpt-image-1.5");
    assert.equal(created.imageType, "logo");
    assert.equal(created.output?.exists, true);
    assert.equal(created.output?.hash?.length, 64);
    assert.equal(created.editDepth, 0);

    const edited = await store.edit({
      parentId: created.id,
      prompt: "make it monochrome",
      tags: ["brand", "mono"],
    });

    assert.equal(edited.operation, "edit");
    assert.equal(edited.parentId, created.id);
    assert.deepEqual(edited.sourceImageIds, [created.id]);
    assert.equal(edited.editDepth, 1);
    assert.equal(store.get(created.id)?.prompt, "logo mark");

    const imported = store.importImage({
      filePath: importPath,
      prompt: "Codex generated a variant",
      title: "Codex variant",
      provenance: "imported-codex",
      externalGenerator: "codex",
      imageType: "logo",
      tags: ["codex"],
      parentId: edited.id,
      sourceImageIds: [edited.id],
      operation: "edit",
    });

    assert.equal(imported.provenance, "imported-codex");
    assert.equal(imported.parentId, edited.id);
    assert.equal(imported.editDepth, 2);
    assert.equal(store.search({ query: "codex" }).length, 1);
    assert.equal(store.list({ imageType: "logo" }).length, 3);
    assert.equal(server.requests.map((entry) => entry.pathname).join(","), "/v1/images/generations,/v1/images/edits");
  } finally {
    await server.close();
  }
});
