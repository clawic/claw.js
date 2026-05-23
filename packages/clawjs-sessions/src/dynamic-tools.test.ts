import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { SessionsServiceStore } from "./store.ts";

function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function schemaHash(schema: unknown): string {
  return createHash("sha256").update(JSON.stringify(schema)).digest("hex");
}

test("dynamic tools validate schema hashes and defer schemas by default", () => {
  const rootDir = tempRoot("clawjs-dynamic-tools-");
  const store = new SessionsServiceStore(path.join(rootDir, "sessions.sqlite"));
  try {
    store.createSession({ id: "session-tools", agent: "codex", title: "Tools", createdAt: 1 });
    const inputSchemaJson = { type: "object", properties: { prompt: { type: "string" } } };
    const tool = store.upsertSessionDynamicTool({
      sessionId: "session-tools",
      position: 0,
      name: "automation_update",
      namespace: "codex-cli",
      inputSchemaJson,
      schemaHash: schemaHash(inputSchemaJson),
      deferLoading: true,
      source: "fixture",
    });

    assert.equal(tool.schemaHash, schemaHash(inputSchemaJson));
    assert.deepEqual(store.listSessionDynamicTools("session-tools")[0]?.inputSchemaJson, null);
    assert.deepEqual(
      store.listSessionDynamicTools("session-tools", { includeDeferredSchemas: true })[0]?.inputSchemaJson,
      inputSchemaJson,
    );
    assert.throws(
      () => store.upsertSessionDynamicTool({
        sessionId: "session-tools",
        position: 1,
        name: "bad_tool",
        inputSchemaJson: { type: "object" },
        schemaHash: "not-the-schema-hash",
      }),
      /schema hash mismatch/,
    );
  } finally {
    store.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
