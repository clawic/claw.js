import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createAppsStore } from "./store.ts";

test("apps writeFile rejects invalid base64 without writing corrupt bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-apps-store-"));
  const store = createAppsStore({
    rootDir: path.join(root, "apps"),
    dbPath: path.join(root, "core.sqlite"),
  });
  const app = store.create({ name: "Write Test", slug: "write-test", indexHtml: "<!doctype html>" });

  const utf8Write = store.writeFile({
    appId: app.id,
    path: "plain.txt",
    content: "plain text",
  });
  assert.equal(fs.readFileSync(utf8Write.absolutePath, "utf8"), "plain text");

  const binary = Buffer.from([0, 1, 2, 253, 254, 255]);
  const base64Write = store.writeFile({
    slug: app.slug,
    path: "binary.bin",
    content: binary.toString("base64"),
    encoding: "base64",
  });
  assert.deepEqual(fs.readFileSync(base64Write.absolutePath), binary);

  const invalidPath = path.join(root, "apps", app.slug, "invalid.bin");
  assert.throws(
    () => store.writeFile({
      appId: app.id,
      path: "invalid.bin",
      content: "not valid base64!!!",
      encoding: "base64",
    }),
    /Invalid app file content: payload must be valid base64/,
  );
  assert.equal(fs.existsSync(invalidPath), false);

  assert.throws(
    () => store.writeFile({
      appId: app.id,
      path: "binary.bin",
      content: "abcde",
      encoding: "base64",
    }),
    /Invalid app file content: payload must be valid base64/,
  );
  assert.deepEqual(fs.readFileSync(base64Write.absolutePath), binary);
});
