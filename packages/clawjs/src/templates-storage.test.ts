import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import type { TemplateManifest } from "./templates/schema.ts";
import { readTemplate, templateDir, templateManifestPath, writeTemplate } from "./templates/storage.ts";

test("template storage rejects path traversal and absolute template ids", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-template-id-"));
  const now = new Date().toISOString();
  const validManifest: TemplateManifest = {
    schemaVersion: 1,
    id: "report.foo-1234",
    name: "Report Foo",
    category: "report",
    aspect: "16:9",
    tags: [],
    slots: [],
    variants: [{ id: "default", label: "Default" }],
    outputs: ["html"],
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };

  const validResult = writeTemplate(root, validManifest);
  assert.equal(validResult.path, path.join(root, ".claw", "templates", "report.foo-1234", "TEMPLATE.md"));
  assert.equal(readTemplate(root, "report.foo-1234").id, "report.foo-1234");

  const outsideName = `${path.basename(root)}-escaped`;
  const traversalId = `../../../${outsideName}`;
  const outsideWorkspacePath = path.resolve(root, ".claw", "templates", traversalId, "TEMPLATE.md");
  const absoluteId = path.join(os.tmpdir(), `${path.basename(root)}-absolute`);

  for (const unsafeId of ["../outside", traversalId, absoluteId]) {
    assert.throws(() => templateDir(root, unsafeId), /Invalid template id/);
    assert.throws(() => templateManifestPath(root, unsafeId), /Invalid template id/);
    assert.throws(() => readTemplate(root, unsafeId), /Invalid template id/);
    assert.throws(() => writeTemplate(root, { ...validManifest, id: unsafeId }), /Invalid template id/);
  }

  assert.equal(fs.existsSync(outsideWorkspacePath), false);
  assert.equal(fs.existsSync(path.dirname(outsideWorkspacePath)), false);
});
