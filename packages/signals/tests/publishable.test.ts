import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PublishableRegistry, snapshotFromObservations, type PublishableProvider, type PublishableSnapshot,
} from "../src/publishable.ts";

function stubProvider(module: string): PublishableProvider {
  const updates = new Map<string, ((s: PublishableSnapshot) => void)[]>();
  return {
    module,
    publishableFields: () => [
      { id: `${module}.title`, label: "Title", defaultAudience: "public", match: true },
    ],
    getPublishableSnapshot: (id) => ({
      module,
      recordId: id,
      takenAt: 12345,
      fields: { [`${module}.title`]: `${module} #${id}` },
    }),
    listPublishableRecords: () => [{ recordId: "1", label: `${module} 1` }],
    onRecordUpdated: (id, listener) => {
      const list = updates.get(id) ?? [];
      list.push(listener);
      updates.set(id, list);
      return () => updates.set(id, (updates.get(id) ?? []).filter((l) => l !== listener));
    },
  };
}

test("PublishableRegistry: rejects duplicate module registration", () => {
  const reg = new PublishableRegistry();
  reg.register(stubProvider("vehicle"));
  assert.throws(() => reg.register(stubProvider("vehicle")), /already registered/);
  assert.equal(reg.has("vehicle"), true);
  assert.equal(reg.has("home"), false);
});

test("PublishableRegistry: list / get / modules", () => {
  const reg = new PublishableRegistry();
  reg.register(stubProvider("vehicle"));
  reg.register(stubProvider("home"));
  assert.deepEqual(reg.modules().sort(), ["home", "vehicle"]);
  assert.equal(reg.list().length, 2);
});

test("snapshotFromObservations: maps observations to publishable fields", () => {
  const snap = snapshotFromObservations({
    module: "vehicle",
    recordId: "veh-1",
    observations: [
      {
        id: "obs-1", variableId: "vehicle.make", value: "Toyota",
        unitId: "text", recordedAt: 1, source: "manual",
        createdAt: 1, updatedAt: 1,
      },
      {
        id: "obs-2", variableId: "vehicle.km", value: 120000,
        unitId: "km", recordedAt: 2, source: "manual",
        createdAt: 2, updatedAt: 2,
      },
    ],
    variableLabel: (v) => v.replace("vehicle.", ""),
  });
  assert.equal(snap.fields["vehicle.make"], "Toyota");
  assert.equal(snap.fields["vehicle.km"], 120000);
});
