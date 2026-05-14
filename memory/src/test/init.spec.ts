import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "./helpers";

test("init creates workspace structure", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-init-"));
  const result = runCli(["init", "--dir", workspace], workspace);
  assert.equal(result.workspace, workspace);
  assert.ok(fs.existsSync(path.join(workspace, ".memory", "config.json")));
  assert.ok(fs.existsSync(path.join(workspace, ".memory", "schema", "core.json")));
  assert.ok(fs.existsSync(path.join(workspace, ".memory", "notes", "entities")));
  assert.ok(fs.existsSync(path.join(workspace, ".memory", "notes", "memories")));
});

test("init does not overwrite existing config", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-init-safe-"));
  runCli(["init", "--dir", workspace], workspace);

  const configPath = path.join(workspace, ".memory", "config.json");
  const original = fs.readFileSync(configPath, "utf8");
  fs.writeFileSync(configPath, JSON.stringify({ version: 3, format: "markdown-first", custom: true }, null, 2));

  runCli(["init", "--dir", workspace], workspace);
  const afterReinit = fs.readFileSync(configPath, "utf8");
  assert.ok(afterReinit.includes('"custom"'), "custom field should be preserved");
});

test("init --force overwrites existing config", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "memory-init-force-"));
  runCli(["init", "--dir", workspace], workspace);

  const configPath = path.join(workspace, ".memory", "config.json");
  fs.writeFileSync(configPath, JSON.stringify({ version: 3, format: "markdown-first", custom: true }, null, 2));

  runCli(["init", "--force", "--dir", workspace], workspace);
  const afterForce = fs.readFileSync(configPath, "utf8");
  assert.ok(!afterForce.includes('"custom"'), "custom field should be gone after --force");
});
