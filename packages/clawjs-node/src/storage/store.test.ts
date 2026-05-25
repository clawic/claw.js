import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { TestContext } from "vitest";
import Database from "better-sqlite3";

import { clawStorageApiRoutes } from "@clawjs/core";

import { startStorageHttpServer } from "./http.ts";
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
  assert.deepEqual(storage.list({ prefix: "notes" }).map((entry) => entry.key), ["agents/agent-a/notes/plan.txt"]);
  assert.throws(() => storage.writeText({ key: "../escape.txt", content: "no" }), /Invalid storage key/);
});

test("local storage list requires explicit limits to be positive safe integers", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-limit-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });

  storage.writeText({ key: "notes/a.txt", content: "a" });
  storage.writeText({ key: "notes/b.txt", content: "b" });

  assert.equal(storage.list().length, 2);
  assert.equal(storage.list({ limit: 1 }).length, 1);

  for (const limit of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    -1,
    1.9,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () => storage.list({ limit }),
      /Storage list limit must be a positive safe integer/,
    );
  }
});

test("storage HTTP rejects invalid object list limits before querying", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-http-limit-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  t.after(() => storage.close());

  storage.writeText({ key: "notes/a.txt", content: "a" });
  storage.writeText({ key: "notes/b.txt", content: "b" });
  const issued = storage.issueToken({
    label: "reader",
    grants: [{
      bucket: "workspace",
      prefix: "agents/agent-a/",
      operations: ["objects:list", "objects:read"],
    }],
  });
  const server = await startStorageHttpServer({ store: storage });
  t.after(() => server.close());

  const requestObjects = (limit: string) => fetch(`${server.url}${clawStorageApiRoutes.objects}?prefix=agents%2Fagent-a%2F&limit=${encodeURIComponent(limit)}`, {
    headers: { authorization: `Bearer ${issued.token}` },
  });

  const valid = await requestObjects("1");
  assert.equal(valid.status, 200);
  assert.equal(((await valid.json()) as { items: unknown[] }).items.length, 1);

  for (const limit of ["NaN", "0", "-1", "1.5", "9007199254740992"]) {
    const response = await requestObjects(limit);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_storage_limit" });
  }
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
  assert.throws(
    () => storage.exportToFile({ key: "deliverable.txt", filePath: path.join(workspaceDir, "deliverable.txt") }),
    /requires explicit approvalId before export\/share/,
  );
  const exported = storage.exportToFile({
    key: "deliverable.txt",
    filePath: path.join(workspaceDir, "deliverable.txt"),
    legalLabel: "Exported content - human reviewed",
    approvalId: "approval_storage_export",
  });
  assert.equal(exported?.key, "agents/agent-a/deliverable.txt");
  const legalManifest = JSON.parse(fs.readFileSync(path.join(workspaceDir, "deliverable.txt.claw-legal.json"), "utf8")) as {
    approvalId: string;
    legalLabel: string;
    policy: { decision: string; reasonCodes: string[]; requirements: string[]; outputLabels: string[] };
    source: { key: string };
  };
  assert.equal(legalManifest.approvalId, "approval_storage_export");
  assert.equal(legalManifest.legalLabel, "Exported content - human reviewed");
  assert.equal(legalManifest.policy.decision, "allow");
  assert.ok(legalManifest.policy.reasonCodes.includes("sensitive_export_review_required"));
  assert.ok(legalManifest.policy.requirements.includes("human_review"));
  assert.ok(legalManifest.policy.outputLabels.includes("regulated_domain:identity"));
  assert.equal(legalManifest.source.key, "agents/agent-a/deliverable.txt");

  await assert.rejects(
    () => storage.createShare({ key: "deliverable.txt", label: "Deliverable" }),
    /requires explicit approvalId before export\/share/,
  );
  const share = await storage.createShare({
    key: "deliverable.txt",
    label: "Deliverable",
    legalLabel: "Exported content - human reviewed",
    approvalId: "approval_storage_share",
  });

  assert.match(share.url, /share\.local/);
  assert.equal(share.legalLabel, "Exported content - human reviewed");
  assert.equal(share.approvalId, "approval_storage_share");
  assert.equal(await storage.revokeShare(share.id), true);
});

test("local storage indexes blob reference cleanup lookups", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-blob-indexes-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  t.after(() => storage.close());

  storage.writeText({ key: "notes/a.txt", content: "a" });

  const sqlite = new Database(path.join(workspaceDir, ".data", "drive.sqlite"));
  t.after(() => sqlite.close());

  const objectIndexes = sqlite.prepare("PRAGMA index_list(storage_objects)").all() as Array<{ name: string }>;
  assert.equal(objectIndexes.some((index) => index.name === "storage_objects_blob_path_idx"), true);

  const shareIndexes = sqlite.prepare("PRAGMA index_list(storage_shares)").all() as Array<{ name: string }>;
  assert.equal(shareIndexes.some((index) => index.name === "storage_shares_snapshot_blob_path_idx"), true);

  const objectPlan = sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) AS count FROM storage_objects WHERE blob_path = ?")
    .all("aa/blob") as Array<{ detail: string }>;
  assert.equal(objectPlan.some((row) => row.detail.includes("storage_objects_blob_path_idx")), true);
  assert.equal(objectPlan.some((row) => row.detail.includes("SCAN storage_objects")), false);

  const sharePlan = sqlite
    .prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) AS count FROM storage_shares WHERE snapshot_blob_path = ?")
    .all("bb/blob") as Array<{ detail: string }>;
  assert.equal(sharePlan.some((row) => row.detail.includes("storage_shares_snapshot_blob_path_idx")), true);
  assert.equal(sharePlan.some((row) => row.detail.includes("SCAN storage_shares")), false);
});

test("local storage indexes active token authentication lookups", (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-token-indexes-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  const storage = createLocalStorageStore({ workspaceDir, agentId: "agent-a" });
  t.after(() => storage.close());

  const issued = storage.issueOwnerToken({ label: "owner" });

  const sqlite = new Database(path.join(workspaceDir, ".data", "drive.sqlite"));
  t.after(() => sqlite.close());

  const tokenIndexes = sqlite.prepare("PRAGMA index_list(storage_tokens)").all() as Array<{ name: string }>;
  assert.equal(tokenIndexes.some((index) => index.name === "storage_tokens_token_hash_active_idx"), true);
  assert.equal(tokenIndexes.some((index) => index.name === "storage_tokens_owner_active_created_idx"), true);

  const tokenHash = sqlite
    .prepare("SELECT token_hash FROM storage_tokens WHERE id = ?")
    .get(issued.record.id) as { token_hash: string };
  const authPlan = sqlite
    .prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner
      FROM storage_tokens
      WHERE token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `)
    .all(tokenHash.token_hash) as Array<{ detail: string }>;
  assert.equal(authPlan.some((row) => row.detail.includes("storage_tokens_token_hash_active_idx")), true);
  assert.equal(authPlan.some((row) => row.detail.includes("SCAN storage_tokens")), false);

  const ownerPlan = sqlite
    .prepare(`
      EXPLAIN QUERY PLAN
      SELECT id, label, token_hash, grants_json, created_at, last_used_at, revoked_at, is_owner
      FROM storage_tokens
      WHERE is_owner = 1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .all() as Array<{ detail: string }>;
  assert.equal(ownerPlan.some((row) => row.detail.includes("storage_tokens_owner_active_created_idx")), true);
  assert.equal(ownerPlan.some((row) => row.detail.includes("USE TEMP B-TREE")), false);
});

test("local storage share ttlMs must be a positive safe integer", async (t) => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-storage-share-ttl-"));
  useIsolatedStorageDataDir(t, workspaceDir);
  let adapterCreateCalls = 0;
  const storage = createLocalStorageStore({
    workspaceDir,
    agentId: "agent-a",
    grants: [{
      bucket: "workspace",
      prefix: "agents/agent-a/",
      operations: ["shares:create"],
    }],
    shareAdapter: {
      async create(object) {
        adapterCreateCalls += 1;
        return { url: `https://share.local/${object.sha256}` };
      },
      async revoke() {},
    },
  });

  storage.writeText({ key: "deliverable.txt", content: "done" });
  for (const ttlMs of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(
      () => storage.createShare({
        key: "deliverable.txt",
        label: "Deliverable",
        legalLabel: "Exported content - human reviewed",
        approvalId: "approval_storage_share",
        ttlMs,
      }),
      /Storage share ttlMs must be a positive safe integer/,
    );
  }
  assert.equal(adapterCreateCalls, 0);

  const share = await storage.createShare({
    key: "deliverable.txt",
    label: "Deliverable",
    legalLabel: "Exported content - human reviewed",
    approvalId: "approval_storage_share",
    ttlMs: 1,
  });
  assert.ok(share.expiresAt);
  assert.equal(adapterCreateCalls, 1);
});
