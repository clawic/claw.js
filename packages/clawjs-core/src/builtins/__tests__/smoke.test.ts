import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DatabaseServiceStore } from "@clawjs/database";

import {
  BUILTIN_COLLECTIONS,
  BUILTIN_FAMILY_BY_COLLECTION,
} from "../../index.ts";
import type { BuiltinCollectionDefinition, BuiltinFieldDefinition } from "../_types.ts";

function syntheticValue(field: BuiltinFieldDefinition): unknown {
  switch (field.type) {
    case "text":
    case "markdown":
      return "x";
    case "email":
      return "x@example.com";
    case "url":
      return "https://example.com";
    case "phone":
      return "+14155551234";
    case "currency":
      return "USD";
    case "color_hex":
      return "#aabbcc";
    case "number":
    case "duration":
      return field.min !== undefined ? field.min : 0;
    case "percent":
      return 50;
    case "rating":
      return 1;
    case "boolean":
      return false;
    case "date":
      return new Date().toISOString();
    case "json":
      return {};
    case "select":
      return field.options?.[0] ?? "x";
    case "relation":
      return "rel_placeholder";
    case "file":
      return "file_placeholder";
    case "money":
      return { amountCents: 0, currency: "USD" };
    case "address":
      return { street: "1 Main", city: "Anywhere", country: "US" };
    case "geo_point":
      return { lat: 0, lng: 0 };
    case "barcode":
      switch (field.barcodeKind) {
        case "isbn10": return "0306406152";
        case "isbn13": return "9780306406157";
        case "ean13":  return "4006381333931";
        case "upc12":  return "012345678905";
        default: return "x";
      }
    default:
      return "x";
  }
}

function minimalPayload(collection: BuiltinCollectionDefinition): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of collection.fields) {
    if (field.required) payload[field.name] = syntheticValue(field);
  }
  // A non-required text field if available, so update tests something tangible.
  return payload;
}

function nonRequiredTextField(collection: BuiltinCollectionDefinition): BuiltinFieldDefinition | undefined {
  return collection.fields.find((f) => !f.required && (f.type === "text" || f.type === "markdown"));
}

const NAMESPACE = "smoke";
const TMP_ROOT = mkdtempSync(join(tmpdir(), "clawjs-smoke-"));
const DB_PATH = join(TMP_ROOT, "smoke.sqlite");
const FILES_PATH = join(TMP_ROOT, "files");

const store = new DatabaseServiceStore(DB_PATH, FILES_PATH);
store.ensureNamespace({ id: NAMESPACE, displayName: "Smoke" });

test.after(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true });
});

test("smoke: CRUD a record on every built-in collection", async (t) => {
  let failures = 0;
  for (const collection of BUILTIN_COLLECTIONS) {
    const family = BUILTIN_FAMILY_BY_COLLECTION.get(collection.name);
    await t.test(`${family ?? "?"}/${collection.name}`, () => {
      const payload = minimalPayload(collection);
      let record;
      try {
        record = store.createRecord(NAMESPACE, collection.name, payload);
      } catch (err) {
        failures += 1;
        throw new Error(`create failed for ${collection.name}: ${(err as Error).message}`);
      }
      const fetched = store.getRecord(NAMESPACE, collection.name, record.id);
      assert.ok(fetched, `get returned null for ${collection.name}`);
      const updatable = nonRequiredTextField(collection);
      if (updatable) {
        const updated = store.updateRecord(NAMESPACE, collection.name, record.id, {
          [updatable.name]: "updated",
        });
        assert.equal(updated[updatable.name], "updated", `update did not stick on ${collection.name}`);
      }
      const removed = store.deleteRecord(NAMESPACE, collection.name, record.id);
      assert.ok(removed, `delete returned false for ${collection.name}`);
      const afterDelete = store.getRecord(NAMESPACE, collection.name, record.id);
      assert.equal(afterDelete, null, `record persisted after delete on ${collection.name}`);
    });
  }
  assert.equal(failures, 0, `Smoke test had ${failures} create failures`);
});
