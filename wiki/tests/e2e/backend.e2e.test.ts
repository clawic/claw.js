import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildWikiApp } from "../../src/server/app.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

async function boot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-test-"));
  const dbPath = path.join(tmpDir, "wiki.sqlite");
  const port = 14520 + Math.floor(Math.random() * 1000);

  const { app, config, store } = buildWikiApp({
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

  // Login to get admin token
  const loginRes = await fetch(`${baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@localhost", password: "admin" }),
  });
  const loginData = await loginRes.json() as { accessToken: string };
  const token = loginData.accessToken;

  const authFetch = (urlPath: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && typeof init.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${baseUrl}${urlPath}`, { ...init, headers });
  };

  return { baseUrl, token, authFetch, store };
}

test("health endpoint returns ok", async () => {
  const { baseUrl } = await boot();
  const res = await fetch(`${baseUrl}/v1/health`);
  assert.equal(res.status, 200);
  const body = await res.json() as { ok: boolean; service: string };
  assert.equal(body.ok, true);
  assert.equal(body.service, "wiki");
});

test("wiki ui serves shared brand assets and fonts", async () => {
  const { baseUrl } = await boot();
  const sharedPublicDir = path.resolve(process.cwd(), "..", "public");

  const indexRes = await fetch(`${baseUrl}/`);
  assert.equal(indexRes.status, 200);
  const indexHtml = await indexRes.text();
  assert.match(indexHtml, /href="\/brand\/favicon\.ico"/);

  const logoRes = await fetch(`${baseUrl}/brand/logo.png`);
  assert.equal(logoRes.status, 200);
  assert.deepEqual(
    Buffer.from(await logoRes.arrayBuffer()),
    fs.readFileSync(path.join(sharedPublicDir, "logo.png")),
  );

  const faviconRes = await fetch(`${baseUrl}/brand/favicon.ico`);
  assert.equal(faviconRes.status, 200);
  assert.deepEqual(
    Buffer.from(await faviconRes.arrayBuffer()),
    fs.readFileSync(path.join(sharedPublicDir, "favicon.ico")),
  );

  const fontRes = await fetch(`${baseUrl}/brand/fonts/source-sans-3/source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2`);
  assert.equal(fontRes.status, 200);
  assert.deepEqual(
    Buffer.from(await fontRes.arrayBuffer()),
    fs.readFileSync(path.join(sharedPublicDir, "fonts", "source-sans-3", "source-sans-3-v18-cyrillic_latin_latin-ext-regular.woff2")),
  );
});

test("admin login works", async () => {
  const { baseUrl } = await boot();
  const res = await fetch(`${baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@localhost", password: "admin" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { accessToken: string };
  assert.ok(body.accessToken);
});

test("default space exists", async () => {
  const { authFetch } = await boot();
  const res = await authFetch("/v1/spaces");
  assert.equal(res.status, 200);
  const body = await res.json() as { items: Array<{ slug: string }> };
  assert.ok(body.items.some((s) => s.slug === "main"));
});

test("page CRUD lifecycle", async () => {
  const { authFetch, store } = await boot();
  const spaceId = store.listSpaces()[0].id;

  // Create
  const createRes = await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({
      title: "Authentication Flow",
      body: "# Auth\n\nOAuth 2.0 with PKCE. See also [[token-refresh]].",
      tags: ["auth", "security"],
    }),
  });
  assert.equal(createRes.status, 201);
  const page = await createRes.json() as { slug: string; id: string; title: string; tags: string[] };
  assert.equal(page.title, "Authentication Flow");
  assert.equal(page.slug, "authentication-flow");
  assert.deepEqual(page.tags, ["auth", "security"]);

  // Read
  const getRes = await authFetch(`/v1/spaces/${spaceId}/pages/${page.slug}`);
  assert.equal(getRes.status, 200);

  // Update
  const updateRes = await authFetch(`/v1/spaces/${spaceId}/pages/${page.slug}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: "# Auth\n\nUpdated: OAuth 2.0 with PKCE and refresh tokens.",
      changeSummary: "Added refresh token info",
    }),
  });
  assert.equal(updateRes.status, 200);

  // List
  const listRes = await authFetch(`/v1/spaces/${spaceId}/pages`);
  assert.equal(listRes.status, 200);
  const list = await listRes.json() as { items: unknown[]; total: number };
  assert.ok(list.total >= 1);

  // Revisions
  const revsRes = await authFetch(`/v1/spaces/${spaceId}/pages/${page.slug}/revisions`);
  assert.equal(revsRes.status, 200);
  const revs = await revsRes.json() as { items: Array<{ revisionNumber: number }> };
  assert.ok(revs.items.length >= 2);

  // Delete
  const delRes = await authFetch(`/v1/spaces/${spaceId}/pages/${page.slug}`, { method: "DELETE" });
  assert.equal(delRes.status, 200);
  const delBody = await delRes.json() as { ok: boolean };
  assert.equal(delBody.ok, true);
});

test("comments on a page", async () => {
  const { authFetch, store } = await boot();
  const spaceId = store.listSpaces()[0].id;

  // Create page
  await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({ title: "Test Page" }),
  });

  // Add comment
  const commentRes = await authFetch(`/v1/spaces/${spaceId}/pages/test-page/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "Great article!", authorAgentId: "wiki-agent" }),
  });
  assert.equal(commentRes.status, 201);
  const comment = await commentRes.json() as { id: string; body: string };
  assert.equal(comment.body, "Great article!");

  // List comments
  const listRes = await authFetch(`/v1/spaces/${spaceId}/pages/test-page/comments`);
  const comments = await listRes.json() as { items: unknown[] };
  assert.equal(comments.items.length, 1);

  // Upvote
  const upvoteRes = await authFetch(`/v1/comments/${comment.id}/upvote`, { method: "POST" });
  assert.equal(upvoteRes.status, 200);
  const upvoted = await upvoteRes.json() as { upvotes: number };
  assert.equal(upvoted.upvotes, 1);
});

test("links and backlinks", async () => {
  const { authFetch, store } = await boot();
  const spaceId = store.listSpaces()[0].id;

  // Create two pages
  const page1Res = await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({ title: "Page Alpha" }),
  });
  const page1 = await page1Res.json() as { id: string; slug: string };

  const page2Res = await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({ title: "Page Beta" }),
  });
  const page2 = await page2Res.json() as { id: string; slug: string };

  // Create link
  const linkRes = await authFetch("/v1/links", {
    method: "POST",
    body: JSON.stringify({
      sourcePageId: page1.id,
      targetPageId: page2.id,
      linkType: "related",
    }),
  });
  assert.equal(linkRes.status, 201);

  // Check backlinks on page2
  const backlinksRes = await authFetch(`/v1/spaces/${spaceId}/pages/${page2.slug}/backlinks`);
  assert.equal(backlinksRes.status, 200);
  const backlinks = await backlinksRes.json() as { items: Array<{ id: string }>; links: unknown[] };
  assert.equal(backlinks.items.length, 1);
});

test("FTS search returns results", async () => {
  const { authFetch, store } = await boot();
  const spaceId = store.listSpaces()[0].id;

  await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({
      title: "OAuth Configuration",
      body: "Configure OAuth providers for authentication with PKCE flow.",
    }),
  });

  const searchRes = await authFetch(`/v1/search/fts?q=OAuth+PKCE`);
  assert.equal(searchRes.status, 200);
  const results = await searchRes.json() as { items: Array<{ page: { title: string } }> };
  assert.ok(results.items.length >= 1);
  assert.ok(results.items.some((r) => r.page.title === "OAuth Configuration"));
});

test("wikilinks auto-create link entries", async () => {
  const { authFetch, store } = await boot();
  const spaceId = store.listSpaces()[0].id;

  // Create target page first
  await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({ title: "Token Refresh", slug: "token-refresh" }),
  });

  // Create page that links to it
  await authFetch(`/v1/spaces/${spaceId}/pages`, {
    method: "POST",
    body: JSON.stringify({
      title: "Auth Overview",
      body: "See [[token-refresh]] for details.",
    }),
  });

  // Check backlinks on token-refresh
  const backlinksRes = await authFetch(`/v1/spaces/${spaceId}/pages/token-refresh/backlinks`);
  const backlinks = await backlinksRes.json() as { items: Array<{ slug: string }>; links: Array<{ linkType: string }> };
  assert.ok(backlinks.items.length >= 1);
  assert.ok(backlinks.links.some((l) => l.linkType === "wikilink"));
});
