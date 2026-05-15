import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildFinanceApp, FinanceClient } from "@clawjs/finance";

test("finance CRUD smoke", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-e2e-"));
  const dbPath = path.join(tmpDir, "core.sqlite");
  const sharedSecret = "test-secret";

  const { app, config } = buildFinanceApp({
    configOverrides: {
      dataDir: tmpDir,
      dbPath,
      sharedSecret,
      host: "127.0.0.1",
      port: 0,
    },
  });

  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  try {
    const baseUrl = address;
    const client = new FinanceClient({ baseUrl, token: sharedSecret });

    const health = await client.health();
    assert.equal(health.ok, true);
    assert.equal(health.service, "finance");

    const catalog = await client.catalog();
    assert.ok(catalog.items.length >= 1, "catalog must seed at least one entry");

    const variable = catalog.items[0];
    const observation = await client.upsertObservation({
      variableId: variable.id,
      value: variable.valueType === "numeric" ? 42 : variable.valueType === "boolean" ? true : "hello",
      recordedAt: Date.now(),
      source: "manual",
    });
    assert.ok(observation.id);

    const list = await client.listObservations({ variableId: variable.id });
    assert.equal(list.items.length, 1);

    const deleted = await client.deleteObservation(observation.id);
    assert.equal(deleted.deleted, true);
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
