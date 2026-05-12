import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildConnectorRuntimeFetchRequest,
  ConnectorRuntimeHttpError,
  executeConnectorRuntimePaginatedRequestPlan,
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

  it("rejects successful responses that fail the response schema", async () => {
    await assert.rejects(
      () => executeConnectorRuntimeRequestPlan({
        baseUrl: "https://api.example.invalid/",
        secrets: {},
        plan: {
          method: "GET",
          endpoint: "items",
          auth: [],
          body: {},
          responseSchema: {
            type: "object",
            requiredPaths: ["id"],
          },
        },
        fetchImpl: async () => Response.json({ ok: true }),
      }),
      (error) => {
        assert.ok(error instanceof ConnectorRuntimeHttpError);
        assert.match(error.message, /output missing required path id/);
        return true;
      },
    );
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

  it("retries retryable responses with retry-after delays", async () => {
    const delays: number[] = [];
    let calls = 0;
    const response = await executeConnectorRuntimeRequestPlan({
      baseUrl: "https://api.example.invalid/",
      secrets: {},
      maxRetries: 2,
      sleep: async (ms) => {
        delays.push(ms);
      },
      plan: {
        method: "GET",
        endpoint: "items",
        auth: [],
        body: {},
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("{\"error\":\"slow down\"}", {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": "2",
            },
          });
        }
        return Response.json({ ok: true });
      },
    });

    assert.equal(calls, 2);
    assert.deepEqual(delays, [2_000]);
    assert.deepEqual(response.body, { ok: true });
  });

  it("does not retry non-retryable client errors", async () => {
    let calls = 0;
    await assert.rejects(
      () => executeConnectorRuntimeRequestPlan({
        baseUrl: "https://api.example.invalid/",
        secrets: {},
        maxRetries: 3,
        retryDelayMs: 1,
        sleep: async () => {
          throw new Error("sleep should not run");
        },
        plan: {
          method: "GET",
          endpoint: "items",
          auth: [],
          body: {},
        },
        fetchImpl: async () => {
          calls += 1;
          return Response.json({ error: "bad input" }, { status: 400 });
        },
      }),
      ConnectorRuntimeHttpError,
    );
    assert.equal(calls, 1);
  });

  it("follows cursor pagination and aggregates items", async () => {
    const urls: string[] = [];
    const result = await executeConnectorRuntimePaginatedRequestPlan({
      baseUrl: "https://api.example.invalid/",
      secrets: {},
      plan: {
        method: "GET",
        endpoint: "items",
        auth: [],
        query: { limit: 2 },
        body: {},
        pagination: {
          mode: "cursor",
          cursorParam: "cursor",
          nextCursorPath: "paging.next",
          itemsPath: "data",
          maxPages: 3,
        },
      },
      fetchImpl: async (input) => {
        urls.push(String(input));
        const cursor = new URL(String(input)).searchParams.get("cursor");
        const body = cursor
          ? { data: [{ id: "c" }], paging: {} }
          : { data: [{ id: "a" }, { id: "b" }], paging: { next: "page_2" } };
        return Response.json(body);
      },
    });

    assert.deepEqual(urls, [
      "https://api.example.invalid/items?limit=2",
      "https://api.example.invalid/items?limit=2&cursor=page_2",
    ]);
    assert.deepEqual(result.items, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("follows offset pagination until a short page", async () => {
    const urls: string[] = [];
    const result = await executeConnectorRuntimePaginatedRequestPlan({
      baseUrl: "https://api.example.invalid/",
      secrets: {},
      plan: {
        method: "GET",
        endpoint: "items",
        auth: [],
        query: { limit: 2 },
        body: {},
        pagination: {
          mode: "offset",
          offsetParam: "offset",
          limitParam: "limit",
          itemsPath: "items",
        },
      },
      fetchImpl: async (input) => {
        urls.push(String(input));
        const offset = Number(new URL(String(input)).searchParams.get("offset") ?? "0");
        const items = offset < 2 ? [{ id: "a" }, { id: "b" }] : [{ id: "c" }];
        return Response.json({ items });
      },
    });

    assert.deepEqual(urls, [
      "https://api.example.invalid/items?limit=2&offset=0",
      "https://api.example.invalid/items?limit=2&offset=2",
    ]);
    assert.deepEqual(result.items, [{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("follows next URL pagination without replaying original query params", async () => {
    const urls: string[] = [];
    const result = await executeConnectorRuntimePaginatedRequestPlan({
      baseUrl: "https://api.example.invalid/",
      secrets: { apiKey: "secret" },
      plan: {
        method: "GET",
        endpoint: "items",
        auth: [{ type: "secret", field: "apiKey", placement: "header", name: "x-api-key" }],
        query: { limit: 1 },
        body: {},
        pagination: {
          mode: "next_url",
          nextUrlPath: "links.next",
          itemsPath: "items",
        },
      },
      fetchImpl: async (input, init) => {
        urls.push(String(input));
        assert.equal(new Headers(init?.headers).get("x-api-key"), "secret");
        const first = urls.length === 1;
        return Response.json(first
          ? { items: [{ id: "a" }], links: { next: "https://api.example.invalid/items?page=2" } }
          : { items: [{ id: "b" }], links: {} });
      },
    });

    assert.deepEqual(urls, [
      "https://api.example.invalid/items?limit=1",
      "https://api.example.invalid/items?page=2",
    ]);
    assert.deepEqual(result.items, [{ id: "a" }, { id: "b" }]);
  });
});
