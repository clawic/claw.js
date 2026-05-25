import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { TestContext } from "vitest";

import { createWorkspaceStorage } from "../data/store.ts";
import { createLocalStorageStore } from "../storage/store.ts";
import { createMediaStore } from "./store.ts";

function useIsolatedDataDir(t: TestContext, workspaceDir: string): void {
  const previous = process.env.CLAW_DATA_DIR;
  process.env.CLAW_DATA_DIR = path.join(workspaceDir, ".data");
  t.after(() => {
    if (previous === undefined) {
      delete process.env.CLAW_DATA_DIR;
    } else {
      process.env.CLAW_DATA_DIR = previous;
    }
  });
}

test("media register rejects invalid base64 strings without corrupt stored bytes", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-base64-"));
  useIsolatedDataDir(t, workspaceDir);
  const dataStore = createWorkspaceStorage(workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  const media = createMediaStore({
    dataStore,
    storage,
    workspaceId: "workspace-a",
    agentId: "agent-a",
  });

  const validCases: Array<{ name: string; data: string | Uint8Array; expected: string }> = [
    { name: "buffer.txt", data: Buffer.from("buffer"), expected: "buffer" },
    { name: "uint8.txt", data: new Uint8Array(Buffer.from("uint8")), expected: "uint8" },
    { name: "base64.txt", data: Buffer.from("base64").toString("base64"), expected: "base64" },
    { name: "data-url.txt", data: `data:text/plain;base64,${Buffer.from("data-url").toString("base64")}`, expected: "data-url" },
  ];

  for (const valid of validCases) {
    const record = media.register({
      name: valid.name,
      mimeType: "text/plain",
      data: valid.data,
    });
    assert.equal(media.download(record.mediaId)?.buffer.toString("utf8"), valid.expected);
  }

  const invalidCases = [
    "not valid base64!!!",
    "abcde",
    "ab=c",
    "data:text/plain;base64",
    "data:text/plain;base64,",
  ];

  for (const invalid of invalidCases) {
    assert.throws(
      () => media.register({
        name: "invalid.txt",
        mimeType: "text/plain",
        data: invalid,
      }),
      /Invalid media data:/,
    );
  }

  assert.equal(media.list().length, validCases.length);
});

test("media shares require explicit approval and persistent legal labels", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-share-"));
  useIsolatedDataDir(t, workspaceDir);
  const dataStore = createWorkspaceStorage(workspaceDir);
  const storage = createLocalStorageStore({
    workspaceDir,
    agentId: "agent-a",
    grants: [{
      bucket: "workspace",
      prefix: "agents/agent-a/",
      operations: ["shares:create", "shares:revoke"],
    }],
    shareAdapter: {
      async create(object) {
        return { url: `https://share.local/${object.sha256}` };
      },
      async revoke() {},
    },
  });
  const media = createMediaStore({
    dataStore,
    storage,
    workspaceId: "workspace-a",
    agentId: "agent-a",
  });

  const record = media.register({
    name: "preview.txt",
    mimeType: "text/plain",
    data: Buffer.from("reviewed"),
  });

  await assert.rejects(
    () => media.createObjectShare({ mediaId: record.mediaId, label: "Preview" }),
    /requires explicit approvalId before export\/share/,
  );
  assert.throws(
    () => media.createGalleryShare({ label: "Gallery", approvalId: "approval_media_gallery" }),
    /requires a persistent legalLabel before export\/share/,
  );

  const objectShare = await media.createObjectShare({
    mediaId: record.mediaId,
    label: "Preview",
    legalLabel: "Exported media - human reviewed",
    approvalId: "approval_media_object",
  });
  const galleryShare = media.createGalleryShare({
    label: "Gallery",
    legalLabel: "Exported gallery - human reviewed",
    approvalId: "approval_media_gallery",
  });

  assert.equal(objectShare.legalLabel, "Exported media - human reviewed");
  assert.equal(objectShare.approvalId, "approval_media_object");
  assert.equal(galleryShare.legalLabel, "Exported gallery - human reviewed");
  assert.equal(galleryShare.approvalId, "approval_media_gallery");
});

test("media share ttlMs must be a positive safe integer", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-share-ttl-"));
  useIsolatedDataDir(t, workspaceDir);
  const dataStore = createWorkspaceStorage(workspaceDir);
  const storage = createLocalStorageStore({
    workspaceDir,
    agentId: "agent-a",
    grants: [{
      bucket: "workspace",
      prefix: "agents/agent-a/",
      operations: ["shares:create", "shares:revoke"],
    }],
    shareAdapter: {
      async create(object) {
        return { url: `https://share.local/${object.sha256}` };
      },
      async revoke() {},
    },
  });
  const media = createMediaStore({
    dataStore,
    storage,
    workspaceId: "workspace-a",
    agentId: "agent-a",
  });
  const record = media.register({
    name: "ttl.txt",
    mimeType: "text/plain",
    data: Buffer.from("ttl"),
  });
  const invalidTtls = [1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1];

  for (const ttlMs of invalidTtls) {
    assert.throws(
      () => media.createGalleryShare({
        label: "Gallery",
        legalLabel: "Exported gallery - human reviewed",
        approvalId: "approval_media_gallery_ttl",
        ttlMs,
      }),
      /Media share ttlMs must be a positive safe integer\./,
    );
    await assert.rejects(
      () => media.createObjectShare({
        mediaId: record.mediaId,
        label: "Object",
        legalLabel: "Exported media - human reviewed",
        approvalId: "approval_media_object_ttl",
        ttlMs,
      }),
      /Media share ttlMs must be a positive safe integer\./,
    );
  }

  const ttlMs = 60_000;
  const before = Date.now();
  const galleryShare = media.createGalleryShare({
    label: "Gallery",
    legalLabel: "Exported gallery - human reviewed",
    approvalId: "approval_media_gallery_ttl_valid",
    ttlMs,
  });
  const objectShare = await media.createObjectShare({
    mediaId: record.mediaId,
    label: "Object",
    legalLabel: "Exported media - human reviewed",
    approvalId: "approval_media_object_ttl_valid",
    ttlMs,
  });
  const after = Date.now();

  assert.ok(galleryShare.expiresAt);
  assert.ok(objectShare.expiresAt);
  assert.ok(Date.parse(galleryShare.expiresAt) >= before + ttlMs);
  assert.ok(Date.parse(galleryShare.expiresAt) <= after + ttlMs);
  assert.ok(Date.parse(objectShare.expiresAt) >= before + ttlMs);
  assert.ok(Date.parse(objectShare.expiresAt) <= after + ttlMs);
});

test("media gallery shares resolve the reviewed item snapshot", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-gallery-share-"));
  useIsolatedDataDir(t, workspaceDir);
  const dataStore = createWorkspaceStorage(workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  const media = createMediaStore({
    dataStore,
    storage,
    workspaceId: "workspace-a",
    agentId: "agent-a",
  });

  const reviewed = media.register({
    name: "reviewed.txt",
    mimeType: "text/plain",
    kind: "document",
    sourceText: "alpha reviewed document",
  });
  const share = media.createGalleryShare({
    label: "Reviewed alpha documents",
    legalLabel: "Exported gallery - human reviewed",
    approvalId: "approval_media_gallery_snapshot",
    filters: { kind: "document", query: "alpha" },
  });

  assert.deepEqual(media.resolveGalleryShare(share.id)?.items.map((item) => item.mediaId), [reviewed.mediaId]);

  media.register({
    name: "later.txt",
    mimeType: "text/plain",
    kind: "document",
    sourceText: "alpha added after approval",
  });

  assert.deepEqual(media.resolveGalleryShare(share.id)?.items.map((item) => item.mediaId), [reviewed.mediaId]);
});

test("media list rejects invalid date filters", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-media-date-filter-"));
  useIsolatedDataDir(t, workspaceDir);
  const dataStore = createWorkspaceStorage(workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  const media = createMediaStore({
    dataStore,
    storage,
    workspaceId: "workspace-a",
    agentId: "agent-a",
  });

  media.register({
    name: "dated.txt",
    mimeType: "text/plain",
    data: Buffer.from("dated"),
  });

  assert.throws(
    () => media.list({ from: "not-a-date" }),
    /Invalid media from filter: not-a-date/,
  );
  assert.throws(
    () => media.list({ to: "later-ish" }),
    /Invalid media to filter: later-ish/,
  );
});
