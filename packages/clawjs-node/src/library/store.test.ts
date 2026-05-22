import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { libraryAssetSchema } from "@clawjs/core";
import { createLocalLibraryStore, resolveLibraryRoot } from "./store.ts";

test("library root uses shared surface path home expansion", () => {
  assert.equal(resolveLibraryRoot({ env: {} }), path.join(os.homedir(), ".claw", "library"));
  assert.equal(resolveLibraryRoot({ rootDir: "~", env: {} }), os.homedir());
  assert.equal(resolveLibraryRoot({ rootDir: "~/custom-library", env: {} }), path.join(os.homedir(), "custom-library"));
  assert.equal(resolveLibraryRoot({ env: { CLAW_LIBRARY_DIR: "~/env-library" } }), path.join(os.homedir(), "env-library"));
  assert.equal(resolveLibraryRoot({ env: { CLAW_HOME: "~/custom-claw" } }), path.join(os.homedir(), "custom-claw", "library"));
});

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

test("skill capsules validate length, prefer skill.json, and sort by priority then assignment order", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-capsules-"));
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-capsule-source-"));
  const store = createLocalLibraryStore({ rootDir });
  fs.writeFileSync(path.join(sourceDir, "skill.json"), JSON.stringify({
    id: "json-skill",
    name: "JSON Skill",
    context: {
      priority: 5,
      capsule: "Use the JSON capsule.",
      readWhen: ["json metadata"],
    },
  }, null, 2));
  fs.writeFileSync(path.join(sourceDir, "SKILL.md"), [
    "---",
    "name: json-skill",
    "description: demo",
    "clawjs-context:",
    "  priority: 1",
    "  capsule: Use the frontmatter capsule.",
    "---",
    "",
    "# JSON Skill",
  ].join("\n"));
  const invalidSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-library-capsule-invalid-"));
  fs.writeFileSync(path.join(invalidSourceDir, "SKILL.md"), [
    "---",
    "name: invalid-skill",
    "clawjs-context:",
    "  priority: 1",
    `  capsule: ${"x".repeat(301)}`,
    "---",
    "",
    "# Invalid Skill",
  ].join("\n"));

  store.importSkill("json-skill", { id: "json-skill", path: sourceDir });
  store.importSkill("invalid-skill", { id: "invalid-skill", path: invalidSourceDir });
  store.create({ id: "missing-context", kind: "skill", title: "Missing Context" });
  store.create({
    id: "same-b",
    kind: "skill",
    title: "Same B",
    context: { capsule: "Same B", priority: 20 },
  });
  store.create({
    id: "same-a",
    kind: "skill",
    title: "Same A",
    context: { capsule: "Same A", priority: 20 },
  });
  assert.throws(() => store.create({
    id: "too-long",
    kind: "skill",
    title: "Too Long",
    context: { capsule: "x".repeat(301), priority: 1 },
  }), /Skill context capsule must be 1-300 characters/);

  store.assign({ assetId: "same-b", scope: "agent", targetId: "ada" });
  store.assign({ assetId: "invalid-skill", scope: "agent", targetId: "ada" });
  store.assign({ assetId: "missing-context", scope: "agent", targetId: "ada" });
  store.assign({ assetId: "json-skill", scope: "agent", targetId: "ada" });
  store.assign({ assetId: "same-a", scope: "agent", targetId: "ada" });

  const result = store.resolveSkillCapsules({ agentId: "ada" });
  assert.deepEqual(result.capsules.map((capsule) => capsule.assetId), ["clawjs-operator", "json-skill", "same-b", "same-a"]);
  assert.equal(result.capsules.some((capsule) => capsule.assetId === "invalid-skill"), false);
  assert.equal(result.capsules.some((capsule) => capsule.assetId === "missing-context"), false);
  assert.match(result.prompt, /Use ClawJS as the operating layer/);
  assert.match(result.prompt, /Use the JSON capsule/);
  assert.doesNotMatch(result.prompt, /Use the frontmatter capsule/);
});
