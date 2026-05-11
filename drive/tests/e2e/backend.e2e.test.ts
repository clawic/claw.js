import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildDriveApp } from "../../src/server/app.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

async function boot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-test-"));
  const port = 16200 + Math.floor(Math.random() * 1000);
  const dbPath = path.join(tmpDir, "drive.sqlite");

  const { app } = await buildDriveApp({
    config: {
      host: "127.0.0.1",
      port,
      dbPath,
      dataDir: tmpDir,
      jwtSecret: "drive-test-secret",
      converterMode: "mock",
      uiDistDir: path.join(process.cwd(), "ui", "dist"),
      publicBaseUrl: `http://127.0.0.1:${port}`,
    },
  });

  await app.listen({ host: "127.0.0.1", port });
  const baseUrl = `http://127.0.0.1:${port}`;

  cleanup = async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  const loginResponse = await fetch(`${baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@localhost", password: "admin" }),
  });
  const login = await loginResponse.json() as { accessToken: string };

  const authFetch = (urlPath: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${login.accessToken}`);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }
    return fetch(`${baseUrl}${urlPath}`, { ...init, headers });
  };

  return { baseUrl, authFetch, token: login.accessToken, tmpDir };
}

test("health and login work", async () => {
  const { baseUrl } = await boot();
  const health = await fetch(`${baseUrl}/v1/health`);
  assert.equal(health.status, 200);
  const body = await health.json() as { service: string; converterMode: string };
  assert.equal(body.service, "drive");
  assert.equal(body.converterMode, "mock");
});

test("native folder/doc/sheet/slide flows persist and revision conflicts are enforced", async () => {
  const { authFetch } = await boot();

  const folderResponse = await authFetch("/v1/items", {
    method: "POST",
    body: JSON.stringify({ kind: "folder", name: "Launch assets" }),
  });
  const folder = await folderResponse.json() as { id: string; name: string };
  assert.equal(folder.name, "Launch assets");

  const docResponse = await authFetch("/v1/items", {
    method: "POST",
    body: JSON.stringify({ kind: "doc", name: "Narrative", parentId: folder.id }),
  });
  const doc = await docResponse.json() as { id: string; currentRevisionId: string | null };
  assert.ok(doc.currentRevisionId);

  const docDetailResponse = await authFetch(`/v1/items/${doc.id}`);
  const docDetail = await docDetailResponse.json() as {
    currentRevisionId: string | null;
    content: { kind: "doc"; blocks: Array<{ id: string; type: string; text?: string }> };
  };
  docDetail.content.blocks[1].text = "Updated launch narrative";

  const saveResponse = await authFetch(`/v1/items/${doc.id}/content`, {
    method: "POST",
    body: JSON.stringify({
      baseRevisionId: docDetail.currentRevisionId,
      content: docDetail.content,
      summary: "Rewrite",
    }),
  });
  assert.equal(saveResponse.status, 200);

  const conflictResponse = await authFetch(`/v1/items/${doc.id}/content`, {
    method: "POST",
    body: JSON.stringify({
      baseRevisionId: docDetail.currentRevisionId,
      content: docDetail.content,
    }),
  });
  assert.equal(conflictResponse.status, 409);

  const revisionResponse = await authFetch(`/v1/items/${doc.id}/revisions`);
  const revisions = await revisionResponse.json() as { items: Array<{ id: string }> };
  assert.equal(revisions.items.length >= 2, true);

  const commentResponse = await authFetch(`/v1/items/${doc.id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "Looks ready for review." }),
  });
  assert.equal(commentResponse.status, 201);

  const sheetResponse = await authFetch("/v1/items", {
    method: "POST",
    body: JSON.stringify({ kind: "sheet", name: "Budget", parentId: folder.id }),
  });
  const sheet = await sheetResponse.json() as { id: string };
  const sheetDetail = await (await authFetch(`/v1/items/${sheet.id}`)).json() as {
    currentRevisionId: string | null;
    content: { kind: "sheet"; tabs: Array<{ rows: string[][] }> };
  };
  sheetDetail.content.tabs[0].rows[1][3] = "=1+2";
  assert.equal((await authFetch(`/v1/items/${sheet.id}/content`, {
    method: "POST",
    body: JSON.stringify({ baseRevisionId: sheetDetail.currentRevisionId, content: sheetDetail.content }),
  })).status, 200);

  const slideResponse = await authFetch("/v1/items", {
    method: "POST",
    body: JSON.stringify({ kind: "slide", name: "Deck", parentId: folder.id }),
  });
  const slide = await slideResponse.json() as { id: string };
  const slideDetail = await (await authFetch(`/v1/items/${slide.id}`)).json() as {
    currentRevisionId: string | null;
    content: { kind: "slide"; slides: Array<{ title: string; body: string }> };
  };
  slideDetail.content.slides[0].body = "Slide body";
  assert.equal((await authFetch(`/v1/items/${slide.id}/content`, {
    method: "POST",
    body: JSON.stringify({ baseRevisionId: slideDetail.currentRevisionId, content: slideDetail.content }),
  })).status, 200);

  const listResponse = await authFetch(`/v1/items?view=my-drive&parentId=${folder.id}`);
  const listed = await listResponse.json() as { items: Array<{ kind: string }> };
  assert.deepEqual(listed.items.map((item) => item.kind).sort(), ["doc", "sheet", "slide"]);
});

test("uploads, shares, download, search, trash, restore, copy, and export work", async () => {
  const { authFetch, baseUrl } = await boot();

  const form = new FormData();
  form.set("file", new Blob([Buffer.from("Quarterly notes for launch review", "utf8")]), "notes.txt");
  const uploadResponse = await authFetch("/v1/uploads", { method: "POST", body: form });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json() as { id: string; previewText: string };
  assert.match(uploaded.previewText, /Quarterly/);

  const shareResponse = await authFetch(`/v1/items/${uploaded.id}/shares`, {
    method: "POST",
    body: JSON.stringify({ label: "Agent reviewer" }),
  });
  assert.equal(shareResponse.status, 201);
  const share = await shareResponse.json() as { token: string; url: string };
  assert.match(share.url, /share=/);

  const sharedRead = await fetch(`${baseUrl}/v1/items/${uploaded.id}?token=${share.token}`);
  assert.equal(sharedRead.status, 200);

  const downloadResponse = await authFetch(`/v1/items/${uploaded.id}/download`);
  assert.equal(downloadResponse.status, 200);
  assert.equal(Buffer.from(await downloadResponse.arrayBuffer()).toString("utf8"), "Quarterly notes for launch review");

  const searchResponse = await authFetch("/v1/items?view=my-drive&q=quarterly");
  const search = await searchResponse.json() as { items: Array<{ id: string }> };
  assert.ok(search.items.some((item) => item.id === uploaded.id));

  const copyResponse = await authFetch(`/v1/items/${uploaded.id}/copy`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(copyResponse.status, 200);
  const copied = await copyResponse.json() as { id: string };
  assert.notEqual(copied.id, uploaded.id);

  const trashResponse = await authFetch(`/v1/items/${uploaded.id}/trash`, { method: "POST" });
  assert.equal(trashResponse.status, 200);
  const trashList = await (await authFetch("/v1/items?view=trash")).json() as { items: Array<{ id: string }> };
  assert.ok(trashList.items.some((item) => item.id === uploaded.id));

  const restoreResponse = await authFetch(`/v1/items/${uploaded.id}/restore`, { method: "POST" });
  assert.equal(restoreResponse.status, 200);

  const docResponse = await authFetch("/v1/items", {
    method: "POST",
    body: JSON.stringify({ kind: "doc", name: "Exportable doc" }),
  });
  const doc = await docResponse.json() as { id: string };
  const exportResponse = await authFetch(`/v1/items/${doc.id}/export?format=pdf`);
  assert.equal(exportResponse.status, 200);
  assert.match(Buffer.from(await exportResponse.arrayBuffer()).toString("utf8"), /Mock PDF export/);
});

test("agent share revoke writes one audit event", async () => {
  const { authFetch } = await boot();

  const form = new FormData();
  form.set("file", new Blob([Buffer.from("Agent share audit check", "utf8")]), "agent-share.txt");
  const uploadResponse = await authFetch("/v1/uploads", { method: "POST", body: form });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json() as { id: string };

  const shareResponse = await authFetch(`/v1/items/${uploaded.id}/shares`, {
    method: "POST",
    body: JSON.stringify({
      mode: "agent",
      capabilityKind: "drive.item.read",
      ttlMinutes: 10,
      agentName: "agent",
    }),
  });
  assert.equal(shareResponse.status, 201);
  const share = await shareResponse.json() as { record: { id: string } };

  const revokeResponse = await authFetch(`/v1/items/${uploaded.id}/shares/${share.record.id}/revoke`, {
    method: "POST",
  });
  assert.equal(revokeResponse.status, 200);

  const auditResponse = await authFetch(`/v1/audit?itemId=${uploaded.id}&limit=20`);
  assert.equal(auditResponse.status, 200);
  const auditLog = await auditResponse.json() as { items: Array<{ kind: string; metadata?: { shareId?: string } }> };
  const matchingRevokes = auditLog.items.filter((item) => (
    item.kind === "share_revoked" && item.metadata?.shareId === share.record.id
  ));
  assert.equal(matchingRevokes.length, 1);
});

test("scoped tokens can read lists after creation", async () => {
  const { authFetch, baseUrl } = await boot();

  const tokenResponse = await authFetch("/v1/tokens", {
    method: "POST",
    body: JSON.stringify({ label: "agent", operations: ["items:read"] }),
  });
  assert.equal(tokenResponse.status, 201);
  const token = await tokenResponse.json() as { token: string; record: { id: string } };

  const listResponse = await fetch(`${baseUrl}/v1/items?view=my-drive`, {
    headers: { authorization: `Bearer ${token.token}` },
  });
  assert.equal(listResponse.status, 200);

  const revokeResponse = await authFetch(`/v1/tokens/${token.record.id}/revoke`, { method: "POST" });
  assert.equal(revokeResponse.status, 200);
});
