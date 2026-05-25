import assert from "node:assert/strict";
import { test } from "vitest";

import {
  resolveClawGlobalDataDir,
  resolveClawGlobalDataStorageDir,
  resolveClawPersistentSurfacePath,
} from "./index.ts";
import { resolveClawPersistentSurfacePath as resolveRegistrySurfacePath } from "./surface-registry.ts";

test("storage and surface path resolvers preserve UNC roots", () => {
  assert.equal(
    resolveClawGlobalDataDir({ homeDir: "\\\\server\\share\\Users\\demo", platform: "win32" }),
    "//server/share/Users/demo/.claw",
  );
  assert.equal(
    resolveClawGlobalDataStorageDir({ homeDir: "\\\\server\\share\\Users\\demo", clawHome: "~/custom-claw" }),
    "//server/share/Users/demo/custom-claw/data",
  );
  assert.equal(
    resolveClawPersistentSurfacePath("claw.workspace.styles", "//server/share/repo/app", "brand"),
    "//server/share/repo/app/.claw/styles/brand",
  );
  assert.equal(
    resolveRegistrySurfacePath("claw.workspace.styles", "//server/share/repo/app", "brand"),
    "//server/share/repo/app/.claw/styles/brand",
  );
});
