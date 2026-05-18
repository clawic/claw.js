import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { MonitorDatabase } from "./db.ts";

test("MonitorDatabase stores generic metric samples and rollups", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-monitor-metrics-"));
  const db = new MonitorDatabase(path.join(dir, "monitor.sqlite"));
  try {
    db.upsertMetricSource({
      id: "local-system",
      kind: "system",
      adapter: "fixture",
      hostId: "local",
      metadata: { privacy: "safe_read" },
    });
    db.appendMetricSample({
      sourceId: "local-system",
      metricKey: "system.cpu.load1",
      value: 1.5,
      unit: "count",
      tags: { family: "cpu" },
      capturedAt: 1_000,
    });
    db.appendMetricSample({
      sourceId: "local-system",
      metricKey: "system.cpu.load1",
      value: 2.5,
      unit: "count",
      tags: { family: "cpu" },
      capturedAt: 2_000,
    });
    db.upsertMetricRollup({
      sourceId: "local-system",
      metricKey: "system.cpu.load1",
      bucketMs: 60_000,
      bucketStartAt: 0,
      count: 2,
      minValue: 1.5,
      maxValue: 2.5,
      avgValue: 2,
      lastValue: 2.5,
      unit: "count",
      tags: { family: "cpu" },
    });

    const samples = db.getMetricSamples("system.cpu.load1", { sinceMs: 0 });
    assert.deepEqual(samples.map((sample) => sample.value), [1.5, 2.5]);
    assert.deepEqual(samples[0]?.tags, { family: "cpu" });

    const rollups = db.getMetricRollups("system.cpu.load1", { bucketMs: 60_000 });
    assert.equal(rollups.length, 1);
    assert.equal(rollups[0]?.avgValue, 2);
    assert.equal(rollups[0]?.lastValue, 2.5);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
