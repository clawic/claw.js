import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWikiApp } from "../../src/server/app.ts";
import { WikiApiClient } from "../../src/cli/client.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

async function boot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-cli-test-"));
  const dbPath = path.join(tmpDir, "clawjs.sqlite");
  const port = 15520 + Math.floor(Math.random() * 1000);

  const { app } = buildWikiApp({
    config: {
      host: "127.0.0.1",
      port,
      dbPath,
      dataDir: tmpDir,
      jwtSecret: "test-secret",
    },
  });

  await app.listen({ host: "127.0.0.1", port });
  const baseUrl = `http://127.0.0.1:${port}`;

  cleanup = async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  const client = new WikiApiClient({ baseUrl });

  // Login
  const loginResult = await client.login("admin@localhost", "admin") as { accessToken: string };
  const authedClient = new WikiApiClient({ baseUrl, token: loginResult.accessToken });

  return { baseUrl, client, authedClient, tmpDir };
}

test("CLI client: login", async () => {
  const { client } = await boot();
  const result = await client.login("admin@localhost", "admin") as { accessToken: string };
  assert.ok(result.accessToken);
});

test("CLI client: list spaces", async () => {
  const { authedClient } = await boot();
  const result = await authedClient.listSpaces() as { items: Array<{ slug: string }> };
  assert.ok(result.items.some((s) => s.slug === "main"));
});

test("CLI client: page create and get", async () => {
  const { authedClient } = await boot();
  const spaces = await authedClient.listSpaces() as { items: Array<{ id: string }> };
  const spaceId = spaces.items[0].id;

  await authedClient.createPage(spaceId, {
    title: "CLI Test Page",
    body: "Created via CLI client",
    tags: ["cli", "test"],
  });

  const page = await authedClient.getPage(spaceId, "cli-test-page") as {
    title: string;
    body: string;
    tags: string[];
  };
  assert.equal(page.title, "CLI Test Page");
  assert.equal(page.body, "Created via CLI client");
});

test("CLI client: search", async () => {
  const { authedClient } = await boot();
  const spaces = await authedClient.listSpaces() as { items: Array<{ id: string }> };
  const spaceId = spaces.items[0].id;

  await authedClient.createPage(spaceId, {
    title: "Search Target Page",
    body: "This page contains unique keyword xylophone for testing",
  });

  const result = await authedClient.searchFts("xylophone") as { items: Array<{ page: { title: string } }> };
  assert.ok(result.items.length >= 1);
});

test("CLI client: import markdown files", async () => {
  const { authedClient, tmpDir } = await boot();
  const spaces = await authedClient.listSpaces() as { items: Array<{ id: string }> };
  const spaceId = spaces.items[0].id;

  // Create markdown files
  const importDir = path.join(tmpDir, "import");
  fs.mkdirSync(importDir);
  fs.writeFileSync(path.join(importDir, "getting-started.md"), "# Getting Started\n\nWelcome to the wiki.");
  fs.writeFileSync(path.join(importDir, "api-reference.md"), "# API Reference\n\nEndpoints listed below.");

  const result = await authedClient.importDir(spaceId, importDir) as { imported: number };
  assert.equal(result.imported, 2);

  // Verify pages exist
  const pages = await authedClient.listPages(spaceId) as { items: unknown[] };
  assert.ok((pages.items as Array<{ title: string }>).length >= 2);
});
