import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { createSoulStore } from "./store.ts";

test("SoulStore rejects pre-v1 wrapped module state", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-soul-store-"));
  const store = createSoulStore({ workspaceDir });
  fs.mkdirSync(path.dirname(store.statePath), { recursive: true });
  fs.writeFileSync(store.statePath, `${JSON.stringify({
    schemaVersion: 1,
    specs: [{
      schemaVersion: 1,
      id: "default",
      title: "Default Soul",
      modules: {
        identity: {
          settings: { role: "operator" },
          directives: ["act clearly"],
        },
      },
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    }],
    assignments: [],
    updatedAt: "2026-05-17T00:00:00.000Z",
  }, null, 2)}\n`);

  assert.throws(() => store.readState(), /Unrecognized key|Required/);
});
