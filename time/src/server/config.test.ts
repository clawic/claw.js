import assert from "node:assert/strict";
import test from "node:test";

import { loadTimeConfig } from "./config.ts";

const ORIGINAL_ENV = {
  CLAW_TIME_PORT: process.env.CLAW_TIME_PORT,
  CLAW_TIME_SCHEDULER_INTERVAL_MS: process.env.CLAW_TIME_SCHEDULER_INTERVAL_MS,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("time config rejects non-decimal unsafe numeric environment values", () => {
  try {
    for (const value of ["1e3", "0x10", "1.5", "0", "9007199254740992"]) {
      process.env.CLAW_TIME_PORT = value;
      assert.throws(() => loadTimeConfig(), /CLAW_TIME_PORT/);
    }

    process.env.CLAW_TIME_PORT = "4731";
    assert.equal(loadTimeConfig().port, 4731);

    for (const value of ["1e3", "0x10", "1.5", "0", "9007199254740992"]) {
      process.env.CLAW_TIME_SCHEDULER_INTERVAL_MS = value;
      assert.throws(() => loadTimeConfig(), /CLAW_TIME_SCHEDULER_INTERVAL_MS/);
    }

    process.env.CLAW_TIME_SCHEDULER_INTERVAL_MS = "250";
    assert.equal(loadTimeConfig().schedulerIntervalMs, 250);
  } finally {
    restoreEnv();
  }
});
