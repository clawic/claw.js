import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { builtinStyleManifests } from "./styles/builtins.ts";
import { styleDir, writeStyle } from "./styles/storage.ts";

test("style storage rejects ids that escape the styles root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claw-style-invalid-id-"));
  const workspaceRoot = path.join(root, "workspace");
  const seed = builtinStyleManifests()[0]!;

  assert.throws(
    () => styleDir(workspaceRoot, "../outside-style"),
    /Invalid style id: \.\.\/outside-style/,
  );
  assert.throws(
    () => writeStyle(workspaceRoot, { ...seed, id: "../outside-style", builtin: false }),
    /Invalid style id: \.\.\/outside-style/,
  );
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "outside-style")), false);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".claw", "styles")), false);
});
