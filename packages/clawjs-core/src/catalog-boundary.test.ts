import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";

import * as root from "./index.ts";
import {
  BUILTIN_COLLECTIONS,
  BUILTIN_COLLECTIONS_BY_ALIAS,
  BUILTIN_FAMILIES,
  clawCliCommandRegistry,
} from "./catalogs.ts";
import {
  compactBuiltinCollectionAliases,
  compactBuiltinCollections,
  compactBuiltinFamilies,
  compactStableClawCliCommandNames,
} from "./compact-catalogs.ts";

const HEAVY_ROOT_EXPORTS = [
  "builtins/index",
  "dense-data-fixtures",
  "dense-data-os",
  "domain-surface-registry",
  "surface-registry",
  "catalog-coverage",
  "capability-catalog",
  "capability-fiches",
  "capability-maturity",
  "custom-app-sdk-inspection",
  "repository-discovery",
  "debt-ledger",
  "cli-command-registry",
  "cli-command-intents",
  "remote-sync-e2e",
];

const FORBIDDEN_COMPACT_IMPORTS = [
  "builtins",
  "dense-data-os",
  "surface-registry",
  "capability-",
  "cli-command-registry",
];

test("core root keeps catalog and registry exports out of the public root", () => {
  const indexSource = fs.readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  for (const exportPath of HEAVY_ROOT_EXPORTS) {
    assert.equal(indexSource.includes(exportPath), false, `root index must not export ${exportPath}`);
  }
  assert.equal("BUILTIN_COLLECTIONS" in root, false);
  assert.equal("clawProfessionalRecordsOsRegistry" in root, false);
  assert.equal("clawPersistentSurfaceRegistry" in root, false);
  assert.equal("clawCliCommandRegistry" in root, false);
});

test("compact catalogs do not import heavy catalog modules", () => {
  const compactSource = fs.readFileSync(new URL("./compact-catalogs.ts", import.meta.url), "utf8");
  for (const forbidden of FORBIDDEN_COMPACT_IMPORTS) {
    assert.equal(compactSource.includes(forbidden), false, `compact catalogs must not import ${forbidden}`);
  }
});

test("compact catalogs stay in parity with full catalogs", () => {
  assert.deepEqual(
    compactBuiltinCollectionAliases.map((entry) => [entry.alias, entry.canonicalName]),
    [...BUILTIN_COLLECTIONS_BY_ALIAS.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

  assert.deepEqual(
    compactBuiltinFamilies.map((family) => [family.name, family.collectionCount]),
    BUILTIN_FAMILIES.map((family) => [family.name, family.collections.length]),
  );

  assert.deepEqual(
    compactBuiltinCollections.map((collection) => [collection.name, collection.family, collection.fieldCount]),
    BUILTIN_COLLECTIONS.map((collection) => [collection.name, collection.family, collection.fields.length]),
  );

  assert.deepEqual(
    compactStableClawCliCommandNames,
    clawCliCommandRegistry.commands.filter((entry) => entry.kind !== "alias").map((entry) => entry.name).sort(),
  );
});
