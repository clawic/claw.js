import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createConnectorRuntimeFixtureFetch,
  loadConnectorRuntimeFixture,
  loadConnectorRuntimeFixtures,
} from "./runtime-fixtures.ts";

describe("connector runtime fixtures", () => {
  it("loads local JSON fixture evidence from the workspace root", () => {
    const fixture = loadConnectorRuntimeFixture({
      kind: "response",
      path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
    });

    assert.equal(fixture.kind, "response");
    assert.deepEqual(fixture.body, { ok: true, id: "fixture_result" });
    assert.match(fixture.resolvedPath, /fixture-action-response\.json$/);
  });

  it("builds a sequential fetch mock from response fixtures", async () => {
    const fixtures = loadConnectorRuntimeFixtures([
      {
        kind: "response",
        path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
      },
      {
        kind: "source_event",
        path: "packages/clawjs-integrations/fixtures/telegram-get-updates-response.json",
      },
    ]);
    const fetchImpl = createConnectorRuntimeFixtureFetch(fixtures);

    assert.deepEqual(await (await fetchImpl("https://example.invalid/one")).json(), {
      ok: true,
      id: "fixture_result",
    });
    assert.deepEqual(await (await fetchImpl("https://example.invalid/two")).json(), {
      ok: true,
      result: [{
        update_id: 1000,
        message: {
          message_id: 42,
          chat: {
            id: 123,
            type: "private",
          },
          text: "/start",
        },
      }],
    });
    assert.deepEqual(await (await fetchImpl("https://example.invalid/three")).json(), {
      ok: true,
      result: [{
        update_id: 1000,
        message: {
          message_id: 42,
          chat: {
            id: 123,
            type: "private",
          },
          text: "/start",
        },
      }],
    });
  });

  it("rejects fixture fetch mocks without response bodies", async () => {
    const fetchImpl = createConnectorRuntimeFixtureFetch([]);

    await assert.rejects(
      () => fetchImpl("https://example.invalid/empty"),
      /requires at least one response fixture/,
    );
  });
});
