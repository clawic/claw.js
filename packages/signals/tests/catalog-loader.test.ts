import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import { catalogJsonToEntries } from "../src/catalog-loader.ts";
import { TrackingStore } from "../src/store.ts";

test("catalog conversion skips partial entries before seeding the store", () => {
  const catalogJson = {
    domain: "robustness",
    version: "1",
    entries: [
      {
        id: "robustness.valid",
        label: "Valid",
        unit: { id: "count", label: "count" },
        valueType: "numeric",
      },
      {
        id: "robustness.partial",
        label: "Partial",
        valueType: "numeric",
      },
    ],
  } as unknown as Parameters<typeof catalogJsonToEntries>[0];
  const entries = catalogJsonToEntries(catalogJson);

  assert.deepEqual(entries.map((entry) => entry.id), ["robustness.valid"]);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signals-catalog-partial-"));
  const store = new TrackingStore({
    domain: "robustness",
    dbPath: path.join(tempDir, "signals.sqlite"),
    seedCatalog: entries,
  });
  try {
    assert.deepEqual(store.listCatalog().map((entry) => entry.id), ["robustness.valid"]);
  } finally {
    store.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
