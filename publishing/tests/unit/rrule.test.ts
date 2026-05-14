import { test } from "vitest";
import assert from "node:assert/strict";

import { nextRunAtFromRrule } from "../../src/server/domain/misc.ts";

test("nextRunAtFromRrule handles common frequencies", () => {
  const from = Date.UTC(2026, 4, 11, 0, 0, 0);
  assert.equal(nextRunAtFromRrule("FREQ=DAILY", from), from + 86400_000);
  assert.equal(nextRunAtFromRrule("FREQ=DAILY;INTERVAL=2", from), from + 2 * 86400_000);
  assert.equal(nextRunAtFromRrule("FREQ=HOURLY", from), from + 3600_000);
  assert.equal(nextRunAtFromRrule("FREQ=WEEKLY", from), from + 7 * 86400_000);
  const monthly = nextRunAtFromRrule("FREQ=MONTHLY", from);
  assert.ok(monthly > from + 27 * 86400_000 && monthly < from + 33 * 86400_000);
});
