import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  readBindingStore,
  readSettingsSchemaRecord,
  readSettingsValuesRecord,
  resolveBindingsPath,
  resolveSettingsSchemaPath,
  resolveSettingsValuesPath,
  validateSettingsUpdate,
  writeBindingStore,
  writeSettingsSchemaRecord,
  writeSettingsValuesRecord,
} from "./store.ts";

test("binding projections and file intents round-trip in .claw/projections and .claw/intents", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-bindings-store-"));

  writeBindingStore(workspaceDir, [{
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block",
    blockId: "tone",
    settingsPath: "tone",
  }]);
  writeSettingsSchemaRecord(workspaceDir, {
    tone: { type: "string", default: "balanced" },
    nested: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"] },
  });
  writeSettingsValuesRecord(workspaceDir, {
    tone: "balanced",
    nested: { enabled: true },
  });

  assert.equal(fs.existsSync(resolveBindingsPath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveSettingsSchemaPath(workspaceDir)), true);
  assert.equal(fs.existsSync(resolveSettingsValuesPath(workspaceDir)), true);
  assert.match(resolveBindingsPath(workspaceDir), /\.claw\/projections\/file-bindings\.json$/);
  assert.match(resolveSettingsSchemaPath(workspaceDir), /\.claw\/projections\/settings-schema\.json$/);
  assert.match(resolveSettingsValuesPath(workspaceDir), /\.claw\/intents\/files\.json$/);
  assert.equal(readBindingStore(workspaceDir).bindings.length, 1);
  assert.equal((readSettingsSchemaRecord(workspaceDir).settingsSchema.tone as { type: string }).type, "string");
  assert.equal((readSettingsValuesRecord(workspaceDir).values.nested as { enabled: boolean }).enabled, true);
});

test("binding stores fail closed when persisted records are malformed", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-bindings-corrupt-"));

  assert.deepEqual(readBindingStore(workspaceDir), { schemaVersion: 1, bindings: [] });
  assert.deepEqual(readSettingsSchemaRecord(workspaceDir), { schemaVersion: 1, settingsSchema: {} });
  assert.deepEqual(readSettingsValuesRecord(workspaceDir), { schemaVersion: 1, values: {} });

  fs.mkdirSync(path.dirname(resolveSettingsSchemaPath(workspaceDir)), { recursive: true });
  fs.writeFileSync(resolveSettingsSchemaPath(workspaceDir), "{bad", "utf8");
  assert.throws(() => readSettingsSchemaRecord(workspaceDir), /invalid_settings_schema_json/);

  fs.writeFileSync(resolveSettingsSchemaPath(workspaceDir), JSON.stringify({ schemaVersion: 1, settingsSchema: [] }), "utf8");
  assert.throws(() => readSettingsSchemaRecord(workspaceDir), /invalid_settings_schema_record/);

  fs.mkdirSync(path.dirname(resolveSettingsValuesPath(workspaceDir)), { recursive: true });
  fs.writeFileSync(resolveSettingsValuesPath(workspaceDir), JSON.stringify({ schemaVersion: 1, values: [] }), "utf8");
  assert.throws(() => readSettingsValuesRecord(workspaceDir), /invalid_settings_values_record/);

  fs.mkdirSync(path.dirname(resolveBindingsPath(workspaceDir)), { recursive: true });
  fs.writeFileSync(resolveBindingsPath(workspaceDir), JSON.stringify({ schemaVersion: 1, bindings: [{ id: "" }] }), "utf8");
  assert.throws(() => readBindingStore(workspaceDir), /invalid_binding_store_record/);
});

test("validateSettingsUpdate reports invalid values", () => {
  const issues = validateSettingsUpdate({
    tone: { type: "string" },
    nested: { type: "object", properties: { enabled: { type: "boolean" } }, required: ["enabled"] },
  }, {
    tone: 42,
    nested: {},
  });

  assert.deepEqual(issues, [
    { path: "tone", message: "expected string" },
    { path: "nested.enabled", message: "missing required value" },
  ]);
});
