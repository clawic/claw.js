import assert from "node:assert/strict";
import { describe, it } from "vitest";

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

  it("validates outgoing requests against request fixtures", async () => {
    const fixtures = loadConnectorRuntimeFixtures([
      {
        kind: "request",
        path: "packages/clawjs-integrations/fixtures/fixture-action-request.json",
      },
      {
        kind: "response",
        path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
      },
    ]);
    const fetchImpl = createConnectorRuntimeFixtureFetch(fixtures);

    const response = await fetchImpl("https://api.example.invalid/messages", {
      method: "POST",
      headers: {
        authorization: "Bearer offline-apiKey-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "sample" }),
    });

    assert.deepEqual(await response.json(), { ok: true, id: "fixture_result" });
  });

  it("builds encoded response mocks from runtime response metadata", async () => {
    const fixtures = loadConnectorRuntimeFixtures([
      {
        kind: "response",
        path: "packages/clawjs-integrations/fixtures/fixture-binary-response.json",
      },
    ]);
    const fetchImpl = createConnectorRuntimeFixtureFetch(fixtures);

    const response = await fetchImpl("https://example.invalid/image");

    assert.equal(response.status, 203);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [137, 80, 78, 71]);
  });

  it("builds empty responses for null-body runtime response statuses", async () => {
    const fetchImpl = createConnectorRuntimeFixtureFetch([{
      kind: "response",
      path: "inline",
      resolvedPath: "inline",
      body: {
        runtimeResponse: {
          status: 204,
          body: "",
          bodyEncoding: "text",
        },
      },
    }]);

    const response = await fetchImpl("https://example.invalid/empty");

    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  });

  it("rejects outgoing request fixture mismatches", async () => {
    const fixtures = loadConnectorRuntimeFixtures([
      {
        kind: "request",
        path: "packages/clawjs-integrations/fixtures/fixture-action-request.json",
      },
      {
        kind: "response",
        path: "packages/clawjs-integrations/fixtures/fixture-action-response.json",
      },
    ]);
    const fetchImpl = createConnectorRuntimeFixtureFetch(fixtures);

    await assert.rejects(
      () => fetchImpl("https://api.example.invalid/messages", {
        method: "POST",
        headers: {
          authorization: "Bearer offline-apiKey-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text: "wrong" }),
      }),
      /request fixture body mismatch/,
    );
  });

  it("rejects fixture fetch mocks without response bodies", async () => {
    const fetchImpl = createConnectorRuntimeFixtureFetch([]);

    await assert.rejects(
      () => fetchImpl("https://example.invalid/empty"),
      /requires at least one response fixture/,
    );
  });
});
