import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { TestContext } from "vitest";

import { createLocalStorageStore } from "./store.ts";

function useIsolatedStorageDataDir(t: TestContext, workspaceDir: string): void {
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

test("local storage scopes objects by agent prefix and rejects unsafe keys", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });

  const object = storage.writeText({ key: "notes/plan.txt", content: "ship storage" });

  assert.equal(object.bucket, "workspace");
  assert.equal(object.key, "agents/agent-a/notes/plan.txt");
  assert.equal(storage.readText({ key: "notes/plan.txt" }), "ship storage");
  assert.equal(storage.list().length, 1);
  assert.throws(() => storage.writeText({ key: "../escape.txt", content: "no" }), /Invalid storage key/);
});

test("local storage enforces grants between agents and supports tokens", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-grants-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  const agentA = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  const agentB = createLocalStorageStore({ workspaceDir, agentId: "agent-b" });

  agentA.writeText({ key: "handoff.txt", content: "private" });

  assert.throws(() => agentB.readText({ key: "agents/agent-a/handoff.txt" }), /not allowed/);

  const issued = agentA.issueToken({
    label: "reader",
    grants: [{
      bucket: "workspace",
      prefix: "agents/agent-a/",
      operations: ["objects:list", "objects:read"],
    }],
  });

  assert.ok(issued.token.startsWith("stg_tok_"));
  assert.equal(agentA.listTokens()[0]?.id, issued.record.id);
  assert.equal(agentA.revokeToken(issued.record.id), true);
});

test("local storage shares through a configured adapter", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-share-"));
  useIsolatedStorageDataDir(t, workspaceDir);
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
        return {
          url: `https://share.local/${object.sha256}`,
          externalItemId: "item-1",
          externalShareId: "share-1",
        };
      },
      async revoke() {},
    },
  });

  storage.writeText({ key: "deliverable.txt", content: "done" });
  const share = await storage.createShare({ key: "deliverable.txt", label: "Deliverable" });

  assert.match(share.url, /share\.local/);
  assert.equal(await storage.revokeShare(share.id), true);
});
