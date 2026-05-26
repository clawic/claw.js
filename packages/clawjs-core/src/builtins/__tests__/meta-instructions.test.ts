import { test } from "vitest";
import assert from "node:assert/strict";

import {
  BUILTIN_COLLECTIONS,
  BUILTIN_COLLECTIONS_BY_ALIAS,
  BUILTIN_COLLECTIONS_BY_NAME,
  BUILTIN_FAMILY_BY_COLLECTION,
  INSTRUCTIONS,
  META_FAMILY,
  getBuiltinCollection,
  listBuiltinCollections,
  listBuiltinFamilies,
  resolveBuiltinCollectionName,
} from "../index.ts";

test("instructions collection is registered under the meta family", () => {
  assert.equal(META_FAMILY.name, "meta");
  assert.equal(META_FAMILY.collections.some((entry) => entry.name === "instructions"), true);
  assert.equal(BUILTIN_FAMILY_BY_COLLECTION.get("instructions"), "meta");
  assert.equal(listBuiltinFamilies().some((entry) => entry.name === "meta"), true);
});

test("BUILTIN_COLLECTIONS exposes the instructions collection by name and alias", () => {
  assert.equal(BUILTIN_COLLECTIONS_BY_NAME.get("instructions")?.name, "instructions");
  assert.equal(BUILTIN_COLLECTIONS.some((entry) => entry.name === "instructions"), true);
  assert.equal(BUILTIN_COLLECTIONS_BY_ALIAS.get("instruction"), "instructions");
  assert.equal(resolveBuiltinCollectionName("instruction"), "instructions");
  assert.equal(getBuiltinCollection("instructions")?.name, "instructions");
});

test("listBuiltinCollections accepts the meta family filter", () => {
  const meta = listBuiltinCollections({ family: "meta" });
  assert.equal(meta.length, 1);
  assert.equal(meta[0]?.name, "instructions");
});

test("instructions collection schema covers required ClawInstruction columns", () => {
  const fieldsByName = new Map(INSTRUCTIONS.fields.map((field) => [field.name, field]));
  for (const required of [
    "schemaVersion",
    "trigger",
    "activation",
    "priority",
    "severity",
    "provenance",
    "state",
  ]) {
    const field = fieldsByName.get(required);
    assert.ok(field, `expected field ${required}`);
    assert.equal(field?.required, true);
  }
  for (const optional of [
    "targetAlias",
    "targetFamily",
    "targetCommand",
    "targetSubcommand",
    "targetCollection",
    "targetAction",
    "useWhen",
    "useNot",
    "readPolicy",
    "writePolicy",
    "before",
    "after",
    "forbid",
    "notes",
    "confidence",
    "proposedFrom",
    "source",
    "validations",
  ]) {
    assert.ok(fieldsByName.has(optional), `expected field ${optional}`);
  }
});

test("body field caps match the ClawInstruction caps", () => {
  const fieldsByName = new Map(INSTRUCTIONS.fields.map((field) => [field.name, field]));
  assert.equal(fieldsByName.get("useWhen")?.maxLength, 240);
  assert.equal(fieldsByName.get("useNot")?.maxLength, 240);
  assert.equal(fieldsByName.get("readPolicy")?.maxLength, 240);
  assert.equal(fieldsByName.get("writePolicy")?.maxLength, 240);
  assert.equal(fieldsByName.get("before")?.maxLength, 180);
  assert.equal(fieldsByName.get("after")?.maxLength, 180);
  assert.equal(fieldsByName.get("forbid")?.maxLength, 180);
  assert.equal(fieldsByName.get("notes")?.maxLength, 500);
});

test("indexes are declared for the most common queries", () => {
  const names = INSTRUCTIONS.indexes.map((index) => index.name);
  for (const expected of [
    "instructions_trigger_idx",
    "instructions_state_idx",
    "instructions_command_idx",
    "instructions_collection_idx",
    "instructions_state_trigger_idx",
  ]) {
    assert.equal(names.includes(expected), true, `expected index ${expected}`);
  }
});
