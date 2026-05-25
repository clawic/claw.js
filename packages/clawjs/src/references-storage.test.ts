import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import type { ReferenceManifest } from "./references/schema.ts";
import { readReference, referenceDir, writeReference } from "./references/storage.ts";

test("reference storage rejects ids that escape the references root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-reference-id-"));
  const now = new Date().toISOString();
  const validManifest: ReferenceManifest = {
    schemaVersion: 1,
    id: "image.brand-reference-1234",
    type: "image",
    name: "Brand Reference",
    tags: [],
    styleIds: [],
    createdAt: now,
    updatedAt: now,
  };

  const validResult = writeReference(root, validManifest);
  assert.equal(validResult.path, path.join(root, ".claw", "references", "image.brand-reference-1234", "REFERENCE.md"));
  assert.equal(readReference(root, "image.brand-reference-1234").id, "image.brand-reference-1234");

  const outsideName = `${path.basename(root)}-escaped-reference`;
  const traversalId = `../../../${outsideName}`;
  const outsideWorkspacePath = path.resolve(root, ".claw", "references", traversalId, "REFERENCE.md");
  const absoluteId = path.join(os.tmpdir(), `${path.basename(root)}-absolute-reference`);

  for (const unsafeId of ["../outside-reference", traversalId, absoluteId]) {
    assert.throws(() => referenceDir(root, unsafeId), /Invalid reference id/);
    assert.throws(() => readReference(root, unsafeId), /Invalid reference id/);
    assert.throws(() => writeReference(root, { ...validManifest, id: unsafeId }), /Invalid reference id/);
  }

  assert.equal(fs.existsSync(outsideWorkspacePath), false);
  assert.equal(fs.existsSync(path.dirname(outsideWorkspacePath)), false);
});
