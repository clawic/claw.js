import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { verifyOfficialApiCoverageMatrix } from "./integration-qa-policy.ts";
import {
  TELEGRAM_OFFICIAL_API_COVERAGE,
  TELEGRAM_OFFICIAL_API_MATRIX,
  TELEGRAM_OFFICIAL_BOT_API_METHODS,
  TELEGRAM_OFFICIAL_BOT_API_VERSION,
  TELEGRAM_OFFICIAL_UPDATE_COVERAGE,
  TELEGRAM_OFFICIAL_UPDATE_FIELDS,
} from "./telegram-official-api-matrix.ts";
import { isTelegramActionOperationSupported } from "./telegram-operation-executor.ts";
import { TELEGRAM_POLL_UPDATE_TYPES } from "./telegram-source.ts";

describe("Telegram official Bot API coverage matrix", () => {
  it("classifies every official Bot API 10.0 method exactly once", () => {
    const report = verifyOfficialApiCoverageMatrix(TELEGRAM_OFFICIAL_API_MATRIX);

    assert.equal(report.provider, "telegram_bot_api");
    assert.equal(report.officialApiVersion, TELEGRAM_OFFICIAL_BOT_API_VERSION);
    assert.equal(report.totalOfficialMethods, 176);
    assert.equal(report.totalEntries, 176);
    assert.equal(report.implemented, 24);
    assert.equal(report.fixtureOnly, 97);
    assert.equal(report.manualOnly, 51);
    assert.equal(report.unsupportedByPolicy, 4);
  });

  it("keeps implemented action rows aligned with the Telegram executor", () => {
    const unsupportedImplementedActions = TELEGRAM_OFFICIAL_API_COVERAGE
      .filter((entry) => entry.status === "implemented")
      .flatMap((entry) => entry.connectorOperationIds)
      .filter((operationId) => !operationId.endsWith(".*"))
      .filter((operationId) => !isTelegramActionOperationSupported(operationId));

    assert.deepEqual(unsupportedImplementedActions, []);
  });

  it("keeps newly released methods visible until they are explicitly classified", () => {
    assert.ok(TELEGRAM_OFFICIAL_BOT_API_METHODS.includes("getManagedBotToken"));
    assert.ok(TELEGRAM_OFFICIAL_BOT_API_METHODS.includes("getAvailableGifts"));
    assert.ok(TELEGRAM_OFFICIAL_BOT_API_METHODS.includes("savePreparedInlineMessage"));

    const managedBotRows = TELEGRAM_OFFICIAL_API_COVERAGE
      .filter((entry) => entry.officialMethod.includes("ManagedBot"));
    assert.equal(managedBotRows.length, 4);
    assert.ok(managedBotRows.every((entry) => entry.status === "unsupported_by_policy"));
  });

  it("tracks official update fields separately from method coverage", () => {
    assert.equal(TELEGRAM_OFFICIAL_UPDATE_FIELDS.length, 25);
    assert.deepEqual(
      TELEGRAM_OFFICIAL_UPDATE_COVERAGE
        .filter((entry) => entry.status === "implemented")
        .map((entry) => entry.updateField),
      [...TELEGRAM_POLL_UPDATE_TYPES],
    );
    assert.equal(
      TELEGRAM_OFFICIAL_UPDATE_COVERAGE.filter((entry) => entry.status === "unsupported_by_policy").length,
      1,
    );
  });
});
