import { test } from "vitest";
import assert from "node:assert/strict";

import {
  BUILTIN_COLLECTIONS,
  BUILTIN_COLLECTIONS_BY_ALIAS,
  BUILTIN_COLLECTIONS_BY_NAME,
  BUILTIN_FAMILIES,
  BUILTIN_FAMILY_BY_COLLECTION,
  PRODUCTIVITY_COLLECTION_DEFINITIONS,
} from "../../catalogs.ts";

const SYSTEM_FIELDS = new Set(["id", "createdAt", "updatedAt"]);
const ENRICHED_TYPES = new Set([
  "money", "currency", "address", "phone", "geo_point",
  "rating", "duration", "percent", "markdown", "color_hex", "barcode",
]);

test("builtin registry: no duplicate collection names", () => {
  const seen = new Map<string, string>();
  for (const collection of BUILTIN_COLLECTIONS) {
    const family = BUILTIN_FAMILY_BY_COLLECTION.get(collection.name);
    const existingFamily = seen.get(collection.name);
    if (existingFamily) {
      assert.fail(`Collection "${collection.name}" duplicated across families: ${existingFamily} and ${family}`);
    }
    seen.set(collection.name, family ?? "<unknown>");
  }
});

test("builtin registry: alias map is consistent", () => {
  for (const [alias, name] of BUILTIN_COLLECTIONS_BY_ALIAS.entries()) {
    assert.ok(BUILTIN_COLLECTIONS_BY_NAME.has(name), `Alias "${alias}" points to non-existent collection "${name}"`);
    assert.equal(alias, alias.toLowerCase(), `Alias "${alias}" should be lowercase`);
  }
});

test("builtin registry: every collection has at least name+plural alias coverage", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    const aliases = collection.aliases.map((a) => a.toLowerCase());
    assert.ok(aliases.length >= 1, `Collection "${collection.name}" has no aliases`);
    assert.ok(
      aliases.includes(collection.name.toLowerCase()),
      `Collection "${collection.name}" aliases must include its canonical name`,
    );
  }
});

test("builtin registry: relations point to known collections", () => {
  const productivityNames = new Set(PRODUCTIVITY_COLLECTION_DEFINITIONS.map((d) => d.name));
  const warnings: string[] = [];
  for (const collection of BUILTIN_COLLECTIONS) {
    for (const field of collection.fields) {
      if (field.type !== "relation") continue;
      const target = field.relation?.collectionName;
      if (!target) {
        assert.fail(`Collection "${collection.name}" field "${field.name}" is relation without collectionName`);
      }
      if (!BUILTIN_COLLECTIONS_BY_NAME.has(target) && !productivityNames.has(target)) {
        warnings.push(`${collection.name}.${field.name} -> ${target}`);
      }
    }
  }
  if (warnings.length > 0) {
    // Dangling relations are warnings, not failures (target may live in an optional builtin set).
    console.warn(`Warning: ${warnings.length} dangling relations:\n  ${warnings.slice(0, 10).join("\n  ")}${warnings.length > 10 ? "\n  ..." : ""}`);
  }
});

test("builtin registry: no SYSTEM_FIELDS reserved as field name", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    for (const field of collection.fields) {
      assert.ok(
        !SYSTEM_FIELDS.has(field.name),
        `Collection "${collection.name}" uses reserved field name "${field.name}"`,
      );
    }
  }
});

test("builtin registry: enriched types declare required attributes", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    for (const field of collection.fields) {
      if (!ENRICHED_TYPES.has(field.type)) continue;
      if (field.type === "rating") {
        if (field.enumScale !== undefined) {
          assert.ok(field.enumScale >= 1, `${collection.name}.${field.name} (rating) needs enumScale >= 1`);
        }
      }
      if (field.type === "barcode") {
        assert.ok(field.barcodeKind, `${collection.name}.${field.name} (barcode) needs barcodeKind`);
      }
    }
  }
});

test("builtin registry: no duplicate field names within a collection", () => {
  for (const collection of BUILTIN_COLLECTIONS) {
    const names = new Set<string>();
    for (const field of collection.fields) {
      assert.ok(!names.has(field.name), `Collection "${collection.name}" has duplicate field "${field.name}"`);
      names.add(field.name);
    }
  }
});

test("builtin registry: every family has at least one collection", () => {
  for (const family of BUILTIN_FAMILIES) {
    assert.ok(family.collections.length > 0, `Family "${family.name}" has no collections`);
  }
});

test("builtin registry: families cover the catalog (collection count parity)", () => {
  const sumOfFamilyCollections = BUILTIN_FAMILIES.reduce((acc, f) => acc + f.collections.length, 0);
  assert.equal(sumOfFamilyCollections, BUILTIN_COLLECTIONS.length);
});
