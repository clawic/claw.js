import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildConnectorRuntimeFetchRequest,
  ConnectorRuntimeHttpError,
  executeConnectorRuntimeRequestPlan,
} from "./runtime-http.ts";

describe("connector runtime http transport", () => {
  it("builds requests with bearer, query, path, and JSON body bindings", () => {
    const request = buildConnectorRuntimeFetchRequest({
      baseUrl: "https://api.example.invalid/v1/",
      secrets: {
        accountId: "acct 1",
        apiKey: "key_123",
        cursorSecret: "cursor_456",
      },
      plan: {
        method: "POST",
        endpoint: "accounts/{accountId}/items",
        auth: [
          { type: "secret", field: "accountId", placement: "path", name: "accountId" },
          { type: "secret", field: "apiKey", placement: "bearer" },
          { type: "secret", field: "cursorSecret", placement: "query", name: "cursor" },
        ],
        query: { limit: 25, tags: ["a", "b"] },
        body: { name: "demo", active: true },
      },
    });

    assert.equal(
      request.url,
      "https://api.example.invalid/v1/accounts/acct%201/items?limit=25&tags=a&tags=b&cursor=cursor_456",
    );
    assert.equal(request.init.method, "POST");
    assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer key_123");
    assert.equal(new Headers(request.init.headers).get("content-type"), "application/json");
    assert.equal(request.init.body, "{\"name\":\"demo\",\"active\":true}");
  });

  it("builds form encoded requests with header auth", () => {
    const request = buildConnectorRuntimeFetchRequest({
      baseUrl: "https://api.example.invalid/",
      secrets: { apiKey: "secret" },
      plan: {
        method: "POST",
        endpoint: "/search",
        auth: [{ type: "secret", field: "apiKey", placement: "header", name: "x-api-key" }],
        bodyEncoding: "form",
        body: { q: "claw", page: 2 },
      },
    });

    assert.equal(request.url, "https://api.example.invalid/search");
    assert.equal(new Headers(request.init.headers).get("x-api-key"), "secret");
    assert.equal(new Headers(request.init.headers).get("content-type"), "application/x-www-form-urlencoded");
    assert.equal(request.init.body, "q=claw&page=2");
  });

  it("executes plans through an injected fetch and parses JSON", async () => {
    const calls: { input: string | URL | Request; init?: RequestInit }[] = [];
    const response = await executeConnectorRuntimeRequestPlan({
      baseUrl: "https://api.example.invalid/",
      secrets: {},
      plan: {
        method: "GET",
        endpoint: "items",
        auth: [],
        query: { limit: 1 },
        body: {},
      },
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return new Response("{\"ok\":true}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(String(calls[0]?.input), "https://api.example.invalid/items?limit=1");
    assert.deepEqual(response.body, { ok: true });
  });

  it("raises structured errors for non-2xx responses", async () => {
    await assert.rejects(
      () => executeConnectorRuntimeRequestPlan({
        baseUrl: "https://api.example.invalid/",
        secrets: {},
        plan: {
          method: "GET",
          endpoint: "items",
          auth: [],
          body: {},
        },
        fetchImpl: async () => new Response("rate limited", { status: 429, statusText: "Too Many Requests" }),
      }),
      (error) => {
        assert.ok(error instanceof ConnectorRuntimeHttpError);
        assert.equal(error.response.status, 429);
        assert.equal(error.response.body, "rate limited");
        return true;
      },
    );
  });
});
