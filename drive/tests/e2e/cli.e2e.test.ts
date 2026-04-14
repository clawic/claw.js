import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildDriveApp } from "../../src/server/app.ts";
import { DriveApiClient } from "../../src/cli/client.ts";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

async function boot() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "drive-cli-test-"));
  const port = 17200 + Math.floor(Math.random() * 1000);

  const { app } = buildDriveApp({
    config: {
      host: "127.0.0.1",
      port,
      dataDir: tmpDir,
      dbPath: path.join(tmpDir, "drive.sqlite"),
      jwtSecret: "drive-cli-secret",
      converterMode: "mock",
      publicBaseUrl: `http://127.0.0.1:${port}`,
      uiDistDir: path.join(process.cwd(), "ui", "dist"),
    },
  });

  await app.listen({ host: "127.0.0.1", port });
  cleanup = async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  const client = new DriveApiClient({ baseUrl });
  const login = await client.login("admin@localhost", "admin");
  const authed = new DriveApiClient({ baseUrl, token: login.accessToken });

  return { tmpDir, client, authed };
}

test("CLI client login and bootstrap work", async () => {
  const { client, authed } = await boot();
  const login = await client.login("admin@localhost", "admin");
  assert.ok(login.accessToken);
  const bootstrap = await authed.bootstrap();
  assert.equal(typeof bootstrap.counts.myDrive, "number");
});

test("CLI client creates and saves native drive items", async () => {
  const { authed, tmpDir } = await boot();
  const doc = await authed.createItem({ kind: "doc", name: "CLI doc" });
  const detail = await authed.getItem(doc.id);
  assert.equal(detail.kind, "doc");

  const contentPath = path.join(tmpDir, "doc.json");
  const content = detail.content && detail.content.kind === "doc" ? detail.content : null;
  assert.ok(content);
  content.blocks[1].text = "Created from CLI";
  fs.writeFileSync(contentPath, JSON.stringify(content, null, 2));

  const saved = await authed.saveContent(doc.id, {
    baseRevisionId: detail.currentRevisionId,
    content: JSON.parse(fs.readFileSync(contentPath, "utf8")),
  });
  assert.match(saved.previewText, /Created from CLI/);
});

test("CLI client uploads, searches, and exports", async () => {
  const { authed, tmpDir } = await boot();
  const uploadPath = path.join(tmpDir, "brief.txt");
  fs.writeFileSync(uploadPath, "brief for agents");

  const uploaded = await authed.uploadFile({ filePath: uploadPath });
  assert.equal(uploaded.kind, "upload");

  const search = await authed.listItems({ view: "my-drive", query: "brief" });
  assert.ok(search.items.some((item) => item.id === uploaded.id));

  const doc = await authed.createItem({ kind: "doc", name: "Export me" });
  const exported = await authed.exportItem(doc.id, "docx");
  assert.match(exported.toString("utf8"), /Mock DOCX export/);
});

test("CLI client creates share links and scoped tokens", async () => {
  const { authed } = await boot();
  const doc = await authed.createItem({ kind: "doc", name: "Shared doc" });
  const share = await authed.createShare(doc.id, "CLI share");
  assert.match(share.url, /share=/);

  const token = await authed.createToken("reader", ["items:read"]);
  assert.ok(token.token.startsWith("drv_tok_"));
});
