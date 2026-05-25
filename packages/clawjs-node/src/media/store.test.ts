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
