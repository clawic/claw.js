import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "vitest";

import { createLocalResourceRegistryStore, resolveResourceRegistryRoot } from "./store.ts";

test("resource registry root uses shared surface path home expansion", () => {
  assert.equal(resolveResourceRegistryRoot({ env: {} }), path.join(os.homedir(), ".claw", "resources"));
  assert.equal(resolveResourceRegistryRoot({ rootDir: "~", env: {} }), os.homedir());
  assert.equal(resolveResourceRegistryRoot({ rootDir: "~/custom-resources", env: {} }), path.join(os.homedir(), "custom-resources"));
  assert.equal(resolveResourceRegistryRoot({ env: { CLAW_RESOURCES_DIR: "~/env-resources" } }), path.join(os.homedir(), "env-resources"));
  assert.equal(resolveResourceRegistryRoot({ env: { CLAW_HOME: "~/custom-claw" } }), path.join(os.homedir(), "custom-claw", "resources"));
});

test("resource registry path locators use shared home expansion", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-resource-store-"));
  const store = createLocalResourceRegistryStore({ rootDir, env: {} });
  const resource = store.register({
    kind: "directory",
    locator: { kind: "path", value: "~" },
    label: "Home Directory",
  });

  assert.equal(resource.status, "active");
  assert.equal(resource.kind, "directory");
  assert.equal(store.read(resource.id).error, `Resource ${resource.id} is a directory.`);
});

test("resource registry read falls back for non-finite byte limits", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-resource-store-limit-"));
  const filePath = path.join(rootDir, "notes.txt");
  fs.writeFileSync(filePath, "alpha beta\n");
  const store = createLocalResourceRegistryStore({ rootDir: path.join(rootDir, "registry"), env: {} });
  const resource = store.register({
    kind: "file",
    locator: { kind: "path", value: filePath },
  });

  assert.equal(store.read(resource.id, { maxBytes: Number.NaN }).content, "alpha beta\n");
  assert.equal(store.read(resource.id, { maxBytes: Number.POSITIVE_INFINITY }).content, "alpha beta\n");
  assert.equal(store.read(resource.id, { maxBytes: 4.9 }).content, "alph");
});

test("resource registry fails closed and preserves corrupt state", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-resource-store-corrupt-"));
  const store = createLocalResourceRegistryStore({ rootDir, env: {} });
  const statePath = store.statePath();
  fs.mkdirSync(rootDir, { recursive: true });
  fs.writeFileSync(statePath, "{ invalid json", "utf8");

  assert.throws(
    () => store.register({ kind: "file", locator: { kind: "path", value: path.join(rootDir, "notes.txt") } }),
    /Invalid resource registry state/,
  );
  assert.equal(fs.readFileSync(statePath, "utf8"), "{ invalid json");
});
