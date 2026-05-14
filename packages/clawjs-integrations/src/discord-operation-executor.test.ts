import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { verifyConnectorRuntimeCoverage, verifyConnectorRuntimeOfflineExecutions } from "./runtime-coverage.ts";
import { DISCORD_ACTIONS, DISCORD_CATALOG } from "./discord-operation-test-catalog.ts";

describe("discord operation runtime", () => {
  it("covers Discord operations with operation-scoped offline fixtures", async () => {
    const coverage = verifyConnectorRuntimeCoverage(DISCORD_CATALOG);
    assert.equal(coverage.summary.missing, 0);
    assert.equal(coverage.summary.implemented, DISCORD_ACTIONS.length);

    const offline = await verifyConnectorRuntimeOfflineExecutions(DISCORD_CATALOG);
    assert.deepEqual(
      offline.results.map((result) => result.operationId).sort(),
      DISCORD_ACTIONS.map((operation) => operation.id).sort(),
    );
  });
});
