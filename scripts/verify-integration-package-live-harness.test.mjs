import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import { validateLiveReport } from "./verify-integration-package-live-harness.mjs";

describe("integration package/live report validation", () => {
  it("accepts structured Telegram broker evidence", () => {
    const file = writeReport({
      provider: "telegram_bot_api",
      status: "PARTIAL",
      credentialLeaseReleased: true,
      results: [
        { id: "telegram.get-me", status: "PASS", evidence: ["brokered_live"], missingPrerequisites: [] },
        { id: "telegram.webhook-loopback", status: "EXTERNAL PENDING", evidence: [], missingPrerequisites: ["endpoint"] },
      ],
    });

    assert.doesNotThrow(() => validateLiveReport(file));
  });

  it("rejects broker commands that do not leave a report", () => {
    assert.throws(
      () => validateLiveReport(path.join(os.tmpdir(), "missing-telegram-live-report.json")),
      /did not write/,
    );
  });

  it("rejects failed, quarantined, or unreleased lease reports", () => {
    assert.throws(
      () => validateLiveReport(writeReport({
        provider: "telegram_bot_api",
        status: "FAIL",
        credentialLeaseReleased: true,
        results: [{ id: "telegram.get-me", status: "PASS", evidence: [], missingPrerequisites: [] }],
      })),
      /returned FAIL/,
    );
    assert.throws(
      () => validateLiveReport(writeReport({
        provider: "telegram_bot_api",
        status: "PARTIAL",
        credentialLeaseReleased: false,
        results: [{ id: "telegram.get-me", status: "PASS", evidence: [], missingPrerequisites: [] }],
      })),
      /credentialLeaseReleased=true/,
    );
    assert.throws(
      () => validateLiveReport(writeReport({
        provider: "telegram_bot_api",
        status: "PARTIAL",
        credentialLeaseReleased: true,
        results: [
          { id: "telegram.get-me", status: "PASS", evidence: [], missingPrerequisites: [] },
          { id: "telegram.webhook-loopback", status: "QUARANTINED", evidence: [], missingPrerequisites: [] },
        ],
      })),
      /returned QUARANTINED/,
    );
  });
});

function writeReport(report) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-live-report-test."));
  const file = path.join(dir, "report.json");
  fs.writeFileSync(file, JSON.stringify(report));
  return file;
}
