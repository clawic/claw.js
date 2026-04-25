import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { libraryAssetSchema } from "@clawjs/core";
import { createLocalLibraryStore } from "./store.ts";

test("local library store persists assets, content, and assignments", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-store-"));
  const store = createLocalLibraryStore({ rootDir });

  const instruction = store.createInstruction({
    id: "ceo-soul",
    title: "CEO Soul",
    tags: ["leadership", "ceo"],
    autoApplyTags: ["executive"],
    projection: { target: "soul" },
    content: "Operate with context, judgment, and ownership.",
  });
  const skill = store.importSkill("workspace:namecheap", {
    id: "namecheap",
    source: "workspace",
    tags: ["domains"],
  });
  const bundle = store.createBundle({
    id: "founder-operator",
    title: "Founder Operator",
    bundleAssetIds: [instruction.id, skill.id],
  });

  assert.equal(libraryAssetSchema.safeParse(instruction).success, true);
  assert.equal(store.readContent(instruction), "Operate with context, judgment, and ownership.");
  assert.deepEqual(store.list().map((asset) => asset.id), ["ceo-soul", "founder-operator", "namecheap"]);

  store.assign({ assetId: bundle.id, scope: "agent", targetId: "ada" });
  const resolved = store.resolve({ agentId: "ada", tags: ["executive"] });
  assert.deepEqual(resolved.assets.map((asset) => asset.id), ["ceo-soul", "founder-operator", "namecheap"]);
  assert.equal(resolved.assets.find((asset) => asset.id === "ceo-soul")?.includedBy.includes("tag"), true);
  assert.equal(resolved.assets.find((asset) => asset.id === "namecheap")?.includedBy.includes("bundle"), true);
});

test("explicit exclusions win and missing secrets are reported without values", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-secrets-"));
  const store = createLocalLibraryStore({ rootDir });

  store.create({
    id: "namecheap",
    kind: "skill",
    title: "Namecheap",
    tags: ["domains"],
    requiredSecrets: [{
      name: "namecheap_api_token",
      label: "Namecheap API token",
      allowedHosts: ["api.namecheap.com"],
      allowedHeaders: ["Authorization"],
      readOnly: true,
    }],
    source: { source: "workspace", installRef: "namecheap" },
  });
  store.assign({ assetId: "namecheap", scope: "agent", targetId: "ops" });

  const missing = store.resolve({ agentId: "ops" });
  assert.deepEqual(missing.missingSecrets, [{
    assetId: "namecheap",
    name: "namecheap_api_token",
    label: "Namecheap API token",
  }]);
  assert.equal(JSON.stringify(missing).includes("secret-value"), false);

  store.assign({ assetId: "namecheap", scope: "agent", targetId: "ops", mode: "exclude" });
  const excluded = store.resolve({ agentId: "ops", availableSecrets: ["namecheap_api_token"] });
  assert.deepEqual(excluded.assets, []);
});
